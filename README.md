# micro-pet · 微运动桌宠

> 一只像素猫，定时在屏幕角落示范坐姿微运动——摸头打卡，本地养 streak。「陪着你」，而非「打断你」。

## 快速开始

```bash
bun install
cd node_modules/electron && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js && cd ../..  # bun 拦 postinstall，需手动装二进制
bun start              # 构建并启动（猫出现在屏幕右下角）
bun test               # 全部测试
bun run report         # 查看周报（markdown）
```

演示模式：`MICROPET_INTERVAL_SEC=180 bun start`（3 分钟一次提醒）。

**普通用户安装**（macOS Apple Silicon）：

```bash
brew install --cask liyuankui/tap/micro-pet
```

未签名应用，首次打开需右键 → 打开。

## 怎么用

- 猫每小时（可配 30-120 分钟）随机做一个微运动示范 + 气泡指引
- 提醒状态**点猫 = 打卡**（happy + 记 streak）；平时点 = 随机互动反应（蹭蹭 / 跳一下 / 喵～ / 打滚）
- 2 分钟不理它就安静回去（不催促）
- 中英双语：跟随系统语言，菜单栏小猫图标可切换
- 数据全本地：`~/.micro-pet/streak.json`，删除即重置

## 架构

```
src/core/      纯逻辑（无 Electron 依赖，全部可测）
  exercises/   动作库（双语）+ zod 校验
  stateMachine 状态机 idle→remind→happy→idle
  streak       本地打卡记录 + streak 计算
  reactions    点击互动反应池（随机 + 节流）
  pixelcat     16×16 像素猫帧（字符画即资产）
  locales/     zh-CN / en 语言文件
src/main.ts    Electron 主进程（窗口/托盘/状态机/打卡落盘）
src/renderer/  渲染端（canvas 动画 + 气泡 + 点击反应）
```

## 项目文档

产品方向与范围约束（VISION/SPEC/OPS）在本地知识库 `~/Notebooks/workspace/micro-pet/`。新功能先进 SPEC 再写代码。

## 决策记录

- **Electron 而非 Tauri**（2026-09-04）：本机 Xcode CLT 损坏（`cc` dlopen 失败），Rust 链接必挂；Electron 预编译二进制无本地编译依赖，主进程/渲染端仍全 TS。
- **专属 bundle id** `com.liyuankui.micro-pet`（2026-09-05）：默认 id 曾被 Gatekeeper 首启拦截污染 LaunchServices 注册，静默拒启。
