// 部件化 cutout 动画（demo）：猫=头/耳×2/身/爪/尾 小 sprite，代码驱动部件变换
// 字符语义与帧一致（O 主色/L 浅/P 粉/E 眼/W 高光/K 轮廓）——重着色系统天然兼容
export interface Part {
  art: string[];
  /** 相对部件锚点的绘制偏移（格） */
  x: number;
  y: number;
}

export const PARTS = {
  // 左右耳（5×5，内芯粉）
  earL: {
    art: ["..KK.", ".KPPK", ".KPPK", "..KK.", "....."],
    x: 0, y: 0,
  },
  earR: {
    art: [".KK..", "KPPK.", "KPPK.", ".KK..", "....."],
    x: 0, y: 0,
  },
  // 头（16×12）：眼带高光 + 鼻
  head: {
    art: [
      "....KKKKKKKK....",
      "..KKOOOOOOOOKK..",
      ".KOOOOOOOOOOOOK.",
      ".KOEWOOOOOOWEOK.",
      "KOOEOOOOOOOEOOOK",
      "KOOOOOPPPOOOOOOK",
      "KOOOOOOOOOOOOOOK",
      ".KOOOOOOOOOOOOK.",
      ".KOOOOOOOOOOOOK.",
      "..KKOOOOOOOOKK..",
      "....KKKKKKKK....",
      "................",
    ],
    x: 0, y: 0,
  },
  // 身（18×12，浅色胸毛）
  body: {
    art: [
      "..KKKKKKKKKKKKKK..",
      ".KOOOOOOOOOOOOOOK.",
      "KOOOLLLLLOOOOOOOOK",
      "KOOOLLLLLOOOOOOOOK",
      "KOOOLLLLLOOOOOOOOK",
      "KOOOOOOOOOOOOOOOOK",
      "KOOOOOOOOOOOOOOOOK",
      ".KOOOOOOOOOOOOOOK.",
      ".KOOOOOOOOOOOOOOK.",
      "..KOOOOOOOOOOOOK..",
      "..KLLKLLLLLLLKLK..",
      "...KKKKKKKKKKKKK..",
    ],
    x: 0, y: 0,
  },
  // 尾两态（4×7）：左摆/右摆
  tailWag: {
    art: ["K...", "KK..", ".KK.", ".KK.", "..K.", "..K.", "...K"],
    x: 0, y: 0,
  },
  tailUp: {
    art: ["...K", "..KK", ".KK.", ".KK.", ".K..", "K...", "K..."],
    x: 0, y: 0,
  },
  // 前爪（6×3）
  paw: {
    art: ["KLLLK.", "KLLLK.", ".KKK.."],
    x: 0, y: 0,
  },
} as const;

/** 默认坐姿拼装（格坐标，画布 32 宽）：部件相对画布原点 */
export interface Pose {
  head: { x: number; y: number };
  earL: { x: number; y: number };
  earR: { x: number; y: number };
  body: { x: number; y: number };
  tail: { x: number; y: number; wag: boolean };
  pawL: { x: number; y: number };
  pawR: { x: number; y: number };
}

export const SIT_POSE: Pose = {
  head: { x: 8, y: 4 },
  earL: { x: 8, y: 0 },
  earR: { x: 19, y: 0 },
  body: { x: 7, y: 15 },
  tail: { x: 25, y: 16, wag: true },
  pawL: { x: 9, y: 27 },
  pawR: { x: 17, y: 27 },
};
