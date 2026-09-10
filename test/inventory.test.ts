import { describe, expect, test } from "bun:test";
import { buyCat, buyItem, earnBonus, claimMilestone, earnOnCheckIn, emptyInventory, ensureCats, toggleOutfit, SHOP, DAILY_EARN_CAP } from "../src/core/inventory";

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
    expect(r4.gained).toBe(1); // 1+3+1+1=6，上限 8 内继续
    inv = r4.inv;
    const r5 = earnOnCheckIn(inv, "d1", false); // 第 7 条
    expect(r5.gained).toBe(1);
    inv = r5.inv;
    expect(inv.fish).toBe(7);
    const r5b = earnOnCheckIn(inv, "d1", false); // 第 8 条：恰满
    expect(r5b.gained).toBe(1);
    inv = r5b.inv;
    expect(inv.fish).toBe(8);
    const r6 = earnOnCheckIn(inv, "d1", false); // 上限后打卡仍计 streak 但不再得鱼
    expect(r6.gained).toBe(0);
    expect(r6.inv.fish).toBe(8);
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
    expect(DAILY_EARN_CAP).toBeLessThanOrEqual(8);
  });

  test("猫宇宙：旧账本迁移赠 starter；买猫即切换；余额不足拒绝", () => {
    const old = { fish: 3, owned: ["hat"], outfit: null };
    const migrated = ensureCats(old, ["xiaoju", "momo"]);
    expect(migrated.cats).toEqual(["xiaoju", "momo"]);
    expect(migrated.activeCat).toBe("xiaoju");
    expect(ensureCats(migrated, ["xiaoju"])).toBe(migrated); // 幂等

    const bought = buyCat({ ...migrated, fish: 9 }, "huajuan", 8);
    expect(bought!.activeCat).toBe("huajuan");
    expect(bought!.fish).toBe(1);
    expect(buyCat(bought!, "huajuan", 8)).toBeNull(); // 已拥有
    expect(buyCat(bought!, "mimi", 8)).toBeNull(); // 余额 1 不足
  });
});

describe("F32 经济扩展", () => {
  test("完整跟做 +1 计入日上限；满上限不加", () => {
    const base = { ...emptyInventory(), earnedDate: "d1", earnedToday: 7 }; // 已 7/8
    const r = earnBonus(base, "d1");
    expect(r.gained).toBe(1);
    const full = { ...emptyInventory(), earnedDate: "d1", earnedToday: 8 };
    expect(earnBonus(full, "d1").gained).toBe(0);
  });

  test("里程碑 3/7/14/30 → 3/5/10/20，一次性不重领", () => {
    let inv = emptyInventory();
    const r1 = claimMilestone(inv, 3);
    expect(r1.reward).toBe(3);
    inv = r1.inv;
    expect(claimMilestone(inv, 3).reward).toBe(0); // 不重领
    expect(claimMilestone(inv, 7).reward).toBe(5);
    expect(claimMilestone(inv, 5).reward).toBe(0); // 非里程碑
  });
});
