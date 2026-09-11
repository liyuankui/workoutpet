import { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, screen, ipcMain, shell } from "electron";
import { join, dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createMachine, dispatch, effectiveIntervalMs, DEFAULT_CONFIG, type MachineConfig, type MachineState } from "./core/stateMachine";
import { localizeExercise, resolveExercises, pickBalanced, type Exercise } from "./core/exercises";
import exercisesJson from "./core/exercises.json";
import { userPaths, readUserExercisesRaw } from "./core/userConfig";
import { appendCheckIn, countToday, readDB, localDateKey, workdayStreak } from "./core/streak";
import { renderReport } from "./core/report";
import { getPet, frameToRGBA } from "./core/pets";
import { getCoat } from "./core/coats";
import { CAT_PERSONAS, CAT_PRICE, getPersona, starterCats } from "./core/cats";
import { getPersonality } from "./core/personalities";
import { fmt, isLocale, oppositeLocaleLabel, resolveLocale, strings, type Locale } from "./core/i18n";
import { intervalMinutes, validateSchedule, type Schedule } from "./core/schedule";
import { readOrCreateUid, sendTelemetry, telemetryEnabled } from "./core/telemetry";
import { computeDragPosition } from "./core/dragging";
import { appendPetLog } from "./core/petlog";
import { readStore, writeStore } from "./core/store";
import { BENTO_PRICE, canAffordTravel, pickSpot, SPOTS, type TravelState } from "./core/travel";
import { applySkitPersonality, applySkitUniform, createSkit, pickSkit, wantsSkit, type SkitState } from "./core/skit";
import { parseClingAfterSkips, parseRetryMs } from "./core/behaviorConfig";
import { currentStepIndex } from "./core/session";
import { auditConfig } from "./core/configAudit";
import { buyCat, buyItem, claimMilestone, earnBonus, earnOnCheckIn, emptyInventory, ensureCats, SHOP, toggleOutfit, type Inventory } from "./core/inventory";
import { applyRoamPersonality, applyRoamUniform, createRoam, nextHomeStay, nextOutDuration, shouldRecall, tooCloseToRemind, wantsRoam, type RoamState } from "./core/roam";

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
  /** 宠物（cat/bunny…，缺省 cat） */
  pet?: string;
  /** 顺延重试间隔分钟（P1：超时未完成 → 顺延非跳过） */
  retryMin?: number;
  /** 连续跳过多少次猫赖着撒娇（0 = 永不） */
  clingAfterSkips?: number;
}

const HOME = process.env.MICROPET_HOME ?? join(app.getPath("home"), ".micro-pet");
const CONFIG_PATH = join(HOME, "config.json");
const DB_PATH = join(HOME, "streak.json");
const INVENTORY_PATH = join(HOME, "inventory.json");
function readInventory(): Inventory {
  return readStore<Inventory>(INVENTORY_PATH, {
    validate: (r) => {
      const x = r as Partial<Inventory>;
      if (Array.isArray(x.owned) && Number.isFinite(x.fish)) return { version: 1, ...x } as Inventory;
      return null; // 触发 .corrupt 备份（用户资产不静默清空）
    },
    fallback: emptyInventory(),
  });
}
function writeInventory(inv: Inventory): void {
  writeStore(INVENTORY_PATH, { version: 1, ...inv });
}

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
  const raw = readStore<Record<string, unknown>>(CONFIG_PATH, {
    validate: (r) => (typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Record<string, unknown>) : null),
    fallback: {},
  });
  return { intervalMin: 60, ...raw };
}

function saveConfig(patch: Partial<AppConfig>) {
  writeStore(CONFIG_PATH, { ...readConfig(), ...patch });
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

// 窗口紧贴猫（遮盖最小化，F34）：idle 134×164（猫 128×154+边）；气泡靠动态扩窗
// remind/满态 368×232（气泡 max-width 240 + 猫 128；高=气泡 64+猫 154+边）
const CAT_W = 134, CAT_H = 164;
const FULL_W = 368, FULL_H = 232;

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

  // 每日目标（goalDaily()）——热读取（审计 L2：当日中途修改即生效，不必重启）
  const goalDaily = () => {
    const v = Number(readConfig().goalDaily);
    return Number.isFinite(v) && v >= 1 && v <= 30 ? v : undefined;
  };

  // 时段调度（schedule）：非法回退 intervalMin
  const schedResult = cfg.schedule ? validateSchedule(cfg.schedule) : { ok: false };
  const schedule: Schedule | null = schedResult.ok ? schedResult.schedule! : null;
  blog(
    `schedule=${schedule ? `${schedule.windows.length} windows` : "none"} goalDaily()=${goalDaily() ?? "off"} enabled=${exercises.length}/${allExercises.length}`,
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
  const retryMs = Number(process.env.MICROPET_RETRY_SEC ?? 0) * 1000 || parseRetryMs(cfg);
  let machineCfg: MachineConfig = { // let：性情注入会覆写 clingAfterSkips
    ...DEFAULT_CONFIG,
    intervalMs: envInterval > 0 ? envInterval : safeIntervalMin(cfg.intervalMin) * 60_000,
    remindTimeoutMs: Number(process.env.MICROPET_REMIND_TIMEOUT_SEC ?? 0) * 1000 || DEFAULT_CONFIG.remindTimeoutMs,
    retryOnTimeout: true, // F24 顺延哲学：运动没完成是顺延不是跳过
    clingAfterSkips: parseClingAfterSkips(cfg),
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
      const [w] = win.getSize();
      // 扩窗期（气泡占位 +64）保存按 CAT 基准高换算，否则重启位置漂 64px
      const h = bubbleExpanded ? CAT_H : win.getSize()[1];
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

  // 静默原因节流记录（10 分钟一条，按原因独立节流——审计 L4：互不吞并）
  const lastQuietLogAt: Record<string, number> = {};
  const quietLog = (now: number, why: string) => {
    if (now - (lastQuietLogAt[why] ?? 0) < 10 * 60_000) return;
    lastQuietLogAt[why] = now;
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

  // ---------- F22 窗口走位（缓动位移，≤20fps；走位期间广播 walking 让渲染端播跑动帧） ----------
  let walking = false;
  let walkTimer: ReturnType<typeof setTimeout> | undefined;
  function walkTo(targetX: number, targetY: number, ms: number, onDone?: () => void): void {
    clearTimeout(walkTimer);
    const [sx, sy] = win.getPosition();
    const t0 = Date.now();
    if (!walking) { walking = true; broadcast(); }
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - p) * (1 - p); // easeOut：起步快、到家缓
      win.setPosition(Math.round(sx + (targetX - sx) * e), Math.round(sy + (targetY - sy) * e), false);
      if (p < 1) walkTimer = setTimeout(step, 50);
      else { walking = false; broadcast(); onDone?.(); }
    };
    step();
  }

  // ---------- F21 自主漫游 ----------
  // 猫在外面也知道时间：漫游不进出提醒计时的顺延（顺延只属于「托盘手动隐藏」）
  if (process.env.MICROPET_ROAM_UNIFORM_MS) applyRoamUniform(Number(process.env.MICROPET_ROAM_UNIFORM_MS));
  let roam: RoamState = createRoam(Date.now());
  if (process.env.MICROPET_SKIT_UNIFORM_MS) applySkitUniform(Number(process.env.MICROPET_SKIT_UNIFORM_MS));
  let skit: SkitState = createSkit(Date.now());

  // F33 旅行：静默期出远门（带便当）；归来举明信片；落盘可恢复（重启不丢、便当不白扣）
  const TRAVEL_PATH = join(HOME, "travel.json");
  const readTravel = (): TravelState =>
    readStore<TravelState>(TRAVEL_PATH, {
      validate: (r) => (typeof (r as TravelState)?.spotId === "string" || (r as TravelState)?.spotId === null ? (r as TravelState) : null),
      fallback: { spotId: null },
    });
  const writeTravel = (t: TravelState) => writeStore(TRAVEL_PATH, t);
  let travel: TravelState = readTravel();
  // 托盘隐藏（用户意图）与漫游自藏（猫自己的 hide）语义分离——审计 H2 曾混用 isVisible 误伤漫游召回
  let trayHidden = false;
  const POSTCARDS_DIR = join(HOME, "postcards");

  function roamOut(why: string, spotId: string | null = null): void {
    if (roam.roaming || walking || machine.pet !== "idle") return;
    travel = { spotId };
    writeTravel(travel);
    const [x, y] = win.getPosition();
    roam = { ...roam, roaming: true, homeX: x, homeY: y, backAt: Date.now() + nextOutDuration() };
    const wa2 = screen.getPrimaryDisplay().workArea;
    const offX = Math.random() < 0.5 ? wa2.x - CAT_W - 12 : wa2.x + wa2.width + 12;
    const spot = spotId ? SPOTS.find((v) => v.id === spotId) : null;
    rlog(`出去玩（${spot ? `带便当去${spot.name["zh-CN"]}旅行` : why}，${Math.round((roam.backAt - Date.now()) / 60000)} 分钟内回）`);
    walkTo(offX, y, 1200, () => win.hide());
  }

/** F33 旅行归来：请 renderer 作明信片落盘 + 举气泡（漫游召回与启动恢复两路共用） */
  function arriveFromTravel(): void {
    if (!travel.spotId) return;
    const spot = SPOTS.find((v) => v.id === travel.spotId);
    travel = { spotId: null };
    writeTravel(travel);
    if (!spot) return;
    win.webContents.send("pet-postcard-render", { spot, spriteId: getPet(inv.activeCat).id });
    const loc = currentLocale();
    const b = strings(loc).bubble;
    const cue = `${spot.souvenir[loc]} · ${spot.rare ? "✨" : ""}`;
    setTimeout(() => {
      if (machine.pet === "idle" && win.isVisible()) {
        setSizeAnchored(FULL_W, FULL_H);
        win.webContents.send("pet-hint", { title: fmt(b.backFromTrip, { spot: spot.name[loc] }), cue });
        setTimeout(() => { if (machine.pet === "idle") setSizeAnchored(CAT_W, CAT_H); }, 4600);
      }
    }, 1400); // 走回原位后再举牌
    rlog(`旅行归来 · ${spot.name["zh-CN"]}（带回${spot.souvenir["zh-CN"]}）`);
  }

  function roamRecall(why: string): void {
    if (!roam.roaming) return;
    const hidden = trayHidden;
    if (!hidden) win.showInactive(); // 用户托盘隐藏时不现身（审计 H2）：静默回位；漫游召回正常现身
    roam = { ...roam, roaming: false, nextRoamAt: Date.now() + nextHomeStay() };
    rlog(`回家（${why}）${hidden ? " · 保持隐藏" : ""}`);
    if (!hidden) walkTo(roam.homeX, roam.homeY, 1200);
    else win.setPosition(roam.homeX, roam.homeY, false);
    arriveFromTravel();
  }

  function broadcast() {
    const locale = currentLocale();
    const view = machine.exercise ? localizeExercise(machine.exercise, locale) : null;
    // 会话陪练（F25）：倒数秒 + 当前步骤（按 durationSec 均分轮播）
    let sessionRemainSec: number | undefined;
    let sessionStep: string | undefined;
    if (machine.pet === "session" && machine.exercise && view) {
      const dur = machine.exercise.durationSec;
      const elapsed = (Date.now() - machine.sessionStartedAt) / 1000;
      sessionRemainSec = Math.max(0, Math.ceil(dur - elapsed));
      sessionStep = view.steps[currentStepIndex(view.steps.length, dur, elapsed)] ?? "";
    }
    // 举牌（F28）：happy（刚打卡）与 cling（撒娇时亮进度）需要今日计数
    let todayCount: number | undefined;
    if (machine.pet === "happy" || machine.pet === "cling") {
      todayCount = countToday(readDB(DB_PATH).records, localDateKey(Date.now()));
    }
    win.webContents.send("pet-state", {
      pet: machine.pet,
      walking,
      spriteId: getPet(inv.activeCat).id,
      pool: getPersonality(activeCat().personalityId).pool,
      exercise: view,
      streakDays:
        machine.pet === "happy"
          ? workdayStreak(readDB(DB_PATH).records, localDateKey(Date.now()), goalDaily()).streak
          : 0, // streak 只在 happy 气泡需要，避免每秒读盘
      locale,
      sessionRemainSec,
      sessionStep,
      todayCount,
      todayGoal: goalDaily(),
      outfit: readInventory().outfit,
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
        durationSec: result.checkedInSec ?? undefined, // F25 实际跟做秒数（完整率度量）
      });
      const full = machine.exercise ? (result.checkedInSec ?? 0) >= machine.exercise.durationSec : false; // 审计 M4：>= 防随机 off-by-one
      rlog(`打卡 ✓ ${result.checkedIn.id} · 跟做 ${result.checkedInSec}s${full ? "（完整）" : ""}`);
      // F26/F32 小鱼干：打卡 +1，达标日 +2（每日一次）；完整跟做再 +1；日上限 8
      const todayKey = localDateKey(Date.now());
      const gd = goalDaily();
      const goalMet = !!gd && countToday(readDB(DB_PATH).records, todayKey) >= gd;
      let invEarn = earnOnCheckIn(readInventory(), todayKey, goalMet).inv;
      if (full) invEarn = earnBonus(invEarn, todayKey).inv; // 完整跟做奖励（H2 胡萝卜）
      // 工作日 streak 里程碑（3/7/14/30 → 3/5/10/20，一次性，独立于日上限）
      const ws = workdayStreak(readDB(DB_PATH).records, todayKey, goalDaily());
      const ms = claimMilestone(invEarn, ws.streak);
      invEarn = ms.inv;
      writeInventory(invEarn);
      const gainedBits = [goalMet && "达标奖励", full && "完整跟做 +1", ms.reward > 0 && `里程碑 ${ws.streak} 工作日 +${ms.reward}`].filter(Boolean);
      rlog(`得小鱼干（余额 ${invEarn.fish}）${gainedBits.length ? " · " + gainedBits.join(" · ") : ""}${ws.guarded > 0 ? ` · 猫咪代守 ${ws.guarded} 天` : ""}`);
      inv = invEarn; // 同步本地账本缓存
      tel("check_in", { exercise: result.checkedIn.id, durationSec: result.checkedInSec ?? undefined });
    }

    if (machine.pet !== prevPet) {
      // 窗口先变尺寸，再通知渲染端出气泡
      if (machine.pet === "remind" || machine.pet === "happy" || machine.pet === "cling" || machine.pet === "session")
        setSizeAnchored(FULL_W, FULL_H);
      else setSizeAnchored(CAT_W, CAT_H);
      if (machine.pet === "session") rlog(`会话陪练开始 · ${machine.exercise?.id ?? "?"} · 再点猫可提前结束（也算完成）`);
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
        // 静默期「先收敛再冻结」（审计 H1/M2/M3）：正事走完，不僵屏过夜
        if (machine.pet !== "idle") {
          const prev = machine.pet;
          handle({ type: "SLEEP", now }); // remind 超时语义收编：和解下班，skip/retry 全清（H4：次日不补账）
          rlog(`静默期收敛 · ${prev} → idle（下班了，不催了）`);
        }
        machine = { ...machine, lastCycleAt: now, retryPending: false }; // 跨夜清顺延（H4：次日重开新轮）
        if (!roam.roaming && !walking) {
          // F33：出得起远门（便当 2 鱼）且性情愿意 → 旅行；否则普通漫游
          const spot = canAffordTravel(inv.fish) ? pickSpot(getPersonality(activeCat().personalityId).id) : null;
          if (spot) {
            inv = { ...inv, fish: inv.fish - BENTO_PRICE };
            writeInventory(inv);
            roamOut("下班了", spot.id);
          } else {
            roamOut("下班了，在外面过自己的日子");
          }
        }
        quietLog(now, "schedule 窗外");
        return;
      }
      if (roam.roaming && machine.pet === "idle" && !walking && !trayHidden) roamRecall("开工了，回岗位");
      cfgNow = { ...machineCfg, intervalMs: iv * 60_000 };
    }

    // 托盘隐藏优先（审计 H2/M1）：用户藏起 = 全态冻结（remind 不超时不记跳过、会话倒数暂停、cling 不轮换）
    // （漫游在外的 hide 不算——猫在外面也惦记着时间，F21 语义）
    if (trayHidden && !roam.roaming) {
      if (machine.pet === "idle") machine = { ...machine, lastCycleAt: now };
      quietLog(now, "猫被托盘隐藏（全态冻结）");
      return;
    }
    // F24 顺延：retryPending 时下一次提醒改用 retryMs（8 分钟级），打卡后自动回常规轮转
    cfgNow = { ...cfgNow, intervalMs: effectiveIntervalMs(machine, cfgNow.intervalMs, retryMs) };

    // F21 漫游驱动：仅 idle 在家时；提醒临近不出门；到期前 30s 或归期召回
    const remindDueAt = machine.pet === "idle" ? machine.lastCycleAt + cfgNow.intervalMs : null;
    if (machine.pet === "idle" && !walking && !trayHidden) {
      if (roam.roaming && shouldRecall(roam, now, remindDueAt)) {
        roamRecall(remindDueAt !== null && remindDueAt - now <= 60_000 ? "提醒要来了，跑回去找你" : "玩够了");
      } else if (!roam.roaming && wantsRoam(roam, now)) {
        if (tooCloseToRemind(roam, now, remindDueAt)) roam = { ...roam, nextRoamAt: (remindDueAt ?? now) + 60_000 };
        else roamOut("在家待不住了");
      }
      // F27 小剧场：在家静坐且离提醒够远时随机开演（每小时 2-3 场，正戏优先）
      if (wantsSkit(skit, now, { petIdle: true, visible: win.isVisible(), walking, roaming: roam.roaming, remindDueAt })) {
        const type = pickSkit(Math.random, getPersonality(activeCat().personalityId).mouseBias);
        skit = createSkit(now); // 下一场重新计时
        // 抓到老鼠 10%（变奖赏彩蛋）：真抓到叼来一条鱼干
        const caught = type === "mouse" && Math.random() < 0.1;
        if (caught) {
          const tk = localDateKey(Date.now());
          const got = earnBonus(readInventory(), tk);
          writeInventory(got.inv);
          inv = got.inv;
          if (got.gained > 0) rlog("叼来一条鱼干 🐟（真抓到了！）");
        }
        rlog(`小剧场开演 · ${type === "mouse" ? "抓老鼠" : "蹦跳"}${caught ? "（会抓到）" : ""}`);
        win.webContents.send("pet-skit", { type, caught });
      }
    }
    // F23 撒娇赖留：cling 常驻，每 10 分钟换一句软话（broadcast 重发 → 渲染端随机选）
    if (machine.pet === "cling") {
      if (now - (clingLastResayAt ?? 0) >= 10 * 60_000) {
        clingLastResayAt = now;
        broadcast();
      }
      return; // cling 无 TICK 转移（SLEEP/FORCE/点猫为出口）
    }
    handle({ type: "TICK", now }, cfgNow);
    if (machine.pet === "session") broadcast(); // 会话陪练：每秒刷新倒数/步骤气泡
  }, 1_000);

  // ---------- IPC ----------
  ipcMain.on("pet-click", () => handle({ type: "PET", now: Date.now() }));
  ipcMain.on("pet-postcard-data", (_e, dataUrl: string) => {
    try {
      mkdirSync(POSTCARDS_DIR, { recursive: true });
      writeFileSync(join(POSTCARDS_DIR, `postcard-${Date.now()}.png`), Buffer.from(dataUrl.split(",")[1]!, "base64"));
    } catch { /* 明信片落盘失败不影响产品 */ }
  });
  // F34 气泡占位：idle 小窗扩高容纳气泡（锚右下，向上扩）；FULL 态足够高不扩
  let bubbleExpanded = false;
  let bubbleCollapseTimer: ReturnType<typeof setTimeout> | undefined;
  ipcMain.on("pet-bubble", (_e, on: boolean) => {
    const h = win.getSize()[1];
    if (on) {
      clearTimeout(bubbleCollapseTimer); // 快闪气泡（喵～0.9s）防抖：收窗前 300ms 内又亮则不收
      if (!bubbleExpanded && h === CAT_H) {
        setSizeAnchored(CAT_W, CAT_H + 64);
        bubbleExpanded = true;
      }
    } else if (bubbleExpanded) {
      clearTimeout(bubbleCollapseTimer);
      bubbleCollapseTimer = setTimeout(() => {
        if (!bubbleExpanded) return;
        bubbleExpanded = false;
        // 气泡若仍亮（cling 轮换竞态）不收
        setSizeAnchored(CAT_W, CAT_H);
      }, 300);
    }
  });
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
  // F32 猫宇宙：当前猫 = 账本 activeCat（首次迁移赠 starter）；性情注入行为参数
  let inv = ensureCats(readInventory(), starterCats());
  writeInventory(inv);
  const activeCat = () => getPersona(inv.activeCat);
  const applyCat = () => {
    const persona = activeCat();
    const per = getPersonality(persona.personalityId);
    applyRoamPersonality(per.roam);
    applySkitPersonality(per.skitGapMinMs, per.skitGapMaxMs);
    // 审计 M5：config 显式设置 clingAfterSkips（含 0=关闭）优先于性情缺省
    machineCfg = {
      ...machineCfg,
      clingAfterSkips: readConfig().clingAfterSkips !== undefined ? parseClingAfterSkips(readConfig()) : per.clingAfterSkips,
    };
    // 换猫和解：正处 cling 的旧猫随交接下班（skipStreak 清零）
    if (machine.pet === "cling") handle({ type: "SLEEP", now: Date.now() });
    rlog(`当前猫 · ${persona.name["zh-CN"]}（${per.name["zh-CN"]}）`);
  };
  applyCat();
  const trayIcon = () => {
    const pet = getPet(inv.activeCat);
    return nativeImage.createFromBuffer(Buffer.from(frameToRGBA(pet, pet.frames.happy)), {
      width: pet.grid,
      height: pet.grid,
    }).resize({ width: 16, height: 16 });
  };
  tray = new Tray(trayIcon());

  /** 逐段语义化版本比较（审计修复：字符串比较 0.10.x vs 0.9.x 会误判） */
  function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d) return d;
    }
    return 0;
  }

  async function fetchTimeout(url: string, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "micro-pet" } });
  }

  /** 最新版本三源回退（UPDATE-RESEARCH.md）：GitHub 直连 → gh-proxy 透传 → jsdelivr 读 tap cask */
  async function fetchLatestVersion(): Promise<string | null> {
    const sources: Array<() => Promise<string | null>> = [
      async () => {
        const r = await fetchTimeout("https://api.github.com/repos/liyuankui/workoutpet/releases/latest", 4000);
        return String(((await r.json()) as { tag_name?: string }).tag_name ?? "").replace(/^v/, "") || null;
      },
      async () => {
        const r = await fetchTimeout("https://gh-proxy.com/https://api.github.com/repos/liyuankui/workoutpet/releases/latest", 5000);
        return String(((await r.json()) as { tag_name?: string }).tag_name ?? "").replace(/^v/, "") || null;
      },
      async () => {
        const r = await fetchTimeout("https://cdn.jsdelivr.net/gh/liyuankui/homebrew-tap@main/Casks/micro-pet.rb", 5000);
        const m = (await r.text()).match(/version "([\d.]+)"/);
        return m?.[1] ?? null;
      },
    ];
    for (const src of sources) {
      try {
        const v = await src();
        if (v) return v;
      } catch { /* 换下一源 */ }
    }
    return null;
  }

  /** F34e 检查更新：三源回退比对（不自动升级——保持 brew/手动节奏） */
  async function checkUpdate(): Promise<void> {
    const t = strings(currentLocale()).tray;
    const show = (title: string, cue: string) => {
      win.showInactive();
      if (machine.pet === "idle") setSizeAnchored(FULL_W, FULL_H);
      win.webContents.send("pet-hint", { title, cue });
      setTimeout(() => { if (machine.pet === "idle") setSizeAnchored(CAT_W, CAT_H); }, 4600);
    };
    const latest = await fetchLatestVersion();
    const cur = APP_VERSION;
    if (!latest) {
      show(t.updateCheckFailed, "brew info --cask micro-pet");
      rlog("检查更新失败：三源（GitHub/gh-proxy/jsdelivr）均不可达");
      return;
    }
    const newer = compareVersions(latest, cur) > 0;
    show(newer ? fmt(t.updateAvailable, { v: latest }) : t.upToDate, newer ? "brew upgrade --cask micro-pet" : `v${cur}`);
    rlog(`检查更新：本地 v${cur} / 最新 v${latest}${newer ? " → 有新版" : "，已最新"}`);
  }

  function buildTrayMenu() {
    const t = strings(currentLocale()).tray;
    tray!.setToolTip(t.tooltip);
    tray!.setContextMenu(
      Menu.buildFromTemplate([
        { label: `v${APP_VERSION}`, enabled: false },
        { label: t.checkUpdate, click: () => void checkUpdate() },
        { type: "separator" },
        { label: t.showHide, click: () => { if (win.isVisible()) { win.hide(); trayHidden = true; } else { trayHidden = false; if (roam.roaming) roamRecall("你叫它回来"); else win.showInactive(); } } },
        {
          label: t.remindNow,
          click: () => {
            if (roam.roaming) roamRecall("你叫它提醒你"); // 审计 H3：漫游中先召回，否则弹在屏外
            win.showInactive();
            handle({ type: "FORCE", now: Date.now() });
          },
        },
        {
          label: t.demo,
          submenu: [
            {
              label: t.demoSession,
              click: () => {
                win.showInactive();
                handle({ type: "FORCE", now: Date.now() });
                handle({ type: "PET", now: Date.now() }); // 直接进会话陪练
              },
            },
            {
              label: t.demoCling,
              click: () => {
                win.showInactive();
                // 演示直入 cling（正常须经连续跳过积累；不写打卡数据）
                machine = { ...machine, exercise: machine.exercise ?? balancedPick(exercises), pet: "cling", retryPending: false };
                setSizeAnchored(FULL_W, FULL_H);
                rlog("演示：撒娇赖留");
                broadcast();
              },
            },
            { label: t.demoSkitMouse, click: () => { win.showInactive(); win.webContents.send("pet-skit", { type: "mouse" }); } },
            { label: t.demoSkitHop, click: () => { win.showInactive(); win.webContents.send("pet-skit", { type: "hop" }); } },
            { label: t.demoJump, click: () => { win.showInactive(); win.webContents.send("pet-reaction", "jump"); } },
            { label: t.demoWiggle, click: () => { win.showInactive(); win.webContents.send("pet-reaction", "wiggle"); } },
            { label: t.demoMeow, click: () => { win.showInactive(); win.webContents.send("pet-reaction", "meow"); } },
            { label: t.demoRoll, click: () => { win.showInactive(); win.webContents.send("pet-reaction", "roll"); } },
            {
              label: t.demoBoard,
              click: () => {
                win.showInactive();
                const b = strings(currentLocale()).bubble;
                const n = countToday(readDB(DB_PATH).records, localDateKey(Date.now()));
                const gd = goalDaily();
                const board = gd && gd > 0
                  ? (n >= gd ? b.goalMet : fmt(b.todayGoalN, { n, m: gd }))
                  : fmt(b.todayN, { n });
                const cue = fmt(strings(currentLocale()).bubble.good, { n: workdayStreak(readDB(DB_PATH).records, localDateKey(Date.now()), goalDaily()).streak });
                if (machine.pet === "idle") setSizeAnchored(FULL_W, FULL_H);
                win.webContents.send("pet-hint", { title: board, cue });
                setTimeout(() => { if (machine.pet === "idle") setSizeAnchored(CAT_W, CAT_H); }, 4600);
              },
            },
          ],
        },
        {
          label: t.shop.replaceAll("{n}", String(readInventory().fish)),
          submenu: SHOP.map((item) => {
            const invNow = readInventory(); // 菜单构建快照（外层闭包 inv 是唯一真相源）
            const owned = invNow.owned.includes(item.id);
            const label = item.kind === "outfit"
              ? `${owned ? (invNow.outfit === item.id ? "● " : "") : ""}${t.shopNames[item.id as keyof typeof t.shopNames]}${owned ? "" : ` · ${item.price}🐟`}`
              : `${t.shopNames[item.id as keyof typeof t.shopNames]}${owned ? "" : ` · ${item.price}🐟`}`;
            return {
              label,
              enabled: owned || invNow.fish >= item.price,
              click: () => {
                let inv2 = readInventory();
                if (item.kind === "tool") {
                  if (inv2.owned.includes(item.id)) {
                    // 逗猫棒：召回在外的猫 + 开一场蹦跳
                    if (roam.roaming) roamRecall("逗猫棒！"); else win.showInactive();
                    win.webContents.send("pet-skit", { type: "hop" });
                    rlog("逗猫棒：召回 + 蹦跳");
                  } else {
                    const bought = buyItem(inv2, item.id);
                    if (bought) { writeInventory(bought); inv2 = bought; rlog(`购买 ${item.id}（余额 ${bought.fish}）`); }
                  }
                } else {
                  if (!inv2.owned.includes(item.id)) {
                    const bought = buyItem(inv2, item.id);
                    if (bought) { writeInventory(bought); inv2 = bought; rlog(`购买并穿戴 ${item.id}（余额 ${bought.fish}）`); }
                  } else {
                    const toggled = toggleOutfit(inv2, item.id);
                    if (toggled) { writeInventory(toggled); inv2 = toggled; rlog(`穿戴切换 ${item.id} → ${toggled.outfit ?? "素身"}`); }
                  }
                }
                inv = inv2; // 回写闭包缓存（单源真相：修双源 bug——猫舍/余额曾读旧值）
              
  buildTrayMenu(); // 余额/拥有态即时刷新
                broadcast();     // 装扮即时上身
              },
            };
          }),
        },
        {
          label: t.travelAlbum,
          click: () => {
            mkdirSync(POSTCARDS_DIR, { recursive: true });
            void shell.openPath(POSTCARDS_DIR);
          },
        },
        {
          label: t.validateConfig,
          click: () => {
            // F16：免终端校验 config——结果用气泡反馈（brew 用户无源码路径）
            let cfgRaw: Record<string, unknown> | undefined;
            try { cfgRaw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { cfgRaw = undefined; }
            const r = auditConfig(cfgRaw, allExercises.map((e) => e.id));
            const h = strings(currentLocale()).hints;
            win.showInactive();
            if (machine.pet === "idle") setSizeAnchored(FULL_W, FULL_H);
            const title = r.ok ? `✅ ${h.cfgOk}` : `❌ ${r.errors[0] ?? ""}`;
            const cue = r.ok ? (r.warns.length ? `⚠️ ${r.warns[0]}` : "") : r.warns.length ? `⚠️ ${r.warns[0]}` : "";
            win.webContents.send("pet-hint", { title, cue });
            rlog(`配置校验：${r.ok ? "通过" : `${r.errors.length} 错`} / ${r.warns.length} 警告`);
            setTimeout(() => { if (machine.pet === "idle") setSizeAnchored(CAT_W, CAT_H); }, 4600);
          },
        },
        {
          label: t.copyReport,
          click: () =>
            clipboard.writeText(
              renderReport(readDB(DB_PATH), exercises, Date.now(), undefined, currentLocale(), goalDaily()),
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
            win.showInactive();
            const h = strings(currentLocale()).hints;
            if (machine.pet === "idle") setSizeAnchored(FULL_W, FULL_H); // idle 时扩窗容纳气泡
            win.webContents.send("pet-hint", { title: h.setupCopiedTitle, cue: h.setupCopiedCue });
            setTimeout(() => {
              if (machine.pet === "idle") setSizeAnchored(CAT_W, CAT_H); // 4.5s 后收回
            }, 4600);
          },
        },
        {
          label: t.cattery.replaceAll("{n}", String(inv.fish)),
          submenu: CAT_PERSONAS.map((persona) => {
            const loc = currentLocale();
            const owned = inv.cats?.includes(persona.id) ?? false;
            const coat = getCoat(persona.coatId);
            const per = getPersonality(persona.personalityId);
            return {
              label: owned
                ? `${inv.activeCat === persona.id ? "● " : ""}${persona.name[loc]} · ${per.name[loc]}`
                : `${persona.name[loc]} · ${coat.name[loc]} · ${CAT_PRICE}🐟`,
              enabled: owned || inv.fish >= CAT_PRICE,
              click: () => {
                if (owned) {
                  inv = { ...inv, activeCat: persona.id };
                } else {
                  const bought = buyCat(inv, persona.id, CAT_PRICE);
                  if (!bought) return;
                  inv = bought;
                  rlog(`新猫到家 · ${persona.name["zh-CN"]}（余额 ${inv.fish}）`);
                }
                writeInventory(inv);
                applyCat(); // 性情参数即时生效
                tray!.setImage(trayIcon());
              
  buildTrayMenu();
                broadcast();
              },
            };
          }),
        },
        {
          label: t.thisCat,
          click: () => {
            const persona = activeCat();
            const loc = currentLocale();
            const per = getPersonality(persona.personalityId);
            const coat = getCoat(persona.coatId);
            win.showInactive();
            if (machine.pet === "idle") setSizeAnchored(FULL_W, FULL_H);
            win.webContents.send("pet-hint", {
              title: `${persona.name[loc]} · ${coat.name[loc]} · ${per.name[loc]}`,
              cue: persona.backstory[loc],
            });
            setTimeout(() => { if (machine.pet === "idle") setSizeAnchored(CAT_W, CAT_H); }, 5200);
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

  // F33 启动恢复：在途旅行（重启前已扣便当）——窗外继续在途，窗内立即归来举牌
  if (travel.spotId) {
    const stillSilent = schedule ? intervalMinutes(schedule, new Date()) === null : false;
    const spot = SPOTS.find((v) => v.id === travel.spotId);
    if (stillSilent) {
      rlog(`恢复在途旅行 · ${spot?.name["zh-CN"] ?? "?"}`);
      roam = { ...roam, roaming: true, backAt: Date.now() + nextOutDuration(), homeX: win.getPosition()[0], homeY: win.getPosition()[1] };
      win.hide(); // 仍在旅途
    } else {
      rlog(`旅行归来（恢复）· ${spot?.name["zh-CN"] ?? "?"}`);
      // 等渲染端 ipc 监听就绪再归来（过早 send 会丢——明信片链依赖 renderer）
      setTimeout(() => arriveFromTravel(), 2500);
    }
  }
  console.log(
    `[micro-pet] alive · interval=${Math.round(machineCfg.intervalMs / 60000)}min · locale=${currentLocale()} · db=${DB_PATH}`,
  );
  rlog(
    `app 启动 · v${APP_VERSION} · schedule=${schedule ? schedule.windows.map((w) => `${w.from}-${w.to}@${w.intervalMin}min`).join(" ") : "off"} · interval=${Math.round(machineCfg.intervalMs / 60000)}min`,
  );
  tel("app_open", { exercises: exercises.length, scheduleWindows: schedule?.windows.length ?? 0 });
}
