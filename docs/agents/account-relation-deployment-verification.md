# AccountRelation 部署与验收记录

本节首次部署记录时间：2026-11-08T07:21:46.469104+00:00。生产地址：**https://account.loopq.cn/**。状态：服务器初始化、网页版自托管改造和首次部署完成；生产库为空，首次登录由用户设置自己的保险库主密码。

最新增量（2026-11-19，taskboard #26 Email Claude 情况）：已发布 `6a56c9439a4e53953d2d`（git 基线 `0fcd55f` + 未提交改动，manifest 逐文件 SHA256 已在服务器核对）。Email 账号新增「Claude 情况」：状态下拉（白号 / 已注册 / 使用中 / 已封禁，空 = 未标记）+ 注册、开始使用（Pro）、封禁 3 个日期；Email 列顶部盘点条按状态计数并可点击筛选。与 AI 栏 Claude 账号的「注册邮箱」关系完全独立。生产库从 schema 4 自动迁移到 5，只新增 4 个可空列且全为 NULL；发布前备份 `predeploy-20261119T060106Z.db`。本机 `npm run check`、12 组接口测试、3 条浏览器流程通过。发布前后保险库、revision、27 个账号原有列、平台、国家、设备及关联指纹一致，integrity ok。公网 `index.html` / `app.js` 10/10 哈希一致、`/health` 200、匿名 `/api/state` 401。回滚：恢复该 predeploy 备份，或停应用后 `DROP COLUMN` 4 个 claude 列并 `PRAGMA user_version=4` 再切旧镜像。详见 [发布日志](claude-status-deployment.log)、[数据核对](claude-status-data-audit.log)、[公网核对](claude-status-public.log)。

此前增量（2026-11-13，#18 第二次修复 + 真机验收通过）：已发布 `a85ce45876185a75950c`。用户关掉 1Password 后，iPhone 的 Safari 和 Chrome 都报「浏览器不支持」。原因：iOS 26.2 起，手机上没有任何通行密钥管理器时 `isUserVerifyingPlatformAuthenticatorAvailable()` 返回 false；同版本 Chrome 等 WKWebView 浏览器里它一律返回 false（26.3 修复）。修复：能力检测优先用 `getClientCapabilities()`；开启 Face ID 不再预先拦截，直接调起系统流程，没有管理器时由 iOS 引导设置，提示文案指向「设置 → 通用 → 自动填充与密码」。本机 8 组接口测试、3 条浏览器流程通过，`npm audit` 0 漏洞。发布前后业务表指纹一致（passkeys 0→1 是用户在发布窗口内开启的）。公网 `app.js` 10/10 哈希一致，Chromium / WebKit 冒烟无脚本错误。**真机验收**：用户 iPhone 16 存进 1Password 的 passkey（标签「iPhone · 1Password」）15:17:03 登记，15:17:48 一次 Face ID 登录并解锁成功（服务端 `last_used_at` 已记录）。说明 `allowCredentials` 修复对第三方提供方有效。iCloud 钥匙串路径未在真机验证。详见 [第二次修复发布日志](faceid-passkey-fix2-deployment.log)、[数据核对](faceid-passkey-data-audit.log)、[公网核对](faceid-passkey-public.log)。

此前增量（2026-11-13，#18 真机反馈修复）：已发布 `a593a252f55e01c1e4bd`。用户 iPhone 真机开启时，iOS 把 passkey 存进了 1Password（服务端登记成功，凭据 ID 31 字节，不像 iCloud 钥匙串的 20 字节）。之后点「Face ID 解锁」，本地立即报「已取消」，服务端没有收到登录请求（`last_used_at` 为空）。判断原因：解锁走的是可发现凭据（`allowCredentials` 为空），iOS 找不到第三方提供方里的这把 passkey。修复：`login/options` 显式列出已登记的 credential id（凭据 ID 不是秘密）；前端出错时附上系统原始错误名和信息；登记时按 AAGUID 在标签后注明提供方（iCloud 钥匙串 / 1Password 等）。本机 8 组接口测试、3 条浏览器流程通过，`npm audit` 0 漏洞（第 1 次 TLS 断连，重跑通过）。发布前后业务表指纹一致，用户已开启的 1 个 passkey 保留。公网 `index.html`、`app.js` 10/10 哈希一致，`login/options` 返回 `enabled:true`、1 个 allowCredentials。**真机是否修好待用户重试确认。** 详见 [修复发布日志](faceid-passkey-fix-deployment.log)、[数据核对](faceid-passkey-data-audit.log)、[公网核对](faceid-passkey-public.log)。

此前增量（2026-11-13，taskboard #18 Face ID 解锁）：已发布 `16ee2c030ea550dae2f6`（git 基线 `45338a2`，含未提交改动，manifest 逐文件 SHA256 已在服务器核对）。新增 passkey + WebAuthn PRF：在设置里用主密码开启后，登录页和锁屏页的「Face ID 解锁」一次验证同时完成登录和保险库解锁。服务端只存 PRF 派生 key 加密过的保险库 key（`passkeys.wrapped_key`），解密需要设备上的 PRF 输出，服务端解不开。邮箱密码和主密码两条原路径保留作兜底；改主密码、重置管理员时同一事务清空全部 passkey。另加回访锁：页面没被系统杀掉时，离开 ≥5 分钟回来自动锁定。新依赖 `@simplewebauthn/server` 14.1.0；schema 2→3 只新增 `passkeys` 表。本机验证：语法/CSP 检查、8 组接口测试（新增 passkey 边界、v2→v3 迁移两组）、3 条浏览器流程（新增 Chromium 虚拟验证器 + PRF 全流程：开启、一次 Face ID 进入、断言重放 401、重载后解锁、4 分钟不锁 / 5 分钟锁、改主密码后失效、不支持 PRF 时拒绝开启、创建时不返回 PRF 的两步开启），`npm audit` 0 漏洞（第 1 次 TLS 断连，重跑通过）。浏览器测试 origin 由 127.0.0.1 改为 localhost（WebAuthn 不接受 IP 作 rpId）。发布前自动备份 `predeploy-20261113T064805Z.db`。生产库迁移到 v3：业务表行数与内容指纹和发布前完全一致，`passkeys` 为空。公网三个前端文件 10/10 次哈希一致，匿名注册/列表/状态 401、跨域 403，`login/options` 返回 `enabled:false`；Chromium 与 WebKit（iPhone 15 模拟）打开登录页无脚本错误。**未完成**：iOS 真机 Face ID 未验证（本机无 iOS 模拟器运行时、无连接设备，开启需要用户的主密码），PRF 拿不到时前端自动退回主密码。**回滚注意**：旧镜像拒绝打开 v3 库，回退到 `c9c611f1ff5831bd6a01` 前必须先恢复上述备份。详见 [发布日志](faceid-passkey-deployment.log)、[数据核对](faceid-passkey-data-audit.log)、[公网核对](faceid-passkey-public.log)、[服务器核对](faceid-passkey-server-check.log)。

此前增量（2026-11-11，Web UI 重做）：已发布 `c9c611f1ff5831bd6a01`（git 基线 `607a8fd`，含未提交的 `web/index.html` / `web/app.js`，manifest 逐文件 SHA256 已在服务器核对）。只改表现层：系统无衬线字体 + 数据值等宽、内联 SVG 图标替换 emoji、卡片改为平台 chip / 状态 chip / 键值网格、登录与解锁页改为品牌卡片、抽屉加遮罩与 Escape 关闭、表单分组、手机端输入框 16px（不再触发 iOS 自动缩放）、header 新增跨三列搜索（`/` 聚焦）。API、加解密、状态机、SW 缓存键、manifest、图标、静态白名单均未变；schema 仍为 2。本机验证：语法/CSP 检查、6 组接口测试、2 条浏览器流程全部通过（测试文件零改动），`npm audit` 0 漏洞。发布前自动备份 `predeploy-20261111T021039Z.db`。发布后：公网 `index.html` / `app.js` 10/10 次哈希与本地一致，容器内回环同样一致；`/health` 200、匿名 `/api/state` 401；生产库只读核对 user_version 2、integrity ok、无外键违规，账号 25、revision 74，全程未登录、未写入 vault。回滚只需 `previous.env` 切回 `bae6614337d5430f9505`，无需恢复数据库。详见 [发布日志](ui-redesign-deployment.log)、[公网核对](ui-redesign-public.log)、[服务器核对](ui-redesign-server-check.log)、[手机截图](account-relation-mobile-verification.png)、[登录页截图](account-relation-public-login.png)。

此前增量（2026-11-10，taskboard #10）：已发布 `bae6614337d5430f9505`（git `d3dcbcc`）。新增两项功能：一是记录每个 Email 账号登录在哪几台设备上，每台设备软上限 5 个，超了变红、保存前确认，仍可保存；Email 列可按设备筛选。二是卡片上的 👁 弹出概况：完整备注、关联到它的账号、创建/更新时间，不解密任何字段。生产库已从 schema 1 自动迁移到 2，只新增了 `devices` 和 `account_devices` 两张空表。保险库、revision、24 个账号、平台、国家的内容指纹跟发布前完全一致，integrity ok，没有外键违规。预发布备份 `predeploy-20261110T064249Z.db` 已核对：v1，内容与发布前一致。**回滚注意**：旧镜像拒绝打开 v2 库，回退到 `53f4acdd93dd9e9a742e` 前必须先恢复这份备份。本机验证 6 组接口测试、v1→v2 迁移检查和 2 条浏览器流程都通过，浏览器测试用的是本机 Chrome。公网 `app.js` / `index.html` 与源码哈希一致。核对过程中有 1 次本机链路 TLS 偶发失败，重试 10/10 通过，如实记录在日志里。全程未登录，未写入 vault。详见 [增量部署日志](device-login-preview-deployment.log)、[数据核对](device-login-preview-data-audit.log)、[公网核对](device-login-preview-public.log)、[执行评审](account-device-login-preview-exec-review.md)。

分支统一（2026-11-10）：`feat/self-hosted-web` 已快进合入 `main` 后删除。`mobile-impl` 早已合入 main，一并删除。以后线上分支就是 `main`，`scripts/deploy.sh` 在 main 上运行发布。本文和其他历史记录里的分支名保留当时原样，不回改。

此前增量（2026-11-08）：用户要求保险库主密码最低长度降为 6 个字符，现已发布 `53f4acdd93dd9e9a742e`。首次设置和修改均支持 6 位纯数字，5 位会拒绝；登录密码规则未改。2 条浏览器流程、5 组接口测试、公网脚本校验通过，保险库与账号数据核对无变化。详见 [增量部署日志](vault-password-six-deployment.log)、[浏览器测试](vault-password-six-browser.log)、[公网验收](vault-password-six-public.log)、[数据核对](vault-password-six-data-audit.log)。下文版本为首次部署历史记录。

## 1. 交付版本与范围

| 项目 | 实际结果 |
|---|---|
| Git 同步 | 已 fetch origin，main rebase 到 4878342b4d9b5d1c44edb7cb3ee022cf69b365a0，无冲突；本地改造分支 feat/self-hosted-web；未 commit/push |
| 发布标识 | `9b2109772aad4384f75b`；源码白名单 manifest、归档 SHA256、服务器构建日志及镜像 ID 留存 |
| 生产镜像 | `account-relation:9b2109772aad4384f75b`；ID `sha256:6b658dcc00cdb25bcfa83c9625f7daf0930fe720b7c87597b3496d933883995b`，linux/amd64 |
| 技术栈 | Node 24.22.2、Express 5.3.0、better-sqlite3 13.0.3、Argon2 0.45.2、Zod 4.6.7、Caddy 2.11.9；SQLite schema 1 |
| 数据与 UI | 网页改用同源 API；单管理员、会话、CSRF、SQLite 事务/外键/并发版本；保留分类、主题、手机 tab、关联、加密、导入导出 |
| 加密 | 密码/2FA 在浏览器加密；不可导出 CryptoKey，只驻留内存；刷新重新解锁。账号名称、联系方式、备注等仍是明文元数据 |
| 隔离 | Flutter mobile 无修改；旧 Supabase SQL 仅作为仓库历史/移动端参考。生产镜像不含 Supabase SDK/配置、mobile、生产凭据或数据库 |
| 源码核对 | 运行镜像中的 server/web/package 与发布 manifest 逐文件匹配；发布后仅增强本机 scripts/verify-public.mjs 的诊断，该验证脚本另随审计包归档 |

相关证据：[部署日志](deployment-final.log)、[服务器实际运行测试与镜像核对](server-final-runtime-tests.log)、[源码核对结果](final-source-audit.json)、[实际版本及资源占用](final-runtime-versions.log)。实测应用约 91 MiB、代理约 55 MiB；分别限制 512 MiB / 256 MiB。

## 2. 验证矩阵与结果

| 验证项 | 结果与证据 |
|---|---|
| 接口/数据/密码 | 本机及服务器 Node 24 均通过 5 组测试：匿名拒绝、CSRF、Cookie、会话轮换/退出/过期、限速、管理员唯一性/重置、CRUD/关联/引用保护、导入原子性、主密码轮换、旧密钥和并发创建/修改/删除拒绝、空库、非导出密钥、WAL 备份恢复。见 [本机日志](api-test-results.log) 与 [服务器日志](server-final-runtime-tests.log) |
| 事务故障 | 在 vault_meta 更新处注入 SQLite 触发器故障，验证账号密文与元信息全部回滚；日志内 SQLITE_CONSTRAINT_TRIGGER 是预期测试事件 |
| 浏览器 | 2 条端到端流程通过：登录、设置/解锁主密码、错误密码、CRUD/清空密文、主题/手机 tab、导入导出、主密码变更、刷新重锁、锁定/退出清空、多个页面过期写入、旧 SW 敏感缓存清理。见 [测试日志](browser-test-results.log)、[结构化结果](browser-test-results.json) 与 [手机截图](account-relation-mobile-verification.png) |
| 公网真实登录 | 正常域名解析、可信 TLS 1.3、Secure/HttpOnly/SameSite Cookie、登录和退出 401 全部通过；无 resolver 覆写，未创建生产保险库。见 [公网浏览器结果](public-browser-verification.json)、[日志](public-browser-verification.log)、[页面截图](account-relation-public-login.png) |
| 依赖与静态检查 | JavaScript 语法、CSP 入口检查、git diff --check 通过；npm audit --omit=dev 报告 0 漏洞，限于本次数据库快照。见 [依赖审计](dependency-audit.log) |
| 整机重启 | boot ID 从 51dffcfa-50c5-4773-9a0d-19d2f289d3a0 变为 a01ba4c2-f5b9-4058-ad39-0a533dbeb0d5；应用 healthy、代理 running；SQLite integrity ok、管理员 1、账号 0、vault 0，证书 SHA256 不变，NTP 正常，无失败服务。见 [重启记录](production-reboot-verification.log)、[外部复核](post-reboot-external-checks.log) |
| 备份恢复 | SQLite 在线备份 + Mac AES-256-GCM 异地副本；临时目录解密恢复 integrity/外键通过，最新生产备份含管理员 1、账号 0、vault 0；假数据恢复另验证客户端解密。见 [备份验证](offsite-backup-verification.log) |

测试均使用隔离临时库和假数据。首发构建缺少编译工具、Compose tmpfs YAML 逗号解析和远端 exec 消耗脚本 stdin 的问题已修复，相应失败原始输出保留为 deployment-*-failure.log；最终发布校验实际 release 标记，不把命令启动当作部署完成。

## 3. 网络、权限与代理路径

- 用户已将阿里云 `account` 记录由旧 GitHub Pages CNAME 改为 A=`203.0.113.10`，TTL 600；公共 DNS 实测一致，无 AAAA。共享 Caddy 按 Host/SNI 分站点并连接应用独立内网，其他应用以后追加独立站点和网络。
- 云端规则由 UI 实际读取：原 TCP 22/80、ICMP ALL；已新增 TCP 443。主机 UFW 默认拒绝入站，双栈仅显式允许 TCP 22/80/443。只有 Caddy 发布 80/443；API 3000、SQLite 数据、Caddy 管理口没有宿主映射。未知 HTTP Host=404，HTTPS Host/SNI 不匹配=421，匿名 API=401。
- 管理员与 deploy 独立密钥登录；root 直接 SSH、密码与交互认证禁用；管理员可 sudo，deploy 无 sudo/Docker 管理权限，不能修改代理/生产配置或读取备份。原本地密码保留用于 VNC。最终重启后重新验证。
- 生产配置由 root 持有：`/etc/account-relation/`；版本源码 `/opt/account-relation/releases/`；数据 `/var/lib/account-relation/`；Caddy 配置 `/opt/apps/reverse-proxy/`，证书 `/var/lib/caddy/`。应用与代理非 root、只读根文件系统、移除 capabilities、no-new-privileges，日志 10m × 3。
- **本机网络问题已定位并修复**：Clash 曾将 `account.loopq.cn` 匹配为 DomainSuffix(cn) → DIRECT，造成间歇性 TLS 失败。在当前 ACTIVE_SUBSCRIPTION 订阅的专用规则中前置 `DOMAIN,account.loopq.cn,TW`；运行时规则列表第 1 条已核对。持久化于 `<HOME>/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/profiles/subscription-rules.yaml`，后续切换其他订阅需自行保留等效规则。
- 路由修复后普通域名经现有台湾代理/TUN 连续 **20/20** 请求成功；中位 0.245s、P95 0.268s、最大 0.292s。这是当前路径短时实测，不代表所有地区或晚高峰保证。
- 原始 TCP connect 扫描受 TUN 接管影响，连随机未开放端口也返回握手成功，该输出已标记无效。协议探测验证 22 SSH、80 HTTP、443 TLS；开发/数据库端口无应用响应，并交叉核对服务器监听、Docker 端口映射及云/UFW 规则。

证据：[云端规则](cloud-network-verification.md)、[DNS](public-dns-verification.json)、[Host 隔离](public-host-isolation.log)、[协议探测](public-port-protocol-verification.log)、[台湾 TUN 实测](taiwan-tun-http-verification.log)、[运行配置与权限](staging-verification.log)。

## 4. 使用、运维与边界

- 登录地址：**https://account.loopq.cn/**；管理员标识 `admin@example.invalid`。随机初始登录密码只保存在本机 `<HOME>/.config/account-relation/admin.json`，权限 0600，不在仓库、镜像、日志或聊天中。首次登录由用户设置并保管自己的保险库主密码；两种密码不同。
- 服务器每日 03:00（Asia/Shanghai）执行一致性备份；Mac 每日 03:17 自动拉取并加密保存。服务端 timer 与本机 launchd 首次实际运行均成功。Mac 离线时不能产生新的异地副本，服务端本地备份仍会执行；已保存副本不会自动删除。
- 本机备份目录 `<HOME>/Backups/account-relation`；独立解密密钥 `<HOME>/.config/account-relation/backup.key`（0600）。应另外保管恢复密钥副本。恢复命令只写不存在的新文件，不覆盖生产库。
- 失败可查看服务器 `account-relation-backup.service` journal，以及本机 `<HOME>/Library/Logs/account-relation/` 日志。目前没有绑定外部邮件/短信告警渠道。
- 发布前生成一致性备份，保存上一镜像环境文件和 Compose 配置；启动健康检查失败时脚本回切。数据库回退需人工确认 schema/备份对应关系，不删 volume。本轮验证了备份恢复和数据库事务回滚，未人为破坏生产镜像做回滚演练。
- GitHub Pages 自动触发已在本地工作流移除；远端仓库/工作流未修改，待用户自行提交推送。全部源码改动保留于当前分支；内部 docs 默认被仓库忽略，必须按文件查看验收记录。
- 本验收文档、原始日志、截图、发布 manifest 及最新验证脚本已归档到服务器 root 专用审计目录 `/root/account-relation-audit/9b2109772aad4384f75b/`。服务器初始化的独立记录在 `<SERVER_SETUP_REPO>/docs/agents/`。
