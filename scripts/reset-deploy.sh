#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=${PROJECT_DIR:-/opt/ptt}
cd "$PROJECT_DIR"

echo "[1/8] Preparing production env"
cp -f .env.production .env

echo "[2/8] Stopping current stack"
docker compose down --remove-orphans || true

echo "[3/8] Removing old containers/images/cache"
docker container prune -f || true
docker image prune -af || true
docker builder prune -af || true

echo "[4/8] Ensuring clean frontend build"
rm -rf apps/web/dist services/media-sfu/dist

echo "[5/8] Building frontend locally for nginx static serving"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm --filter @voxrelay/web build
pnpm --filter @voxrelay/media-sfu build

echo "[6/8] Rebuilding services"
docker compose build --no-cache auth-service channel-svc media-sfu web-gateway

echo "[7/8] Starting stack"
docker compose up -d

echo "[8/8] Result"
docker compose ps
echo
df -h /
