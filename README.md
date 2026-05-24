# 账号图谱 · Account Graph

客户端加密的个人账号关系管理。**Email 为根**，Apple ID / AI 工具挂在 Email 下，关系清晰可查。密码与 2FA 密钥在浏览器本地用主密码加密，云端（Supabase）**只存密文**。

## 特性

- **三等分分类**：📧 Email / 🍎 Apple / 🤖 AI 工具
- **客户端加密**：WebCrypto（PBKDF2 60 万次迭代 + AES-256-GCM），云端零明文，连数据库管理员也解不开
- **清晰关联**：Apple/AI 关联注册邮箱，AI 关联订阅的 Apple ID（不用抽象关系图）
- **安全**：Supabase Auth 登录 + RLS（行级安全）+ 关闭注册，publishable key 公开也无害
- 主密码可改（全量重加密、验证旧密码）、批量导入、亮/暗/跟随系统主题、国家颜色标注
- 纯静态单文件，无构建，GitHub Pages 即可托管

## 自部署（连你自己的 Supabase）

### 1. 建数据库
- 在 [supabase.com](https://supabase.com) 注册并新建项目
- 进 **SQL Editor**，把 [`supabase/schema.sql`](supabase/schema.sql) 完整粘贴运行（建表 + 默认平台/国家 + RPC + RLS）

### 2. 配置 Auth（关键安全步骤，别漏）
- **Authentication → Users → Add user**：建你的登录账号（邮箱 + 密码，勾选 **Auto Confirm User**）
- **Authentication → 关闭 "Allow new users to sign up"**（禁止他人注册）
- 不做这两步，任何人注册即可访问你的库

### 3. 拿连接信息
- **Project Settings → API**：复制 **Project URL** + **publishable key**

### 4. 跑起来（二选一）
- **用现成站点**：打开 https://account.loopq.cn ，首次进入的「配置」界面填**你自己的** URL + key（存你浏览器本地，连你自己的库，与他人互不相干）
- **自己部署**：Fork 本仓库 → 仓库 Settings → Pages → Source 选 **GitHub Actions** → push 自动部署 →（可选）绑定自定义域名

### 5. 首次使用
配置 Supabase → 用步骤 2 建的账号登录 → 设主密码（**牢记，丢失则数据永久不可解**）→ 开始添加账号

## 安全模型

| 谁 | 能看到 |
|---|---|
| 你的浏览器（已解锁） | 明文（用完即释放） |
| 网络 / Supabase / 数据库 | **仅密文** |
| 拿到 publishable key 的陌生人 | 什么都拿不到（匿名被 RLS 拒 + 注册已关） |

- 密码、2FA 密钥：主密码派生 key 本地加解密，永不上传
- 主密码不上传、无法找回
- 辅助邮箱、手机号、国家等是元数据，明文存（本就不算 secret）

## 技术栈

纯静态 HTML + WebCrypto · Supabase（Postgres + Auth + RLS）· GitHub Pages

## 目录

```
web/index.html         应用本体（单文件）
supabase/schema.sql    建库脚本
.github/workflows/     Pages 自动部署
```
