#!/usr/bin/env bun
/** micro-pet CLI——默认输出 markdown（LLM/人双友好），--lang en 切英文 */
import { readDB } from "../core/streak";
import { renderReport } from "../core/report";
import { loadExercises, resolveExercises } from "../core/exercises";
import exercisesJson from "../core/exercises.json";
import { initUserExercises, readUserExercisesRaw, userPaths } from "../core/userConfig";
import { auditConfig } from "../core/configAudit";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const paths = userPaths();
const DB_PATH = paths.db;

const HELP = `micro-pet — 微运动桌宠 CLI

用法:
  micro-pet report                    输出本周打卡报告（markdown，默认中文）
  micro-pet report --lang en          Weekly report in English
  micro-pet init-exercises            生成自定义动作库模板（~/.micro-pet/exercises.json）
  micro-pet validate-config           校验 config.json（schedule/goalDaily 等字段）
  micro-pet db-path                   打印 streak 数据文件路径

配置（AI 助手可用 docs/agent-setup-prompt.md 采访后生成）:
  动作库  ${paths.exercises}（init-exercises 生成，编辑后重启 app 生效）
  调度等  ${paths.config}（schedule 时段窗口 / goalDaily / locale）
  数据    ${DB_PATH}（纯本地）`;

const [cmd, ...rest] = process.argv.slice(2);
const langIdx = rest.indexOf("--lang");
const locale = langIdx >= 0 ? rest[langIdx + 1] : undefined;

function currentExercises() {
  return resolveExercises(readUserExercisesRaw(paths), exercisesJson);
}

switch (cmd) {
  case "report": {
    const { exercises } = currentExercises();
    console.log(renderReport(readDB(DB_PATH), exercises, Date.now(), undefined, locale ?? "zh-CN"));
    break;
  }
  case "init-exercises": {
    const r = initUserExercises(paths);
    console.log(r.ok ? `✅ ${r.message}` : `⚠️  ${r.message}`);
    process.exitCode = r.ok ? 0 : 1;
    break;
  }
  case "validate-config": {
    const p = paths.config;
    if (!existsSync(p)) { console.log(`⚠️  ${p} 不存在（首次启动后生成，或用默认值）`); process.exitCode = 1; break; }
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(p, "utf8")); } catch (e) { console.log(`❌ JSON 语法错误: ${e}`); process.exitCode = 1; break; }
    const r = auditConfig(raw as Record<string, unknown>, loadExercises(exercisesJson).map((e) => e.id));
    for (const e of r.errors) console.log(`❌ ${e}`);
    for (const w of r.warns) console.log(`⚠️  ${w}`);
    if (r.ok) console.log(`✅ ${p} 校验通过`);
    process.exitCode = r.ok ? 0 : 1;
    break;
  }
  case "db-path":
    console.log(DB_PATH);
    break;
  default:
    console.log(HELP);
    process.exitCode = cmd ? 1 : 0; // 未知命令退出码 1，无命令 0（打印帮助）
}
