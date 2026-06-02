#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "=== Backing up VoxRelay databases ==="
BACKUP_DIR="infra/scripts/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

for db in voxrelay voxrelay_staging; do
  echo "  Backing up $db..."
  docker compose exec -T postgres pg_dump -U voxrelay "$db" | gzip > "$BACKUP_DIR/${db}_${TIMESTAMP}.sql.gz"
done

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "=== Backup complete: $BACKUP_DIR ==="
