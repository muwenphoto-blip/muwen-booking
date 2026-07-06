#!/bin/bash
# 關閉本機開發伺服器（上線後通常不需要常駐）
for port in 3000 3001 3002 3003; do
  lsof -ti :"$port" 2>/dev/null | xargs kill -9 2>/dev/null
done
echo "已關閉本機 port 3000–3003 的開發伺服器（若有的話）。"
