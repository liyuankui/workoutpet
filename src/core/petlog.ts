// 提醒可观测性日志（~/.micro-pet/remind.log）：
// 状态转移、schedule 判定、遥测失败皆落本地——远端遥测不可查时（如本次诊断）本地可回溯
import { statSync, renameSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MAX_BYTES = 512 * 1024;

/** 追加一行；超 512KB 轮转为 .old（保留一代，日志自身永不抛错） */
export function appendPetLog(path: string, line: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path) && statSync(path).size > MAX_BYTES) renameSync(path, `${path}.old`);
    appendFileSync(path, line);
  } catch { /* 日志不许影响产品 */ }
}
