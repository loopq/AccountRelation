import { test,expect } from '@playwright/test';
const admin='Test-browser-admin-4792!',master='731942',nextMaster='856137';
async function login(page) {
  await page.goto('/');
  await page.locator('#loginEmail').fill('admin@example.test');await page.locator('#loginPw').fill(admin);await page.locator('#loginBtn').click();
  await expect(page.locator('#lock')).toBeVisible();
}
async function unlock(page,pw) {await page.locator('#mpw').fill(pw);await page.locator('#unlockBtn').click();await expect(page.locator('#lock')).toBeHidden();}

test('full user workflow and no plaintext in API/storage; desktop and mobile',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const bodies=[];page.on('request',r=>{if(r.url().includes('/api/') && !r.url().endsWith('/login')) bodies.push(r.postData() || '');});
  page.on('dialog',dialog=>dialog.accept());
  await login(page);
  await page.locator('#mpw').fill('73194');await page.locator('#unlockBtn').click();
  await expect(page.locator('#lockErr')).toHaveText('首次主密码至少 6 个字符');
  expect(await page.evaluate(async()=>(await(await fetch('/api/state')).json()).vault)).toBeNull();
  await unlock(page,master);
  await page.locator('#add').click();
  await page.locator('#f-platform').selectOption({label:'Gmail'});
  await page.locator('#f-name').fill('<img src=x onerror=alert(1)>@example.test');
  await page.locator('#f-pw').fill('fake-account-secret-111');await page.locator('#f-2fakey').fill('fake-totp-seed-222');
  await page.locator('#f-note').fill('</textarea><script>alert(1)</script>');await page.locator('#f-save').click();
  await expect(page.locator('#drawer')).not.toHaveClass(/open/);
  await expect(page.locator('.card')).toHaveCount(1);await expect(page.locator('.card img')).toHaveCount(0);
  await page.locator('[data-edit]').click();await expect(page.locator('#f-pw')).toHaveValue('fake-account-secret-111');
  await page.locator('#lockNow').evaluate(button=>button.click());await expect(page.locator('#lock')).toBeVisible();await expect(page.locator('#drawerBody')).toBeEmpty();
  await expect(page.locator('.card')).toHaveCount(0);
  await page.locator('#mpw').fill('wrong password');await page.locator('#unlockBtn').click();await expect(page.locator('#lockErr')).toHaveText('主密码错误');
  await unlock(page,master);
  await page.reload();await expect(page.locator('#lock')).toBeVisible();await unlock(page,master);
  const storage=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
  expect(JSON.stringify(storage)).not.toMatch(/ag_masterkey|fake-account-secret|fake-totp-seed/);
  await page.locator('#settings').click();
  await page.locator('[data-theme-set="light"]').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
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
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('account-graph-backup.json');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-tab="ai"]').click();await expect(page.locator('#col-ai .card')).toHaveCount(1);
  await page.screenshot({path:'docs/agents/account-relation-mobile-verification.png'});
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
