# syntax=docker/dockerfile:1
# Next.js (standalone) — сборка и запуск без локальных Node/Bun/Rust.

# --- 1. Зависимости ---
FROM oven/bun:1 AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- 2. Сборка ---
FROM oven/bun:1 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# --- 3. Runtime (standalone-сервер на Node) ---
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# standalone самодостаточен (server.js + нужные node_modules).
COPY --from=builder /app/.next/standalone ./
# Явно страхуем static и public (на случай изменения build-скрипта).
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
