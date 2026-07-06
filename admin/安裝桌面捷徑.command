#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP="$HOME/Desktop"
APP_NAME="沐紋預約後台.app"
TARGET_APP="$DESKTOP/$APP_NAME"
DEFAULT_URL="https://muwen-booking.vercel.app/admin"
URL="$DEFAULT_URL"

if [[ -f "$SCRIPT_DIR/後台網址.txt" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ -n "$line" && "$line" == http* ]]; then
      URL="$line"
      break
    fi
  done < "$SCRIPT_DIR/後台網址.txt"
fi

rm -f "$DESKTOP/沐紋預約後台.command"
rm -rf "$TARGET_APP"

osacompile -o "$TARGET_APP" -e "do shell script \"open '$URL'\""

osascript -e 'display notification "已放到桌面：沐紋預約後台.app（不會開啟終端機）" with title "沐紋映像"'
