#!/bin/sh
set -e

echo "[nexus] Applying database migrations..."
npx prisma migrate deploy

echo "[nexus] Starting NEXUS Fraud Detection on port ${PORT:-3002}..."
exec node server.js
