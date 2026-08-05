# NotionLike

A self-hosted workspace for nested pages, block editing, offline-safe synchronization, search, sharing, and Android access.

## Repository

- `apps/api` — Fastify API and PostgreSQL migrations
- `apps/web` — Next.js web client
- `apps/mobile` — Expo React Native Android client
- `packages/contracts` — shared validation and API types
- `packages/editor` — shared Tiptap editor and mobile bridge

## Quick start

```sh
cp .env.example .env
# Replace all change-me values, then:
docker compose build
docker compose up -d
```

Open `http://localhost`. The API health endpoint is `http://localhost/health`.

Development and validation commands run through pnpm (`pnpm typecheck`, `pnpm test`, and `pnpm build`). If Node.js is not installed locally, use the Docker images described in [docs/self-hosting.md](docs/self-hosting.md).
