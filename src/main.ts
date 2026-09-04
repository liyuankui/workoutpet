import { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, screen } from "electron";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createMachine, dispatch, DEFAULT_CONFIG, type MachineConfig, type MachineState } from "./core/stateMachine";
import { loadExercises, type Exercise } from "./core/exercises";
import exercisesJson from "./core/exercises.json";
import { appendCheckIn, currentStreak, readDB, localDateKey } from "./core/streak";
import { renderReport } from "./core/report";
import { FRAMES, frameToRGBA } from "./core/pixelcat";

// ---------- 配置（~/.micro-pet/config.json） ----------
interface AppConfig {
  intervalMin: number; // 30-120
  x?: number;
  y?: number;
}

const HOME = process.env.MICROPET_HOME ?? join(app.getPath("home"), ".micro-pet");
const CONFIG_PATH = join(HOME, "config.json");
const DB_PATH = join(HOME, "streak.json");

function readConfig(): AppConfig {
  try {
    if (existsSync(CONFIG_PATH)) return { intervalMin: 60, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
  } catch { /* 损坏则用默认 */ }
  return { intervalMin: 60 };
}

function saveConfig(patch: Partial<AppConfig>) {
  const cfg = { ...readConfig(), ...patch };
  mkdirSync(HOME, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ---------- 启动 ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(main).catch((err) => {
    console.error("[micro-pet] fatal:", err);
    app.quit();
  });
}

function main() {
  app.dock?.hide(); // 桌宠不占 Dock

  const exercises: Exercise[] = loadExercises(exercisesJson);
  const cfg = readConfig();

  // dev 覆盖：MICROPET_INTERVAL_SEC / MICROPET_REMIND_TIMEOUT_SEC（测试/演示用）
  const envInterval = Number(process.env.MICROPET_INTERVAL_SEC ?? 0) * 1000;
  const machineCfg: MachineConfig = {
    ...DEFAULT_CONFIG,
    intervalMs: envInterval > 0 ? envInterval : Math.min(120, Math.max(30, cfg.intervalMin)) * 60_000,
    remindTimeoutMs: Number(process.env.MICROPET_REMIND_TIMEOUT_SEC ?? 0) * 1000 || DEFAULT_CONFIG.remindTimeoutMs,
  };

  // ---------- 窗口（F2：透明置顶、不抢焦点） ----------
  const win = new BrowserWindow({
    width: 360,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // non-activating：打字时点猫不丢焦点
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  const workArea = screen.getPrimaryDisplay().workArea;
  const defaultX = workArea.x + workArea.width - 360 - 8;
  const defaultY = workArea.y + workArea.height - 300 - 8;
  if (cfg.x !== undefined && cfg.y !== undefined) win.setPosition(cfg.x, cfg.y, false);
  else win.setPosition(defaultX, defaultY, false);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  win.on("moved", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const [x, y] = win.getPosition();
      saveConfig({ x, y }); // OPS：重启位置保持
    }, 500);
  });

  win.loadFile(join(__dirname, "..", "src", "renderer", "index.html"));
  if (process.env.MICROPET_DEV) win.webContents.openDevTools({ mode: "detach" });

  // ---------- 状态机循环（F3/F4） ----------
  let machine: MachineState = createMachine(exercises, Date.now());

  function broadcast(extra: Record<string, unknown> = {}) {
    win.webContents.send("pet-state", {
      pet: machine.pet,
      exercise: machine.exercise,
      streakDays: currentStreak(readDB(DB_PATH).records, localDateKey(Date.now())),
      ...extra,
    });
  }

  function handle(ev: Parameters<typeof dispatch>[1]) {
    const result = dispatch(machine, ev, machineCfg, exercises);
    machine = result.state;
    if (result.checkedIn) {
      appendCheckIn(DB_PATH, {
        date: localDateKey(Date.now()),
        exerciseId: result.checkedIn.id,
        ts: Date.now(),
      });
      broadcast(); // streakDays 已更新
    } else {
      broadcast({ wiggle: result.wiggle });
    }
  }

  setInterval(() => handle({ type: "TICK", now: Date.now() }), 1_000);

  // ---------- IPC ----------
  win.webContents.on("did-finish-load", () => broadcast());
  require("electron").ipcMain.on("pet-click", () => handle({ type: "PET", now: Date.now() }));
  require("electron").ipcMain.on("pet-ready", () => broadcast());

  // ---------- Tray（F2：一键隐藏/退出 + 演示入口） ----------
  const icon = nativeImage.createFromBuffer(Buffer.from(frameToRGBA(FRAMES.happy)), {
    width: 16,
    height: 16,
  });
  const tray = new Tray(icon);
  tray.setToolTip("Micro-pet 微运动桌宠");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示 / 隐藏猫", click: () => (win.isVisible() ? win.hide() : win.show()) },
      { label: "立刻提醒（演示）", click: () => handle({ type: "FORCE", now: Date.now() }) },
      {
        label: "复制周报到剪贴板",
        click: () => clipboard.writeText(renderReport(readDB(DB_PATH), exercises)),
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );

  console.log(
    `[micro-pet] alive · interval=${Math.round(machineCfg.intervalMs / 60000)}min · db=${DB_PATH}`,
  );
}
