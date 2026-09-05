# micro-pet · AI Install Assistant Prompt

> This document contains executable instructions for an AI assistant. The user hands you this URL — just follow it.

---

Install and verify the micro-pet desk pet on this Mac:

1. Run: `brew install --cask liyuankui/tap/micro-pet`
2. Unsigned first-launch workaround: `xattr -dr com.apple.quarantine /Applications/micro-pet.app`
3. Launch: `open /Applications/micro-pet.app`
4. After ~8s verify: `cat ~/.micro-pet/heartbeat.json` exists and shows `"visible": true`; an orange pixel cat should appear in the bottom-right corner of the screen
5. The cat icon in the menu bar offers: remind me now (demo) / switch language / copy weekly report / quit

Once installed, if the user wants a personalized schedule, continue with: https://raw.githubusercontent.com/liyuankui/workoutpet/master/docs/agent-setup-prompt.en.md
