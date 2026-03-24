#!/usr/bin/env bash
# Start the MCP report server (HTTP/SSE on localhost:8000).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f .env ]; then
  set -a && source .env && set +a
fi

echo "Starting MCP server at ${MCP_SERVER_URL:-http://localhost:8000/sse} ..."
exec poetry run python -m src.mcp.server
