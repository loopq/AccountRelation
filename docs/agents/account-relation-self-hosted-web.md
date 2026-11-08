# AccountRelation 网页版自托管改造与部署

状态：用户于 2026-11-08 明确批准“继续改造和部署”；现已实施并通过验收。结果及边界见 [部署验收记录](account-relation-deployment-verification.md)。

依据：既有部署交接清单（本机原始附件）、[服务器初始化记录](https://github.com/loopq/tencent-ubuntu/blob/main/docs/agents/tencent-seoul-initial-setup.md)。域名由用户确定为 `account.loopq.cn`；制定方案时尚未指向服务器，实施时用户已将其改为 A=`203.0.113.10`，并通过公网 HTTPS 验收。同机以后通过共享 Caddy 承载多个域名/应用。

## 1. 范围、现状与选择

- 已执行 `git fetch origin`、`git switch main`、`git rebase origin/main`，main 从 2f52b3b 更新至 4878342，零本地待合并提交、无冲突；新分支 `feat/self-hosted-web`。不 commit/push。
- 网页当前为 976 行单文件、Supabase Auth/数据库、PWA。mobile-impl 已合入 main，但 Flutter 的源码、构建、分支不属于本次改造；旧 Supabase SQL 留作历史/移动端参考，不在服务器执行或打入生产镜像。
- 保留现有页面布局、主题、手机分类 tab、邮箱/Apple/AI 分类、关联、加密、批量导入和导出。全新空库，不迁移 Supabase 用户/旧密文。
- 使用 Node.js 24 LTS、Express 5、SQLite（better-sqlite3）、Argon2id。锁定实际依赖版本及 lockfile。2C4G 足够；当前单用户关系表和事务不需要额外 PostgreSQL 常驻服务，选择 SQLite 减少运维对象。
- 数据仍为密码/2FA 种子客户端加密，账号名、邮箱、手机号、备注和关联为服务器可读元数据；不得称“完全零知识”。继续 PBKDF2-SHA256 600000 次 + AES-256-GCM，随机 12 字节 IV；主密码只存在浏览器。
- 修复已确认风险：原始主密钥 sessionStorage 持久化、同源 API 被旧 SW 缓存、改主密码无并发完整性条件、锁屏后抽屉明文残留与异步解密回填。

## 2. 数据、API 与安全契约

- SQLite 使用 foreign_keys、WAL、busy_timeout、版本化 schema；只初始化不存在的数据库，不删表重建。保留 platforms/countries/accounts/vault_meta；增加单管理员、服务端会话及全局数据 revision。账号自关联删除 SET NULL，平台/地区被引用时拒绝删除，关联必须符合类别。
- 登录身份与保险库主密码分开。仅服务器 CLI 预创建一个管理员，无网页注册、公开初始化或重置入口。管理员密码 Argon2id 哈希；生产初始随机密码保存在受控位置，不写 Git/日志/聊天，用户可经 SSH 读取或用 CLI 重置。重置管理员密码撤销全部会话，但不重置保险库主密码。
- 随机会话令牌只以哈希入库；生产 Cookie HttpOnly、Secure、SameSite=Strict、Path=/，固定过期，登录轮换、退出删除。所有 /api 业务入口先鉴权；写入强制同源 Origin 和会话 CSRF token（登录也校验 Origin），严格 JSON/长度/UUID/类别/色值/密文结构校验，参数化 SQL。登录限速、并发哈希数量受限；生产无敏感请求体日志。
- API：GET /health；GET /api/session；POST /api/login、/api/logout；GET /api/state（账号/平台/地区/vault 元信息 + revision 的一致快照）；POST /api/vault/init；POST /api/vault/rotate；POST/PATCH/DELETE /api/accounts；POST/DELETE /api/platforms、/api/countries；POST /api/accounts/import（整批事务）。所有变更携带 expectedRevision，过期返回 409；前端不盲目用旧密钥重试。
- 主密码轮换同一 SQLite 事务更新 salt/canary 与每个现存密文字段。revision 必须一致，待更新 ID 集合和字段覆盖精确匹配；并发创建/更新/删除或漏项全部拒绝且不部分提交。事务成功后前端才换内存密钥。其他标签页旧密钥写入因 revision 不符被拒绝，重新解锁后才能继续。
- CryptoKey 不可导出、只驻留内存；刷新必须重新解锁，清理旧 storage 密钥与旧 Supabase 配置。锁定/退出清理 UI、表单、状态、剪贴板定时器并使未结束的解密/请求失效；不声称 JS 内存可硬擦除。
- 脚本改为本地模块以支持 CSP script-src 'self'，无 CDN/外部 SDK。保留现有 CSS/样式，数据渲染保持转义，UUID/颜色有服务端约束。敏感响应 Cache-Control: no-store；SW 新版本仅允许静态资源白名单，显式绕过 /api、/auth、非 GET，并清理旧缓存。验证已有旧 SW 升级路径。
- 导出包含加密元信息与 revision，明确元数据未加密；现有明文 JSON 导入在客户端加密后整体提交，失败不部分写入。

## 3. 文件与部署执行顺序

1. 增加 server 的数据库、认证、校验、HTTP 入口、管理员 CLI、SQLite 一致性备份工具；增加 package.json/lockfile、必要测试和本地开发入口。修改 web/index.html 并提取 app/crypto/theme 模块，修改 web/sw.js；保留 UI 和 mobile。
2. 提供可重复 check/test/build/deploy/backup 命令；Docker 以 Node 24、linux/amd64 构建，生产进程非 root、cap_drop、no-new-privileges、只读根文件系统及持久化数据目录、健康检查、日志限制和 restart 策略。Mac 当前无 Docker CLI，首发按清单允许从锁定本地源码归档在服务器构建；记录 Git 基线、dirty diff、源码 SHA256、镜像 ID/digest、schema 版本，不声称未提交代码等于 Git commit。
3. 共享 Caddy 独占宿主机 80/443，配置由 root 持有。`account.loopq.cn` 专属站点、证书、上游和 Docker 网络；后续应用各自网络，Caddy 加入所需网络；未匹配域名返回拒绝/404，绝不落到账号页。AccountRelation API 不映射公网端口，DB 不提供 TCP 服务。
4. 先本地假数据测试，再服务器隔离部署/Host 路由验收。准备健康可用服务后，将域名 DNS 从旧 GitHub Pages 指向本机；如无 DNS 管理接口，则该唯一动作由用户完成。共享 Caddy 就绪时才增加 UFW TCP 80/443；保持 SSH 公钥/权限边界，不授予 deploy sudo/docker。云端防火墙必须独立核验，外部不可达时定位而不假称已配置。
5. 修改旧 Pages workflow 防止迁移版仍自动发布到纯静态 Pages（本地关闭自动触发；远端不会被修改，因为不 push）；README 更新到实际自托管用法。DNS 切换前保留现有远端服务。
6. 生产空库只创建管理员；功能测试使用隔离测试库和假账号。使用 SQLite 在线 backup API 制作一致副本，传到当前 Mac 独立于 VPS 的受控目录并加密，恢复到隔离库检查完整性/关联/解密。备份密钥在 Mac 独立保管；每日自动备份及失败记录落地，离线 Mac/外部告警渠道限制明确记载。发布保留前一镜像/配置和 DB 备份，回滚不删除 volume。
7. 记录域名、容器、监听、防火墙、权限、证书、版本、测试、备份恢复和重启结果到 docs/agents；服务器同时保留受控部署与验收记录。任何 DNS/控制台不可访问的步骤明确保留待办，不算目标完成。

## 4. 验收矩阵与完成门槛

- 安全/API：匿名读写拒绝；无注册入口；错误登录/限速；session 固定、失效、退出；CSRF/跨域；无效类型/长度/关联；SQL/XSS 输入；静态目录不可读 DB/env；日志无密码/令牌；只接受同源 API。
- 数据/密码：CRUD、分类关联、SET NULL、平台/地区引用保护；密码/2FA 各种组合；初始化并发；轮换成功与失败回滚、同数量不同 ID、并发编辑/新增/删除；空库；旧密钥过期写入；密钥不可导出与不落 storage；导入原子性。
- 浏览器：登录/首设/解锁/错误密码、添加/编辑/清空字段/删除、主题/手机 tab、锁定和退出清空、刷新重新解锁、导入/导出、轮换后旧密码失败新密码解锁、SW 缓存白名单与旧缓存清理。自动化用独立临时目录/假数据，不触碰真实浏览器资料。
- 部署：构建与依赖审计、目标 amd64、非 root、资源/日志上限、healthcheck、Host 区分（正确域名到账号页、其他域名不串站）、TLS/HTTP 跳转、浏览器同源访问、服务/主机重启恢复、SQLite 持久化、端口只有 SSH/Caddy；只要域名仍未指向新机，公网部署不能标记完成。
- 备份：在有 WAL 写入的情况下在线一致备份、Mac 加密异地副本、隔离恢复的 integrity_check/foreign_key_check 与假数据解密；失败有退出码和日志。
- 所有结果保存原始输出及短结论；不将“测试通过”等同安全保证。真实账号数据只在 HTTPS、认证、备份恢复全部验收后录入。

官方依据：[Node LTS](https://nodejs.org/en/about/previous-releases)、[Express 安全实践](https://expressjs.com/en/advanced/best-practice-security/)、[better-sqlite3 事务与 backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)、[Argon2](https://github.com/ranisalt/node-argon2)。

实施补充：root 消费的 Compose/发布元信息放在 `/etc/account-relation/`，root 审核后的源码包放在 `/opt/account-relation/releases/`，SQLite 位于 `/var/lib/account-relation/`。不把 root 执行配置放进 deploy 可写的应用上传目录或其子目录。

完成记录：生产发布 9b2109772aad4384f75b，HTTPS / 多域名隔离 / 服务器重启 / 本机与服务器测试 / 异地加密备份恢复全部完成。额外修复本机 Clash 对 .cn 域名误走 DIRECT 的路径，以当前订阅专用 DOMAIN 规则走已有 TW 组；实际 20/20 HTTP 成功。初始管理员凭据保存在本机 0600 文件，生产保险库由用户首次登录后自行设置。


## 保险库主密码最小长度调整（2026-11-08）

授权与范围：用户明确要求把保险库主密码最低长度放宽到 6 位；按 6 个字符处理，允许纯数字。此次具体调整已获用户指示，先记录本实施补充，再执行代码与部署。

1. 首次设置和更改主密码的长度校验从 12 统一改为 6，同步提示和 README；已有密码的解锁逻辑、加密算法、登录密码规则不变。
2. 用现有浏览器流程验证 5 字符被拒绝，6 位纯数字可首次设置、轮换、刷新解锁并解密原数据；运行现有检查与接口测试。
3. 沿用既有发布脚本，发布前一致性备份，部署健康检查；公网核对新脚本内容。只改变允许设置的长度，不替用户修改任何实际密码或生产保险库。记录生产数据指纹、版本、测试和发布结果，不使用旧初始管理员 JSON 登录。


6 位规则实施结果：已发布 `53f4acdd93dd9e9a742e`，首次设置/修改主密码和提示统一为最低 6 个字符；现有两条浏览器流程及五组接口测试通过。首次 5 位拒绝且不初始化、改密 5 位拒绝且数据不变；6 位纯数字首次设置/轮换/刷新解锁/原数据解密通过。公网 app.js SHA256 与本地完全一致，容器 healthy。发布前已完成一致性备份；备份与当前的 revision/vault/accounts/platforms/countries 全部一致。管理员凭据指纹在本轮期间发生变化，本轮未执行管理员重置，不把该变化归因于本次前端发布，也不覆盖回退。原始证据见同目录 vault-password-six-*.log。
