import { request } from './api-client.js';
import { CANARY_PLAIN, b64, unb64, deriveKey, deriveRaw, importVaultKey, prfWrapKey, encryptWith, decryptWith } from './crypto.js';

// Remove obsolete credentials and exportable vault keys from older deployments.
sessionStorage.removeItem('ag_masterkey');
localStorage.removeItem('ag_supabase_cfg');
for (const storage of [localStorage, sessionStorage]) {
  for (const name of Object.keys(storage)) if (/^sb-.*-auth-token$/.test(name)) storage.removeItem(name);
}
const connState = document.getElementById('connState');
let masterKey = null, unlockedSalt = null, epoch = 0, copiedByApp = false;
const emptyState = () => ({ accounts:[],platforms:[],countries:[],devices:[],vault:null,revision:0 });
const DEVICE_CAP = 5;
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
/** Face ID：PRF 输出解开服务端存的包裹 key，再用 canary 确认 */
async function unlockWithPrf(prf,wrappedKey) {
  if (!prf) throw new Error('没有 PRF 输出');
  const operationEpoch = epoch;
  const meta = (await api('/state')).vault;
  const key = await importVaultKey(unb64(await decryptWith(await prfWrapKey(prf),wrappedKey)));
  if (!meta || await decryptWith(key,meta.canary) !== CANARY_PLAIN) throw new Error('canary 不符');
  if (operationEpoch !== epoch) throw new Error('解锁已取消');
  masterKey = key; unlockedSalt = meta.salt;
}
function clearSensitive() {
  epoch++; masterKey = null; unlockedSalt = null; state = emptyState(); enrolling = null;
  const peek = document.getElementById('peek');
  peek.togglePopover?.(false);
  peek.replaceChildren();
  closeDrawer(); sdrawer.classList.remove('open');
  document.getElementById('sdrawerBody').replaceChildren();
  document.getElementById('mpw').value = '';
  document.getElementById('loginPw').value = '';
  qInput.value = ''; query = '';
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
  preparePasskey();
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

const CAT_LABEL = { email: 'Email', apple: 'Apple', ai: 'AI 工具' };
const CAT_COLOR = { email: 'var(--cat-email)', apple: 'var(--cat-apple)', ai: 'var(--cat-ai)' };
const CAT_ICON = { email: 'i-mail', apple: 'i-id', ai: 'i-spark' };
const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#${name}"/></svg>`;

// ============ 数据 ============
let state = emptyState();
const platformById = (id) => state.platforms.find(p => p.id === id);
const countryById = (id) => state.countries.find(c => c.id === id);
const accountById = (id) => state.accounts.find(a => a.id === id);
const deviceById = (id) => state.devices.find(d => d.id === id);
const deviceCount = (id) => state.accounts.filter(a => a.device_ids?.includes(id)).length;
const devInUse = (id) => state.accounts.some(a => a.device_ids?.includes(id));

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
    toast(`已复制${label} · 30 秒后清空剪贴板`);
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
  return `<span class="chip" style="--cc:${esc(c.color)}">${esc(c.name)}</span>`;
}

// 登录用邮箱：email 类是自身 name；apple/ai 是其关联的注册邮箱
function emailOf(a) {
  if (a.category === 'email') return a.name;
  const e = a.register_email_id ? accountById(a.register_email_id) : null;
  return e ? e.name : null;
}

let devFilter = '';
function matchDevFilter(a) {
  if (!devFilter) return true;
  const ids = a.device_ids || [];
  if (devFilter === '__none') return ids.length === 0;
  return ids.includes(devFilter);
}
function devFilterBar() {
  const bar = document.createElement('div');
  bar.className = 'dev-filter';
  const opt = (v, label) => `<option value="${esc(v)}" ${devFilter === v ? 'selected' : ''}>${label}</option>`;
  const devOpts = state.devices.map(d => {
    const n = deviceCount(d.id);
    return opt(d.id, `${esc(d.name)}（${n}/${DEVICE_CAP}）${n > DEVICE_CAP ? ' ⚠' : ''}`);
  }).join('');
  bar.innerHTML = `<select aria-label="按设备筛选">${opt('', '全部设备')}${opt('__none', '未登录任何设备')}${devOpts}</select>`;
  bar.querySelector('select').onchange = (e) => { devFilter = e.target.value; render(); };
  return bar;
}

// 搜索：按名称 / 平台 / 手机 / 辅邮 / 备注过滤三列，与设备筛选叠加
const qInput = document.getElementById('q');
let query = '';
qInput.oninput = () => { query = qInput.value.trim().toLowerCase(); render(); };
qInput.onkeydown = (e) => { if (e.key === 'Escape' && qInput.value) { qInput.value = ''; qInput.oninput(); } };
document.addEventListener('keydown', e => {
  if (e.key === '/' && masterKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); qInput.focus(); }
});
function matchQuery(a) {
  if (!query) return true;
  const plat = platformById(a.platform_id);
  return [a.name, plat?.name, a.phone, a.recovery_email, a.note].some(v => v && v.toLowerCase().includes(query));
}

function render() {
  if (devFilter && devFilter !== '__none' && !deviceById(devFilter)) devFilter = '';
  for (const cat of ['email', 'apple', 'ai']) {
    const all = state.accounts.filter(a => a.category === cat);
    const list = (cat === 'email' ? all.filter(matchDevFilter) : all).filter(matchQuery);
    const cnt = list.length || '';
    document.getElementById('count-' + cat).textContent = cnt;
    document.getElementById('tab-count-' + cat).textContent = cnt;
    const box = document.getElementById('col-' + cat);
    if (!all.length) {
      box.innerHTML = `<div class="col-empty">${icon(CAT_ICON[cat])}暂无 ${CAT_LABEL[cat]} 账号<br>点右上角「+ 账号」添加</div>`;
      continue;
    }
    box.innerHTML = '';
    if (cat === 'email' && state.devices.length) {
      box.appendChild(devFilterBar());
    }
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'col-empty';
      empty.textContent = '该筛选下暂无账号';
      box.appendChild(empty);
      continue;
    }
    list.forEach(a => box.appendChild(renderCard(a)));
  }
}

function renderCard(a) {
  const plat = platformById(a.platform_id);
  const card = document.createElement('article');
  card.className = 'card';

  const showCountryPhone2fa = a.category === 'email' || a.category === 'apple';
  const chips = [];
  if (showCountryPhone2fa) {
    chips.push(countryTag(a.country_id));
    if (a.twofa_enabled) chips.push(`<span class="chip ok">${icon('i-check')}2FA</span>`);
  }
  // 键值行：[标签, HTML]
  const rows = [];
  if (showCountryPhone2fa && a.phone) rows.push(['手机', `<span class="mono">${esc(a.phone)}</span>`]);
  if (a.category === 'email') {
    // 按设置里的设备顺序显示（device_ids 本身按 id 排序）
    const devNames = state.devices.filter(d => a.device_ids?.includes(d.id))
      .map(d => `<span class="${deviceCount(d.id) > DEVICE_CAP ? 'over' : ''}">${esc(d.name)}</span>`).join(', ');
    if (devNames) rows.push(['设备', devNames]);
  }
  if (a.recovery_email) rows.push(['辅邮', `<span class="mono">${esc(a.recovery_email)}</span>`]);
  if (a.register_email_id) {
    const e = accountById(a.register_email_id);
    rows.push(['注册', `<span class="link mono" data-goto="${a.register_email_id}">${e ? esc(e.name) : '?'}</span>`]);
  }
  if (a.subscribe_apple_id) {
    const ap = accountById(a.subscribe_apple_id);
    rows.push(['订阅', `<span class="link mono" data-goto="${a.subscribe_apple_id}">${ap ? esc(ap.name) : '?'}</span>`]);
  }

  card.innerHTML = `
    <div class="c-head">
      <span class="plat">${esc(plat ? plat.name : '—')}</span>
      <button type="button" class="edit" data-edit="${a.id}">编辑${icon('i-chev')}</button>
    </div>
    <div class="c-name">
      <span class="mono">${esc(a.name)}</span>
      <button type="button" class="peek-btn" aria-label="预览概况" title="预览概况">${icon('i-eye')}</button>
    </div>
    <div class="chips">${chips.join('')}</div>
    <dl class="meta">${rows.map(([k, v]) => `<dt>${k}</dt> <dd>${v}</dd>`).join('')}</dl>
    <div class="quick">
      <button class="mini" data-cp-email="${a.id}">复制邮箱</button>
      <button class="mini" data-cp-pass="${a.id}" ${a.encrypted_password ? '' : 'disabled title="未设置密码"'}>复制密码</button>
      ${a.encrypted_2fa ? `<button class="mini" data-cp-2fa="${a.id}">复制 2FA</button>` : ''}
    </div>`;

  card.querySelector('[data-edit]').onclick = () => openForm(a);
  const peek = document.getElementById('peek');
  card.querySelector('.peek-btn').onclick = () => {
    fillPeek(a);
    peek.togglePopover?.(true);
  };
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

function fillPeek(a) {
  const plat = platformById(a.platform_id);
  const platName = plat ? plat.name : '—';
  const inbound = state.accounts.filter(x => x.register_email_id === a.id || x.subscribe_apple_id === a.id);
  let relHtml = '';
  if (inbound.length) {
    relHtml = `<div class="peek-sec"><div class="peek-lbl">关联到它的账号</div>`;
    for (const x of inbound) {
      const tag = CAT_LABEL[x.category] || x.category;
      const relTypes = [];
      if (x.register_email_id === a.id) relTypes.push('注册');
      if (x.subscribe_apple_id === a.id) relTypes.push('订阅');
      relHtml += `<div class="peek-rel-item"><span class="plat" style="--c:${CAT_COLOR[x.category]}">${esc(tag)}</span><span class="mono">${esc(x.name)}</span><span class="how">${esc(relTypes.join(' · '))}</span></div>`;
    }
    relHtml += `</div>`;
  }
  const cTime = a.created_at ? new Date(a.created_at).toLocaleString('zh-CN', { hour12: false }) : '—';
  const uTime = a.updated_at ? new Date(a.updated_at).toLocaleString('zh-CN', { hour12: false }) : '—';
  const noteHtml = a.note ? `<div class="peek-note">${esc(a.note)}</div>` : `<div class="peek-note peek-empty">无备注</div>`;
  const peekEl = document.getElementById('peek');
  peekEl.innerHTML = `
    <div class="peek-head" style="--c:${CAT_COLOR[a.category]}">
      <div class="peek-plat">${esc(platName)}</div>
      <div class="peek-name">${esc(a.name)}</div>
    </div>
    <div class="peek-sec">
      <div class="peek-lbl">备注</div>
      ${noteHtml}
    </div>
    ${relHtml}
    <div class="peek-sec">
      <div class="peek-time">创建时间：${esc(cTime)}</div>
      <div class="peek-time">更新时间：${esc(uTime)}</div>
    </div>`;
}

// ============ 账号表单（drawer，动态字段） ============
const drawer = document.getElementById('drawer');
function closeDrawer() { drawer.classList.remove('open'); document.getElementById('drawerBody').replaceChildren(); }
document.getElementById('drawerClose').onclick = closeDrawer;
// 遮罩点击 / Escape 关闭两个抽屉（popover 的 Escape 由浏览器原生处理）
function closeAll() { closeDrawer(); sdrawer.classList.remove('open'); }
document.getElementById('scrim').onclick = closeAll;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

function platformOptions(selectedId) {
  let html = '<option value="">— 选择平台 —</option>';
  for (const cat of ['email', 'apple', 'ai']) {
    const ps = state.platforms.filter(p => p.category === cat);
    if (!ps.length) continue;
    html += `<optgroup label="${CAT_LABEL[cat]}">`;
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
  const curDevIds = a.device_ids || [];
  const devOptionsHtml = state.devices.length ? state.devices.map(d => {
    const cnt = deviceCount(d.id);
    const checked = curDevIds.includes(d.id) ? 'checked' : '';
    return `<label><input type="checkbox" value="${esc(d.id)}" ${checked}> ${esc(d.name)} <span class="${cnt > DEVICE_CAP ? 'over' : ''}">${cnt}/${DEVICE_CAP}</span></label>`;
  }).join('') : '<div class="hint">先在「设置 → 设备」添加设备</div>';

  const body = document.getElementById('drawerBody');
  body.innerHTML = `
    <div class="group">
      <div class="group-title">基本</div>
      <label for="f-platform">平台 *</label>
      <select id="f-platform">${platformOptions(a.platform_id)}</select>
      <label for="f-name">账号名 *</label>
      <input id="f-name" class="mono" value="${esc(a.name || '')}" placeholder="邮箱地址或显示名" spellcheck="false">
    </div>

    <div class="group field-devices">
      <div class="group-title">登录设备</div>
      <div class="dev-list">
        ${devOptionsHtml}
      </div>
    </div>

    <div class="group">
      <div class="group-title">安全</div>
      <label for="f-pw">密码</label>
      <div class="pw-row">
        <input id="f-pw" type="password" placeholder="${a.encrypted_password ? '已加密 · 留空 = 清除' : '输入密码'}">
        <button class="mini ghost" id="f-pw-show" type="button">显示</button>
      </div>
      <div class="hint">保存时用主密码在浏览器加密，服务器只存密文。</div>
      <div class="field-email-apple">
        <label for="f-phone">绑定手机号</label>
        <input id="f-phone" class="mono" value="${esc(a.phone || '')}" placeholder="+86 138 0000 0000">
        <label for="f-country">国家 / 地区</label>
        <select id="f-country">${countryOptions(a.country_id)}</select>
        <label for="f-recovery">辅助邮箱</label>
        <input id="f-recovery" class="mono" value="${esc(a.recovery_email || '')}" placeholder="recovery@example.com" spellcheck="false">
        <div class="toggle-row">
          <input type="checkbox" id="f-2fa" ${a.twofa_enabled ? 'checked' : ''}>
          <label for="f-2fa">已开启 2FA 两步验证</label>
        </div>
        <label for="f-2fakey">2FA 密钥 / TOTP 种子</label>
        <div class="pw-row">
          <input id="f-2fakey" type="password" placeholder="${a.encrypted_2fa ? '已加密 · 留空 = 清除' : '密钥串'}">
          <button class="mini ghost" id="f-2fakey-show" type="button">显示</button>
        </div>
      </div>
    </div>

    <div class="group field-register">
      <div class="group-title">关联</div>
      <label for="f-register">注册邮箱</label>
      <select id="f-register">${accountOptions('email', a.register_email_id)}</select>
      <div class="field-subscribe">
        <label for="f-subscribe">订阅所用的 Apple ID</label>
        <select id="f-subscribe">${accountOptions('apple', a.subscribe_apple_id)}</select>
      </div>
    </div>

    <div class="group">
      <div class="group-title">备注</div>
      <textarea id="f-note" placeholder="恢复邮箱、支付信息、杂项都写这">${esc(a.note || '')}</textarea>
    </div>

    <div class="btn-row">
      <button class="primary" id="f-save">保存</button>
      ${isNew ? '' : '<button class="ghost danger" id="f-del">删除</button>'}
    </div>`;

  const platSel = body.querySelector('#f-platform');
  const applyCat = () => {
    const p = platformById(platSel.value);
    const cat = p ? p.category : null;
    body.querySelector('.field-devices').classList.toggle('hidden', cat !== 'email');
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

  const devIds = cat === 'email'
    ? Array.from(body.querySelectorAll('.field-devices input[type=checkbox]:checked')).map(cb => cb.value)
    : [];
  const oldDevIds = a.device_ids || [];
  const overList = [];
  for (const did of devIds) {
    if (!oldDevIds.includes(did)) {
      const cnt = deviceCount(did);
      if (cnt + 1 > DEVICE_CAP) {
        const d = deviceById(did);
        overList.push(`${d ? d.name : did}(${cnt + 1}/${DEVICE_CAP})`);
      }
    }
  }
  if (overList.length > 0) {
    if (!confirm(`以下设备登录账号数将超过上限：\n${overList.join('、')}\n是否仍要保存？`)) return;
  }
  row.device_ids = devIds;

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
    <div class="mobile-only quick-actions">
      <div class="seg">
        <button id="mLock" class="ghost">${icon('i-lock')}锁定</button>
        <button id="mExport" class="ghost">${icon('i-download')}导出</button>
        <button id="mLogout" class="ghost">${icon('i-logout')}退出</button>
      </div>
    </div>
    <div class="group">
      <div class="group-title">外观</div>
      <div class="seg">
        <button data-theme-set="light" class="${pref==='light'?'active':''}">亮色</button>
        <button data-theme-set="dark" class="${pref==='dark'?'active':''}">暗色</button>
        <button data-theme-set="system" class="${pref==='system'?'active':''}">跟随系统</button>
      </div>
    </div>
    <div class="group">
      <div class="group-title">平台</div>`;
  for (const p of state.platforms)
    html += `<div class="mrow"><span class="mname">${esc(p.name)}</span>
      <span class="mcat">${catLabel[p.category] || p.category}</span>
      <button class="mini ghost" data-del-plat="${p.id}" aria-label="删除平台">删除</button></div>`;
  html += `<div class="add-row">
      <select id="newPlatCat" style="flex:none;width:96px">
        <option value="email">Email</option><option value="apple">Apple</option><option value="ai">AI</option>
      </select>
      <input id="newPlatName" placeholder="平台名" style="flex:1">
      <button class="mini" id="addPlat" style="flex:none">添加</button>
    </div>
    </div>
    <div class="group">
      <div class="group-title">国家 / 地区</div>`;
  for (const c of state.countries)
    html += `<div class="mrow"><span class="swatch2" style="background:${esc(c.color)}"></span>
      <span class="mname">${esc(c.name)}</span>
      <button class="mini ghost" data-del-ctry="${c.id}" aria-label="删除国家/地区">删除</button></div>`;
  html += `<div class="add-row">
      <input type="color" id="newCtryColor" value="#5b8fb0" aria-label="颜色">
      <input id="newCtryName" placeholder="国家 / 地区名" style="flex:1">
      <button class="mini" id="addCtry" style="flex:none">添加</button>
    </div>
    </div>
    <div class="group">
      <div class="group-title">设备 <span class="group-sub">每台软上限 ${DEVICE_CAP} 个 Email</span></div>`;
  for (const d of state.devices) {
    const cnt = deviceCount(d.id);
    html += `<div class="mrow"><span class="mname">${esc(d.name)} · <span class="${cnt > DEVICE_CAP ? 'over' : ''}">${cnt}/${DEVICE_CAP}</span></span>
      <button class="mini ghost" data-del-dev="${d.id}" aria-label="删除设备">删除</button></div>`;
  }
  html += `<div class="add-row">
      <input id="newDevName" placeholder="设备名" style="flex:1">
      <button class="mini" id="addDev" style="flex:none">添加</button>
    </div>
    </div>
    <div class="group">
      <div class="group-title">更改主密码</div>
      <input type="password" id="curMpw" placeholder="当前主密码（验证身份）" autocomplete="off">
      <input type="password" id="newMpw1" placeholder="新主密码" style="margin-top:6px" autocomplete="new-password">
      <input type="password" id="newMpw2" placeholder="再次输入新主密码" style="margin-top:6px" autocomplete="new-password">
      <div class="btn-row"><button id="changeMpw">更改并重新加密全部</button></div>
      <div class="hint">会用新密码重新加密所有条目（事务原子，失败不损坏）。建议先导出备份。</div>
    </div>
    <div class="group">
      <div class="group-title">Face ID 解锁 <span class="group-sub">一次验证 = 登录 + 解锁</span></div>
      <div id="pkList"></div>
      <input type="password" id="pkMpw" placeholder="当前主密码（开启前验证）" autocomplete="off" style="margin-top:6px">
      <div class="btn-row"><button id="pkStep">验证主密码</button></div>
      <div class="hint" id="pkMsg">需要 iOS 18.4 以上，或支持 PRF 的桌面浏览器。改主密码后要重新开启。</div>
    </div>
    <div class="group">
      <div class="group-title">批量导入</div>
      <textarea id="importJson" class="mono" placeholder='[{"platform":"Gmail","name":"x@gmail.com","password":"...","recovery_email":"...","twofa_secret":"...","phone":"...","twofa_enabled":true}]' style="min-height:96px" spellcheck="false"></textarea>
      <div class="btn-row"><button id="importBtn">解析并导入</button></div>
      <div class="hint" id="importMsg">password 和 2FA 密钥在本地加密后入库。platform 必须是已有平台名。</div>
      <div class="hint">密码与 2FA 密钥已加密；账号名称、联系方式和备注作为元数据保存。</div>
    </div>`;

  const body = document.getElementById('sdrawerBody');
  body.innerHTML = html;
  // 手机快捷操作（复用 header 同款 handler，无逻辑复制）
  body.querySelector('#mLock').onclick = () => { sdrawer.classList.remove('open'); lock(); };
  body.querySelector('#mExport').onclick = doExport;
  body.querySelector('#mLogout').onclick = doLogout;
  body.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => setTheme(b.dataset.themeSet));
  body.querySelectorAll('[data-del-plat]').forEach(b => b.onclick = () => delPlatform(b.dataset.delPlat));
  body.querySelectorAll('[data-del-ctry]').forEach(b => b.onclick = () => delCountry(b.dataset.delCtry));
  body.querySelectorAll('[data-del-dev]').forEach(b => b.onclick = () => delDevice(b.dataset.delDev));
  body.querySelector('#addPlat').onclick = addPlatform;
  body.querySelector('#addCtry').onclick = addCountry;
  body.querySelector('#addDev').onclick = addDevice;
  body.querySelector('#changeMpw').onclick = () => doChangeMasterPassword().catch(e=>toast(e.message));
  body.querySelector('#importBtn').onclick = doBatchImport;
  enrolling = null;
  body.querySelector('#pkStep').onclick = enrollStep;
  refreshPasskeys();
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
async function addDevice() {
  const name = document.getElementById('newDevName').value.trim();
  if (!name) return toast('设备名必填');
  const sort = Math.max(0, ...state.devices.map(d => d.sort)) + 1;
  try { await mutate('/devices','POST',{ name,sort }); } catch(e) { return toast(e.message); }
  await loadAll(); renderSettings(); toast('设备已添加');
}
async function delDevice(id) {
  if (devInUse(id)) return toast('有账号在用此设备，不能删');
  try { await mutate('/devices/'+id,'DELETE',null); } catch(e) { return toast(e.message); }
  await loadAll(); renderSettings(); toast('设备已删除');
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
    toast('主密码已更改；开启过的 Face ID 需重新开启');
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
    await openVault();
  } catch (e) { document.getElementById('lockErr').textContent = e.message || '解锁失败'; }
  finally { unlockBtn.disabled = false; unlockBtn.textContent = '解锁'; }
}
unlockBtn.onclick = doUnlock;
mpwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });

async function openVault() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('lock').style.display = 'none';
  await loadAll();
}

// ============ Face ID（passkey + PRF） ============
// 一次 Face ID = 服务端验签发会话 + PRF 解开保险库 key；两个门禁页走同一条路径。
const PRF_INPUT = new TextEncoder().encode('account-relation/vault-prf/v1');
const fromB64u = s => unb64(s.replace(/-/g,'+').replace(/_/g,'/'));
const toB64u = buf => b64(buf).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const prfOf = c => { const r = c.getClientExtensionResults().prf?.results?.first; return r ? new Uint8Array(r) : null; };
// 只序列化验签需要的字段：PRF 输出是解保险库的秘密，绝不发给服务端
function credentialJSON(c) {
  const r = c.response, response = { clientDataJSON:toB64u(r.clientDataJSON) };
  if (r.attestationObject) Object.assign(response,{ attestationObject:toB64u(r.attestationObject),transports:r.getTransports?.() || [] });
  else Object.assign(response,{ authenticatorData:toB64u(r.authenticatorData),signature:toB64u(r.signature),
    ...(r.userHandle ? { userHandle:toB64u(r.userHandle) } : {}) });
  return { id:c.id,rawId:toB64u(c.rawId),type:c.type,response,clientExtensionResults:{} };
}
// iOS 26.2 起没有任何通行密钥管理器（「密码」/ 1Password 等）时 isUVPAA 返回 false；
// 同版本 Chrome 等 WKWebView 浏览器里 isUVPAA 一律 false（26.3 修复），所以优先用 getClientCapabilities
const passkeyReady = (async () => {
  try {
    if (!window.PublicKeyCredential) return false;
    const caps = await PublicKeyCredential.getClientCapabilities?.();
    if (caps && 'userVerifyingPlatformAuthenticator' in caps) return !!caps.userVerifyingPlatformAuthenticator;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
})();
const credentialList = list => (list || []).map(c => ({ ...c,id:fromB64u(c.id) }));
// 附上系统原始错误：真机上的失败原因只有这里看得到
const webauthnError = e => {
  const hint = e?.name === 'NotAllowedError' ? '已取消，或本设备找不到可用的通行密钥'
    : e?.name === 'InvalidStateError' ? '这台设备（或同一钥匙串 / 密码管理器）已经开启过' : 'Face ID 调用失败';
  return `${hint}（${e?.name || 'Error'}: ${e?.message || '无详情'}）`;
};

// iOS 只在用户点击的同步调用栈里放行 Face ID：challenge 在门禁页出现时预取，点击后立即调用。
let loginOptions = null;
async function preparePasskey() {
  loginOptions = null;
  let options = null;
  if (await passkeyReady) {
    try { options = await request('/passkey/login/options','POST',{}); } catch { /* 显示不了就只留密码 */ }
  }
  loginOptions = options?.enabled ? options : null;
  for (const button of document.querySelectorAll('[data-passkey]')) button.closest('.btn-row').style.display = loginOptions ? '' : 'none';
}
async function doPasskey(button,errEl) {
  const options = loginOptions?.options;
  loginOptions = null;
  errEl.textContent = '';
  if (!options) { preparePasskey(); errEl.textContent = 'Face ID 还没准备好，请再点一次'; return; }
  button.disabled = true;
  try {
    let credential;
    try {
      credential = await navigator.credentials.get({ publicKey:{ ...options,challenge:fromB64u(options.challenge),
        allowCredentials:credentialList(options.allowCredentials),extensions:{ prf:{ eval:{ first:PRF_INPUT } } } } });
    } catch (e) { throw new Error(webauthnError(e)); }
    const result = await request('/passkey/login','POST',{ response:credentialJSON(credential) });
    try { await unlockWithPrf(prfOf(credential),result.wrappedKey); }
    catch {
      await enterMasterPasswordGate();
      document.getElementById('lockErr').textContent = 'Face ID 已登录，但没能解开保险库，请输入主密码';
      return;
    }
    await openVault();
  } catch (e) { errEl.textContent = e.message; preparePasskey(); }
  finally { button.disabled = false; }
}
document.getElementById('pkLogin').onclick = e => doPasskey(e.currentTarget,document.getElementById('loginErr'));
document.getElementById('pkUnlock').onclick = e => doPasskey(e.currentTarget,document.getElementById('lockErr'));

// 开启：验证主密码（拿到原始 key）→ create() → 必要时再 get() 取 PRF → 包裹后登记
let enrolling = null;
const deviceLabel = () => [['iPhone',/iPhone/],['iPad',/iPad/],['Mac',/Macintosh/],['Android',/Android/],['Windows',/Windows/]]
  .find(([,re]) => re.test(navigator.userAgent))?.[0] || '浏览器';
async function enrollStep() {
  const button = document.getElementById('pkStep'), msg = document.getElementById('pkMsg');
  const stage = !enrolling ? enrollVerify : !enrolling.credential ? enrollCreate : enrollPrf;
  button.disabled = true;
  try {
    const next = await stage();
    if (next) { button.textContent = next.button; msg.textContent = next.msg; }
  } catch (e) {
    if (enrolling?.credential) PublicKeyCredential.signalUnknownCredential?.({ rpId:enrolling.options.rp.id,credentialId:enrolling.credential.id })?.catch(() => {});
    enrolling = null;
    button.textContent = '验证主密码'; msg.textContent = e.message;
  } finally { button.disabled = false; }
}
async function enrollVerify() {
  if (!window.PublicKeyCredential) throw new Error('这个浏览器不支持通行密钥');
  const pw = document.getElementById('pkMpw').value;
  if (!pw) throw new Error('请输入当前主密码');
  const ctx = context();
  const raw = await deriveRaw(pw,unb64(ctx.salt));
  let ok = false;
  try { ok = await decryptWith(await importVaultKey(raw),state.vault.canary) === CANARY_PLAIN; } catch {}
  if (!ok) throw new Error('主密码错误');
  const options = await api('/passkey/register/options','POST',{});
  if (!stillCurrent(ctx)) throw new Error('已锁定，请重新操作');
  enrolling = { raw,salt:ctx.salt,options };
  document.getElementById('pkMpw').value = '';
  return { button:'在本设备开启 Face ID',msg:(await passkeyReady) ? '主密码正确，点按钮完成 Face ID 验证。'
    : '主密码正确。这台设备似乎还没设置通行密钥管理器，点按钮后按系统提示设置（iOS：设置 → 通用 → 自动填充与密码）。' };
}
async function enrollCreate() {
  const o = enrolling.options;
  try {
    enrolling.credential = await navigator.credentials.create({ publicKey:{ ...o,challenge:fromB64u(o.challenge),
      user:{ ...o.user,id:fromB64u(o.user.id) },excludeCredentials:credentialList(o.excludeCredentials),
      extensions:{ prf:{ eval:{ first:PRF_INPUT } } } } });
  } catch (e) { throw new Error(webauthnError(e)); }
  const prf = prfOf(enrolling.credential);
  if (prf) return finishEnroll(prf);
  // 部分平台创建时不返回 PRF 结果，需要再验证一次；iOS 要求这次也由点击触发
  return { button:'完成设置（再验证一次）',msg:'还差一步：再做一次 Face ID 验证。' };
}
async function enrollPrf() {
  let assertion;
  try {
    assertion = await navigator.credentials.get({ publicKey:{ challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:enrolling.options.rp.id,
      allowCredentials:[{ type:'public-key',id:enrolling.credential.rawId }],userVerification:'required',
      extensions:{ prf:{ eval:{ first:PRF_INPUT } } } } });
  } catch (e) { throw new Error(webauthnError(e)); }
  const prf = prfOf(assertion);
  if (!prf) throw new Error('这个浏览器不支持用 Face ID 解开保险库（iOS 需要 18.4 以上）');
  return finishEnroll(prf);
}
async function finishEnroll(prf) {
  const { raw,salt,credential } = enrolling;
  const wrappedKey = await encryptWith(await prfWrapKey(prf),b64(raw));
  await api('/passkey/register','POST',{ response:credentialJSON(credential),wrappedKey,label:deviceLabel(),expectedSalt:salt });
  enrolling = null;
  toast('Face ID 已开启');
  refreshPasskeys();
  return { button:'验证主密码',msg:'已开启。下次在登录页或锁屏页点「Face ID 解锁」。' };
}
async function refreshPasskeys() {
  const box = document.getElementById('pkList');
  if (!box) return;
  let rows;
  try { rows = await api('/passkeys'); } catch (e) { box.textContent = e.message; return; }
  const when = t => t ? new Date(t).toLocaleString('zh-CN',{ hour12:false }) : '未使用';
  box.innerHTML = rows.length ? rows.map(r => `<div class="mrow"><span class="mname">${esc(r.label)} · 最近使用 ${esc(when(r.last_used_at))}</span>
    <button class="mini ghost" data-del-pk="${esc(r.id)}" aria-label="删除 Face ID">删除</button></div>`).join('')
    : '<div class="hint">还没有设备开启。</div>';
  box.querySelectorAll('[data-del-pk]').forEach(b => b.onclick = async () => {
    if (!confirm('删除后这台设备不能再用 Face ID 解锁。钥匙串里的通行密钥需要到「密码」App 手动删除。继续？')) return;
    try { await api('/passkeys/'+encodeURIComponent(b.dataset.delPk),'DELETE',{}); } catch (e) { return toast(e.message); }
    toast('已删除'); refreshPasskeys();
  });
}

// 页面没被系统杀掉时，离开超过 5 分钟回来就锁。只在回来时判断：iOS 挂起页面后计时器不可靠
const IDLE_LOCK_MS = 5 * 60 * 1000;
let hiddenAt = 0;
const leave = () => { hiddenAt ||= Date.now(); };
function back() {
  if (masterKey && hiddenAt && Date.now() - hiddenAt >= IDLE_LOCK_MS) lock();
  hiddenAt = 0;
}
document.addEventListener('visibilitychange',() => document.hidden ? leave() : back());
addEventListener('pagehide',leave);
addEventListener('pageshow',back);

// 服务端登录与主密码解锁是两个独立门禁。
async function enterMasterPasswordGate() {
  clearSensitive();
  document.getElementById('login').style.display = 'none';
  document.getElementById('lock').style.display = 'flex';
  preparePasskey();
  await updateLockUI();
  document.getElementById('mpw').focus();
}
function showLogin() {
  document.getElementById('lock').style.display = 'none';
  document.getElementById('login').style.display = 'flex';
  preparePasskey();
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
