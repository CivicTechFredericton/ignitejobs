# Node services (app, migrate) share one multi-stage build. Context: repo root.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS source
COPY . .

FROM source AS app-build
RUN pnpm --filter @ignite/web build

FROM source AS migrate
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed"]

# The site: React Router SSR with the API (apps/api) mounted at /api, in one Node process.
# The server bundle includes apps/api and packages/db; their npm dependencies stay external.
FROM base AS app
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=app-build /app/apps/web/build ./apps/web/build
COPY apps/web/package.json apps/web/server.js ./apps/web/
WORKDIR /app/apps/web
EXPOSE 3000
# Run the server directly: pnpm via corepack would fetch a package manager at startup.
CMD ["node", "server.js"]
