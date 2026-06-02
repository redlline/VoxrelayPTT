#!/usr/bin/env bash
set -euo pipefail

ENV=${1:-production}
COMPOSE_DIR="$(cd "$(dirname "$0")/../compose" && pwd)"

docker compose -f "$COMPOSE_DIR/$ENV.yml" -f "$COMPOSE_DIR/monitoring.yml" up -d prometheus grafana postgres-exporter redis-exporter node-exporter

echo "=== Monitoring stack started for $ENV ==="
echo "  Prometheus: http://localhost:9090"
echo "  Grafana:    http://localhost:3000"
echo ""
echo "To stop: docker compose -f $COMPOSE_DIR/monitoring.yml down"
