import { describe, expect, test } from "bun:test";
import { ANIMS } from "../src/core/anims";
import { FRAMES } from "../src/core/pixelcat";

/** ANIMS ↔ FRAMES 静态校验：帧名拼错 = drawFrame 运行时崩溃白猫（不可爱，违宪） */
describe("F30 动画表校验（可爱第一性的工程保障）", () => {
  const states = Object.keys(ANIMS);

  test("五个产品状态各有动画", () => {
    expect(states).toContain("idle");
    expect(states).toContain("remind");
    expect(states).toContain("session");
    expect(states).toContain("happy");
    expect(states).toContain("cling");
  });

  test("每条步骤引用的帧名都存在于 FRAMES", () => {
    const bad: string[] = [];
    for (const [state, steps] of Object.entries(ANIMS)) {
      for (const [frame] of steps) {
        if (!(frame in FRAMES)) bad.push(`${state}:${frame}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("时长为正、偏移为有限数字", () => {
    for (const steps of Object.values(ANIMS)) {
      for (const [, dur, ox, oy] of steps) {
        expect(dur).toBeGreaterThan(0);
        expect(Number.isFinite(ox)).toBe(true);
        expect(Number.isFinite(oy)).toBe(true);
      }
    }
  });

  test("跳跃余量：y 负偏移不超过窗口顶余量（CAT_H 180 − 猫 112 − 边距 8 = 60px 预算）", () => {
    for (const steps of Object.values(ANIMS)) {
      for (const [, , , oy] of steps) {
        expect(oy).toBeGreaterThanOrEqual(-60);
      }
    }
  });
});
