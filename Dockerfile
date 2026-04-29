# =============================================================================
# AfriserveBackend — multi-stage Docker build
# =============================================================================
# All stages use Node 22 LTS (current LTS as of 2026-Q1).
# @types/node in package.json is pinned to ^22.x.x to match.
#
# Stage layout:
#   builder          — compiles TypeScript server
#   frontend-builder — builds React/Vite frontend
#   deps             — production-only node_modules
#   production       — minimal runtime image
# =============================================================================

# ── Stage 1: compile TypeScript server ────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.strict.json ./
COPY src ./src
COPY scripts ./scripts
COPY prisma ./prisma
COPY public ./public

RUN npm run build:server

# ── Stage 2: build React/Vite frontend ────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/frontend-next

COPY frontend-next/package*.json ./
RUN npm ci

COPY frontend-next ./

ARG FRONTEND_APP_ENV=production
ARG FRONTEND_API_BASE_URL=/api
ARG FRONTEND_API_TIMEOUT_MS=15000
ARG FRONTEND_LOG_LEVEL=warn

ENV VITE_APP_ENV=${FRONTEND_APP_ENV}
ENV VITE_API_BASE_URL=${FRONTEND_API_BASE_URL}
ENV VITE_API_TIMEOUT_MS=${FRONTEND_API_TIMEOUT_MS}
ENV VITE_LOG_LEVEL=${FRONTEND_LOG_LEVEL}

RUN npm run build

# ── Stage 3: production node_modules only ─────────────────────────────────────
FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package*.json ./
# Runtime startup runs `prisma migrate deploy`, so the Prisma CLI must
# remain available even though most devDependencies are omitted.
RUN npm ci --omit=dev --ignore-scripts \
  && npm rebuild better-sqlite3 \
  && npm install --no-save --ignore-scripts prisma@6.19.2

# ── Stage 4: minimal production runtime ───────────────────────────────────────
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=frontend-builder /app/frontend-next/dist ./dist/frontend-next
COPY package*.json ./

RUN groupadd --system app \
  && useradd --system --gid app --create-home --home-dir /home/app --shell /usr/sbin/nologin app \
  && mkdir -p /app/data/uploads /home/app/data/uploads \
  && chown -R app:app /app /home/app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r)=>{if(!r.ok)process.exit(1);}).catch(()=>process.exit(1));"]

USER app

CMD ["node", "dist/src/server.js"]
