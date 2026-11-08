# 云端网络验收记录

2026-11-08，通过 Chrome 原生界面实际读取并修改腾讯云首尔实例 <INSTANCE_ID>（203.0.113.10）的防火墙。

- 变更前：TCP 22、TCP 80、ICMP ALL，来源均为全部 IPv4。
- 按已批准部署计划新增：TCP 443，来源 0.0.0.0/0，允许；备注 Shared Caddy HTTPS - account.loopq.cn。
- 提交后页面显示“操作成功”；重新读取表格共 4 条，确认 HTTPS (443) 已存在。未执行“一键放通”，未修改 SSH 规则。
- 域名由用户在阿里云修改；截图显示 account / A / 203.0.113.10 / TTL 10 分钟，实际图片已查看。
- 公共 DNS over HTTPS 查询已返回 A=203.0.113.10；旧 CNAME=loopq.github.io 已不在该回答内。
- 此记录与主机 UFW/监听端口验收独立；IPv6 未启用，无 AAAA 部署。
