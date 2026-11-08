import { request } from './api-client.js';
import { CANARY_PLAIN, b64, unb64, deriveKey, encryptWith, decryptWith } from './crypto.js';

// Remove obsolete credentials and exportable vault keys from older deployments.
sessionStorage.removeItem('ag_masterkey');
localStorage.removeItem('ag_supabase_cfg');
for (const storage of [localStorage, sessionStorage]) {
  for (const name of Object.keys(storage)) if (/^sb-.*-auth-token$/.test(name)) storage.removeItem(name);
}
const connState = document.getElementById('connState');
let masterKey = null, unlockedSalt = null, epoch = 0, copiedByApp = false;
const emptyState = () => ({ accounts:[],platforms:[],countries:[],vault:null,revision:0 });
function context() {
  if (!masterKey) throw new Error('请先解锁');
  return { key:masterKey,salt:unlockedSalt,revision:state.revision,epoch };
}
function stillCurrent(ctx) { return ctx.epoch === epoch && ctx.key === masterKey; }
async function api(path,method='GET',body) {
  try { return await request(path,method,body); }
  catch (error) {
    if (error.status === 401) { clearSensitive(); showLogin(); }
    if (error.status === 409) { lock(); }
    throw error;
  }
}
async function mutate(path,method,data,ctx=context()) {
  if (!stillCurrent(ctx)) throw new Error('操作已因锁定或退出取消');
  const result = await api(path,method,{ expectedRevision:ctx.revision,expectedSalt:ctx.salt,data });
  if (!stillCurrent(ctx)) throw new Error('操作已结束，请重新解锁查看结果');
  state.revision = result.revision;
  return result;
}
async function fetchMeta() { return (await api('/state')).vault; }
async function decryptPw(packed) { return decryptWith(masterKey,packed); }
async function unlock(password) {
  const operationEpoch = epoch;
  const snapshot = await api('/state');
  const meta = snapshot.vault;
  const salt = meta ? meta.salt : b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(password,unb64(salt));
  if (operationEpoch !== epoch) throw new Error('解锁已取消');
  if (meta) {
    try { if (await decryptWith(key,meta.canary) !== CANARY_PLAIN) throw new Error(); }
    catch { throw new Error('主密码错误'); }
  } else {
    if (password.length < 6) throw new Error('首次主密码至少 6 个字符');
    await api('/vault/init','POST',{ expectedRevision:snapshot.revision,expectedSalt:null,
      data:{ salt,canary:await encryptWith(key,CANARY_PLAIN) } });
  }
  if (operationEpoch !== epoch) throw new Error('解锁已取消');
  masterKey = key; unlockedSalt = salt;
}
function clearSensitive() {
  epoch++; masterKey = null; unlockedSalt = null; state = emptyState();
  closeDrawer(); sdrawer.classList.remove('open');
  document.getElementById('sdrawerBody').replaceChildren();
  document.getElementById('mpw').value = '';
  document.getElementById('loginPw').value = '';
  connState.textContent = '';
  clearTimeout(window._clipT);
  if (copiedByApp) navigator.clipboard?.writeText('').catch(()=>{});
  copiedByApp = false;
  render();
}
function lock() {
  clearSensitive();
  document.getElementById('lock').style.display = 'flex';
  updateLockUI();
  document.getElementById('mpw').focus();
}
async function updateLockUI() {
  document.getElementById('lockErr').textContent = '';
  try {
    const firstTime = !(await fetchMeta());
    document.getElementById('lockWarn').style.display = firstTime ? 'block' : 'none';
    document.getElementById('lockLead').textContent = firstTime
      ? '首次使用，设定至少 6 字符的主密码。密码和 2FA 密钥在本地加密。'
      : '输入主密码以解锁。';
  } catch (e) { document.getElementById('lockErr').textContent = e.message; }
}

const CAT_LABEL = { email: '📧 Email', apple: '🍎 Apple', ai: '🤖 AI 工具' };
const CAT_COLOR = { email: 'var(--cat-email)', apple: 'var(--cat-apple)', ai: 'var(--cat-ai)' };

// ============ 数据 ============
let state = emptyState();
const platformById = (id) => state.platforms.find(p => p.id === id);
const countryById = (id) => state.countries.find(c => c.id === id);
const accountById = (id) => state.accounts.find(a => a.id === id);

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
}
async function copyEphemeral(text, label, operationEpoch=epoch) {
  if (operationEpoch!==epoch || !masterKey) return;
  try {
    await navigator.clipboard.writeText(text);
    if (operationEpoch!==epoch) { await navigator.clipboard.writeText(''); return; }
    copiedByApp = true;
    toast(label + " 已复制(30s 后清空)");
    clearTimeout(window._clipT);
    window._clipT = setTimeout(() => navigator.clipboard.writeText("").catch(()=>{}), 30000);
  } catch { toast("复制失败,检查浏览器权限"); }
}

async function loadAll() {
  const ctx = context();
  connState.textContent = '加载中…';
  const snapshot = await api('/state');
  if (!stillCurrent(ctx)) return;
  if (snapshot.vault?.salt !== ctx.salt) { lock(); throw new Error('主密码已变更，请重新解锁'); }
  state = snapshot;
  connState.textContent = `已连接 · ${state.accounts.length} 账号`;
  render();
}

// ============ 渲染：三等分 ============
function esc(s){ return String(s ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch])); }

function countryTag(country_id) {
  const c = countryById(country_id);
  if (!c) return '';
  return `<span class="ctag" style="color:${esc(c.color)}">${esc(c.name)}</span>`;
}

// 登录用邮箱：email 类是自身 name；apple/ai 是其关联的注册邮箱
function emailOf(a) {
  if (a.category === 'email') return a.name;
  const e = a.register_email_id ? accountById(a.register_email_id) : null;
  return e ? e.name : null;
}

function render() {
  for (const cat of ['email', 'apple', 'ai']) {
    const list = state.accounts.filter(a => a.category === cat);
    const cnt = list.length ? `· ${list.length}` : '';
    document.getElementById('count-' + cat).textContent = cnt;
    document.getElementById('tab-count-' + cat).textContent = cnt;
    const box = document.getElementById('col-' + cat);
    if (!list.length) {
      box.innerHTML = `<div class="col-empty">暂无${CAT_LABEL[cat].replace(/^.\s/, '')}账号<br>点上方「+ 账号」添加</div>`;
      continue;
    }
    box.innerHTML = '';
    list.forEach(a => box.appendChild(renderCard(a)));
  }
}

function renderCard(a) {
  const plat = platformById(a.platform_id);
  const card = document.createElement('div');
  card.className = 'card';
  card.style.borderLeftColor = CAT_COLOR[a.category];

  let rel = '';
  if (a.register_email_id) {
    const e = accountById(a.register_email_id);
    rel += `<span style="color:var(--cat-email)">→ 注册</span> <span class="link" data-goto="${a.register_email_id}">${e ? esc(e.name) : '?'}</span><br>`;
  }
  if (a.subscribe_apple_id) {
    const ap = accountById(a.subscribe_apple_id);
    rel += `<span style="color:var(--cat-apple)">→ 订阅于</span> <span class="link" data-goto="${a.subscribe_apple_id}">${ap ? esc(ap.name) : '?'}</span><br>`;
  }

  const showCountryPhone2fa = a.category === 'email' || a.category === 'apple';

  card.innerHTML = `
    <div class="ctop">
      <div>
        <div class="plat">${esc(plat ? plat.name : '—')}</div>
        <div class="name">${esc(a.name)}</div>
      </div>
      <span class="edit" data-edit="${a.id}">编辑 ›</span>
    </div>
    ${showCountryPhone2fa ? countryTag(a.country_id) : ''}
    <div class="meta">
      ${showCountryPhone2fa && a.phone ? `<b>手机</b> ${esc(a.phone)} ${a.twofa_enabled ? '<span class="twofa-on">· 2FA✓</span>' : ''}<br>`
        : (showCountryPhone2fa && a.twofa_enabled ? '<span class="twofa-on">2FA✓</span><br>' : '')}
      ${a.recovery_email ? `<b>辅邮</b> ${esc(a.recovery_email)}<br>` : ''}
      ${a.encrypted_password ? '<span class="haspw"><b>密码</b> 已加密 ✓</span><br>' : '<span style="opacity:.6">无密码</span><br>'}
      ${a.encrypted_2fa ? '<span class="haspw"><b>2FA密钥</b> 已加密 ✓</span><br>' : ''}
      ${rel}
    </div>
    <div class="quick">
      <button class="mini" data-cp-email="${a.id}">复制邮箱</button>
      <button class="mini" data-cp-pass="${a.id}" ${a.encrypted_password ? '' : 'disabled'}>复制密码</button>
      ${a.encrypted_2fa ? `<button class="mini" data-cp-2fa="${a.id}">复制2FA</button>` : ''}
    </div>`;

  card.querySelector('[data-edit]').onclick = () => openForm(a);
  card.querySelectorAll('[data-goto]').forEach(el => el.onclick = () => {
    const t = accountById(el.dataset.goto); if (t) openForm(t);
  });
  card.querySelector('[data-cp-email]').onclick = () => {
    const email = emailOf(a);
    if (!email) return toast('无邮箱(未关联注册邮箱)');
    copyEphemeral(email, '邮箱');
  };
  card.querySelector('[data-cp-pass]').onclick = async () => {
    if (!a.encrypted_password) return toast('未设置密码');
    try { const ctx=context(); await copyEphemeral(await decryptWith(ctx.key,a.encrypted_password),'密码',ctx.epoch); }
    catch { toast('解密失败(主密码不一致?)'); }
  };
  const cp2fa = card.querySelector('[data-cp-2fa]');
  if (cp2fa) cp2fa.onclick = async () => {
    try { const ctx=context(); await copyEphemeral(await decryptWith(ctx.key,a.encrypted_2fa),'2FA密钥',ctx.epoch); }
    catch { toast('解密失败(主密码不一致?)'); }
  };
  return card;
}

// ============ 账号表单（drawer，动态字段） ============
const drawer = document.getElementById('drawer');
function closeDrawer() { drawer.classList.remove('open'); document.getElementById('drawerBody').replaceChildren(); }
document.getElementById('drawerClose').onclick = closeDrawer;

function platformOptions(selectedId) {
  const groups = { email: '📧 Email', apple: '🍎 Apple', ai: '🤖 AI 工具' };
  let html = '<option value="">— 选择平台 —</option>';
  for (const cat of ['email', 'apple', 'ai']) {
    const ps = state.platforms.filter(p => p.category === cat);
    if (!ps.length) continue;
    html += `<optgroup label="${groups[cat]}">`;
    for (const p of ps) html += `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`;
    html += '</optgroup>';
  }
  return html;
}
function countryOptions(selectedId) {
  let html = '<option value="">— 选择国家/地区 —</option>';
  for (const c of state.countries)
    html += `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`;
  return html;
}
function accountOptions(cat, selectedId) {
  let html = '<option value="">— 无 —</option>';
  for (const a of state.accounts.filter(x => x.category === cat))
    html += `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${esc(a.name)}</option>`;
  return html;
}

function openForm(a) {
  if (!masterKey) return;
  const formContext = context();
  const isNew = !a || !a.id;
  a = a || {};
  document.getElementById('drawerTitle').textContent = isNew ? '新增账号' : '编辑账号';
  const body = document.getElementById('drawerBody');
  body.innerHTML = `
    <label>平台 *</label>
    <select id="f-platform">${platformOptions(a.platform_id)}</select>
    <label>账号名 *</label>
    <input id="f-name" value="${esc(a.name || '')}" placeholder="账号显示名">

    <div class="field-email-apple">
      <label>绑定手机号</label>
      <input id="f-phone" value="${esc(a.phone || '')}" placeholder="+86 138 0000 0000">
      <label>国家 / 地区</label>
      <select id="f-country">${countryOptions(a.country_id)}</select>
      <label>辅助邮箱</label>
      <input id="f-recovery" value="${esc(a.recovery_email || '')}" placeholder="recovery@example.com">
      <div class="toggle-row">
        <input type="checkbox" id="f-2fa" ${a.twofa_enabled ? 'checked' : ''}>
        <label for="f-2fa">已开启 2FA 两步验证</label>
      </div>
      <label>2FA 密钥 / TOTP 种子（本地加密后存云）</label>
      <div class="pw-row">
        <input id="f-2fakey" type="password" placeholder="${a.encrypted_2fa ? '已加密 · 留空=清除' : '密钥串'}">
        <button class="mini ghost" id="f-2fakey-show" type="button">显示</button>
      </div>
    </div>

    <div class="field-register">
      <label>注册邮箱（关联 Email 账号）</label>
      <select id="f-register">${accountOptions('email', a.register_email_id)}</select>
    </div>

    <div class="field-subscribe">
      <label>订阅 Apple ID（通过哪个 Apple ID 订阅）</label>
      <select id="f-subscribe">${accountOptions('apple', a.subscribe_apple_id)}</select>
    </div>

    <label>密码（本地加密后存云）</label>
    <div class="pw-row">
      <input id="f-pw" type="password" placeholder="${a.encrypted_password ? '已加密 · 留空=清除' : '输入密码'}">
      <button class="mini ghost" id="f-pw-show" type="button">显示</button>
    </div>
    <div class="hint">明文密码,保存时用主密码加密,云端只存密文。</div>

    <label>备注（恢复邮箱 / 支付信息 / 杂项都写这）</label>
    <textarea id="f-note">${esc(a.note || '')}</textarea>

    <div class="btn-row">
      <button class="primary" id="f-save">保存</button>
      ${isNew ? '' : '<button class="ghost" id="f-del" style="color:var(--danger)">删除</button>'}
    </div>`;

  const platSel = body.querySelector('#f-platform');
  const applyCat = () => {
    const p = platformById(platSel.value);
    const cat = p ? p.category : null;
    body.querySelector('.field-email-apple').classList.toggle('hidden', !(cat === 'email' || cat === 'apple'));
    body.querySelector('.field-register').classList.toggle('hidden', !(cat === 'apple' || cat === 'ai'));
    body.querySelector('.field-subscribe').classList.toggle('hidden', cat !== 'ai');
  };
  platSel.onchange = applyCat;
  applyCat();

  // 已有密码 / 2FA 密钥:解密填入。_loaded 标记区分「已加载后清空(=清除)」与「解密失败的空(=保留)」
  const formId = crypto.randomUUID();
  body.querySelector('#f-pw').dataset.form=formId;
  body.querySelector('#f-2fakey').dataset.form=formId;
  a._pwLoaded = !a.encrypted_password;
  a._faLoaded = !a.encrypted_2fa;
  if (a.encrypted_password) {
    decryptWith(formContext.key,a.encrypted_password).then(pw => { const el=body.querySelector('#f-pw'); if (stillCurrent(formContext) && el && el.dataset.form === formId) { el.value=pw; a._pwLoaded=true; } })
      .catch(() => { const el=body.querySelector('#f-pw'); if (el && el.dataset.form === formId) el.placeholder='解密失败'; a._pwLoaded=false; });
  }
  if (a.encrypted_2fa) {
    decryptWith(formContext.key,a.encrypted_2fa).then(s => { const el=body.querySelector('#f-2fakey'); if (stillCurrent(formContext) && el && el.dataset.form === formId) { el.value=s; a._faLoaded=true; } })
      .catch(() => { a._faLoaded = false; });
  }
  const pwInput = body.querySelector('#f-pw');
  body.querySelector('#f-pw-show').onclick = () => { pwInput.type = pwInput.type === 'password' ? 'text' : 'password'; };
  const k2btn = body.querySelector('#f-2fakey-show');
  if (k2btn) k2btn.onclick = () => { const el = body.querySelector('#f-2fakey'); el.type = el.type === 'password' ? 'text' : 'password'; };

  body.querySelector('#f-save').onclick = () => saveAccount(a,isNew,formContext).catch(e=>toast(e.message));
  const del = body.querySelector('#f-del');
  if (del) del.onclick = async () => {
    if (!confirm(`删除账号「${a.name}」?`)) return;
    try { await mutate('/accounts/'+a.id,'DELETE',null,formContext); }
    catch(e) { return toast(e.message); }
    closeDrawer(); await loadAll(); toast('已删除');
  };

  drawer.classList.add('open');
}

async function saveAccount(a, isNew, ctx) {
  const body = document.getElementById('drawerBody');
  const platId = body.querySelector('#f-platform').value;
  const name = body.querySelector('#f-name').value.trim();
  if (!platId) return toast('请选择平台');
  if (!name) return toast('账号名必填');
  const cat = platformById(platId).category;

  const row = { category: cat, platform_id: platId, name, note: body.querySelector('#f-note').value.trim() || null };

  if (cat === 'email' || cat === 'apple') {
    row.phone = body.querySelector('#f-phone').value.trim() || null;
    row.country_id = body.querySelector('#f-country').value || null;
    row.twofa_enabled = body.querySelector('#f-2fa').checked;
    row.recovery_email = body.querySelector('#f-recovery').value.trim() || null;
  } else {
    row.phone = null; row.country_id = null; row.twofa_enabled = false; row.recovery_email = null;
  }
  row.register_email_id = (cat === 'apple' || cat === 'ai') ? (body.querySelector('#f-register').value || null) : null;
  row.subscribe_apple_id = (cat === 'ai') ? (body.querySelector('#f-subscribe').value || null) : null;

  // 框值即存值：填了=加密存；清空=清除(null)。解密失败(_loaded=false)的空则保留原密文，防误清
  const pwVal = body.querySelector('#f-pw').value;
  if (pwVal) row.encrypted_password = await encryptWith(ctx.key,pwVal);
  else row.encrypted_password = a._pwLoaded ? null : a.encrypted_password;

  // 2FA 密钥（email/apple 才有）
  if (cat === 'email' || cat === 'apple') {
    const k = body.querySelector('#f-2fakey').value;
    if (k) row.encrypted_2fa = await encryptWith(ctx.key,k);
    else row.encrypted_2fa = a._faLoaded ? null : a.encrypted_2fa;
  } else {
    row.encrypted_2fa = null;
  }

  await mutate(isNew ? '/accounts' : '/accounts/'+a.id,isNew ? 'POST' : 'PATCH',row,ctx);
  closeDrawer(); await loadAll(); toast(isNew ? '已新增' : '已保存');
}

// ============ 头部操作 ============
document.getElementById('add').onclick = () => openForm({});
document.getElementById('settings').onclick = openSettings;
document.getElementById('lockNow').onclick = lock;

// ---- 手机分类 tab 切换（纯展示层；桌面 tab 栏 display:none，三列照旧并排）----
const tabbar = document.getElementById('tabbar');
function setTab(cat) {
  document.querySelectorAll('main > .column').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
  tabbar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === cat));
}
tabbar.querySelectorAll('button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
setTab('email');

// ---- 主题 ----
const THEME_KEY = 'ag_theme';
function applyTheme() {
  const pref = localStorage.getItem(THEME_KEY) || 'system';
  document.documentElement.dataset.theme = pref === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
}
function setTheme(pref) { localStorage.setItem(THEME_KEY, pref); applyTheme(); renderSettings(); }
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if ((localStorage.getItem(THEME_KEY) || 'system') === 'system') applyTheme();
});

// ---- 设置页（主题 + 平台 + 国家管理）----
const sdrawer = document.getElementById('sdrawer');
function openSettings() { renderSettings(); sdrawer.classList.add('open'); }
document.getElementById('sdrawerClose').onclick = () => sdrawer.classList.remove('open');

const platInUse = (id) => state.accounts.some(a => a.platform_id === id);
const ctryInUse = (id) => state.accounts.some(a => a.country_id === id);

function renderSettings() {
  const pref = localStorage.getItem(THEME_KEY) || 'system';
  const catLabel = { email: 'Email', apple: 'Apple', ai: 'AI' };
  let html = `
    <div class="mobile-only">
      <label>快捷操作</label>
      <div class="seg">
        <button id="mLock" class="ghost">🔒 锁定</button>
        <button id="mExport" class="ghost">⬇ 导出</button>
        <button id="mLogout" class="ghost">退出登录</button>
      </div>
    </div>
    <label>外观主题</label>
    <div class="seg">
      <button data-theme-set="light" class="${pref==='light'?'active':''}">亮色</button>
      <button data-theme-set="dark" class="${pref==='dark'?'active':''}">暗色</button>
      <button data-theme-set="system" class="${pref==='system'?'active':''}">跟随系统</button>
    </div>
    <label>平台管理</label>`;
  for (const p of state.platforms)
    html += `<div class="mrow"><span class="mname">${esc(p.name)}</span>
      <span class="mcat">${catLabel[p.category] || p.category}</span>
      <button class="mini ghost" data-del-plat="${p.id}">删</button></div>`;
  html += `<div class="add-row">
      <select id="newPlatCat" style="flex:none;width:84px">
        <option value="email">Email</option><option value="apple">Apple</option><option value="ai">AI</option>
      </select>
      <input id="newPlatName" placeholder="平台名" style="flex:1">
      <button class="mini" id="addPlat" style="flex:none">+ 加</button>
    </div>
    <label>国家 / 地区管理</label>`;
  for (const c of state.countries)
    html += `<div class="mrow"><span class="swatch2" style="background:${esc(c.color)}"></span>
      <span class="mname">${esc(c.name)}</span>
      <button class="mini ghost" data-del-ctry="${c.id}">删</button></div>`;
  html += `<div class="add-row">
      <input type="color" id="newCtryColor" value="#5b8fb0">
      <input id="newCtryName" placeholder="国家/地区名" style="flex:1">
      <button class="mini" id="addCtry" style="flex:none">+ 加</button>
    </div>
    <label>更改主密码</label>
    <input type="password" id="curMpw" placeholder="当前主密码（验证身份）">
    <input type="password" id="newMpw1" placeholder="新主密码" style="margin-top:6px">
    <input type="password" id="newMpw2" placeholder="再次输入新主密码" style="margin-top:6px">
    <div class="btn-row"><button id="changeMpw">更改并重新加密全部</button></div>
    <div class="hint">会用新密码重新加密所有条目（事务原子，失败不损坏）。建议先「导出」备份。</div>
    <label>批量导入（粘贴 JSON）</label>
    <textarea id="importJson" placeholder='[{"platform":"Gmail","name":"x@gmail.com","password":"...","recovery_email":"...","twofa_secret":"...","phone":"...","twofa_enabled":true}]' style="min-height:90px"></textarea>
    <div class="btn-row"><button id="importBtn">解析并导入</button></div>
    <div class="hint" id="importMsg">password 和 2FA 密钥在本地加密后入库。platform 必须是已有平台名。</div>
    <div class="hint">密码与 2FA 密钥已加密；账号名称、联系方式和备注作为元数据保存。</div>`;

  const body = document.getElementById('sdrawerBody');
  body.innerHTML = html;
  // 手机快捷操作（复用 header 同款 handler，无逻辑复制）
  body.querySelector('#mLock').onclick = () => { sdrawer.classList.remove('open'); lock(); };
  body.querySelector('#mExport').onclick = doExport;
  body.querySelector('#mLogout').onclick = doLogout;
  body.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => setTheme(b.dataset.themeSet));
  body.querySelectorAll('[data-del-plat]').forEach(b => b.onclick = () => delPlatform(b.dataset.delPlat));
  body.querySelectorAll('[data-del-ctry]').forEach(b => b.onclick = () => delCountry(b.dataset.delCtry));
  body.querySelector('#addPlat').onclick = addPlatform;
  body.querySelector('#addCtry').onclick = addCountry;
  body.querySelector('#changeMpw').onclick = () => doChangeMasterPassword().catch(e=>toast(e.message));
  body.querySelector('#importBtn').onclick = doBatchImport;
}

async function addPlatform() {
  const cat = document.getElementById('newPlatCat').value;
  const name = document.getElementById('newPlatName').value.trim();
  if (!name) return toast('平台名必填');
  const sort = Math.max(0, ...state.platforms.map(p => p.sort)) + 1;
  try { await mutate('/platforms','POST',{ category:cat,name,sort }); } catch(e) { return toast(e.message); }
  await loadAll(); renderSettings(); toast('平台已添加');
}
async function delPlatform(id) {
  if (platInUse(id)) return toast('有账号在用此平台，不能删');
  try { await mutate('/platforms/'+id,'DELETE',null); } catch(e) { return toast(e.message); }
  await loadAll(); renderSettings(); toast('平台已删除');
}
async function addCountry() {
  const name = document.getElementById('newCtryName').value.trim();
  const color = document.getElementById('newCtryColor').value;
  if (!name) return toast('国家名必填');
  const sort = Math.max(0, ...state.countries.map(c => c.sort)) + 1;
  try { await mutate('/countries','POST',{ name,color,sort }); } catch(e) { return toast(e.message); }
  await loadAll(); renderSettings(); toast('国家已添加');
}
async function delCountry(id) {
  if (ctryInUse(id)) return toast('有账号在用此国家，不能删');
  try { await mutate('/countries/'+id,'DELETE',null); } catch(e) { return toast(e.message); }
  await loadAll(); renderSettings(); toast('国家已删除');
}

// ---- 更改主密码（全量重加密，RPC 事务原子）----
async function verifyMasterPassword(pw) {
  const meta = await fetchMeta();
  if (!meta) return false;
  try {
    const key = await deriveKey(pw, unb64(meta.salt));
    return (await decryptWith(key, meta.canary)) === CANARY_PLAIN;
  } catch { return false; }
}
async function doChangeMasterPassword() {
  const cur = document.getElementById('curMpw').value;
  const p1 = document.getElementById('newMpw1').value;
  const p2 = document.getElementById('newMpw2').value;
  if (!cur) return toast('请输入当前主密码');
  if (!p1) return toast('新密码不能为空');
  if (p1 !== p2) return toast('两次新密码不一致');
  if (!(await verifyMasterPassword(cur))) return toast('当前主密码错误');
  if (!confirm('将用新主密码重新加密所有密码。建议已先导出备份。继续？')) return;
  const btn = document.getElementById('changeMpw');
  btn.disabled = true; btn.textContent = '重新加密中…';
  try {
    await changeMasterPassword(p1);
    toast('主密码已更改');
    sdrawer.classList.remove('open');
  } catch (e) {
    toast('更改未完成，请重新解锁确认: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = '更改并重新加密全部';
  }
}
async function changeMasterPassword(newPw) {
  if (newPw.length < 6) throw new Error('新主密码至少 6 个字符');
  const ctx = context();
  const rows = state.accounts.filter(a => a.encrypted_password || a.encrypted_2fa);
  const newSalt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const newKey = await deriveKey(newPw,unb64(newSalt));
  const updates = [];
  for (const a of rows) {
    const update = { id:a.id };
    if (a.encrypted_password) update.ct = await encryptWith(newKey,await decryptWith(ctx.key,a.encrypted_password));
    if (a.encrypted_2fa) update.fa = await encryptWith(newKey,await decryptWith(ctx.key,a.encrypted_2fa));
    updates.push(update);
  }
  await mutate('/vault/rotate','POST',{ salt:newSalt,canary:await encryptWith(newKey,CANARY_PLAIN),updates },ctx);
  masterKey = newKey; unlockedSalt = newSalt; epoch++;
  document.getElementById('sdrawerBody').replaceChildren();
  await loadAll();
}

// ---- 批量导入（客户端加密 password + 2FA 密钥）----
async function doBatchImport() {
  const ctx = context();
  const input = document.getElementById('importJson');
  const msg = document.getElementById('importMsg');
  const btn = document.getElementById('importBtn');
  btn.disabled = true;
  try {
    const items = JSON.parse(input.value);
    if (!Array.isArray(items) || !items.length || items.length > 1000) throw new Error('请提供 1–1000 条账号');
    const rows = [];
    for (const item of items) {
      const plat = state.platforms.find(p => p.name === item.platform);
      if (!plat) throw new Error('平台不存在: '+item.platform);
      const country = item.country ? state.countries.find(c => c.name === item.country) : null;
      if (item.country && !country) throw new Error('国家/地区不存在: '+item.country);
      rows.push({ category:plat.category,platform_id:plat.id,name:item.name,
        phone:item.phone || null,twofa_enabled:!!item.twofa_enabled,recovery_email:item.recovery_email || null,
        country_id:country?.id || null,note:item.note || null,
        encrypted_password:item.password ? await encryptWith(ctx.key,item.password) : null,
        encrypted_2fa:item.twofa_secret ? await encryptWith(ctx.key,item.twofa_secret) : null });
    }
    await mutate('/accounts/import','POST',rows,ctx);
    input.value=''; msg.textContent=`已导入 ${rows.length} 条`; await loadAll();
    toast(`已导入 ${rows.length} 条`);
  } catch(e) { msg.textContent='导入未完成: '+e.message; toast(e.message); }
  finally { btn.disabled=false; }
}
function doExport() {
  const blob = new Blob([JSON.stringify({ format:'account-graph-v1',...state },null,2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a'); el.href = url; el.download = 'account-graph-backup.json'; el.click();
  URL.revokeObjectURL(url); toast('已导出(含密文)');
}
document.getElementById('export').onclick = doExport;
// ============ 启动 ============
const unlockBtn = document.getElementById('unlockBtn');
const mpwInput = document.getElementById('mpw');
async function doUnlock() {
  const pw = mpwInput.value; if (!pw) return;
  unlockBtn.disabled = true; unlockBtn.textContent = '派生密钥中…';
  document.getElementById('lockErr').textContent = '';
  try {
    await unlock(pw);
    mpwInput.value = '';
    document.getElementById('lock').style.display = 'none';
    await loadAll();
  } catch (e) { document.getElementById('lockErr').textContent = e.message || '解锁失败'; }
  finally { unlockBtn.disabled = false; unlockBtn.textContent = '解锁'; }
}
unlockBtn.onclick = doUnlock;
mpwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });

// 服务端登录与主密码解锁是两个独立门禁。
async function enterMasterPasswordGate() {
  clearSensitive();
  document.getElementById('login').style.display = 'none';
  document.getElementById('lock').style.display = 'flex';
  await updateLockUI();
  document.getElementById('mpw').focus();
}
function showLogin() {
  document.getElementById('lock').style.display = 'none';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('loginEmail').focus();
}
const loginBtn = document.getElementById('loginBtn');
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPw').value;
  if (!email || !pw) return;
  loginBtn.disabled = true; loginBtn.textContent = '登录中…';
  document.getElementById('loginErr').textContent = '';
  try {
    await request('/login','POST',{ email,password:pw });
    document.getElementById('loginPw').value='';
    await enterMasterPasswordGate();
  } catch(e) { document.getElementById('loginErr').textContent=e.message; }
  finally { loginBtn.disabled=false; loginBtn.textContent='登录'; }

}
loginBtn.onclick = doLogin;
document.getElementById('loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
async function doLogout() {
  clearSensitive(); showLogin();
  try { await request('/logout','POST',{}); }
  catch(e) { document.getElementById('loginErr').textContent='退出请求失败，请重试: '+e.message; }
}
document.getElementById('logout').onclick = doLogout;
(async () => {
  try {
    if (!(await prepareWorker())) return;
    const session = await request('/session');
    if (session.authenticated) await enterMasterPasswordGate(); else showLogin();
  } catch(e) { showLogin(); document.getElementById('loginErr').textContent=e.message; }
})();
async function prepareWorker() {
  if (!('serviceWorker' in navigator)) return true;
  const controller=navigator.serviceWorker.controller;
  if (controller) {
    const version=await new Promise(resolve=>{
      const channel=new MessageChannel();
      const timer=setTimeout(()=>{ channel.port1.close(); resolve(null); },1200);
      channel.port1.onmessage=event=>{ clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      controller.postMessage('version',[channel.port2]);
    });
    if (version!=='ag-shell-v2-self-hosted') {
      const registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration=>registration.unregister()));
      await Promise.all((await caches.keys()).filter(name=>name.startsWith('ag-shell-')).map(name=>caches.delete(name)));
      location.reload();
      return false;
    }
  }
  await navigator.serviceWorker.register('/sw.js');
  return true;
}
