import { contextBridge, ipcRenderer } from "electron";
import { strings, fmt } from "./core/i18n";
import { react } from "./core/reactions";
import { shouldStartDrag } from "./core/dragging";

const COAT_MAPS: Record<string, { body: string; dark: string; light: string }> = {
  cream: { body: "#f5c07a", dark: "#d99b4e", light: "#fff1dc" },
  void: { body: "#45414b", dark: "#2e2b33", light: "#5b5663" },
  snow: { body: "#f7f5f2", dark: "#c9c4bd", light: "#ffffff" },
  cow: { body: "#f7f5f2", dark: "#3d3a3f", light: "#ffffff" },
  calico: { body: "#f5c07a", dark: "#3d3a3f", light: "#fff1dc" },
  blue: { body: "#8f9aa8", dark: "#77828f", light: "#c3ccd6" },
  siamese: { body: "#e8d5b5", dark: "#5a4636", light: "#f6ecd9" },
};

export interface PetStateMsg {
  pet: "idle" | "remind" | "happy" | "cling" | "session";
  /** 当前宠物 id（cat/bunny…）：变化时渲染端重取 sprite */
  spriteId?: string;
  /** 当前花色 id（sheet 烘焙选缓存） */
  coatId?: string;
  /** 窗口走位中（外出/跑回）——渲染端播 walk 动画 */
  walking?: boolean;
  /** 当前装扮（hat/scarf/bow，null=素身） */
  outfit?: string | null;
  exercise: { id: string; name: string; emoji: string; cue: string; steps: string[] } | null;
  streakDays: number;
  locale: string;
  /** 会话陪练：剩余秒与当前步骤提示 */
  sessionRemainSec?: number;
  sessionStep?: string;
  /** 举牌：今日打卡数与目标（goalDaily 缺省时 todayGoal 为空） */
  todayCount?: number;
  todayGoal?: number;
}

contextBridge.exposeInMainWorld("microPet", {
  onState: (cb: (msg: PetStateMsg) => void) => {
    ipcRenderer.on("pet-state", (_e, msg: PetStateMsg) => cb(msg));
  },
  onHint: (cb: (hint: { title: string; cue: string }) => void) => {
    ipcRenderer.on("pet-hint", (_e, hint: { title: string; cue: string }) => cb(hint));
  },
  // 演示菜单直发反应（绕过节流，供手动触发测试）
  onReaction: (cb: (type: string) => void) => {
    ipcRenderer.on("pet-reaction", (_e, type: string) => cb(type));
  },
  // 部件化 demo（F36）：托盘直发动作，渲染端拼装演出
  onPoseDemo: (cb: (kind: "walk" | "roll" | "jump") => void) => {
    ipcRenderer.on("pet-pose-demo", (_e, kind: "walk" | "roll" | "jump") => cb(kind));
  },
  // 小剧场（F27）：主进程择时开演，渲染端自导自演 8s
  onSkit: (cb: (skit: { type: "mouse" | "hop" }) => void) => {
    ipcRenderer.on("pet-skit", (_e, skit: { type: "mouse" | "hop" }) => cb(skit));
  },
  // 双语文案 + 占位符模板
  strings: (locale: string) => strings(locale),
  fmt: (template: string, vars: Record<string, string | number>) => fmt(template, vars),
  // 反应池（纯函数：节流 + 随机）
  react: (lastReactAt: number, now: number) => react(lastReactAt, now),
  // 2D sprite sheet：元数据 + LUT + PNG dataURL（asar 兼容）
  sheets: () =>
    ipcRenderer.sendSync("pet-sheets-meta") as {
      meta: unknown;
      luts: Record<string, Record<string, string>>;
      pngs: Record<string, string>;
    },
  petClick: () => ipcRenderer.send("pet-click"),
  ready: () => ipcRenderer.send("pet-ready"),
  bubbleBox: (on: boolean) => ipcRenderer.send("pet-bubble", on),
  // 明信片（3D：main 请 renderer 作画 → dataURL 回传落盘）
  onPostcard: (cb: (req: unknown) => void) => {
    ipcRenderer.on("pet-postcard-render", (_e, req: unknown) => cb(req));
  },
  sendPostcard: (dataUrl: string) => ipcRenderer.send("pet-postcard-data", dataUrl),
  // 拖动（纯函数判定 + 信号式移动：坐标权威在主进程 getCursorScreenPoint）
  shouldDrag: (startX: number, startY: number, x: number, y: number) => shouldStartDrag(startX, startY, x, y),
  dragStart: () => ipcRenderer.send("pet-drag-start"),
  dragMove: () => ipcRenderer.send("pet-drag-move"),
});
