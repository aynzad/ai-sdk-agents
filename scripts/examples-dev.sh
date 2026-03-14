#!/usr/bin/env bash
set -euo pipefail

NUM=$(printf "%02d" "${1:-0}")

if [ -z "${1:-}" ]; then
  echo "Error: No example number provided"
  echo "Usage: pnpm examples:dev <example-number>"
  echo "Example: pnpm examples:dev 01"
  exit 1
else    
  pnpm --filter "${NUM}-*" dev
fi
