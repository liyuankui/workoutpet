// 行为配置解析（F23/F24/F25 的 config 边界——用户可编辑 JSON，解析错=行为静默失效）
export function parseRetryMs(cfg: { retryMin?: number } | undefined, fallbackMs = 8 * 60_000): number {
  const v = Number(cfg?.retryMin);
  if (!Number.isFinite(v) || v <= 0) return fallbackMs; // 缺省/非法/非正 → 8 分钟
  return Math.max(1, v) * 60_000;
}

export function parseClingAfterSkips(cfg: { clingAfterSkips?: number } | undefined, fallback = 3): number {
  if (cfg?.clingAfterSkips === undefined) return fallback;    // 缺省 3
  const v = Number(cfg.clingAfterSkips);
  if (!Number.isFinite(v)) return fallback;                    // 非法回默认
  return Math.max(0, Math.floor(v));                          // 显式 0 = 关闭撒娇
}
