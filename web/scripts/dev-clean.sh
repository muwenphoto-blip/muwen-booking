#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PORTS="3000 3001"
if command -v lsof >/dev/null 2>&1; then
  for PORT in $PORTS; do
    PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
    if [ -n "${PIDS}" ]; then
      echo "停止佔用 port ${PORT} 的行程：${PIDS}"
      # shellcheck disable=SC2086
      kill -9 ${PIDS} 2>/dev/null || true
    fi
  done
  sleep 2
fi

echo "清除 .next 快取…"
rm -rf .next

echo "啟動 dev server（port 3000）…"
npm run dev
