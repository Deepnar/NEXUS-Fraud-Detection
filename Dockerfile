# ---- deps: install production + dev dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate Prisma client + compile the app ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    # Placeholders only: env.ts validates at import during `next build`.
    # Real credentials are injected at runtime via compose env_file.
    DATABASE_URL="mysql://nexus:placeholder@localhost:3306/nexus_fraud" \
    AUTH_SECRET="build-time-placeholder-secret-0123456789abcdef" \
    NEXT_PUBLIC_APP_NAME="NEXUS Fraud Detection"
RUN npx prisma generate && npm run build

# ---- runner: standalone output + prisma CLI for migrate deploy ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl && \
    addgroup -S nodejs && adduser -S nextjs -G nodejs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3002

ENTRYPOINT ["./docker-entrypoint.sh"]
