#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Setup daily cron job for VoxRelay backups
# ============================================================

BACKUP_SCRIPT="${BACKUP_SCRIPT:-/opt/ptt/scripts/backup.sh}"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 3 * * *}"  # daily at 3 AM
CRON_LOG="${CRON_LOG:-/var/log/voxrelay-backup.log}"

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "ERROR: $BACKUP_SCRIPT not found"
  exit 1
fi

chmod +x "$BACKUP_SCRIPT"

# Add to crontab (avoid duplicates)
CRON_LINE="$CRON_SCHEDULE root $BACKUP_SCRIPT >> $CRON_LOG 2>&1"

if [ -f /etc/crontab ]; then
  if grep -q "backup.sh" /etc/crontab 2>/dev/null; then
    echo "Cron entry already exists"
  else
    echo "$CRON_LINE" >> /etc/crontab
    echo "Added cron entry: $CRON_SCHEDULE"
  fi
fi

# Also try systemd timer if available
if command -v systemd-tmpfiles &>/dev/null; then
  mkdir -p /etc/systemd/system
  cat > /etc/systemd/system/voxrelay-backup.service <<'EOF'
[Unit]
Description=VoxRelay Database Backup
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/ptt/scripts/backup.sh
EOF

  cat > /etc/systemd/system/voxrelay-backup.timer <<'EOF'
[Unit]
Description=VoxRelay Daily Backup Timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload 2>/dev/null || true
  systemctl enable voxrelay-backup.timer 2>/dev/null || true
  systemctl start voxrelay-backup.timer 2>/dev/null || true
  echo "Systemd timer created and started"
fi

echo "Backup cron setup complete"
