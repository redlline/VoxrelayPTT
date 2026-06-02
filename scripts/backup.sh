#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# VoxRelay Production Backup Script
# Backs up PostgreSQL, Redis (if RDB available), and config
# ============================================================

BACKUP_DIR="${BACKUP_DIR:-/opt/ptt/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${ENV_FILE:-/opt/ptt/.env}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/ptt}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

# Load env vars for DB credentials
set -a
source "$ENV_FILE" 2>/dev/null || true
set +a

mkdir -p "$BACKUP_PATH"

cleanup_old() {
  find "$BACKUP_DIR" -maxdepth 1 -type d -name "20*" -mtime +"$RETENTION_DAYS" -exec rm -rf {} \; 2>/dev/null || true
  # Also clean old .sql/.tar files at root level
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "*.sql" -o -name "*.tar.gz" \) -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
}

# --- PostgreSQL ---
backup_postgres() {
  echo "[$(date '+%H:%M:%S')] Dumping PostgreSQL..."
  cd "$COMPOSE_DIR"
  docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --no-comments \
    > "${BACKUP_PATH}/postgres.sql"
  gzip -9 "${BACKUP_PATH}/postgres.sql"
  echo "  -> postgres dump: $(du -h "${BACKUP_PATH}/postgres.sql.gz" | cut -f1)"
}

# --- Redis (via SAVE + copy RDB) ---
backup_redis() {
  echo "[$(date '+%H:%M:%S')] Saving Redis..."
  cd "$COMPOSE_DIR"
  docker compose exec -T redis redis-cli SAVE 2>/dev/null || true
  # Copy RDB from Redis volume if accessible, else skip
  local rdb_src=$(docker inspect "$(docker compose ps -q redis)" \
    -f '{{range .Mounts}}{{.Source}}{{end}}' 2>/dev/null | head -1 || echo "")
  if [ -n "$rdb_src" ] && [ -f "$rdb_src/dump.rdb" ]; then
    cp "$rdb_src/dump.rdb" "${BACKUP_PATH}/redis.rdb"
    echo "  -> redis dump: $(du -h "${BACKUP_PATH}/redis.rdb" | cut -f1)"
  else
    echo "  -> redis: volume not accessible, RDB dump skipped"
  fi
}

# --- Config files ---
backup_config() {
  echo "[$(date '+%H:%M:%S')] Backing up config..."
  tar czf "${BACKUP_PATH}/config.tar.gz" \
    -C "$COMPOSE_DIR" \
    docker-compose.yml \
    .env \
    deploy/nginx/ 2>/dev/null || true
  echo "  -> config: $(du -h "${BACKUP_PATH}/config.tar.gz" | cut -f1)"
}

# --- MinIO (list buckets as lightweight check) ---
backup_minio() {
  echo "[$(date '+%H:%M:%S')] Checking MinIO..."
  cd "$COMPOSE_DIR"
  docker compose exec -T minio mc ls local/ 2>/dev/null > "${BACKUP_PATH}/minio_buckets.txt" || \
    echo "MinIO listing skipped" > "${BACKUP_PATH}/minio_buckets.txt"
  echo "  -> minio buckets listed"
}

# --- Create summary ---
create_summary() {
  {
    echo "Backup timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "Host: $(hostname)"
    echo "Postgres dump: $(ls "${BACKUP_PATH}/postgres.sql.gz" 2>/dev/null && echo 'yes' || echo 'no')"
    echo "Redis dump: $(ls "${BACKUP_PATH}/redis.rdb" 2>/dev/null && echo 'yes' || echo 'no')"
    echo "Config: $(ls "${BACKUP_PATH}/config.tar.gz" 2>/dev/null && echo 'yes' || echo 'no')"
    echo "Disk free: $(df -h / | tail -1 | awk '{print $4}')"
  } > "${BACKUP_PATH}/backup-info.txt"
  echo "  -> summary written"
}

# --- Prune old backups ---
prune_old() {
  echo "[$(date '+%H:%M:%S')] Pruning backups older than ${RETENTION_DAYS} days..."
  cleanup_old
}

echo "=== VoxRelay Backup: $(date '+%Y-%m-%d %H:%M:%S') ==="
echo "Backup dir: $BACKUP_PATH"

backup_postgres
backup_redis
backup_config
backup_minio
create_summary
prune_old

echo "=== Backup complete: $(du -sh "$BACKUP_PATH" | cut -f1) ==="
