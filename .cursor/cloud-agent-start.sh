#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../Projects/ironcrew"

if [[ ! -d node_modules ]]; then
  echo "node_modules missing; run install first" >&2
  exit 1
fi

exec npm run dev -- --hostname 0.0.0.0 --port 3000
