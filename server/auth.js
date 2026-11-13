import argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './validation.js';

const options = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
export const hashPassword = (password) => argon2.hash(password, options);
const hash = (token) => createHash('sha256').update(token).digest('hex');
const random = () => randomBytes(32).toString('base64url');
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left=Buffer.from(a), right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
export async function setAdmin(db, email, password, reset = false) {
  if (password.length < 14 || password.length > 1024) throw new Error('管理员密码长度必须为 14–1024 字符');
  const passwordHash = await hashPassword(password);
  db.transaction(() => {
    const exists = !!db.prepare('SELECT id FROM admins WHERE id=1').get();
    if (exists && !reset) throw new Error('管理员已存在；重置须显式使用 --reset');
    if (!exists && reset) throw new Error('管理员尚未创建');
    db.prepare('INSERT INTO admins VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash').run(email,passwordHash);
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM passkeys').run();
  })();
}
export async function createAuth(db, { production, sessionSeconds = 43200, loginLimit = 10 }) {
  const cookieName = production ? '__Host-account_session' : 'account_session';
  const fakeHash = await hashPassword(random());
  const attempts = new Map();
  let hashing = 0;
  function token(req) {
    const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    return /^[A-Za-z0-9_-]{43}$/.test(value || '') ? value : null;
  }
  function session(req) {
    const value = token(req);
    if (!value) return null;
    return db.prepare('SELECT token_hash,csrf,expires_at FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(value),Date.now()) || null;
  }
  function cookie(res, value, expires) {
    res.cookie(cookieName,value,{ httpOnly:true, secure:production, sameSite:'strict', path:'/', maxAge:expires });
  }
  function revoke(req,res,clearCookie=true) {
    const value = token(req);
    if (value) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(value));
    if (clearCookie) cookie(res,'',0);
  }
  /** 密码登录与 passkey 登录共用的限流：返回成功后调用的清零函数 */
  function throttle(req,res) {
    const time = Date.now();
    for (const [key,bucket] of attempts) if (bucket.until <= time) attempts.delete(key);
    const key = req.ip;
    const bucket = attempts.get(key) || { count:0, until:time+15*60*1000 };
    if (bucket.count >= loginLimit || hashing >= 2 || attempts.size >= 1000) {
      res.set('Retry-After','900');
      throw new HttpError(429,'登录尝试过多，请稍后重试');
    }
    bucket.count++;
    attempts.set(key,bucket);
    return () => attempts.delete(key);
  }
  /** 发新会话；guard 在同一事务里复核凭据仍然有效 */
  function issue(req,res,guard) {
    const time = Date.now(), value = random(), csrf = random(), expiresAt = time+sessionSeconds*1000;
    db.transaction(() => {
      guard();
      revoke(req,res,false);
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(time);
      db.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions ORDER BY expires_at DESC LIMIT -1 OFFSET 19)').run();
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(value),csrf,expiresAt);
    }).immediate();
    cookie(res,value,sessionSeconds*1000);
    return { authenticated:true, csrf, expiresAt };
  }
  async function login(req,res,data) {
    const passed = throttle(req,res);
    const admin = db.prepare('SELECT email,password_hash FROM admins WHERE id=1').get();
    hashing++;
    let valid;
    try { valid = await argon2.verify(admin?.password_hash || fakeHash,data.password); }
    finally { hashing--; }
    if (!valid || data.email !== admin?.email) throw new HttpError(401,'邮箱或密码错误');
    passed();
    return issue(req,res,() => {
      const current = db.prepare('SELECT email,password_hash FROM admins WHERE id=1').get();
      if (current?.password_hash !== admin.password_hash || current.email !== admin.email) throw new HttpError(401,'登录信息已变更，请重试');
    });
  }
  return { session, login, revoke, throttle, issue };
}
