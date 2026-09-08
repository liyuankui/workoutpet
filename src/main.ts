import { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, screen, ipcMain } from "electron";
import { join, dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createMachine, dispatch, effectiveIntervalMs, DEFAULT_CONFIG, type MachineConfig, type MachineState } from "./core/stateMachine";
import { localizeExercise, resolveExercises, pickBalanced, type Exercise } from "./core/exercises";
import exercisesJson from "./core/exercises.json";
import { userPaths, readUserExercisesRaw } from "./core/userConfig";
import { appendCheckIn, currentStreak, readDB, localDateKey } from "./core/streak";
import { renderReport } from "./core/report";
import { FRAMES, frameToRGBA } from "./core/pixelcat";
import { isLocale, oppositeLocaleLabel, resolveLocale, strings, type Locale } from "./core/i18n";
import { intervalMinutes, validateSchedule, type Schedule } from "./core/schedule";
import { readOrCreateUid, sendTelemetry, telemetryEnabled } from "./core/telemetry";
import { computeDragPosition } from "./core/dragging";
import { appendPetLog } from "./core/petlog";

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
  /** 遥测开关：缺省开，false = 零网络请求 */
  telemetry?: boolean;
  /** 顺延重试间隔分钟（P1：超时未完成 → 顺延非跳过） */
  retryMin?: number;
  /** 连续跳过多少次猫赖着撒娇（0 = 永不） */
  clingAfterSkips?: number;
}

const HOME = process.env.MICROPET_HOME ?? join(app.getPath("home"), ".micro-pet");
const CONFIG_PATH = join(HOME, "config.json");
const DB_PATH = join(HOME, "streak.json");

/** 遥测（opt-out）：关 = 零网络请求；仅 app_open/remind_fired/check_in 三个匿名事件 */
const APP_VERSION = app.getVersion();
const telUid = readOrCreateUid(HOME);
// 提醒可观测性日志：状态转移 + 调度判定 + 遥测失败（远端不可查时本地可回溯）
const REMIND_LOG = join(HOME, "remind.log");
const rlog = (msg: string) => appendPetLog(REMIND_LOG, `[${new Date().toISOString()}] ${msg}\n`);
const tel = (event: string, props: Record<string, unknown> = {}) => {
  if (telemetryEnabled(readConfig()))
    sendTelemetry(event, props, telUid, APP_VERSION).catch((err) =>
      rlog(`遥测发送失败 ${event}: ${String(err)}`),
    );
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
  // dev 覆盖：MICROPET_RETRY_SEC（验证顺延链用；生产取 config retryMin，默认 8 分钟）
  const retryMs = Number(process.env.MICROPET_RETRY_SEC ?? 0) * 1000 || Math.max(1, Number(cfg.retryMin) || 8) * 60_000;
  const machineCfg: MachineConfig = {
    ...DEFAULT_CONFIG,
    intervalMs: envInterval > 0 ? envInterval : safeIntervalMin(cfg.intervalMin) * 60_000,
    remindTimeoutMs: Number(process.env.MICROPET_REMIND_TIMEOUT_SEC ?? 0) * 1000 || DEFAULT_CONFIG.remindTimeoutMs,
    retryOnTimeout: true, // F24 顺延哲学：运动没完成是顺延不是跳过
    // 缺省 3 次进入撒娇；显式 0 = 关闭（Math.max 钳负数）
    clingAfterSkips: cfg.clingAfterSkips === undefined ? 3 : Math.max(0, Number(cfg.clingAfterSkips) || 0),
  };

  // ---------- 窗口（：透明置顶、不抢焦点） ----------
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
  // 全屏也显示：v0.5.2 前 visibleOnFullScreen:false 让全屏工作中的提醒整段不可见（用户报「从没提醒」实为提醒了没看见）
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

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

  // ---------- 状态机循环 ----------
  let machine: MachineState = createMachine(exercises, Date.now());
  let clingLastResayAt: number | null = null; // 撒娇软话上次轮换时刻

  // 静默原因节流记录（10 分钟一条）：窗外/隐藏期间留「活着」的痕迹
  let lastQuietLogAt = 0;
  const quietLog = (now: number, why: string) => {
    if (now - lastQuietLogAt < 10 * 60_000) return;
    lastQuietLogAt = now;
    rlog(`静默 · ${why}（期间不提醒，恢复后重新计时）`);
  };

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
      rlog(`打卡 ✓ ${result.checkedIn.id}`);
      tel("check_in", { exercise: result.checkedIn.id });
    }

    if (machine.pet !== prevPet) {
      // 窗口先变尺寸，再通知渲染端出气泡
      if (machine.pet === "remind" || machine.pet === "happy" || machine.pet === "cling") setSizeAnchored(FULL_W, FULL_H);
      else setSizeAnchored(CAT_W, CAT_H);
      if (machine.pet === "remind" && machine.exercise) {
        rlog(`remind 开始 · ${machine.exercise.id} · 窗口 ${win.getPosition().join(",")}${machine.retryPending ? " · 顺延重试" : ""}`);
        tel("remind_fired", { exercise: machine.exercise.id });
      }
      if (prevPet === "remind" && machine.pet === "idle") {
        rlog(`remind 超时未理（第 ${machine.skipStreak} 次）→ ${machine.retryPending ? `顺延：${Math.round(retryMs / 60000)} 分钟后再来` : "安静回 idle（不催促），重新计时"}`);
      }
      if (machine.pet === "cling") {
        clingLastResayAt = Date.now();
        rlog(`进入撒娇赖留 · 连续跳过 ${machine.skipStreak} 次 · 点猫即打卡`);
        tel("cling_start", { skipStreak: machine.skipStreak }); // H3 验证信号
      }
      if (prevPet === "cling" && machine.pet === "happy") {
        rlog("撒娇和解：打卡 ✓ 猫满足了");
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
        quietLog(now, "schedule 窗外");
        return;
      }
      cfgNow = { ...machineCfg, intervalMs: iv * 60_000 };
    }
    // F24 顺延：retryPending 时下一次提醒改用 retryMs（8 分钟级），打卡后自动回常规轮转
    cfgNow = { ...cfgNow, intervalMs: effectiveIntervalMs(machine, cfgNow.intervalMs, retryMs) };
    // F23 撒娇赖留：cling 常驻，每 10 分钟换一句软话（broadcast 重发 → 渲染端随机选）
    if (machine.pet === "cling") {
      if (now - (clingLastResayAt ?? 0) >= 10 * 60_000) {
        clingLastResayAt = now;
        broadcast();
      }
      return;
    }
    // 猫被隐藏期间不打扰：顺延计时，重新显示后不补弹
    if (machine.pet === "idle" && !win.isVisible()) {
      machine = { ...machine, lastCycleAt: now };
      quietLog(now, "猫被托盘隐藏");
      return;
    }
    handle({ type: "TICK", now }, cfgNow);
  }, 1_000);

  // ---------- IPC ----------
  ipcMain.on("pet-click", () => handle({ type: "PET", now: Date.now() }));
  ipcMain.on("pet-ready", () => broadcast());
  // 手动拖动：渲染端只发开始/移动信号，坐标权威在 getCursorScreenPoint
  // （movementX 在窗口自身移动后语义被 macOS 补发的 mousemove 污染，弃用）
  // 钳制到猫当前所在屏的工作区，至少留 40px 防拖飞；moved 事件防抖存 brx/bry 复位用
  let dragAnchor: { cx: number; cy: number; wx: number; wy: number } | null = null;
  ipcMain.on("pet-drag-start", () => {
    const c = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    dragAnchor = { cx: c.x, cy: c.y, wx, wy };
  });
  ipcMain.on("pet-drag-move", () => {
    if (!dragAnchor) return;
    const c = screen.getCursorScreenPoint();
    const [w, h] = win.getSize();
    const wa = screen.getDisplayMatching({ x: dragAnchor.wx, y: dragAnchor.wy, width: w, height: h }).workArea;
    const p = computeDragPosition(dragAnchor, c, w, h, wa);
    win.setPosition(p.x, p.y, false);
  });

  // ---------- Tray（：隐藏/退出 + 演示 + 语言切换 ） ----------
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
          // 语言切换入口只显示目标语言自名（中文环境见 English / 英文环境见 简体中文）：
          // 当前语言的标题想切的人看不懂；默认仍跟随系统 locale
          label: oppositeLocaleLabel(currentLocale()),
          click: () => setLocale(currentLocale() === "zh-CN" ? "en" : "zh-CN"),
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
  rlog(
    `app 启动 · v${APP_VERSION} · schedule=${schedule ? schedule.windows.map((w) => `${w.from}-${w.to}@${w.intervalMin}min`).join(" ") : "off"} · interval=${Math.round(machineCfg.intervalMs / 60000)}min`,
  );
  tel("app_open", { exercises: exercises.length, scheduleWindows: schedule?.windows.length ?? 0 });
}
