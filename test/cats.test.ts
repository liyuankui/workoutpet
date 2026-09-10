import { describe, expect, test } from "bun:test";
import { CAT_PERSONAS, CAT_PRICE, getPersona, starterCats, validateRefs } from "../src/core/cats";
import { COATS } from "../src/core/coats";
import { PERSONALITIES } from "../src/core/personalities";

describe("F32 人设注册表", () => {
  test("七只猫（花色全覆盖）：id 唯一、引用完整", () => {
    expect(CAT_PERSONAS.length).toBe(7);
    expect(new Set(CAT_PERSONAS.map((c) => c.id)).size).toBe(7);
    expect(validateRefs(COATS, PERSONALITIES)).toEqual([]);
  });

  test("每只：双语名字 + 背景小传非空", () => {
    for (const c of CAT_PERSONAS) {
      expect(c.name["zh-CN"].length).toBeGreaterThan(0);
      expect(c.name.en.length).toBeGreaterThan(0);
      expect(c.backstory["zh-CN"].length).toBeGreaterThan(5);
      expect(c.backstory.en.length).toBeGreaterThan(5);
    }
  });

  test("初始赠送：小橘 + 随机一只（不重复、小橘必在）", () => {
    for (let i = 0; i < 20; i++) {
      const s = starterCats();
      expect(s[0]).toBe("xiaoju");
      expect(s.length).toBe(2);
      expect(new Set(s).size).toBe(2);
    }
  });

  test("同价 8 鱼（反稀有度）", () => {
    expect(CAT_PRICE).toBe(8);
  });

  test("花色全覆盖（7 款 coat 各有人设认领）", () => {
    const coats = new Set(CAT_PERSONAS.map((c) => c.coatId));
    expect(coats.size).toBe(7);
  });
});
