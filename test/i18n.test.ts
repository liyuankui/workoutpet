import { describe, expect, test } from "bun:test";
import { fmt, isLocale, resolveLocale, strings, pickLocalized } from "../src/core/i18n";
import zh from "../src/locales/zh-CN.json";
import en from "../src/locales/en.json";

/** 递归收集叶子 key 路径 */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("F8 多语言", () => {
  test("zh-CN 与 en 文案 key 结构完全一致（无缺译）", () => {
    expect(keyPaths(en)).toEqual(keyPaths(zh));
  });

  test("占位符一致：{n} / {monday} 两语言同现同缺", () => {
    const zhPaths = keyPaths(zh);
    for (const p of zhPaths) {
      const z = p.split(".").reduce<any>((o, k) => o?.[k], zh);
      const e = p.split(".").reduce<any>((o, k) => o?.[k], en);
      const ph = (s: unknown) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      expect(ph(e)).toBe(ph(z));
    }
  });

  test("fmt 占位符替换 + 缺失保留", () => {
    expect(fmt("第 {n} 天 {p}", { n: 3 })).toBe("第 3 天 {p}");
  });

  test("resolveLocale：zh* → zh-CN，其余 → en", () => {
    expect(resolveLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  test("strings：未知语言回退 zh-CN（V2 不崩）", () => {
    expect(strings("fr-FR").tray.quit).toBe(zh.tray.quit);
    expect(strings("en").tray.quit).toBe(en.tray.quit);
  });

  test("isLocale / pickLocalized 回退链", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("jp")).toBe(false);
    expect(pickLocalized({ "zh-CN": "中" }, "en")).toBe("中");
    expect(pickLocalized({}, "en")).toBe("");
  });
});
