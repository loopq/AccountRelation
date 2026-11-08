const encoder = new TextEncoder(), decoder = new TextDecoder();
export const CANARY_PLAIN = 'account-graph-canary-v1';
export const b64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));
export const unb64 = value => Uint8Array.from(atob(value),c => c.charCodeAt(0));
export async function deriveKey(password,salt) {
  const material = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2',salt,iterations:600000,hash:'SHA-256' },material,
    { name:'AES-GCM',length:256 },false,['encrypt','decrypt']);
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
