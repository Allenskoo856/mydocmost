# OpenCode 连接 Docmost MCP 操作手册

> 适用项目：mydocmost
>
> 协议：MCP 2024-11 SSE
>
> 更新日期：2026-07-18

## 1. 文档目标

本文介绍如何启用 Docmost MCP Agent 接口，并使用 OpenCode 连接该接口。

完成配置后，OpenCode 可以通过 MCP 执行以下操作：

- 列出 Workspace。
- 创建 Space。
- 创建、更新和移动页面。
- 批量插入页面树。
- 查看 Space 页面树。
- 读取页面 Markdown。
- 分析页面树结构。

当前 Docmost MCP 使用 MCP 2024-11 SSE 协议。OpenCode 必须连接 SSE 入口 `/mcp/sse`，不能连接 `/api/mcp/sse` 或 `/mcp/messages`。

## 2. 前置条件

开始前确认：

- Docmost 已部署并可从 OpenCode 所在机器访问。
- 当前服务端代码包含 `core/mcp` 模块。
- OpenCode 版本支持 remote MCP Server。
- 生产或内网环境已配置 HTTPS 或可信网络隔离。
- 反向代理允许 SSE 长连接。

## 3. 配置 Docmost 服务端

### 3.1 生成 MCP Token

执行：

```bash
openssl rand -hex 32
```

该命令会生成 64 位十六进制字符串。请妥善保存，不要提交到 Git。

### 3.2 修改 `.env`

在 Docmost 服务端 `.env` 中加入：

```bash
# MCP Agent 接口
MCP_API_TOKEN=REPLACE_WITH_GENERATED_TOKEN
MCP_AGENT_USER_EMAIL=agent@docmost.local
MCP_RATE_LIMIT_RPS=10
```

变量说明：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `MCP_API_TOKEN` | 是 | 无 | OpenCode 连接时使用的 Bearer Token，至少 32 字符 |
| `MCP_AGENT_USER_EMAIL` | 否 | `agent@docmost.local` | 每个 Workspace 中系统 Agent 用户的邮箱 |
| `MCP_RATE_LIMIT_RPS` | 否 | `10` | 每个 MCP 会话每秒允许的 messages 请求数 |

未配置 `MCP_API_TOKEN` 时，MCP 端点不会开放访问，所有请求返回 401。

### 3.3 重启服务

Docker Compose 部署：

```bash
docker compose restart docmost
```

源码部署时重启对应 Node/NestJS 进程。

## 4. 确定 MCP 地址

### 4.1 未配置 `BASE_PATH`

```text
https://docmost.example.internal/mcp/sse
```

### 4.2 配置 `BASE_PATH=/docmost`

```text
https://docmost.example.internal/docmost/mcp/sse
```

地址规则：

```text
{APP_URL}{BASE_PATH}/mcp/sse
```

注意：

- OpenCode 配置使用 `/mcp/sse`。
- 不要添加 `/api` 前缀。
- 不要将 `/mcp/messages` 配置为 OpenCode URL。
- `/mcp/messages?sessionId=...` 由 SSE 握手自动返回。

## 5. 使用 curl 验证服务端

### 5.1 设置客户端环境变量

```bash
export DOCMOST_MCP_TOKEN='REPLACE_WITH_GENERATED_TOKEN'
```

客户端变量可以使用任意名称。本手册使用 `DOCMOST_MCP_TOKEN`，其值必须与服务端 `MCP_API_TOKEN` 相同。

### 5.2 验证未认证请求

```bash
curl -i https://docmost.example.internal/mcp/sse
```

预期结果：

```text
HTTP/1.1 401 Unauthorized
```

### 5.3 验证 SSE 连接

```bash
curl -N \
  -H "Authorization: Bearer ${DOCMOST_MCP_TOKEN}" \
  https://docmost.example.internal/mcp/sse
```

子目录部署时：

```bash
curl -N \
  -H "Authorization: Bearer ${DOCMOST_MCP_TOKEN}" \
  https://docmost.example.internal/docmost/mcp/sse
```

正常情况下可以看到：

```text
event: endpoint
data: /mcp/messages?sessionId=xxxxxxxx
```

curl 会保持运行，这是 SSE 长连接的正常行为。按 `Ctrl+C` 退出。

## 6. 配置 Nginx

### 6.1 子目录部署

当 `BASE_PATH=/docmost` 时：

```nginx
location /docmost/mcp/ {
    proxy_pass http://docmost:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 360s;
    proxy_send_timeout 360s;
}
```

### 6.2 根路径部署

未配置 `BASE_PATH` 时，将 location 改为：

```nginx
location /mcp/ {
    proxy_pass http://docmost:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 360s;
    proxy_send_timeout 360s;
}
```

MCP SSE 不使用 WebSocket，但必须关闭代理缓冲并允许长时间 HTTP 连接。

## 7. 配置 OpenCode

### 7.1 配置文件位置

项目级配置：

```text
<项目根目录>/opencode.json
```

全局配置：

```text
~/.config/opencode/opencode.json
```

推荐优先使用项目级配置，方便不同项目选择不同的 MCP Server。不要把包含真实 Token 的文件提交到 Git。

### 7.2 OpenCode 配置示例

根路径部署：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "docmost": {
      "type": "remote",
      "url": "https://docmost.example.internal/mcp/sse",
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

子目录部署：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "docmost": {
      "type": "remote",
      "url": "https://docmost.example.internal/docmost/mcp/sse",
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

关键字段：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `type` | `remote` | Docmost MCP 是远程 HTTP/SSE 服务 |
| `url` | `{BASE_PATH}/mcp/sse` | MCP SSE 连接入口 |
| `enabled` | `true` | 启用该 MCP Server |
| `oauth` | `false` | Docmost 使用固定 Bearer Token，不提供 OAuth |
| `timeout` | `15000` | 获取 tools 的超时时间，单位毫秒 |
| `headers.Authorization` | `Bearer {env:DOCMOST_MCP_TOKEN}` | 从环境变量读取 Token |

### 7.3 启动 OpenCode

确保 OpenCode 能读取环境变量：

```bash
export DOCMOST_MCP_TOKEN='REPLACE_WITH_GENERATED_TOKEN'
opencode
```

如果希望每次启动终端都生效，可将 export 命令加入 shell 配置，但要确保配置文件权限安全。

## 8. 验证 OpenCode 连接

列出 MCP Server：

```bash
opencode mcp list
```

诊断 Docmost 连接：

```bash
opencode mcp debug docmost
```

正常情况下，`docmost` 应显示为启用状态，并能加载 MCP tools。

如果修改了 `opencode.json` 或环境变量，建议完全退出并重新启动 OpenCode。

## 9. 在 OpenCode 中使用

### 9.1 列出 Workspace

```text
使用 docmost MCP 的 list_workspaces 工具列出所有工作区。
```

记录返回结果中的 `workspaceId`，后续大部分操作都需要它。

### 9.2 创建 Space

```text
使用 docmost MCP，在工作区 <workspaceId> 中创建一个空间：
名称为“产品文档”，slug 为 product-docs，描述为“产品内部文档”。
```

### 9.3 创建页面

```text
使用 docmost MCP 的 create_page，在空间 <spaceId> 中创建页面。
标题为“快速开始”，正文使用以下 Markdown：

# 快速开始

这是产品文档的快速开始页面。
```

### 9.4 读取 Markdown

```text
使用 docmost MCP 的 get_page_markdown，读取工作区 <workspaceId> 中页面 <pageId> 的 Markdown。
```

### 9.5 批量创建页面树

```text
使用 docmost MCP 的 insert_page_tree，在工作区 <workspaceId>、空间 <spaceId> 中创建以下目录：

- 产品介绍
  - 功能说明
  - 使用限制
- 部署指南
  - Docker 部署
  - 内网部署

为每个页面生成简短 Markdown 正文。
```

OpenCode 注册工具时通常会添加 MCP Server 名称前缀，例如 `docmost_list_workspaces`。提示词中使用“docmost MCP”即可帮助模型选择正确工具。

## 10. MCP 工具清单

| 工具 | 说明 |
| --- | --- |
| `list_workspaces` | 列出可访问的 Workspace |
| `create_space` | 在指定 Workspace 创建 Space |
| `insert_page_tree` | 在已有或新 Space 中批量创建页面树，最多 100 个节点 |
| `create_page` | 创建单篇 Markdown 页面 |
| `update_page` | 更新页面标题、图标或 Markdown 内容 |
| `move_page` | 移动页面到其他父页面或 Space |
| `list_space_pages` | 以 tree 或 flat 格式列出 Space 页面 |
| `get_page_markdown` | 读取指定页面 Markdown |
| `analyze_page_tree` | 分析页面总数、深度、空内容和子页面统计 |

## 11. 常见故障排查

### 11.1 返回 401 Unauthorized

检查：

- OpenCode 进程是否能读取 `DOCMOST_MCP_TOKEN`。
- 客户端 Token 是否与服务端 `MCP_API_TOKEN` 完全一致。
- Token 前后是否包含多余空格或引号。
- OpenCode 配置是否包含 `Authorization: Bearer ...`。
- Nginx 是否转发 `Authorization` Header。
- 服务端是否已在修改 `.env` 后重启。

### 11.2 返回 404 Not Found

检查 URL：

- 根路径部署：`/mcp/sse`。
- 子目录部署：`/{BASE_PATH}/mcp/sse`。
- URL 中不应出现 `/api/mcp/sse`。
- 不要直接连接 `/mcp/messages`。

### 11.3 SSE 可以连接，但无法加载 tools

检查：

- `oauth` 是否设置为 `false`。
- OpenCode 是否把 Header 应用于后续 `/mcp/messages` 请求。
- Nginx 是否关闭 `proxy_buffering`。
- `proxy_read_timeout` 是否足够长。
- 执行 `opencode mcp debug docmost` 查看连接过程。

### 11.4 触发 429 或 RATE_LIMITED

调高服务端：

```bash
MCP_RATE_LIMIT_RPS=20
```

修改后重启 Docmost。

### 11.5 返回 WORKSPACE_NOT_FOUND

先调用 `list_workspaces`，使用返回的真实 UUID。不要使用 Workspace 名称或 hostname 代替 `workspaceId`。

### 11.6 返回 AGENT_USER_DISABLED

目标 Workspace 中的 `MCP_AGENT_USER_EMAIL` 用户已被禁用或软删除。恢复该用户，或者更换 `MCP_AGENT_USER_EMAIL` 后重启服务。

### 11.7 内网自签名证书失败

推荐让 OpenCode 信任内网 CA：

```bash
NODE_EXTRA_CA_CERTS=/path/to/internal-ca.pem opencode
```

不要在生产环境长期使用：

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### 11.8 协议不兼容

当前 Docmost 提供 MCP 2024-11 SSE 端点。OpenCode URL 必须使用 `/mcp/sse`。如果 OpenCode 版本只接受 Streamable HTTP `/mcp` 端点，需要升级或更换支持 SSE remote MCP 的 OpenCode 版本，或者后续为 Docmost 增加 Streamable HTTP 传输。

## 12. 安全建议

- `MCP_API_TOKEN` 相当于跨 Workspace 管理凭据，应按管理员密钥管理。
- 使用 HTTPS，避免 Token 以明文在网络上传输。
- 仅允许受信任内网网段访问 `/mcp/*`。
- 不要在 Git、日志、截图或聊天记录中暴露真实 Token。
- 定期轮换 Token，轮换后同步更新 OpenCode 环境变量。
- 根据实际调用量设置合理的 `MCP_RATE_LIMIT_RPS`。
- Agent 用户具有 Workspace 管理能力，使用前确认提示词和目标 Workspace。

## 13. 验收清单

- [ ] Docmost `.env` 已配置 `MCP_API_TOKEN`。
- [ ] Docmost 已重启。
- [ ] 无 Token 请求 `/mcp/sse` 返回 401。
- [ ] 正确 Token 可收到 SSE `endpoint` 事件。
- [ ] Nginx 已关闭 MCP 路径响应缓冲。
- [ ] OpenCode `opencode.json` 已配置 remote MCP。
- [ ] OpenCode 启动进程可读取 `DOCMOST_MCP_TOKEN`。
- [ ] `opencode mcp list` 可看到 `docmost`。
- [ ] `opencode mcp debug docmost` 未发现认证或连接错误。
- [ ] `list_workspaces` 可以返回 Workspace。
- [ ] `create_page` 可以创建测试页面。
- [ ] `get_page_markdown` 可以读取测试页面。

## 14. 参考资料

- [OpenCode MCP servers 官方文档](https://opencode.ai/docs/mcp-servers/)
- [内网部署修改指南](./INTERNAL_NETWORK_DEPLOYMENT_GUIDE.md)
- [Agent MCP 接口设计](../PRD/Agent-MCP接口设计.md)
