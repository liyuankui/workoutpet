// 会话陪练展示计算（F25）
/** 当前应展示的步骤下标：按 durationSec 均分；空步骤 0；超时钳末位 */
export function currentStepIndex(stepsLen: number, durationSec: number, elapsedSec: number): number {
  if (stepsLen <= 0) return 0;
  if (durationSec <= 0) return 0;
  const idx = Math.floor(elapsedSec / (durationSec / stepsLen));
  return Math.min(stepsLen - 1, Math.max(0, idx));
}
