# Gmail 设备登录记录 + 卡片 👁 概况预览（自托管版）

**来源**：taskboard [#10 AccountRelation 需求](https://task.loopq.cn/?t=10) · 需求 2026-11-10 grill 确认 · **基线分支 `feat/self-hosted-web`（`9749fc8`，线上 release `53f4acdd93dd9e9a742e`）**

> 本 plan 取代此前误基于 `main`（Supabase 静态版）的同名方案。产品决策沿用，数据层/接口/部署全部按自托管架构重做。误版 UI 暂存在本地分支 `tmp/supabase-device-login-ui`（`d5c7b47`）仅供参考，完成后删除。

## 目标

1. **设备登录记录**：每个 Email 账号可记录登录在哪些设备上（多对多，人工维护）；每台设备显示 `X/5`，超 5 软提醒；Email 列可按设备筛选。
2. **概况预览**：卡片名字旁 👁，弹出 help 式弹窗，展示卡片上**没有**的非敏感概况；任何密文都不解密、不展示。
3. 发布到腾讯云首尔 `https://account.loopq.cn`（`scripts/deploy.sh`，发布前自动一致性备份）。

成功标准：下文验证全部通过并发布；现有功能（登录/解锁/加解密/改主密码/导入导出/主题/手机 tab/并发 409/锁定清空）行为不变；生产数据不丢。

## 已确认决策

| # | 决策 |
|---|---|
| D1 | 设备 ↔ 账号**多对多**；新表 `devices`（名称+排序）与 `account_devices`，只表达「登着」 |
| D2 | 上限**软提醒**：前端常量 `DEVICE_CAP = 5`；超限标红；保存时若会让某设备超限 → `confirm`，确认仍可保存；服务端不限制 |
| D3 | 筛选：Email 列内容顶部原生 `<select>`（全部设备 / 未登录任何设备 / 各设备 `X/5`），只筛 Email 列，吸顶、重绘回显 |
| D4 | 👁 弹窗：备注全文、关联到它的账号（注册/订阅指向它的 Apple/AI）、创建/更新时间 |
| D5 | 只有 email 类账号能挂设备（**服务端强制**）；计数 = 关联该设备的账号数 |
| D6 | 设备在设置抽屉管理（新增/删除），照搬国家管理；被引用的设备不能删（前端提示 + 服务端 409 + 外键 RESTRICT） |
| D7 | **设备关联随账号保存在同一个 SQLite 事务里写入**：账号 POST/PATCH 携带 `device_ids`，不另开接口——账号与关联要么都成功要么都不变，不存在「账号存了设备没存」 |
| D8 | schema 升到 `user_version=2`，纯新增两张表，迁移在单事务内执行；不改动既有表与数据 |

## 范围

- 改：`server/store.js`、`server/validation.js`、`server/app.js`、`web/app.js`、`web/index.html`、`test/api.test.js`、`test/browser.spec.js`、`README.md`；`docs/agents/` 下由 `scripts/test.sh` / `deploy.sh` 重写的审计日志与 `current-release.txt`、部署验收记录增量一节。
- 不改：`mobile/`、`supabase/`、`web/sw.js`（壳资源本就网络优先、`app.js` 以 `no-cache` 下发）、`web/api-client.js`、`web/crypto.js`、部署脚本与 Compose/Caddy。
- 不做：批量导入带设备、设备改名、登录日期、可配置上限、明文预览。

## 数据层（`server/store.js`）

- 版本门禁：`if (version > 2) throw`；`version === 0` 的 v1 建库块保持原样；其后新增 `if (version < 2) db.transaction(() => { … PRAGMA user_version=2; })()`——新库依次走 v1→v2，旧库只走 v2。迁移失败整体回滚，库仍为 v1。

  ```sql
  CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE account_devices (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,   -- 删账号自动解绑
    device_id  TEXT NOT NULL REFERENCES devices(id)  ON DELETE RESTRICT,  -- 被引用设备 DB 层禁删
    PRIMARY KEY (account_id, device_id));
  CREATE INDEX account_devices_device ON account_devices(device_id);
  PRAGMA user_version=2;
  ```

- `snapshot()`：增加 `devices`（`ORDER BY sort,id`）；每个 account 增加 `device_ids`（由一次 `SELECT account_id,device_id FROM account_devices ORDER BY account_id,device_id` 分组得到，无关联为 `[]`）。仍在同一读事务内，保持一致快照。导出直接序列化 state，自动包含。
- `saveAccount(data, id)`：
  - 从 `data` 取出 `device_ids`（不进 `accountColumns`），其余逻辑不变。
  - 账号写入后、同一 `mutate` 事务内：若 `row.category !== 'email'` → 删除该账号全部关联，且 `device_ids?.length > 0`（**按长度判，`[]` 是合法值**——前端对非 email 恒传 `[]`）时报 `400 只有 Email 账号可以记录登录设备`；若为 email 且 `device_ids !== undefined` → 去重、逐个确认设备存在（不存在 `400 设备不存在`，避免外键错误变成 500），再「删旧 + 插新」整体替换；`device_ids === undefined`（PATCH 未携带）→ 保持原关联。
  - 导入（`/accounts/import`）走同一 `saveAccount`，不带 `device_ids` 即无关联，无需改动。
- 设备增删复用 lookup：`saveLookup` 增加 `devices` 分支；`deleteLookup` 的引用检查从「accounts 的某列」泛化为 `{ platforms:['accounts','platform_id'], countries:['accounts','country_id'], devices:['account_devices','device_id'] }`，存在性查询统一写成 `SELECT 1 FROM ${refTable} WHERE ${refCol}=? LIMIT 1`（`account_devices` 是复合主键、没有 `id` 列，沿用 `SELECT id` 会 500），被引用 → `409 仍有账号使用此项`。

## 接口与校验（`server/validation.js`、`server/app.js`）

- `account` 增加 `device_ids: z.array(uuid).max(100).optional()`（`partial()` 自动继承）。
- 新增 `device = z.strictObject({ name: z.string().trim().min(1).max(100), sort: z.number().int().min(0).max(100000).optional() })`。
- 路由：lookup 循环加入 `['devices', v.device]` → `POST /api/devices`、`DELETE /api/devices/:id`。全部走既有 `mutation()`：鉴权、同源、CSRF、`expectedRevision/expectedSalt`、409 语义不变。

## 前端（`web/app.js`、`web/index.html`）

UI 写法参考 `tmp/supabase-device-login-ui` 中已评审过的版本，写操作一律改走 `mutate()`。

1. **状态**：`emptyState()` 增加 `devices: []`；helper `deviceById(id)`、`deviceCount(id) = state.accounts.filter(a => a.device_ids?.includes(id)).length`。
2. **设置 · 设备管理**：在「国家 / 地区管理」后加一节；每行 `名称 · X/5`（超限 `.over`）+「删」；`addDevice` / `delDevice` 照抄 `addCountry` / `delCountry`（`mutate('/devices', 'POST', { name, sort })`、`mutate('/devices/'+id, 'DELETE', null)`），删除前先判 `deviceCount > 0`。
3. **表单**：`.field-devices` 仅 email 显示（并入 `applyCat`）；每台设备一个 checkbox + 当前计数；无设备时提示「先在 ⚙ 设置 → 设备管理 添加设备」。
4. **保存**：`row.device_ids = cat === 'email' ? 勾选的 id : []`；**在调用 `mutate` 之前**对「本账号原先未关联」且 `deviceCount + 1 > DEVICE_CAP` 的设备汇总 `confirm`，取消则不提交、表单保持打开。之后沿用现有一次 `mutate` → `closeDrawer` → `loadAll`。
5. **筛选**：`devFilter`（`''` / `'__none'` / 设备 id，不持久化）、`matchDevFilter`、`devFilterBar()`；`render()` 保持单循环：`all` 判空态，`list = cat === 'email' ? all.filter(matchDevFilter) : all`，email 且有设备时插入筛选条，筛选为空显示「该筛选下暂无账号」。筛选目标设备被删 → 重置为 `''`。计数显示过滤后条数。
6. **卡片**：email 账号有关联时 `.meta` 加 `<b>设备</b> A, B`（超限设备 `.over`）；名字后加 `<button type="button" class="peek-btn" aria-label="预览概况">👁</button>`。
7. **👁 弹窗**：`index.html` 加共享 `<div id="peek" popover></div>` 与样式（`--panel/--ink/--line`、`width: min(340px, calc(100% - 32px))`、`max-height: 70vh`、`::backdrop` 半透明）。👁 `onclick` → `fillPeek(a); peek.togglePopover?.(true)`，**不用 `popovertarget`**（其默认 toggle 会让「弹窗开着时点另一张卡的 👁」变成关闭）。`fillPeek` 只读非敏感字段，**不得调用解密、不得读 `encrypted_*`**。
8. **锁定 / 退出清空**：`clearSensitive()` 增加 `peek.togglePopover?.(false); peek.replaceChildren();`——401/409 触发的自动锁屏发生在弹窗打开时，备注不能浮在锁屏上方（Popover 位于 top layer，z-index 盖不住）。**必须用可选链**：不支持 Popover 的老浏览器（如 iOS 16）上 `togglePopover` 为 undefined，直接调用会抛 TypeError 打断 `clearSensitive` 后续的敏感数据清理。
9. 所有设备名插入 HTML 处经 `esc()`；样式沿用 index.html 内联 `<style>`（CSP 已允许 `'unsafe-inline'` 样式，脚本仍只走外链模块）。

## README

- 「范围」补一句功能说明；「备份与回滚」补：schema 已升到 2，回退到旧镜像前必须先恢复对应的 `predeploy-*.db`（旧镜像遇到 v2 库会拒绝启动）。

## 验证

1. `npm ci`（锁定依赖）；`npm run check`（语法 + CSP 入口检查）。
2. `npm test`，新增用例：
   - schema：新库 `user_version=2`；snapshot 含 `devices` 与每个账号的 `device_ids`。
   - 设备增删：POST 成功；被引用设备 DELETE → 409；空闲设备 DELETE 成功。
   - 账号保存：email 带 `device_ids` 写入；PATCH 不带保持、带 `[]` 清空、重复 id 去重；非 email 带非空 → 400；不存在的设备 → 400 且账号未落库（事务回滚）；email 改成 apple 平台 → 关联清空；删账号 → 关联级联删除。
   - 过期 `expectedRevision` 的设备写入 → 409 且数据不变。
3. **v1 → v2 迁移实测**（一次性，不入库）：用 `git show 9749fc8:server/store.js` 的旧代码在临时文件建 v1 库并写入假数据 → 新 `openStore` 打开 → `user_version=2`、原数据 `deepEqual`、`integrity_check=ok`、`foreign_key_check=[]`；再用旧代码打开 v2 库应拒绝启动（印证回滚须恢复备份）。
4. `npm run test:browser`（Playwright，隔离临时库）扩展现有主流程：加 2 台设备 → Gmail 勾选 → 卡片显示设备、计数 +1 → 第 6 个触发 confirm（取消不保存 / 确认保存后标红；现有用例全局 `page.on('dialog', d => d.accept())`，取消分支前先挂 `page.once('dialog', d => d.dismiss())`——同一事件先到的 once 处理器会先执行，需确认不与全局 accept 冲突，必要时把全局监听改为可切换的标志）→ 筛选三种状态与重绘回显 → 删除在用设备被拒 → 👁 显示备注/关联/时间且页面无明文 → 弹窗开着时点另一张卡 👁 一次切换 → 锁定后弹窗关闭且为空 → 手机宽度筛选可见。若本机缺 Playwright 浏览器则 `npx playwright install chromium` 后再跑。
5. `scripts/test.sh` 全量一次（重写 `docs/agents/*-test-results.log`、`dependency-audit.log`、`syntax-check.log`），`git diff --check`。
6. grep：`fillPeek` 内无 `decryptWith|encrypted_`；无 `popovertarget`。

## 发布（用户确认后执行）

1. 代码经 `/apply-worktree` 回到本地 `feat/self-hosted-web`（holder 需 checkout 该分支）。
2. 在 holder 运行 `scripts/deploy.sh`：打包白名单源码 → 服务器校验 manifest → 构建镜像 → **发布前一致性备份 `predeploy-*.db`** → 起新容器（启动即迁移到 v2）→ 健康检查。
3. 发布后核对：`current-release` 标记一致；公网 `app.js` SHA256 与本地一致；容器 healthy；服务器上只读核对 `user_version=2`、accounts/platforms/countries 数量与发布前备份一致、`integrity_check=ok`。不登录、不改动用户生产保险库。
4. 在 `docs/agents/account-relation-deployment-verification.md` 追加本次增量一节（release、迁移、测试、核对结果），连同重写的日志与 `current-release.txt` 单独提交。
5. 删除临时分支 `tmp/supabase-device-login-ui`。
6. **统一主分支**：本地 `main` 快进到 `feat/self-hosted-web`（`git merge --ff-only`；`main`=`4878342` 是 feat 祖先，无需强推）。feat 已去掉 `deploy-pages.yml` 的 push 触发并加 `ENABLE_LEGACY_PAGES` 开关，推到 main 不会触发 Pages。由用户执行 `git push origin main`；之后把 `~/dev/tools/tencent-ubuntu/CLAUDE.md`/`AGENTS.md` 部署表、AccountRelation 本地 `CLAUDE.md`、memory `self-hosted-deploy-branches` 的线上分支改为 `main`；远端 `feat/self-hosted-web` 是否删除由用户决定。

## 风险

- **回滚**：新容器启动即迁移；`deploy.sh` 的健康检查失败自动回切旧镜像时，若迁移已提交，旧镜像会因 schema 2 拒绝启动 → 需人工恢复 `predeploy-*.db` 后再起旧镜像。迁移本身失败则回滚为 v1，自动回切正常。
- 生产已有真实数据：迁移纯新增、单事务；发布前备份兜底。
- Popover 需 Safari 17+ / Chrome 114+；更老浏览器 👁 无反应，其余不受影响。
- Flutter 端不受影响（仍连旧 Supabase，独立）。
