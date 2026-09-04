import { contextBridge, ipcRenderer } from "electron";
import { FRAMES, GRID, PALETTE } from "./core/pixelcat";

export interface PetStateMsg {
  pet: "idle" | "remind" | "happy";
  exercise: { id: string; name: string; emoji: string; cue: string } | null;
  streakDays: number;
  wiggle?: boolean;
}

contextBridge.exposeInMainWorld("microPet", {
  onState: (cb: (msg: PetStateMsg) => void) => {
    ipcRenderer.on("pet-state", (_e, msg: PetStateMsg) => cb(msg));
  },
  petClick: () => ipcRenderer.send("pet-click"),
  ready: () => ipcRenderer.send("pet-ready"),
  // sprite 静态数据（可序列化，供渲染端画像素猫）
  sprites: () => ({ PALETTE, GRID, FRAMES }),
});
