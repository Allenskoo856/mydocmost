# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 本仓库已有一份面向 AI 代理的详尽文档 **`AGENTS.md`**（中文），涵盖架构、约定、命令、MCP 接口与安全事项。本文件只提炼「跨多个文件才能理解的大局」和「最常用命令」，细节请以 `AGENTS.md` 为准。

## 项目定位

**Docmost**（开源协作 Wiki / 文档系统，AGPL-3.0）的内网 / 离线定制 Fork（`mydocmost`），基于上游 v0.24.1。定制目标：**离线可用、可子目录部署、禁用企业版**。因此有三条贯穿全局的硬约束：

1. **不得重新引入任何外网调用**（遥测、PostHog、CDN、外链字体 / 统计）——保持离线可用。
2. **EE 已禁用**，不要在 `apps/client/src/ee/`（stub）或服务端 `apps/server/src/ee`（未初始化的 git submodule）中恢复 / 新增功能，新功能一律写入核心模块。
3. **子目录部署**：所有路径都要兼容 `BASE_PATH`（如 `/docmost`），认证 cookie 的 Path 必须与 `BASE_PATH` 一致。

## 常用命令

在**仓库根目录**执行（Node 22 + pnpm 10.4；本地启动 `nvm use 22 && pnpm dev`）：

```bash
pnpm dev                 # 并行启动前端(Vite :5173) + 后端(Nest watch :3000)
pnpm client:dev / server:dev   # 单独启动
pnpm build               # Nx 构建全部
pnpm editor-ext:build    # 改动 packages/editor-ext 后【必跑】——服务端用其 dist 产物
pnpm client:build        # 前端构建，含 tsc 类型检查（前端无测试框架，用它做验证）
pnpm server:build        # 后端构建
pnpm collab / collab:dev # 独立协同编辑服务(:3001)
```

数据库（Kysely，通过 filter 调用）：

```bash
pnpm --filter ./apps/server run migration:latest    # 应用迁移
pnpm --filter ./apps/server run migration:create    # 新建迁移(YYYYMMDDTHHMMSS-<name>.ts)
pnpm --filter ./apps/server run migration:codegen   # 改 schema 后重新生成 database/types/db.d.ts
```

测试 / 校验：

```bash
pnpm --filter ./apps/server run test         # 后端 Jest 单测(*.spec.ts，与源码同目录)
pnpm --filter ./apps/server run test -- <file>   # 跑单个测试文件
pnpm --filter ./apps/server run test:e2e     # e2e(apps/server/test, jest-e2e.json)
pnpm --filter ./apps/client run lint         # 前端 ESLint
pnpm --filter ./apps/server run lint         # 后端 ESLint --fix
```

> 若本机 Nx daemon 无法创建 Unix socket，用 `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm client:build`（沙箱限制，非代码错误）。

## 架构大图（需读多文件才能理解的部分）

**Monorepo**：pnpm workspace + Nx。`apps/client`（React18 + Vite7 + Mantine8 + Tiptap2）、`apps/server`（NestJS11 + Fastify）、`packages/editor-ext`（前后端共用的 Tiptap 扩展）。

### 运行时拆分与请求链路
- 后端入口 `apps/server/src/main.ts`：Fastify 适配器，全局前缀 `{BASE_PATH}/api`，端口 3000。生产环境由 `StaticModule` 托管 `apps/client/dist`。
- **三类实时通道**：普通 REST 在 `/api`；Socket.IO 在 `/socket.io`（`ws/`，Redis adapter 做多实例广播）；协同编辑 Yjs/Hocuspocus 在 `/collab`（`collaboration/`）。协同可内嵌主进程，也可用 `collaboration/server/collab-main.ts` 独立起进程（:3001）。
- **Workspace 路由守卫**：Fastify preHandler 要求多数 `/api` 路由带 `workspaceId`，缺失返回 404 → 前端跳 `/setup/register` 初始化。

### 配置注入（前端如何拿到运行时配置）
- 服务端把 `window.CONFIG`（`APP_URL / CLOUD / COLLAB_URL / BASE_PATH / FILE_*_SIZE_LIMIT / DRAWIO_URL` 等）注入 `client/dist/index.html` 的 `<!--window-config-->` 占位符。
- 前端 `lib/config.ts` 统一读取：dev 读 `process.env.*`，prod 读 `window.CONFIG`。**新增需暴露给前端的配置必须两端都改**。

### 前端数据流
- API：`lib/api-client.ts` 是 axios 实例，`baseURL=/api`，**响应拦截器直接返回 `response.data`**（导出接口例外，保留 raw）。新接口放对应 feature 的 `services/`。
- 服务端状态用 **TanStack Query**（`features/**/queries`），跨组件客户端状态用 **jotai atom**。路径别名 `@` = `apps/client/src`。
- 功能按领域切分在 `features/*`（`auth/page/editor/space/workspace/search/comment/attachments/websocket/page-history` 等），每个含 `components/hooks/services/queries/atoms`。

### 后端数据流
- 业务模块在 `core/<domain>/`（`auth/user/workspace/space/page/comment/attachment/group/share/search/mcp/casl`），遵循 NestJS 的 module/controller/service 划分。
- 数据访问统一走 `database/repos/`（Kysely），DTO 用 class-validator，权限用 **CASL**（`core/casl`），认证用 JWT（HttpOnly cookie）。
- `database/types/db.d.ts` 由 `migration:codegen` 生成，**禁止手改**；schema 变更必须新增迁移文件。

### editor-ext 的构建陷阱
`packages/editor-ext` 前端通过 `module` 字段直接引用源码，后端通过 `main` 字段引用 `dist/`。**改完必须 `pnpm editor-ext:build`**，否则服务端构建（如协同层的 markdown ↔ ProseMirror 转换）拿不到更新。

### MCP Agent 接口
后端在 `core/mcp` 提供 MCP Streamable HTTP 接口（`{BASE_PATH}/mcp`，兼容旧 SSE `/mcp/sse`），需 `MCP_API_TOKEN`。工具清单、Workspace/Space 解析、并发冲突（`expectedUpdatedAt` → `[PAGE_CONFLICT]`）等细节见 `AGENTS.md` 的「MCP Agent 接口」章节。

## 工作方式约定（来自 copilot-instructions.md）

- **所有回复、思考过程、任务清单使用中文**；代码注释与标识符使用英文。
- 恪守 **KISS**，避免过度工程化与不必要的防御性设计；以第一性原理分析问题，以事实为准，发现我判断有误请直接指出。
- 遵循「构思方案 → 提请审核 → 分解任务」的顺序，动手前先厘清疑点。
- **除非用户主动要求，不要随意创建 markdown 文件或 shell 脚本。**

## 性能优化上下文

`feature_nonetwork` 分支上有一条持续进行的「大文档 / 弱 CPU（国产机）性能优化」工作线，涉及协同编辑器重挂载、静态阅读模式、视口懒渲染、大文档降级等改动。**动到 `features/editor`、`packages/editor-ext`、协同加载路径前，先读 `context.md`**（含根因链、已完成修复 A/B 级、已知取舍与待办）。

## 深入参考

- `AGENTS.md` — 最全的架构 / 约定 / 命令 / MCP / 安全说明。
- `context.md` — 性能优化工作交接文档。
- `doc/dev/` — 部署与定制指南（`LOCAL_STARTUP_GUIDE`、`QUICKSTART`、`DOCKER_BUILD_GUIDE`、`INTERNAL_NETWORK_DEPLOYMENT_GUIDE`、`EE_REMOVAL_REPORT`）。
- `doc/PRD/` — 产品需求文档（页面属性体系、模板中心、Agent-MCP 接口设计）。
- 根 `README.md` — 子目录部署与 Nginx 反代完整示例。
