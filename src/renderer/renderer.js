// 渲染端：像素猫动画 + 气泡 + 点击互动反应（状态权威在 main 进程，sprite/文案经 preload 注入）
/* global microPet */
const { PALETTE, GRID, FRAMES } = microPet.sprites();

const canvas = document.getElementById("cat");
const ctx = canvas.getContext("2d");
const bubble = document.getElementById("bubble");
const titleEl = bubble.querySelector(".title");
const cueEl = bubble.querySelector(".cue");

const SCALE = 7; // 16 × 7 = 112px

// 每状态的帧序列：[帧名, 时长ms, x偏移, y偏移]
const ANIMS = {
  idle: [
    ["idleA", 1100, 0, 0],
    ["idleWag", 350, 0, 0],
    ["idleA", 1100, 0, 0],
    ["blink", 140, 0, 0],
  ],
  remind: [
    ["stretchA", 500, 0, 0],
    ["stretchB", 850, 0, 0],
    ["stretchA", 400, 0, 0],
    ["stretchB", 850, 0, 0],
  ],
  happy: [
    ["happy", 220, 0, 0],
    ["happy", 220, 0, -3], // bounce
  ],
  // 会话陪练（F25）：猫同步跟做——示范帧循环 + 开心点缀
  session: [
    ["stretchA", 700, 0, 0],
    ["stretchB", 900, 0, 0],
    ["stretchA", 500, 0, 0],
    ["happy", 300, 0, -2],
  ],
  // 撒娇赖留（P1 复用现有帧）：期待地看着你 + 小幅摇摆的粘人节奏
  cling: [
    ["happy", 900, 0, 0],
    ["idleWag", 350, 0, 0],
    ["happy", 500, 0, -2],
    ["idleA", 600, 0, 0],
  ],
};

let petState = "idle";
let locale = "zh-CN";
let animStart = performance.now();

// 点击互动反应
let reaction = null;        // { type, start, duration }
let lastReactAt = 0;

function drawFrame(name, ox, oy) {
  const frame = FRAMES[name];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const color = PALETTE[frame[y][x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect((x + ox) * SCALE, (y + oy) * SCALE, SCALE, SCALE);
    }
  }
}

function loop(now) {
  if (reaction) {
    const p = (now - reaction.start) / reaction.duration; // 0→1
    if (p >= 1) {
      reaction = null;
    } else if (reaction.type === "wiggle") {
      drawFrame("idleA", Math.floor(now / 90) % 2 === 0 ? 0 : 1, 0);
    } else if (reaction.type === "jump") {
      drawFrame("idleA", 0, -Math.round(6 * Math.sin(Math.PI * p))); // 跳一下弧线
    } else if (reaction.type === "meow") {
      drawFrame("idleA", 0, 0); // 气泡在 click 时已弹出
    } else if (reaction.type === "roll") {
      drawFrame("roll", Math.floor(now / 140) % 2 === 0 ? 0 : 1, 0); // 侧躺打滚抖
    }
    if (reaction) {
      requestAnimationFrame(loop);
      return;
    }
  }
  const anim = ANIMS[petState] ?? ANIMS.idle;
  const total = anim.reduce((s, f) => s + f[1], 0);
  let t = (now - animStart) % total;
  for (const [name, dur, ox, oy] of anim) {
    if (t < dur) {
      drawFrame(name, ox, oy);
      break;
    }
    t -= dur;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function showBubble(title, cue) {
  titleEl.textContent = title;
  cueEl.textContent = cue ?? "";
  cueEl.style.display = cue ? "" : "none";
  bubble.classList.add("show");
}
function hideBubble() {
  bubble.classList.remove("show");
}

// 托盘操作后的非模态提示（如复制配置 Prompt 后告诉用户粘给谁）
microPet.onHint((h) => {
  showBubble(h.title, h.cue);
  setTimeout(() => { if (petState === "idle" || petState === "happy") hideBubble(); }, 4500);
});

microPet.onState((msg) => {
  locale = msg.locale ?? locale;
  if (msg.pet !== petState) {
    petState = msg.pet;
    animStart = performance.now();
  }
  const s = microPet.strings(locale);
  if (msg.pet === "remind" && msg.exercise) {
    showBubble(`${msg.exercise.emoji} ${msg.exercise.name} · ${s.bubble.letsGo}`, msg.exercise.cue);
  } else if (msg.pet === "session" && msg.exercise) {
    // F25 陪练：倒数 + 当前步骤（主进程每秒推送）；再点猫提前结束也算完成
    showBubble(`⏱ ${msg.sessionRemainSec ?? "?"}s · ${msg.exercise.emoji} ${msg.exercise.name}`, msg.sessionStep ?? "");
  } else if (msg.pet === "cling") {
    // 撒娇赖留：每次 broadcast（含 10 分钟轮换）随机换一句软话——可爱不指责
    const pool = s.bubble.cling ?? [];
    const line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : s.bubble.petMe;
    const ex = msg.exercise;
    showBubble(ex ? `${line}（${ex.emoji} ${ex.name}）` : line, "");
  } else if (msg.pet === "happy") {
    // F28 举牌：今日 N/M（达标庆祝）；连续天数并到副行
    const n = msg.todayCount ?? 0;
    const m = msg.todayGoal;
    const board = m && m > 0
      ? (n >= m ? s.bubble.goalMet : microPet.fmt(s.bubble.todayGoalN, { n, m }))
      : microPet.fmt(s.bubble.todayN, { n });
    const cue = msg.streakDays > 0 ? `${microPet.fmt(s.bubble.good, { n: msg.streakDays })} · ${s.bubble.petMe}` : s.bubble.petMe;
    showBubble(board, cue);
    setTimeout(hideBubble, 3000);
  } else if (msg.pet === "idle") {
    setTimeout(() => { if (petState === "idle") hideBubble(); }, 300);
  }
});

// 拖动：按住猫移动即拖窗口（macOS non-activating 窗口 CSS drag 失效，走手动增量）
// 位移 ≥ 阈值才算拖动；轻点仍触发 click（打卡/反应），拖完的尾随 click 吞掉
const stage = document.getElementById("stage");
let drag = null;               // { startX, startY, moved }
let suppressClickUntil = 0;

stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  drag = { startX: e.clientX, startY: e.clientY, moved: false };
});
// move/up 绑 window 且不用 setPointerCapture：capture 会改写后续事件目标，
// 浏览器合成的 click 不再落在 canvas 上 → 打卡/互动全失效（v0.5.1 回归教训）
// 位移不用 movementX（窗口自身移动后 macOS 补发 mousemove 会污染其语义）：
// 每帧只发信号，坐标权威在主进程 getCursorScreenPoint，按屏幕位绝对差移动，幂等
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.moved) {
    if (!microPet.shouldDrag(drag.startX, drag.startY, e.clientX, e.clientY)) return;
    drag.moved = true;
    microPet.dragStart();
    document.body.classList.add("dragging");
  }
  microPet.dragMove();
});
function endDrag() {
  if (!drag) return;
  if (drag.moved) suppressClickUntil = performance.now() + 300; // pointerup 后 click 仍会派发
  drag = null;
  document.body.classList.remove("dragging");
}
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);
window.addEventListener("blur", endDrag); // 失焦兜底：不许拖拽状态卡死

canvas.addEventListener("click", () => {
  if (performance.now() < suppressClickUntil) return; // 刚拖完，不是点击
  const now = performance.now();
  if (petState === "remind" || petState === "cling" || petState === "session") {
    microPet.petClick(); // remind/cling 点 = 开始会话；session 点 = 提前结束（也算完成）
    return;
  }
  // ：idle/happy 点击 → 随机反应池（500ms 节流）
  const r = microPet.react(lastReactAt, now);
  if (!r) return;
  lastReactAt = now;
  reaction = { type: r, start: now, duration: r === "meow" ? 900 : 700 };
  if (r === "meow") {
    showBubble(microPet.strings(locale).meow, "");
    setTimeout(() => { if (petState === "idle" || petState === "happy") hideBubble(); }, 900);
  }
});

microPet.ready();
