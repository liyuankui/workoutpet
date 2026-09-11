// 旅行系统（F33）：静默时段的漫游升级——带便当出远门，回来举明信片
// 红线（CAT-UNIVERSE.md）：与运动表现零挂钩；目的地不可指挥；放置无惩罚
export interface Spot {
  id: string;
  name: { "zh-CN": string; en: string };
  /** 景点像素画形状模板：sky/land 主配色 + 形状 id（渲染端按模板程序绘制） */
  sky: string;
  land: string;
  shape: "pagoda" | "bridge" | "towers" | "bamboo" | "wall" | "palace" | "island" | "snow" | "beach" | "desk" | "printer";
  rare?: boolean; // 稀有明信片
  souvenir: { "zh-CN": string; en: string };
}

export const SPOTS: Spot[] = [
  { id: "westlake", name: { "zh-CN": "西湖", en: "West Lake" }, sky: "#ffd9a0", land: "#5a7d6a", shape: "pagoda", souvenir: { "zh-CN": "龙井茶", en: "Longjing tea" } },
  { id: "bund", name: { "zh-CN": "外滩", en: "The Bund" }, sky: "#a8c4d8", land: "#3d4455", shape: "towers", souvenir: { "zh-CN": "大白兔奶糖", en: "White Rabbit candy" } },
  { id: "hongyadong", name: { "zh-CN": "洪崖洞", en: "Hongya Cave" }, sky: "#2e2a45", land: "#e8a34f", shape: "towers", rare: true, souvenir: { "zh-CN": "火锅底料", en: "Hotpot base" } },
  { id: "panda", name: { "zh-CN": "熊猫基地", en: "Panda Base" }, sky: "#cfe3c2", land: "#6a8f5b", shape: "bamboo", souvenir: { "zh-CN": "竹蜻蜓", en: "Bamboo dragonfly" } },
  { id: "greatwall", name: { "zh-CN": "长城", en: "Great Wall" }, sky: "#e8d5b5", land: "#8f7a4f", shape: "wall", souvenir: { "zh-CN": "长城砖模型", en: "Mini brick" } },
  { id: "forbidden", name: { "zh-CN": "故宫", en: "Forbidden City" }, sky: "#d8b98f", land: "#a03e2f", shape: "palace", rare: true, souvenir: { "zh-CN": "宫墙红书签", en: "Palace bookmark" } },
  { id: "gulangyu", name: { "zh-CN": "鼓浪屿", en: "Gulangyu" }, sky: "#bfe0e8", land: "#e0c893", shape: "island", souvenir: { "zh-CN": "风琴音乐盒", en: "Organ music box" } },
  { id: "mohe", name: { "zh-CN": "漠河", en: "Mohe" }, sky: "#c8d8e8", land: "#f0f4f8", shape: "snow", rare: true, souvenir: { "zh-CN": "极光明信片", en: "Aurora postcard" } },
  { id: "sanya", name: { "zh-CN": "三亚", en: "Sanya" }, sky: "#a8d8e8", land: "#f2dfa8", shape: "beach", souvenir: { "zh-CN": "椰子糖", en: "Coconut candy" } },
  { id: "nextdesk", name: { "zh-CN": "隔壁工位", en: "Next Desk" }, sky: "#e8e4dc", land: "#b8b2a8", shape: "desk", souvenir: { "zh-CN": "半包辣条", en: "Half a snack" } },
  { id: "printer", name: { "zh-CN": "打印室", en: "Print Room" }, sky: "#dcdcd8", land: "#9aa0a6", shape: "printer", souvenir: { "zh-CN": "一张空白 A4", en: "A blank A4" } },
];

export const BENTO_PRICE = 2; // 便当：每次旅行自动消耗 2 鱼（经济持续消耗）

export interface TravelState {
  /** 在途景点 id（null=未在旅行） */
  spotId: string | null;
}

/** 选目的地：性情影响——活泼爱远门（稀有权重高）、胆小只去近处（彩蛋景点）、老成偶尔不出远门 */
export function pickSpot(personalityId: string, rand: () => number = Math.random): Spot | null {
  if (personalityId === "calm" && rand() < 0.5) return null; // 老成：半数只普通漫游不出远门
  let pool = SPOTS;
  if (personalityId === "timid") pool = SPOTS.filter((s) => s.id === "nextdesk" || s.id === "printer"); // 胆小：办公室半日游
  else if (personalityId === "playful") {
    const rare = SPOTS.filter((s) => s.rare);
    return rare[Math.floor(rand() * rare.length)]!; // 活泼：专挑远地稀罕景
  }
  return pool[Math.floor(rand() * pool.length)]!;
}

/** 是否出得起远门：便当 2 鱼 */
export function canAffordTravel(fish: number): boolean {
  return fish >= BENTO_PRICE;
}
