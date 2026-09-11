import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendCheckIn,
  countToday,
  currentStreak,
  localDateKey,
  readDB,
  weekReport,
  workdayStreak,
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

  test("v0.4.0 goalDaily：达标日制——未达标日不记", () => {
    expect(currentStreak(rec("2026-09-04", 3), "2026-09-04", 4)).toBe(0);      // 3<4 未达标
    expect(currentStreak(rec("2026-09-04", 4), "2026-09-04", 4)).toBe(1);      // 4>=4 达标
    // 昨天 6 次达标、今天 2 次未达标 → 从昨天数 streak=1
    expect(
      currentStreak([...rec("2026-09-03", 6), ...rec("2026-09-04", 2)], "2026-09-04", 5),
    ).toBe(1);
    // 连续两日达标
    expect(
      currentStreak([...rec("2026-09-03", 5), ...rec("2026-09-04", 5)], "2026-09-04", 5),
    ).toBe(2);
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

describe("F28 countToday（举牌数据源）", () => {
  test("只数当日；空库为 0", () => {
    const rs = [
      { date: "2026-09-07", exerciseId: "neck-stretch", ts: 1 },
      { date: "2026-09-08", exerciseId: "neck-stretch", ts: 2 },
      { date: "2026-09-08", exerciseId: "belly-breath", ts: 3 },
    ];
    expect(countToday(rs, "2026-09-08")).toBe(2);
    expect(countToday(rs, "2026-09-09")).toBe(0);
    expect(countToday([], "2026-09-08")).toBe(0);
  });
});

describe("F32 工作日 streak（周末豁免 + 猫咪代守）", () => {
  const goal = 1; // 每日 1 次即达标
  const d = (s: string) => s; // YYYY-MM-DD 键
  test("纯连续工作日（周一~五达标）→ 5；周末天然跳过不断", () => {
    // 2026-09-07 是周一；07-11 工作日全达标，09-12/13 周末，09-14 周一也达标 → streak 应含周末后
    const rs = ["2026-09-07","2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-14"].map((date) => ({ date, exerciseId: "x", ts: 1 }));
    const r = workdayStreak(rs, "2026-09-14", goal);
    expect(r.streak).toBe(6); // 周末不计数不断
    expect(r.guarded).toBe(0); // 审计 L3 后：回溯止于首次打卡日（09-07），09-03/04 不再消耗代守
  });

  test("工作日缺席消耗代守（月度 2 天）；额度尽则断", () => {
    // 09-07..11 达标，09-14 缺（代守1），09-15 缺（代守2），09-16 缺 → 断
    const rs = ["2026-09-07","2026-09-08","2026-09-09","2026-09-10","2026-09-11"].map((date) => ({ date, exerciseId: "x", ts: 1 }));
    const r = workdayStreak(rs, "2026-09-16", goal);
    expect(r.streak).toBe(5);
    expect(r.guarded).toBe(2);
  });

  test("跨月代守额度独立刷新", () => {
    // 8 月末用了 2 天代守（08-31 缺、08-28 缺），9 月又有 2 天
    const rs = ["2026-08-26","2026-08-27","2026-09-01","2026-09-02"].map((date) => ({ date, exerciseId: "x", ts: 1 }));
    const r = workdayStreak(rs, "2026-09-04", goal);
    // 洞：09-03（9月守1）、08-31 与 08-28（8月守2）= 3；今天 09-04 未达标免费豁免不算洞
    expect(r.guarded).toBe(3);
    expect(r.streak).toBe(4); // 09-01/02 + 08-26/27
  });

  test("今天未达标不断（从上一工作日起算）", () => {
    const rs = [{ date: "2026-09-11", exerciseId: "x", ts: 1 }];
    const r = workdayStreak(rs, "2026-09-14", goal); // 周一还没做
    expect(r.streak).toBe(1);
  });

  test("空记录 / 近期从未打卡 → streak 0 且不消耗代守（猫不守不存在的 streak）", () => {
    expect(workdayStreak([], "2026-09-14", goal)).toEqual({ streak: 0, guarded: 0 });
    const rs = [{ date: "2026-08-03", exerciseId: "x", ts: 1 }]; // 只在 6 周前打过一次
    const r = workdayStreak(rs, "2026-09-14", goal);
    expect(r.streak).toBe(0); // 中间洞太多，代守额度守不住
    expect(r.guarded).toBe(0); // 断掉的 streak 代守归零
  });
});
