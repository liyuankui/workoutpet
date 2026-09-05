import type { StreakDB } from "./streak";
import { currentStreak, localDateKey, weekReport } from "./streak";
import { localizeExercise, type Exercise } from "./exercises";
import { fmt, strings, isLocale, DEFAULT_LOCALE, type Locale } from "./i18n";

/** F5 周报——markdown 输出，双语（F8） */
export function renderReport(
  db: StreakDB,
  exercises: readonly Exercise[],
  now: number = Date.now(),
  tz?: string,
  locale: string = DEFAULT_LOCALE,
): string {
  const loc: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const t = strings(loc).report;
  const todayKey = localDateKey(now, tz);
  const streak = currentStreak(db.records, todayKey);
  const { weekCount, perExercise, monday } = weekReport(db.records, todayKey);
  const todayCount = db.records.filter((r) => r.date === todayKey).length;
  const byId = new Map(exercises.map((e) => [e.id, e]));

  const dist = [...perExercise.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const ex = byId.get(id);
      return ex ? `- ${localizeExercise(ex, loc).emoji} ${localizeExercise(ex, loc).name} ×${n}` : `- ${id} ×${n}`;
    });

  return [
    fmt(t.title, { monday }),
    "",
    fmt(t.streak, { n: streak }),
    fmt(t.today, { n: todayCount }),
    fmt(t.week, { n: weekCount }),
    "",
    t.dist,
    ...(dist.length > 0 ? dist : [t.empty]),
  ].join("\n");
}
