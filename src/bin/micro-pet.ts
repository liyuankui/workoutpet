#!/usr/bin/env bun
/** micro-pet CLI——默认输出 markdown（LLM/人双友好） */
import { readDB } from "../core/streak";
import { renderReport } from "../core/report";
import { loadExercises } from "../core/exercises";
import exercisesJson from "../core/exercises.json";
import { join } from "node:path";
import { homedir } from "node:os";

const DB_PATH = join(process.env.MICROPET_HOME ?? join(homedir(), ".micro-pet"), "streak.json");

const HELP = `micro-pet — 微运动桌宠 CLI

用法:
  micro-pet report          输出本周打卡报告（markdown）
  micro-pet db-path         打印 streak 数据文件路径

数据: ${DB_PATH}（纯本地）`;

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "report": {
    const db = readDB(DB_PATH);
    console.log(renderReport(db, loadExercises(exercisesJson)));
    break;
  }
  case "db-path":
    console.log(DB_PATH);
    break;
  default:
    console.log(HELP);
    process.exitCode = cmd ? 1 : 0; // 未知命令退出码 1，无命令 0（打印帮助）
}
void rest;
