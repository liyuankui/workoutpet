import { describe, expect, test } from "bun:test";
import { createRoam, nextHomeStay, nextOutDuration, shouldRecall, tooCloseToRemind, wantsRoam, ROAM } from "../src/core/roam";

describe("F21 漫游调度", () => {
  const r0 = () => 0; // 恒 0 随机 → 全取最小值

  test("在家停留/外出时长都在区间内", () => {
    expect(nextHomeStay(r0)).toBe(ROAM.homeMinMs);
    expect(nextHomeStay(() => 1)).toBe(ROAM.homeMaxMs);
    expect(nextOutDuration(r0)).toBe(ROAM.outMinMs);
    expect(nextOutDuration(() => 1)).toBe(ROAM.outMaxMs);
  });

  test("停留期满想外出；未满不想", () => {
    const r = createRoam(1000, r0);
    expect(wantsRoam(r, 1000 + ROAM.homeMinMs - 1)).toBe(false);
    expect(wantsRoam(r, 1000 + ROAM.homeMinMs)).toBe(true);
    expect(wantsRoam(r, 999_999)).toBe(true);
  });

  test("归期到 → 召回；提醒临近 30s 内 → 召回（给跑回动画留时间）", () => {
    const r = { ...createRoam(0, r0), roaming: true, backAt: 10_000 };
    expect(shouldRecall(r, 9_999, null)).toBe(false);
    expect(shouldRecall(r, 10_000, null)).toBe(true);            // 归期到
    expect(shouldRecall({ ...r, backAt: 999_999 }, 1000, 60_000)).toBe(false); // 距提醒还久
    expect(shouldRecall({ ...r, backAt: 999_999 }, 1000, 1000 + ROAM.recallLeadMs)).toBe(true); // 临近
    expect(shouldRecall({ ...r, roaming: false }, 999_999, 0)).toBe(false);    // 不在外不召回
  });

  test("在外不问 wantsRoam（漫游与召回职责分离）", () => {
    const r = { ...createRoam(0, r0), roaming: true };
    expect(wantsRoam(r, 999_999)).toBe(false);
  });

  test("提醒临近（lead+outMin 内）在家也不该再出门", () => {
    const r = createRoam(0, r0);
    const due = 100_000;
    // due - 0 = 100s > 30+180s? recallLead=30s outMin=180s → 阈值 210s → 100s < 210s → 临近
    expect(tooCloseToRemind(r, 0, due)).toBe(true);
    expect(tooCloseToRemind(r, 0, 1_000_000)).toBe(false); // 提醒还远，可以出去
    expect(tooCloseToRemind({ ...r, roaming: true }, 0, due)).toBe(false); // 已在外不适用
    expect(tooCloseToRemind(r, 0, null)).toBe(false);
  });
});
