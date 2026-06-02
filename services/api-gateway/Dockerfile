FROM node:20-bookworm AS base
RUN apt-get update -qq && apt-get install -y -qq python3-pip build-essential ffmpeg && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@9.1.0

# Development stage — install deps, bind-mount code at runtime
FROM base AS development
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY services/api-gateway/package.json ./services/api-gateway/
COPY apps/web/package.json ./apps/web/
COPY packages/voxrelay-core/package.json ./packages/voxrelay-core/
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000 9229 40000-40100/udp
CMD ["pnpm", "--filter", "@voxrelay/api-gateway", "dev"]

# Production build stage
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY services/api-gateway/package.json ./services/api-gateway/
COPY apps/web/package.json ./apps/web/
COPY packages/voxrelay-core/package.json ./packages/voxrelay-core/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @voxrelay/api-gateway build

# Production stage
FROM base AS production
WORKDIR /app/services/api-gateway
COPY --from=build /app/services/api-gateway/dist ./dist
COPY --from=build /app/services/api-gateway/migrations ./migrations
COPY --from=build /app/services/api-gateway/package.json ./package.json
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/services/api-gateway/node_modules ./node_modules
COPY --from=build /app/packages /app/packages
EXPOSE 3000 40000-40100/udp
USER node
CMD ["node", "dist/main.js"]
