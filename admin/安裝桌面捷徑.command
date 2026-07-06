#!/bin/bash
cd "$(dirname "$0")"
DESKTOP="$HOME/Desktop"
TARGET="$DESKTOP/沐紋預約後台.command"
cp "開啟預約後台.command" "$TARGET"
chmod +x "$TARGET"
osascript -e 'display notification "已放到桌面：沐紋預約後台.command" with title "沐紋映像"'
