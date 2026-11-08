import { randomBytes,createCipheriv } from 'node:crypto';
import { mkdirSync,readFileSync,writeFileSync,createWriteStream,renameSync,unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
process.umask(0o077);
const config=join(homedir(),'.config/account-relation');
const directory=join(homedir(),'Backups/account-relation');
mkdirSync(config,{recursive:true,mode:0o700});mkdirSync(directory,{recursive:true,mode:0o700});
const keyPath=join(config,'backup.key');
try {writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
const key=readFileSync(keyPath);if(key.length!==32)throw new Error('Invalid backup key');
const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const basename=new Date().toISOString().replaceAll(':','-')+'.sqlite.aesgcm';
const finalPath=join(directory,basename),pending=finalPath+'.partial';
const output=createWriteStream(pending,{flags:'wx',mode:0o600});
output.write(Buffer.concat([Buffer.from('AGBACK01'),iv]));
const child=spawn('ssh',['-T','-o','BatchMode=yes','-o','ControlMaster=no','-o','ControlPath=none','-o','ConnectTimeout=12',
  '-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','tencent-seoul-admin','sudo /usr/local/libexec/account-relation-backup stream'],{stdio:['ignore','pipe','inherit']});
const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Remote backup failed')));});
try {
  await Promise.all([pipeline(child.stdout,cipher,output,{end:false}),exited]);
  await new Promise((resolve,reject)=>{output.once('error',reject);output.end(cipher.getAuthTag(),resolve);});
  renameSync(pending,finalPath);
  console.log('Encrypted offsite backup saved:',basename);
}catch(error){child.kill();output.destroy();try{unlinkSync(pending);}catch{}throw error;}
