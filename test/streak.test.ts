import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendCheckIn,
  currentStreak,
  localDateKey,
  readDB,
  weekReport,
  type CheckIn,
} from "../src/core/streak";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "micropet-test-"));
});

describe("F5 streak store", () => {
  test("append → read 往返一致（重启可读）", () => {
    const p = join(dir, "streak.json");
    appendCheckIn(p, { date: "2026-09-04", exerciseId: "heels-raise", ts: 1 });
    appendCheckIn(p, { date: "2026-09-04", exerciseId: "neck-stretch", ts: 2 });
    const db = readDB(p);
    expect(db.records.length).toBe(2);
    expect(db.version).toBe(1);
  });

  test("文件损坏 → 备份改名 + 空库继续（不 crash）", () => {
    const p = join(dir, "streak.json");
    writeFileSync(p, "{corrupted!!!");
    const db = readDB(p);
    expect(db.records).toEqual([]);
    const backups = readdirSync(dir).filter((f) => f.startsWith("streak.json.corrupt-"));
    expect(backups.length).toBe(1);
  });

  test("文件不存在 → 空库", () => {
    expect(readDB(join(dir, "none.json")).records).toEqual([]);
  });

  test("原子写：无 .tmp 残留", () => {
    const p = join(dir, "streak.json");
    appendCheckIn(p, { date: "2026-09-04", exerciseId: "belly-breath", ts: 1 });
    expect(readdirSync(dir).some((f) => f.includes(".tmp-"))).toBe(false);
    expect(JSON.parse(readFileSync(p, "utf8")).records.length).toBe(1);
  });
});

describe("streak 计算（当日 ≥1 打卡记 1 天，连续即 streak）", () => {
  const rec = (date: string, n = 1): CheckIn[] =>
    Array.from({ length: n }, (_, i) => ({ date, exerciseId: "heels-raise", ts: i }));

  test("今天+昨天+前天 = 3 天", () => {
    expect(currentStreak([...rec("2026-09-02"), ...rec("2026-09-03"), ...rec("2026-09-04")], "2026-09-04")).toBe(3);
  });

  test("今天还没打卡：从昨天数，streak 不断", () => {
    expect(currentStreak([...rec("2026-09-03"), ...rec("2026-09-04")], "2026-09-05")).toBe(2);
  });

  test("断档 = 0（昨天与前天均无打卡，无论更早记录多少）", () => {
    expect(currentStreak([...rec("2026-09-01"), ...rec("2026-09-02")], "2026-09-04")).toBe(0);
  });

  test("昨天有、前天无 = 1（streak 昨天截止）", () => {
    expect(currentStreak([...rec("2026-09-01"), ...rec("2026-09-03")], "2026-09-04")).toBe(1);
  });

  test("仅今天 = 1；仅昨天（今天未打）= 1", () => {
    expect(currentStreak(rec("2026-09-04"), "2026-09-04")).toBe(1);
    expect(currentStreak(rec("2026-09-03"), "2026-09-04")).toBe(1);
  });

  test("同日多次打卡仍记 1 天", () => {
    expect(currentStreak(rec("2026-09-04", 5), "2026-09-04")).toBe(1);
  });
});

describe("weekReport（周一起）", () => {
  test("只统计本周（周一-今天）", () => {
    // 2026-09-04 是周五；周一 = 2026-08-31
    const records = [
      ...[1, 2, 3].map(() => ({ date: "2026-09-04", exerciseId: "heels-raise", ts: 1 })),
      { date: "2026-09-02", exerciseId: "neck-stretch", ts: 1 },
      { date: "2026-08-30", exerciseId: "neck-stretch", ts: 1 }, // 上周日，不计
    ];
    const r = weekReport(records, "2026-09-04");
    expect(r.monday).toBe("2026-08-31");
    expect(r.weekCount).toBe(4);
    expect(r.perExercise.get("heels-raise")).toBe(3);
  });
});

describe("localDateKey", () => {
  test("UTC 注入确定性输出", () => {
    expect(localDateKey(Date.UTC(2026, 8, 4, 1, 0), "UTC")).toBe("2026-09-04");
    expect(localDateKey(Date.UTC(2026, 8, 4, 23, 59), "UTC")).toBe("2026-09-04");
  });
  test("跨时区不漂移（UTC 16:00 = 上海 00:00 次日）", () => {
    expect(localDateKey(Date.UTC(2026, 8, 4, 16, 0), "Asia/Shanghai")).toBe("2026-09-05");
  });
});
