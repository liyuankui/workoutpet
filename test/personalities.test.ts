import { describe, expect, test } from "bun:test";
import { PERSONALITIES, getPersonality } from "../src/core/personalities";

describe("F32 性情参数包", () => {
  test("四种性情注册；非法回退粘人精", () => {
    expect(PERSONALITIES.map((p) => p.id)).toEqual(["clingy", "playful", "calm", "timid"]);
    expect(getPersonality("nope").id).toBe("clingy");
  });

  test("参数区间合法（home>out 节奏成立、剧场间隔>0、阈值 1-9、bias 0-1）", () => {
    for (const p of PERSONALITIES) {
      const r = p.roam;
      expect(r.homeMinMs).toBeLessThan(r.homeMaxMs);
      expect(r.outMinMs).toBeLessThan(r.outMaxMs);
      expect(r.outMaxMs).toBeLessThanOrEqual(15 * 60_000); // 最野也就野一刻钟（提醒临近照样召回）
      expect(p.skitGapMinMs).toBeGreaterThan(0);
      expect(p.clingAfterSkips).toBeGreaterThanOrEqual(1);
      expect(p.clingAfterSkips).toBeLessThanOrEqual(9);
      expect(p.mouseBias).toBeGreaterThanOrEqual(0);
      expect(p.mouseBias).toBeLessThanOrEqual(1);
    }
  });

  test("性情节奏差异真实存在（粘人懒出门 vs 活泼勤出门）", () => {
    const clingy = getPersonality("clingy");
    const playful = getPersonality("playful");
    expect(playful.roam.homeMinMs).toBeLessThan(clingy.roam.homeMinMs);
    expect(clingy.clingAfterSkips).toBeLessThan(playful.clingAfterSkips);
  });
});
