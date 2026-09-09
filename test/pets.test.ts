import { describe, expect, test } from "bun:test";
import { PETS, PET_IDS, getPet, isPetId } from "../src/core/pets";
import { ANIMS } from "../src/core/anims";

/** F31 多宠物 + 32×32 帧校验（可爱第一性的工程保障） */
describe("F31 宠物注册表", () => {
  test("注册两只；非法 id 回退猫", () => {
    expect(PET_IDS).toEqual(["cat", "bunny"]);
    expect(getPet("bunny").id).toBe("bunny");
    expect(getPet("dragon").id).toBe("cat");
    expect(getPet(undefined).id).toBe("cat");
    expect(isPetId("cat")).toBe(true);
    expect(isPetId("dog")).toBe(false);
  });

  test("每只宠物：帧 32 行 × 32 字符，字符均在色板内", () => {
    for (const pet of Object.values(PETS)) {
      expect(pet.grid).toBe(32);
      for (const [name, frame] of Object.entries(pet.frames)) {
        expect(frame.length, `${pet.id}/${name} 行数`).toBe(32);
        for (const row of frame) {
          expect(row.length, `${pet.id}/${name} 行宽`).toBe(32);
          for (const ch of row) expect(ch in pet.palette, `${pet.id}/${name} 未知字符 ${ch}`).toBe(true);
        }
      }
    }
  });

  test("帧名契约：ANIMS 引用的帧每只都有（idleA/idleWag/blink/stretchA/stretchB/happy/roll/plead）", () => {
    const needed = new Set<string>();
    for (const steps of Object.values(ANIMS)) for (const [f] of steps) needed.add(f);
    for (const pet of Object.values(PETS)) {
      for (const f of needed) expect(f in pet.frames, `${pet.id} 缺帧 ${f}`).toBe(true);
    }
  });

  test("猫：奶油橘（O 主色 + W 高光）；撒娇帧有泪光（plead 高光在下排）", () => {
    const cat = PETS.cat;
    expect("O" in cat.palette).toBe(true);
    expect(cat.palette.W).toBe("#ffffff");
    const idle = cat.frames.idleA.join("");
    expect(idle).toContain("W"); // 眼睛高光存在
  });

  test("兔：米白身（V）无橘（O）；长耳粉芯（y0..7 有 P）", () => {
    const bunny = PETS.bunny;
    expect("V" in bunny.palette).toBe(true);
    expect("O" in bunny.palette).toBe(false);
    const top = bunny.frames.idleA.slice(0, 8).join("");
    expect(top).toContain("P"); // 长耳内芯
    expect(top).toContain("K");
  });

  test("两宠互有辨识度：帧内容不同", () => {
    expect(PETS.cat.frames.idleA).not.toEqual(PETS.bunny.frames.idleA);
  });
});
