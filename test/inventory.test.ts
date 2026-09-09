import { describe, expect, test } from "bun:test";
import { buyItem, earnOnCheckIn, emptyInventory, toggleOutfit, SHOP, DAILY_EARN_CAP } from "../src/core/inventory";

describe("F26 小鱼干账本", () => {
  test("打卡 +1；达标日 +2（每日一次）；日上限 6 防肝", () => {
    let inv = emptyInventory();
    const r1 = earnOnCheckIn(inv, "d1", false);
    expect(r1.gained).toBe(1);
    inv = r1.inv;
    const r2 = earnOnCheckIn(inv, "d1", true); // 达标
    expect(r2.gained).toBe(3); // 1+2
    inv = r2.inv;
    const r3 = earnOnCheckIn(inv, "d1", true); // 当日达标奖励已发
    expect(r3.gained).toBe(1);
    inv = r3.inv;
    const r4 = earnOnCheckIn(inv, "d1", false);
    expect(r4.gained).toBe(1); // 1+3+1+1=6，恰满上限
    inv = r4.inv;
    expect(inv.fish).toBe(6);
    const r5 = earnOnCheckIn(inv, "d1", false); // 上限后打卡仍计 streak 但不再得鱼
    expect(r5.gained).toBe(0);
    expect(r5.inv.fish).toBe(6);
  });

  test("跨日刷新上限与达标奖励", () => {
    let inv = earnOnCheckIn(emptyInventory(), "d1", true).inv;
    expect(inv.fish).toBe(3);
    const r = earnOnCheckIn(inv, "d2", true);
    expect(r.gained).toBe(3); // 新一天重新计数与奖励
  });

  test("购买：余额不足/已拥有拒绝；买即穿；工具不占穿戴", () => {
    let inv = { ...emptyInventory(), fish: 6 };
    const bought = buyItem(inv, "wand");
    expect(bought).not.toBeNull();
    expect(bought!.fish).toBe(3);
    expect(bought!.outfit).toBeNull(); // 工具不穿
    expect(buyItem(bought!, "hat")).toBeNull(); // 余额 3 < 6
    const hatted = buyItem({ ...bought!, fish: 10 }, "hat");
    expect(hatted!.outfit).toBe("hat"); // 买即穿
    expect(buyItem(hatted!, "hat")).toBeNull(); // 已拥有
  });

  test("穿戴切换：重复点击脱下；未拥有拒绝", () => {
    const inv = { ...emptyInventory(), fish: 10, owned: ["hat"], outfit: "hat" };
    expect(toggleOutfit(inv, "hat")!.outfit).toBeNull();
    expect(toggleOutfit({ ...inv, outfit: null }, "hat")!.outfit).toBe("hat");
    expect(toggleOutfit(inv, "scarf")).toBeNull();
  });

  test("商品价目完整（装扮 3 + 工具 1）", () => {
    expect(SHOP.map((s) => s.id)).toEqual(["hat", "scarf", "bow", "wand"]);
    expect(SHOP.every((s) => s.price >= 1 && s.price <= 10)).toBe(true);
    expect(DAILY_EARN_CAP).toBeLessThanOrEqual(6);
  });
});
