import { describe, expect, test } from "bun:test";
import { renderReport } from "../src/core/report";
import { loadExercises } from "../src/core/exercises";
import raw from "../src/core/exercises.json";

const ex = loadExercises(raw);

describe("F5 周报", () => {
  test("含 streak / 本周 / 分布", () => {
    const db = {
      version: 1 as const,
      records: [
        { date: "2026-09-03", exerciseId: "heels-raise", ts: 1 },
        { date: "2026-09-04", exerciseId: "heels-raise", ts: 2 },
        { date: "2026-09-04", exerciseId: "belly-breath", ts: 3 },
      ],
    };
    const md = renderReport(db, ex, Date.UTC(2026, 8, 4, 6), "UTC"); // 2026-09-04 周五
    expect(md).toContain("# 🐱 Micro-pet 周报");
    expect(md).toContain("**2 天**"); // 9-03 + 9-04
    expect(md).toContain("今日打卡：2 次");
    expect(md).toContain("🦶 提踵（桌下） ×2");
    expect(md).toContain("🌬️ 收腹呼吸 ×1");
  });

  test("空库给引导文案", () => {
    const md = renderReport({ version: 1, records: [] }, ex, Date.UTC(2026, 8, 4, 6), "UTC");
    expect(md).toContain("还没有打卡");
  });
});
