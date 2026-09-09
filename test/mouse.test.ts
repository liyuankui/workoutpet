import { describe, expect, test } from "bun:test";
import { MOUSE_FRAMES, MOUSE_PALETTE, MOUSE_W, MOUSE_H } from "../src/core/mouse";

describe("F27 老鼠 sprite", () => {
  test("两帧 6 行 × 12 字符，字符均在色板内", () => {
    for (const [name, frame] of Object.entries(MOUSE_FRAMES)) {
      expect(frame.length, name).toBe(MOUSE_H);
      for (const row of frame) {
        expect(row.length, name).toBe(MOUSE_W);
        for (const ch of row) expect(ch in MOUSE_PALETTE, `${name} 未知字符 ${ch}`).toBe(true);
      }
    }
  });

  test("两帧可辨识差异（腿位不同）", () => {
    expect(MOUSE_FRAMES.mouseA).not.toEqual(MOUSE_FRAMES.mouseB);
  });
});
