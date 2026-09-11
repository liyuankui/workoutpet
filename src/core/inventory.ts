// 小鱼干账本（F26）：打卡获得、达标奖励、日上限防肝；购买/穿戴；纯本地 JSON
export interface Inventory {
  /** 账本 schema 版本（store 层迁移锚点） */
  version?: 1;
  fish: number;
  owned: string[];
  outfit: string | null;
  /** 猫宇宙（F32）：拥有的猫（人设 id）与当前猫 */
  cats?: string[];
  activeCat?: string;
  /** 当日已获取数与日期键（日上限 6 防刷） */
  earnedDate?: string;
  earnedToday?: number;
  /** 达标日奖励每日只发一次 */
  goalBonusDate?: string;
  /** 已领取的 streak 里程碑（3/7/14/30） */
  milestones?: number[];
}

export const DAILY_EARN_CAP = 8; // v0.11 起 6→8（新增完整跟做/抓老鼠渠道）
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

/** 旧账本迁移（F32）：无 cats 字段 → 初始赠送（小橘 + 随机一只） */
export function ensureCats(inv: Inventory, starter: string[]): Inventory {
  if (Array.isArray(inv.cats) && inv.cats.length > 0 && inv.activeCat) return inv;
  return { ...inv, cats: [...starter], activeCat: inv.activeCat ?? starter[0]! };
}

/** 买猫：同价 8🐟，买了即切换为当前猫 */
export function buyCat(inv: Inventory, personaId: string, price: number): Inventory | null {
  if (inv.cats?.includes(personaId) || inv.fish < price) return null;
  return { ...inv, cats: [...(inv.cats ?? []), personaId], activeCat: personaId, fish: inv.fish - price };
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

/** 完整跟做奖励（F32）：+1 计入日上限 */
export function earnBonus(inv: Inventory, todayKey: string): { inv: Inventory; gained: number } {
  let i = { ...inv, owned: [...inv.owned] };
  if (i.earnedDate !== todayKey) { i.earnedDate = todayKey; i.earnedToday = 0; }
  if ((i.earnedToday ?? 0) >= DAILY_EARN_CAP) return { inv: i, gained: 0 };
  i.fish += 1;
  i.earnedToday = (i.earnedToday ?? 0) + 1;
  return { inv: i, gained: 1 };
}

/** streak 里程碑映射（工作日 streak：1/2/3/6 周）——成就一次性，独立于日上限 */
export const MILESTONES: Record<number, number> = { 3: 3, 7: 5, 14: 10, 30: 20 };

export function claimMilestone(inv: Inventory, streak: number): { inv: Inventory; reward: number } {
  const reward = MILESTONES[streak];
  if (!reward || inv.milestones?.includes(streak)) return { inv, reward: 0 };
  return {
    inv: { ...inv, fish: inv.fish + reward, milestones: [...(inv.milestones ?? []), streak] },
    reward,
  };
}
