# Self-hosting NotionLike

## Requirements

- A Linux AMD64 or ARM64 server with Docker Engine 27+ and Docker Compose v2.
- At least 2 CPU cores, 4 GB RAM, and storage sized for the database plus attachments.
- A hostname pointing at the server and ports 80/443 open for automatic HTTPS. `localhost` can use HTTP for evaluation.

## Install

1. Copy `.env.example` to `.env`.
2. Replace every `change-me` value. Generate passwords with a password manager or `openssl rand -base64 32`.
3. For a public server, set `APP_HOST=notes.example.com`, `APP_URL=https://notes.example.com`, `SECURE_COOKIES=true`, and `S3_PUBLIC_URL` to the externally reachable MinIO endpoint.
4. Run `docker compose config` to validate configuration.
5. Run `docker compose build` and `docker compose up -d`.
6. Open `APP_URL`, create the first local account, then set `ALLOW_REGISTRATION=false` unless open registration is intended.

The stack starts PostgreSQL and MinIO, creates the attachment bucket, applies pending migrations once, starts the API and web clients after their dependencies are healthy, and places Caddy in front of the application.

## Android

Build a development APK with `pnpm --filter @notionlike/mobile android`, or configure an Expo account and use `eas build --profile preview --platform android`. The production profile emits an Android App Bundle. On first launch, enter the same HTTPS `APP_URL` used by the web client.

Android rejects clear-text HTTP outside development; use a trusted HTTPS certificate for devices. `http://10.0.2.2` is available to an Android emulator when the stack runs on the development host.

## Upgrade and rollback

1. Run `scripts/backup.sh` and copy the resulting directory off-server.
2. Pull the desired source tag or set `VERSION` to the intended image tag.
3. Run `docker compose build` followed by `docker compose up -d`.
4. Check `docker compose ps`, `docker compose logs api-migrate`, and `/health`.

To roll back application images, restore the previous source tag or `VERSION`. If the release changed the schema incompatibly, restore the matching backup rather than attempting a down-migration.

## Backup and restore

`scripts/backup.sh [destination]` creates a PostgreSQL custom-format dump, a compressed object-storage archive, and a Git/version marker. Store all three together outside the application server.

`scripts/restore.sh BACKUP_DIRECTORY` requires an explicit `RESTORE` confirmation, stops application writers, recreates the database and object store, and restarts the clients. Test restores regularly on a separate server.

## Storage and email

The bundled MinIO ports are suitable for a single server. For external S3, replace the S3 environment values and omit the MinIO services through a deployment override. SMTP-backed invitations and password recovery are reserved for the next release; current owners create accounts through enabled registration and then disable it.

## Security checklist

- Use HTTPS and `SECURE_COOKIES=true` in production.
- Disable registration after provisioning intended accounts.
- Keep PostgreSQL and the MinIO console bound to private interfaces.
- Use unique database, storage, and session secrets.
- Put backups on encrypted off-server storage and test recovery.
- Review container and dependency updates before each release.

