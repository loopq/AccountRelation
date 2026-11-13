const encoder = new TextEncoder(), decoder = new TextDecoder();
export const CANARY_PLAIN = 'account-graph-canary-v1';
export const b64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));
export const unb64 = value => Uint8Array.from(atob(value),c => c.charCodeAt(0));
// deriveBits(256) + importKey 与直接 deriveKey(AES-GCM 256) 得到同一把 key，旧密文照常可解。
// 拆开是为了「开启 Face ID」时能拿到原始 32 字节去包裹；常驻内存的仍是不可导出 CryptoKey。
export async function deriveRaw(password,salt) {
  const material = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2',salt,iterations:600000,hash:'SHA-256' },material,256));
}
export const importVaultKey = raw => crypto.subtle.importKey('raw',raw,{ name:'AES-GCM' },false,['encrypt','decrypt']);
export async function deriveKey(password,salt) { return importVaultKey(await deriveRaw(password,salt)); }
/** passkey PRF 输出 → 包裹保险库 key 的 AES-GCM key */
export async function prfWrapKey(prf) {
  const material = await crypto.subtle.importKey('raw',prf,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({ name:'HKDF',hash:'SHA-256',salt:new Uint8Array(0),info:encoder.encode('account-relation/vault-wrap/v1') },
    material,{ name:'AES-GCM',length:256 },false,['encrypt','decrypt']);
}
export async function encryptWith(key,plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name:'AES-GCM',iv },key,encoder.encode(plaintext));
  return `v2:${b64(iv)}:${b64(ciphertext)}`;
}
export async function decryptWith(key,packed) {
  const [version,iv,ct,...rest] = packed.split(':');
  if (version !== 'v2' || rest.length) throw new Error('密文格式不正确');
  return decoder.decode(await crypto.subtle.decrypt({ name:'AES-GCM',iv:unb64(iv) },key,unb64(ct)));
}
