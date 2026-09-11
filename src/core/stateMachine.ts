import type { Exercise } from "./exercises";
import { pickRandom } from "./exercises";

/** 动作抽取器：默认纯随机；主进程可注入「类别均衡」策略 */
export type ExercisePicker = (exercises: readonly Exercise[], rand: () => number) => Exercise;

/**
 * 定时提醒状态机（纯逻辑，时钟可注入）
 * 状态转移：idle →(到点) remind →(点猫) session（F25 会话陪练：跟做+倒数）
 *           session →(durationSec 走完) happy + 打卡；session →(再点=提前结束，也算完成) happy + 打卡
 *           remind →(2 分钟无人理睬) idle{retryPending}（顺延：8 分钟后再来，非重计整轮）
 *           remind →(超时且连续跳过达阈值) cling（赖着撒娇：点猫=进会话）
 *           cling →(点猫) session；cling 常驻无超时
 *           happy →(3s) idle；idle 状态摸头 = 蹭蹭（wiggle），不打卡
 */
export type PetState = "idle" | "remind" | "happy" | "cling" | "session";

export interface MachineConfig {
  /** 提醒间隔（默认 60 分钟，可配 30-120） */
  intervalMs: number;
  /** remind 状态无人理睬多久自然回 idle（不催促） */
  remindTimeoutMs: number;
  /** happy 动画时长 */
  happyMs: number;
  /** 超时是否顺延（P1 语义：运动没完成是顺延不是跳过）；缺省 false = 旧行为 */
  retryOnTimeout?: boolean;
  /** 连续跳过多少次进入 cling 撒娇赖留；缺省/0 = 永不 */
  clingAfterSkips?: number;
}

export const DEFAULT_CONFIG: MachineConfig = {
  intervalMs: 60 * 60_000,
  remindTimeoutMs: 120_000,
  happyMs: 3_000,
};

export interface MachineState {
  pet: PetState;
  exercise: Exercise | null;
  /** 上次提醒结束（或启动）时刻——idle 计时起点 */
  lastCycleAt: number;
  remindStartedAt: number;
  happyStartedAt: number;
  /** 连续超时未理次数（打卡清零）——撒娇档位依据 */
  skipStreak: number;
  /** 有顺延中的运动：主进程下次间隔改用 retryMs，直到打卡 */
  retryPending: boolean;
  /** 会话开始时刻（F25 陪练计时） */
  sessionStartedAt: number;
}

export type PetEvent =
  | { type: "TICK"; now: number }
  | { type: "PET"; now: number }
  | { type: "FORCE"; now: number } // Tray「立刻提醒」/ 测试用
  /** 收敛休眠（H1/M2）：静默期进入/换猫和解——任意态归 idle，顺延与跳过一并清零（明日新轮） */
  | { type: "SLEEP"; now: number };

export interface DispatchResult {
  state: MachineState;
  /** 本次 PET 完成打卡的动作（null = 未打卡；session 结束时非空） */
  checkedIn: Exercise | null;
  /** 本次打卡实际跟做秒数（F25：完整率度量；null = 未打卡） */
  checkedInSec: number | null;
  /** true = 蹭蹭反馈（idle/happy 下摸头） */
  wiggle: boolean;
}

export function createMachine(
  exercises: Exercise[],
  startAt = 0,
  rand: () => number = Math.random,
): MachineState {
  void exercises;
  void rand;
  return {
    pet: "idle",
    exercise: null,
    lastCycleAt: startAt,
    remindStartedAt: 0,
    happyStartedAt: 0,
    skipStreak: 0,
    retryPending: false,
    sessionStartedAt: 0,
  };
}

/** 顺延中的间隔选择：retryPending 时用 retryMs（8 分钟级），否则常规轮转间隔 */
export function effectiveIntervalMs(machine: MachineState, baseMs: number, retryMs: number): number {
  return machine.retryPending ? retryMs : baseMs;
}

export function dispatch(
  m: MachineState,
  ev: PetEvent,
  cfg: MachineConfig,
  exercises: readonly Exercise[],
  rand: () => number = Math.random,
  pick: ExercisePicker = (ex, r) => pickRandom(ex, r),
): DispatchResult {
  const s = { ...m };
  const none: DispatchResult = { state: s, checkedIn: null, checkedInSec: null, wiggle: false };

  /** 会话收尾：打卡 + happy（自动到时或提前点——动了就好，都算完成） */
  const finishSession = (now: number): DispatchResult => {
    const done = s.exercise!;
    // 秒数封顶动作时长（M3/M4）：自动收工恰达 dur；跨夜僵死的会话也不产出 54000s 脏值
    const durSec = done.durationSec;
    const sec = Math.max(1, Math.min(Math.round((now - s.sessionStartedAt) / 1000), durSec));
    s.pet = "happy";
    s.exercise = done;
    s.happyStartedAt = now;
    s.skipStreak = 0;
    s.retryPending = false;
    return { state: s, checkedIn: done, checkedInSec: sec, wiggle: false };
  };

  if (ev.type === "SLEEP") {
    s.pet = "idle";
    s.exercise = null;
    s.lastCycleAt = ev.now;
    s.skipStreak = 0;
    s.retryPending = false;
    return none;
  }

  if (ev.type === "FORCE") {
    if (s.pet === "remind" || s.pet === "session") return none; // 提醒/会话中不重复触发（L5：会话不静默作废）
    s.pet = "remind";
    s.exercise = pick(exercises, rand);
    s.remindStartedAt = ev.now;
    s.retryPending = false; // 提醒兑现，间隔回到常规（再超时会重新顺延）
    return { state: s, checkedIn: null, checkedInSec: null, wiggle: false };
  }

  if (ev.type === "PET") {
    if (s.pet === "remind" || s.pet === "cling") {
      // F25：点猫 = 开始会话陪练（猫跟做 + 倒数），不再是瞬发打卡
      s.pet = "session";
      s.sessionStartedAt = ev.now;
      return { state: s, checkedIn: null, checkedInSec: null, wiggle: false };
    }
    if (s.pet === "session") return finishSession(ev.now); // 提前结束也算完成（动了就好）
    return { state: s, checkedIn: null, checkedInSec: null, wiggle: true }; // 蹭蹭，不打卡
  }

  // TICK
  if (s.pet === "idle") {
    if (ev.now - s.lastCycleAt >= cfg.intervalMs) {
      s.pet = "remind";
      s.exercise = pick(exercises, rand);
      s.remindStartedAt = ev.now;
      s.retryPending = false;
    }
    return none;
  }
  if (s.pet === "remind") {
    if (ev.now - s.remindStartedAt >= cfg.remindTimeoutMs) {
      s.skipStreak += 1;
      const clingN = cfg.clingAfterSkips ?? 0;
      if (clingN > 0 && s.skipStreak >= clingN) {
        // 赖着不走：保留动作与 FULL 窗，点猫=打卡，无超时
        s.pet = "cling";
        s.retryPending = false;
      } else {
        // 无人理睬 → 安静回 idle（不催促）；顺延语义：下次间隔由 retryPending 决定
        s.pet = "idle";
        s.exercise = null;
        s.lastCycleAt = ev.now;
        if (cfg.retryOnTimeout) s.retryPending = true;
      }
    }
    return none;
  }
  if (s.pet === "session") {
    // durationSec 走完自动收工（练习时长数据在动作上，状态机不读盘）
    const durMs = (s.exercise?.durationSec ?? 30) * 1000;
    if (ev.now - s.sessionStartedAt >= durMs) return finishSession(ev.now);
    return none;
  }
  if (s.pet === "cling") {
    return none; // 常驻撒娇：软话轮换由主进程 broadcast 驱动，点击进会话
  }
  // happy
  if (ev.now - s.happyStartedAt >= cfg.happyMs) {
    s.pet = "idle";
    s.exercise = null;
    s.lastCycleAt = ev.now;
  }
  return none;
}
