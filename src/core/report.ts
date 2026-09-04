import type { StreakDB } from "./streak";
import { currentStreak, localDateKey, weekReport } from "./streak";
import type { Exercise } from "./exercises";

/** F5 周报——默认 markdown 输出（LLM/人双友好） */
export function renderReport(
  db: StreakDB,
  exercises: readonly Exercise[],
  now: number = Date.now(),
  tz?: string,
): string {
  const todayKey = localDateKey(now, tz);
  const streak = currentStreak(db.records, todayKey);
  const { weekCount, perExercise, monday } = weekReport(db.records, todayKey);
  const todayCount = db.records.filter((r) => r.date === todayKey).length;
  const byId = new Map(exercises.map((e) => [e.id, e]));

  const dist = [...perExercise.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const ex = byId.get(id);
      return `- ${ex ? `${ex.emoji} ${ex.name}` : id} ×${n}`;
    });

  return [
    `# 🐱 Micro-pet 周报（${monday} 起）`,
    "",
    `- 当前 streak：**${streak} 天**`,
    `- 今日打卡：${todayCount} 次`,
    `- 本周打卡：${weekCount} 次`,
    "",
    "## 动作分布",
    ...(dist.length > 0 ? dist : ["- （本周还没有打卡，摸摸猫吧）"]),
  ].join("\n");
}
