import type { Exercise } from "./exercises";
import { pickRandom } from "./exercises";

/**
 * F3 定时提醒状态机（纯逻辑，时钟可注入）
 * 状态转移：idle →(到点) remind →(摸头) happy →(3s) idle
 *           remind →(2 分钟无人理睬，不催促) idle
 *           idle 状态摸头 = 蹭蹭（wiggle），不打卡
 */
export type PetState = "idle" | "remind" | "happy";

export interface MachineConfig {
  /** 提醒间隔（默认 60 分钟，可配 30-120） */
  intervalMs: number;
  /** remind 状态无人理睬多久自然回 idle（不催促） */
  remindTimeoutMs: number;
  /** happy 动画时长 */
  happyMs: number;
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
}

export type PetEvent =
  | { type: "TICK"; now: number }
  | { type: "PET"; now: number }
  | { type: "FORCE"; now: number }; // Tray「立刻提醒」/ 测试用

export interface DispatchResult {
  state: MachineState;
  /** 本次 PET 完成打卡的动作（null = 未打卡） */
  checkedIn: Exercise | null;
  /** true = 蹭蹭反馈（idle/happy 下摸头） */
  wiggle: boolean;
}

export function createMachine(
  exercises: readonly Exercise[],
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
  };
}

export function dispatch(
  m: MachineState,
  ev: PetEvent,
  cfg: MachineConfig,
  exercises: readonly Exercise[],
  rand: () => number = Math.random,
): DispatchResult {
  const s = { ...m };
  const none: DispatchResult = { state: s, checkedIn: null, wiggle: false };

  if (ev.type === "FORCE") {
    if (s.pet === "remind") return none; // 提醒中不重复触发
    s.pet = "remind";
    s.exercise = pickRandom(exercises, rand);
    s.remindStartedAt = ev.now;
    return { state: s, checkedIn: null, wiggle: false };
  }

  if (ev.type === "PET") {
    if (s.pet === "remind") {
      const done = s.exercise!;
      s.pet = "happy";
      s.exercise = done;
      s.happyStartedAt = ev.now;
      return { state: s, checkedIn: done, wiggle: false };
    }
    return { state: s, checkedIn: null, wiggle: true }; // 蹭蹭，不打卡
  }

  // TICK
  if (s.pet === "idle") {
    if (ev.now - s.lastCycleAt >= cfg.intervalMs) {
      s.pet = "remind";
      s.exercise = pickRandom(exercises, rand);
      s.remindStartedAt = ev.now;
    }
    return none;
  }
  if (s.pet === "remind") {
    if (ev.now - s.remindStartedAt >= cfg.remindTimeoutMs) {
      // 无人理睬 → 安静回 idle，重新计时（不催促）
      s.pet = "idle";
      s.exercise = null;
      s.lastCycleAt = ev.now;
    }
    return none;
  }
  // happy
  if (ev.now - s.happyStartedAt >= cfg.happyMs) {
    s.pet = "idle";
    s.exercise = null;
    s.lastCycleAt = ev.now;
  }
  return none;
}
