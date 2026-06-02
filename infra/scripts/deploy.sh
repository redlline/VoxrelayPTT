#!/usr/bin/env bash
set -euo pipefail

ENV=${1:-production}
COMPOSE_DIR="$(cd "$(dirname "$0")/../compose" && pwd)"
COMPOSE_FILE="$COMPOSE_DIR/$ENV.yml"
MONITORING_FILE="$COMPOSE_DIR/monitoring.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: compose file not found: $COMPOSE_FILE"
  echo "Usage: $0 [production|staging]"
  exit 1
fi

echo "=== Deploying VoxRelay ($ENV) ==="

# Pull latest images
docker compose -f "$COMPOSE_FILE" pull

# Start services
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Health check
echo "Waiting for services to be healthy..."
sleep 10

SERVICES=$(docker compose -f "$COMPOSE_FILE" ps --services)
for svc in $SERVICES; do
  status=$(docker compose -f "$COMPOSE_FILE" ps "$svc" --format json | python -c "import sys,json; print(json.load(sys.stdin)['Health'] if 'Health' in json.load(sys.stdin) else 'running')" 2>/dev/null || echo "unknown")
  echo "  $svc: $status"
done

echo "=== Deploy complete ==="
