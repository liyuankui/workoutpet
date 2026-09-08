import { describe, expect, test } from "bun:test";
import { createMachine, dispatch, effectiveIntervalMs, DEFAULT_CONFIG, type MachineConfig } from "../src/core/stateMachine";
import { loadExercises } from "../src/core/exercises";
import raw from "../src/core/exercises.json";

const ex = loadExercises(raw);
const cfg: MachineConfig = { ...DEFAULT_CONFIG, intervalMs: 60_000, remindTimeoutMs: 120_000, happyMs: 3_000 };
const fixedRand = () => 0; // 永远抽第一个

describe("F3 状态机", () => {
  test("idle：到点 → remind，随机抽动作", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "TICK", now: 59_999 }, cfg, ex, fixedRand).state;
    expect(m.pet).toBe("idle"); // 差 1ms 不触发
    const r = dispatch(m, { type: "TICK", now: 60_000 }, cfg, ex, fixedRand);
    expect(r.state.pet).toBe("remind");
    expect(r.state.exercise!.id).toBe(ex[0].id);
  });

  test("remind：摸头 → happy + 打卡", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "TICK", now: 60_000 }, cfg, ex, fixedRand).state;
    const r = dispatch(m, { type: "PET", now: 61_000 }, cfg, ex, fixedRand);
    expect(r.state.pet).toBe("happy");
    expect(r.checkedIn!.id).toBe(m.exercise!.id);
    expect(r.wiggle).toBe(false);
  });

  test("remind：2 分钟无人理睬 → 安静回 idle（不催促），重新计时", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "TICK", now: 60_000 }, cfg, ex, fixedRand).state;
    const r = dispatch(m, { type: "TICK", now: 60_000 + 120_000 }, cfg, ex, fixedRand);
    expect(r.state.pet).toBe("idle");
    expect(r.state.exercise).toBeNull();
    // 从超时时刻重新计时
    const r2 = dispatch(r.state, { type: "TICK", now: 60_000 + 120_000 + 59_999 }, cfg, ex, fixedRand);
    expect(r2.state.pet).toBe("idle");
  });

  test("happy：3 秒 → idle", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "TICK", now: 60_000 }, cfg, ex, fixedRand).state;
    m = dispatch(m, { type: "PET", now: 61_000 }, cfg, ex, fixedRand).state;
    const r = dispatch(m, { type: "TICK", now: 61_000 + 3_000 }, cfg, ex, fixedRand);
    expect(r.state.pet).toBe("idle");
  });

  test("idle 摸头 = 蹭蹭（wiggle），不打卡", () => {
    const m = createMachine(ex, 0, fixedRand);
    const r = dispatch(m, { type: "PET", now: 5_000 }, cfg, ex, fixedRand);
    expect(r.state.pet).toBe("idle");
    expect(r.checkedIn).toBeNull();
    expect(r.wiggle).toBe(true);
  });

  test("FORCE：随时可触发提醒（Tray 演示入口）；remind 中不重复", () => {
    const m0 = createMachine(ex, 0, fixedRand);
    const r = dispatch(m0, { type: "FORCE", now: 1_000 }, cfg, ex, fixedRand);
    expect(r.state.pet).toBe("remind");
    const r2 = dispatch(r.state, { type: "FORCE", now: 1_100 }, cfg, ex, fixedRand);
    expect(r2.state.remindStartedAt).toBe(r.state.remindStartedAt); // 未重置
  });

  test("完整循环：idle→remind→happy→idle 后重新计时", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "FORCE", now: 1_000 }, cfg, ex, fixedRand).state;
    m = dispatch(m, { type: "PET", now: 2_000 }, cfg, ex, fixedRand).state;
    m = dispatch(m, { type: "TICK", now: 5_000 }, cfg, ex, fixedRand).state;
    expect(m.pet).toBe("idle");
    expect(m.lastCycleAt).toBe(5_000);
    const r = dispatch(m, { type: "TICK", now: 5_000 + 60_000 }, cfg, ex, fixedRand);
    expect(r.state.pet).toBe("remind"); // 下一轮到点
  });
});

describe("F24 顺延重试（运动没完成是顺延不是跳过）", () => {
  const retryCfg: MachineConfig = { ...cfg, retryOnTimeout: true };

  test("超时 → idle + retryPending（下次用顺延间隔），skipStreak 计数", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "TICK", now: 60_000 }, retryCfg, ex, fixedRand).state;
    const r = dispatch(m, { type: "TICK", now: 180_000 }, retryCfg, ex, fixedRand);
    expect(r.state.pet).toBe("idle");
    expect(r.state.retryPending).toBe(true);
    expect(r.state.skipStreak).toBe(1);
  });

  test("effectiveIntervalMs：retryPending 用 retryMs，打卡语义恢复后用 base", () => {
    const m = { ...createMachine(ex, 0, fixedRand), retryPending: true };
    expect(effectiveIntervalMs(m, 75 * 60_000, 8 * 60_000)).toBe(8 * 60_000);
    expect(effectiveIntervalMs(createMachine(ex, 0), 75 * 60_000, 8 * 60_000)).toBe(75 * 60_000);
  });

  test("顺延兑现：retryPending 时到 retryMs 即提醒（非整轮间隔）", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "FORCE", now: 1_000 }, retryCfg, ex, fixedRand).state;
    m = dispatch(m, { type: "TICK", now: 1_000 + 120_000 }, retryCfg, ex, fixedRand).state; // 超时顺延
    const interval = effectiveIntervalMs(m, 75 * 60_000, 8 * 60_000);
    const r = dispatch(m, { type: "TICK", now: m.lastCycleAt + interval }, retryCfg, ex, fixedRand);
    expect(r.state.pet).toBe("remind"); // 8 分钟级即来
    expect(r.state.retryPending).toBe(false); // 提醒兑现，pending 清
  });

  test("顺延挂起中点猫仍是蹭蹭；顺延到点提醒后打卡 → skipStreak 与 retryPending 双清零", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "FORCE", now: 1_000 }, retryCfg, ex, fixedRand).state;
    m = dispatch(m, { type: "TICK", now: 121_000 }, retryCfg, ex, fixedRand).state; // 超时 → idle(retryPending)
    const wig = dispatch(m, { type: "PET", now: 122_000 }, retryCfg, ex, fixedRand);
    expect(wig.state.pet).toBe("idle"); // 挂起中无提醒可打，仍是蹭蹭
    expect(wig.wiggle).toBe(true);
    m = dispatch(m, { type: "TICK", now: m.lastCycleAt + 8 * 60_000 }, retryCfg, ex, fixedRand).state; // 顺延到点
    expect(m.pet).toBe("remind");
    const r = dispatch(m, { type: "PET", now: m.remindStartedAt + 1_000 }, retryCfg, ex, fixedRand);
    expect(r.state.pet).toBe("happy");
    expect(r.state.skipStreak).toBe(0);
    expect(r.state.retryPending).toBe(false);
  });

  test("retryOnTimeout 缺省（旧语义）→ 超时不顺延", () => {
    let m = createMachine(ex, 0, fixedRand);
    m = dispatch(m, { type: "TICK", now: 60_000 }, cfg, ex, fixedRand).state;
    const r = dispatch(m, { type: "TICK", now: 180_000 }, cfg, ex, fixedRand);
    expect(r.state.retryPending).toBe(false);
  });
});

describe("F23 撒娇赖留（cling）", () => {
  const clingCfg: MachineConfig = { ...cfg, retryOnTimeout: true, clingAfterSkips: 3 };

  /** 时间轴：FORCE 进提醒，每轮 = 超时(2min) → （顺延 8min 到点再提醒） */
  function skipN(n: number, cfgX: MachineConfig) {
    let m = createMachine(ex, 0, fixedRand);
    let t = 1_000;
    m = dispatch(m, { type: "FORCE", now: t }, cfgX, ex, fixedRand).state;
    for (let i = 0; i < n; i++) {
      t += 120_000; // 超时
      m = dispatch(m, { type: "TICK", now: t }, cfgX, ex, fixedRand).state;
      if (m.pet === "idle" && i < n - 1) {
        t += 8 * 60_000; // 顺延到点再来一轮提醒
        m = dispatch(m, { type: "TICK", now: t }, cfgX, ex, fixedRand).state;
        expect(m.pet).toBe("remind");
      }
    }
    return m;
  }

  test("连续跳过达阈值 → cling（赖着不走，保留动作）", () => {
    const m = skipN(3, clingCfg);
    expect(m.pet).toBe("cling");
    expect(m.exercise).not.toBeNull();
    expect(m.skipStreak).toBe(3);
  });

  test("未达阈值 → 仍是顺延循环（idle）", () => {
    const m = skipN(2, clingCfg);
    expect(m.pet).toBe("idle");
    expect(m.retryPending).toBe(true);
  });

  test("cling 常驻：TICK 永不超时/不回 idle", () => {
    const m = skipN(3, clingCfg);
    const r = dispatch(m, { type: "TICK", now: Date.now() + 86_400_000 }, clingCfg, ex, fixedRand);
    expect(r.state.pet).toBe("cling");
  });

  test("cling 点猫 = 打卡和解 → happy，全清零", () => {
    const m = skipN(3, clingCfg);
    const r = dispatch(m, { type: "PET", now: 999_999 }, clingCfg, ex, fixedRand);
    expect(r.state.pet).toBe("happy");
    expect(r.checkedIn!.id).toBe(m.exercise!.id);
    expect(r.state.skipStreak).toBe(0);
    expect(r.state.retryPending).toBe(false);
  });

  test("FORCE 在 cling → remind（托盘演示可打断撒娇）", () => {
    const m = skipN(3, clingCfg);
    const r = dispatch(m, { type: "FORCE", now: 1_000_000 }, clingCfg, ex, fixedRand);
    expect(r.state.pet).toBe("remind");
  });
});
