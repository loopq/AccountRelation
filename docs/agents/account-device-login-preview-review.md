# Plan Review: account-device-login-preview

**Plan File**: docs/agents/account-device-login-preview.md
**Reviewer**: Gemini

---

## Round 1 — 2026-11-10

### Overall Assessment
方案整体设计清晰合理，准确基于当前的自托管单机架构（SQLite 版本门禁、事务原子性、单次请求 mutate 乐观并发控制、无内联脚本 CSP 策略）重新设计，彻底规避了此前误用 Supabase 静态架构的路径偏差。经检查计划中未提供本地 PRD 副本（PRD validation skipped — no local copy）。方案在数据层引用泛化检查列名、低版本浏览器 Popover 降级兼容性、以及非 email 账号空数组校验上存在少量实现隐患，修改后即可达到高质量直接落地标准。

# Plan Review Result

## Decision
REQUEST_CHANGES

## Score
8 / 10

## Blockers
- None（无架构级 blocker，均为细节实现与边界防护问题）

## Required Changes
- [High] [server/store.js - deleteLookup] 泛化外键引用检查不能硬编码查询 `id` 列
  - **位置**：`docs/agents/account-device-login-preview.md` 第 54 行 (`deleteLookup 的引用检查从「accounts 的某列」泛化为 { platforms:['accounts','platform_id'], countries:['accounts','country_id'], devices:['account_devices','device_id'] }`)
  - **问题描述**：现有 `server/store.js` line 116 代码为 `SELECT id FROM accounts WHERE ${column}=? LIMIT 1`。新建的 `account_devices` 表由复合主键 `(account_id, device_id)` 构成，并不包含 `id` 列。若泛化直接拼装为 `SELECT id FROM ${refTable} WHERE ${refCol}=?`，在删除已被引用的设备时会抛出 `SqliteError: no such column: id`，导致 Express 将其捕获为 500 内部服务错误，而不是按预期返回 409 冲突。
  - **改进建议**：将存在性检查统一改为 `SELECT 1 FROM ${refTable} WHERE ${refCol}=? LIMIT 1`，彻底脱离被引用表的主键列名依赖。

- [High] [web/app.js - clearSensitive] Popover API 需增加能力检测以防低版本浏览器锁屏功能崩溃
  - **位置**：`docs/agents/account-device-login-preview.md` 第 73 行 (`clearSensitive() 增加 peek.togglePopover(false); peek.replaceChildren();`) 与 第 105 行 (`更老浏览器 👁 无反应，其余不受影响`)
  - **问题描述**：Popover API 为现代浏览器特性（Safari 17+、Chrome 114+、Firefox 125+）。在不支持该 API 的运行环境中，`peek.togglePopover` 为 `undefined`。`clearSensitive()` 作为启动、主动锁屏、401 未认证、409 并发冲突及退出登录的核心清理函数，无条件调用 `peek.togglePopover(false)` 会抛出 `TypeError: peek.togglePopover is not a function`，直接中断后续的敏感数据抹除与锁屏展示流程，导致 Plan 所承诺的「更老浏览器其余不受影响」被打破，甚至造成安全界面故障。
  - **改进建议**：在 `clearSensitive()` 中使用可选链防护调用：`peek?.togglePopover?.(false);` 及 `peek?.replaceChildren?.();`，卡片点击打开时同理做好特性检测。

- [Medium] [server/store.js - saveAccount] 明确非 email 账号 `device_ids` 非空判定的语义防误判
  - **位置**：`docs/agents/account-device-login-preview.md` 第 51 行 (`若 row.category !== 'email' → 删除该账号全部关联，且 device_ids 非空时报 400 只有 Email 账号可以记录登录设备`) 与 第 69 行 (`row.device_ids = cat === 'email' ? 勾选的 id : []`)
  - **问题描述**：前端保存非 email 账号时统一传递 `row.device_ids = []`（空数组）。若后端以 JS 常规真值 `if (device_ids)` 或 `if (device_ids != null)` 判定「非空」，由于 `[]` 在 JS 中为 truthy，会导致正常保存 Apple / AI 账号被误报 400。
  - **改进建议**：在方案中明确后端判定规则为 `Array.isArray(device_ids) && device_ids.length > 0` 视为非空报 400；或者前端针对非 email 分类直接不传 `device_ids`（保持 `undefined`）。

- [Suggestion] [test/browser.spec.js] 编写软上限测试需临时处理 Playwright 全局对话框监听
  - **位置**：`docs/agents/account-device-login-preview.md` 第 89 行 (`第 6 个触发 confirm（取消不保存 / 确认保存后标红）`)
  - **问题描述**：现有 `test/browser.spec.js` 第 13 行配置了全局 `page.on('dialog', dialog => dialog.accept())`。若直接在其后追加测试步骤，`confirm` 对话框会被自动接受，无法测试「取消不保存」分支。
  - **改进建议**：在测试执行说明中提示使用 `page.once('dialog', d => d.dismiss())` 优先覆盖取消分支，再用 accept 覆盖确认分支。

## Missing Context
- 无缺少关键上下文。既有数据库、接口验证与前端 DOM 结构均已完整对齐。

## Risk Assessment
- logic: 软提醒上限判断采用 `deviceCount + 1 > DEVICE_CAP`，需注意仅针对新勾选设备提示，现有已绑定超限设备保存时无需重复弹窗，方案逻辑闭环。
- state: 筛选状态 `devFilter` 为纯内存状态，锁定或目标设备删除时重置，符合设计预期。
- data: 新增 `devices` 与 `account_devices` 两张表，`accounts` 主表 schema 保持不动，迁移单事务保证原子性；备份与迁移回滚机制清晰。
- UI: Popover 位于 top-layer，已在 `clearSensitive()` 中增加主动收起，需配合可选链避免不支持环境崩溃。
- regression: 既有加解密、主密码轮换、批量导入均不涉及设备关联，已有 `api.test.js` 与 `browser.spec.js` 回归路径完整。

## Test Requirements
- unit: `test/api.test.js` 覆盖 schema v2 门禁、设备增删 409、非 email 携带设备关联 400、不存在设备 400 事务回滚、账号删除级联解绑。
- integration: SQLite v1 到 v2 的临时库迁移验证，校验 `integrity_check` 与 `foreign_key_check`。
- manual: Playwright 浏览器端测试覆盖软上限 confirm、设备筛选、卡片 👁 预览切换以及移动端响应式布局。

## Final Verdict
方案成熟可行，修复上述两项高危细节代码缺陷（外键检查列名与 Popover 可选链）后即可直接编码执行。
