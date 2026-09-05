import zhCN from "../locales/zh-CN.json";
import en from "../locales/en.json";

/** F8 多语言——两语言手写映射，不引 i18next（SPEC 软约束） */
export type Locale = "zh-CN" | "en";

export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALES: Record<Locale, unknown> = { "zh-CN": zhCN, en };

export function isLocale(v: unknown): v is Locale {
  return v === "zh-CN" || v === "en";
}

/** 系统语言标签（BCP-47）→ 本项目 Locale，非中文一律 en */
export function resolveLocale(systemTag: string | undefined): Locale {
  return systemTag?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

type Strings = typeof zhCN;

/** 取整套文案；未知语言回退 zh-CN（F8 V2：缺语言不崩） */
export function strings(locale: string): Strings {
  return (isLocale(locale) ? LOCALES[locale] : LOCALES[DEFAULT_LOCALE]) as Strings;
}

/** "好样的！连续第 {n} 天" + {n: 3} → 替换后字符串；缺失占位符保留原文 */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 动作库 locale map 取值，缺语言回退 zh-CN */
export function pickLocalized(map: Record<string, string>, locale: Locale): string {
  return map[locale] ?? map[DEFAULT_LOCALE] ?? Object.values(map)[0] ?? "";
}
