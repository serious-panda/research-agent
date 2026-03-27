#!/usr/bin/env python3
"""Ingest documentation into the Qdrant vector store.

Usage:
    poetry run python scripts/ingest_docs.py --source react_docs --version 19 /path/to/react.dev
"""
import argparse
import sys
from pathlib import Path

from rag.ingest import ingest_react_docs


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest docs into Qdrant")
    parser.add_argument("repo_root", type=Path, help="Path to the docs repo root")
    parser.add_argument(
        "--source",
        default="react_docs",
        choices=["react_docs"],
        help="Doc set identifier (default: react_docs)",
    )
    parser.add_argument(
        "--version",
        default="19",
        help="Docs version string embedded in metadata (default: 19)",
    )
    args = parser.parse_args()

    if not args.repo_root.is_dir():
        print(f"Error: {args.repo_root} is not a directory", file=sys.stderr)
        sys.exit(1)

    if args.source == "react_docs":
        ingest_react_docs(args.repo_root, version=args.version)
    else:
        print(f"Unknown source: {args.source}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
