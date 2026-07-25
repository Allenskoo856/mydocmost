# Docmost MCP 接入指南（Agent / OpenCode）

> 适用项目：mydocmost（内网 / 离线定制 Fork）
> 传输：Streamable HTTP（推荐）+ SSE（兼容旧客户端）
> 更新日期：2026-07-25

---

## 1. 概述

Docmost 内置 **MCP（Model Context Protocol）Server**，让外部 Agent（如 OpenCode、Claude、以及任意 MCP 客户端）以结构化方式读写 Wiki 内容。启用后，Agent 可以：

- 绑定并读取上下文（工作区 / 空间 / 页面）；
- 列出工作区、空间；搜索页面（关键字 + **语义检索**）；
- 创建空间、批量插入页面树；
- 创建 / 更新 / 移动页面；
- 读取页面 Markdown、分析页面树；
- 计划并批量应用页面变更（幂等）。

内容交换以 **Markdown** 为主，服务端内部完成 Markdown ↔ ProseMirror 转换，并经协同层持久化、广播、索引。

---

## 2. 服务端启用

### 2.1 生成 Token

```bash
openssl rand -hex 32
```

生成 64 位十六进制字符串，妥善保存，**不要提交到 Git**。

### 2.2 配置 `.env`

```bash
# 必填：启用 MCP（至少 32 字符）。未配置时 MCP 端点存在但统一返回 401
MCP_API_TOKEN=REPLACE_WITH_GENERATED_TOKEN

# 可选
MCP_AGENT_USER_EMAIL=agent@docmost.local   # 每个工作区内系统 Agent 用户邮箱
MCP_RATE_LIMIT_RPS=10                       # 每会话每秒请求数
MCP_MAX_SESSIONS=100                        # 全进程会话上限（SSE 与 Streamable HTTP 共用）
MCP_ALLOWED_ORIGINS=                        # 逗号分隔 Origin 白名单；APP_URL 的 Origin 自动加入
```

配置后重启服务端。

### 2.3 变量说明

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `MCP_API_TOKEN` | 是 | 空 | Bearer Token，启用时≥32 字符；生产用随机长串 |
| `MCP_AGENT_USER_EMAIL` | 否 | `agent@docmost.local` | 工作区内系统 Agent 用户邮箱 |
| `MCP_RATE_LIMIT_RPS` | 否 | `10` | 每会话每秒请求上限 |
| `MCP_MAX_SESSIONS` | 否 | `100` | 全进程会话总数上限 |
| `MCP_ALLOWED_ORIGINS` | 否 | 空 | Origin 白名单；带 `Origin` 的请求须命中，命令行客户端（无 Origin）可直接访问 |

---

## 3. 传输端点

`{BASE_PATH}` 为子目录部署前缀（根路径部署时为空）。所有端点都必须携带 `Authorization: Bearer <MCP_API_TOKEN>`。

### 3.1 Streamable HTTP（推荐）

```
POST/GET/DELETE  {BASE_PATH}/mcp
```

- 使用 `Mcp-Session-Id` 会话头；协议版本由 SDK 协商（当前最新稳定 `2025-11-25`）。
- 新会话须先发送 MCP `initialize`；后续请求携带 `Mcp-Session-Id`。

### 3.2 SSE（兼容旧客户端）

```
GET   {BASE_PATH}/mcp/sse                     # 建立 SSE 连接
POST  {BASE_PATH}/mcp/messages?sessionId=<id> # 投递消息
```

> 注意：MCP 端点是 `{BASE_PATH}/mcp`，**不是** `{BASE_PATH}/api/mcp`。

### 3.3 curl 快速验证

```bash
# 未带 Token 应返回 401
curl -i https://docs.internal.example/mcp

# 建立 SSE（保持运行属正常，Ctrl+C 退出）
curl -N -H "Authorization: Bearer $DOCMOST_MCP_TOKEN" \
  https://docs.internal.example/mcp/sse
```

### 3.4 反向代理（Nginx）

MCP 走长连接，需透传 SSE：

```nginx
location /mcp/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 86400s;
}
```

---

## 4. OpenCode 接入

### 4.1 配置文件位置

- 项目级：`<项目根目录>/opencode.json`
- 全局级：`~/.config/opencode/opencode.json`

### 4.2 配置示例

先在环境变量中放 Token：

```bash
export DOCMOST_MCP_TOKEN=REPLACE_WITH_GENERATED_TOKEN
```

**根路径部署**（推荐 Streamable HTTP `/mcp`）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "docmost": {
      "type": "remote",
      "url": "https://docs.internal.example/mcp",
      "enabled": true,
      "oauth": false,
      "timeout": 15000,
      "headers": {
        "Authorization": "Bearer {env:DOCMOST_MCP_TOKEN}"
      }
    }
  }
}
```

**子目录部署**（把前缀加到 URL）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "docmost": {
      "type": "remote",
      "url": "https://docs.internal.example/docmost/mcp",
      "enabled": true,
      "oauth": false,
      "timeout": 15000,
      "headers": {
        "Authorization": "Bearer {env:DOCMOST_MCP_TOKEN}"
      }
    }
  }
}
```

> 若你的 OpenCode 版本只支持 SSE remote MCP，把 `url` 改为 `.../mcp/sse` 即可。

关键字段：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `type` | `remote` | Docmost MCP 是远程服务 |
| `url` | `{BASE_PATH}/mcp`（或 `/mcp/sse`） | 入口地址 |
| `enabled` | `true` | 启用该 MCP Server |
| `oauth` | `false` | 使用固定 Bearer Token，不走 OAuth |
| `timeout` | `15000` | 拉取 tools 超时（毫秒） |
| `headers.Authorization` | `Bearer {env:DOCMOST_MCP_TOKEN}` | 从环境变量读取 Token |

### 4.3 启动与验证

```bash
opencode                    # 启动
opencode mcp list           # 应能看到 docmost
opencode mcp debug docmost  # 查看连接 / 认证过程
```

修改 `opencode.json` 或环境变量后，完全退出并重启 OpenCode。

---

## 5. 通用 MCP 客户端配置

**Streamable HTTP（推荐）**：

```json
{
  "mcpServers": {
    "docmost": {
      "type": "http",
      "url": "https://docs.internal.example/mcp",
      "headers": { "Authorization": "Bearer REPLACE_WITH_MCP_API_TOKEN" }
    }
  }
}
```

**SSE（兼容）**：

```json
{
  "mcpServers": {
    "docmost": {
      "type": "sse",
      "url": "https://docs.internal.example/mcp/sse",
      "headers": { "Authorization": "Bearer REPLACE_WITH_MCP_API_TOKEN" }
    }
  }
}
```

---

## 6. 工具清单（16 个）

| 工具 | 作用 |
| --- | --- |
| `get_context` | 绑定并返回当前会话的工作区、传输能力与限额 |
| `list_workspaces` | 列出可访问的工作区 |
| `list_spaces` | 列出空间（可关键字过滤） |
| `search_pages` | **关键字**搜索页面标题 / 正文 |
| `semantic_search` | **语义（向量）检索**页面片段，返回相关片段及来源页面（需服务端启用 AI） |
| `create_space` | 创建空间 |
| `insert_page_tree` | 在空间 / 父页面下批量插入页面树 |
| `create_page` | 创建单个页面 |
| `update_page` | 更新页面（需 `expectedUpdatedAt` 做并发校验） |
| `move_page` | 移动页面 |
| `list_space_pages` | 列出空间页面（支持 tree 模式） |
| `get_page` | 读取页面 Markdown、版本、面包屑、子页、权限摘要 |
| `get_page_markdown` | 读取页面 Markdown |
| `analyze_page_tree` | 分析页面树结构统计 |
| `plan_page_changes` | 计划 create/update/move 批量变更 |
| `apply_page_changes` | 应用批量变更（需 `idempotencyKey`，可安全重试） |

### 6.1 参数与约束要点

- `workspaceId` 可选：只有一个工作区时自动使用；多个且未传时返回 `WORKSPACE_AMBIGUOUS`。建议先 `get_context` 绑定会话工作区。
- Space 支持 UUID 或 slug；Page 支持 UUID 或 `slugId`，返回含 canonical UUID。
- `update_page` 更新正文须传读取时的 `expectedUpdatedAt`；冲突返回 `[PAGE_CONFLICT]`，避免覆盖在线协同内容。
- 页面树最大 100 个写入节点、最大深度 10；`list_space_pages` 的 tree 完整树上限 1000 节点；单页 Markdown 最大 1 MiB、标题最大 255 字符。
- 列表类工具返回 `items` 与 `pageInfo`（offset/limit/total/hasNextPage/nextCursor）。
- `semantic_search`：返回 `items[]`（含 `title`/`slugId`/`snippet`/`score`/`space`）与 `total`；按 Agent 用户的**工作区范围**过滤，服务端未启用 AI 时返回 `AI_DISABLED`。

---

## 7. 典型使用流程

1. `get_context` — 绑定会话工作区（多工作区时先 `list_workspaces`）。
2. 定位内容：
   - 结构化浏览：`list_spaces` → `list_space_pages`；
   - 关键字：`search_pages`；
   - **语义**：`semantic_search`（"限流是怎么设计的？" 这类问句式检索）。
3. 读取：`get_page` / `get_page_markdown`。
4. 写入：`create_page` / `update_page`（带 `expectedUpdatedAt`）/ `move_page`；批量用 `plan_page_changes` → `apply_page_changes`（带 `idempotencyKey`）。

---

## 8. 鉴权、Origin 与限流

- 所有请求必须 `Authorization: Bearer <MCP_API_TOKEN>`；缺失或错误返回 401。
- 带 `Origin` 的请求须命中 `MCP_ALLOWED_ORIGINS`（`APP_URL` 的 Origin 自动加入）；命令行客户端通常无 `Origin`，可直接访问。
- 每会话每秒请求受 `MCP_RATE_LIMIT_RPS` 限制；全进程会话数受 `MCP_MAX_SESSIONS` 限制。

---

## 9. 排障

| 现象 | 排查 |
| --- | --- |
| 全部 401 | `MCP_API_TOKEN` 是否配置、是否重启；请求头 `Authorization: Bearer` 是否正确 |
| 连接被拒 / 403 | 是否带了不在白名单的 `Origin`；核对 `MCP_ALLOWED_ORIGINS` |
| `opencode mcp list` 看不到 docmost | URL 是否为 `{BASE_PATH}/mcp`（非 `/api/mcp`）；改配置后是否重启 OpenCode |
| SSE 立即断开 | 反向代理是否透传长连接（`proxy_buffering off`、拉长 `proxy_read_timeout`） |
| `semantic_search` 返回 `AI_DISABLED` | 服务端未启用 AI，见 [`AI配置与使用.md`](./AI配置与使用.md) |
| `semantic_search` 结果为空 | 目标内容尚未建立索引；先编辑页面或触发工作区回填 |
| 内网自签证书导致 TLS 失败 | 客户端信任内部 CA，如 `NODE_EXTRA_CA_CERTS=/path/to/internal-ca.pem opencode` |

---

## 10. 参考

- AI 问答配置与使用：[`AI配置与使用.md`](./AI配置与使用.md)
- 实现依据：`apps/server/src/core/mcp/`（端点、会话、限流、工具、资源归属校验）、`apps/server/src/core/ai/ai-retrieval.service.ts`（`semantic_search` 复用的检索）。
- OpenCode MCP 官方文档：https://opencode.ai/docs/mcp-servers/
