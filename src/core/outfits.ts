// 装扮贴片（F26）：小字符画叠加层，坐标为 32 网格格位（乘 SCALE 像素渲染，随帧偏移走）
// 红线：纯装饰，无任何功能加成（不做「跳过提醒罐头」类违背顺延哲学的道具）
export interface Outfit {
  art: string[];
  gx: number;
  gy: number;
}

export const OUTFITS: Record<string, Outfit> = {
  // 暖棕小圆帽：帽檐盖耳根（猫耳间/兔耳间都恰容）
  hat: {
    art: [
      "...KKKK...",
      "..KOOOOK..",
      ".KOOOOOOK.",
      ".KOLOOLOK.",
      "KKKKKKKKKK",
    ],
    gx: 11,
    gy: 3,
  },
  // 红围巾：颈部一圈带高光
  scarf: {
    art: [
      ".KRRRRRRRRRK.",
      "KRWRRRRRRRRRK",
      ".KKKKKKKKKKK.",
    ],
    gx: 9,
    gy: 21,
  },
  // 粉蝴蝶结：侧颈小礼结
  bow: {
    art: [
      ".KK.K.",
      "KPWPPK",
      ".KK.K.",
    ],
    gx: 21,
    gy: 18,
  },
};

/** 装扮自有色（K/O/L 复用暖棕系视觉） */
export const OUTFIT_PALETTE: Record<string, string | null> = {
  ".": null,
  K: "#4a3b32",
  O: "#f5c07a",
  L: "#fff1dc",
  R: "#e8604f",
  W: "#ffffff",
  P: "#f7b1c4",
};
