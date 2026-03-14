#!/usr/bin/env bash
set -euo pipefail

NUM=$(printf "%02d" "${1:-0}")
pnpm --filter "${NUM}-*" start
