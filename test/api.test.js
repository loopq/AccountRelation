import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
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
  const page=await f.call('/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
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
