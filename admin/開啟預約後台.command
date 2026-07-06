#!/bin/bash
cd "$(dirname "$0")"
URL=""
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -n "$line" && "$line" == http* ]]; then
    URL="$line"
    break
  fi
done < "後台網址.txt"

if [[ -z "$URL" || "$URL" == *"請貼上"* ]]; then
  osascript -e 'display dialog "請先編輯 admin/後台網址.txt\n貼上你的後台網址（例：https://muwen-booking.vercel.app/admin）" buttons {"好"} default button 1'
  open -e "$(pwd)/後台網址.txt"
  exit 1
fi

open "$URL"
