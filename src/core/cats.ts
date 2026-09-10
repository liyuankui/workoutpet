// 人设注册表（F32）：花色 × 性情 × 名字 × 背景小传——开箱即用的六只猫
import type { Coat } from "./coats";
import type { Personality } from "./personalities";

export interface CatPersona {
  id: string;
  name: { "zh-CN": string; en: string };
  coatId: string;
  personalityId: string;
  backstory: { "zh-CN": string; en: string };
}

export const CAT_PRICE = 8; // 每只同价（反稀有度炒作）

export const CAT_PERSONAS: CatPersona[] = [
  {
    id: "xiaoju",
    name: { "zh-CN": "小橘", en: "Xiaoju" },
    coatId: "cream", personalityId: "clingy",
    backstory: {
      "zh-CN": "菜市场纸箱里捡的，那天它跟着你走了三条街",
      en: "Rescued from a market cardboard box — it followed you for three blocks that day",
    },
  },
  {
    id: "xueqiu",
    name: { "zh-CN": "雪球", en: "Snowball" },
    coatId: "snow", personalityId: "timid",
    backstory: {
      "zh-CN": "雨夜躲在便利店屋檐下，你买了伞它就跟你回了家",
      en: "Sheltered under a convenience-store eave one rainy night; you bought an umbrella, it followed you home",
    },
  },
  {
    id: "momo",
    name: { "zh-CN": "墨墨", en: "Momo" },
    coatId: "void", personalityId: "calm",
    backstory: {
      "zh-CN": "旧书店门口镇店的，店主搬走时托付给你",
      en: "The old bookshop's doorkeeper, entrusted to you when the owner moved away",
    },
  },
  {
    id: "huajuan",
    name: { "zh-CN": "花卷", en: "Huajuan" },
    coatId: "calico", personalityId: "playful",
    backstory: {
      "zh-CN": "同事家猫生的独苗，抱回来那天打翻了你的咖啡",
      en: "The only kitten of a colleague's cat; it knocked over your coffee on day one",
    },
  },
  {
    id: "lange",
    name: { "zh-CN": "蓝哥", en: "Blue" },
    coatId: "blue", personalityId: "calm",
    backstory: {
      "zh-CN": "朋友出国前的「暂时寄养」，已经暂时了两年",
      en: "A friend's 'temporary foster' before going abroad — two years and counting",
    },
  },
  {
    id: "niangao",
    name: { "zh-CN": "年糕", en: "Niangao" },
    coatId: "cow", personalityId: "timid",
    backstory: {
      "zh-CN": "公司楼下超市的看店猫，盘踞收银台三年，跟你下班顺路",
      en: "The corner supermarket's checkout cat for three years; it walks part of your commute",
    },
  },
  {
    id: "mimi",
    name: { "zh-CN": "咪咪", en: "Mimi" },
    coatId: "siamese", personalityId: "clingy",
    backstory: {
      "zh-CN": "写字楼消防通道的常客，蹭了三个月饭终于跟你走了",
      en: "A fire-exit regular at the office; after three months of handouts it finally came with you",
    },
  },
];

export function getPersona(id: unknown): CatPersona {
  return CAT_PERSONAS.find((c) => c.id === id) ?? CAT_PERSONAS[0]!;
}

/** 初始猫：小橘 + 六分之一随机（惊喜） */
export function starterCats(rand: () => number = Math.random): string[] {
  const extra = CAT_PERSONAS.filter((c) => c.id !== "xiaoju");
  return ["xiaoju", extra[Math.floor(rand() * extra.length)]!.id];
}

/** 供注册表校验：coats/personalities 引用完整性 */
export function validateRefs(coats: Coat[], personalities: Personality[]): string[] {
  const problems: string[] = [];
  for (const c of CAT_PERSONAS) {
    if (!coats.some((x) => x.id === c.coatId)) problems.push(`${c.id}: 未知花色 ${c.coatId}`);
    if (!personalities.some((x) => x.id === c.personalityId)) problems.push(`${c.id}: 未知性情 ${c.personalityId}`);
  }
  return problems;
}
