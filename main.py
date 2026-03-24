import argparse
import os
import sys
import uuid
from pathlib import Path

# Ensure project root is on sys.path when script is run directly
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()


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
    from src.agent.graph import run_graph

    if args.thread:
        thread_id = args.thread
    else:
        thread_id = str(uuid.uuid4())
        print(f"Thread ID: {thread_id}  (pass --thread {thread_id} to resume)", file=sys.stderr)

    answer = run_graph(args.question, thread_id)
    print(answer)


if __name__ == "__main__":
    main()
