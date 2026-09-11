import { describe, expect, test } from "bun:test";
import { BENTO_PRICE, canAffordTravel, pickSpot, SPOTS } from "../src/core/travel";

describe("F33 旅行系统", () => {
  test("11 个景点（9 正经 + 2 彩蛋），rare 标记与双语齐全", () => {
    expect(SPOTS.length).toBe(11);
    expect(SPOTS.filter((s) => s.rare).length).toBe(3);
    for (const s of SPOTS) {
      expect(s.name["zh-CN"].length).toBeGreaterThan(0);
      expect(s.souvenir.en.length).toBeGreaterThan(0);
      expect(s.sky).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("性情选景：胆小只去办公室；活泼必稀有；老成半数不出远门", () => {
    const r0 = () => 0;
    for (let i = 0; i < 20; i++) {
      const t = pickSpot("timid", r0);
      expect(["nextdesk", "printer"]).toContain(t!.id);
    }
    expect(pickSpot("playful", () => 0.1)!.rare).toBe(true);
    expect(pickSpot("playful", () => 0.9)!.rare).toBe(true);
    let calmWent = 0;
    for (let i = 0; i < 20; i++) if (pickSpot("calm", () => 0.1) !== null) calmWent++; // rand=0.1<0.5 → 全不出
    expect(calmWent).toBe(0);
    for (let i = 0; i < 20; i++) if (pickSpot("calm", () => 0.9) !== null) calmWent++; // rand=0.9 → 全出
    expect(calmWent).toBe(20);
  });

  test("便当 2 鱼：余额够才出远门", () => {
    expect(BENTO_PRICE).toBe(2);
    expect(canAffordTravel(2)).toBe(true);
    expect(canAffordTravel(1)).toBe(false);
  });
});
