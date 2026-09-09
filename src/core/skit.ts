// 居家小剧场调度（F27）——纯函数，随机可注入
// 剧目：mouse（抓老鼠）| hop（原地蹦跳）；克制红线：每次 ≤10s，提醒临近绝不上演
export const SKIT = {
  minGapMs: 20 * 60_000,  // 两场之间最少间隔（每小时 2-3 场的节奏）
  maxGapMs: 40 * 60_000,
  durationMs: 8_000,      // 单场时长
  quietBeforeRemindMs: 90_000, // 提醒前 90s 内不上演（不抢正戏）
};

export interface SkitState {
  nextSkitAt: number;
}

export function createSkit(now: number, rand: () => number = Math.random): SkitState {
  return { nextSkitAt: now + SKIT.minGapMs + rand() * (SKIT.maxGapMs - SKIT.minGapMs) };
}

/** 该上演了吗：在家、静坐、且离提醒够远（正戏优先，小剧场绝不抢戏） */
export function wantsSkit(
  s: SkitState,
  now: number,
  ctx: { petIdle: boolean; visible: boolean; walking: boolean; roaming: boolean; remindDueAt: number | null },
): boolean {
  if (!ctx.petIdle || !ctx.visible || ctx.walking || ctx.roaming) return false;
  if (now < s.nextSkitAt) return false;
  if (ctx.remindDueAt !== null && ctx.remindDueAt - now < SKIT.quietBeforeRemindMs) {
    return false; // 提醒临近：憋住不演
  }
  return true;
}

/** 随机选剧目（老鼠为主，蹦跳点缀） */
export function pickSkit(rand: () => number = Math.random): "mouse" | "hop" {
  return rand() < 0.7 ? "mouse" : "hop";
}

/** dev/验证：节奏固定化 */
export function applySkitUniform(gapMs: number): void {
  SKIT.minGapMs = gapMs;
  SKIT.maxGapMs = gapMs;
}
