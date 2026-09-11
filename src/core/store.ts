// 统一持久化层（DATA-STRUCTURES.md 首步建议）：校验 + 原子写 + 损坏备份
// 损坏不再静默清空——rename .corrupt-{ts} 留证 + 回退 fallback（console.warn 进 boot 日志）
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface StoreOptions<T> {
  /** 结构校验（含版本迁移）；返回 null 表示不可用 → 触发备份与回退 */
  validate: (raw: unknown) => T | null;
  fallback: T;
}

export function readStore<T>(path: string, opts: StoreOptions<T>): T {
  if (!existsSync(path)) return opts.fallback;
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const parsed = opts.validate(raw);
    if (parsed !== null) return parsed;
    throw new Error("validate rejected");
  } catch (err) {
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`); // 损坏留证（不静默清空用户资产）
      console.warn(`[micro-pet] store 损坏已备份: ${path} (${String(err)})`);
    } catch { /* 备份失败也只能回退 */ }
    return opts.fallback;
  }
}

export function writeStore(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.tmp-store-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path); // 原子写（tmp + rename），与 streak/config 既有风格统一
}
