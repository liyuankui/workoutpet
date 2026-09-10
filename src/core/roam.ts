// 自主漫游调度（F21）——纯函数，时钟/随机可注入
// 语义：在家停一段时间 → 外出玩一趟 → 归期到或提醒临近时召回
// 关键：漫游外出 ≠ 托盘隐藏——猫在外面也惦记着时间，提醒计时不顺延
export const ROAM = {
  homeMinMs: 5 * 60_000,   // 在家最短停留
  homeMaxMs: 25 * 60_000,  // 在家最久停留（之后又想出去）
  outMinMs: 3 * 60_000,    // 外出最短
  outMaxMs: 15 * 60_000,   // 外出最久
  recallLeadMs: 30_000,    // 提醒到期前多久必须召回（给跑回动画留时间）
};

export interface RoamState {
  roaming: boolean;
  /** 下次想外出的时刻（在家时有效） */
  nextRoamAt: number;
  /** 外出归期（在外时有效） */
  backAt: number;
  /** 外出前的窗口位置（回来原地） */
  homeX: number;
  homeY: number;
}

export function createRoam(now: number, rand: () => number = Math.random): RoamState {
  return { roaming: false, nextRoamAt: now + nextHomeStay(rand), backAt: 0, homeX: 0, homeY: 0 };
}

/** 在家停留时长（想出去的间隔） */
export function nextHomeStay(rand: () => number = Math.random): number {
  return ROAM.homeMinMs + rand() * (ROAM.homeMaxMs - ROAM.homeMinMs);
}

/** 外出时长 */
export function nextOutDuration(rand: () => number = Math.random): number {
  return ROAM.outMinMs + rand() * (ROAM.outMaxMs - ROAM.outMinMs);
}

/** 到点该外出吗（在家时问）：idle 停留期满 */
export function wantsRoam(r: RoamState, now: number): boolean {
  return !r.roaming && now >= r.nextRoamAt;
}

/** 在外该回家吗：归期到，或提醒临近（recallLead 提前量，给跑回动画留时间） */
export function shouldRecall(r: RoamState, now: number, remindDueAt: number | null): boolean {
  if (!r.roaming) return false;
  if (now >= r.backAt) return true;
  return remindDueAt !== null && remindDueAt - now <= ROAM.recallLeadMs;
}

/** 提醒临近（提前量内）时在家也不该再出门——出门就得赶回来，不如等下一轮 */
export function tooCloseToRemind(r: RoamState, now: number, remindDueAt: number | null): boolean {
  if (r.roaming || remindDueAt === null) return false;
  return remindDueAt - now <= ROAM.recallLeadMs + ROAM.outMinMs;
}

/** dev/验证：所有时长固定为同一值（毫秒），节奏可控 */
export function applyRoamUniform(ms: number): void {
  ROAM.homeMinMs = ms;
  ROAM.homeMaxMs = ms;
  ROAM.outMinMs = ms;
  ROAM.outMaxMs = ms;
  ROAM.recallLeadMs = ms / 2;
}

/** 性情注入（F32）：漫游区间按性情覆写（模块常量，main 启动/换猫时调用） */
export function applyRoamPersonality(r: { homeMinMs: number; homeMaxMs: number; outMinMs: number; outMaxMs: number }): void {
  ROAM.homeMinMs = r.homeMinMs;
  ROAM.homeMaxMs = r.homeMaxMs;
  ROAM.outMinMs = r.outMinMs;
  ROAM.outMaxMs = r.outMaxMs;
}
