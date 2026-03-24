#!/usr/bin/env bash
# Run the research agent.
#
# Usage:
#   ./scripts/run_agent.sh "Your question here"
#   ./scripts/run_agent.sh --thread my-session "Your question here"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 [--thread <id>] <question>" >&2
  exit 1
fi

exec poetry run python main.py "$@"
