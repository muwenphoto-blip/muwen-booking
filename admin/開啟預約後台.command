#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_URL="https://muwen-booking.vercel.app/admin"
URL=""
CONFIG_FILE="$HOME/.muwen-booking/config.json"

read_url_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ -n "$line" && "$line" == http* ]]; then
      URL="$line"
      return 0
    fi
  done < "$file"
  return 1
}

read_url_file "$SCRIPT_DIR/後台網址.txt" || true

if [[ -z "$URL" && -f "$CONFIG_FILE" ]]; then
  URL="$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('admin_url','').strip())" 2>/dev/null || true)"
fi

if [[ -z "$URL" || "$URL" == *"請貼上"* ]]; then
  URL="$DEFAULT_URL"
fi

open "$URL"
