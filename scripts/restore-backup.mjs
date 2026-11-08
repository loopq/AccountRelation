// Restore only to a new local file; never overwrite a production database.
import { readFileSync,writeFileSync,unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createDecipheriv } from 'node:crypto';
import Database from 'better-sqlite3';
process.umask(0o077);
const [source,destination]=process.argv.slice(2);
if(!source || !destination)throw new Error('Usage: node scripts/restore-backup.mjs encrypted-file new-destination');
const packed=readFileSync(source),key=readFileSync(join(homedir(),'.config/account-relation/backup.key'));
if(packed.subarray(0,8).toString()!=='AGBACK01')throw new Error('Unknown backup format');
const decipher=createDecipheriv('aes-256-gcm',key,packed.subarray(8,20));
decipher.setAuthTag(packed.subarray(-16));
const data=Buffer.concat([decipher.update(packed.subarray(20,-16)),decipher.final()]);
writeFileSync(destination,data,{flag:'wx',mode:0o600});
const db=new Database(destination,{readonly:true,fileMustExist:true});
try{
 if(db.pragma('integrity_check',{simple:true})!=='ok' || db.pragma('foreign_key_check').length)throw new Error('Restored database integrity failed');
 console.log('Restored database verified. Schema:',db.pragma('user_version',{simple:true}));
}catch(error){db.close();unlinkSync(destination);throw error;}
db.close();
