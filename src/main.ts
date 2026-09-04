import { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, screen, ipcMain } from "electron";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
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
  const tmp = join(HOME, `.tmp-config-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  renameSync(tmp, CONFIG_PATH); // 原子写，与 streak 一致
}

function safeIntervalMin(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(120, Math.max(30, n)) : 60; // NaN 兜底，防提醒静默失效
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

// idle 只留猫（约 150×150），remind/happy 扩到 360×300 给气泡——透明区不挡底层点击
const CAT_W = 150, CAT_H = 150;
const FULL_W = 360, FULL_H = 300;

function main() {
  app.dock?.hide(); // 桌宠不占 Dock

  const exercises: Exercise[] = loadExercises(exercisesJson);
  const cfg = readConfig();

  // dev 覆盖：MICROPET_INTERVAL_SEC / MICROPET_REMIND_TIMEOUT_SEC（测试/演示用）
  const envInterval = Number(process.env.MICROPET_INTERVAL_SEC ?? 0) * 1000;
  const machineCfg: MachineConfig = {
    ...DEFAULT_CONFIG,
    intervalMs: envInterval > 0 ? envInterval : safeIntervalMin(cfg.intervalMin) * 60_000,
    remindTimeoutMs: Number(process.env.MICROPET_REMIND_TIMEOUT_SEC ?? 0) * 1000 || DEFAULT_CONFIG.remindTimeoutMs,
  };

  // ---------- 窗口（F2：透明置顶、不抢焦点） ----------
  const win = new BrowserWindow({
    width: CAT_W,
    height: CAT_H,
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

  const wa = screen.getPrimaryDisplay().workArea;
  const defaultX = wa.x + wa.width - CAT_W - 8;
  const defaultY = wa.y + wa.height - CAT_H - 8;
  if (cfg.x !== undefined && cfg.y !== undefined) {
    // 边界钳制：外接屏拔掉后猫不能落到屏外"消失"
    const x = Math.min(Math.max(cfg.x, wa.x - CAT_W + 60), wa.x + wa.width - 60);
    const y = Math.min(Math.max(cfg.y, wa.y - CAT_H + 60), wa.y + wa.height - 60);
    win.setPosition(x, y, false);
  } else {
    win.setPosition(defaultX, defaultY, false);
  }

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

  // 窗口尺寸切换（锚定右下角，猫不动）
  function setSizeAnchored(w: number, h: number) {
    const [curW, curH] = win.getSize();
    if (curW === w && curH === h) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + curW - w, y + curH - h, false);
    win.setSize(w, h);
  }

  // ---------- 状态机循环（F3/F4） ----------
  let machine: MachineState = createMachine(exercises, Date.now());
  let lastPet = machine.pet;

  function broadcast(extra: Record<string, unknown> = {}) {
    win.webContents.send("pet-state", {
      pet: machine.pet,
      exercise: machine.exercise,
      streakDays:
        machine.pet === "happy"
          ? currentStreak(readDB(DB_PATH).records, localDateKey(Date.now()))
          : 0, // streak 只在 happy 气泡需要，避免每秒读盘
      ...extra,
    });
  }

  function handle(ev: Parameters<typeof dispatch>[1]) {
    const prevPet = machine.pet;
    const result = dispatch(machine, ev, machineCfg, exercises);
    machine = result.state;

    if (result.checkedIn) {
      appendCheckIn(DB_PATH, {
        date: localDateKey(Date.now()),
        exerciseId: result.checkedIn.id,
        ts: Date.now(),
      });
    }

    if (machine.pet !== prevPet) {
      // 窗口先变尺寸，再通知渲染端出气泡
      if (machine.pet === "remind" || machine.pet === "happy") setSizeAnchored(FULL_W, FULL_H);
      else setSizeAnchored(CAT_W, CAT_H);
      lastPet = machine.pet;
      broadcast();
    } else if (result.wiggle) {
      broadcast({ wiggle: true }); // 蹭蹭反馈
    }
  }

  setInterval(() => {
    // 猫被隐藏期间不打扰：顺延计时，重新显示后不补弹
    if (machine.pet === "idle" && !win.isVisible()) {
      machine = { ...machine, lastCycleAt: Date.now() };
      return;
    }
    handle({ type: "TICK", now: Date.now() });
  }, 1_000);

  // ---------- IPC ----------
  win.webContents.on("did-finish-load", () => broadcast());
  ipcMain.on("pet-click", () => handle({ type: "PET", now: Date.now() }));
  ipcMain.on("pet-ready", () => broadcast());

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
      {
        label: "立刻提醒（演示）",
        click: () => {
          win.show();
          handle({ type: "FORCE", now: Date.now() });
        },
      },
      {
        label: "复制周报到剪贴板",
        click: () => clipboard.writeText(renderReport(readDB(DB_PATH), exercises)),
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );

  void lastPet;
  console.log(
    `[micro-pet] alive · interval=${Math.round(machineCfg.intervalMs / 60000)}min · db=${DB_PATH}`,
  );
}
