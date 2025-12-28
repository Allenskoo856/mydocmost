FROM node:22-slim AS base
LABEL org.opencontainers.image.source="https://github.com/docmost/docmost"

FROM base AS builder

RUN npm install -g pnpm@10.4.0

WORKDIR /app

# Copy dependency and config files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json ./
COPY patches ./patches
COPY apps/server/package.json apps/server/tsconfig*.json ./apps/server/
COPY apps/client/package.json apps/client/tsconfig*.json ./apps/client/
COPY packages/editor-ext/package.json packages/editor-ext/tsconfig.json ./packages/editor-ext/

# Install dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# Build with Nx cache mount
RUN --mount=type=cache,target=/app/node_modules/.cache/nx \
    pnpm build

FROM base AS installer

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/

# Copy patches
COPY --from=builder /app/patches /app/patches

RUN npm install -g pnpm@10.4.0

RUN chown -R node:node /app

USER node

RUN pnpm install --frozen-lockfile --prod

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]
