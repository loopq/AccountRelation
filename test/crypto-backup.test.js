import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openStore } from '../server/store.js';
import { deriveKey,encryptWith,decryptWith,b64,unb64,CANARY_PLAIN } from '../web/crypto.js';

test('non-exportable keys, random IVs, authentication and online WAL backup restore',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'account-backup-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'source.db'),backup=join(dir,'backup.db');
  const store=openStore(source);t.after(()=>store.db.close());
  const salt=b64(randomBytes(16)),key=await deriveKey('fake-backup-master-password',unb64(salt));
  assert.equal(key.extractable,false);await assert.rejects(crypto.subtle.exportKey('raw',key));
  const ct=await encryptWith(key,'fake secret');assert.notEqual(ct,await encryptWith(key,'fake secret'));
  const wrong=await deriveKey('wrong-backup-master-password',unb64(salt));await assert.rejects(decryptWith(wrong,ct));
  store.mutate({expectedRevision:0,expectedSalt:null},()=>store.initVault({salt,canary:ct}),true);
  const state=store.snapshot(),platform=state.platforms[0];
  store.mutate({expectedRevision:state.revision,expectedSalt:salt},()=>store.saveAccount({category:platform.category,platform_id:platform.id,name:'fake backup',encrypted_password:ct}));
  assert.equal(store.db.pragma('journal_mode',{simple:true}),'wal');
  const process=spawnSync(globalThis.process.execPath,['server/backup.js',backup],{env:{...globalThis.process.env,DATABASE_PATH:source},encoding:'utf8'});
  assert.equal(process.status,0,process.stderr);
  const restored=openStore(backup);
  try {
    assert.deepEqual(restored.snapshot(),store.snapshot());
    assert.equal(restored.db.pragma('integrity_check',{simple:true}),'ok');
    assert.deepEqual(restored.db.pragma('foreign_key_check'),[]);
    assert.equal(await decryptWith(key,restored.snapshot().accounts[0].encrypted_password),'fake secret');
  } finally {restored.db.close();}
});
