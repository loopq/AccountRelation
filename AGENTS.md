# AccountRelation（账号图谱）

个人账号保险库：Email 为根，Apple ID / AI 工具账号关联到注册邮箱和订阅账号。线上 https://account.loopq.cn 运行的是 `main` 分支。本仓库是公开仓库。

## 技术栈与目录

- Node 24 + Express 5 + better-sqlite3 + zod 4；前端是原生 JS，没有构建步骤。
- `server/`：`index.js` 入口；`app.js` 路由、安全头、静态文件白名单；`store.js` SQLite schema、迁移和所有写操作；`validation.js` 用 zod 定义的请求 schema，这里是信任边界；`auth.js` 管登录、会话和 CSRF；`passkey.js` 实现 WebAuthn PRF（Face ID）解锁。
- `web/`：`index.html`（样式全部内联，图标是页内 SVG sprite）；`app.js`（全部 UI 逻辑）；`crypto.js`（浏览器端加密）；`sw.js`（PWA 壳缓存）。
- `test/`：`api.test.js`（node:test）；`browser.spec.js`（Playwright）；`browser-server.js`（用隔离的临时库起测试服务器，端口 3107）。
- `deploy/`、`Dockerfile`、`scripts/deploy.sh`：生产部署。
- `mobile/`（Flutter）和 `supabase/` 是旧版历史，网页版不用。没有明确要求不要改。

## 命令

- 安装：`npm ci`。第一次跑浏览器测试前还要 `npx playwright install chromium chromium-headless-shell`，因为 Playwright 1.65 的 headless 模式用的是 headless-shell。
- 本地运行：`npm run dev`，地址 http://127.0.0.1:3000。管理员账号用 `npm run admin` 创建，凭据通过 stdin 传入，不要写进 shell 历史。
- 改完代码依次跑：`npm run check`（语法和 CSP 入口检查）→ `npm test` → `npm run test:browser`。`scripts/test.sh` 会一次跑完，并把日志写进 `docs/deploy/`；它最后的 `npm audit` 偶尔会因为 TLS 断连失败，重跑一次即可，这不代表测试失败。
- 接口测试和浏览器测试都要监听 127.0.0.1。沙箱不允许监听端口时，如实报告没跑成，不要用替代脚本冒充测试通过。

## 数据与安全约定

- 密码和 2FA 种子只在浏览器里加密（`encrypted_*` 字段，`v2:` 格式的密文），服务端永远拿不到明文。其他字段是服务器可读的元数据。接口返回、日志和存储里都不能出现明文密钥。
- 所有写操作都走 `store.mutate()`，用 `expectedRevision` + `expectedSalt` 做乐观并发，冲突返回 409。
- 只对某个分类生效的字段（比如 Email 账号的 `device_ids`、`passkey_enabled`、`claude_*`）由服务端在 `saveAccount()` 里校验：请求里明确给了冲突的值，返回 400；因为改分类或改状态而失效的旧值，自动清空并写回库。前端隐藏字段只是交互体验，不算校验。
- 新增 schema 字段的清单：
  - `PRAGMA user_version` 加 1，加上版本守卫和 `if (version < N)` 迁移块，迁移只做 `ADD COLUMN`，不改旧数据；
  - 同步改 `accountColumns` 和 `validation.js`；
  - 迁移测试：已有的降级重开用例要先 DROP 新列，再加一个 v(N-1)→vN 的用例；
  - README 里的 schema 版本号和回滚 SQL 一起改。

## 前端约定

- 样式全部内联在 `web/index.html`；CSP 禁止内联脚本。
- 新增静态文件要改五处：`server/app.js` 的 `staticPaths`、`web/sw.js` 的 `SHELL`、`scripts/package-release.py`、`Dockerfile`、`.dockerignore`。能不加就不加，别为此把 CSS 拆成单独文件。
- 用户输入渲染之前一律经过 `esc()`。

## 文档

- `docs/deploy/` 放部署验收文档、测试和部署日志、截图、`current-release.txt`，是唯一提交进 git 的 docs 目录。提交前按 `docs/deploy/git-publication-sanitization.md` 脱敏：本机绝对路径换成 `<ACCOUNT_RELATION_REPO>` 或 `<HOME>`，服务器 IP 换成 RFC 5737 示例地址。
- `npm run test:browser` 会改写 `docs/deploy/browser-test-results.json`（里面带本机绝对路径）和 `account-relation-mobile-verification.png`。不打算提交的话，用 `git checkout -- docs/deploy/` 恢复。
- plan 和 review 放在本地的 `docs/plans/`、`docs/reviews/`（已 gitignore，不发布），文件名按所做的事命名。不要再建 `docs/agents/`。
- 历史记录（日志、旧的验收段落）里出现的路径和分支名保持原样，不回改。

## 发布

- `scripts/deploy.sh` 的流程：
  1. 打包白名单源码，release id 是源码 manifest 的哈希，未提交的改动也算在内；
  2. 服务器核对 manifest，构建 amd64 镜像；
  3. 自动做一份 `predeploy-*.db` 备份；
  4. 健康检查，失败就回切上一个镜像；
  5. 成功后写 `docs/deploy/current-release.txt`。
- 涉及 schema 的发布，前后各核对一次：在容器里只读打开 `/data/account.db`，看 `user_version`、`integrity_check`、各表行数和内容指纹，只输出计数和指纹，不输出数据。公网核对 `index.html` 和 `app.js` 的哈希、`/health` 返回 200、匿名访问 `/api/state` 返回 401。
- 验收结果写进 `docs/deploy/account-relation-deployment-verification.md` 顶部的「最新增量」，证据日志放在同一目录。
- 旧镜像拒绝打开 schema 版本更高的库。回滚时要么先恢复 predeploy 备份，要么 DROP 新列并把 `user_version` 改回去。

## Git

- 只有一个分支 `main`。提交信息用中文加约定式前缀，例如 `feat(web): …`、`docs(deploy): 记录 #N … 发布版本 <release>`。功能代码和发布记录分两次提交。
