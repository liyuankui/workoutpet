#!/usr/bin/env bun
/** micro-pet CLI——默认输出 markdown（LLM/人双友好），--lang en 切英文（F8） */
import { readDB } from "../core/streak";
import { renderReport } from "../core/report";
import { loadExercises } from "../core/exercises";
import exercisesJson from "../core/exercises.json";
import { join } from "node:path";
import { homedir } from "node:os";

const DB_PATH = join(process.env.MICROPET_HOME ?? join(homedir(), ".micro-pet"), "streak.json");

const HELP = `micro-pet — 微运动桌宠 CLI

用法:
  micro-pet report              输出本周打卡报告（markdown，默认中文）
  micro-pet report --lang en    Weekly report in English
  micro-pet db-path             打印 streak 数据文件路径

数据: ${DB_PATH}（纯本地）`;

const [cmd, ...rest] = process.argv.slice(2);
const langIdx = rest.indexOf("--lang");
const locale = langIdx >= 0 ? rest[langIdx + 1] : undefined;

switch (cmd) {
  case "report": {
    const db = readDB(DB_PATH);
    console.log(renderReport(db, loadExercises(exercisesJson), Date.now(), undefined, locale ?? "zh-CN"));
    break;
  }
  case "db-path":
    console.log(DB_PATH);
    break;
  default:
    console.log(HELP);
    process.exitCode = cmd ? 1 : 0; // 未知命令退出码 1，无命令 0（打印帮助）
}
