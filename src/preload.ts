import { contextBridge, ipcRenderer } from "electron";
import { getPet } from "./core/pets";
import { ANIMS } from "./core/anims";
import { MOUSE_FRAMES, MOUSE_PALETTE, MOUSE_W, MOUSE_H } from "./core/mouse";
import { OUTFITS, OUTFIT_PALETTE } from "./core/outfits";
import { strings, fmt } from "./core/i18n";
import { react } from "./core/reactions";
import { shouldStartDrag } from "./core/dragging";

export interface PetStateMsg {
  pet: "idle" | "remind" | "happy" | "cling" | "session";
  /** 当前宠物 id（cat/bunny…）：变化时渲染端重取 sprite */
  spriteId?: string;
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
  // 小剧场（F27）：主进程择时开演，渲染端自导自演 8s
  onSkit: (cb: (skit: { type: "mouse" | "hop" }) => void) => {
    ipcRenderer.on("pet-skit", (_e, skit: { type: "mouse" | "hop" }) => cb(skit));
  },
  mouse: () => ({ PALETTE: MOUSE_PALETTE, FRAMES: MOUSE_FRAMES, W: MOUSE_W, H: MOUSE_H }),
  outfits: () => ({ OUTFITS, PALETTE: OUTFIT_PALETTE }),
  petClick: () => ipcRenderer.send("pet-click"),
  // 气泡占位通知（F34）：idle 小窗时动态扩窗容纳气泡，根治「喵～被截」
  bubbleBox: (on: boolean) => ipcRenderer.send("pet-bubble", on),
  ready: () => ipcRenderer.send("pet-ready"),
  // sprite 静态数据（可序列化，供渲染端画当前宠物）
  sprites: (petId?: string) => {
    const p = getPet(petId ?? "cat");
    return { PALETTE: p.palette, GRID: p.grid, FRAMES: p.frames, ANIMS, SPRITE_ID: p.id };
  },
  // 双语文案 + 占位符模板
  strings: (locale: string) => strings(locale),
  fmt: (template: string, vars: Record<string, string | number>) => fmt(template, vars),
  // 反应池（纯函数：节流 + 随机）
  react: (lastReactAt: number, now: number) => react(lastReactAt, now),
  // 拖动（纯函数判定 + 信号式移动：坐标权威在主进程 getCursorScreenPoint）
  shouldDrag: (startX: number, startY: number, x: number, y: number) => shouldStartDrag(startX, startY, x, y),
  dragStart: () => ipcRenderer.send("pet-drag-start"),
  dragMove: () => ipcRenderer.send("pet-drag-move"),
});
