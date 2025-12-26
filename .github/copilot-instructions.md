# Copilot Instructions for Docmost

## Monorepo Overview
- Tooling: `pnpm` workspaces + Nx. Packages live under `apps/*` and `packages/*`.
- Apps: `apps/client` (React + Vite + TS), `apps/server` (NestJS + Fastify). Optional package: `packages/editor-ext` (Tiptap extensions).
- Runtime split:
  - HTTP API at `/api` on port `3000` (Nest app).
  - Realtime collaboration at `/collab` via WS on the main app; or a dedicated collab server (port `3001`).
- Build artifacts used in Docker image: `apps/server/dist`, `apps/client/dist`.

## Local Development
- Prereqs: Postgres + Redis. Quick start:
  - `docker compose up -d db redis`
  - Create `.env` at repo root: `cp .env.example .env`
  - Set `APP_SECRET` (min 32 chars): `openssl rand -hex 32`
  - Ensure `DATABASE_URL` and `REDIS_URL` match your local setup.
- Install + run:
  - `pnpm install`
  - Initialize DB (dev): `pnpm --filter ./apps/server run migration:latest`
  - Generate DB types: `pnpm --filter ./apps/server run migration:codegen`
  - Dev servers: `pnpm dev` (Vite on 5173 with proxy → `APP_URL`, Nest on 3000)
  - Open `http://localhost:5173` (first-run redirects to `/setup/register`).
- Collaboration server (optional dedicated process):
  - Build once: `pnpm server:build`
  - Run: `pnpm collab:dev` (defaults to `COLLAB_PORT=3001`)
  - Client picks `COLLAB_URL` from env; else falls back to `APP_URL`.

## Build & Run (Nx)
- Whole repo: `pnpm build` (Nx run-many).
- Individually: `pnpm client:build`, `pnpm server:build`.
- Production start (uses built dist): `pnpm start` → `server:start:prod`.

## Testing
- Backend Unit Tests: `pnpm --filter ./apps/server test`
- Backend E2E Tests: `pnpm --filter ./apps/server test:e2e`
- Linting: `pnpm run lint`
- Formatting: `pnpm run format` (available in sub-apps)

## Backend (NestJS)
- Entry: `apps/server/src/main.ts` (prefix `/api`). Static client served via `StaticModule` when `client/dist` exists.
- Env + config: `apps/server/src/integrations/environment/*`. Static module injects `window.CONFIG` into `apps/client/dist/index.html`.
- DB: Kysely + Postgres (`DatabaseModule`). In production, migrations auto-run; in dev, run manually via scripts in `apps/server/package.json`.
- Realtime:
  - Socket.IO with Redis adapter: `ws/adapter/ws-redis.adapter.ts` (uses `REDIS_URL`).
  - Yjs/Hocuspocus collaboration exposed at `/collab` (`collaboration/*`). Optional standalone at `collaboration/server/collab-main.ts`.
- Workspace routing: a Fastify preHandler requires `workspaceId` for most `/api` routes; missing workspace yields 404 and the client redirects to setup.
- Enterprise modules: loaded from `apps/server/src/ee/*` if present. If `CLOUD=true` and EE missing, the process exits.

## Frontend (React + Vite)
- Dev server proxy: `apps/client/vite.config.ts` proxies `/api`, `/socket.io`, `/collab` → `APP_URL` from root `.env`.
- Runtime config access: `apps/client/src/lib/config.ts` reads `process.env.*` in dev and `window.CONFIG` in prod. Index placeholder `<!--window-config-->` is replaced by the server.
- API client: `apps/client/src/lib/api-client.ts` wraps Axios with `baseURL: '/api'` + response interceptor that returns `response.data` (exports remains raw only for export endpoints). Follow existing services pattern, e.g. `features/user/services/user-service.ts`.
- Data fetching: TanStack Query (see `features/**/queries/*.ts`, hooks under `features/**/hooks`).
- i18n: i18next HTTP backend loading from `apps/client/public/locales/*` (`i18n.ts`).

## Common Tasks
- DB migrations (server):
  - Create: `pnpm --filter ./apps/server run migration:create --name=init`
  - Generate from schema: `pnpm --filter ./apps/server run migration:codegen`
  - Apply latest: `pnpm --filter ./apps/server run migration:latest`
  - Up/Down/Redo: see scripts in `apps/server/package.json`.
- Tests (server):
  - Unit: `pnpm --filter ./apps/server test`
  - E2E: `pnpm --filter ./apps/server test:e2e`

## Patterns & Conventions
- Keep API routes under `/api/*` and return DTOs the client expects; the frontend Axios interceptor unwraps bodies.
- Websocket endpoints: Socket.IO under `/socket.io`, collaboration under `/collab`.
- Env keys surfaced to client via `window.CONFIG`: `APP_URL, CLOUD, COLLAB_URL, FILE_*_SIZE_LIMIT, DRAWIO_URL, SUBDOMAIN_HOST, BILLING_TRIAL_DAYS, POSTHOG_*`.
- Patched deps: `react-arborist@3.4.0.patch` via pnpm patches—be careful when upgrading.

## 核心理念与原则 
- 简洁至上：恪守KISS（Keep It Simple, Stupid）原则，崇尚简洁与可维护性，避免过度工程化与不必要的防御性设计。 
- 深度分析：立足于第一性原理（First Principles Thinking）剖析问题，并善用工具以提升效率。 
- 事实为本：以事实为最高准则。若有任何谬误，恳请坦率斧正，助我精进。 

## 开发工作流
- 进式开发：通过多轮对话迭代，明确并实现需求。在着手任何设计或编码工作前，必须完成前期调研并厘清所有疑点。
- 结构化流程：严格遵循“构思方案 → 提请审核 → 分解为具体任务”的作业顺序。

## 输出规范  
- 语言要求：所有回复、思考过程及任务清单，均须使用中文。
- 固定指令Implementation Plan, Task List and Thought in Chinese




