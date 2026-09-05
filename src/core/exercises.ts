import { z } from "zod";
import { DEFAULT_LOCALE, pickLocalized, type Locale } from "./i18n";

/** 多语言文本：zh-CN 必填（回退基准），其余语言可选 */
const LocaleText = z.record(z.string().min(1)).refine((m) => !!m[DEFAULT_LOCALE], {
  message: `必须包含 "${DEFAULT_LOCALE}" 字段（回退基准）`,
});

/** F1 动作库 schema——webhook 共享字段在 meta 预留；F8 起文本为 locale map */
export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id 须为 kebab-case"),
  name: LocaleText,
  emoji: z.string().min(1),
  cue: LocaleText,
  steps: z
    .object({ [DEFAULT_LOCALE]: z.array(z.string().min(1)).min(2).max(4) })
    .catchall(z.array(z.string().min(1)).min(2).max(4)),
  durationSec: z.number().int().min(10).max(120),
  animation: z.enum(["stretch", "neck", "wrists", "legs", "heels", "shoulders", "breath"]),
  category: z.enum(["lower", "upper", "hands", "core", "general"]).default("general"),
  meta: z
    .object({
      source: z.string().default("micro-pet"),
      shareable: z.boolean().default(true),
    })
    .default({ source: "micro-pet", shareable: true }),
});

export interface Exercise {
  id: string;
  name: Record<string, string>;
  emoji: string;
  cue: Record<string, string>;
  steps: Record<string, string[]>;
  durationSec: number;
  animation: string;
  category: "lower" | "upper" | "hands" | "core" | "general";
  meta: { source: string; shareable: boolean };
}

export const MIN_EXERCISES = 7;

export function loadExercises(raw: unknown): Exercise[] {
  const arr = z.array(ExerciseSchema).parse(raw);
  const ids = new Set(arr.map((e) => e.id));
  if (ids.size !== arr.length) throw new Error("动作库存在重复 id");
  if (arr.length < MIN_EXERCISES) {
    throw new Error(`动作库需 ≥${MIN_EXERCISES} 个动作，当前 ${arr.length}`);
  }
  return arr as Exercise[];
}

/** 按语言取本地化视图（缺语言回退 zh-CN，F8 V2） */
export interface LocalizedExercise {
  id: string;
  emoji: string;
  name: string;
  cue: string;
  steps: string[];
}

export function localizeExercise(ex: Exercise, locale: Locale): LocalizedExercise {
  return {
    id: ex.id,
    emoji: ex.emoji,
    name: pickLocalized(ex.name, locale),
    cue: pickLocalized(ex.cue, locale),
    steps: ex.steps[locale] ?? ex.steps[DEFAULT_LOCALE] ?? [],
  };
}

/** 随机抽一个动作（rand 可注入，便于测试） */
export function pickRandom<T>(list: readonly T[], rand: () => number = Math.random): T {
  if (list.length === 0) throw new Error("列表为空，无法抽取");
  return list[Math.floor(rand() * list.length)]!;
}

/**
 * 均衡抽取（v0.4.0）：优先「最久未练的类别」，类内随机。
 * recentCategories 为最近练过的类别序列（新的在后）。返回 [选中动作, 更新后的序列]。
 */
export function pickBalanced(
  exercises: readonly Exercise[],
  recentCategories: readonly string[],
  rand: () => number = Math.random,
): { exercise: Exercise; recent: string[] } {
  if (exercises.length === 0) throw new Error("动作库为空");
  const pool = exercises;
  const cats = [...new Set(pool.map((e) => e.category))];
  // 目标类别 = 最近最久未练（从未练过排最前；-1 即从未出现）
  const byOldest = [...cats].sort(
    (a, b) => recentCategories.lastIndexOf(a) - recentCategories.lastIndexOf(b),
  );
  const target = byOldest[0]!;
  const inCat = pool.filter((e) => e.category === target);
  const chosen = pickRandom(inCat.length ? inCat : pool, rand);
  const recent = [...recentCategories, chosen.category].slice(-Math.max(4, cats.length));
  return { exercise: chosen, recent };
}
export function resolveExercises(
  userRaw: unknown,
  bundledRaw: unknown,
): { exercises: Exercise[]; source: "user" | "bundled"; error?: string } {
  try {
    return { exercises: loadExercises(userRaw), source: "user" };
  } catch (err) {
    return { exercises: loadExercises(bundledRaw), source: "bundled", error: String(err) };
  }
}
