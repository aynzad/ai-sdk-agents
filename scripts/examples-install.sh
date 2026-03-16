#!/usr/bin/env bash
set -euo pipefail

pnpm build
pnpm i

if [ -z "${1:-}" ]; then
  pnpm -r --filter "./examples/*" install
else
  NUM=$(printf "%02d" "$1")
  pnpm --filter "${NUM}-*" install
fi