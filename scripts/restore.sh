#!/bin/sh
set -eu
backup_dir="${1:?Usage: scripts/restore.sh BACKUP_DIRECTORY}"
test -f "$backup_dir/database.dump"
test -f "$backup_dir/objects.tar.gz"
printf 'This replaces the current NotionLike database and object files. Type RESTORE to continue: '
read -r confirmation
test "$confirmation" = RESTORE
docker compose stop api web
docker compose exec -T postgres dropdb -U "${POSTGRES_USER:-notionlike}" --if-exists "${POSTGRES_DB:-notionlike}"
docker compose exec -T postgres createdb -U "${POSTGRES_USER:-notionlike}" "${POSTGRES_DB:-notionlike}"
docker compose exec -T postgres pg_restore -U "${POSTGRES_USER:-notionlike}" -d "${POSTGRES_DB:-notionlike}" --clean --if-exists < "$backup_dir/database.dump"
docker compose exec -T minio sh -c 'find /data -mindepth 1 -delete && tar -C /data -xzf -' < "$backup_dir/objects.tar.gz"
docker compose up -d api web
printf 'Restore complete. Verify health with docker compose ps.\n'

