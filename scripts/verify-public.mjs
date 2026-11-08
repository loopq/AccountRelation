import { chromium } from '@playwright/test';
import { readFileSync,writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { isIP } from 'node:net';
const credentials=JSON.parse(readFileSync(join(homedir(),'.config/account-relation/admin.json'),'utf8'));
const secret=credentials.password;
const forced=process.env.VERIFY_SERVER_IP==='1';
const serverAddress=process.env.VERIFY_SERVER_ADDRESS;
if(forced && !isIP(serverAddress || '')) throw new Error('Set VERIFY_SERVER_ADDRESS to the target server IP when VERIFY_SERVER_IP=1');
const browser=await chromium.launch({headless:true,args:forced?[`--host-resolver-rules=MAP account.loopq.cn ${serverAddress}`]:[]});
let page;
try {
 const context=await browser.newContext();
 page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('response',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/api/'))console.log('API',p,r.status());});
 page.on('pageerror',e=>console.log('PAGE_ERROR',e.message.replaceAll(secret,'[REDACTED]')));
 const response=await page.goto('https://account.loopq.cn/',{waitUntil:'networkidle',timeout:20000});
 assert.equal(response.status(),200);
 const tls=await response.securityDetails();assert.ok(tls);
 await page.locator('#loginEmail').fill(credentials.email);
 await page.locator('#loginPw').fill(credentials.password);credentials.password='';
 const stateResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/state');
 await page.locator('#loginBtn').click();
 const state=await(await stateResponse).json();
 console.log('STATE_SHAPE',JSON.stringify({vaultInitialized:!!state.vault,accounts:state.accounts?.length,revision:state.revision}));
 assert.equal(state.accounts.length,0);assert.equal(state.vault,null);
 await page.locator('#lockWarn').waitFor({state:'visible'});
 const cookie=(await context.cookies()).find(c=>c.name==='__Host-account_session');
 assert.ok(cookie?.secure && cookie?.httpOnly && cookie?.sameSite==='Strict');
 // The production vault is deliberately left for the user's own master password.
 await page.locator('#logout').evaluate(button=>button.click());
 await page.locator('#login').waitFor({state:'visible'});
 await page.waitForFunction(async()=>{const r=await fetch('/api/state',{cache:'no-store'});return r.status===401;});
 await page.screenshot({path:'docs/agents/account-relation-public-login.png'});
 writeFileSync('docs/agents/public-browser-verification.json',JSON.stringify({url:page.url(),forcedResolver:forced,tls,login:true,secureCookie:true,logoutRevoked:true,productionVaultInitialized:false,productionAccounts:0},null,2));
 console.log('PUBLIC_BROWSER_TLS_LOGIN_LOGOUT_PASS; PRODUCTION_VAULT_EMPTY');
} catch(error) {
 console.error('VERIFICATION_FAILED',String(error.message).replaceAll(secret,'[REDACTED]'));
 if(page) {
  console.log('UI_STATE',await page.evaluate(()=>Object.fromEntries(['lock','login','lockWarn','lockLead','loginErr','lockErr'].map(id=>{
   const e=document.getElementById(id);return [id,e?{display:getComputedStyle(e).display,text:['lockLead','loginErr','lockErr'].includes(id)?e.textContent:undefined}:null];
  }))).catch(()=>null));
  await page.evaluate(()=>{const e=document.getElementById('loginPw');if(e)e.value='';}).catch(()=>{});
  await page.screenshot({path:'docs/agents/public-browser-failure.png'}).catch(()=>{});
 }
 process.exitCode=1;
} finally {await browser.close();}
