# AGENTS.md

> 本文件面向 AI 编码代理（AI coding agents），介绍本仓库的架构、开发约定与常用命令。
> 项目文档主要使用中文，代码注释与标识符使用英文。

## 项目概述

本项目是 **Docmost**（开源协作 Wiki / 文档系统，AGPL-3.0 许可）的定制 Fork（`mydocmost`），基于上游 v0.24.1，针对**内网 / 离线部署**做了以下定制：

- 移除或禁用所有企业版（EE）功能：`apps/client/src/ee/` 仅保留最小 stub；服务端 `apps/server/src/ee` 是未初始化的 git submodule，代码不依赖它。
- 移除外网依赖：禁用遥测（telemetry）、移除 PostHog、Excalidraw 不再使用 CDN、移除品牌外链（详见 `doc/dev/INTERNAL_NETWORK_DEPLOYMENT_GUIDE.md`）。
- 支持**子目录部署**：通过 `BASE_PATH` 环境变量可部署在 `https://example.com/docmost/` 之类的子路径下（详见根 `README.md` 的部署章节）。
- 设置 `CLOUD=false` 以隐藏计费 / 许可证 / SSO 等云功能入口。

核心功能：实时协同编辑（Hocuspocus/Yjs）、空间（Spaces）、权限管理、群组、评论、页面历史、全文搜索、附件、图表（Draw.io / Excalidraw / Mermaid）、多语言（10+）。

## 仓库结构

pnpm + Nx 管理的 monorepo：

```
apps/
  client/      # React 18 前端（Vite 7 + Mantine 8 + Tiptap 2 编辑器）
  server/      # NestJS 11 后端（Fastify 适配器）
packages/
  editor-ext/  # @docmost/editor-ext — 前后端共用的 Tiptap 扩展包
  ee/          # 仅有 LICENSE 文件，无代码
patches/       # pnpm patchedDependencies（react-arborist 补丁）
doc/           # 中文文档（dev/ 为部署与定制指南，PRD/ 为产品需求文档）
```

### 后端 `apps/server/src/`

- `main.ts`：入口。Fastify 适配器，全局前缀为 `{BASE_PATH}/api`，注册 Socket.IO Redis 适配器、multipart、cookie。
- `core/`：业务模块，每个领域一个目录（`auth`、`user`、`workspace`、`space`、`page`、`comment`、`attachment`、`group`、`share`、`search`、`casl`）。遵循 NestJS 惯例：`*.module.ts` / `*.controller.ts` / `*.service.ts`。
- `collaboration/`：协同编辑模块（Hocuspocus）。`collaboration/server/collab-main.ts` 是独立协同服务入口。
- `database/`：Kysely（PostgreSQL）数据访问层。`migrations/` 为时间戳命名的迁移文件，`repos/` 为仓储层，`types/db.d.ts` 由 kysely-codegen 生成（**不要手改**）。
- `integrations/`：环境配置、邮件、存储（local/S3）、队列（BullMQ）、Redis、导入导出、健康检查等。
- `ws/`：Socket.IO WebSocket 网关与 Redis 适配器。
- `common/`：装饰器、守卫、拦截器、中间件、校验器、日志。

### 前端 `apps/client/src/`

- `features/`：按领域组织的功能模块（`auth`、`page`、`editor`、`space`、`workspace`、`search`、`comment`、`attachments`、`websocket` 等），模块内含 `components/`、`hooks/`、`services/`（API 调用）、`atoms/`（jotai 状态）。
- `pages/`：路由级页面；路由集中在 `App.tsx`。
- `components/`：共享组件（`ui/`、`layouts/`、`settings/` 等）。
- `lib/`：`api-client.ts`（axios 实例）、`config.ts`、工具函数。路径别名 `@` 指向 `src/`。
- `ee/`：EE 功能的禁用 stub，勿在其中新增功能。

### 编辑器扩展 `packages/editor-ext/`

前后端共用的 Tiptap 扩展（数学公式、表格、提及、绘图嵌入等）。前端通过 `module` 字段直接引用源码，后端使用 `main` 字段指向的 `dist/` 编译产物 —— **修改后需执行 `pnpm editor-ext:build`，否则服务端构建不会拿到更新**。

## 技术栈

- 前端：React 18、TypeScript、Vite 7、Mantine 8（UI）、Tiptap 2.27（编辑器）、TanStack Query 5（服务端状态）、jotai（客户端状态）、react-router-dom 7、i18next、socket.io-client、zod + mantine-form（表单校验）。
- 后端：NestJS 11（Fastify）、Kysely + PostgreSQL、Redis（缓存/队列/Socket.IO 适配）、BullMQ（队列）、Socket.IO、Hocuspocus + Yjs（协同）、CASL（权限）、JWT + bcrypt（认证）、sharp、React Email（邮件模板）。
- 工具链：pnpm 10.4（workspace）、Nx 20（构建编排/缓存）、TypeScript 5.7、ESLint 9（flat config）、Prettier、Jest（后端）。

## 构建与运行命令

所有命令在仓库根目录执行（Node 22 + pnpm 10.4，`pnpm install` 优先）：

| 命令                                                                | 说明                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                                          | 并行启动前端（Vite, :5173）和后端（Nest watch, :3000）     |
| `pnpm client:dev` / `pnpm server:dev`                               | 单独启动前端 / 后端开发服务                                |
| `pnpm build`                                                        | Nx 构建全部（含 editor-ext、client、server）               |
| `pnpm client:build` / `pnpm server:build` / `pnpm editor-ext:build` | 单独构建                                                   |
| `pnpm start`                                                        | 生产模式启动后端（`node dist/main`，同时托管前端静态文件） |
| `pnpm collab` / `pnpm collab:dev`                                   | 启动独立的协同编辑服务                                     |
| `pnpm email:dev`                                                    | React Email 模板预览（:5019）                              |

数据库迁移（Kysely，在根目录通过 filter 调用）：

```bash
pnpm --filter ./apps/server run migration:latest   # 应用所有迁移
pnpm --filter ./apps/server run migration:create   # 新建迁移
pnpm --filter ./apps/server run migration:up / down / redo
pnpm --filter ./apps/server run migration:codegen  # 从数据库重新生成 db.d.ts 类型
```

Lint / 格式化：

```bash
pnpm --filter ./apps/client run lint     # ESLint（前端）
pnpm --filter ./apps/server run lint     # ESLint --fix（后端）
pnpm --filter ./apps/client run format   # Prettier（前端）
pnpm --filter ./apps/server run format   # Prettier（后端）
```

## 开发环境搭建

1. `docker compose up -d db redis` 启动 PostgreSQL 16 与 Redis 7.2。
2. 复制 `.env.example`（或内网部署用 `.env.internal.example`）为 `.env`，设置 `APP_SECRET`（`openssl rand -hex 32` 生成）、`DATABASE_URL`、`REDIS_URL`。
3. `pnpm install`。
4. `pnpm --filter ./apps/server run migration:latest && pnpm --filter ./apps/server run migration:codegen`。
5. `pnpm dev`，浏览器访问 http://localhost:5173（首次进入会跳转 `/setup/register` 初始化工作区）。

详细步骤见 `doc/dev/LOCAL_STARTUP_GUIDE.md` 和 `doc/dev/QUICKSTART.md`。

## 代码风格约定

- 全仓库 TypeScript；前后端均使用 ESLint 9 flat config（`eslint.config.mjs`），前端启用 react-hooks / react-refresh / @tanstack/query 插件。前端放宽了 `no-explicit-any`、`no-unused-vars`、`exhaustive-deps` 等规则。
- 使用 Prettier 格式化（无独立配置文件，走默认规则）；提交前运行对应包的 `format` 脚本。
- 后端遵循 NestJS 模块划分：新功能放入 `core/<domain>/`，包含 controller/service/module，并通过 `database/repos/` 访问数据库；校验用 class-validator DTO，权限用 CASL。
- 数据库 schema 变更必须新增迁移文件（命名格式 `YYYYMMDDTHHMMSS-<name>.ts`），然后运行 `migration:codegen` 更新类型，禁止手改 `database/types/db.d.ts`。
- 前端新 API 调用放在对应 feature 的 `services/` 中，通过 `lib/api-client.ts` 的 axios 实例发起；服务端状态用 TanStack Query，跨组件客户端状态用 jotai atom。
- 前端路径别名 `@` = `apps/client/src`。
- 代码注释与标识符使用英文；面向用户的文档（doc/、README 部署章节）使用中文。

## 测试

- 后端单元测试：Jest + ts-jest，测试文件与源码同目录、命名 `*.spec.ts`（目前约 16 个，主要覆盖工具类与部分服务）。
  ```bash
  pnpm --filter ./apps/server run test        # 全部单测
  pnpm --filter ./apps/server run test:cov    # 覆盖率
  pnpm --filter ./apps/server run test:e2e    # e2e（apps/server/test，jest-e2e.json）
  ```
- 前端**没有测试框架**，不要引入；改动后至少通过 `pnpm client:build`（含 `tsc` 类型检查）验证。
- 修改后端代码后应运行 `pnpm server:build` 和相关 Jest 测试验证。

## 部署

- **Docker**：根 `Dockerfile` 为多阶段构建（Node 22-slim），支持 `--build-arg BASE_PATH=/docmost` 构建子目录版本；容器以非 root 用户运行，`/app/data/storage` 为附件存储卷。详见 `doc/dev/DOCKER_BUILD_GUIDE.md`。
- **docker-compose**：`docker-compose.yml` 提供 docmost + postgres:16-alpine + redis:7.2-alpine 三服务编排。
- **CI**：`.github/workflows/docker-build.yml` 在 push 到 `main`/`master`/`feature_nonetwork` 或打 tag 时构建并推送镜像到 DockerHub（需配置 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets）。
- **子目录部署**：设置 `APP_URL` + `BASE_PATH`（以 `/` 开头、不以 `/` 结尾），Nginx 需为 `/api`、`/socket.io`、`/collab` 配置 WebSocket 代理头。完整配置示例见根 `README.md`。
- **内网部署**：参考 `doc/dev/INTERNAL_NETWORK_DEPLOYMENT_GUIDE.md`，必须 `CLOUD=false`、`DISABLE_TELEMETRY=true`。

## MCP Agent 接口

后端在配置 `MCP_API_TOKEN` 后提供 MCP 2024-11 SSE 接口；未配置时端点保持存在，但统一返回 401。相关环境变量：

| 变量                   | 默认值                | 说明                                                           |
| ---------------------- | --------------------- | -------------------------------------------------------------- |
| `MCP_API_TOKEN`        | 空                    | Bearer Token，启用时至少 32 字符；生产环境建议使用随机长字符串 |
| `MCP_AGENT_USER_EMAIL` | `agent@docmost.local` | 每个 Workspace 内系统 Agent 用户的邮箱                         |
| `MCP_RATE_LIMIT_RPS`   | `10`                  | 每个 MCP 会话每秒允许的 messages 请求数，必须为正整数          |

- SSE 连接：`GET {BASE_PATH}/mcp/sse`
- 消息投递：`POST {BASE_PATH}/mcp/messages?sessionId=<id>`
- 两个端点都必须携带 `Authorization: Bearer <MCP_API_TOKEN>`。
- 支持 `list_workspaces`、`create_space`、`insert_page_tree`、`create_page`、`update_page`、`move_page`、`list_space_pages`、`get_page_markdown`、`analyze_page_tree` 共 9 个 tools。
- 页面写入内容使用 Markdown；服务端同步生成 ProseMirror JSON、纯文本和 Ydoc。`insert_page_tree` 单次最多 100 个页面节点。

通用 MCP Client 配置示例（具体字段名以客户端版本为准）：

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

实现依据：`apps/server/src/core/mcp/mcp.controller.ts`（端点、会话与限流）、`apps/server/src/core/mcp/mcp-tools.service.ts`（tool 清单与资源归属校验）、`apps/server/src/core/mcp/mcp-agent-user.service.ts`（Workspace Agent 用户）。

## 安全注意事项

- `.env` 含 `APP_SECRET`（≥32 字符）与数据库口令，**绝不提交**；`.env.example` / `.env.internal.example` 仅为模板。
- 本项目基于 AGPL-3.0 许可的 Docmost 修改，对外提供网络服务时需遵守 AGPL 的源码开放义务（这也是内网合规改造的目标之一，见 `doc/dev/EE_REMOVAL_REPORT.md`）。
- EE 目录（`apps/client/src/ee/`、服务端 ee submodule）已禁用，不要在其中恢复或新增功能；新增功能写入核心模块。
- 不要重新引入任何外网调用（遥测、CDN、字体/统计等），保持离线可用。
- 认证基于 JWT（HttpOnly cookie，`authToken` 的 Path 需与 `BASE_PATH` 一致）；涉及认证、权限（CASL）、文件上传的改动需格外谨慎。
