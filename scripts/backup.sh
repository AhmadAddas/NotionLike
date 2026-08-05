#!/bin/sh
set -eu
backup_dir="${1:-./backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$backup_dir"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-notionlike}" -d "${POSTGRES_DB:-notionlike}" -Fc > "$backup_dir/database.dump"
docker compose exec -T minio sh -c 'tar -C /data -czf - .' > "$backup_dir/objects.tar.gz"
git rev-parse HEAD > "$backup_dir/version.txt" 2>/dev/null || printf '%s\n' "${VERSION:-unknown}" > "$backup_dir/version.txt"
printf 'Backup written to %s\n' "$backup_dir"

