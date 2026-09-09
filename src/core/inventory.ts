// 小鱼干账本（F26）：打卡获得、达标奖励、日上限防肝；购买/穿戴；纯本地 JSON
export interface Inventory {
  fish: number;
  owned: string[];
  outfit: string | null;
  /** 当日已获取数与日期键（日上限 6 防刷） */
  earnedDate?: string;
  earnedToday?: number;
  /** 达标日奖励每日只发一次 */
  goalBonusDate?: string;
}

export const DAILY_EARN_CAP = 6;
export const GOAL_BONUS = 2;

export interface ShopItem {
  id: string;
  price: number;
  kind: "outfit" | "tool";
}

export const SHOP: ShopItem[] = [
  { id: "hat", price: 6, kind: "outfit" },
  { id: "scarf", price: 5, kind: "outfit" },
  { id: "bow", price: 4, kind: "outfit" },
  { id: "wand", price: 3, kind: "tool" }, // 逗猫棒：耐用品，买了随便用
];

export function emptyInventory(): Inventory {
  return { fish: 0, owned: [], outfit: null };
}

/** 打卡得 1 鱼；当日达标（goalMet）再 +2（每日一次）；日上限 6 —— 防刷防肝，收集无焦虑 */
export function earnOnCheckIn(
  inv: Inventory,
  todayKey: string,
  goalMet: boolean,
): { inv: Inventory; gained: number } {
  let i = { ...inv, owned: [...inv.owned] };
  if (i.earnedDate !== todayKey) { i.earnedDate = todayKey; i.earnedToday = 0; }
  const capLeft = DAILY_EARN_CAP - (i.earnedToday ?? 0);
  let gained = 0;
  if (capLeft > 0) { i.fish += 1; i.earnedToday! += 1; gained += 1; }
  if (goalMet && i.goalBonusDate !== todayKey && capLeft - gained > 0) {
    i.fish += GOAL_BONUS; i.earnedToday! += GOAL_BONUS; gained += GOAL_BONUS; i.goalBonusDate = todayKey;
  } else if (goalMet && i.goalBonusDate !== todayKey) {
    i.goalBonusDate = todayKey; // 上限已满也标记，次日不再补发
  }
  return { inv: i, gained };
}

/** 购买：余额不足/已拥有/未知商品 → null */
export function buyItem(inv: Inventory, itemId: string): Inventory | null {
  const item = SHOP.find((s) => s.id === itemId);
  if (!item || inv.owned.includes(itemId) || inv.fish < item.price) return null;
  const i = { ...inv, owned: [...inv.owned, itemId], fish: inv.fish - item.price };
  if (item.kind === "outfit" && !i.outfit) i.outfit = itemId; // 买来就穿上
  return i;
}

/** 穿戴切换：未拥有 → null；重复点击脱下 */
export function toggleOutfit(inv: Inventory, itemId: string): Inventory | null {
  if (!inv.owned.includes(itemId)) return null;
  return { ...inv, outfit: inv.outfit === itemId ? null : itemId };
}
