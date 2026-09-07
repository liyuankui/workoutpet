// 拖动判定 + 屏幕边界钳制（纯函数，供渲染端/主进程共用）
// 背景：macOS 上 focusable:false（non-activating）窗口的 -webkit-app-region:drag 失效，
// 改为手动拖动：renderer Pointer Events 发增量，主进程 setPosition。

/** 位移超过阈值才视为拖动，否则放行给 click（打卡/反应） */
export function shouldStartDrag(
  startX: number,
  startY: number,
  x: number,
  y: number,
  threshold = 4,
): boolean {
  return Math.abs(x - startX) + Math.abs(y - startY) >= threshold;
}

/** 钳制到工作区，至少保留 KEEP px 在屏内（防猫被拖飞找不回） */
export function clampWindow(
  x: number,
  y: number,
  w: number,
  h: number,
  wa: { x: number; y: number; width: number; height: number },
  keep = 40,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, wa.x - w + keep), wa.x + wa.width - keep),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - keep),
  };
}

/** 拖动目标位：锚点窗口位 + 光标屏幕位差（幂等：同光标同结果，无位移放大回路） */
export function computeDragPosition(
  anchor: { cx: number; cy: number; wx: number; wy: number },
  cursor: { x: number; y: number },
  w: number,
  h: number,
  wa: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  return clampWindow(anchor.wx + cursor.x - anchor.cx, anchor.wy + cursor.y - anchor.cy, w, h, wa);
}
