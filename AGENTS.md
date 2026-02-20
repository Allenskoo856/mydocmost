---
trigger: always_on
---

# Docmost 项目规则

## 项目概述
- 工具链：`pnpm` workspaces + Nx，包位于 `apps/*` 和 `packages/*`
- 应用：`apps/client` (React + Vite + TS)，`apps/server` (NestJS + Fastify)
- 运行时分离：HTTP API 在 `/api` 端口 3000，实时协作在 `/collab` 通过 WS

## 本地开发
- 前置条件：Postgres + Redis
- 启动命令：
  ```bash
  docker compose up -d db redis
  cp .env.example .env
  openssl rand -hex 32  # 设置 APP_SECRET
  pnpm install
  pnpm --filter ./apps/server run migration:latest
  pnpm dev
  ```
- 访问 `http://localhost:5173`（首次访问重定向到 `/setup/register`）

## 构建与运行
- 全量构建：`pnpm build`
- 分别构建：`pnpm client:build`，`pnpm server:build`
- 生产启动：`pnpm start`

## 测试
- 后端单元测试：`pnpm --filter ./apps/server test`
- 后端 E2E 测试：`pnpm --filter ./apps/server test:e2e`
- 代码检查：`pnpm run lint`

## 后端架构（NestJS）
- 入口：`apps/server/src/main.ts`（前缀 `/api`）
- 配置：`apps/server/src/integrations/environment/*`
- 数据库：Kysely + Postgres
- 实时：Socket.IO + Redis 适配器，Yjs/Hocuspocus 协作用于 `/collab`
- 企业模块：`apps/server/src/ee/*`

## 前端架构（React + Vite）
- 开发服务器代理：`apps/client/vite.config.ts`
- 配置访问：`apps/client/src/lib/config.ts`
- API 客户端：`apps/client/src/lib/api-client.ts`
- 数据获取：TanStack Query
- 国际化：i18next

## 常用任务
- 创建迁移：`pnpm --filter ./apps/server run migration:create --name=init`
- 运行迁移：`pnpm --filter ./apps/server run migration:latest`

## 核心理念
- 简洁至上：恪守 KISS 原则，避免过度工程化
- 深度分析：立足第一性原理剖析问题，善用工具提升效率
- 事实为本：以事实为最高准则

## 开发工作流
- 渐进开发：通过多轮对话迭代，明确并实现需求
- 结构化流程：构思方案 → 提请审核 → 分解为具体任务

## 输出规范
- 语言要求：所有回复、思考过程及任务清单，均须使用中文
- 除非用户主动要求，否则禁止随意创建 markdown 文件、shell 脚本

## 工作态度
- 每次工作都要用严谨的工作态度，保证完美的质量标准
## 沟通风格
- 直接输出代码或方案，禁止客套话（"抱歉"、"我明白了"等）
- 除非明确要求，否则不提供代码摘要
## 求真原则（禁止瞎猜）
- 不确定/信息不足时先查证或提问澄清
- 对环境/配置/源码/行为的结论必须有证据
- 回答里把"事实"和"推测/假设"分开写
