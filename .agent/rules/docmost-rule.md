---
trigger: always_on
---

# Copilot Instructions for 文档中心

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
  - Dev servers: `nvm use 22 && pnpm dev` (Vite on 5173 with proxy → `APP_URL`, Nest on 3000)
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
- Env keys surfaced to client via `window.CONFIG`: `APP_URL, CLOUD, COLLAB_URL, FILE_*_SIZE_LIMIT, DRAWIO_URL, SUBDOMAIN_HOST, BILLING_TRIAL_DAYS`.
- Patched deps: `react-arborist@3.4.0.patch` via pnpm patches—be careful when upgrading.