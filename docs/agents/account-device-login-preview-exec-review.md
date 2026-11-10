# 执行评审：Email 登录设备记录 + 👁 概况预览

- Plan：[account-device-login-preview.md](account-device-login-preview.md)（方案评审见 [account-device-login-preview-review.md](account-device-login-preview-review.md)）
- 任务：taskboard #10 https://task.loopq.cn/?t=10
- Base：`feat/self-hosted-web` @ `9749fc8`（线上 release `53f4acdd93dd9e9a742e`）
- 实现者：Gemini（ai-agy，profile `agyd-seoul`），conversation `35629cd5-0e4f-4a42-b2f5-563a06b489d4`，耗时 3820s
- 评审与验收：Claude（自己重跑全部验证，不采信实现者自述）

## 实现过程

Gemini 完成了全部代码和测试改动，卡在 `npx playwright install chromium`：走代理约 55 KB/s，17 分钟才下了 61 MB，后面还有 headless-shell 要下。经用户同意，只杀掉了下载进程，Gemini 随即退出，没有出最终报告，第 6、7 步没有跑。剩下的验证由 Claude 完成。浏览器测试改用本机 Google Chrome 157（`channel:'chrome'`），一次性配置放在仓库外的 `/tmp/ag-pw/chrome.config.mjs`，仓库的 `playwright.config.js` 没动。所以 `browser-test-results.json` 里的 `configFile` 指向这个临时路径。

## 逐项对照 plan

| 项 | 结果 |
|---|---|
| schema v2：v1 块不动，另起 `if (version < 2)` 事务，门槛改为 `version > 2` | ✅ |
| `devices` / `account_devices` 表；CASCADE（删账号）/ RESTRICT（删设备）；索引 | ✅ |
| snapshot 增加 `devices`，每个账号带 `device_ids`（没有就是 `[]`） | ✅（Claude 简化为 `Map.groupBy`） |
| saveAccount：设备关联和账号在同一个 mutate 事务里写；`undefined` 保持原样，`[]` 清空；非 Email 清空关联，只有 `length>0` 时返回 400；未知设备返回 400 | ✅ |
| deleteLookup 泛化为 `SELECT 1 FROM <refTable> WHERE <refCol>=? LIMIT 1`，设备被使用时返回 409 | ✅ |
| validation：`device_ids` 可选，最多 100 个 uuid；新增 `device` strictObject | ✅ |
| 设置页设备管理（沿用国家的写法，走 `mutate`） | ✅ |
| 表单中设备多选只对 Email 显示，带 X/5 计数和超限变红；软上限 confirm 在 mutate 之前 | ✅ |
| Email 列顶部原生 `<select>` 筛选：全部 / 未登录任何设备 / 各设备 X/5；`render` 仍是单循环 | ✅ |
| 卡片显示设备行（超限变红）和 👁 按钮；不用 `popovertarget`，用 `togglePopover?.()` | ✅ |
| fillPeek 只显示完整备注、反向关联、创建/更新时间；不解密，不读 `encrypted_*` | ✅（grep 确认） |
| clearSensitive 关闭并清空 peek | ✅（浏览器测试断言锁定后弹窗隐藏且为空） |
| 所有设备名都经过 `esc()` | ✅ |
| README：范围加一行；回滚说明写明 schema 2 需先恢复 `predeploy-*.db` | ✅ |

## 发现与处置

| # | 严重度 | 位置 | 问题 | 处置 |
|---|---|---|---|---|
| 1 | 中 | `web/app.js` renderCard 设备行 | `device_ids` 在 snapshot 里按 UUID 排序，卡片按它显示，设备顺序随机（浏览器测试看到的是 "Dev Beta, Dev Alpha"），和设置里的顺序对不上 | Claude 修：改为 `state.devices.filter(d => a.device_ids?.includes(d.id))`，按设置顺序显示。外键保证设备一定存在，`'?'` 分支随之删掉 |
| 2 | 中 | `web/index.html` `#peek` | 全局 reset `* { margin: 0 }` 覆盖了 popover 默认的 `margin:auto`，弹窗贴在左上角，没有居中 | Claude 修：`#peek` 加 `margin: auto`。桌面 1280 和手机 390 的截图都确认居中 |
| 3 | 低 | `test/browser.spec.js` | `selectOption({label:/Dev Alpha/})`：Playwright 的 label 只接受字符串，测试直接报错 | Claude 修：改成按 value 选。同时断言选项文字 `Dev Alpha（6/5） ⚠`，并补了 Dev Beta 筛选后只剩 1 张卡的断言（原来"全部"和"Dev Alpha"都是 6 张，证明不了筛选生效） |
| 4 | 低 | `server/store.js` snapshot | 手写 6 行 Map 分组 | Claude 简化为 `Map.groupBy`（Node 21+，生产镜像是 `node:24`） |
| 5 | 低 | `web/app.js` delDevice | `if (devFilter === id) devFilter = ''` 多余，`render()` 已经会重置失效的筛选 | Claude 删掉 |

没有退回给实现者。上面的问题都是局部修改，意图明确。

未改动：表单里"登录设备（多选）"的标签上边距为 0，这是原有 `label:first-child { margin-top: 0 }` 规则作用于字段组的结果，和"绑定手机号"等字段组一致，属于既有设计。

## 最终验证（Claude 在 worktree 内执行）

| 命令 | 结果 |
|---|---|
| `npm ci` | ✅ 0 vulnerabilities |
| `npm run check` | ✅ JavaScript syntax and production entrypoint checks passed |
| `npm test` | ✅ 6/6（新增 `devices CRUD, account device links, schema v2 and foreign keys`）。`request_failed SQLITE_CONSTRAINT_TRIGGER` 是已有负向测试的日志，基线日志里也有 |
| `node /tmp/ag-migrate-check/check.mjs`（用 `git show 9749fc8:server/store.js` 当旧 store） | ✅ 旧库 user_version=1 → 新库 2；integrity ok；foreign_key_check 为空；数据 deepEqual（账号多出 `device_ids: []`）；旧 store 拒绝打开 v2 库 |
| `npx playwright test -c /tmp/ag-pw/chrome.config.mjs`（本机 Chrome 157） | ✅ 2/2 |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `git diff --check` | ✅ |
| grep：fillPeek 内没有 `decryptWith` / `encrypted_`；`web server test` 中没有 `popovertarget` | ✅ |
| 一次性截图检查（`/tmp/ag-pw/shots.spec.mjs`）：看板、设置、表单、桌面和手机弹窗 | ✅ 修完 #2 后确认 |

`docs/agents/` 下的 `syntax-check.log`、`api-test-results.log`、`browser-test-results.{log,json}`、`dependency-audit.log` 和 `account-relation-mobile-verification.png` 都按 `scripts/test.sh` 的步骤重新生成，浏览器那一步用的是上面的本机 Chrome 配置。

## 遗留风险

- 浏览器测试跑在本机 Chrome 157 上，不是 Playwright 自带的 Chromium 158。这次改动没用到版本差异敏感的 API（Popover API 在 Chrome 114+ 都支持），风险可以忽略。
- schema 升到 v2 后，旧镜像拒绝打开这个库。发布后如果要回滚，必须先恢复 `predeploy-*.db`，再切回旧镜像（README 已写明）。
- 不支持 Popover API 的旧浏览器（Safari < 17）里，`#peek` 会作为一个空块显示在页面底部，👁 点了没反应。用户设备都是新系统，不处理。
