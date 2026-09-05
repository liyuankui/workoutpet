import { pickRandom } from "./exercises";

/**
 * 点击互动反应池（纯逻辑，渲染端消费）
 * 变奖赏（variable reward）对抗「三天可爱期」
 */
export const REACTIONS = ["wiggle", "jump", "meow", "roll"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** 连点节流间隔（ms）——V2：防连点刷动画 */
export const REACTION_THROTTLE_MS = 500;

/** 是否应播放反应（节流内返回 null） */
export function react(
  lastReactAt: number,
  now: number,
  rand: () => number = Math.random,
): Reaction | null {
  if (now - lastReactAt < REACTION_THROTTLE_MS) return null;
  return pickRandom(REACTIONS, rand);
}
