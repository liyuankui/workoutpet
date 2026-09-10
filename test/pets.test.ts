import { describe, expect, test } from "bun:test";
import { getPet } from "../src/core/pets";
import { CAT_PERSONAS } from "../src/core/cats";
import { ANIMS } from "../src/core/anims";

/** F32 猫宇宙 sprite 组装：6 只猫逐只校验（骨架 × 花色重着色） */
describe("F32 猫宇宙 sprite", () => {
  test("六只猫帧 32×32、字符合法、帧名契约齐备", () => {
    for (const persona of CAT_PERSONAS) {
      const pet = getPet(persona.id);
      expect(pet.grid).toBe(32);
      for (const [name, frame] of Object.entries(pet.frames)) {
        expect(frame.length, `${persona.id}/${name}`).toBe(32);
        for (const row of frame) {
          expect(row.length).toBe(32);
          for (const ch of row) expect(ch in pet.palette, `${persona.id}/${name} 未知字符 ${ch}`).toBe(true);
        }
      }
      const needed = new Set<string>();
      for (const steps of Object.values(ANIMS)) for (const [f] of steps) needed.add(f);
      for (const f of needed) expect(f in pet.frames, `${persona.id} 缺帧 ${f}`).toBe(true);
    }
  });

  test("花色真实生效：玄猫有金眼色板、奶牛帧含斑字符、暹罗帧含面具字符", () => {
    const voidCat = getPet("momo");
    expect(voidCat.palette.E).toBe("#f2c14e");
    const cow = getPet("huajuan"); // 花卷=三花（含斑）
    expect(cow.frames.idleA.some((r) => r.includes("S"))).toBe(true);
    const siamese = getPet("mimi");
    expect(siamese.frames.idleA.some((r) => r.includes("D"))).toBe(true);
  });

  test("非法 id 回退小橘（含退役 bunny 兼容）", () => {
    expect(getPet("bunny").id).toBe("xiaoju");
    expect(getPet(undefined).id).toBe("xiaoju");
  });
});
