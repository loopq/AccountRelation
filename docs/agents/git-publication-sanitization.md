# Git 发布记录与脱敏说明

本目录是用户授权提交到 GitHub 的脱敏审计副本；原始记录已保留在本机独立私有目录及原服务器审计归档中。脱敏副本不再与旧归档哈希逐字匹配；原 receipt 中的 SHA256 指原始归档。

## 脱敏范围

- 真实服务器/内网/代理 IP 统一替换为 RFC 5737 示例地址，保留本地 loopback 与通配监听地址以说明端口边界。203.0.113.10 是示例，不能用于部署。
- 个人机器绝对路径替换为 HOME、TMPDIR 或仓库占位符；云实例 ID、SSH 主机指纹、订阅配置标识脱敏。
- 历史 diff 中的旧 Supabase 项目地址、公开客户端 key 脱敏；密码、SSH 私钥、管理员 JSON、备份解密密钥、数据库与加密备份均不提交。
- app 域名 account.loopq.cn 是已公开且需工作的部署目标，保留。发布版本、源码/镜像 SHA256、测试退出码和失败记录保留，未把失败记录改成通过；为 Git 审阅统一换行并去除行尾空格。
- 登录页截图采用未输入任何账号/密码的当前页面重新采集；手机截图只含测试假数据。历史浏览器测试中的 example.test 账号和测试密码是隔离测试夹具，不是生产凭据。

## Git 身份与发布边界

- SSH 握手已确认 GitHub 身份为 loopq；仓库级 SSH 配置固定使用该身份。
- commit 作者使用 loopq 与 GitHub noreply 邮箱；不提交本机 SSH 配置或 Git 凭据。
- 提交并正常 push，不 force push、不改写已有远端历史。AccountRelation 保留在 feat/self-hosted-web；Flutter 本轮不改动。
- AccountRelation 历史 main/mobile 中已有的公开 Supabase publishable key 属于客户端公开配置，不是 service_role/私钥。本次改造不再给网页版使用它；未改写共享历史或修改 Flutter。历史扫描的判定另记于 secret-scan-summary.json。

扫描结果：Gitleaks 对待提交差异与完整暂存树扫描通过；与本机已知生产登录密码、服务器凭据、备份密钥做精确匹配，未命中；没有暂存数据库、私钥、备份或 admin.json。逐项记录见 secret-scan-summary.json。
