import { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, screen, ipcMain } from "electron";
import { join, dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createMachine, dispatch, DEFAULT_CONFIG, type MachineConfig, type MachineState } from "./core/stateMachine";
import { localizeExercise, resolveExercises, pickBalanced, type Exercise } from "./core/exercises";
import exercisesJson from "./core/exercises.json";
import { userPaths, readUserExercisesRaw } from "./core/userConfig";
import { appendCheckIn, currentStreak, readDB, localDateKey } from "./core/streak";
import { renderReport } from "./core/report";
import { FRAMES, frameToRGBA } from "./core/pixelcat";
import { isLocale, resolveLocale, strings, type Locale } from "./core/i18n";
import { intervalMinutes, validateSchedule, type Schedule } from "./core/schedule";
import { readOrCreateUid, sendTelemetry, telemetryEnabled } from "./core/telemetry";

// ---------- boot 日志（最先执行：LS 启动无 stdout，靠它诊断"静默僵尸"） ----------
const BOOT_LOG = join(process.env.MICROPET_HOME ?? join(homedir(), ".micro-pet"), "boot.log");
function blog(msg: string) {
  try {
    mkdirSync(dirname(BOOT_LOG), { recursive: true });
    writeFileSync(BOOT_LOG, `[${new Date().toISOString()}] ${msg}\n`, { flag: "a" });
  } catch { /* 诊断日志自身不许抛 */ }
}
blog(`boot pid=${process.pid} argv=${JSON.stringify(process.argv)} defaultApp=${(globalThis as any).process?.type ?? "?"}`);
process.on("uncaughtException", (err) => blog(`uncaught: ${err.stack}`));
process.on("unhandledRejection", (r) => blog(`unhandled: ${String(r)}`));

// ---------- 配置（~/.micro-pet/config.json） ----------
interface AppConfig {
  intervalMin: number; // 30-120（无 schedule 时的回退间隔）
  /** 猫区右下角坐标（锚定右下存，杜绝 remind 扩窗后重启漂移） */
  brx?: number;
  bry?: number;
  /** 语言覆盖（缺省跟随系统） */
  locale?: string;
  /** 每日打卡目标（1-30；设置后 streak 按「达标日」计） */
  goalDaily?: number;
  /** 启用的动作 id 子集（缺省全部） */
  enabledExercises?: string[];
  /** 时段调度（不同时段不同密度，窗口外静默） */
  schedule?: unknown;
  /** F18 遥测开关：缺省开，false = 零网络请求 */
  telemetry?: boolean;
}

const HOME = process.env.MICROPET_HOME ?? join(app.getPath("home"), ".micro-pet");
const CONFIG_PATH = join(HOME, "config.json");
const DB_PATH = join(HOME, "streak.json");

/** F18 遥测（opt-out）：关 = 零网络请求；仅 app_open/remind_fired/check_in 三个匿名事件 */
const APP_VERSION = app.getVersion();
const telUid = readOrCreateUid(HOME);
const tel = (event: string, props: Record<string, unknown> = {}) => {
  if (telemetryEnabled(readConfig())) void sendTelemetry(event, props, telUid, APP_VERSION);
};

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
  blog("requesting lock");
  app.whenReady().then(() => { blog("whenReady"); main(); }).catch((err) => {
    blog(`fatal: ${err.stack}`);
    console.error("[micro-pet] fatal:", err);
    app.quit();
  });
}

// idle 只留猫（约 150×150），remind/happy 扩到 360×300 给气泡——透明区不挡底层点击
const CAT_W = 150, CAT_H = 150;
const FULL_W = 360, FULL_H = 300;

let tray: Tray | null = null;

function main() {
  app.dock?.hide(); // 桌宠不占 Dock

  // 动作库：用户覆盖（~/.micro-pet/exercises.json）优先，非法回退内置
  const paths = userPaths(HOME);
  const { exercises: allExercises, source: exSource, error: exError } = resolveExercises(
    readUserExercisesRaw(paths),
    exercisesJson,
  );
  blog(`exercises source=${exSource}${exError ? ` error=${exError}` : ""}`);
  const cfg = readConfig();

  // 动作子集（enabledExercises）
  let exercises: Exercise[] = allExercises;
  if (Array.isArray(cfg.enabledExercises) && cfg.enabledExercises.length > 0) {
    const filtered = allExercises.filter((e) => cfg.enabledExercises!.includes(e.id));
    if (filtered.length > 0) exercises = filtered;
    else blog("enabledExercises 全部未命中，回退全量动作库");
  }

  // 每日目标（goalDaily）
  const goalDaily =
    Number.isFinite(cfg.goalDaily) && Number(cfg.goalDaily) >= 1 && Number(cfg.goalDaily) <= 30
      ? Number(cfg.goalDaily)
      : undefined;

  // 时段调度（schedule）：非法回退 intervalMin
  const schedResult = cfg.schedule ? validateSchedule(cfg.schedule) : { ok: false };
  const schedule: Schedule | null = schedResult.ok ? schedResult.schedule! : null;
  blog(
    `schedule=${schedule ? `${schedule.windows.length} windows` : "none"} goalDaily=${goalDaily ?? "off"} enabled=${exercises.length}/${allExercises.length}`,
  );

  function currentLocale(): Locale {
    const saved = readConfig().locale;
    if (isLocale(saved)) return saved;
    // app.getLocale() 对无本地化的 app 会回退 en——用系统首选语言才准
    const sys = app.getPreferredSystemLanguages?.() ?? [];
    return resolveLocale(sys[0] ?? app.getLocale());
  }

  // dev 覆盖：MICROPET_INTERVAL_SEC / MICROPET_REMIND_TIMEOUT_SEC（测试/演示用）
  const envInterval = Number(process.env.MICROPET_INTERVAL_SEC ?? 0) * 1000;
  const machineCfg: MachineConfig = {
    ...DEFAULT_CONFIG,
    intervalMs: envInterval > 0 ? envInterval : safeIntervalMin(cfg.intervalMin) * 60_000,
    remindTimeoutMs: Number(process.env.MICROPET_REMIND_TIMEOUT_SEC ?? 0) * 1000 || DEFAULT_CONFIG.remindTimeoutMs,
  };

  // ---------- 窗口（F2：透明置顶、不抢焦点） ----------
  // ⚠️ 禁用 __dirname：bun build 会把它内联成源码目录（src/）而非产物目录（dist/）
  const APP_ROOT = app.getAppPath();
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
      preload: join(APP_ROOT, "dist", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  const wa = screen.getPrimaryDisplay().workArea;
  const defaultX = wa.x + wa.width - CAT_W - 8;
  const defaultY = wa.y + wa.height - CAT_H - 8;
  if (cfg.brx !== undefined && cfg.bry !== undefined) {
    // 边界钳制：外接屏拔掉后猫不能落到屏外"消失"
    const x = Math.min(Math.max(cfg.brx - CAT_W, wa.x + 40), wa.x + wa.width - 100);
    const y = Math.min(Math.max(cfg.bry - CAT_H, wa.y + 40), wa.y + wa.height - 100);
    win.setPosition(x, y, false);
  } else {
    win.setPosition(defaultX, defaultY, false);
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  win.on("moved", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const [x, y] = win.getPosition();
      const [w, h] = win.getSize();
      saveConfig({ brx: x + w, bry: y + h }); // 锚定右下角，重启按 CAT 尺寸恢复不漂移
    }, 500);
  });

  win.loadFile(join(APP_ROOT, "src", "renderer", "index.html")).catch((err) =>
    console.error("[micro-pet] renderer 加载失败:", err),
  );
  win.webContents.on("did-finish-load", () => { blog("renderer 加载成功"); broadcast(); });
  win.webContents.on("did-fail-load", (_e, code, desc) =>
    blog(`renderer 加载失败 code=${code} ${desc}`),
  );
  if (process.env.MICROPET_DEV) win.webContents.openDevTools({ mode: "detach" });

  // ---------- 状态机循环（F3/F4） ----------
  let machine: MachineState = createMachine(exercises, Date.now());

  // 心跳日志：窗口可见性/尺寸/位置落盘，供无 GUI 权限时端到端验证
  const heartbeat = () => {
    try {
      const b = win.getBounds();
      mkdirSync(HOME, { recursive: true });
      writeFileSync(
        join(HOME, "heartbeat.json"),
        JSON.stringify({ ts: Date.now(), visible: win.isVisible(), locale: currentLocale(), ...b, pet: machine.pet }, null, 2),
      );
    } catch { /* 心跳失败不影响运行 */ }
  };
  setInterval(heartbeat, 5_000);
  setTimeout(heartbeat, 2_000);

  // 窗口尺寸切换（锚定右下角，猫不动）
  function setSizeAnchored(w: number, h: number) {
    const [curW, curH] = win.getSize();
    if (curW === w && curH === h) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + curW - w, y + curH - h, false);
    win.setSize(w, h);
  }

  function broadcast() {
    const locale = currentLocale();
    win.webContents.send("pet-state", {
      pet: machine.pet,
      exercise: machine.exercise ? localizeExercise(machine.exercise, locale) : null,
      streakDays:
        machine.pet === "happy"
          ? currentStreak(readDB(DB_PATH).records, localDateKey(Date.now()), goalDaily)
          : 0, // streak 只在 happy 气泡需要，避免每秒读盘
      locale,
    });
  }

  // 均衡抽取（v0.4.0）：优先最久未练的类别
  let recentCategories: string[] = [];
  const balancedPick = (ex: readonly Exercise[]): Exercise => {
    const r = pickBalanced(ex, recentCategories);
    recentCategories = r.recent;
    return r.exercise;
  };

  function handle(ev: Parameters<typeof dispatch>[1], cfgOverride?: MachineConfig) {
    const prevPet = machine.pet;
    const result = dispatch(machine, ev, cfgOverride ?? machineCfg, exercises, Math.random, (ex) => balancedPick(ex));
    machine = result.state;

    if (result.checkedIn) {
      appendCheckIn(DB_PATH, {
        date: localDateKey(Date.now()),
        exerciseId: result.checkedIn.id,
        ts: Date.now(),
      });
      tel("check_in", { exercise: result.checkedIn.id });
    }

    if (machine.pet !== prevPet) {
      // 窗口先变尺寸，再通知渲染端出气泡
      if (machine.pet === "remind" || machine.pet === "happy") setSizeAnchored(FULL_W, FULL_H);
      else setSizeAnchored(CAT_W, CAT_H);
      if (machine.pet === "remind" && machine.exercise) {
        tel("remind_fired", { exercise: machine.exercise.id });
      }
      broadcast();
    }
  }

  setInterval(() => {
    const now = Date.now();
    // 时段调度：窗口外静默（下班/夜间不打扰），窗口内取该时段间隔
    let cfgNow = machineCfg;
    if (schedule) {
      const iv = intervalMinutes(schedule, new Date(now));
      if (iv === null) {
        if (machine.pet === "idle") machine = { ...machine, lastCycleAt: now }; // 静默期顺延，出窗即恢复
        return;
      }
      cfgNow = { ...machineCfg, intervalMs: iv * 60_000 };
    }
    // 猫被隐藏期间不打扰：顺延计时，重新显示后不补弹
    if (machine.pet === "idle" && !win.isVisible()) {
      machine = { ...machine, lastCycleAt: now };
      return;
    }
    handle({ type: "TICK", now }, cfgNow);
  }, 1_000);

  // ---------- IPC ----------
  ipcMain.on("pet-click", () => handle({ type: "PET", now: Date.now() }));
  ipcMain.on("pet-ready", () => broadcast());

  // ---------- Tray（F2：隐藏/退出 + 演示 + 语言切换 F8） ----------
  const icon = nativeImage.createFromBuffer(Buffer.from(frameToRGBA(FRAMES.happy)), {
    width: 16,
    height: 16,
  });
  tray = new Tray(icon);

  function buildTrayMenu() {
    const t = strings(currentLocale()).tray;
    tray!.setToolTip(t.tooltip);
    tray!.setContextMenu(
      Menu.buildFromTemplate([
        { label: t.showHide, click: () => (win.isVisible() ? win.hide() : win.show()) },
        {
          label: t.remindNow,
          click: () => {
            win.show();
            handle({ type: "FORCE", now: Date.now() });
          },
        },
        {
          label: t.copyReport,
          click: () =>
            clipboard.writeText(
              renderReport(readDB(DB_PATH), exercises, Date.now(), undefined, currentLocale(), goalDaily),
            ),
        },
        {
          label: t.agentSetup,
          click: () => {
            // 把官方「AI 配置助手」采访 prompt 复制给用户的 Agent
            const file =
              currentLocale() === "en" ? "docs/agent-setup-prompt.en.md" : "docs/agent-setup-prompt.md";
            try {
              clipboard.writeText(readFileSync(join(APP_ROOT, file), "utf8"));
            } catch {
              clipboard.writeText("See https://github.com/liyuankui/workoutpet — docs/agent-setup-prompt.md");
            }
            // 非模态反馈：猫举气泡告诉用户「粘到哪」
            win.show();
            const h = strings(currentLocale()).hints;
            if (machine.pet === "idle") setSizeAnchored(FULL_W, FULL_H); // idle 时扩窗容纳气泡
            win.webContents.send("pet-hint", { title: h.setupCopiedTitle, cue: h.setupCopiedCue });
            setTimeout(() => {
              if (machine.pet === "idle") setSizeAnchored(CAT_W, CAT_H); // 4.5s 后收回
            }, 4600);
          },
        },
        {
          label: t.language,
          submenu: [
            { label: "简体中文", type: "radio", checked: currentLocale() === "zh-CN", click: () => setLocale("zh-CN") },
            { label: "English", type: "radio", checked: currentLocale() === "en", click: () => setLocale("en") },
          ],
        },
        { type: "separator" },
        {
          label: t.telemetry,
          type: "checkbox",
          checked: telemetryEnabled(readConfig()),
          click: (item) => saveConfig({ telemetry: item.checked }),
        },
        { label: t.quit, click: () => app.quit() },
      ]),
    );
  }

  function setLocale(l: Locale) {
    saveConfig({ locale: l });
    buildTrayMenu(); // 菜单即时换语言
    broadcast();     // 气泡/渲染端跟随
  }
  buildTrayMenu();

  console.log(
    `[micro-pet] alive · interval=${Math.round(machineCfg.intervalMs / 60000)}min · locale=${currentLocale()} · db=${DB_PATH}`,
  );
  tel("app_open", { exercises: exercises.length, scheduleWindows: schedule?.windows.length ?? 0 });
}
