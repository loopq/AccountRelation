import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { setAdmin, equal } from '../server/auth.js';
import { deriveKey, encryptWith, decryptWith, b64, unb64, CANARY_PLAIN } from '../web/crypto.js';

const password='Test-admin-only-68754!';
const origin='http://account.test';
async function fixture(t,options={}) {
  const store=openStore(':memory:');
  await setAdmin(store.db,'admin@example.test',password);
  const app=await createApp(store,{ origin,...options });
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>{ server.closeAllConnections(); server.close(); store.db.close(); });
  let cookie='',csrf='';
  async function call(path,method='GET',body,headers={}) {
    return new Promise((resolve,reject)=>{
      const request=httpRequest(`http://127.0.0.1:${server.address().port}${path}`,{
        method,headers:{Host:'account.test',Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,
          ...(body!==undefined ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify(body))} : {}),...headers}
      },response=>{
        let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>{
          let data;try{data=JSON.parse(text);}catch{data=text;}
          resolve({status:response.statusCode,data,headers:new Headers(response.headers)});
        });
      });
      request.on('error',reject);request.end(body===undefined ? undefined : JSON.stringify(body));
    });
  }
  async function login() {
    const result=await call('/api/login','POST',{email:'admin@example.test',password});
    assert.equal(result.status,200); cookie=result.headers.get('set-cookie').split(';')[0];csrf=result.data.csrf;
    return result;
  }
  async function change(path,method,data,expected) {
    const snapshot=expected || store.snapshot();
    return call(path,method,{expectedRevision:snapshot.revision,expectedSalt:snapshot.vault?.salt ?? null,data});
  }
  async function initialize() {
    const salt=b64(randomBytes(16)),key=await deriveKey('Test-vault-old-password',unb64(salt));
    assert.equal((await change('/api/vault/init','POST',{salt,canary:await encryptWith(key,CANARY_PLAIN)})).status,200);
    return {key,salt};
  }
  return {store,call,login,change,initialize};
}

test('authentication, CSRF, cookies, validation, host and static boundaries',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call('/api/state')).status,401);
  assert.equal((await f.call('/api/accounts','POST',{})).status,401);
  assert.equal((await f.call('/api/session')).data.authenticated,false);
  assert.equal((await f.call('/api/login','POST',{email:'admin@example.test',password},{Origin:'https://evil.test'})).status,403);
  assert.equal((await f.call('/api/login','POST',{email:'admin@example.test',password:'wrong'})).status,401);
  const login=await f.login();
  assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await f.call('/api/state')).headers.get('cache-control'),'no-store');
  const oldCookie=login.headers.get('set-cookie').split(';')[0];await f.login();
  assert.equal((await f.call('/api/state','GET',undefined,{Cookie:oldCookie})).status,401);
  assert.equal((await f.call('/api/logout','POST',{}, {'X-CSRF-Token':''})).status,403);
  assert.equal((await f.call('/api/logout','POST',{}, {'X-CSRF-Token':'é'.repeat(43)})).status,403);
  assert.equal(equal('é','a'),false);
  assert.equal((await f.call('/api/signup','POST',{})).status,404);
  assert.equal((await f.call('/api/state','GET',undefined,{Host:'another.test'})).status,421);
  for(const path of ['/data/account.db','/.env','/server/admin.js','/verify-v2-supabase.html']) assert.equal((await f.call(path)).status,404);
  const page=await f.call('/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.match(page.data,/href="\/password-generator"/);
  const pgPage=await f.call('/password-generator');assert.equal(pgPage.status,200);assert.match(pgPage.headers.get('content-security-policy'),/script-src 'self'/);assert.match(pgPage.data,/密码生成器/);
  assert.equal((await f.call('/password-generator/')).status,200);
  assert.equal((await f.call('/password-generator.js')).status,200);
  assert.equal((await f.call('/api/state','GET',undefined,{Cookie:''})).status,401);
  await f.initialize();
  assert.equal((await f.change('/countries','POST',{})).status,404);
  assert.equal((await f.change('/api/countries','POST',{name:'x',color:'red; background:url(https://evil.test)'})).status,400);
  assert.equal((await f.change('/api/accounts','POST',{name:'x',category:'email',platform_id:randomUUID(),encrypted_password:'plaintext'})).status,400);
  assert.equal((await f.call('/api/logout','POST',{})).status,200);
  assert.equal((await f.call('/api/state')).status,401);
});

test('rate limiting, session expiry, admin singleton and reset revocation',async t=>{
  const f=await fixture(t,{loginLimit:2});
  for(let i=0;i<2;i++) assert.equal((await f.call('/api/login','POST',{email:'wrong@example.test',password:'bad'})).status,401);
  assert.equal((await f.call('/api/login','POST',{email:'admin@example.test',password})).status,429);
  await assert.rejects(setAdmin(f.store.db,'other@example.test',password),/已存在/);
  const other=await fixture(t);
  await other.login();
  other.store.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await other.call('/api/state')).status,401);
  await other.login();
  await setAdmin(other.store.db,'admin@example.test',password,true);
  assert.equal((await other.call('/api/state')).status,401);
});

test('CRUD relationships, import atomicity, optimistic writes and complete key rotation',async t=>{
  const f=await fixture(t);await f.login();const {key,salt}=await f.initialize();
  const snapshot=f.store.snapshot(),emailPlatform=snapshot.platforms.find(p=>p.category==='email'),applePlatform=snapshot.platforms.find(p=>p.category==='apple');
  const cipher=await encryptWith(key,'fake password'),fa=await encryptWith(key,'fake TOTP');
  const create=async data=>{const r=await f.change('/api/accounts','POST',data);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.result.id;};
  const base={category:'email',platform_id:emailPlatform.id,name:'fake@example.test'};
  const a=await create({...base,encrypted_password:cipher,encrypted_2fa:fa});
  const b=await create({...base,name:'2fa only',encrypted_2fa:fa});
  const c=await create({...base,name:'password only',encrypted_password:cipher});
  const empty=await create({...base,name:'no secrets'});
  const apple=await create({category:'apple',platform_id:applePlatform.id,name:'linked',register_email_id:a});
  assert.equal((await f.change('/api/platforms/'+emailPlatform.id,'DELETE',null)).status,409);
  assert.equal((await f.change('/api/accounts/'+a,'PATCH',{category:'apple',platform_id:applePlatform.id})).status,409);
  assert.equal((await f.change('/api/accounts/'+apple,'PATCH',{register_email_id:apple})).status,400);
  assert.equal((await f.change('/api/accounts','POST',base,snapshot)).status,409);
  const beforeImport=f.store.snapshot();
  assert.equal((await f.change('/api/accounts/import','POST',[base,{...base,platform_id:randomUUID()}])).status,400);
  assert.deepEqual(f.store.snapshot(),beforeImport);
  const newSalt=b64(randomBytes(16)),newKey=await deriveKey('Test-vault-new-password',unb64(newSalt));
  const rotation={salt:newSalt,canary:await encryptWith(newKey,CANARY_PLAIN),updates:[
    {id:a,ct:await encryptWith(newKey,'fake password'),fa:await encryptWith(newKey,'fake TOTP')},
    {id:b,fa:await encryptWith(newKey,'fake TOTP')},{id:c,ct:await encryptWith(newKey,'fake password')}]};
  for(const updates of [rotation.updates.slice(1),[rotation.updates[0],rotation.updates[0],rotation.updates[2]],
    [{...rotation.updates[0],id:empty},...rotation.updates.slice(1)],
    [{id:a,ct:rotation.updates[0].ct},...rotation.updates.slice(1)]]) {
    const before=f.store.snapshot();
    assert.equal((await f.change('/api/vault/rotate','POST',{...rotation,updates})).status,409);
    assert.deepEqual(f.store.snapshot(),before);
  }
  const beforeConcurrent=f.store.snapshot();
  assert.equal((await f.change('/api/accounts/'+empty,'PATCH',{name:'changed'})).status,200);
  assert.equal((await f.change('/api/vault/rotate','POST',rotation,beforeConcurrent)).status,409);
  const beforeCreate=f.store.snapshot();
  const temporary=await create({...base,name:'concurrent creation'});
  assert.equal((await f.change('/api/vault/rotate','POST',rotation,beforeCreate)).status,409);
  const beforeDelete=f.store.snapshot();
  assert.equal((await f.change('/api/accounts/'+temporary,'DELETE',null)).status,200);
  assert.equal((await f.change('/api/vault/rotate','POST',rotation,beforeDelete)).status,409);
  const beforeFault=f.store.snapshot();
  f.store.db.exec("CREATE TRIGGER fail_rotation BEFORE UPDATE ON vault_meta BEGIN SELECT RAISE(ABORT, 'injected database failure'); END");
  assert.equal((await f.change('/api/vault/rotate','POST',rotation)).status,500);
  assert.deepEqual(f.store.snapshot(),beforeFault);
  f.store.db.exec('DROP TRIGGER fail_rotation');
  const beforeRotate=f.store.snapshot();
  assert.equal((await f.change('/api/vault/rotate','POST',rotation)).status,200);
  const after=f.store.snapshot();assert.equal(after.vault.salt,newSalt);
  for(const row of after.accounts) {
    if(row.encrypted_password) assert.equal(await decryptWith(newKey,row.encrypted_password),'fake password');
    if(row.encrypted_2fa) assert.equal(await decryptWith(newKey,row.encrypted_2fa),'fake TOTP');
  }
  await assert.rejects(decryptWith(key,after.vault.canary));
  assert.equal((await f.change('/api/accounts/'+a,'PATCH',{encrypted_password:cipher},beforeRotate)).status,409);
  assert.equal((await f.call('/api/accounts/'+a,'PATCH',{expectedRevision:after.revision,expectedSalt:salt,data:{encrypted_password:cipher}})).status,409);
  assert.equal((await f.change('/api/accounts/'+a,'DELETE',null)).status,200);
  assert.equal(f.store.snapshot().accounts.find(row=>row.id===apple).register_email_id,null);
  assert.equal(f.store.db.pragma('foreign_key_check').length,0);
});

test('empty-vault rotation and racing initialization',async t=>{
  const f=await fixture(t);await f.login();const before=f.store.snapshot();await f.initialize();
  const salt=b64(randomBytes(16)),key=await deriveKey('other-test-password',unb64(salt)),canary=await encryptWith(key,CANARY_PLAIN);
  assert.equal((await f.change('/api/vault/init','POST',{salt,canary},before)).status,409);
  assert.equal((await f.change('/api/vault/rotate','POST',{salt,canary,updates:[]})).status,200);
  assert.equal(f.store.snapshot().vault.salt,salt);
});

test('devices CRUD, account device links, schema v2 and foreign keys',async t=>{
  const f=await fixture(t);await f.login();await f.initialize();
  assert.equal(f.store.db.pragma('user_version',{simple:true}),6);
  const initialSnap=f.store.snapshot();
  assert.ok(Array.isArray(initialSnap.devices));assert.equal(initialSnap.devices.length,0);
  const addDev1=await f.change('/api/devices','POST',{name:'MacBook Pro',sort:1});
  assert.equal(addDev1.status,200);const dev1Id=addDev1.data.result.id;
  const addDev2=await f.change('/api/devices','POST',{name:'iPhone 15'});
  assert.equal(addDev2.status,200);const dev2Id=addDev2.data.result.id;
  const beforeStale=f.store.snapshot();
  assert.equal((await f.change('/api/devices','POST',{name:'Stale iPad'},initialSnap)).status,409);
  assert.deepEqual(f.store.snapshot(),beforeStale);
  const emailPlatform=beforeStale.platforms.find(p=>p.category==='email');
  const applePlatform=beforeStale.platforms.find(p=>p.category==='apple');
  const fakeDeviceId=randomUUID();
  const beforeFailed=f.store.snapshot();
  const failRes=await f.change('/api/accounts','POST',{category:'email',platform_id:emailPlatform.id,name:'fail@example.test',device_ids:[dev1Id,fakeDeviceId]});
  assert.equal(failRes.status,400);assert.deepEqual(f.store.snapshot(),beforeFailed);
  const nonEmailFail=await f.change('/api/accounts','POST',{category:'apple',platform_id:applePlatform.id,name:'apple@example.test',device_ids:[dev1Id]});
  assert.equal(nonEmailFail.status,400);assert.deepEqual(f.store.snapshot(),beforeFailed);
  const nonEmailOk=await f.change('/api/accounts','POST',{category:'apple',platform_id:applePlatform.id,name:'apple-ok@example.test',device_ids:[]});
  assert.equal(nonEmailOk.status,200);
  const emailRes=await f.change('/api/accounts','POST',{category:'email',platform_id:emailPlatform.id,name:'email@example.test',device_ids:[dev1Id,dev2Id,dev1Id]});
  assert.equal(emailRes.status,200);const emailAccId=emailRes.data.result.id;
  const afterCreate=f.store.snapshot();
  const sortedDevIds=[dev1Id,dev2Id].sort();
  assert.deepEqual(afterCreate.accounts.find(a=>a.id===emailAccId).device_ids,sortedDevIds);
  assert.equal((await f.change('/api/devices/'+dev1Id,'DELETE',null)).status,409);
  const patchWithout=await f.change('/api/accounts/'+emailAccId,'PATCH',{name:'email-renamed@example.test'});
  assert.equal(patchWithout.status,200);
  assert.deepEqual(f.store.snapshot().accounts.find(a=>a.id===emailAccId).device_ids,sortedDevIds);
  const patchClear=await f.change('/api/accounts/'+emailAccId,'PATCH',{device_ids:[]});
  assert.equal(patchClear.status,200);
  assert.deepEqual(f.store.snapshot().accounts.find(a=>a.id===emailAccId).device_ids,[]);
  await f.change('/api/accounts/'+emailAccId,'PATCH',{device_ids:[dev1Id]});
  assert.deepEqual(f.store.snapshot().accounts.find(a=>a.id===emailAccId).device_ids,[dev1Id]);
  const changeCat=await f.change('/api/accounts/'+emailAccId,'PATCH',{category:'apple',platform_id:applePlatform.id});
  assert.equal(changeCat.status,200);
  assert.deepEqual(f.store.snapshot().accounts.find(a=>a.id===emailAccId).device_ids,[]);
  assert.equal(f.store.db.prepare('SELECT 1 FROM account_devices WHERE account_id=?').get(emailAccId),undefined);
  const emailRes2=await f.change('/api/accounts','POST',{category:'email',platform_id:emailPlatform.id,name:'email2@example.test',device_ids:[dev1Id]});
  const emailAcc2Id=emailRes2.data.result.id;
  assert.deepEqual(f.store.snapshot().accounts.find(a=>a.id===emailAcc2Id).device_ids,[dev1Id]);
  assert.equal((await f.change('/api/accounts/'+emailAcc2Id,'DELETE',null)).status,200);
  assert.equal(f.store.db.prepare('SELECT 1 FROM account_devices WHERE account_id=?').get(emailAcc2Id),undefined);
  assert.equal((await f.change('/api/devices/'+dev1Id,'DELETE',null)).status,200);
  assert.equal((await f.change('/api/devices/'+dev2Id,'DELETE',null)).status,200);
  assert.equal(f.store.snapshot().devices.length,0);
  assert.equal(f.store.db.pragma('integrity_check',{simple:true}),'ok');
  assert.equal(f.store.db.pragma('foreign_key_check').length,0);
});

test('email account passkey flag: create, read, partial patch, reject non-email and clear on category change',async t=>{
  const f=await fixture(t);await f.login();await f.initialize();
  const snapshot=f.store.snapshot(),emailPlatform=snapshot.platforms.find(p=>p.category==='email'),applePlatform=snapshot.platforms.find(p=>p.category==='apple');
  const create=await f.change('/api/accounts','POST',{category:'email',platform_id:emailPlatform.id,name:'passkey@example.test',twofa_enabled:true,passkey_enabled:true});
  assert.equal(create.status,200);const id=create.data.result.id;
  const read=(await f.call('/api/state')).data.accounts.find(a=>a.id===id);
  assert.equal(read.passkey_enabled,true);assert.equal(read.twofa_enabled,true);
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{name:'passkey-renamed@example.test'})).status,200);
  assert.equal(f.store.snapshot().accounts.find(a=>a.id===id).passkey_enabled,true);
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{passkey_enabled:false})).status,200);
  assert.equal(f.store.snapshot().accounts.find(a=>a.id===id).passkey_enabled,false);
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{passkey_enabled:true})).status,200);
  assert.equal(f.store.snapshot().accounts.find(a=>a.id===id).passkey_enabled,true);
  const beforeRejected=f.store.snapshot();
  assert.equal((await f.change('/api/accounts','POST',{category:'apple',platform_id:applePlatform.id,name:'apple-passkey@example.test',passkey_enabled:true})).status,400);
  assert.deepEqual(f.store.snapshot(),beforeRejected);
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{category:'apple',platform_id:applePlatform.id})).status,200);
  const changed=f.store.snapshot().accounts.find(a=>a.id===id);
  assert.equal(changed.passkey_enabled,false);
  assert.equal(f.store.db.prepare('SELECT passkey_enabled FROM accounts WHERE id=?').get(id).passkey_enabled,0);
});

test('passkey boundaries: options gating, auth, revocation on rotate/reset, no secrets in listings',async t=>{
  const f=await fixture(t,{loginLimit:3});
  const insertPasskey=(id,wrapped)=>f.store.db.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?,NULL)').run(id,'AQID',0,wrapped,'iPhone',new Date().toISOString());
  assert.deepEqual((await f.call('/api/passkey/login/options','POST',{})).data,{enabled:false});
  assert.equal((await f.call('/api/passkey/login/options','POST',{},{Origin:'https://evil.test'})).status,403);
  assert.equal((await f.call('/api/passkey/register/options','POST',{})).status,401);
  assert.equal((await f.call('/api/passkeys')).status,401);
  await f.login();const {key,salt}=await f.initialize();
  const reg=await f.call('/api/passkey/register/options','POST',{});
  assert.equal(reg.status,200);assert.equal(reg.data.rp.id,'account.test');
  assert.deepEqual(reg.data.authenticatorSelection,{authenticatorAttachment:'platform',residentKey:'required',requireResidentKey:true,userVerification:'required'});
  const forged={id:'AAAA',rawId:'AAAA',type:'public-key',response:{clientDataJSON:'e30',attestationObject:'oA'},clientExtensionResults:{}};
  const wrapped=await encryptWith(key,'not-a-real-key');
  assert.equal((await f.call('/api/passkey/register','POST',{response:forged,wrappedKey:wrapped,label:'iPhone',expectedSalt:salt})).status,400);
  assert.equal((await f.call('/api/passkey/register','POST',{response:forged,wrappedKey:'plaintext',label:'iPhone',expectedSalt:salt})).status,400);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM passkeys').get().n,0);
  insertPasskey('cred-one',wrapped);
  const opts=await f.call('/api/passkey/login/options','POST',{});
  assert.equal(opts.data.enabled,true);assert.equal(opts.data.options.rpId,'account.test');
  assert.equal(opts.data.options.userVerification,'required');assert.deepEqual(opts.data.options.allowCredentials.map(c=>c.id),['cred-one']);
  const assertion=id=>({response:{id,rawId:id,type:'public-key',response:{clientDataJSON:'e30',authenticatorData:'AA',signature:'AA'},clientExtensionResults:{}}});
  assert.equal((await f.call('/api/passkey/login','POST',assertion('unknown'))).status,401);
  assert.equal((await f.call('/api/passkey/login','POST',assertion('cred-one'))).status,401);
  assert.equal((await f.call('/api/passkey/login','POST',{response:{id:'cred-one'}})).status,400);
  assert.equal((await f.call('/api/passkey/login','POST',assertion('cred-one'))).status,429);
  const listing=await f.call('/api/passkeys');
  assert.deepEqual(Object.keys(listing.data[0]).sort(),['created_at','id','label','last_used_at']);
  assert.doesNotMatch(JSON.stringify((await f.call('/api/state')).data),/cred-one|passkey/);
  assert.equal((await f.call('/api/passkeys/missing','DELETE',{})).status,404);
  assert.equal((await f.call('/api/passkeys/cred-one','DELETE',{})).status,200);
  insertPasskey('cred-two',wrapped);
  const newSalt=b64(randomBytes(16)),newKey=await deriveKey('Test-vault-new-password',unb64(newSalt));
  assert.equal((await f.change('/api/vault/rotate','POST',{salt:newSalt,canary:await encryptWith(newKey,CANARY_PLAIN),updates:[]})).status,200);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM passkeys').get().n,0);
  insertPasskey('cred-three',wrapped);
  await setAdmin(f.store.db,'admin@example.test',password,true);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM passkeys').get().n,0);
});

test('schema v2 database migrates to v6 without touching existing rows',t=>{
  const dir=mkdtempSync(join(tmpdir(),'account-migrate-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'account.db');
  let store=openStore(file);
  const before=store.snapshot();
  store.db.exec('DROP TABLE password_history; ALTER TABLE accounts DROP COLUMN claude_status; ALTER TABLE accounts DROP COLUMN claude_registered_at; ALTER TABLE accounts DROP COLUMN claude_active_at; ALTER TABLE accounts DROP COLUMN claude_banned_at; ALTER TABLE accounts DROP COLUMN passkey_enabled; DROP TABLE passkeys; PRAGMA user_version=2;');store.db.close();
  store=openStore(file);
  assert.equal(store.db.pragma('user_version',{simple:true}),6);
  assert.deepEqual(store.snapshot(),before);
  assert.equal(store.db.prepare('SELECT count(*) n FROM passkeys').get().n,0);
  assert.equal(store.db.prepare('SELECT count(*) n FROM password_history').get().n,0);
  store.db.exec('PRAGMA user_version=7;');store.db.close();
  assert.throws(()=>openStore(file),/newer than this server/);
});

test('schema v3 database migrates to v6 preserving accounts and device links',t=>{
  const dir=mkdtempSync(join(tmpdir(),'account-migrate-v3-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'account.db');
  let store=openStore(file);
  const platform=store.db.prepare("SELECT id FROM platforms WHERE category='email' LIMIT 1").get();
  const id=randomUUID(),deviceId=randomUUID(),timestamp=new Date().toISOString();
  store.db.prepare('INSERT INTO accounts (id,category,platform_id,name,twofa_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id,'email',platform.id,'legacy@example.test',1,timestamp,timestamp);
  store.db.prepare('INSERT INTO devices (id,name,created_at) VALUES (?,?,?)').run(deviceId,'Legacy Device',timestamp);
  store.db.prepare('INSERT INTO account_devices (account_id,device_id) VALUES (?,?)').run(id,deviceId);
  const before=store.snapshot();
  store.db.exec('DROP TABLE password_history; ALTER TABLE accounts DROP COLUMN claude_status; ALTER TABLE accounts DROP COLUMN claude_registered_at; ALTER TABLE accounts DROP COLUMN claude_active_at; ALTER TABLE accounts DROP COLUMN claude_banned_at; ALTER TABLE accounts DROP COLUMN passkey_enabled; PRAGMA user_version=3;');store.db.close();
  store=openStore(file);
  assert.equal(store.db.pragma('user_version',{simple:true}),6);
  assert.deepEqual(store.snapshot(),before);
  const migrated=store.snapshot().accounts.find(a=>a.id===id);
  assert.equal(migrated.passkey_enabled,false);assert.equal(migrated.twofa_enabled,true);
  assert.deepEqual(migrated.device_ids,[deviceId]);
  assert.equal(store.db.pragma('integrity_check',{simple:true}),'ok');
  assert.equal(store.db.pragma('foreign_key_check').length,0);
  store.db.close();
});

test('schema v4 database migrates to v6 preserving accounts, passkey flag and device links',t=>{
  const dir=mkdtempSync(join(tmpdir(),'account-migrate-v4-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'account.db');
  let store=openStore(file);
  const platform=store.db.prepare("SELECT id FROM platforms WHERE category='email' LIMIT 1").get();
  const id=randomUUID(),deviceId=randomUUID(),timestamp=new Date().toISOString();
  store.db.prepare('INSERT INTO accounts (id,category,platform_id,name,twofa_enabled,passkey_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id,'email',platform.id,'claude-legacy@example.test',1,1,timestamp,timestamp);
  store.db.prepare('INSERT INTO devices (id,name,created_at) VALUES (?,?,?)').run(deviceId,'Claude Legacy Device',timestamp);
  store.db.prepare('INSERT INTO account_devices (account_id,device_id) VALUES (?,?)').run(id,deviceId);
  const before=store.snapshot();
  store.db.exec('DROP TABLE password_history; ALTER TABLE accounts DROP COLUMN claude_status; ALTER TABLE accounts DROP COLUMN claude_registered_at; ALTER TABLE accounts DROP COLUMN claude_active_at; ALTER TABLE accounts DROP COLUMN claude_banned_at; PRAGMA user_version=4;');store.db.close();
  store=openStore(file);
  assert.equal(store.db.pragma('user_version',{simple:true}),6);
  assert.deepEqual(store.snapshot(),before);
  const migrated=store.snapshot().accounts.find(a=>a.id===id);
  assert.equal(migrated.passkey_enabled,true);assert.equal(migrated.twofa_enabled,true);
  assert.equal(migrated.claude_status,null);assert.equal(migrated.claude_registered_at,null);
  assert.equal(migrated.claude_active_at,null);assert.equal(migrated.claude_banned_at,null);
  assert.deepEqual(migrated.device_ids,[deviceId]);
  assert.equal(store.db.pragma('integrity_check',{simple:true}),'ok');
  assert.equal(store.db.pragma('foreign_key_check').length,0);
  store.db.close();
});

test('schema v5 database migrates to v6 preserving accounts, claude status, passkey flag and device links',t=>{
  const dir=mkdtempSync(join(tmpdir(),'account-migrate-v5-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'account.db');
  let store=openStore(file);
  const platform=store.db.prepare("SELECT id FROM platforms WHERE category='email' LIMIT 1").get();
  const id=randomUUID(),deviceId=randomUUID(),timestamp=new Date().toISOString();
  store.db.prepare('INSERT INTO accounts (id,category,platform_id,name,twofa_enabled,passkey_enabled,claude_status,claude_active_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id,'email',platform.id,'v5@example.test',1,1,'active','2026-03-05',timestamp,timestamp);
  store.db.prepare('INSERT INTO devices (id,name,created_at) VALUES (?,?,?)').run(deviceId,'V5 Device',timestamp);
  store.db.prepare('INSERT INTO account_devices (account_id,device_id) VALUES (?,?)').run(id,deviceId);
  const before=store.snapshot();
  store.db.exec('DROP TABLE password_history; PRAGMA user_version=5;');store.db.close();
  store=openStore(file);
  assert.equal(store.db.pragma('user_version',{simple:true}),6);
  assert.deepEqual(store.snapshot(),before);
  assert.deepEqual(store.listPasswordHistory(),[]);
  const migrated=store.snapshot().accounts.find(a=>a.id===id);
  assert.equal(migrated.claude_status,'active');assert.equal(migrated.claude_active_at,'2026-03-05');
  assert.equal(store.db.pragma('integrity_check',{simple:true}),'ok');
  assert.equal(store.db.pragma('foreign_key_check').length,0);
  store.db.close();
});

test('password history API works without login, enforces origin/validation, deduplicates and caps at 50',async t=>{
  const f=await fixture(t);
  const initial=await f.call('/api/password-history');
  assert.equal(initial.status,200);
  assert.equal(initial.headers.get('cache-control'),'no-store');
  assert.deepEqual(initial.data,{items:[]});

  assert.equal((await f.call('/api/password-history','POST',{password:'abc'},{Origin:'https://evil.test'})).status,403);
  assert.equal((await f.call('/api/password-history','POST',{password:'abc'},{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await f.call('/api/password-history','POST',{password:''})).status,400);
  assert.equal((await f.call('/api/password-history','POST',{password:'x'.repeat(513)})).status,400);
  assert.equal((await f.call('/api/password-history','POST',{password:'ok',extra:true})).status,400);

  const exactPw='  Alpha-123! <tag>&"  ';
  const r1=await f.call('/api/password-history','POST',{password:exactPw});
  assert.equal(r1.status,200);
  assert.equal(r1.data.items.length,1);
  assert.equal(r1.data.items[0].password,exactPw);
  assert.equal(typeof r1.data.items[0].copied_at,'number');

  for(let i=1;i<=52;i++){
    const res=await f.call('/api/password-history','POST',{password:`SyncPw#${i}`});
    assert.equal(res.status,200);
  }
  const listed=await f.call('/api/password-history');
  assert.equal(listed.status,200);
  assert.equal(listed.data.items.length,50);
  assert.equal(listed.data.items[0].password,'SyncPw#52');
  assert.equal(listed.data.items[49].password,'SyncPw#3');

  // 重复写入已存在密码应去重并置顶
  const bumped=await f.call('/api/password-history','POST',{password:'SyncPw#10'});
  assert.equal(bumped.status,200);
  assert.equal(bumped.data.items.length,50);
  assert.equal(bumped.data.items[0].password,'SyncPw#10');
  assert.equal(bumped.data.items.filter(i=>i.password==='SyncPw#10').length,1);

  // 不泄漏到保险库快照 /api/state
  await f.login();
  assert.doesNotMatch(JSON.stringify((await f.call('/api/state')).data),/SyncPw#10/);

  // 清空同样支持免登录且检查同源
  assert.equal((await f.call('/api/password-history','DELETE',{},{Origin:'https://evil.test'})).status,403);
  const cleared=await f.call('/api/password-history','DELETE',{},{Cookie:'', 'X-CSRF-Token':''});
  assert.equal(cleared.status,200);
  assert.deepEqual(cleared.data,{items:[]});
  assert.deepEqual((await f.call('/api/password-history','GET',undefined,{Cookie:''})).data,{items:[]});
});

test('email account claude status: dates kept across status changes, cleared on fresh/category change, rejected on non-email',async t=>{
  const f=await fixture(t);await f.login();await f.initialize();
  const snapshot=f.store.snapshot(),emailPlatform=snapshot.platforms.find(p=>p.category==='email'),applePlatform=snapshot.platforms.find(p=>p.category==='apple');
  const base={category:'email',platform_id:emailPlatform.id,name:'claude@example.test'};
  const read=id=>f.store.snapshot().accounts.find(a=>a.id===id);
  const create=async data=>{const r=await f.change('/api/accounts','POST',data);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.result.id;};
  const assertDates=(row,registered,active,banned)=>{assert.equal(row.claude_registered_at,registered);assert.equal(row.claude_active_at,active);assert.equal(row.claude_banned_at,banned);};
  const id=await create({...base,claude_status:'active',claude_registered_at:'2026-03-01',claude_active_at:'2026-03-05',claude_banned_at:'2026-03-10'});
  let row=read(id);assert.equal(row.claude_status,'active');assertDates(row,'2026-03-01','2026-03-05','2026-03-10');
  const bannedEmpty=await create({...base,name:'banned-empty@example.test',claude_status:'banned',claude_banned_at:null});
  row=read(bannedEmpty);assert.equal(row.claude_status,'banned');assertDates(row,null,null,null);
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{name:'renamed@example.test'})).status,200);
  row=read(id);assert.equal(row.claude_status,'active');assertDates(row,'2026-03-01','2026-03-05','2026-03-10');
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{claude_status:'registered'})).status,200);
  row=read(id);assert.equal(row.claude_status,'registered');assertDates(row,'2026-03-01','2026-03-05','2026-03-10');
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{claude_status:'fresh'})).status,200);
  row=read(id);assert.equal(row.claude_status,'fresh');assertDates(row,null,null,null);
  assert.equal((await f.change('/api/accounts/'+id,'PATCH',{claude_status:null})).status,200);
  row=read(id);assert.equal(row.claude_status,null);assertDates(row,null,null,null);
  const beforeBadFresh=f.store.snapshot();
  assert.equal((await f.change('/api/accounts','POST',{...base,name:'bad-fresh@example.test',claude_status:'fresh',claude_registered_at:'2026-03-01'})).status,400);
  assert.deepEqual(f.store.snapshot(),beforeBadFresh);
  assert.equal((await f.change('/api/accounts','POST',{...base,name:'bad-status@example.test',claude_status:'idle'})).status,400);
  assert.equal((await f.change('/api/accounts','POST',{...base,name:'bad-date@example.test',claude_status:'active',claude_active_at:'2026-02-30'})).status,400);
  assert.equal((await f.change('/api/accounts','POST',{...base,name:'bad-slash@example.test',claude_status:'active',claude_active_at:'2026/03/01'})).status,400);
  assert.equal((await f.change('/api/accounts','POST',{category:'apple',platform_id:applePlatform.id,name:'claude-apple@example.test',claude_status:'active'})).status,400);
  assert.equal((await f.change('/api/accounts','POST',{category:'apple',platform_id:applePlatform.id,name:'claude-apple-date@example.test',claude_active_at:'2026-03-05'})).status,400);
  const moved=await create({...base,name:'moved@example.test',claude_status:'active',claude_registered_at:'2026-03-01',claude_active_at:'2026-03-05'});
  assert.equal((await f.change('/api/accounts/'+moved,'PATCH',{category:'apple',platform_id:applePlatform.id})).status,200);
  row=read(moved);assert.equal(row.category,'apple');assert.equal(row.claude_status,null);assertDates(row,null,null,null);
  const imported=await f.change('/api/accounts/import','POST',[{...base,name:'imported@example.test',claude_status:'active',claude_registered_at:'2026-03-01'}]);
  assert.equal(imported.status,200);
  row=(await f.call('/api/state')).data.accounts.find(a=>a.name==='imported@example.test');
  assert.equal(row.claude_status,'active');assert.equal(row.claude_registered_at,'2026-03-01');
  const beforeBadImport=f.store.snapshot();
  assert.equal((await f.change('/api/accounts/import','POST',[{...base,name:'import-ok@example.test',claude_status:'active'},{category:'apple',platform_id:applePlatform.id,name:'import-bad@example.test',claude_status:'active'}])).status,400);
  assert.deepEqual(f.store.snapshot(),beforeBadImport);
  assert.equal(f.store.db.pragma('integrity_check',{simple:true}),'ok');
});
