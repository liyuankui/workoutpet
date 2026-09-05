import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveExercises } from "../src/core/exercises";
import { initUserExercises, readUserExercisesRaw, userPaths } from "../src/core/userConfig";
import raw from "../src/core/exercises.json";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "micropet-ucfg-"));
});

describe("动作库用户覆盖", () => {
  test("无用户文件 → 回退内置，source=bundled", () => {
    const r = resolveExercises(null, raw);
    expect(r.source).toBe("bundled");
    expect(r.exercises.length).toBeGreaterThanOrEqual(7);
  });

  test("用户库合法 → 覆盖生效，source=user", () => {
    const custom = [{ ...(raw[0] as object) }, ...(raw as unknown[]).slice(1)]; // 同内容即合法
    const r = resolveExercises(custom, raw);
    expect(r.source).toBe("user");
  });

  test("用户库损坏/不合法 → 回退内置且带回错信息（不崩）", () => {
    const r = resolveExercises([{ bad: 1 }], raw);
    expect(r.source).toBe("bundled");
    expect(r.error).toBeTruthy();
  });

  test("JSON 解析失败 → readUserExercisesRaw 返回哨兵", () => {
    writeFileSync(join(dir, "exercises.json"), "{oops");
    const p = userPaths(dir);
    const v = readUserExercisesRaw(p);
    expect((v as any).__parseError).toBe(true);
  });

  test("initUserExercises：生成模板 → 拒绝重复覆盖", () => {
    const p = userPaths(dir);
    const r1 = initUserExercises(p);
    expect(r1.ok).toBe(true);
    const parsed = JSON.parse(readFileSync(p.exercises, "utf8"));
    expect(parsed.length).toBeGreaterThanOrEqual(7); // 模板完整可编辑
    const r2 = initUserExercises(p);
    expect(r2.ok).toBe(false); // 不覆盖用户编辑
  });

  test("userPaths：MICROPET_HOME 优先", () => {
    process.env.MICROPET_HOME = "/tmp/mp-home-x";
    expect(userPaths().home).toBe("/tmp/mp-home-x");
    delete process.env.MICROPET_HOME;
  });
});
