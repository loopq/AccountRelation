import { test,expect } from '@playwright/test';
const admin='Test-browser-admin-4792!',master='731942',nextMaster='856137';
async function login(page) {
  await page.goto('/');
  await expect(page.locator('#loginPwGen')).toBeVisible();
  await page.locator('#loginEmail').fill('admin@example.test');await page.locator('#loginPw').fill(admin);await page.locator('#loginBtn').click();
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#loginPwGen')).toBeHidden();
}
async function unlock(page,pw) {await page.locator('#mpw').fill(pw);await page.locator('#unlockBtn').click();await expect(page.locator('#lock')).toBeHidden();}

test('full user workflow and no plaintext in API/storage; desktop and mobile',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const bodies=[];page.on('request',r=>{if(r.url().includes('/api/') && !r.url().endsWith('/login')) bodies.push(r.postData() || '');});
  let dismissNextDialog = false;
  page.on('dialog', dialog => {
    if (dismissNextDialog) { dismissNextDialog = false; dialog.dismiss(); }
    else dialog.accept();
  });
  await login(page);
  await page.locator('#mpw').fill('73194');await page.locator('#unlockBtn').click();
  await expect(page.locator('#lockErr')).toHaveText('首次主密码至少 6 个字符');
  expect(await page.evaluate(async()=>(await(await fetch('/api/state')).json()).vault)).toBeNull();
  await unlock(page,master);
  await page.locator('#add').click();
  await page.locator('#f-platform').selectOption({label:'Gmail'});
  await expect(page.locator('#f-2fa')).toBeVisible();
  await expect(page.locator('#f-passkey')).toBeVisible();
  await expect(page.locator('#f-claude')).toBeVisible();
  await expect(page.locator('#f-claude')).toHaveValue('');
  await expect(page.locator('.claude-dates')).toBeHidden();
  const y2fa=await page.locator('#f-2fa').boundingBox();
  const yPasskey=await page.locator('#f-passkey').boundingBox();
  expect(Math.abs(y2fa.y-yPasskey.y)).toBeLessThan(4);
  await page.locator('#f-claude').selectOption('banned');
  await expect(page.locator('.claude-dates')).toBeVisible();
  await expect(page.locator('#f-claude-banned')).toHaveValue('');
  await page.locator('#f-claude').selectOption('active');
  await expect(page.locator('.claude-dates')).toBeVisible();
  const localToday=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
  await expect(page.locator('#f-claude-active')).toHaveValue(localToday);
  await expect(page.locator('#f-claude-reg')).toHaveValue('');
  await expect(page.locator('#f-claude-banned')).toHaveValue('');
  await page.locator('#f-claude-reg').fill('2026-03-01');
  await page.locator('#f-passkey').check();
  await page.locator('#f-name').fill('<img src=x onerror=alert(1)>@example.test');
  await page.locator('#f-pw').fill('fake-account-secret-111');await page.locator('#f-2fakey').fill('fake-totp-seed-222');
  await page.locator('#f-note').fill('</textarea><script>alert(1)</script>');await page.locator('#f-save').click();
  await expect(page.locator('#drawer')).not.toHaveClass(/open/);
  await expect(page.locator('.card')).toHaveCount(1);await expect(page.locator('.card img')).toHaveCount(0);
  await expect(page.locator('#col-email .card .chips')).toContainText('通行密钥');
  await expect(page.locator('#col-email .card .chips')).toContainText('Claude · 使用中');
  await expect(page.locator('#col-email .card .meta')).toContainText('注册 2026-03-01');
  await expect(page.locator('.claude-stats [data-claude="active"]')).toContainText('1');
  await page.locator('[data-edit]').click();
  await expect(page.locator('#f-pw')).toHaveValue('fake-account-secret-111');
  await expect(page.locator('#f-passkey')).toBeChecked();
  await expect(page.locator('#f-claude')).toHaveValue('active');
  await expect(page.locator('#f-claude-reg')).toHaveValue('2026-03-01');
  await expect(page.locator('#f-claude-active')).toHaveValue(localToday);
  await page.locator('#f-claude').selectOption('banned');
  await expect(page.locator('#f-claude-banned')).toHaveValue('');
  await expect(page.locator('#f-claude-active')).toHaveValue(localToday);
  await page.locator('#f-save').click();
  await expect(page.locator('#drawer')).not.toHaveClass(/open/);
  await expect(page.locator('#col-email .card .chips')).toContainText('Claude · 已封禁');
  await expect(page.locator('#col-email .card .meta')).not.toContainText('封禁');
  await expect(page.locator('.claude-stats [data-claude="banned"]')).toContainText('1');
  await page.locator('[data-edit]').click();
  await expect(page.locator('#f-pw')).toHaveValue('fake-account-secret-111');
  await expect(page.locator('#f-claude')).toHaveValue('banned');
  await expect(page.locator('#f-claude-banned')).toHaveValue('');
  await page.locator('#f-claude').selectOption('registered');
  await expect(page.locator('#f-claude-active')).toHaveValue(localToday);
  await page.locator('#f-platform').selectOption({label:'Apple ID'});
  await expect(page.locator('.field-passkey')).toBeHidden();
  await expect(page.locator('.field-claude')).toBeHidden();
  await expect(page.locator('#f-2fa')).toBeVisible();
  await page.locator('#f-platform').selectOption({label:'Gmail'});
  await page.locator('#f-passkey').uncheck();
  await page.locator('#f-save').click();
  await expect(page.locator('#drawer')).not.toHaveClass(/open/);
  await expect(page.locator('#col-email .card .chips')).not.toContainText('通行密钥');
  await expect(page.locator('#col-email .card .chips')).toContainText('Claude · 已注册');
  await expect(page.locator('#col-email .card .meta')).toContainText('使用 '+localToday);
  await page.locator('#lockNow').evaluate(button=>button.click());await expect(page.locator('#lock')).toBeVisible();await expect(page.locator('#drawerBody')).toBeEmpty();
  await expect(page.locator('.card')).toHaveCount(0);
  await page.locator('#mpw').fill('wrong password');await page.locator('#unlockBtn').click();await expect(page.locator('#lockErr')).toHaveText('主密码错误');
  await unlock(page,master);
  await page.reload();await expect(page.locator('#lock')).toBeVisible();await unlock(page,master);
  const storage=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
  expect(JSON.stringify(storage)).not.toMatch(/ag_masterkey|fake-account-secret|fake-totp-seed/);
  await page.locator('#settings').click();
  await page.locator('[data-theme-set="light"]').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('#newDevName').fill('Dev Alpha');await page.locator('#addDev').click();
  await expect(page.locator('#sdrawerBody')).toContainText('Dev Alpha · 0/5');
  await page.locator('#newDevName').fill('Dev Beta');await page.locator('#addDev').click();
  await expect(page.locator('#sdrawerBody')).toContainText('Dev Beta · 0/5');
  await page.locator('#importJson').fill(JSON.stringify([{platform:'OpenAI',name:'fake AI',password:'fake-import-secret-333'}]));
  await page.locator('#importBtn').click();await expect(page.locator('#importMsg')).toContainText('已导入 1 条');
  const beforeRejectedRotation=await page.evaluate(async()=>(await fetch('/api/state')).json());
  await page.locator('#curMpw').fill(master);await page.locator('#newMpw1').fill('85613');await page.locator('#newMpw2').fill('85613');await page.locator('#changeMpw').click();
  await expect(page.locator('#toast')).toContainText('新主密码至少 6 个字符');
  expect(await page.evaluate(async()=>(await fetch('/api/state')).json())).toEqual(beforeRejectedRotation);
  await page.locator('#curMpw').fill(master);await page.locator('#newMpw1').fill(nextMaster);await page.locator('#newMpw2').fill(nextMaster);await page.locator('#changeMpw').click();
  await expect(page.locator('#sdrawer')).not.toHaveClass(/open/);
  await page.locator('#lockNow').click();await page.locator('#mpw').fill(master);await page.locator('#unlockBtn').click();await expect(page.locator('#lockErr')).toHaveText('主密码错误');
  await unlock(page,nextMaster);
  await page.locator('#col-email [data-edit]').click();await expect(page.locator('#f-2fakey')).toHaveValue('fake-totp-seed-222');
  await page.locator('#f-pw').fill('');await page.locator('#f-save').click();await expect(page.locator('#col-email [data-cp-pass]')).toBeDisabled();
  await page.locator('#col-email [data-edit]').click();
  await page.locator('.field-devices label:has-text("Dev Alpha") input').check();
  await page.locator('.field-devices label:has-text("Dev Beta") input').check();
  await page.locator('#f-save').click();
  await expect(page.locator('#col-email .card .meta')).toContainText('设备 Dev Alpha, Dev Beta');
  await page.evaluate(async()=>{
    const s=await (await fetch('/api/state')).json();const g=s.platforms.find(p=>p.name==='Gmail');const da=s.devices.find(d=>d.name==='Dev Alpha');
    const csrf=(await (await fetch('/api/session')).json()).csrf;
    for(let i=1;i<=4;i++){
      const cur=await (await fetch('/api/state')).json();
      await fetch('/api/accounts',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({expectedRevision:cur.revision,expectedSalt:cur.vault.salt,data:{category:'email',platform_id:g.id,name:`extra${i}@example.test`,device_ids:[da.id]}})});
    }
  });
  await page.reload();await unlock(page,nextMaster);
  await page.locator('#add').click();await page.locator('#f-platform').selectOption({label:'Gmail'});
  await page.locator('#f-name').fill('sixth@example.test');
  await page.locator('.field-devices label:has-text("Dev Alpha") input').check();
  dismissNextDialog=true;await page.locator('#f-save').click();await expect(page.locator('#drawer')).toHaveClass(/open/);
  dismissNextDialog=false;await page.locator('#f-save').click();await expect(page.locator('#drawer')).not.toHaveClass(/open/);
  await expect(page.locator('#col-email .card .over').first()).toContainText('Dev Alpha');
  const devIds=await page.evaluate(async()=>Object.fromEntries((await (await fetch('/api/state')).json()).devices.map(d=>[d.name,d.id])));
  const devAlphaId=devIds['Dev Alpha'];
  await expect(page.locator(`.dev-filter option[value="${devAlphaId}"]`)).toHaveText('Dev Alpha（6/5） ⚠');
  await page.locator('.dev-filter select').selectOption({value:devAlphaId});
  await expect(page.locator('#col-email .card')).toHaveCount(6);
  await page.locator('.dev-filter select').selectOption({value:devIds['Dev Beta']});
  await expect(page.locator('#col-email .card')).toHaveCount(1);
  await page.locator('.dev-filter select').selectOption({value:'__none'});
  await expect(page.locator('#col-email')).toContainText('该筛选下暂无账号');
  await page.locator('.dev-filter select').selectOption({value:''});
  await expect(page.locator('#col-email .card')).toHaveCount(6);
  await expect(page.locator('.claude-stats [data-claude="__none"]')).toContainText('5');
  await page.locator('.claude-stats [data-claude="__none"]').click();
  await expect(page.locator('#col-email .card')).toHaveCount(5);
  await expect(page.locator('.claude-stats [data-claude="__none"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.dev-filter select').selectOption({value:devIds['Dev Beta']});
  await expect(page.locator('#col-email .card')).toHaveCount(0);
  await page.locator('.dev-filter select').selectOption({value:''});
  await expect(page.locator('#col-email .card')).toHaveCount(5);
  await page.locator('.claude-stats [data-claude="__none"]').click();
  await expect(page.locator('#col-email .card')).toHaveCount(6);
  await expect(page.locator('.claude-stats [data-claude="__none"]')).toHaveAttribute('aria-pressed','false');
  await page.locator('.dev-filter select').selectOption({value:devAlphaId});
  await page.locator('#col-email [data-edit]').first().click();await page.locator('#f-save').click();
  expect(await page.locator('.dev-filter select').inputValue()).toBe(devAlphaId);
  await page.locator('.dev-filter select').selectOption({value:''});
  await page.locator('#settings').click();await page.locator(`[data-del-dev="${devAlphaId}"]`).click();
  await expect(page.locator('#toast')).toContainText('有账号在用此设备，不能删');
  await page.locator('#sdrawerClose').click();
  await page.locator('#col-email .card .peek-btn').first().click();
  await expect(page.locator('#peek')).toBeVisible();
  await expect(page.locator('#peek .peek-note')).toContainText('</textarea><script>alert(1)</script>');
  await expect(page.locator('#peek')).toContainText('创建时间：');
  await expect(page.locator('#peek')).toContainText('更新时间：');
  expect(await page.locator('#peek').textContent()).not.toMatch(/fake-account-secret|fake-totp-seed/);
  await page.locator('#col-email .card .peek-btn').nth(1).click();
  await expect(page.locator('#peek')).toBeVisible();
  await expect(page.locator('#peek .peek-name')).toHaveText('extra1@example.test');
  await page.locator('#lockNow').click();
  await expect(page.locator('#peek')).toBeHidden();
  await expect(page.locator('#peek')).toBeEmpty();
  await unlock(page,nextMaster);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('account-graph-backup.json');
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-tab="email"]').click();
  await expect(page.locator('#col-email .dev-filter')).toBeVisible();
  await expect(page.locator('#col-email .claude-stats')).toBeVisible();
  await page.locator('[data-tab="ai"]').click();await expect(page.locator('#col-ai .card')).toHaveCount(1);
  await page.screenshot({path:'docs/deploy/account-relation-mobile-verification.png'});
  const stale=await context.newPage();await stale.goto('/');await unlock(stale,nextMaster);
  await stale.locator('#add').click();await stale.locator('#f-platform').selectOption({label:'Gmail'});
  await stale.locator('#f-name').fill('stale account');await stale.locator('#f-pw').fill('stale-secret');
  await page.locator('#settings').click();await page.locator('#newCtryName').fill('并发版本测试');await page.locator('#addCtry').click();
  await expect(page.locator('#sdrawerBody')).toContainText('并发版本测试');
  await stale.locator('#f-save').click();await expect(stale.locator('#lock')).toBeVisible();
  await expect(stale.locator('#drawerBody')).toBeEmpty();await stale.close();
  await page.locator('#sdrawerClose').click();await page.locator('#col-ai [data-edit]').click();
  await page.locator('#f-del').click();await expect(page.locator('#col-ai .card')).toHaveCount(0);
  await page.locator('#settings').click();await page.locator('#mLogout').click();await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(0);await expect(page.locator('#sdrawerBody')).toBeEmpty();
  await expect.poll(async()=>await page.evaluate(async()=>{const r=await fetch('/api/state');return r.status;})).toBe(401);
  const cacheUrls=await page.evaluate(async()=>{await navigator.serviceWorker.ready;return (await Promise.all((await caches.keys()).map(async k=>(await(await caches.open(k)).keys()).map(r=>r.url)))).flat();});
  expect(cacheUrls.every(url=>!url.includes('/api/'))).toBe(true);
  expect(bodies.join('\n')).not.toMatch(/fake-account-secret|fake-totp-seed|fake-import-secret|Test-browser-master|Test-browser-next-master/);
  for(const body of bodies) {expect(body).not.toContain(JSON.stringify(master));expect(body).not.toContain(JSON.stringify(nextMaster));}
  expect(errors).toEqual([]);
});

test('legacy service worker and sensitive cache removed before new API calls',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const cache=await caches.open('ag-shell-v1');await cache.put('/api/state',new Response(JSON.stringify({legacySensitive:true}),{headers:{'Content-Type':'application/json'}}));
    await navigator.serviceWorker.register('/legacy-sw.js',{scope:'/'});
    await new Promise(resolve=>{if(navigator.serviceWorker.controller?.scriptURL.endsWith('/legacy-sw.js'))resolve();else navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true});});
  });
  await page.reload();
  await expect(page.locator('#login')).toBeVisible();
  await expect.poll(()=>page.evaluate(async()=>(await caches.keys()).includes('ag-shell-v1'))).toBe(false);
  const session=await page.evaluate(async()=>{const r=await fetch('/api/session');return r.json();});expect(session.authenticated).toBe(false);
});

async function virtualAuthenticator(page,hasPrf) {
  const cdp=await page.context().newCDPSession(page);await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'internal',
    hasResidentKey:true,hasUserVerification:true,isUserVerified:true,hasPrf,automaticPresenceSimulation:true}});
  return ()=>cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
}
async function enroll(page,pw) {
  await page.locator('#settings').click();await page.locator('#pkMpw').fill(pw);await page.locator('#pkStep').click();
  await expect(page.locator('#pkStep')).toHaveText('在本设备开启 Face ID');await page.locator('#pkStep').click();
  await expect(page.locator('#pkStep')).toHaveText(/验证主密码|完成设置/);
  const label=await page.locator('#pkStep').textContent();
  if(label!=='验证主密码') await page.locator('#pkStep').click();
  return label;
}
// 回到前台前把时钟拨快 ms，模拟离开一段时间
async function away(page,ms) {
  await page.evaluate(ms=>{
    const real=Date.now;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    Date.now=()=>real()+ms;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
    Date.now=real;
  },ms);
}

test('Face ID passkey: one gesture logs in and unlocks; replay, idle lock, rotation and no-PRF fallback',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const logins=[];page.on('request',r=>{if(r.url().endsWith('/api/passkey/login')) logins.push(r.postData());});
  let removeAuthenticator=await virtualAuthenticator(page,true);
  await login(page);await unlock(page,nextMaster);
  await page.locator('#add').click();await page.locator('#f-platform').selectOption({label:'Gmail'});
  await page.locator('#f-name').fill('passkey@example.test');await page.locator('#f-pw').fill('fake-passkey-secret-444');await page.locator('#f-save').click();
  await expect(page.locator('#drawer')).not.toHaveClass(/open/);
  await enroll(page,nextMaster);
  await expect(page.locator('#toast')).toContainText('Face ID 已开启');await expect(page.locator('#pkList .mrow')).toHaveCount(1);
  await page.locator('#sdrawerClose').click();
  // 退出后：登录页一次 Face ID 直接进入已解锁列表
  await page.locator('#logout').click();await expect(page.locator('#login')).toBeVisible();
  await page.locator('#pkLogin').click();
  await expect(page.locator('#login')).toBeHidden();await expect(page.locator('#lock')).toBeHidden();
  await page.locator('.card:has-text("passkey@example.test") [data-edit]').click();await expect(page.locator('#f-pw')).toHaveValue('fake-passkey-secret-444');
  await page.locator('#drawerClose').click();
  expect(logins).toHaveLength(1);expect(JSON.parse(logins[0]).response.clientExtensionResults).toEqual({});
  // 重放同一份断言：challenge 已消费
  expect(await page.evaluate(async body=>(await fetch('/api/passkey/login',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,logins[0])).toBe(401);
  // 重载后会话还在：锁屏页同样一次 Face ID
  await page.reload();await expect(page.locator('#lock')).toBeVisible();
  await page.locator('#pkUnlock').click();await expect(page.locator('#lock')).toBeHidden();
  await expect(page.locator('.card:has-text("passkey@example.test")')).toHaveCount(1);
  // 回访锁：离开 89 分钟不锁，离开 90 分钟以上锁
  await away(page,89*60_000);await expect(page.locator('#lock')).toBeHidden();
  await away(page,90*60_000+1000);await expect(page.locator('#lock')).toBeVisible();await expect(page.locator('#pkUnlock')).toBeVisible();
  await page.locator('#pkUnlock').click();await expect(page.locator('#lock')).toBeHidden();
  // 改主密码：所有 Face ID 作废，按钮不再出现，新主密码照常解锁
  const rotated='Pk-rotated-918';
  await page.locator('#settings').click();
  await page.locator('#curMpw').fill(nextMaster);await page.locator('#newMpw1').fill(rotated);await page.locator('#newMpw2').fill(rotated);await page.locator('#changeMpw').click();
  await expect(page.locator('#toast')).toContainText('Face ID 需重新开启');
  await page.locator('#lockNow').click();await expect(page.locator('#lock')).toBeVisible();await expect(page.locator('#pkUnlock')).toBeHidden();
  await unlock(page,rotated);
  await page.locator('#logout').click();await expect(page.locator('#login')).toBeVisible();await expect(page.locator('#pkLogin')).toBeHidden();
  // 不支持 PRF 的验证器：开启失败并说明原因，不登记任何东西
  await removeAuthenticator();removeAuthenticator=await virtualAuthenticator(page,false);
  await login(page);await unlock(page,rotated);
  await enroll(page,rotated);
  await expect(page.locator('#pkMsg')).toContainText('不支持');await expect(page.locator('#pkList')).toContainText('还没有设备开启');
  await page.locator('#sdrawerClose').click();await page.locator('#logout').click();await expect(page.locator('#login')).toBeVisible();
  // 创建时不返回 PRF 结果（iOS 可能如此）：再验证一次拿 PRF，之后 Face ID 照常解锁
  await removeAuthenticator();await virtualAuthenticator(page,true);
  await page.addInitScript(()=>{
    const create=navigator.credentials.create.bind(navigator.credentials);
    navigator.credentials.create=async options=>{
      const credential=await create(options),results=credential.getClientExtensionResults();
      credential.getClientExtensionResults=()=>({...results,prf:{enabled:true}});
      return credential;
    };
  });
  await login(page);await unlock(page,rotated);
  expect(await enroll(page,rotated)).toBe('完成设置（再验证一次）');
  await expect(page.locator('#toast')).toContainText('Face ID 已开启');await expect(page.locator('#pkList .mrow')).toHaveCount(1);
  await page.locator('#sdrawerClose').click();await page.locator('#logout').click();
  await page.locator('#pkLogin').click();await expect(page.locator('#login')).toBeHidden();await expect(page.locator('#lock')).toBeHidden();
  await expect(page.locator('.card:has-text("passkey@example.test")')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('public password generator works without login on desktop and mobile portrait', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const errors = [];
  const apiRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) apiRequests.push(r.url()); });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('#loginPwGen')).toBeVisible();
  await page.locator('#loginPwGen').click();
  await expect(page).toHaveURL(/\/password-generator$/);
  apiRequests.length = 0;
  const res = await page.goto('/password-generator');
  expect(res.status()).toBe(200);

  // 默认状态：随机模式、16 位、数字和符号均勾选、已生成 16 位含数字和符号的密码
  await expect(page.locator('.seg-tab.active')).toHaveAttribute('data-mode', 'random');
  await expect(page.locator('#lenRange')).toHaveValue('16');
  await expect(page.locator('#lenNum')).toHaveValue('16');
  await expect(page.locator('#optNumbers')).toBeChecked();
  await expect(page.locator('#optSymbols')).toBeChecked();
  const initialPw = await page.locator('#pwText').textContent();
  expect(initialPw).toHaveLength(16);
  expect(initialPw).toMatch(/[0-9]/);
  expect(initialPw).toMatch(/[^a-zA-Z0-9]/);

  // 刷新密码
  await page.locator('#refreshBtn').click();
  const refreshedPw = await page.locator('#pwText').textContent();
  expect(refreshedPw).toHaveLength(16);
  expect(refreshedPw).not.toBe(initialPw);

  // 修改长度并关闭数字/符号开关
  await page.locator('#lenNum').fill('24');
  await page.locator('#lenNum').blur();
  await expect(page.locator('#lenRange')).toHaveValue('24');
  expect((await page.locator('#pwText').textContent()).length).toBe(24);

  await page.locator('#optNumbers').uncheck({ force: true });
  await page.locator('#optSymbols').uncheck({ force: true });
  const lettersOnly = await page.locator('#pwText').textContent();
  expect(lettersOnly).toMatch(/^[a-zA-Z]{24}$/);

  // 切换容易记住与 PIN 模式
  await page.locator('.seg-tab[data-mode="memorable"]').click();
  const memorable = await page.locator('#pwText').textContent();
  expect(memorable.split('-')).toHaveLength(4);

  await page.locator('.seg-tab[data-mode="pin"]').click();
  const pin = await page.locator('#pwText').textContent();
  expect(pin).toMatch(/^\d{6}$/);

  // 切回随机模式并测试复制按钮反馈
  await page.locator('.seg-tab[data-mode="random"]').click();
  await page.locator('#copyBtn').click();
  await expect(page.locator('#copyBtnText')).toHaveText('已复制');
  await expect(page.locator('#toast')).toContainText('密码已复制到剪贴板');

  // 切换明暗主题
  const beforeTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('#themeToggle').click();
  const afterTheme = await page.locator('html').getAttribute('data-theme');
  expect(afterTheme).not.toBe(beforeTheme);

  // 手机竖屏适配检查（无横向溢出，卡片完整在视口内）
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    await page.setViewportSize(vp);
    const metrics = await page.evaluate(() => {
      const card = document.querySelector('.gen-card').getBoundingClientRect();
      const lbl = document.querySelector('#panel-random .ctrl-lbl').getBoundingClientRect();
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        cardLeft: card.left,
        cardRight: card.right,
        innerWidth: window.innerWidth,
        lblHeight: lbl.height,
      };
    });
    expect(metrics.overflowX).toBe(false);
    expect(metrics.cardLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.cardRight).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.lblHeight).toBeLessThan(32);
  }

  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
