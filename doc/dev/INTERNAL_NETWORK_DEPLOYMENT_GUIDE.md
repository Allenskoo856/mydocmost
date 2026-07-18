# 内网部署修改指南

## 修改概述

本文档记录为满足内网部署和AGPL 3.0合规性要求所做的所有修改。

## 一、外网连接移除

### 1.1 后端遥测服务 ✅

**文件**: `apps/server/src/integrations/telemetry/telemetry.service.ts`
**修改**: 禁用向 `https://tel.docmost.com/api/event` 的数据上报
**状态**: 已完成

### 1.2 PostHog分析服务 ✅

**文件**: `apps/client/src/main.tsx`
**修改**: 移除PostHog初始化和Provider
**状态**: 已完成

### 1.3 Excalidraw CDN ✅

**文件**: `apps/client/src/features/editor/components/excalidraw/excalidraw-view.tsx`
**修改**: 注释掉unpkg CDN替换逻辑
**注意**: Excalidraw库仍需npm安装，不依赖外网CDN
**状态**: 已完成

### 1.4 品牌外链 ✅

**文件**: `apps/client/src/features/share/components/share-branding.tsx`
**修改**: 移除 "Powered by 文档中心" 链接
**状态**: 已完成

### 1.5 Draw.io服务 ⚠️

**文件**: `apps/client/src/lib/config.ts`
**默认值**: `https://embed.diagrams.net`
**建议**: 部署时设置环境变量 `DRAWIO_URL` 为内网自建服务地址

## 二、企业版(EE)功能移除方案

由于EE功能深度集成到核心代码中，完全删除需要大量修改。以下是两种方案：

### 方案A：保留EE代码但禁用功能（推荐）

**优点**:

- 修改量小，风险低
- 代码结构完整，便于后续维护
- 符合AGPL 3.0（代码开源，功能可选）

**实施步骤**:

1. 在`.env`中设置 `CLOUD=false`
2. 所有EE功能会自动隐藏（通过 `isCloud()` 判断）
3. 保留`apps/client/src/ee`目录但不使用

### 方案B：完全删除EE模块（彻底但复杂）

**需要修改的文件** (共约60+个):

#### 2.1 App路由 (`apps/client/src/App.tsx`)

- 删除Billing页面路由
- 删除Security页面路由
- 删除License页面路由
- 删除MFA相关路由
- 删除API Key相关路由
- 删除AI Settings路由
- 删除Cloud Login相关路由

#### 2.2 设置侧边栏 (`apps/client/src/components/settings/settings-sidebar.tsx`)

需要删除的菜单项:

- Billing (计费)
- Security (安全/SSO)
- License (许可证)
- API Keys (API密钥管理)
- AI Settings (AI设置)

#### 2.3 核心功能集成

需要移除EE导入的主要文件:

- `apps/client/src/components/layouts/global/layout.tsx` - PosthogUser组件
- `apps/client/src/components/layouts/global/app-header.tsx` - Trial提示
- `apps/client/src/components/layouts/global/global-app-shell.tsx` - Trial结束Action
- `apps/client/src/features/auth/*` - SSO登录集成
- `apps/client/src/features/share/components/share-modal.tsx` - Trial限制
- `apps/client/src/features/search/*` - AI搜索
- `apps/client/src/features/comment/*` - 评论解决功能
- `apps/client/src/features/user/*` - MFA设置

### 2.4 后端EE模块

**文件**: `apps/server/src/ee/`
**状态**: 目录已存在但为空
**操作**: 无需修改

## 三、AGPL 3.0合规性说明

### 3.1 许可证解读

根据AGPL 3.0协议:

- ✅ 允许内部企业使用
- ✅ 允许修改源代码
- ✅ 不要求对内网用户开放源码（仅内部使用）
- ⚠️ 如对外提供服务（SaaS），必须开放源代码

### 3.2 EE目录的合规性

**问题**: `apps/client/src/ee` 目录中的代码是否合规？

**解答**:

- 该目录有独立的 `LICENSE` 文件
- 内容可能是企业版特有功能
- **建议**: 联系原作者确认EE代码的具体许可

### 3.3 推荐做法

对于内网部署:

1. **保留EE代码**: 符合AGPL要求（完整源码）
2. **通过配置禁用**: 设置`CLOUD=false`让功能不可见
3. **移除外网调用**: 满足审计要求
4. **文档记录**: 本文档作为合规证明

## 四、部署环境变量配置

创建 `.env` 文件并设置:

```bash
# 基础配置
NODE_ENV=production
APP_URL=http://your-internal-domain.com
PORT=3000

# 禁用云服务相关功能
CLOUD=false

# 禁用遥测
DISABLE_TELEMETRY=true

# 内网Draw.io服务(可选)
DRAWIO_URL=http://your-drawio-server.com

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/docmost

# Redis
REDIS_URL=redis://localhost:6379

# 应用密钥(必须设置，至少32字符)
APP_SECRET=your-secret-key-min-32-chars

# MCP Agent接口（可选；Token至少32字符）
MCP_API_TOKEN=
MCP_AGENT_USER_EMAIL=agent@docmost.local
MCP_RATE_LIMIT_RPS=10
```

### 4.1 MCP Agent 接口

配置 `MCP_API_TOKEN` 后，后端启用 MCP 2024-11 SSE 接口。该功能只访问本机 Docmost 服务、PostgreSQL 和 Redis，不会引入外网请求。未配置 Token 时端点返回 401。

| 方法   | 路径                                      | 用途                   |
| ------ | ----------------------------------------- | ---------------------- |
| `GET`  | `{BASE_PATH}/mcp/sse`                     | 建立 SSE 会话          |
| `POST` | `{BASE_PATH}/mcp/messages?sessionId=<id>` | 投递 MCP JSON-RPC 消息 |

两个请求都需要 `Authorization: Bearer <MCP_API_TOKEN>`。子目录部署时，例如 `BASE_PATH=/docmost`，SSE URL 为 `https://docs.internal.example/docmost/mcp/sse`。

MCP Client 通用配置示例：

```json
{
  "mcpServers": {
    "docmost": {
      "type": "sse",
      "url": "https://docs.internal.example/docmost/mcp/sse",
      "headers": {
        "Authorization": "Bearer REPLACE_WITH_MCP_API_TOKEN"
      }
    }
  }
}
```

Nginx 代理 SSE 时应关闭响应缓冲并延长读取超时：

```nginx
location /docmost/mcp/ {
    proxy_pass http://docmost:3000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 360s;
}
```

若 `BASE_PATH` 为空，将 location 改为 `/mcp/`。建议只允许受信任内网网段访问此路径，并使用 HTTPS 保护长期 Token。实现依据：`apps/server/src/core/mcp/mcp.controller.ts:47`、`apps/server/src/core/mcp/mcp-tools.service.ts:75`、`apps/server/src/integrations/environment/environment.service.ts:274`。

## 五、验证清单

部署后请验证以下项目:

### 5.1 无外网连接

- [ ] 检查网络流量，确认无对外HTTP/HTTPS请求
- [ ] 测试Excalidraw绘图功能正常
- [ ] 确认遥测服务已禁用

### 5.2 EE功能隐藏

- [ ] 设置菜单中无Billing/License/Security选项
- [ ] 登录页面无SSO选项
- [ ] 无Trial到期提示

### 5.3 核心功能正常

- [ ] 用户注册登录
- [ ] 创建/编辑文档
- [ ] 空间和权限管理
- [ ] 文件上传
- [ ] 搜索功能
- [ ] 评论功能

### 5.4 MCP Agent 接口（启用时）

- [ ] 不携带 Token 访问 `{BASE_PATH}/mcp/sse` 返回 401
- [ ] 正确 Token 可建立 SSE 连接并收到会话消息投递地址
- [ ] `list_workspaces` 返回工作区列表
- [ ] 创建测试页面后，`get_page_markdown` 可读回 Markdown
- [ ] 连续请求超过 `MCP_RATE_LIMIT_RPS` 时返回 429

## 六、后续维护

### 6.1 更新时注意事项

从上游更新代码时:

- 检查`telemetry.service.ts`是否被覆盖
- 检查`main.tsx`中PostHog是否重新启用
- 检查新增的外网API调用

### 6.2 自定义修改记录

所有修改均已在文件中标注:

```typescript
// Telemetry disabled for internal network deployment
// PostHog removed for internal network deployment
// CDN link removed for internal network deployment
```

## 七、技术支持

### 7.1 联系方式

- 原项目: https://github.com/docmost/docmost
- 许可证: AGPL-3.0

### 7.2 常见问题

**Q: 删除EE功能后会影响核心功能吗？**
A: 不会。EE功能主要是商业增值服务(SSO、MFA、Billing)，核心文档协作功能独立运行。

**Q: 必须删除EE目录吗？**
A: 不必须。通过`CLOUD=false`配置即可隐藏EE功能，保留代码更符合AGPL精神。

**Q: Draw.io必须自建吗？**
A: 不是必须。可以通过`DRAWIO_URL`配置内网服务，或完全禁用该功能。

## 八、修改摘要

### 已完成的修改 ✅

1. ✅ 禁用后端遥测服务
2. ✅ 移除前端PostHog分析
3. ✅ 移除Excalidraw CDN引用
4. ✅ 移除品牌外链

### 推荐配置 ⚠️

1. ⚠️ 设置 `CLOUD=false` 隐藏EE功能
2. ⚠️ 设置 `DISABLE_TELEMETRY=true`
3. ⚠️ 配置内网Draw.io服务地址

### 可选深度清理 ❌

1. ❌ 完全删除EE模块导入（复杂且风险高）
2. ❌ 删除`apps/client/src/ee`目录（不推荐）

---

**修改完成日期**: 2025-12-27
**修改者**: AI Assistant
**版本**: Docmost (基于AGPL 3.0)
