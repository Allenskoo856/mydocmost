FROM node:22-slim AS base
LABEL org.opencontainers.image.source="https://github.com/docmost/docmost"

RUN npm install -g pnpm@10.4.0

WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install workspace dependencies from lockfile only.
# This layer stays cached unless package manifests / lockfile / patches change.
# ---------------------------------------------------------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/editor-ext/package.json ./packages/editor-ext/package.json

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# builder: copy source and build after deps are installed.
# ---------------------------------------------------------------------------
FROM deps AS builder

ARG BASE_PATH="/"
ENV BASE_PATH=$BASE_PATH
ENV NX_DAEMON=false

COPY . .

RUN pnpm build

# ---------------------------------------------------------------------------
# installer: production image with prod deps + build artifacts.
# ---------------------------------------------------------------------------
FROM base AS installer

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install prod dependencies first so source/build changes do not invalidate
# the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/editor-ext/package.json ./packages/editor-ext/package.json

RUN chown -R node:node /app
USER node
RUN pnpm install --frozen-lockfile --prod

USER root
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
RUN chown -R node:node /app/apps /app/packages

USER node

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]
