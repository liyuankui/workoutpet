import { describe, expect, test } from "bun:test";
import { FRAMES, GRID, PALETTE, frameToRGBA } from "../src/core/pixelcat";

describe("像素猫 sprite 完整性", () => {
  test("每帧 16 行 × 16 字符，字符均在色板内", () => {
    for (const [name, frame] of Object.entries(FRAMES)) {
      expect(frame.length).toBe(GRID);
      for (const row of frame) {
        expect(row.length).toBe(GRID);
        for (const ch of row) {
          expect(ch in PALETTE).toBe(true); // "." 是合法透明符，不能用 toHaveProperty（会当路径解析）
        }
      }
      void name;
    }
  });

  test("帧可辨识：idle 有眼睛(E)，stretch_b 有探出的前爪，happy 有爱心(R)", () => {
    const flat = (f: readonly string[]) => f.join("");
    expect(flat(FRAMES.idleA)).toContain("E");
    expect(flat(FRAMES.blink)).not.toContain("E"); // 眨眼无 E
    expect(flat(FRAMES.stretchB).split("\n").join("").startsWith("LLL")).toBe(false);
    expect(flat(FRAMES.stretchB)).toContain("LLLLL"); // 前爪全伸展
    expect(flat(FRAMES.happy)).toContain("R");
  });

  test("frameToRGBA 尺寸 16×16×4，透明像素 alpha=0", () => {
    const buf = frameToRGBA(FRAMES.idleA);
    expect(buf.length).toBe(GRID * GRID * 4);
    // (0,0) 是 '.'
    expect(buf[3]).toBe(0);
  });
});
