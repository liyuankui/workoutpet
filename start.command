#!/bin/bash
# 双击启动 micro-pet（自动清掉旧实例）
cd "$(dirname "$0")"
pkill -f "Electron.app/Contents/MacOS/Electron $PWD" 2>/dev/null
sleep 1
exec ./node_modules/.bin/electron .
