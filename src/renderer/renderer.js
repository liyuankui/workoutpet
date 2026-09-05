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
  } else if (msg.pet === "happy") {
    showBubble(microPet.fmt(s.bubble.good, { n: msg.streakDays }), s.bubble.petMe);
    setTimeout(hideBubble, 2500);
  } else if (msg.pet === "idle") {
    setTimeout(() => { if (petState === "idle") hideBubble(); }, 300);
  }
});

canvas.addEventListener("click", () => {
  const now = performance.now();
  if (petState === "remind") {
    microPet.petClick(); // 打卡走主进程（语义不变）
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
