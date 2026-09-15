import { describe, expect, test } from "bun:test";
import { OUTFITS, OUTFIT_PALETTE } from "../src/core/outfits";

describe("F26 装扮贴片", () => {
  test("三件贴片矩形且字符均在色板内；落位在 32 网格内", () => {
    for (const [id, o] of Object.entries(OUTFITS)) {
      const w = o.art[0]!.length;
      for (const row of o.art) {
        expect(row.length, `${id} 行宽一致`).toBe(w);
        for (const ch of row) expect(ch in OUTFIT_PALETTE, `${id} 未知字符 ${ch}`).toBe(true);
      }
      expect(o.gx + w, `${id} x 越界`).toBeLessThanOrEqual(32);
      expect(o.gy + o.art.length, `${id} y 越界`).toBeLessThanOrEqual(32);
    }
  });

  test("三件各有部件挂点（F36：跟随永不悬空）", () => {
    expect(OUTFITS.hat.anchor).toBe("head");
    expect(OUTFITS.bow.anchor).toBe("head");
    expect(OUTFITS.scarf.anchor).toBe("neck");
  });
});
