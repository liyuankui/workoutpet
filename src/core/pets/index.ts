// 多宠物注册表：每个宠物一个模块（palette + grid + frames），帧名契约统一
// （renderer ANIMS 引用帧名；切换宠物 = 切换 sprite 集，状态机/打卡完全解耦）
import * as cat from "./cat";
import * as bunny from "./bunny";

export interface PetSprite {
  id: PetId;
  name: { "zh-CN": string; en: string };
  palette: Record<string, string | null>;
  grid: number;
  frames: Record<string, string[]>;
}

export type PetId = "cat" | "bunny";
export const PET_IDS: PetId[] = ["cat", "bunny"];

export function isPetId(v: unknown): v is PetId {
  return v === "cat" || v === "bunny";
}

export const PETS: Record<PetId, PetSprite> = {
  cat: { id: "cat", name: { "zh-CN": "奶油橘猫", en: "Cream Cat" }, palette: cat.PALETTE, grid: cat.GRID, frames: cat.FRAMES },
  bunny: { id: "bunny", name: { "zh-CN": "云白兔", en: "Cloud Bunny" }, palette: bunny.PALETTE, grid: bunny.GRID, frames: bunny.FRAMES },
};

export function getPet(id: unknown): PetSprite {
  return isPetId(id) ? PETS[id] : PETS.cat;
}

/** tray 图标用：帧 → RGBA 缓冲（按宠物网格尺寸） */
export function frameToRGBA(pet: PetSprite, frame: readonly string[]): Uint8Array {
  const g = pet.grid;
  const buf = new Uint8Array(g * g * 4);
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const ch = frame[y]![x]!;
      const hex = pet.palette[ch];
      const i = (y * g + x) * 4;
      if (!hex) {
        buf[i + 3] = 0;
        continue;
      }
      buf[i] = parseInt(hex.slice(1, 3), 16);
      buf[i + 1] = parseInt(hex.slice(3, 5), 16);
      buf[i + 2] = parseInt(hex.slice(5, 7), 16);
      buf[i + 3] = 255;
    }
  }
  return buf;
}
