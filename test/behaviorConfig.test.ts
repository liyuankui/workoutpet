import { describe, expect, test } from "bun:test";
import { parseRetryMs, parseClingAfterSkips } from "../src/core/behaviorConfig";
import { signboardKind } from "../src/core/streak";
import { currentStepIndex } from "../src/core/session";

describe("测试债 #2：行为配置边界", () => {
  test("retryMin：缺省/非法/非正→8min；字符串数字可解析；正常分钟→ms", () => {
    expect(parseRetryMs(undefined)).toBe(8 * 60_000);
    expect(parseRetryMs({})).toBe(8 * 60_000);
    expect(parseRetryMs({ retryMin: -5 } as any)).toBe(8 * 60_000);
    expect(parseRetryMs({ retryMin: "3" as any })).toBe(3 * 60_000);
    expect(parseRetryMs({ retryMin: 12 })).toBe(12 * 60_000);
  });

  test("clingAfterSkips：缺省 3；显式 0=关闭；负数钳 0；非法回默认", () => {
    expect(parseClingAfterSkips(undefined)).toBe(3);
    expect(parseClingAfterSkips({})).toBe(3);
    expect(parseClingAfterSkips({ clingAfterSkips: 0 })).toBe(0);
    expect(parseClingAfterSkips({ clingAfterSkips: -2 })).toBe(0);
    expect(parseClingAfterSkips({ clingAfterSkips: "5" as any })).toBe(5);
    expect(parseClingAfterSkips({ clingAfterSkips: NaN })).toBe(3);
  });
});

describe("测试债 #5：举牌决策", () => {
  test("达标 / 有目标进度 / 纯计数三分支", () => {
    expect(signboardKind(4, 4)).toBe("met");
    expect(signboardKind(3, 4)).toBe("goalN");
    expect(signboardKind(9, 4)).toBe("met");
    expect(signboardKind(3, undefined)).toBe("plainN");
    expect(signboardKind(0, 0)).toBe("plainN"); // 目标 0 视为无目标
  });
});

describe("测试债 #4：会话步骤轮播", () => {
  test("按时长均分；空步骤/零时长安全；超时钳末位", () => {
    expect(currentStepIndex(0, 30, 5)).toBe(0);      // 空步骤
    expect(currentStepIndex(3, 0, 5)).toBe(0);       // 零时长
    expect(currentStepIndex(3, 30, 0)).toBe(0);      // 开场第一 步
    expect(currentStepIndex(3, 30, 10)).toBe(1);     // 恰在边界
    expect(currentStepIndex(3, 30, 29)).toBe(2);
    expect(currentStepIndex(3, 30, 999)).toBe(2);    // 超时钳末位
  });
});
