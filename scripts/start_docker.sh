#!/usr/bin/env bash
# Start Postgres and Qdrant via Docker Compose.
# Data: Postgres is ephemeral (lost on stop); Qdrant persists in qdrant_storage/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f .env ]; then
  set -a && source .env && set +a
fi

docker compose -f infra/docker-compose.yml up -d

echo "Services started:"
echo "  Postgres  → localhost:5432 (db: ${POSTGRES_DB}, user: ${POSTGRES_USER})"
echo "  Qdrant    → ${QDRANT_URL:-http://localhost:6333}"
echo ""
echo "Stop with: docker compose -f infra/docker-compose.yml down"
