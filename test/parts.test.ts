import { describe, expect, test } from "bun:test";
import { PARTS, SIT_POSE } from "../src/core/parts";
import { PALETTE } from "../src/core/pets/cat";
import { recolorFrame } from "../src/core/coats";
import { getCoat } from "../src/core/coats";

const ALL = Object.values(PARTS) as unknown as Array<{ art: string[] }>;

describe("F36 部件化 demo", () => {
  test("部件字符全部在骨架色板内（重着色兼容）", () => {
    for (const p of ALL) for (const row of p.art) {
      expect(row.length).toBe(p.art[0]!.length);
      for (const ch of row) expect(ch in PALETTE, `未知字符 ${ch}`).toBe(true);
    }
  });

  test("重着色对大部件（头/身）生效——recolorFrame 局部坐标与斑矩形有交集", () => {
    const out = recolorFrame(PARTS.body.art, getCoat("cow"));
    expect(out.some((r) => r.includes("S"))).toBe(true); // 身体 18 宽跨斑区
  });

  test("默认坐姿部件落位均在 32 网格内且头在身上", () => {
    const { head, body, earL, earR, tail, pawL, pawR } = SIT_POSE;
    expect(head.x).toBeGreaterThanOrEqual(0);
    expect(body.y).toBeGreaterThan(head.y); // 身在头下
    expect(earL.y).toBeLessThanOrEqual(head.y);
    expect(earR.y).toBeLessThanOrEqual(head.y);
    for (const part of [head, body, earL, earR, tail, pawL, pawR]) {
      expect(part.x).toBeGreaterThanOrEqual(0);
      expect(part.x).toBeLessThan(32);
      expect(part.y).toBeLessThan(32);
    }
  });
});
