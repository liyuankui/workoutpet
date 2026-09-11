import { describe, expect, test } from "bun:test";
import { readStore, writeStore } from "../src/core/store";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, readFileSync as rf } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const validateArr = (raw: unknown): string[] | null => (Array.isArray(raw) ? (raw as string[]) : null);

describe("F35 统一 store 层", () => {
  test("合法读；缺文件回退 fallback", () => {
    const dir = mkdtempSync(join(tmpdir(), "store-"));
    const p = join(dir, "a.json");
    writeStore(p, ["x", "y"]);
    expect(readStore(p, { validate: validateArr, fallback: [] })).toEqual(["x", "y"]);
    expect(readStore(join(dir, "none.json"), { validate: validateArr, fallback: ["fb"] })).toEqual(["fb"]);
  });

  test("损坏/校验不过 → 备份 .corrupt-* 并回退（不静默清空）", () => {
    const dir = mkdtempSync(join(tmpdir(), "store-"));
    const p = join(dir, "b.json");
    writeFileSync(p, "{broken json");
    expect(readStore(p, { validate: validateArr, fallback: ["fb"] })).toEqual(["fb"]);
    expect(readdirSync(dir).some((f) => f.startsWith("b.json.corrupt-"))).toBe(true);
    // 结构不符（非数组）同样备份
    const p2 = join(dir, "c.json");
    writeFileSync(p2, '{"nope":1}');
    expect(readStore(p2, { validate: validateArr, fallback: ["fb"] })).toEqual(["fb"]);
  });

  test("原子写往返 + 版本迁移示例（v0→v1 补字段）", () => {
    const dir = mkdtempSync(join(tmpdir(), "store-"));
    const p = join(dir, "d.json");
    writeStore(p, { version: 0, name: "old" });
    const migrate = (raw: unknown): { version: 1; name: string; extra: number } | null => {
      const r = raw as Record<string, unknown>;
      if (typeof r?.name !== "string") return null;
      return { version: 1, name: r.name, extra: typeof r.extra === "number" ? r.extra : 42 };
    };
    const out = readStore(p, { validate: migrate, fallback: { version: 1, name: "fb", extra: 0 } });
    expect(out).toEqual({ version: 1, name: "old", extra: 42 });
    expect(readFileSync(p, "utf8")).toContain('"version": 0'); // 读迁移不回写（写时才落）
  });
});
