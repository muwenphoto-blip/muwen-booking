#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP="$HOME/Desktop"
TARGET="$DESKTOP/沐紋預約後台.command"
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

cat > "$TARGET" <<SCRIPT
#!/bin/bash
open "$URL"
SCRIPT

chmod +x "$TARGET"
osascript -e 'display notification "已放到桌面：沐紋預約後台.command" with title "沐紋映像"'
