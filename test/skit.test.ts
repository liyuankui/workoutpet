import { describe, expect, test } from "bun:test";
import { createSkit, pickSkit, wantsSkit, SKIT } from "../src/core/skit";

const r0 = () => 0;
const idle = { petIdle: true, visible: true, walking: false, roaming: false, remindDueAt: null };
const due = (ms: number) => ({ ...idle, remindDueAt: ms });

describe("F27 小剧场调度", () => {
  test("到点想演；提醒临近 90s 内憋住", () => {
    const s = createSkit(0, r0); // nextSkitAt = minGap
    expect(wantsSkit(s, SKIT.minGapMs - 1, idle)).toBe(false);
    expect(wantsSkit(s, SKIT.minGapMs, idle)).toBe(true);
    expect(wantsSkit(s, SKIT.minGapMs, due(SKIT.minGapMs + SKIT.quietBeforeRemindMs))).toBe(true); // 恰 90s：不算「内」
    expect(wantsSkit(s, SKIT.minGapMs, due(SKIT.minGapMs + SKIT.quietBeforeRemindMs - 1))).toBe(false); // 剩 89s：憋
  });

  test("不在家不演（提醒中/走位/漫游/被藏）", () => {
    const s = createSkit(0, r0);
    const t = SKIT.minGapMs;
    expect(wantsSkit(s, t, { ...idle, petIdle: false })).toBe(false);
    expect(wantsSkit(s, t, { ...idle, visible: false })).toBe(false);
    expect(wantsSkit(s, t, { ...idle, walking: true })).toBe(false);
    expect(wantsSkit(s, t, { ...idle, roaming: true })).toBe(false);
  });

  test("剧目：老鼠 70% / 蹦跳 30%", () => {
    expect(pickSkit(() => 0)).toBe("mouse");
    expect(pickSkit(() => 0.99)).toBe("hop");
  });
});
