// 性情参数包（F32）：只调已有行为区间与文案池，零新机制；提醒语义（顺延/打卡/会话）人人平等
export interface Personality {
  id: string;
  name: { "zh-CN": string; en: string };
  roam: { homeMinMs: number; homeMaxMs: number; outMinMs: number; outMaxMs: number };
  skitGapMinMs: number;
  skitGapMaxMs: number;
  /** 撒娇阈值（覆盖 config clingAfterSkips） */
  clingAfterSkips: number;
  /** 小剧场剧目偏好：抽中 mouse 的概率 */
  mouseBias: number;
  /** 文案池：meow / cling 各选一组 key（locales bubble.meowPools / clingPools） */
  pool: "clingy" | "playful" | "calm" | "timid";
}

const MIN = 60_000;

export const PERSONALITIES: Personality[] = [
  {
    id: "clingy",
    name: { "zh-CN": "粘人精", en: "Clingy" },
    roam: { homeMinMs: 20 * MIN, homeMaxMs: 40 * MIN, outMinMs: 2 * MIN, outMaxMs: 5 * MIN },
    skitGapMinMs: 30 * MIN, skitGapMaxMs: 50 * MIN,
    clingAfterSkips: 2,
    mouseBias: 0.3, // 多 hop 求关注
    pool: "clingy",
  },
  {
    id: "playful",
    name: { "zh-CN": "活泼好动", en: "Playful" },
    roam: { homeMinMs: 3 * MIN, homeMaxMs: 10 * MIN, outMinMs: 8 * MIN, outMaxMs: 15 * MIN },
    skitGapMinMs: 10 * MIN, skitGapMaxMs: 20 * MIN,
    clingAfterSkips: 5,
    mouseBias: 0.85, // 追得起劲
    pool: "playful",
  },
  {
    id: "calm",
    name: { "zh-CN": "老成持重", en: "Calm" },
    roam: { homeMinMs: 25 * MIN, homeMaxMs: 50 * MIN, outMinMs: 3 * MIN, outMaxMs: 10 * MIN },
    skitGapMinMs: 20 * MIN, skitGapMaxMs: 40 * MIN,
    clingAfterSkips: 4,
    mouseBias: 0.5,
    pool: "calm",
  },
  {
    id: "timid",
    name: { "zh-CN": "胆小谨慎", en: "Timid" },
    roam: { homeMinMs: 15 * MIN, homeMaxMs: 35 * MIN, outMinMs: 1 * MIN, outMaxMs: 3 * MIN }, // 出去速回
    skitGapMinMs: 30 * MIN, skitGapMaxMs: 60 * MIN,
    clingAfterSkips: 2,
    mouseBias: 0.2, // 怕老鼠
    pool: "timid",
  },
];

export function getPersonality(id: unknown): Personality {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0]!;
}
