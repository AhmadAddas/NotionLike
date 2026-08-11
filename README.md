# NotionLike — Work in Progress

> **WIP:** NotionLike is an actively developed, self-hosted collaborative workspace. It is an MVP and is **not yet a complete Notion or AppFlowy replacement**. Do not use it as the only copy of important data without tested backups.

A self-hosted workspace for nested pages, block editing, offline-safe synchronization, structured databases, collaboration, sharing, and Android access. AI features and third-party integrations are intentionally out of scope.

## Current features

### Pages and editor

- Nested pages with icons, covers, favorites, archiving and optimistic revision checks.
- Collaborative Tiptap/Yjs block editor.
- Paragraphs, headings, bold, italic, underline, highlight, links, ordered and unordered lists, task lists, quotes, syntax-highlighted code blocks and images.
- Slash-command insertion menu with text, headings, lists, tasks, dividers, tables, callouts, toggles and attachments.
- Editable simple tables, collapsible toggle blocks, callouts and horizontal dividers.
- Offline editor persistence in IndexedDB and durable server-side Yjs updates.
- Live document updates and basic collaborator presence.
- File uploads to self-hosted S3/MinIO, including inline images, inline PDF previews and downloadable document attachments.
- Page search, public read-only links, named versions and version restoration APIs.
- Markdown, HTML and text note import; Markdown, HTML and JSON page export.

### Structured databases

- Workspace databases with rows and typed property definitions.
- Table, board, calendar, list and gallery views.
- Property definitions for title, text, number, select, multi-select, status, date, checkbox, URL, email, people, files, relation, formula and rollup.
- Same-database row relations, safe arithmetic formulas and rollup aggregations for count, sum, average, minimum, maximum and displayed values.
- Page-backed database rows that open in the full collaborative editor, with synchronized titles and automatic legacy-row materialization.
- Saved view configuration, sorting metadata and grouping metadata.
- Persistent compound filters, multi-column sorting, grouping and numeric totals.
- Drag-and-drop status boards and a navigable month calendar with drag-to-reschedule.
- Public database forms with typed fields, required-field validation, configurable labels, share links and response storage.
- Visual database automations with property-change and recurring schedule triggers, set-property, notification and archive actions, manual runs, enable/disable controls and execution logs.

### Collaboration and identity

- Email/password registration and authentication.
- Password recovery through configurable SMTP.
- Generic OpenID Connect SSO for self-hosted identity providers.
- Workspace invitations and invitation acceptance.
- Owner, admin, member and guest workspace roles.
- Inherited page permissions: view, comment, edit and full access.
- Threaded page/block comments, replies and resolution.
- In-app notifications and read state.
- Workspace audit-log API and profile locale/timezone settings.

### Clients and operations

- Responsive Next.js web application.
- Expo React Native Android application using the shared editor bridge.
- Docker Compose deployment with Caddy, PostgreSQL and MinIO.
- Health/readiness endpoints, database migrations, backup and restore scripts.
- Declarative, capability-limited workspace plugin manifests with enable/disable controls.

## Known bugs and limitations

- Relations currently use row IDs and target rows in the same database; cross-database relation browsing and automatic bidirectional properties are unfinished.
- Formulas currently support safe arithmetic and property references, not the complete Notion-style formula language for strings, dates and collections.
- Database view controls cover filters, sorts and grouping, but do not yet support nested AND/OR filter groups or every property-specific operator.
- Calendar supports month navigation and drag-to-reschedule, but week/day layouts and recurring events are not implemented.
- Form creation and public submission are available; drag-and-drop field ordering, conditional fields and response analytics are unfinished.
- Scheduled automations run in the API process; multi-instance deployments require a dedicated distributed job runner to prevent duplicate executions.
- Live presence shows viewers, but not remote cursors, selections or block-level activity.
- WebSocket reconnection and large-room scaling are not production-hardened.
- Comments do not have text-range anchoring, mentions, reactions or attachments.
- Notifications are in-app only; email and mobile push delivery are not implemented.
- Search does not yet provide complete full-text indexing of editor documents, comments and database values.
- Page history has snapshots/restoration APIs but no visual diff or complete history browser.
- Offline support is strongest for an already-open editor. Complete offline workspace navigation, databases, attachments and conflict resolution are unfinished.
- PDF files can be previewed inline, but PDF text extraction, annotation and full-screen reading are not implemented.
- Imported Markdown/HTML supports basic text structure and does not preserve every rich block or asset.
- Export is per page; full workspace ZIP export is not available.
- Public pages do not yet offer site navigation, themes, SEO controls, analytics or custom-domain management UI.
- The plugin system validates and stores manifests, but it does not yet execute UI extensions or provide a complete sandboxed SDK.
- OIDC is supported, but SAML, SCIM, domain claiming and enterprise authentication policies are not.
- File upload size is currently limited to 25 MB.
- Android is an early Expo client; native sharing, widgets, capture, push notifications and background sync are unfinished.
- There are no iOS or desktop clients and no browser web clipper.
- Automated coverage is limited; collaboration, permissions, migrations and offline conflict cases need broader integration and end-to-end tests.
- Self-hosted upgrades currently use startup migrations and do not provide zero-downtime orchestration or an administration dashboard.

## Pending work

### Editor parity

- Block insertion controls and drag handles.
- Multi-block selection, duplication, movement and block transformation.
- Toggle headings and multi-column layouts.
- Table of contents, breadcrumbs, equations, buttons and reusable templates.
- Synced blocks, backlinks, page mentions, user mentions and reminders.
- Audio/video viewers, captions, resizing, bookmarks and rich embeds.
- Code-language selection, more colors and typography controls.

### Database and project parity

- Cross-database and bidirectional relations plus a complete formula language for strings, dates, conditions and collections.
- Nested AND/OR filter groups and property-specific calculations beyond count and sum.
- Timeline, chart and dashboard views.
- Week/day calendar layouts and recurring calendar events.
- Configurable card previews and visible properties.
- Database templates, linked database views and buttons.
- Drag-and-drop form design, conditional fields, response analytics and export.
- Compound automation conditions, retry policies, delayed actions and a distributed job runner.
- Recurring tasks, dependencies, milestones and project reporting.

### Collaboration, security and administration

- Remote cursors/selections, presence reconnection and horizontally scalable collaboration rooms.
- Comment mentions, text-range annotations, reactions, attachments and subscriptions.
- Notification preferences, grouping, email delivery and Android push notifications.
- User groups, teamspaces, permission diagnostics and a complete guest-management UI.
- Visual version history/diffs and more granular restore tools.
- SAML, SCIM, domain verification, enforced policies and session/device management.
- Audit-log UI, retention policies, legal holds, workspace analytics and security dashboards.
- Admin UI for registration, SMTP, storage, OIDC, jobs, backups and system health.

### Portability, publishing and extensibility

- Notion/AppFlowy workspace importers, CSV database import and ZIP asset imports.
- Full workspace export, scheduled exports and backup management UI.
- Template gallery and workspace/page/database template creation.
- Published sites with navigation, themes, SEO, analytics and custom domains.
- Localization of the complete interface and right-to-left layout support.
- Sandboxed plugin runtime, versioned SDK, permission prompts, lifecycle hooks and plugin marketplace.

### Clients and offline

- Production-quality Android UX with native navigation, capture/share targets, background sync and notifications.
- iOS client.
- Native Windows, macOS and Linux desktop clients.
- Browser extension/web clipper.
- Explicit offline downloads, attachment queues, database caches, offline search and conflict-resolution UI.

## Current development status

Completed implementation phases:

1. Monorepo foundation.
2. API, authentication, pages and Yjs synchronization.
3. Responsive web workspace and offline editor.
4. Android client and editor bridge.
5. Production self-hosting stack.
6. Collaboration, identity, invitations, permissions, comments, presence and notifications.
7. Structured databases, views, forms and automations.
8. File/PDF uploads, imports, exports and plugin manifests.
9. Rich editor blocks, slash commands, simple tables and inline PDF previews.
10. Advanced database filters, sorting, grouping, totals, board drag-and-drop and month calendar.
11. Functional same-database relations, safe arithmetic formulas and rollup aggregations.
12. Page-backed database rows with collaborative document bodies.
13. Public database forms with typed response collection.
14. Visual property-change and recurring automations with execution history.

The production TypeScript/API/web image builds pass. A clean live migration test for the latest migrations still needs to be repeated on a host with available Docker storage; the development host had a full `/var` partition during the last migration run.

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

Before exposing the service publicly, configure strong PostgreSQL/MinIO passwords, HTTPS, SMTP if recovery is needed, backups and an OIDC provider if SSO is required. See [the self-hosting guide](docs/self-hosting.md).

Development and validation commands run through pnpm (`pnpm typecheck`, `pnpm test`, and `pnpm build`). If Node.js is not installed locally, use the Docker images described in [docs/self-hosting.md](docs/self-hosting.md).
