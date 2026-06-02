#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# VoxRelay Health Alert — runs every 5 minutes via cron
# Sends alert to Telegram/ Slack / webhook on failure
# ============================================================

COMPOSE_DIR="${COMPOSE_DIR:-/opt/ptt}"
COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-$COMPOSE_DIR}"
COMPOSE_FILE="$COMPOSE_DIR/infra/compose/production.yml"
WEBHOOK_URL="${WEBHOOK_URL:-}"

STATE_FILE="/tmp/voxrelay-health-state.txt"
HOSTNAME=$(hostname)

if [ -z "$WEBHOOK_URL" ]; then
  exec > /dev/null 2>&1
fi

check_service() {
  local name="$1"
  local url="$2"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")
  echo "$status"
}

send_alert() {
  local message="$1"
  local prev_state=""
  if [ -f "$STATE_FILE" ]; then
    prev_state=$(cat "$STATE_FILE")
  fi

  local current_hash=$(echo "$message" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "$message" | md5 2>/dev/null || echo "$message")
  if [ "$prev_state" = "$current_hash" ]; then
    return 0
  fi
  echo "$current_hash" > "$STATE_FILE"

  if [ -n "$WEBHOOK_URL" ]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"[VoxRelay Alert] $message\"}" \
      --max-time 10 2>/dev/null || true
  fi
}

# Check API health
API_STATUS=$(check_service "API" "http://localhost:3000/health")
NGINX_STATUS=$(check_service "Nginx" "http://localhost/health")
PG_STATUS=$(check_service "Postgres" "http://localhost:5432" 2>/dev/null || echo "nocheck")

if [ "$API_STATUS" != "200" ]; then
  send_alert "API health check FAILED (HTTP $API_STATUS) on $HOSTNAME"
  exit 1
fi

if [ "$NGINX_STATUS" != "200" ]; then
  send_alert "Nginx health check FAILED (HTTP $NGINX_STATUS) on $HOSTNAME"
fi

# Check Docker containers
cd "$COMPOSE_DIR"
UNHEALTHY=$(docker compose -f "$COMPOSE_FILE" --project-directory "$COMPOSE_PROJECT_DIR" -p ptt ps --all --format '{{.Name}} {{.Status}}' | grep -v "Up" || true)
if [ -n "$UNHEALTHY" ]; then
  send_alert "Unhealthy containers on $HOSTNAME: $UNHEALTHY"
fi

rm -f "$STATE_FILE" 2>/dev/null || true
