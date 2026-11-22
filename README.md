# 账号图谱 · AccountRelation

Email 为根，Apple ID / AI 工具关联邮箱和订阅账号。网页版使用同源 Node.js API + SQLite，由 Caddy 提供 HTTPS，不再依赖 Supabase。

密码与 2FA 种子在浏览器用 **PBKDF2-SHA256（60 万次）+ AES-256-GCM** 加密。账号名称、邮箱、手机、备注和关联是服务器可读的元数据。登录密码用于服务端认证，保险库主密码只用于本地解密，二者独立。

## 本地开发

需要 Node.js 24 LTS。依赖版本锁定在 package-lock.json。

```sh
npm ci
# 通过 stdin 提供 JSON {"email":"你的邮箱","password":"至少14字符"}，勿把真实密码写入 shell 历史。
npm run admin < /受控位置/admin.json
npm run dev
```

访问 `http://127.0.0.1:3000`。首次登录后设置至少 6 字符的主密码。刷新必须重新解锁；主密钥不可导出，也不写入 localStorage/sessionStorage。主密码丢失无法找回。

默认数据库是 `data/account.db`。可用 `DATABASE_PATH` 改路径；`APP_ORIGIN` 必须与浏览器地址完全一致；生产必须 HTTPS，`NODE_ENV=production` 会启用 Secure Cookie。修改管理员密码用 `npm run admin -- --reset` 并通过 stdin 提供凭据，会撤销所有会话，不改变保险库主密码。没有网页注册或匿名初始化管理员入口。

## 测试

```sh
npx playwright install chromium
scripts/test.sh
```

接口测试覆盖认证、CSRF、会话、关联、原子导入、轮换完整性/并发冲突及在线备份恢复。浏览器测试使用独立临时库和假账号，覆盖完整 UI、PWA 升级、密钥存储、锁定清理和多个页面并发。原始结果保存在 `docs/deploy`（仓库默认忽略内部文档）。

## 部署

`Dockerfile` 使用固定 digest 的 Node 24 基础镜像，生产进程非 root。API 仅连接每应用独立的 Docker 内网，不发布宿主端口。共享 Caddy 单独占用 80/443，根据 Host/SNI 路由；未配置域名不会显示账号页面。

- `deploy/compose.yaml`：应用容器、持久化、健康检查和资源/日志限制。
- `deploy/proxy-compose.yaml`：共享 Caddy；为后续应用追加独立网络和站点。
- `deploy/Caddyfile`：`account.loopq.cn` 公网 TLS。
- `deploy/Caddyfile.staging`：DNS 切换前的隔离验证配置，使用内部证书，不能视作公网 HTTPS 验收通过。
- `scripts/deploy.sh`：通过 `tencent-seoul-admin` 上传白名单源码包、校验 manifest、构建 amd64 镜像、健康验收，失败恢复上一镜像。不会 git push/commit。来源用 Git 基线 + 每文件 SHA256 + 归档哈希记录，包含未提交源码。

服务器布局：root 发布配置 `/etc/account-relation`；源码版本 `/opt/account-relation/releases`；数据库 `/var/lib/account-relation`；共享代理 `/opt/apps/reverse-proxy`。`deploy` 用户不拥有 Docker 或 sudo 权限，也不能修改上述生产配置。

生产初始化凭据由服务器 CLI 创建，保存到受控文件后由用户读取；禁止提交 Git、打印到部署日志或写入镜像。首次上线为空库，不迁移旧 Supabase 数据。仅在 HTTPS、登录、备份恢复全部验收后录入真实数据。

旧 GitHub Pages workflow 已取消 push 自动触发，并由 `ENABLE_LEGACY_PAGES` 显式开关保护；纯静态 Pages 无法运行新版 API。远端工作流要等用户自行提交推送才会改变。

## 备份与回滚

`node server/backup.js /新路径/backup.db` 使用 SQLite 在线备份接口并检查完整性，支持 WAL；不要直接复制正在写入的主 DB 文件。

`node scripts/backup.mjs` 通过管理员 SSH 获取一致副本，并在本机用 AES-256-GCM 加密到 `~/Backups/account-relation`。独立密钥在 `~/.config/account-relation/backup.key`，0600；应另行保管其恢复副本。`scripts/restore-backup.mjs` 只恢复到不存在的新文件并检查 integrity/外键，不会覆盖生产数据库。自动任务的成功/失败写本地日志；Mac 离线时无法拉取，远端本地备份不能替代异地副本。

发布前备份数据库并保留上一镜像。恢复代码使用 `/etc/account-relation/previous.env`；数据库恢复必须停止应用并使用经过检查的完整备份，不删除 volume、不把新 schema 的库强行交给旧代码。当前 schema 版本 6；未来迁移应逐版本增加，拒绝打开更高版本库。schema 已升到 6，回退到旧镜像前必须先恢复对应的 `predeploy-*.db`（旧镜像遇到 v6 库会拒绝启动），或先停止应用并执行 `DROP TABLE password_history; PRAGMA user_version=5;` 降级（降到 v5，保留账号与发布后的其他写入）。

## 范围

`mobile/` 是独立 Flutter 客户端，仍使用自己的旧协议，本次没有改造或重新构建。`supabase/schema.sql` 是历史/移动端参考，未打入网页版镜像。原 UI 的分类、主题、手机 tab、导入导出、关联与加密功能保留，新增 Email 账号登录设备记录与卡片概况预览（眼睛图标弹窗）。2026-11-11 重做了表现层：系统字体、内联 SVG 图标、品牌化登录/解锁页、分组表单、带遮罩的抽屉，以及 header 的跨列搜索（按 `/` 聚焦）；样式仍内联在 `web/index.html`，没有新增静态文件或构建步骤。Email 账号可记录 Claude 情况状态 / 日期，并在 Email 列顶部按状态盘点筛选。
