import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** streak 记录——纯本地，容错读（损坏不 crash） */
export interface CheckIn {
  /** 本地日期键 YYYY-MM-DD */
  date: string;
  exerciseId: string;
  ts: number;
}

export interface StreakDB {
  version: 1;
  records: CheckIn[];
}

export const EMPTY_DB: StreakDB = { version: 1, records: [] };

/** 本地日期键（默认系统时区；tz 可注入便于测试） */
export function localDateKey(ts: number, tz?: string): string {
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  if (tz) opts.timeZone = tz;
  // sv-SE locale 恰好输出 YYYY-MM-DD
  return new Intl.DateTimeFormat("sv-SE", opts).format(new Date(ts));
}

export function readDB(path: string): StreakDB {
  if (!existsSync(path)) return { ...EMPTY_DB, records: [] };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      Array.isArray((parsed as StreakDB).records)
    ) {
      return { version: 1, records: (parsed as StreakDB).records };
    }
    throw new Error("shape 不符");
  } catch {
    // 容错读：损坏 → 备份改名，从空库继续（OPS V2：文件损坏不 crash）
    renameSync(path, `${path}.corrupt-${Date.now()}`);
    return { ...EMPTY_DB, records: [] };
  }
}

/** 追加一条打卡，原子写（tmp + rename） */
export function appendCheckIn(path: string, rec: CheckIn): StreakDB {
  const db = readDB(path);
  db.records.push(rec);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.tmp-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, path);
  return db;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function fmtKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 当前 streak：连续「达标日」天数。
 * goalDaily 缺省/≤0 → 当日 ≥1 打卡即达标（v0.1 规则，向后兼容）；
 * 配置后 → 当日打卡 ≥ goalDaily 才算达标日。
 * 今天尚未达标时从昨天起算（streak 不因跨日即断）。
 */
export function currentStreak(records: CheckIn[], todayKey: string, goalDaily?: number): number {
  const perDay = new Map<string, number>();
  for (const r of records) perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
  const met = (key: string) =>
    goalDaily && goalDaily > 0 ? (perDay.get(key) ?? 0) >= goalDaily : perDay.has(key);

  let cursor = parseKey(todayKey);
  if (!met(fmtKey(cursor))) cursor.setDate(cursor.getDate() - 1); // 今天还没达标，从昨天数
  let streak = 0;
  while (met(fmtKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 本周（周一起）打卡统计 */
export function weekReport(records: CheckIn[], todayKey: string) {
  const today = parseKey(todayKey);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const inWeek = records.filter((r) => r.date >= fmtKey(monday) && r.date <= todayKey);
  const perExercise = new Map<string, number>();
  for (const r of inWeek) perExercise.set(r.exerciseId, (perExercise.get(r.exerciseId) ?? 0) + 1);
  return { weekCount: inWeek.length, perExercise, monday: fmtKey(monday) };
}
