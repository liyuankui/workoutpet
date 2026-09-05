import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import exercisesJson from "./exercises.json";

/**
 * 用户级配置文件（~/.micro-pet/）：
 * - exercises.json  自定义动作库（覆盖内置）
 * - config.json     间隔/语言/位置（主进程读写）
 */
export interface UserPaths {
  home: string;
  exercises: string;
  config: string;
  db: string;
}

export function userPaths(home?: string): UserPaths {
  const h = home ?? process.env.MICROPET_HOME ?? join(process.env.HOME ?? "~", ".micro-pet");
  return { home: h, exercises: join(h, "exercises.json"), config: join(h, "config.json"), db: join(h, "streak.json") };
}

/** 读取用户动作库原文（不存在 → null） */
export function readUserExercisesRaw(paths: UserPaths): unknown | null {
  try {
    if (!existsSync(paths.exercises)) return null;
    return JSON.parse(readFileSync(paths.exercises, "utf8"));
  } catch {
    return { __parseError: true }; // 损坏时交给 resolveExercises 报错回退
  }
}

/** 把内置动作库模板复制到用户路径（已存在则拒绝覆盖），返回是否成功 */
export function initUserExercises(paths: UserPaths): { ok: boolean; message: string } {
  if (existsSync(paths.exercises)) {
    return { ok: false, message: `已存在 ${paths.exercises}（如需重置请先删除）` };
  }
  mkdirSync(paths.home, { recursive: true });
  // 模板 = 内置库原样导出（含双语字段，供用户改）
  writeFileSync(paths.exercises, JSON.stringify(exercisesJson, null, 2));
  return { ok: true, message: `已生成模板 ${paths.exercises}，编辑后重启 app 生效` };
}
