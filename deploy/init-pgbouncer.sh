#!/bin/sh
set -e
CONFIG=/etc/pgbouncer/pgbouncer.ini
if ! grep -q 'password=' "$CONFIG"; then
  sed -i "s|host=postgres port=5432 auth_user=voxrelay$|host=postgres port=5432 auth_user=voxrelay password=${DB_PASSWORD}|" "$CONFIG"
fi
exec /entrypoint.sh /usr/bin/pgbouncer /etc/pgbouncer/pgbouncer.ini
