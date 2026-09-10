// 每状态的帧序列：[帧名, 时长ms, x像素偏移, y像素偏移]
// 收进 core 供单测校验（帧名拼错 = drawFrame 运行时崩溃白猫，历史高危）
export type AnimStep = [frame: string, durMs: number, ox: number, oy: number];
export type AnimTable = Record<string, AnimStep[]>;

export const ANIMS: AnimTable = {
  // 跑动（F22 走位）：坐姿↔前爪探出交替=迈步；配合渲染端四拍颠簸与速度线
  walk: [
    ["idleA", 130, 0, 0],
    ["stretchA", 130, 0, 0],
  ],
  idle: [
    ["idleA", 1100, 0, 0],
    ["idleWag", 350, 0, 0],
    ["idleA", 1100, 0, 0],
    ["blink", 140, 0, 0],
  ],
  remind: [
    ["stretchA", 500, 0, 0],
    ["stretchB", 850, 0, 0],
    ["stretchA", 400, 0, 0],
    ["stretchB", 850, 0, 0],
  ],
  // 会话陪练（F25）：猫同步跟做——示范帧循环 + 开心点缀
  session: [
    ["stretchA", 700, 0, 0],
    ["stretchB", 900, 0, 0],
    ["stretchA", 500, 0, 0],
    ["happy", 300, 0, -4],
  ],
  happy: [
    ["happy", 220, 0, 0],
    ["happy", 220, 0, -6], // bounce
  ],
  // 撒娇赖留（P1 复用现有帧）：期待地看着你 + 小幅摇摆的粘人节奏
  cling: [
    ["happy", 900, 0, 0],
    ["idleWag", 350, 0, 0],
    ["happy", 500, 0, -3],
    ["idleA", 600, 0, 0],
  ],
};
