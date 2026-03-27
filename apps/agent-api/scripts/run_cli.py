#!/usr/bin/env python3
"""Dev CLI for the research agent.

Usage:
    cd apps/agent-api
    poetry run python scripts/run_cli.py "What is useMemo in React?"
    poetry run python scripts/run_cli.py --thread my-session "What is useMemo in React?"
"""
import argparse
import logging
import os
import sys
import uuid
from pathlib import Path

# Put src/ on sys.path so `agent` and `tools` are importable
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)


def _check_env() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY is not set. Add it to your .env file or environment.", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Research agent — ask a question, get a cited answer.")
    parser.add_argument("question", help="The research question to answer")
    parser.add_argument(
        "--thread",
        default=None,
        help="Thread ID for session resumption. Auto-generated if omitted.",
    )
    args = parser.parse_args()

    _check_env()

    # Import after env is loaded so downstream modules pick up correct values
    from agent.graph import run_graph

    if args.thread:
        thread_id = args.thread
    else:
        thread_id = str(uuid.uuid4())
        print(f"Thread ID: {thread_id}  (pass --thread {thread_id} to resume)", file=sys.stderr)

    answer = run_graph(args.question, thread_id)
    print(answer)


if __name__ == "__main__":
    main()
