# 内网部署快速检查清单

## 📋 部署前准备

### 环境要求
- [ ] Node.js >= 18.x
- [ ] PostgreSQL >= 14.x
- [ ] Redis >= 6.x
- [ ] pnpm >= 8.x

### 审计合规
- [ ] 确认网络环境为纯内网（无法访问公网）
- [ ] 准备好内网NTP服务器（可选）
- [ ] 准备好内网邮件服务器（用于通知）
- [ ] 准备好内网对象存储（可选，如MinIO）

## 🔧 配置修改检查

### 代码层面（已完成 ✅）
- [x] 禁用遥测服务 (`apps/server/src/integrations/telemetry/telemetry.service.ts`)
- [x] 移除PostHog分析 (`apps/client/src/main.tsx`)
- [x] 移除Excalidraw CDN (`apps/client/src/features/editor/components/excalidraw/excalidraw-view.tsx`)
- [x] 移除品牌外链 (`apps/client/src/features/share/components/share-branding.tsx`)

### 环境变量配置
- [ ] 复制 `.env.internal.example` 为 `.env`
- [ ] 设置 `APP_SECRET` (至少32字符)
- [ ] 设置 `APP_URL` 为内网域名
- [ ] 设置 `DATABASE_URL` 连接信息
- [ ] 设置 `REDIS_URL` 连接信息
- [ ] 设置 `CLOUD=false` ⚠️ **必须**
- [ ] 设置 `DISABLE_TELEMETRY=true` ⚠️ **必须**
- [ ] 配置 `MAIL_DRIVER=smtp` 和邮件服务器信息
- [ ] 配置 `STORAGE_DRIVER` (local 或 s3)
- [ ] 如使用Draw.io，配置 `DRAWIO_URL` 为内网地址

## 🗄️ 数据库初始化

```bash
# 1. 创建数据库
createdb docmost

# 2. 运行迁移
pnpm --filter ./apps/server run migration:latest

# 3. 生成数据库类型（可选）
pnpm --filter ./apps/server run migration:codegen
```

- [ ] 数据库创建成功
- [ ] 迁移脚本执行成功
- [ ] 数据库连接测试通过

## 🏗️ 构建部署

```bash
# 安装依赖
pnpm install

# 构建客户端
pnpm client:build

# 构建服务器
pnpm server:build

# 启动服务（生产模式）
pnpm start
```

- [ ] 依赖安装成功（无网络错误）
- [ ] 客户端构建成功 (`apps/client/dist` 目录存在)
- [ ] 服务器构建成功 (`apps/server/dist` 目录存在)
- [ ] 服务启动成功，监听在配置的端口

## 🔍 功能验证

### 基础功能
- [ ] 访问首页，显示正常
- [ ] 初始化向导页面正常 (`/setup/register`)
- [ ] 创建管理员账号成功
- [ ] 登录功能正常
- [ ] 创建工作区成功

### 编辑器功能
- [ ] 创建文档正常
- [ ] 文本编辑正常
- [ ] 富文本格式正常（加粗、斜体、列表等）
- [ ] 图片上传正常
- [ ] 文件附件上传正常

### 协作功能
- [ ] 创建空间正常
- [ ] 邀请成员正常
- [ ] 权限控制正常
- [ ] 实时协作编辑正常（多人同时编辑）
- [ ] 评论功能正常

### 搜索功能
- [ ] 全文搜索正常
- [ ] 搜索结果准确

### 导入导出
- [ ] Markdown导入正常
- [ ] Markdown导出正常
- [ ] HTML导出正常

### 绘图工具
- [ ] Excalidraw绘图正常（如果启用）
- [ ] Draw.io绘图正常（如果配置了内网服务）

## 🚫 EE功能禁用验证

### UI检查
- [ ] 设置菜单中**没有** "Billing" 选项
- [ ] 设置菜单中**没有** "License" 选项  
- [ ] 设置菜单中**没有** "Security"/"SSO" 选项
- [ ] 设置菜单中**没有** "API Keys" (工作区级别) 选项
- [ ] 登录页面**没有** SSO登录按钮
- [ ] 页面顶部**没有** Trial到期提示

### 网络检查
```bash
# 在服务器上监控网络流量
tcpdump -i any -n 'tcp port 80 or tcp port 443' | grep -v '内网IP'

# 或使用浏览器开发工具 Network 标签
# 确认没有对外HTTP/HTTPS请求
```

- [ ] 无对 `tel.docmost.com` 的请求
- [ ] 无对 `posthog` 的请求
- [ ] 无对 `unpkg.com` 的请求
- [ ] 无对 `docmost.com` 的请求
- [ ] 无对 `embed.diagrams.net` 的请求（如已配置内网Draw.io）

## 🔐 安全加固

### 访问控制
- [ ] 数据库只允许本地访问 (`listen_addresses = 'localhost'`)
- [ ] Redis只允许本地访问 (`bind 127.0.0.1`)
- [ ] 配置Nginx/Caddy反向代理
- [ ] 启用HTTPS（使用内网CA证书）
- [ ] 配置防火墙规则

### 数据备份
- [ ] 配置数据库自动备份
- [ ] 配置文件存储备份
- [ ] 测试恢复流程
- [ ] 制定备份策略文档

### 日志审计
- [ ] 配置应用日志
- [ ] 配置访问日志
- [ ] 配置错误日志
- [ ] 设置日志轮转

## 📊 性能优化

- [ ] 配置数据库连接池 (`DATABASE_MAX_POOL`)
- [ ] 配置Redis持久化
- [ ] 启用客户端静态资源缓存
- [ ] 配置CDN（如有内网CDN）

## 📚 文档准备

- [ ] 系统架构文档
- [ ] 运维手册
- [ ] 用户使用手册
- [ ] 故障排查手册
- [ ] 备份恢复流程
- [ ] 应急预案

## 🧪 压力测试

- [ ] 并发用户测试 (10/50/100人)
- [ ] 大文件上传测试 (50MB+)
- [ ] 长时间运行稳定性测试 (24h+)
- [ ] 资源占用监控 (CPU/内存/磁盘)

## ✅ 上线前最终检查

### 关键配置确认
```bash
# 检查环境变量
grep -E "CLOUD|DISABLE_TELEMETRY" .env

# 应输出:
# CLOUD=false
# DISABLE_TELEMETRY=true
```

- [ ] `CLOUD=false` 已设置
- [ ] `DISABLE_TELEMETRY=true` 已设置
- [ ] `APP_SECRET` 强度足够（32+字符）
- [ ] `DATABASE_URL` 密码强度足够
- [ ] 所有敏感信息已妥善保管

### 服务状态
- [ ] PostgreSQL服务运行正常
- [ ] Redis服务运行正常
- [ ] Docmost服务运行正常
- [ ] Nginx/Caddy服务运行正常
- [ ] 邮件服务正常（发送测试邮件）


**检查完成签名**: __________________ 
**日期**: __________________

**备注**: 
- 本检查清单基于 Docmost 内网部署方案
- 所有修改已记录在 `INTERNAL_NETWORK_DEPLOYMENT_GUIDE.md`
- EE功能已通过配置禁用，代码保留以符合AGPL 3.0
