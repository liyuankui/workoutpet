#!/usr/bin/env bun
/** micro-pet CLI——默认输出 markdown（LLM/人双友好），--lang en 切英文（F8） */
import { readDB } from "../core/streak";
import { renderReport } from "../core/report";
import { loadExercises, resolveExercises } from "../core/exercises";
import exercisesJson from "../core/exercises.json";
import { initUserExercises, readUserExercisesRaw, userPaths } from "../core/userConfig";
import { join } from "node:path";

const paths = userPaths();
const DB_PATH = paths.db;

const HELP = `micro-pet — 微运动桌宠 CLI

用法:
  micro-pet report                    输出本周打卡报告（markdown，默认中文）
  micro-pet report --lang en          Weekly report in English
  micro-pet init-exercises            生成自定义动作库模板（~/.micro-pet/exercises.json）
  micro-pet db-path                   打印 streak 数据文件路径

配置:
  动作库  ${paths.exercises}（init-exercises 生成，编辑后重启 app 生效）
  间隔等  ${paths.config}（intervalMin 30-120 / locale）
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
  case "db-path":
    console.log(DB_PATH);
    break;
  default:
    console.log(HELP);
    process.exitCode = cmd ? 1 : 0; // 未知命令退出码 1，无命令 0（打印帮助）
}
