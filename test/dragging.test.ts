import { describe, expect, test } from "bun:test";
import { shouldStartDrag, clampWindow } from "../src/core/dragging";

describe("F19 拖动", () => {
  describe("shouldStartDrag：点击 vs 拖动判定", () => {
    test("位移小于阈值 → 不是拖动（放行 click）", () => {
      expect(shouldStartDrag(100, 100, 103, 100)).toBe(false); // 3px
      expect(shouldStartDrag(100, 100, 100, 100)).toBe(false); // 原地
    });

    test("位移达到阈值 → 拖动", () => {
      expect(shouldStartDrag(100, 100, 104, 100)).toBe(true); // 4px 恰好
      expect(shouldStartDrag(100, 100, 96, 100)).toBe(true);  // 反方向
      expect(shouldStartDrag(100, 100, 98, 103)).toBe(true);  // 斜向累计 5px
    });

    test("阈值可调（触屏/触控板调大）", () => {
      expect(shouldStartDrag(0, 0, 10, 0, 12)).toBe(false);
      expect(shouldStartDrag(0, 0, 12, 0, 12)).toBe(true);
    });
  });

  describe("clampWindow：屏幕边界钳制", () => {
    const wa = { x: 0, y: 25, width: 1920, height: 1055 }; // 含菜单栏偏移

    test("屏内原样返回", () => {
      expect(clampWindow(500, 500, 150, 150, wa)).toEqual({ x: 500, y: 500 });
    });

    test("拖出左侧 → 至少留 40px 可抓回", () => {
      expect(clampWindow(-200, 500, 150, 150, wa).x).toBe(-110); // 0-150+40
      expect(clampWindow(-5000, 500, 150, 150, wa).x).toBe(-110);
    });

    test("拖出右侧 → 保留右侧 40px", () => {
      expect(clampWindow(5000, 500, 150, 150, wa).x).toBe(1920 - 40);
    });

    test("顶部不许越过菜单栏（y 下限 = workArea.y）", () => {
      expect(clampWindow(500, -100, 150, 150, wa).y).toBe(25);
    });

    test("拖出底部 → 保留底部 40px", () => {
      expect(clampWindow(500, 5000, 150, 150, wa).y).toBe(25 + 1055 - 40);
    });
  });
});
