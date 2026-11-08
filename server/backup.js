import Database from 'better-sqlite3';
import { chmodSync, existsSync } from 'node:fs';
process.umask(0o077);
const source = process.env.DATABASE_PATH || './data/account.db';
const destination = process.argv[2];
if (!destination || existsSync(destination)) throw new Error('Provide a new backup destination');
const db = new Database(source,{ fileMustExist:true });
try {
  await db.backup(destination);
  chmodSync(destination,0o600);
  const copy = new Database(destination,{ readonly:true,fileMustExist:true });
  try {
    if (copy.pragma('integrity_check',{ simple:true }) !== 'ok' || copy.pragma('foreign_key_check').length) throw new Error('Backup integrity check failed');
  } finally { copy.close(); }
  console.log('Consistent SQLite backup verified.');
} finally { db.close(); }
