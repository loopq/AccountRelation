import { readFileSync } from 'node:fs';
import { openStore } from './store.js';
import { setAdmin } from './auth.js';
import { parse, login } from './validation.js';
process.umask(0o077);
// JSON is read from stdin, never from command-line arguments or logs.
const data = parse(login,JSON.parse(readFileSync(0,'utf8')));
const store = openStore(process.env.DATABASE_PATH || './data/account.db');
try {
  await setAdmin(store.db,data.email,data.password,process.argv.includes('--reset'));
  console.log('Administrator saved; all sessions revoked.');
} finally { store.db.close(); }
