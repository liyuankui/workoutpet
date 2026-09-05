import { z } from "zod";

/**
 * 时段调度（v0.4.0）：不同时间段不同提醒密度，窗口外静默。
 * 例：午饭前后与午后倦怠期加密，下班后不打扰。
 */
export const TimeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间须为 HH:MM（24h）");

export const WindowSchema = z
  .object({
    from: TimeHHMM,
    to: TimeHHMM,
    intervalMin: z.number().int().min(5).max(180),
  })
  .refine((w) => toMinutes(w.from) < toMinutes(w.to), { message: "from 必须早于 to（同日）" });

export const ScheduleSchema = z.object({
  windows: z.array(WindowSchema).min(1).max(12),
});

export type Window = z.infer<typeof WindowSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

/** 当前时刻所在窗口；无命中 = 静默时段 */
export function currentWindow(schedule: Schedule, now: Date): Window | null {
  const t = now.getHours() * 60 + now.getMinutes();
  return schedule.windows.find((w) => t >= toMinutes(w.from) && t < toMinutes(w.to)) ?? null;
}

/** 当前应使用的间隔（分钟）；null = 静默（不打扰） */
export function intervalMinutes(schedule: Schedule, now: Date): number | null {
  return currentWindow(schedule, now)?.intervalMin ?? null;
}

/** 校验 + 人话错误（validate-config CLI 与主进程共用） */
export function validateSchedule(raw: unknown): { ok: boolean; schedule?: Schedule; error?: string } {
  const parsed = ScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const path = first.path.join(".");
    return { ok: false, error: `${path || "schedule"}: ${first.message}` };
  }
  return { ok: true, schedule: parsed.data };
}
