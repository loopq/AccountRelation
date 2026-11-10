# AccountRelation 部署与验收记录

本节首次部署记录时间：2026-11-08T07:21:46.469104+00:00。生产地址：**https://account.loopq.cn/**。状态：服务器初始化、网页版自托管改造和首次部署完成；生产库为空，首次登录由用户设置自己的保险库主密码。

最新增量（2026-11-10，taskboard #10）：已发布 `bae6614337d5430f9505`（git `d3dcbcc`）。新增两项功能：一是记录每个 Email 账号登录在哪几台设备上，每台设备软上限 5 个，超了变红、保存前确认，仍可保存；Email 列可按设备筛选。二是卡片上的 👁 弹出概况：完整备注、关联到它的账号、创建/更新时间，不解密任何字段。生产库已从 schema 1 自动迁移到 2，只新增了 `devices` 和 `account_devices` 两张空表。保险库、revision、24 个账号、平台、国家的内容指纹跟发布前完全一致，integrity ok，没有外键违规。预发布备份 `predeploy-20261110T064249Z.db` 已核对：v1，内容与发布前一致。**回滚注意**：旧镜像拒绝打开 v2 库，回退到 `53f4acdd93dd9e9a742e` 前必须先恢复这份备份。本机验证 6 组接口测试、v1→v2 迁移检查和 2 条浏览器流程都通过，浏览器测试用的是本机 Chrome。公网 `app.js` / `index.html` 与源码哈希一致。核对过程中有 1 次本机链路 TLS 偶发失败，重试 10/10 通过，如实记录在日志里。全程未登录，未写入 vault。详见 [增量部署日志](device-login-preview-deployment.log)、[数据核对](device-login-preview-data-audit.log)、[公网核对](device-login-preview-public.log)、[执行评审](account-device-login-preview-exec-review.md)。

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
