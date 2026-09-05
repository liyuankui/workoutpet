# micro-pet · Micro-workout Desk Pet

> A pixel cat that demonstrates seated micro-exercises in the corner of your screen — pet it to check in, grow your streak locally. It accompanies you; it never interrupts you.

[简体中文](README.md)

| Idle | Reminder (let's go) | Checked in |
|:---:|:---:|:---:|
| ![idle](docs/screenshot-idle-en.png) | ![remind](docs/screenshot-remind-en.png) | ![happy](docs/screenshot-happy-en.png) |

## Install (macOS · Apple Silicon)

```bash
brew install --cask liyuankui/tap/micro-pet
```

The app is unsigned: on first launch right-click → Open (or run `xattr -dr com.apple.quarantine /Applications/micro-pet.app` in a terminal first). Alternatively grab the zip from [Releases](https://github.com/liyuankui/workoutpet/releases) and drop it into /Applications.

## 🤖 Paste to your agent

Paste this to your AI assistant and let it install and verify for you:

```text
Install and verify the micro-pet desk pet on this Mac:
1. Run: brew install --cask liyuankui/tap/micro-pet
2. Unsigned first-launch workaround: xattr -dr com.apple.quarantine /Applications/micro-pet.app
3. Launch: open /Applications/micro-pet.app
4. After ~8s verify: cat ~/.micro-pet/heartbeat.json exists and shows "visible": true;
   an orange pixel cat should appear in the bottom-right corner of the screen
5. The cat icon in the menu bar offers: remind me now (demo) / switch language /
   copy weekly report / quit
```

## How it works

- Every hour (configurable 30–120 min) the cat demonstrates a random micro-exercise with a speech bubble; if you ignore it for 2 minutes it quietly goes back (no nagging)
- **Click the cat during a reminder = check in** (happy + streak)
- **Click any other time = random reaction**: wiggle / jump / meow~ / roll (500ms throttle)
- Bilingual (zh-CN / en): follows your system language, switchable from the tray
- Weekly report: tray "Copy Weekly Report"; data lives in `~/.micro-pet/streak.json`

## Configuration (`~/.micro-pet/`)

| File | Field | Description |
|------|-------|-------------|
| `config.json` | `intervalMin` | Reminder interval in minutes, 30–120, default 60; restart to apply |
| | `locale` | `"zh-CN"` / `"en"`; defaults to system language (tray switch writes here) |
| | `brx` / `bry` | Cat's bottom-right corner; saved on drag, restored on restart |
| `exercises.json` | — | **Custom exercise library** (overrides the built-in when present), see below |
| `streak.json` | — | Check-in data, purely local; delete to reset |

### Custom exercises

```bash
micro-pet init-exercises   # writes a template to ~/.micro-pet/exercises.json (from source: bun run src/bin/micro-pet.ts init-exercises)
```

Edit the template, restart the app. Fields:

| Field | Required | Notes |
|-------|----------|-------|
| `id` | ✓ | kebab-case, unique |
| `name` / `cue` | ✓ | `{"zh-CN": "…", "en": "…"}` ("zh-CN" required, "en" optional with zh fallback) |
| `steps` | ✓ | ≥2 steps per language |
| `durationSec` | ✓ | 10–120 |
| `animation` | ✓ | `stretch/neck/wrists/legs/heels/shoulders/breath` (animation mapping) |
| `emoji` | ✓ | shown in the bubble |

If the JSON is invalid or fields are missing, the app **falls back to the built-in library** instead of crashing (see `~/.micro-pet/boot.log`).

## Development

```bash
bun install
cd node_modules/electron && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js && cd ../..  # bun blocks postinstall; install the binary manually
bun start                    # build & launch
bun test                     # 50 tests
```

Demo mode: `MICROPET_INTERVAL_SEC=5 bun start`.

## Decision log

- **Electron over Tauri** (2026-09-04): local Xcode CLT was broken (`cc` dlopen failure), Rust linking would fail; Electron ships prebuilt binaries with no local compilation, while main/renderer stay fully TS.
- **Dedicated bundle id** `com.liyuankui.micro-pet` (2026-09-05): the default id got its LaunchServices registration poisoned by a quarantined first launch, causing silent launch refusal.
