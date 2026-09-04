import { describe, expect, test } from "bun:test";
import { createMachine, dispatch, DEFAULT_CONFIG, type MachineConfig } from "../src/core/stateMachine";
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
