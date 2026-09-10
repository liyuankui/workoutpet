import { describe, expect, test } from "bun:test";
import { ANIMS } from "../src/core/anims";
import { getPet } from "../src/core/pets";
import { CAT_PERSONAS } from "../src/core/cats";

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

  test("每条步骤引用的帧名在所有猫（6 人设 × 花色重着色后）中都存在——换猫不破动画契约", () => {
    const bad: string[] = [];
    for (const [state, steps] of Object.entries(ANIMS)) {
      for (const [frame] of steps) {
        for (const persona of CAT_PERSONAS) {
          const pet = getPet(persona.id);
          if (!(frame in pet.frames)) bad.push(`${persona.id}:${state}:${frame}`);
        }
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
