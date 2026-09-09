import { describe, expect, test } from "bun:test";
import { auditConfig } from "../src/core/configAudit";

const ids = ["neck-stretch", "chair-squat"];

describe("F16 配置审计（托盘/CLI 共用）", () => {
  test("空配置/合法配置 → ok", () => {
    expect(auditConfig(undefined, ids).ok).toBe(true);
    expect(auditConfig({ goalDaily: 4, intervalMin: 75, pet: "bunny" }, ids).ok).toBe(true);
  });

  test("错误：goalDaily 越界、schedule 非法、enabledExercises 全未知", () => {
    const r = auditConfig({ goalDaily: 99, schedule: { windows: [{ from: "22:00", to: "06:00", intervalMin: 60 }] }, enabledExercises: ["ghost"] }, ids);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith("goalDaily"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("schedule"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("enabledExercises"))).toBe(true);
  });

  test("警告：intervalMin 越界、未知 pet、部分未知 enabledExercises（可运行）", () => {
    const r = auditConfig({ intervalMin: 10, pet: "dog", enabledExercises: ["neck-stretch", "x"] }, ids);
    expect(r.ok).toBe(true); // 只是警告
    expect(r.warns.length).toBeGreaterThanOrEqual(3);
  });
});
