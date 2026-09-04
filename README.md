# micro-pet

> 微运动桌宠：像素猫示范坐姿微运动，摸头打卡，本地养 streak。「陪着你」而非「打断你」。

## 快速开始

```bash
bun install
cd node_modules/electron && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js && cd ../..  # bun 拦 postinstall，需手动装二进制
bun start              # 构建并启动（猫出现在屏幕右下角）
bun test               # 31 项测试
bun run report         # 查看周报（markdown）
```

演示模式：`MICROPET_INTERVAL_SEC=180 bun start`（3 分钟一次提醒）。
Tray 菜单（菜单栏小猫）：显示/隐藏 · 立刻提醒（演示）· 复制周报 · 退出。

## 怎么用

- 猫每小时（可配 30-120 分钟）随机做一个微运动示范 + 气泡指引
- 提醒状态**点猫头 = 打卡**（happy + 记 streak）；平时点 = 蹭蹭
- 2 分钟不理它就安静回去（不催促）
- 数据全本地：`~/.micro-pet/streak.json`，删除即重置

## 架构

```
src/core/    纯逻辑（无 Electron 依赖，全部可测）
  exercises.{ts,json}  动作库 + zod schema（F1）
  stateMachine.ts      idle→remind→happy→idle（F3）
  streak.ts            本地记录 + streak/周计算（F5）
  pixelcat.ts          16×16 像素猫帧（字符画即资产）
src/main.ts   Electron 主进程（窗口/Tray/状态机循环/打卡落盘）
src/preload.ts contextBridge（状态推送 + sprite 注入）
src/renderer/ 纯浏览器 JS（canvas 动画 + 气泡 + 点击）
```

## Harness

产品方向与范围约束（VISION/SPEC/OPS）见 `~/Notebooks/workspace/micro-pet/`。
新 feature 先进 SPEC 再写代码。

## 决策记录

- **Electron 而非 Tauri**（2026-09-04）：本机 Xcode CLT 损坏（`cc` dlopen 失败），Rust 链接必挂；Electron 预编译二进制无本地编译依赖，main/renderer 仍全 TS。
