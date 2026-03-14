#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  pnpm -r --filter "./examples/*" format
else
  NUM=$(printf "%02d" "$1")
  pnpm --filter "${NUM}-*" format
fi
