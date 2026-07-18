# PRD：Docmost Agent MCP 接口

> 状态：设计稿（待实现）
> 版本：v1.0
> 日期：2026-07-18
> 对应分支：`feature-Agent-MCP`

---

## 1. 背景与目标

### 1.1 背景

`mydocmost` 当前已具备完整的空间（Space）、页面（Page）管理能力，但外部 Agent 无法直接、结构化地读写 Wiki 内容。为了让 AI Agent 能够自动化地维护知识库，需要暴露一套标准化接口。

### 1.2 目标

为 Agent 提供基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的接口，使其能够：

- 创建空间（Space）。
- 在指定空间或父页面下批量创建/插入页面树（文档目录）。
- 创建、更新、移动单篇页面。
- 列出空间的页面树结构。
- 读取指定空间或单篇页面的 Markdown 内容。
- 分析空间页面树的结构统计信息。

接口以 **Markdown** 作为 Agent 与系统之间的主要内容交换格式，服务端内部完成 Markdown ↔ ProseMirror 转换。

---

## 2. 范围

### 2.1 In Scope（本期实现）

| 能力 | 说明 |
|------|------|
| 服务端内嵌 MCP Server | 在 NestJS 后端新增 `/mcp/sse` 与 `/mcp/messages` |
| SSE 传输 | MCP 2024-11，基于 SSE + HTTP POST messages |
| API Token 认证 | 可选环境变量 `MCP_API_TOKEN`，未配置时 MCP 接口不启用 |
| 系统 Agent 用户 | 按 Workspace 自动创建/延迟创建 |
| 9 个 MCP Tools | 见第 7 节 |
| Markdown 读写 | 创建/更新传 Markdown，读取返回 Markdown |
| 页面树操作 | 批量插入、单篇创建、移动、树形列出、结构分析 |

### 2.2 Out of Scope（本期不做）

- 附件/图片上传（Markdown 中的图片链接原样保留）。
- 页面评论、历史版本、分享、权限精细化管理。
- 实时协同编辑（由现有 Hocuspocus 服务承担）。
- 自然语言对话式 Agent UI（仅暴露 MCP 工具层）。

---

## 3. 术语

| 术语 | 说明 |
|------|------|
| MCP | Model Context Protocol，Anthropic 主导的 AI 工具协议 |
| SSE | Server-Sent Events，MCP 2024-11 推荐传输方式之一 |
| Space | Docmost 中的“空间”，页面集合 |
| Page | Docmost 中的“页面”，内部存储为 ProseMirror JSON + Ydoc |
| Agent User | 系统预置用户，所有 MCP 操作归属该用户 |
| ProseMirror JSON | Docmost 编辑器使用的结构化文档格式 |
| Ydoc | Yjs 文档二进制，用于协同编辑 |

---

## 4. 架构设计

### 4.1 总体架构

```
┌─────────────────┐      SSE/HTTP       ┌─────────────────────────────┐
│  MCP Client     │ ◄─────────────────► │  Docmost Server             │
│  (Claude/Cursor │    Authorization:   │  ┌───────────────────────┐  │
│   /Kimi ...)    │    Bearer <token>   │  │ McpController         │  │
└─────────────────┘                     │  │  /mcp/sse             │  │
                                        │  │  /mcp/messages        │  │
                                        │  └───────────┬───────────┘  │
                                        │              │              │
                                        │  ┌───────────▼───────────┐  │
                                        │  │ McpService / Server   │  │
                                        │  │ (modelcontextprotocol │  │
                                        │  │  sdk)                 │  │
                                        │  └───────────┬───────────┘  │
                                        │              │              │
                                        │  ┌───────────▼───────────┐  │
                                        │  │ Space/Page Services   │  │
                                        │  │ Import/Export Service │  │
                                        │  └───────────┬───────────┘  │
                                        │              │              │
                                        │  ┌───────────▼───────────┐  │
                                        │  │ PostgreSQL / Redis    │  │
                                        │  └───────────────────────┘  │
                                        └─────────────────────────────┘
```

### 4.2 模块位置

```
apps/server/src/
  core/
    mcp/
      mcp.controller.ts       # SSE / messages 端点
      mcp.service.ts          # Server 实例与 tool 路由
      mcp-auth.guard.ts       # API Token 校验
      dto/                    # 工具入参 DTO
      tools/                  # 各 tool 实现（可选拆分）
  integrations/environment/   # 新增 MCP_API_TOKEN 等环境变量
```

---

## 5. 认证与系统 Agent 用户

### 5.1 环境变量

```bash
# 可选。MCP Client 连接时使用的长期 Token。
# 若不配置，则 /mcp 端点不启用（返回 401）。
# 若配置，要求长度 ≥ 32，建议 64 字节随机串。
MCP_API_TOKEN=

# 可选。系统 Agent 用户的邮箱标识。
# 默认 agent@docmost.local，启动时若不存在则自动创建。
MCP_AGENT_USER_EMAIL=agent@docmost.local
```

### 5.2 系统 Agent 用户初始化

Docmost 的 `users` 表按 `workspace_id` 隔离，因此 Agent 用户是**按 Workspace 存在**的。初始化策略：

1. 启动时扫描 `workspaces` 表，为每个 workspace 创建/确认 Agent 用户。
2. 每个 workspace 内的 Agent 用户：
   - `email` = `MCP_AGENT_USER_EMAIL`
   - `name` = `"Docmost Agent"`
   - `role` = `admin`
   - `workspaceId` = 对应 workspace id
   - `password` = 随机哈希（禁止普通登录）
3. 后续新增 workspace 时（如通过其他入口创建），MCP 首次调用该 workspace 时**按需延迟创建** Agent 用户。
4. 若某 workspace 的 Agent 用户被软删/禁用，则针对该 workspace 的调用失败，报错 `AGENT_USER_DISABLED`。

### 5.3 认证 Guard

新增 `McpAuthGuard`：

- 只保护 `/mcp/*` 路由。
- 从 `Authorization: Bearer <token>` 提取 token，与 `MCP_API_TOKEN` 常量时间比较。
- 校验**只验证 Token，不绑定 workspace**；workspace 由每次 tool 调用的 `workspaceId` 参数指定。
- `McpService` 在调用具体 tool 前，根据 `workspaceId` 加载对应 workspace 及其 Agent 用户，并注入请求上下文。

---

## 6. MCP 端点与协议

### 6.1 协议版本

- **MCP 2024-11**
- 传输方式：**SSE（Server-Sent Events）**

### 6.2 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `{BASE_PATH}/mcp/sse` | 建立 SSE 连接，返回 `endpoint` 事件 |
| `POST` | `{BASE_PATH}/mcp/messages` | Client 发送 JSON-RPC 请求/通知 |
| `POST` | `{BASE_PATH}/mcp/messages?sessionId=<id>` | 具体会话的消息投递地址 |

> 注意：项目已支持 `BASE_PATH` 子目录部署，端点需拼接在 `BASE_PATH` 之后。

### 6.3 连接与超时

- 每个 SSE 连接生成唯一 `sessionId`。
- SSE 连接空闲 5 分钟无消息自动关闭，Client 可重连。
- 单次 tool 调用最大执行时间 60 秒。

---

## 7. MCP 工具清单

### 7.1 工具总览

| 工具名 | 能力 |
|--------|------|
| `list_workspaces` | 列出所有 Workspace（Agent 可访问） |
| `create_space` | 创建 Space |
| `insert_page_tree` | 在指定 Space 下批量创建页面树 |
| `create_page` | 单篇创建页面（支持 parentPageId） |
| `update_page` | 更新页面标题/内容/属性 |
| `move_page` | 移动页面到指定父页面或 Space 根目录 |
| `list_space_pages` | 列出 Space 页面树 |
| `get_page_markdown` | 读取单篇页面 Markdown |
| `analyze_page_tree` | 分析 Space 页面树结构 |

### 7.2 `list_workspaces`

**输入**

```json
{}
```

无参数。

**输出**

```json
{
  "workspaces": [
    {
      "id": "uuid",
      "name": "默认工作区",
      "hostname": "docmost.example.com",
      "createdAt": "2026-07-18T10:00:00Z"
    }
  ]
}
```

- 返回 Agent 可访问的全部 Workspace 列表，供后续 tool 指定 `workspaceId`。

### 7.3 `create_space`

**输入**

```json
{
  "workspaceId": "uuid",
  "name": "产品文档",
  "description": "Agent 自动维护的产品文档空间",
  "slug": "product-docs"
}
```

- `workspaceId`：必填，指定目标 Workspace。
- `name`：必填，Space 名称。
- `slug`：必填，URL slug，要求 2-50 位字母数字。
- `description`：可选。

**输出**

```json
{
  "id": "uuid",
  "name": "产品文档",
  "slug": "product-docs",
  "createdAt": "2026-07-18T10:00:00Z"
}
```

### 7.4 `insert_page_tree`

**输入**

在已有 Space 下创建：

```json
{
  "workspaceId": "uuid",
  "spaceId": "uuid",
  "parentPageId": "uuid",
  "pages": [
    {
      "title": "首页",
      "content": "# 首页\n\n这是首页内容。",
      "icon": "📄",
      "children": [
        { "title": "子页面", "content": "## 子页面\n\n内容" }
      ]
    }
  ]
}
```

创建新 Space 并同时创建页面树：

```json
{
  "workspaceId": "uuid",
  "spaceName": "产品文档",
  "spaceSlug": "product-docs",
  "pages": [
    { "title": "首页", "content": "# 首页" }
  ]
}
```

- `workspaceId`：必填，指定目标 Workspace。
- `spaceId` 与 `spaceName` + `spaceSlug` 二选一：
  - 传 `spaceId`：在已有 Space 下创建。
  - 不传 `spaceId` 但传 `spaceName` + `spaceSlug`：先在指定 Workspace 下创建 Space，再在其下创建页面树。
- `parentPageId`：可选，指定父页面；该父页面必须属于目标 Space 且属于目标 Workspace；否则挂到 Space 根目录。
- `pages`：必填，页面树数组，支持无限嵌套 `children`。

**行为**

- 前序遍历 `pages`，按顺序创建。
- 每个节点创建后，其 `id` 作为子节点的 `parentPageId`。
- 位置使用 `fractional-indexing-jittered` 生成。
- 整棵树创建包裹在 Kysely 事务中，任一失败回滚。
- 单个请求最多支持 100 个节点。

**输出**

```json
{
  "spaceId": "uuid",
  "pages": [
    {
      "id": "uuid",
      "title": "首页",
      "children": [
        { "id": "uuid", "title": "子页面", "children": [] }
      ]
    }
  ]
}
```

### 7.5 `create_page`

**输入**

```json
{
  "workspaceId": "uuid",
  "spaceId": "uuid",
  "parentPageId": "uuid",
  "title": "页面标题",
  "content": "# 页面标题\n\nMarkdown 内容",
  "icon": "📝"
}
```

- `workspaceId`：必填，指定目标 Workspace。
- `spaceId`：必填。
- `parentPageId`：可选，指定父页面；必须与 `spaceId` 属于同一 Space 且同一 Workspace。
- `title`：可选，未传时从 `content` 提取第一个 `# `。
- `content`：必填，Markdown 内容。
- `icon`：可选。

**输出**：创建后的页面完整元数据（含 `id`、`slugId`、`position`、`parentPageId`、`spaceId`、`createdAt`、`updatedAt`）。

### 7.6 `update_page`

**输入**

```json
{
  "workspaceId": "uuid",
  "pageId": "uuid",
  "title": "新标题",
  "content": "新 Markdown 内容",
  "icon": "📘"
}
```

- `workspaceId`：必填，用于校验 page 是否属于该 Workspace。
- `pageId`：必填。
- `title`、`content`、`icon` 均为可选，只更新传入字段。
- 更新 `content` 时同步更新 `textContent` 和 `ydoc`。

**输出**：更新后的页面元数据。

### 7.7 `move_page`

**输入**

```json
{
  "workspaceId": "uuid",
  "pageId": "uuid",
  "targetParentPageId": "uuid",
  "targetSpaceId": "uuid"
}
```

- `workspaceId`：必填，源与目标 Space/Page 必须属于该 Workspace。
- `pageId`：必填。
- `targetParentPageId`：可选，`null` 表示移动到 Space 根目录。
- `targetSpaceId`：可选，不填则在当前 Space 内移动；跨 Space 移动时目标 Space 必须同属 `workspaceId`。

**行为**

- 复用现有 `PageService.movePage`。
- 跨 Space 移动复用 `PageService.movePageToSpace`。
- 校验源 page、目标 space、目标 parent page 均属于 `workspaceId`。
- 自动计算新的 `position`，放到目标父页面子列表末尾。
- 禁止形成循环父子关系。

**输出**：移动后的页面元数据。

### 7.8 `list_space_pages`

**输入**

```json
{
  "workspaceId": "uuid",
  "spaceId": "uuid",
  "format": "tree",
  "includeDeleted": false,
  "limit": 100,
  "offset": 0
}
```

- `workspaceId`：必填，用于校验 space 归属。
- `spaceId`：必填。
- `format`：`tree`（默认）或 `flat`。
- `includeDeleted`：默认 `false`。
- `limit`：默认 100，最大 1000。
- `offset`：默认 0。

**输出（tree 格式）**

```json
{
  "spaceId": "uuid",
  "total": 42,
  "pages": [
    {
      "id": "uuid",
      "title": "根页面",
      "slugId": "...",
      "parentPageId": null,
      "position": "a0",
      "hasChildren": true,
      "children": [...]
    }
  ]
}
```

### 7.9 `get_page_markdown`

**输入**

```json
{
  "workspaceId": "uuid",
  "pageId": "uuid"
}
```

- `workspaceId`：必填，用于校验 page 归属。
- `pageId`：必填。

**输出**

```json
{
  "pageId": "uuid",
  "title": "页面标题",
  "markdown": "# 页面标题\n\n正文...",
  "updatedAt": "2026-07-18T10:00:00Z",
  "spaceId": "uuid"
}
```

### 7.10 `analyze_page_tree`

**输入**

```json
{
  "workspaceId": "uuid",
  "spaceId": "uuid"
}
```

- `workspaceId`：必填，用于校验 space 归属。
- `spaceId`：必填。

**输出**

```json
{
  "spaceId": "uuid",
  "totalPages": 42,
  "maxDepth": 4,
  "rootPages": 5,
  "orphanPages": 0,
  "emptyContentPages": 3,
  "depthDistribution": {
    "0": 5,
    "1": 12,
    "2": 18,
    "3": 6,
    "4": 1
  },
  "topPagesByChildren": [
    { "id": "uuid", "title": "根页面", "childrenCount": 15 }
  ]
}
```

---

## 8. 数据流

### 8.1 写入流程（创建/更新页面）

```
Agent Markdown
  ↓ @docmost/editor-ext 的 markdownToHtml
HTML
  ↓ collaboration.util 的 htmlToJson
ProseMirror JSON
  ↓ createYdocFromJson
Ydoc
  ↓ jsonToText
textContent
  ↓ pageRepo.insertPage / updatePage
DB pages 行
```

### 8.2 标题处理规则

1. 优先使用请求显式传入的 `title`。
2. 若未传 `title`，从 Markdown 内容提取第一个 `# ` 一级标题作为 `title`。
3. 无论 `title` 来自参数还是内容提取，只要内容中存在作为页面标题的一级标题，就从 ProseMirror JSON 中移除该节点，避免正文重复显示。
4. 若未找到一级标题且未传 `title`，`title` = `"Untitled"`。

> 复用 `ImportService.extractTitleAndRemoveHeading` 逻辑。

### 8.3 读取流程

```
DB pages 行
  ↓ pageRepo.findById(includeContent=true)
ProseMirror JSON
  ↓ ExportService.exportPage(Markdown, page, singlePage=true)
Markdown
  ↓ 返回给 Agent
```

---

## 9. 权限与安全

### 9.1 权限策略

- 每个 Workspace 内的系统 Agent 用户角色为 `admin`。
- 进入 Space 时按 `SpaceRole.ADMIN` 构建 CASL ability。
- 所有现有 `SpaceAbilityFactory` / `WorkspaceAbilityFactory` 校验均通过，无需在每个 service 中写 Agent 特例。
- 每个 tool 必须显式校验 `workspaceId` 与所操作资源（Space、Page）的 `workspaceId` 一致，防止跨 Workspace 越权。

### 9.2 安全要求

- `MCP_API_TOKEN` 仅存在于环境变量，不写入数据库；未配置时 MCP 端点不可用。
- 生产环境必须配合 HTTPS + 反向代理使用。
- `/mcp/*` 端点默认不对外暴露，由网络层控制访问范围。
- Markdown 转 HTML 需经过与导入相同的净化流程，防止 XSS。
- 系统 Agent 用户禁止普通登录（邮箱域名标记或密码随机化）。

### 9.3 限流

- 可配置 `MCP_RATE_LIMIT_RPS`，默认 10 req/s。
- `insert_page_tree` 单次最多 100 个节点。
- `list_space_pages` 单次 `limit` ≤ 1000。

---

## 10. 错误处理

### 10.1 MCP 错误返回格式

```json
{
  "content": [
    { "type": "text", "text": "错误信息" }
  ],
  "isError": true
}
```

### 10.2 错误码

| 错误码 | 场景 |
|--------|------|
| `WORKSPACE_NOT_FOUND` | workspaceId 不存在 |
| `SPACE_NOT_FOUND` | spaceId 不存在或不在指定 Workspace 下 |
| `PAGE_NOT_FOUND` | pageId 不存在或不在指定 Workspace 下 |
| `PARENT_NOT_FOUND` | parentPageId 不存在或不在指定 Workspace 下 |
| `INVALID_MARKDOWN` | Markdown 解析失败 |
| `FORBIDDEN` | Token 无效或已过期 |
| `AGENT_USER_DISABLED` | 目标 Workspace 的 Agent 用户被禁用或删除 |
| `INVALID_MOVE` | 移动会形成循环或目标不在同一 Workspace |
| `RATE_LIMITED` | 触发限流 |
| `TREE_TOO_LARGE` | insert_page_tree 节点数超过 100 |
| `INTERNAL_ERROR` | 其他内部错误 |

---

## 11. 验收标准

- [ ] `GET {BASE_PATH}/mcp/sse` 可建立 SSE 连接并返回 endpoint 事件。
- [ ] `Authorization: Bearer $MCP_API_TOKEN` 校验通过后可调用 tools。
- [ ] 每个 Workspace 的系统 Agent 用户可正确初始化，角色为 admin。
- [ ] 新增 Workspace 后，首次调用该 Workspace 的 tool 时能自动创建 Agent 用户。
- [ ] `create_space` 在指定 Workspace 下成功创建 Space。
- [ ] `insert_page_tree` 可批量创建 2 级及以上页面树，失败时事务回滚。
- [ ] `create_page` 支持在父页面下创建子页面。
- [ ] `move_page` 可将页面移动到另一父页面下或 Space 根目录。
- [ ] `get_page_markdown` 返回的 Markdown 与原始 Markdown 语义一致（标题、段落、列表）。
- [ ] `list_space_pages` 返回的 `tree` 格式正确反映父子关系。
- [ ] `analyze_page_tree` 返回的统计信息准确。
- [ ] 传入错误的 `workspaceId` 或跨 Workspace 访问资源时返回 `WORKSPACE_NOT_FOUND` / `SPACE_NOT_FOUND` / `PAGE_NOT_FOUND`。
- [ ] Token 错误时返回 `FORBIDDEN`，不泄露内部堆栈。
- [ ] 子目录部署（`BASE_PATH`）下端点路径正确。

---

## 12. 依赖与风险

### 12.1 依赖

- `@modelcontextprotocol/sdk`：MCP Server 实现。
- 现有 `ImportService` / `ExportService`：Markdown ↔ ProseMirror 转换。
- 现有 `SpaceService`、`PageService`、`PageRepo`：业务逻辑复用。
- 现有 `api_keys` 表结构（可选，本期不使用，但未来可扩展）。

### 12.2 风险

| 风险 | 缓解 |
|------|------|
| Agent 拥有全局特权，误操作影响大 | Token 严格保管；生产环境限制网络访问；操作记录完整日志 |
| 多 Workspace 下 Agent 用户延迟创建失败 | 首次调用失败时返回 `AGENT_USER_DISABLED`；支持启动时预扫描初始化 |
| SSE 长连接在高并发下占用资源 | 限制单实例连接数；空闲超时关闭 |
| Markdown 转换结果与预期不一致 | 优先支持标准 Markdown；复杂表格/代码块通过回归测试覆盖 |
| 大量页面树导入导致事务超时 | 限制单次 100 节点；大数据量分批调用 |

---

## 13. 后续可扩展

- 支持附件上传（`create_page` / `update_page` 接收 base64 图片）。
- 支持页面属性批量设置（owner、status、priority、tags、dueAt）。
- 支持基于向量搜索的 `search_space_pages` tool。
- 支持 MCP 2025-03 的 Streamable HTTP 传输。
