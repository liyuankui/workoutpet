/**
 * 像素猫 16×16 sprite——美术零投入，字符画即资产。
 * 帧校验由 test/pixelcat.test.ts 保证（16 行 × 16 字符 × 已知色板）。
 */
export const PALETTE: Record<string, string | null> = {
  ".": null, // 透明
  K: "#2f2a26", // 轮廓
  O: "#f2a65a", // 橘猫主色
  L: "#ffd9a3", // 浅色（胸/爪）
  P: "#f78fb3", // 内耳/鼻
  E: "#2f2a26", // 眼
  R: "#ff5d73", // 爱心
};

export const GRID = 16;

/** 静坐（尾下） */
const IDLE_A = [
  "................",
  "...KK....KK.....",
  "..KPPK..KPPK....",
  "..KOOOOOOOOOOK..",
  "..KOOEOOOOEOOK..",
  "..KOOOOPPOOOOK..",
  "..KOOOOOOOOOOK..",
  ".KKOOOOOOOOOOK..",
  ".KOOOLLLLOOOOK..",
  ".KOOOLLLLOOOOK..",
  ".KOOOOOOOOOOOK.K",
  ".KOOOOOOOOOOOK..",
  ".KLLKLLLLLLKLLK.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
];

/** 静坐（尾上摆） */
const IDLE_WAG = [
  "................",
  "...KK....KK.....",
  "..KPPK..KPPK....",
  "..KOOOOOOOOOOK..",
  "..KOOEOOOOEOOK..",
  "..KOOOOPPOOOOK..",
  "..KOOOOOOOOOOK..",
  ".KKOOOOOOOOOOK..",
  ".KOOOLLLLOOOOK.K",
  ".KOOOLLLLOOOOK..",
  ".KOOOOOOOOOOOK..",
  ".KOOOOOOOOOOOK..",
  ".KLLKLLLLLLKLLK.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
];

/** 眨眼 */
const BLINK = [
  "................",
  "...KK....KK.....",
  "..KPPK..KPPK....",
  "..KOOOOOOOOOOK..",
  "..KOOKOOOOKOOK..",
  "..KOOOOPPOOOOK..",
  "..KOOOOOOOOOOK..",
  ".KKOOOOOOOOOOK..",
  ".KOOOLLLLOOOOK..",
  ".KOOOLLLLOOOOK..",
  ".KOOOOOOOOOOOK.K",
  ".KOOOOOOOOOOOK..",
  ".KLLKLLLLLLKLLK.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
];

/** 伸展·蓄力（伏低，闭眼） */
const STRETCH_A = [
  "................",
  "................",
  "...KK....KK.....",
  "..KPPK..KPPK....",
  "..KOOOOOOOOOOK..",
  "..KOOKOOOOKOOK..",
  "..KOOOOPPOOOOK..",
  "..KOOOOOOOOOOKK.",
  ".KKOOOOOOOOOOK..",
  ".KOOOLLLLOOOOK..",
  ".KOOOOOOOOOOOK..",
  ".KOOOOOOOOOOOK..",
  ".LLLLKLLLLKLLLL.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
];

/** 伸展·拉满（撅臀，前爪探出） */
const STRETCH_B = [
  "................",
  "................",
  "...KK....KK.....",
  "..KPPK..KPPK....",
  "..KOOOOOOOOOOK..",
  "..KOOEOOOOEOOK..",
  "..KOOOOPPOOOOKK.",
  "..KOOOOOOOOOOK.K",
  ".KKOOOOOOOOOOK..",
  ".KOOLLLLOOOOOK..",
  ".KOOLLLLOOOOOK..",
  ".KOOOOOOOOOOOK..",
  "LLLLLKLLLLKLLLLL",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
];

/** 打滚（侧躺，反应池） */
const ROLL = [
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....KK.........",
  "....KPPK...K....",
  "...KOOOOK..OK...",
  "..KOOEOOKKOOK...",
  "..KOOOOPPOOOKK..",
  ".KOOOOOOOOOOOK..",
  ".KLLLLLLLLLLKK..",
  "..KKKKKKKKKKK...",
  "................",
  "................",
  "................",
];

/** 开心（头顶爱心，bounce 由渲染器 y 偏移实现） */
const HAPPY_A = [
  "...........RR...",
  "...KK....KK.RR..",
  "..KPPK..KPPK....",
  "..KOOOOOOOOOOK..",
  "..KOOEOOOOEOOK..",
  "..KOOOOPPOOOOK..",
  "..KOOOOOOOOOOK..",
  ".KKOOOOOOOOOOK..",
  ".KOOOLLLLOOOOK..",
  ".KOOOLLLLOOOOK..",
  ".KOOOOOOOOOOOK.K",
  ".KOOOOOOOOOOOK..",
  ".KLLKLLLLLLKLLK.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
];

export const FRAMES = {
  idleA: IDLE_A,
  idleWag: IDLE_WAG,
  blink: BLINK,
  stretchA: STRETCH_A,
  stretchB: STRETCH_B,
  happy: HAPPY_A,
  roll: ROLL,
} as const;

export type FrameName = keyof typeof FRAMES;

/** 帧 → RGBA buffer（Tray 图标用） */
export function frameToRGBA(frame: readonly string[]): Uint8Array {
  const buf = new Uint8Array(GRID * GRID * 4);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const ch = frame[y]![x]!;
      const hex = PALETTE[ch];
      const i = (y * GRID + x) * 4;
      if (!hex) {
        buf[i + 3] = 0;
        continue;
      }
      buf[i] = parseInt(hex.slice(1, 3), 16);
      buf[i + 1] = parseInt(hex.slice(3, 5), 16);
      buf[i + 2] = parseInt(hex.slice(5, 7), 16);
      buf[i + 3] = 255;
    }
  }
  return buf;
}
