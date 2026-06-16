#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

COMPOSE_DIR="${COMPOSE_DIR:-$(pwd)}"
COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-$COMPOSE_DIR}"
COMPOSE_FILE="$COMPOSE_DIR/infra/compose/production.yml"
COMPOSE="docker compose -f $COMPOSE_FILE --project-directory $COMPOSE_PROJECT_DIR -p ptt"
VOLUME_PREFIX="ptt"

echo "=== Backing up VoxRelay databases ==="
BACKUP_DIR="infra/scripts/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "  Backing up voxrelay..."
$COMPOSE exec -T postgres pg_dump -U voxrelay voxrelay | gzip > "$BACKUP_DIR/voxrelay_${TIMESTAMP}.sql.gz"

echo "=== Backing up MinIO object storage ==="
docker run --rm \
  -v "${VOLUME_PREFIX}_miniodata:/data:ro" \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine sh -c "tar czf /backup/minio_${TIMESTAMP}.tar.gz -C /data ."

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "=== Backup complete: $BACKUP_DIR ==="
