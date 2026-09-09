// 配置审计（F16）：CLI validate-config 与托盘「验证配置」共用
// 返回错误（❌ 行为会静默失效/回退）与警告（⚠️ 容忍但提醒）
import { validateSchedule } from "./schedule";

export interface AuditResult {
  ok: boolean;
  errors: string[];
  warns: string[];
}

export function auditConfig(
  cfg: Record<string, unknown> | undefined,
  allExerciseIds: readonly string[],
): AuditResult {
  const errors: string[] = [];
  const warns: string[] = [];
  const c = cfg ?? {};

  if (c.goalDaily !== undefined) {
    const g = Number(c.goalDaily);
    if (!Number.isFinite(g) || g < 1 || g > 30) errors.push(`goalDaily: 须为 1-30（当前 ${JSON.stringify(c.goalDaily)}）`);
  }
  if (c.intervalMin !== undefined) {
    const iv = Number(c.intervalMin);
    if (!Number.isFinite(iv) || iv < 30 || iv > 120) warns.push(`intervalMin: 建议区间 30-120（当前 ${JSON.stringify(c.intervalMin)}，超界将被钳制）`);
  }
  if (c.schedule !== undefined) {
    const s = validateSchedule(c.schedule);
    if (!s.ok) errors.push(`schedule: ${s.error}（非法时回退 intervalMin 轮转）`);
  }
  if (c.retryMin !== undefined) {
    const r = Number(c.retryMin);
    if (!Number.isFinite(r) || r < 1) warns.push(`retryMin: 须 ≥1 分钟（当前 ${JSON.stringify(c.retryMin)}，非法回默认 8）`);
  }
  if (c.clingAfterSkips !== undefined) {
    const k = Number(c.clingAfterSkips);
    if (!Number.isFinite(k) || k < 0) warns.push(`clingAfterSkips: 须 ≥0（当前 ${JSON.stringify(c.clingAfterSkips)}，非法回默认 3）`);
  }
  if (c.pet !== undefined && c.pet !== "cat" && c.pet !== "bunny") {
    warns.push(`pet: 未知值 ${JSON.stringify(c.pet)}（回退 cat）`);
  }
  if (c.locale !== undefined && c.locale !== "zh-CN" && c.locale !== "en") {
    warns.push(`locale: 须为 zh-CN/en（当前 ${JSON.stringify(c.locale)}，跟随系统）`);
  }
  if (Array.isArray(c.enabledExercises)) {
    const known = new Set(allExerciseIds);
    const unknown = (c.enabledExercises as string[]).filter((id) => !known.has(id));
    if (unknown.length === (c.enabledExercises as string[]).length) errors.push(`enabledExercises: 全部未知（${unknown.join(", ")}）→ 回退全量动作库`);
    else if (unknown.length) warns.push(`enabledExercises 含未知 id: ${unknown.join(", ")}（将被忽略）`);
  }

  return { ok: errors.length === 0, errors, warns };
}
