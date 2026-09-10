import { describe, expect, test } from "bun:test";
import { COATS, getCoat, recolorFrame, SPOT_COLORS } from "../src/core/coats";
import { FRAMES } from "../src/core/pets/cat";

describe("F32 花色系统", () => {
  test("七款花色注册；非法 id 回退奶油橘", () => {
    expect(COATS.map((c) => c.id)).toEqual(["cream", "void", "snow", "cow", "calico", "blue", "siamese"]);
    expect(getCoat("void").id).toBe("void");
    expect(getCoat("dragon").id).toBe("cream");
  });

  test("每款 palette 均覆写主色/浅色/眼/轮廓", () => {
    for (const c of COATS) {
      for (const k of ["O", "L", "E", "K"]) expect(c.palette[k], `${c.id}.${k}`).toBeTruthy();
    }
  });

  test("重着色：斑/面具只改主色格（O），轮廓与眼不动；帧尺寸不变", () => {
    const f = FRAMES.idleA;
    for (const coat of COATS) {
      const out = recolorFrame(f, coat);
      expect(out.length).toBe(f.length);
      out.forEach((r, i) => expect(r.length).toBe(f[i]!.length));
      if (coat.spots) {
        const has = out.some((r) => r.includes(coat.spots!.char));
        expect(has, `${coat.id} 斑未生效`).toBe(true);
      }
      if (coat.mask) {
        const has = out.some((r) => r.includes(coat.mask!.char));
        expect(has, `${coat.id} 面具未生效`).toBe(true);
      }
    }
  });

  test("斑/面具色定义存在", () => {
    for (const c of COATS) {
      if (c.spots) expect(SPOT_COLORS[c.spots.char]).toBeTruthy();
      if (c.mask) expect(SPOT_COLORS[c.mask.char]).toBeTruthy();
    }
  });
});
