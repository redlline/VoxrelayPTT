FROM node:20-bookworm AS base
RUN apt-get update -qq && apt-get install -y -qq python3-pip build-essential ffmpeg && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@9.1.0

FROM base AS development
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY services/media-sfu/package.json ./services/media-sfu/
COPY apps/web/package.json ./apps/web/
COPY packages/voxrelay-core/package.json ./packages/voxrelay-core/
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3003 9229 40000-40100/udp
CMD ["pnpm", "--filter", "@voxrelay/media-sfu", "dev"]

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY services/media-sfu/package.json ./services/media-sfu/
COPY apps/web/package.json ./apps/web/
COPY packages/voxrelay-core/package.json ./packages/voxrelay-core/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @voxrelay/media-sfu build

FROM base AS production
WORKDIR /app/services/media-sfu
COPY --from=build /app/services/media-sfu/dist ./dist
COPY --from=build /app/services/media-sfu/migrations ./migrations
COPY --from=build /app/services/media-sfu/package.json ./package.json
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/services/media-sfu/node_modules ./node_modules
COPY --from=build /app/packages /app/packages
EXPOSE 3003 40000-40100/udp
USER node
CMD ["node", "dist/main.js"]
