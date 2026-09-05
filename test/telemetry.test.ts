import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { telemetryEnabled, readOrCreateUid, buildPayload } from "../src/core/telemetry";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "mp-tel-")); });

describe("F18 遥测 opt-out", () => {
  test("默认开；telemetry:false 关", () => {
    expect(telemetryEnabled(undefined)).toBe(true);
    expect(telemetryEnabled({})).toBe(true);
    expect(telemetryEnabled({ telemetry: false })).toBe(false);
    expect(telemetryEnabled({ telemetry: true })).toBe(true);
  });

  test("uid 创建后稳定（重启不变）", () => {
    const a = readOrCreateUid(dir);
    expect(a).toMatch(/^[0-9a-f-]{8}$/);
    expect(readOrCreateUid(dir)).toBe(a); // 二次读同值
  });

  test("深层路径自动创建，不抛异常", () => {
    const uid = readOrCreateUid(join(dir, "deep", "sub"));
    expect(typeof uid).toBe("string");
    expect(uid.length).toBeGreaterThan(0);
  });

  test("payload 契约：project/surface/distinct_id/version 齐备", () => {
    const p = buildPayload("check_in", { exercise: "heels-raise" }, "abcd1234", "0.5.0");
    expect(p.api_key).toBeTruthy();
    expect(p.event).toBe("check_in");
    expect(p.properties.project).toBe("micro-pet");
    expect(p.properties.surface).toBe("app");
    expect(p.properties.distinct_id).toBe("abcd1234");
    expect(p.properties.version).toBe("0.5.0");
    expect(p.properties.exercise).toBe("heels-raise");
  });
});
