import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** streak 记录——纯本地，容错读（损坏不 crash） */
export interface CheckIn {
  /** 本地日期键 YYYY-MM-DD */
  date: string;
  exerciseId: string;
  ts: number;
  /** 实际跟做秒数（F25 会话陪练；旧记录无此字段） */
  durationSec?: number;
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

/** 今日打卡次数（F28 举牌「今日 N/M」） */
export function countToday(records: CheckIn[], todayKey: string): number {
  return records.reduce((n, r) => (r.date === todayKey ? n + 1 : n), 0);
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

/** 举牌种类（F28）：达标 / 有目标进度 / 纯计数——文案组装在各端，决策在此 */
export type SignKind = "met" | "goalN" | "plainN";
export function signboardKind(todayCount: number, goalDaily: number | undefined): SignKind {
  if (goalDaily && goalDaily > 0) return todayCount >= goalDaily ? "met" : "goalN";
  return "plainN";
}

/**
 * 工作日 streak（F32，2026-09-10 Kyle 定调）：
 * - 只计周一~周五打卡（达标日规则同 currentStreak）；周末天然豁免——猫周末在旅行，人休息天理同权
 * - 每月 gracePerMonth 天「猫咪代守」：工作日缺席自动消耗（零操作），休假/出差不断签
 * - 今天尚未达标从上一工作日起算（不因跨日即断）
 */
export interface WorkdayStreak {
  streak: number;
  guarded: number; // 回溯中消耗的代守天数（供 log/展示）
}

export function workdayStreak(
  records: CheckIn[],
  todayKey: string,
  goalDaily: number | undefined,
  gracePerMonth = 2,
): WorkdayStreak {
  const perDay = new Map<string, number>();
  for (const r of records) perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
  const met = (key: string) =>
    goalDaily && goalDaily > 0 ? (perDay.get(key) ?? 0) >= goalDaily : perDay.has(key);

  const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
  let cursor = parseKey(todayKey);

  // 起点：先跳过开头连续缺席（今天没达标不算断；「从未开始」不消耗代守——猫只守进行中的 streak）
  let started = false;
  for (let i = 0; i < 400; i++) {
    if (isWorkday(cursor) && met(fmtKey(cursor))) { started = true; break; }
    cursor.setDate(cursor.getDate() - 1);
  }
  if (!started) return { streak: 0, guarded: 0 };

  // 回到今天或最近达标日，从该工作日起算
  cursor = parseKey(todayKey);
  if (isWorkday(cursor) && !met(fmtKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  let guarded = 0;
  const guardUsed = new Map<string, number>(); // YYYY-MM → 已代守数
  // 最多回溯 400 天（防脏数据死循环）
  for (let i = 0; i < 400; i++) {
    if (!isWorkday(cursor)) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    const key = fmtKey(cursor);
    if (met(key)) {
      streak++;
    } else {
      const month = key.slice(0, 7);
      const used = guardUsed.get(month) ?? 0;
      if (used < gracePerMonth) {
        guardUsed.set(month, used + 1);
        guarded++; // 猫咪代守：这一天它替你看着
      } else {
        break; // 额度尽，streak 到此为止
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak > 0 ? { streak, guarded } : { streak: 0, guarded: 0 }; // 断掉的 streak，代守无意义
}
