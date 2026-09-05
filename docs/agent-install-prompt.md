# micro-pet · AI 安装助手 Prompt

> 本文档是给 AI 助手执行的操作指令。用户会把你的 URL 告诉你——按内容执行即可。

---

帮我在这台 Mac 上安装并验证微运动桌宠 micro-pet：

1. 执行 `brew install --cask liyuankui/tap/micro-pet`
2. 未签名首启处理：`xattr -dr com.apple.quarantine /Applications/micro-pet.app`
3. 启动：`open /Applications/micro-pet.app`
4. 等待 8 秒后验证：`cat ~/.micro-pet/heartbeat.json` 应存在且 `"visible": true`，屏幕右下角应出现一只橘色像素猫
5. 菜单栏小猫图标可：立刻提醒（演示）/ 切换语言 / 复制周报 / 退出

装好后如果用户想定制提醒计划，继续执行：https://raw.githubusercontent.com/liyuankui/workoutpet/master/docs/agent-setup-prompt.md
