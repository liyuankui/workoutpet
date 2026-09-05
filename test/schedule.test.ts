import { describe, expect, test } from "bun:test";
import { currentWindow, intervalMinutes, validateSchedule } from "../src/core/schedule";
import { loadExercises, pickBalanced } from "../src/core/exercises";
import raw from "../src/core/exercises.json";

const at = (h: number, m: number) => new Date(2026, 8, 4, h, m);
const SCHED = {
  windows: [
    { from: "09:00", to: "11:30", intervalMin: 75 },
    { from: "11:30", to: "13:30", intervalMin: 40 },
    { from: "13:30", to: "15:30", intervalMin: 35 },
    { from: "15:30", to: "18:00", intervalMin: 60 },
  ],
};

describe("v0.4.0 时段调度", () => {
  test("窗口内取对应间隔；窗口外静默（null）", () => {
    expect(intervalMinutes(SCHED, at(10, 0))).toBe(75);   // 上午专注
    expect(intervalMinutes(SCHED, at(12, 0))).toBe(40);   // 午饭前后
    expect(intervalMinutes(SCHED, at(14, 0))).toBe(35);   // 午后倦怠
    expect(intervalMinutes(SCHED, at(16, 0))).toBe(60);   // 傍晚
    expect(intervalMinutes(SCHED, at(8, 0))).toBeNull();  // 早间静默
    expect(intervalMinutes(SCHED, at(22, 0))).toBeNull(); // 夜间静默
  });

  test("边界：from 含 / to 不含", () => {
    expect(currentWindow(SCHED, at(11, 30))?.intervalMin).toBe(40);
    expect(currentWindow(SCHED, at(13, 29))?.intervalMin).toBe(40);
    expect(currentWindow(SCHED, at(13, 30))?.intervalMin).toBe(35);
  });

  test("非法 schedule 被拒：from>=to / 间隔越界 / 空 windows", () => {
    expect(validateSchedule({ windows: [{ from: "12:00", to: "12:00", intervalMin: 40 }] }).ok).toBe(false);
    expect(validateSchedule({ windows: [{ from: "09:00", to: "10:00", intervalMin: 3 }] }).ok).toBe(false);
    expect(validateSchedule({ windows: [] }).ok).toBe(false);
    expect(validateSchedule({ windows: [{ from: "bad", to: "10:00", intervalMin: 40 }] }).ok).toBe(false);
    expect(validateSchedule(SCHED).ok).toBe(true);
  });

  test("错误信息人话（含字段路径）", () => {
    const r = validateSchedule({ windows: [{ from: "25:00", to: "10:00", intervalMin: 40 }] });
    expect(r.error).toBeTruthy();
    expect(r.error!).toMatch(/from/);
  });
});

describe("v0.4.0 均衡抽取", () => {
  test("类别轮换：连续抽 8 次，四类全覆盖且无同类连发", () => {
    const ex = loadExercises(raw);
    let recent: string[] = [];
    const cats: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = pickBalanced(ex, recent, () => 0.5);
      recent = r.recent;
      cats.push(r.exercise.category);
    }
    expect(new Set(cats).size).toBe(4); // 下肢/肩颈/手腕/核心全碰到
    for (let i = 1; i < cats.length; i++) {
      if (cats.length - i <= 4) expect(cats[i]).not.toBe(cats[i - 1]); // 类别≥2 时最久未练优先，不连发
    }
  });

  test("全部 7 动作已归类", () => {
    const ex = loadExercises(raw);
    expect(ex.every((e) => ["lower", "upper", "hands", "core", "general"].includes(e.category))).toBe(true);
    expect(ex.filter((e) => e.category === "lower").length).toBe(3);
    expect(ex.filter((e) => e.category === "core").length).toBe(1);
  });
});
