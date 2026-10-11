# Node services (api, web, migrate) share one multi-stage build. Context: repo root.
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

FROM source AS web-build
ARG VITE_CLERK_PUBLISHABLE_KEY
RUN pnpm --filter @ignite/web build

FROM source AS migrate
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed"]

FROM source AS api
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["pnpm", "--filter", "@ignite/api", "start"]

FROM base AS web
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=web-build /app/apps/web/build ./apps/web/build
COPY apps/web/package.json ./apps/web/
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
