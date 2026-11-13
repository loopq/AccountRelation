import { generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { z } from 'zod';
import { HttpError, cipher, parse, salt } from './validation.js';

const CHALLENGE_MS = 5 * 60 * 1000;
// 粗糙上限：进程内 Map，单实例够用；多实例或要扛刷接口时改成 SQLite 表 + 按 IP 限流
const MAX_CHALLENGES = 100;
// 单管理员：固定 user handle，同一钥匙串里重新开启会覆盖旧 passkey 而不是越积越多
const USER_ID = new TextEncoder().encode('account-relation-admin');
// 常见通行密钥提供方的 AAGUID：标在设备名后面，同一台手机存了两份时能分清删哪个。查不到就不标
const PROVIDERS = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud 钥匙串', 'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'iCloud 钥匙串',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password', 'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google 密码管理器',
};

const b64url = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/);
const credentialJSON = z.looseObject({ id: b64url, rawId: b64url, type: z.literal('public-key') });
const registerBody = z.strictObject({ response: credentialJSON, wrappedKey: cipher, label: z.string().trim().min(1).max(60), expectedSalt: salt });
const loginBody = z.strictObject({ response: credentialJSON });

export function createPasskeys(db, { origin, auth }) {
  const rpID = new URL(origin).hostname;
  const challenges = new Map();
  function remember(kind, challenge) {
    const time = Date.now();
    for (const [key, entry] of challenges) if (entry.until <= time) challenges.delete(key);
    while (challenges.size >= MAX_CHALLENGES) challenges.delete(challenges.keys().next().value);
    challenges.set(challenge, { kind, until: time + CHALLENGE_MS });
  }
  /** 单次消费：无论后续验签成败都作废 */
  function consume(kind) {
    return challenge => {
      const entry = challenges.get(challenge);
      challenges.delete(challenge);
      return entry?.kind === kind && entry.until > Date.now();
    };
  }
  const expected = { expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true };

  async function registerOptions() {
    const admin = db.prepare('SELECT email FROM admins WHERE id=1').get();
    const options = await generateRegistrationOptions({
      rpName: '账号图谱', rpID, userID: USER_ID, userName: admin?.email || 'admin', userDisplayName: '账号图谱',
      attestationType: 'none', timeout: CHALLENGE_MS,
      excludeCredentials: db.prepare('SELECT credential_id FROM passkeys').all().map(r => ({ id: r.credential_id })),
      // 只要本机 Face ID / Touch ID：扫码跨设备时 PRF 输出与本机不一致，解不开保险库
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
    });
    remember('register', options.challenge);
    return options;
  }
  async function register(body) {
    const data = parse(registerBody, body);
    let info;
    try {
      const result = await verifyRegistrationResponse({ response: data.response, expectedChallenge: consume('register'), ...expected });
      info = result.verified && result.registrationInfo;
    } catch { info = null; }
    if (!info) throw new HttpError(400, 'Face ID 登记校验失败，请重试');
    const { credential } = info;
    const label = PROVIDERS[info.aaguid] ? `${data.label} · ${PROVIDERS[info.aaguid]}` : data.label;
    db.transaction(() => {
      // wrappedKey 包的是客户端当时的保险库 key；期间主密码被改过就作废
      const vault = db.prepare('SELECT salt FROM vault_meta WHERE id=1').get();
      if (vault?.salt !== data.expectedSalt) throw new HttpError(409, '主密码已变更，请重新开启');
      if (db.prepare('SELECT 1 FROM passkeys WHERE credential_id=?').get(credential.id)) throw new HttpError(409, '这个 Face ID 已经开启过');
      db.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?,NULL)').run(credential.id,
        Buffer.from(credential.publicKey).toString('base64url'), credential.counter, data.wrappedKey, label, new Date().toISOString());
    }).immediate();
    return { ok: true };
  }
  async function loginOptions() {
    const ids = db.prepare('SELECT credential_id FROM passkeys').all();
    if (!ids.length) return { enabled: false };
    // 显式列出凭据：iOS 上存在 1Password 等第三方提供方的 passkey，走可发现凭据（空列表）时系统可能找不到，
    // 直接报 NotAllowedError（2026-11-13 真机实测）。credential id 不是秘密，单管理员站点暴露它没有隐私代价
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: CHALLENGE_MS,
      allowCredentials: ids.map(r => ({ id: r.credential_id })) });
    remember('login', options.challenge);
    return { enabled: true, options };
  }
  async function login(req, res, body) {
    const passed = auth.throttle(req, res);
    const { response } = parse(loginBody, body);
    const row = db.prepare('SELECT credential_id,public_key,sign_count FROM passkeys WHERE credential_id=?').get(response.id);
    if (!row) throw new HttpError(401, '这个 Face ID 未开启或已被撤销，请用密码登录');
    let info;
    try {
      const result = await verifyAuthenticationResponse({ response, expectedChallenge: consume('login'), ...expected,
        credential: { id: row.credential_id, publicKey: Buffer.from(row.public_key, 'base64url'), counter: row.sign_count } });
      info = result.verified && result.authenticationInfo;
    } catch { info = null; }
    if (!info) throw new HttpError(401, 'Face ID 校验失败，请重试或用密码登录');
    passed();
    let wrappedKey;
    const session = auth.issue(req, res, () => {
      wrappedKey = db.prepare('UPDATE passkeys SET sign_count=?,last_used_at=? WHERE credential_id=? RETURNING wrapped_key')
        .get(info.newCounter, new Date().toISOString(), row.credential_id)?.wrapped_key;
      if (!wrappedKey) throw new HttpError(401, '这个 Face ID 已被撤销，请用密码登录');
    });
    return { ...session, wrappedKey };
  }
  const list = () => db.prepare('SELECT credential_id AS id,label,created_at,last_used_at FROM passkeys ORDER BY created_at').all();
  function remove(id) {
    if (!db.prepare('DELETE FROM passkeys WHERE credential_id=?').run(parse(b64url, id)).changes) throw new HttpError(404, '条目不存在');
    return { ok: true };
  }
  return { registerOptions, register, loginOptions, login, list, remove };
}
