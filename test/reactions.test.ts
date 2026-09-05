import { describe, expect, test } from "bun:test";
import { REACTIONS, REACTION_THROTTLE_MS, react } from "../src/core/reactions";

describe("F9 点击互动反应池", () => {
  test("反应池 ≥4 种（变奖赏）", () => {
    expect(REACTIONS.length).toBeGreaterThanOrEqual(4);
    expect([...REACTIONS]).toContain("wiggle");
    expect([...REACTIONS]).toContain("meow");
  });

  test("rand 注入确定性抽取，覆盖全池", () => {
    const got = new Set<string>();
    [0, 0.25, 0.5, 0.75, 0.99].forEach((r) => got.add(react(0, 1000, () => r)!));
    expect(got.size).toBe(REACTIONS.length); // 均匀覆盖
  });

  test("节流：500ms 内连点返回 null，之后恢复", () => {
    expect(react(1000, 1000 + REACTION_THROTTLE_MS - 1, () => 0)).toBeNull();
    expect(react(1000, 1000 + REACTION_THROTTLE_MS, () => 0)).toBe("wiggle");
  });
});
