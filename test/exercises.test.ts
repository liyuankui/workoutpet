import { describe, expect, test } from "bun:test";
import { loadExercises, localizeExercise, pickRandom, ExerciseSchema, type Exercise } from "../src/core/exercises";
import raw from "../src/core/exercises.json";

describe("F1 动作库", () => {
  test("自带 7 个动作，schema 全过", () => {
    const list = loadExercises(raw);
    expect(list.length).toBeGreaterThanOrEqual(7);
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
  });

  test("每个动作字段完整可渲染（zh-CN 必有）", () => {
    for (const e of loadExercises(raw)) {
      expect(e.cue["zh-CN"].length).toBeGreaterThan(0);
      expect(e.steps["zh-CN"].length).toBeGreaterThanOrEqual(2);
      expect(e.durationSec).toBeGreaterThanOrEqual(10);
    }
  });

  test("双语：en 均已提供", () => {
    for (const e of loadExercises(raw)) {
      expect(e.name.en).toBeTruthy();
      expect(e.cue.en).toBeTruthy();
    }
  });

  test("F8 回退：缺 en 字段 → localizeExercise 回退 zh-CN 不崩", () => {
    const ex = loadExercises(raw)[0]! as Exercise;
    const noEn: Exercise = { ...ex, name: { "zh-CN": ex.name["zh-CN"] }, cue: { "zh-CN": ex.cue["zh-CN"] } };
    const view = localizeExercise(noEn, "en");
    expect(view.name).toBe(ex.name["zh-CN"]); // 英文缺失回退中文
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
      expect(String(err)).toContain("cue");
    }
  });

  test("缺 zh-CN（回退基准）→ 拒绝", () => {
    const ex = raw[0] as Record<string, unknown>;
    expect(() =>
      ExerciseSchema.parse({ ...ex, name: { en: "Only English" } }),
    ).toThrow();
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
