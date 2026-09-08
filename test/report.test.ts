import { describe, expect, test } from "bun:test";
import { renderReport } from "../src/core/report";
import { loadExercises } from "../src/core/exercises";
import raw from "../src/core/exercises.json";

const ex = loadExercises(raw);

describe("F5 周报（双语）", () => {
  const db = {
    version: 1 as const,
    records: [
      { date: "2026-09-03", exerciseId: "heels-raise", ts: 1 },
      { date: "2026-09-04", exerciseId: "heels-raise", ts: 2 },
      { date: "2026-09-04", exerciseId: "belly-breath", ts: 3 },
    ],
  };

  test("中文周报：含 streak / 分布", () => {
    const md = renderReport(db, ex, Date.UTC(2026, 8, 4, 6), "UTC"); // 2026-09-04 周五
    expect(md).toContain("# 🐱 Micro-pet 周报");
    expect(md).toContain("**2 天**");
    expect(md).toContain("今日打卡：2 次");
    expect(md).toContain("🦶 提踵（桌下） ×2");
    expect(md).toContain("🌬️ 收腹呼吸 ×1");
  });

  test("英文周报（F8）：模板与动作名均切换", () => {
    const md = renderReport(db, ex, Date.UTC(2026, 8, 4, 6), "UTC", "en");
    expect(md).toContain("Weekly Report");
    expect(md).toContain("**2 day(s)**");
    expect(md).toContain("Heel Raises (under desk) ×2");
    expect(md).not.toContain("周报");
  });

  test("空库给引导文案（双语）", () => {
    expect(renderReport({ version: 1, records: [] }, ex, Date.UTC(2026, 8, 4, 6), "UTC")).toContain("还没有打卡");
    expect(renderReport({ version: 1, records: [] }, ex, Date.UTC(2026, 8, 4, 6), "UTC", "en")).toContain("pet the cat");
  });
});

describe("F25 跟做完整率", () => {
  test("本周带 durationSec 的打卡 → 输出完整率；提前结束按实际比例计", () => {
    const db = { version: 1 as const, records: [
      { date: "2026-09-08", exerciseId: "neck-stretch", ts: 1, durationSec: 30 }, // 应做 30
      { date: "2026-09-08", exerciseId: "neck-stretch", ts: 2, durationSec: 15 }, // 15/30
    ] };
    const out = renderReport(db, loadExercises(raw), new Date("2026-09-08T12:00:00").getTime(), "Asia/Shanghai", "zh-CN");
    expect(out).toContain("完整率 75%"); // (30/30 + 15/30)/2
  });

  test("旧记录无 durationSec → 不输出完整率行", () => {
    const db = { version: 1 as const, records: [{ date: "2026-09-08", exerciseId: "neck-stretch", ts: 1 }] };
    const out = renderReport(db, loadExercises(raw), new Date("2026-09-08T12:00:00").getTime(), "Asia/Shanghai", "zh-CN");
    expect(out).not.toContain("完整率");
  });
});
