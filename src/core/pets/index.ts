// 猫宇宙 sprite 组装（F32）：骨架帧（pets/cat）× 花色（coats）→ 重着色后的当前猫
// 兔子已退役（2026-09-10）：旧 config.pet=bunny 静默回退小橘；bunny 资产留在 git 史
import * as catSkeleton from "./cat";
import { getCoat, recolorFrame, SPOT_COLORS, type Coat } from "../coats";
import { getPersona } from "../cats";

export interface PetSprite {
  id: string;
  name: { "zh-CN": string; en: string };
  palette: Record<string, string | null>;
  grid: number;
  frames: Record<string, string[]>;
}

export function getPet(personaId: unknown): PetSprite {
  const persona = getPersona(personaId);
  const coat: Coat = getCoat(persona.coatId);
  return {
    id: persona.id,
    name: persona.name,
    palette: { ...catSkeleton.PALETTE, ...coat.palette, ...SPOT_COLORS },
    grid: catSkeleton.GRID,
    frames: Object.fromEntries(
      Object.entries(catSkeleton.FRAMES).map(([k, f]) => [k, recolorFrame(f, coat)]),
    ),
  };
}

/** tray 图标用：帧 → RGBA 缓冲 */
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
