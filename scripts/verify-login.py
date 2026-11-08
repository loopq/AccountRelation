#!/usr/bin/env python3
"""Verify production auth via SSH without printing credentials or session tokens."""
import pathlib,subprocess,shlex
js=r'''
const http=require('node:http'),assert=require('node:assert/strict');
let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',async()=>{
 try {
  const credentials=JSON.parse(raw);raw='';let cookie='',csrf='';
  async function call(path,method='GET',data){return new Promise((resolve,reject)=>{
   const body=data===undefined?null:JSON.stringify(data);
   const req=http.request({hostname:'127.0.0.1',port:3000,path,method,headers:{Host:'account.loopq.cn',Origin:'https://account.loopq.cn',Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}},res=>{
    let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(text)}));
   });req.on('error',reject);req.end(body);
  });}
  const login=await call('/api/login','POST',credentials);credentials.password='';assert.equal(login.status,200);
  const header=login.headers['set-cookie'].at(-1);assert.match(header,/^__Host-account_session=/);assert.match(header,/Secure/);assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);
  cookie=header.split(';')[0];csrf=login.data.csrf;
  assert.equal((await call('/api/state')).status,200);
  assert.equal((await call('/api/logout','POST',{})).status,200);
  assert.equal((await call('/api/state')).status,401);
  console.log('PRODUCTION_LOGIN_SECURE_COOKIE_CSRF_LOGOUT_PASS');
 }catch(error){console.error('PRODUCTION_AUTH_VERIFICATION_FAILED',error.code||error.name);process.exitCode=1;}
});
'''
subprocess.run(['node','--check'],input=js.encode(),check=True)
remote='sudo docker compose --env-file /etc/account-relation/release.env -f /etc/account-relation/compose.yaml exec -T app node -e '+shlex.quote(js)
credential_file=pathlib.Path.home()/'.config/account-relation/admin.json'
r=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ControlMaster=no','-o','ControlPath=none','-o','ConnectTimeout=12','tencent-seoul-admin',remote],input=credential_file.read_bytes(),capture_output=True,timeout=30)
print(r.stdout.decode(),end='')
if r.returncode:print(r.stderr.decode(),end='')
raise SystemExit(r.returncode)
