import { describe, expect, test } from "bun:test";
import { loadExercises, pickRandom, ExerciseSchema } from "../src/core/exercises";
import raw from "../src/core/exercises.json";

describe("F1 动作库", () => {
  test("自带 7 个动作，schema 全过", () => {
    const list = loadExercises(raw);
    expect(list.length).toBeGreaterThanOrEqual(7);
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
  });

  test("每个动作字段完整可渲染", () => {
    for (const e of loadExercises(raw)) {
      expect(e.cue.length).toBeGreaterThan(0);
      expect(e.steps.length).toBeGreaterThanOrEqual(2);
      expect(e.durationSec).toBeGreaterThanOrEqual(10);
    }
  });

  test("缺 cue 字段 → 报错信息可读（含字段路径）", () => {
    const bad = (raw as Record<string, unknown>[]).map((e) => {
      const { cue: _drop, ...rest } = e;
      return rest;
    });
    try {
      loadExercises(bad);
      expect.unreachable();
    } catch (err) {
      const msg = String(err);
      expect(msg).toContain("cue");
    }
  });

  test("少于 7 个 → 拒绝", () => {
    const few = loadExercises(raw).slice(0, 6);
    expect(() => loadExercises(few)).toThrow(/≥7/);
  });

  test("pickRandom 注入确定性 rand", () => {
    const list = [1, 2, 3];
    expect(pickRandom(list, () => 0)).toBe(1);
    expect(pickRandom(list, () => 0.99)).toBe(3);
  });

  test("非法 animation 枚举被拒", () => {
    expect(() => ExerciseSchema.parse({ ...raw[0], animation: "breakdance" })).toThrow();
  });
});
