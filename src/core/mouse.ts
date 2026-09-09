// 小老鼠 sprite（F27 小剧场配角）：12×6 两帧跑动（腿交替 + 尾巴甩）
// 独立小色板；帧校验见 test/mouse.test.ts
export const MOUSE_PALETTE: Record<string, string | null> = {
  ".": null,
  K: "#4a3b32", // 轮廓（与宠物同源暖深棕）
  G: "#9aa0a6", // 灰身
  D: "#5f6368", // 深灰（腿/背）
  P: "#f7b1c4", // 耳内粉
  E: "#2c2a29", // 眼
};

export const MOUSE_W = 12;
export const MOUSE_H = 6;

/** 帧1：四腿奔跑（前伸后蹬；尾三连折线连贯） */
export const MOUSE_A = [
  "K........K..",
  ".KK....KGK..",
  "KGGKPKKGEGK.",
  ".KGGGGGGGGK.",
  "..KDKDKD.K..",
  "............",
];

/** 帧2：收腿（腾空相；尾梢回落） */
export const MOUSE_B = [
  ".K.......K..",
  ".KK....KGK..",
  "KGGKPKKGEGK.",
  ".KGGGGGGGGK.",
  "...KDDK.....",
  "............",
];

export const MOUSE_FRAMES: Record<string, string[]> = { mouseA: MOUSE_A, mouseB: MOUSE_B };
