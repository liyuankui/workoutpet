// 花色系统（F32）：骨架帧（cat.ts 的 O/L/P…字符）× 花色 = 重着色后的猫
// mask 用矩形区集合描述（斑/面具），对全部帧一致地应用——猫不动斑不动
export type Rect = { x1: number; y1: number; x2: number; y2: number };

export interface Coat {
  id: string;
  name: { "zh-CN": string; en: string };
  /** 覆写骨架 palette 的键（O 主色/L 浅色/E 眼/K 轮廓等） */
  palette: Record<string, string | null>;
  /** 斑纹：矩形区内的主色格（O）替换为 spot 色格（字符替换，非调色） */
  spots?: { char: string; areas: Rect[] };
  /** 面具：区域内主色格替换为 mask 色（暹罗脸/耳） */
  mask?: { char: string; areas: Rect[] };
}

const OUTLINE = "#4a3b32"; // 暖深棕轮廓（家族统一）

export const COATS: Coat[] = [
  {
    id: "cream",
    name: { "zh-CN": "奶油橘", en: "Cream" },
    palette: { O: "#f5c07a", L: "#fff1dc", E: "#3a2e28", P: "#f7b1c4", K: OUTLINE },
  },
  {
    id: "void",
    name: { "zh-CN": "玄猫", en: "Void" },
    palette: { O: "#45414b", L: "#5b5663", E: "#f2c14e", P: "#8d8798", K: "#2e2b33" }, // 金眼
  },
  {
    id: "snow",
    name: { "zh-CN": "雪白", en: "Snow" },
    palette: { O: "#f7f5f2", L: "#ffffff", E: "#4a7fb5", P: "#f7c9d4", K: "#c9c4bd" }, // 蓝眼、灰调轮廓保轮廓可见
  },
  {
    id: "cow",
    name: { "zh-CN": "奶牛", en: "Cow" },
    palette: { O: "#f7f5f2", L: "#ffffff", E: "#3a2e28", P: "#f7b1c4", K: OUTLINE },
    spots: { char: "S", areas: [
      { x1: 6, y1: 12, x2: 13, y2: 21 },  // 左背大斑
      { x1: 19, y1: 14, x2: 26, y2: 23 }, // 右背大斑
      { x1: 13, y1: 8, x2: 18, y2: 12 },  // 头顶斑
    ] },
  },
  {
    id: "calico",
    name: { "zh-CN": "三花", en: "Calico" },
    palette: { O: "#f5c07a", L: "#fff1dc", E: "#3a2e28", P: "#f7b1c4", K: OUTLINE },
    spots: { char: "S", areas: [
      { x1: 8, y1: 12, x2: 12, y2: 18 },
      { x1: 20, y1: 13, x2: 25, y2: 20 },
      { x1: 14, y1: 8, x2: 17, y2: 11 },
    ] },
  },
  {
    id: "blue",
    name: { "zh-CN": "蓝灰", en: "Blue" },
    palette: { O: "#8f9aa8", L: "#c3ccd6", E: "#c77b3a", P: "#d9a8b8", K: OUTLINE }, // 铜橙眼
  },
  {
    id: "siamese",
    name: { "zh-CN": "暹罗", en: "Siamese" },
    palette: { O: "#e8d5b5", L: "#f6ecd9", E: "#4a7fb5", P: "#f7b1c4", K: OUTLINE }, // 宝石蓝眼
    mask: { char: "D", areas: [
      { x1: 10, y1: 8, x2: 21, y2: 16 },  // 脸
      { x1: 4, y1: 8, x2: 27, y2: 12 },   // 耳
    ] },
  },
];

export const SPOT_COLORS: Record<string, string> = { S: "#3d3a3f", D: "#5a4636" }; // 斑=近黑；面具=深棕

export function getCoat(id: unknown): Coat {
  return COATS.find((c) => c.id === id) ?? COATS[0]!;
}

/** 重着色一帧：在矩阵上落斑/面具（只盖主色格 O）；palette 替换发生在渲染层查表 */
export function recolorFrame(frame: readonly string[], coat: Coat): string[] {
  const grid = frame.map((r) => [...r]);
  const apply = (areas: Rect[], char: string) => {
    for (const a of areas) {
      for (let y = a.y1; y <= a.y2; y++) {
        for (let x = a.x1; x <= a.x2; x++) {
          if (grid[y]?.[x] === "O") grid[y]![x] = char;
        }
      }
    }
  };
  if (coat.spots) apply(coat.spots.areas, coat.spots.char);
  if (coat.mask) apply(coat.mask.areas, coat.mask.char);
  return grid.map((r) => r.join(""));
}
