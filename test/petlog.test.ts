import { describe, expect, test } from "bun:test";
import { appendPetLog } from "../src/core/petlog";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("F20 提醒日志", () => {
  test("追加写入并带换行", () => {
    const dir = mkdtempSync(join(tmpdir(), "petlog-"));
    const p = join(dir, "remind.log");
    appendPetLog(p, "[t] remind 开始 · neck-stretch\n"); // 换行由调用方拼（appendPetLog 原样追加）
    expect(readFileSync(p, "utf8")).toBe("[t] remind 开始 · neck-stretch\n");
  });

  test("超 512KB 轮转为 .old，新文件重新开始", () => {
    const dir = mkdtempSync(join(tmpdir(), "petlog-"));
    const p = join(dir, "remind.log");
    writeFileSync(p, "x".repeat(512 * 1024 + 1));
    appendPetLog(p, "[t] rotate 后首行\n");
    expect(existsSync(`${p}.old`)).toBe(true);
    expect(statSync(`${p}.old`).size).toBeGreaterThan(512 * 1024);
    expect(readFileSync(p, "utf8")).toBe("[t] rotate 后首行\n");
  });

  test("目录不存在自动创建；日志失败不抛（只读目录等场景由 try 兜底）", () => {
    const dir = mkdtempSync(join(tmpdir(), "petlog-"));
    const p = join(dir, "sub", "remind.log");
    appendPetLog(p, "ok\n");
    expect(readFileSync(p, "utf8")).toBe("ok\n");
  });
});
