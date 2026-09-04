import { z } from "zod";

/** F1 动作库 schema——webhook 共享字段在 meta 预留 */
export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id 须为 kebab-case"),
  name: z.string().min(1, "动作名不能为空"),
  emoji: z.string().min(1),
  cue: z.string().min(1, "一句指引不能为空"),
  steps: z.array(z.string().min(1)).min(2).max(4),
  durationSec: z.number().int().min(10).max(120),
  animation: z.enum(["stretch", "neck", "wrists", "legs", "heels", "shoulders", "breath"]),
  meta: z
    .object({
      source: z.string().default("micro-pet"),
      shareable: z.boolean().default(true),
    })
    .default({ source: "micro-pet", shareable: true }),
});

export type Exercise = z.infer<typeof ExerciseSchema>;

export const MIN_EXERCISES = 7;

export function loadExercises(raw: unknown): Exercise[] {
  const arr = z.array(ExerciseSchema).parse(raw);
  const ids = new Set(arr.map((e) => e.id));
  if (ids.size !== arr.length) throw new Error("动作库存在重复 id");
  if (arr.length < MIN_EXERCISES) {
    throw new Error(`动作库需 ≥${MIN_EXERCISES} 个动作，当前 ${arr.length}`);
  }
  return arr;
}

/** 随机抽一个动作（rand 可注入，便于测试） */
export function pickRandom<T>(list: readonly T[], rand: () => number = Math.random): T {
  if (list.length === 0) throw new Error("列表为空，无法抽取");
  return list[Math.floor(rand() * list.length)]!;
}
