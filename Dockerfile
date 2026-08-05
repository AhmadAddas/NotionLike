# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/editor/package.json packages/editor/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps ./apps
COPY --from=dependencies /workspace/packages ./packages
COPY . .
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @notionlike/contracts build \
 && pnpm --filter @notionlike/api build \
 && pnpm --filter @notionlike/web build

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/packages/contracts ./packages/contracts
COPY --from=builder /workspace/apps/api ./apps/api
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

