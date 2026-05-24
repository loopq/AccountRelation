// 用 Node WebCrypto 按 spec §2 参数生成互通向量矩阵。
// 固定测试密码 + 固定 salt（非真实凭据），为每条明文产出 v2:iv:ct。
import { webcrypto as wc } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';

const ITER = 600000;
const PASSWORD = 'golden-test-password-不是主密码';
const SALT_B64 = 'EjRWeBI0VngSNFZ4EjRWeA=='; // 固定 16 字节
const CANARY = 'account-graph-canary-v1';

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const enc = new TextEncoder();

async function deriveKey(password, salt) {
  const km = await wc.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return wc.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function encryptWith(key, plaintext) {
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return `v2:${b64(iv)}:${b64(ct)}`;
}

const PLAINTEXTS = [
  'hunter2',                 // ASCII
  '',                        // 空串
  '1234567890',              // 纯数字
  '密码测试中文',             // 中文
  '🔐🗝️🛡️',                 // emoji
  'é',                 // 组合字符（é = e + U+0301）
  'x'.repeat(5000),          // 超长（≥4KB）
];

const key = await deriveKey(PASSWORD, unb64(SALT_B64));
const vectors = [];
for (const pt of PLAINTEXTS) vectors.push({ plaintext: pt, packed: await encryptWith(key, pt) });
const canaryPacked = await encryptWith(key, CANARY);

mkdirSync('test/fixtures', { recursive: true });
writeFileSync('test/fixtures/golden_vectors.json', JSON.stringify(
  { password: PASSWORD, saltB64: SALT_B64, iterations: ITER, canaryPlain: CANARY, canaryPacked, vectors },
  null, 2));
console.log(`生成 ${vectors.length} 条向量 → test/fixtures/golden_vectors.json`);

// 用法: node tool/gen_golden_vector.mjs verify
if (process.argv[2] === 'verify') {
  const { readFileSync } = await import('node:fs');
  const items = JSON.parse(readFileSync('test/fixtures/dart_encrypted.json', 'utf8'));
  async function decryptWith(key, packed) {
    const [ver, ivB, ctB] = packed.split(':');
    if (ver !== 'v2') throw new Error('ver ' + ver);
    const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB) }, key, unb64(ctB));
    return new TextDecoder().decode(pt);
  }
  const vkey = await deriveKey(PASSWORD, unb64(SALT_B64));
  for (const it of items) {
    const got = await decryptWith(vkey, it.packed);
    if (got !== it.plaintext) { console.error(`FAIL: ${JSON.stringify(it.plaintext)} != ${JSON.stringify(got)}`); process.exit(1); }
  }
  console.log(`Dart→Web 反向校验通过：${items.length} 条`);
}
