import { contextBridge, ipcRenderer } from "electron";
import { FRAMES, GRID, PALETTE } from "./core/pixelcat";
import { strings, fmt } from "./core/i18n";
import { react } from "./core/reactions";
import { shouldStartDrag } from "./core/dragging";

export interface PetStateMsg {
  pet: "idle" | "remind" | "happy" | "cling" | "session";
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
  petClick: () => ipcRenderer.send("pet-click"),
  ready: () => ipcRenderer.send("pet-ready"),
  // sprite 静态数据（可序列化，供渲染端画像素猫）
  sprites: () => ({ PALETTE, GRID, FRAMES }),
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
