#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  pnpm -r --filter "./examples/*" run type-check
else
  NUM=$(printf "%02d" "$1")
  pnpm --filter "${NUM}-*" run type-check
fi
