import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { HttpError } from './validation.js';

const accountColumns = ['category', 'platform_id', 'name', 'encrypted_password', 'encrypted_2fa',
  'phone', 'twofa_enabled', 'passkey_enabled', 'country_id', 'register_email_id', 'subscribe_apple_id', 'note', 'recovery_email',
  'claude_status', 'claude_registered_at', 'claude_active_at', 'claude_banned_at'];
const PASSWORD_HISTORY_LIMIT = 50;
const now = () => new Date().toISOString();

export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new Database(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = FULL');
  const version = db.pragma('user_version', { simple: true });
  if (version > 6) throw new Error('Database schema is newer than this server');
  if (version === 0) db.transaction(() => {
    db.exec(`
      CREATE TABLE platforms (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('email','apple','ai')),
        name TEXT NOT NULL, color TEXT, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE countries (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('email','apple','ai')),
        platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE RESTRICT, name TEXT NOT NULL,
        encrypted_password TEXT, encrypted_2fa TEXT, phone TEXT, twofa_enabled INTEGER NOT NULL DEFAULT 0 CHECK(twofa_enabled IN (0,1)),
        country_id TEXT REFERENCES countries(id) ON DELETE RESTRICT,
        register_email_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        subscribe_apple_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        note TEXT, recovery_email TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX accounts_register_email ON accounts(register_email_id);
      CREATE INDEX accounts_subscribe_apple ON accounts(subscribe_apple_id);
      CREATE TABLE vault_meta (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, canary TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE data_version (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
      INSERT INTO data_version VALUES (1,0);
      CREATE TABLE admins (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX sessions_expiry ON sessions(expires_at);
      PRAGMA user_version=1;
    `);
    const insertPlatform = db.prepare('INSERT INTO platforms VALUES (?, ?, ?, ?, ?, ?)');
    [['email','Gmail','#5b8fb0'],['apple','Apple ID','#d4a857'],['ai','OpenAI','#9b7fc4'],['ai','Claude','#9b7fc4']]
      .forEach(([cat,name,color],i) => insertPlatform.run(randomUUID(),cat,name,color,i+1,now()));
    const insertCountry = db.prepare('INSERT INTO countries VALUES (?, ?, ?, ?, ?)');
    [['美区','#5b8fb0'],['中国大陆','#c2554d'],['尼日利亚','#6fae6a'],['土耳其','#d4a857']]
      .forEach(([name,color],i) => insertCountry.run(randomUUID(),name,color,i+1,now()));
  })();
  if (version < 2) db.transaction(() => {
    db.exec(`
      CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE account_devices (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        device_id  TEXT NOT NULL REFERENCES devices(id)  ON DELETE RESTRICT,
        PRIMARY KEY (account_id, device_id));
      CREATE INDEX account_devices_device ON account_devices(device_id);
      PRAGMA user_version=2;
    `);
  })();
  // wrapped_key = 用该 passkey 的 PRF 输出加密的保险库 key；服务端没有 PRF 输出，解不开
  if (version < 3) db.transaction(() => {
    db.exec(`
      CREATE TABLE passkeys (credential_id TEXT PRIMARY KEY, public_key TEXT NOT NULL,
        sign_count INTEGER NOT NULL, wrapped_key TEXT NOT NULL, label TEXT NOT NULL,
        created_at TEXT NOT NULL, last_used_at TEXT);
      PRAGMA user_version=3;
    `);
  })();
  if (version < 4) db.transaction(() => {
    db.exec(`
      ALTER TABLE accounts ADD COLUMN passkey_enabled INTEGER NOT NULL DEFAULT 0 CHECK(passkey_enabled IN (0,1));
      PRAGMA user_version=4;
    `);
  })();
  if (version < 5) db.transaction(() => {
    db.exec(`
      ALTER TABLE accounts ADD COLUMN claude_status TEXT CHECK(claude_status IN ('fresh','registered','active','banned'));
      ALTER TABLE accounts ADD COLUMN claude_registered_at TEXT;
      ALTER TABLE accounts ADD COLUMN claude_active_at TEXT;
      ALTER TABLE accounts ADD COLUMN claude_banned_at TEXT;
      PRAGMA user_version=5;
    `);
  })();
  if (version < 6) db.transaction(() => {
    db.exec(`
      CREATE TABLE password_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        password TEXT NOT NULL,
        copied_at INTEGER NOT NULL
      );
      CREATE INDEX password_history_copied_at ON password_history(copied_at DESC, id DESC);
      PRAGMA user_version=6;
    `);
  })();

  const revision = () => db.prepare('SELECT revision FROM data_version WHERE id=1').get().revision;
  const meta = () => db.prepare('SELECT salt,canary,created_at FROM vault_meta WHERE id=1').get() || null;
  const snapshot = db.transaction(() => {
    const links = Map.groupBy(db.prepare('SELECT account_id,device_id FROM account_devices ORDER BY device_id').all(), r => r.account_id);
    return {
      revision: revision(), vault: meta(),
      accounts: db.prepare('SELECT * FROM accounts ORDER BY created_at,id').all().map(a => ({
        ...a, twofa_enabled: !!a.twofa_enabled, passkey_enabled: !!a.passkey_enabled,
        device_ids: (links.get(a.id) || []).map(r => r.device_id),
      })),
      platforms: db.prepare('SELECT * FROM platforms ORDER BY sort,id').all(),
      countries: db.prepare('SELECT * FROM countries ORDER BY sort,id').all(),
      devices: db.prepare('SELECT * FROM devices ORDER BY sort,id').all(),
    };
  });
  function mutate(expected, fn, initializing = false) {
    return db.transaction(() => {
      const vault = meta();
      if (expected.expectedRevision !== revision() || expected.expectedSalt !== (vault?.salt ?? null)) {
        throw new HttpError(409, '数据已被其他操作修改，请重新解锁后重试');
      }
      if (!initializing && !vault) throw new HttpError(409, '请先初始化保险库');
      const result = fn();
      db.prepare('UPDATE data_version SET revision=revision+1 WHERE id=1').run();
      return { revision: revision(), result: result ?? null };
    }).immediate();
  }
  function validateRelations(row, id) {
    const platform = db.prepare('SELECT category FROM platforms WHERE id=?').get(row.platform_id);
    if (!platform || platform.category !== row.category) throw new HttpError(400, '平台与账号分类不一致');
    if (row.country_id && !db.prepare('SELECT id FROM countries WHERE id=?').get(row.country_id)) throw new HttpError(400, '国家/地区不存在');
    for (const [field, targetCategory, allowed] of [
      ['register_email_id','email',['apple','ai']], ['subscribe_apple_id','apple',['ai']],
    ]) {
      if (!row[field]) continue;
      const target = db.prepare('SELECT category FROM accounts WHERE id=?').get(row[field]);
      if (row[field] === id || !allowed.includes(row.category) || target?.category !== targetCategory) {
        throw new HttpError(400, '关联账号类型不正确');
      }
    }
    if (id && ((row.category !== 'email' && db.prepare('SELECT id FROM accounts WHERE register_email_id=? LIMIT 1').get(id))
      || (row.category !== 'apple' && db.prepare('SELECT id FROM accounts WHERE subscribe_apple_id=? LIMIT 1').get(id)))) {
      throw new HttpError(409, '账号仍被关联，不能更改分类');
    }
  }
  function saveAccount(data, id) {
    const previous = id ? db.prepare('SELECT * FROM accounts WHERE id=?').get(id) : null;
    if (id && !previous) throw new HttpError(404, '账号不存在');
    const { device_ids, ...accountData } = data;
    const row = { ...previous, ...accountData };
    validateRelations(row, id);
    if (row.category !== 'email') {
      if (accountData.passkey_enabled) throw new HttpError(400, '只有 Email 账号可以设置通行密钥');
      row.passkey_enabled = false;
    }
    const claudeDates = ['claude_registered_at', 'claude_active_at', 'claude_banned_at'];
    if (row.category !== 'email') {
      if (accountData.claude_status || claudeDates.some(k => accountData[k])) throw new HttpError(400, '只有 Email 账号可以记录 Claude 情况');
      row.claude_status = null;
    }
    if (!['registered', 'active', 'banned'].includes(row.claude_status)) {
      if (claudeDates.some(k => accountData[k])) throw new HttpError(400, '白号或未标记的账号不能填写 Claude 日期');
      for (const k of claudeDates) row[k] = null;
    }
    const values = accountColumns.map(k => ['twofa_enabled', 'passkey_enabled'].includes(k) ? Number(!!row[k]) : row[k] ?? null);
    const timestamp = now();
    if (id) db.prepare(`UPDATE accounts SET ${accountColumns.map(k => `${k}=?`).join(',')},updated_at=? WHERE id=?`).run(...values,timestamp,id);
    else {
      id = randomUUID();
      db.prepare(`INSERT INTO accounts (id,${accountColumns.join(',')},created_at,updated_at) VALUES (${Array(values.length+3).fill('?').join(',')})`).run(id,...values,timestamp,timestamp);
    }
    if (row.category !== 'email') {
      db.prepare('DELETE FROM account_devices WHERE account_id=?').run(id);
      if (device_ids?.length > 0) throw new HttpError(400, '只有 Email 账号可以记录登录设备');
    } else if (device_ids !== undefined) {
      const unique = [...new Set(device_ids)];
      const checkDevice = db.prepare('SELECT 1 FROM devices WHERE id=?');
      for (const did of unique) {
        if (!checkDevice.get(did)) throw new HttpError(400, '设备不存在');
      }
      db.prepare('DELETE FROM account_devices WHERE account_id=?').run(id);
      const insert = db.prepare('INSERT INTO account_devices (account_id, device_id) VALUES (?, ?)');
      for (const did of unique) insert.run(id, did);
    }
    return { id };
  }
  function deleteAccount(id) {
    if (!db.prepare('DELETE FROM accounts WHERE id=?').run(id).changes) throw new HttpError(404, '账号不存在');
  }
  function saveLookup(table, data) {
    if (!['platforms','countries','devices'].includes(table)) throw new Error('Invalid lookup table');
    const id = randomUUID();
    if (table === 'platforms') db.prepare('INSERT INTO platforms VALUES (?,?,?,?,?,?)').run(id,data.category,data.name,data.color ?? null,data.sort ?? 0,now());
    else if (table === 'countries') db.prepare('INSERT INTO countries VALUES (?,?,?,?,?)').run(id,data.name,data.color,data.sort ?? 0,now());
    else db.prepare('INSERT INTO devices VALUES (?,?,?,?)').run(id,data.name,data.sort ?? 0,now());
    return { id };
  }
  function deleteLookup(table, id) {
    const refs = { platforms: ['accounts','platform_id'], countries: ['accounts','country_id'], devices: ['account_devices','device_id'] };
    const ref = refs[table];
    if (!ref) throw new Error('Invalid lookup table');
    const [refTable, refCol] = ref;
    if (db.prepare(`SELECT 1 FROM ${refTable} WHERE ${refCol}=? LIMIT 1`).get(id)) throw new HttpError(409, '仍有账号使用此项');
    if (!db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes) throw new HttpError(404, '条目不存在');
  }
  function initVault(data) {
    if (meta()) throw new HttpError(409, '保险库已初始化');
    db.prepare('INSERT INTO vault_meta VALUES (1,?,?,?)').run(data.salt,data.canary,now());
  }
  function rotate(data) {
    const rows = db.prepare('SELECT id,encrypted_password,encrypted_2fa FROM accounts WHERE encrypted_password IS NOT NULL OR encrypted_2fa IS NOT NULL').all();
    const updates = new Map(data.updates.map(u => [u.id,u]));
    if (updates.size !== data.updates.length || updates.size !== rows.length) throw new HttpError(409, '轮换账号集合不完整');
    for (const row of rows) {
      const update = updates.get(row.id);
      if (!update || !!update.ct !== !!row.encrypted_password || !!update.fa !== !!row.encrypted_2fa) throw new HttpError(409, '轮换密文字段不完整');
    }
    const statement = db.prepare('UPDATE accounts SET encrypted_password=?,encrypted_2fa=?,updated_at=? WHERE id=?');
    for (const row of rows) {
      const update = updates.get(row.id);
      statement.run(update.ct ?? null,update.fa ?? null,now(),row.id);
    }
    db.prepare('UPDATE vault_meta SET salt=?,canary=? WHERE id=1').run(data.salt,data.canary);
    // 旧 passkey 包的是旧 key，同一事务里作废，不留「包裹过期」的中间态
    db.prepare('DELETE FROM passkeys').run();
  }
  function listPasswordHistory() {
    return db.prepare(
      'SELECT id,password,copied_at FROM password_history ORDER BY copied_at DESC,id DESC LIMIT ?'
    ).all(PASSWORD_HISTORY_LIMIT);
  }
  function addPasswordHistory(password, copiedAt = Date.now()) {
    return db.transaction(() => {
      db.prepare('DELETE FROM password_history WHERE password=?').run(password);
      db.prepare('INSERT INTO password_history (password,copied_at) VALUES (?,?)').run(password, copiedAt);
      db.prepare(
        'DELETE FROM password_history WHERE id NOT IN (SELECT id FROM password_history ORDER BY copied_at DESC,id DESC LIMIT ?)'
      ).run(PASSWORD_HISTORY_LIMIT);
      return listPasswordHistory();
    }).immediate();
  }
  function clearPasswordHistory() {
    db.prepare('DELETE FROM password_history').run();
    return [];
  }
  return { db, snapshot, mutate, saveAccount, deleteAccount, saveLookup, deleteLookup, initVault, rotate, listPasswordHistory, addPasswordHistory, clearPasswordHistory };
}
