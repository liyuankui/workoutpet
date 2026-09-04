// 渲染端：像素猫动画 + 气泡 + 摸头交互（状态权威在 main 进程，sprite 经 preload 注入）
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
let animStart = performance.now();
let wiggleUntil = 0;

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
  if (now < wiggleUntil) {
    // 蹭蹭：快速左右抖
    const ox = Math.floor(now / 90) % 2 === 0 ? 0 : 1;
    drawFrame("idleA", ox, 0);
    requestAnimationFrame(loop);
    return;
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
  bubble.classList.add("show");
}
function hideBubble() {
  bubble.classList.remove("show");
}

microPet.onState((msg) => {
  if (msg.pet !== petState) {
    petState = msg.pet;
    animStart = performance.now();
  }
  if (msg.pet === "remind" && msg.exercise) {
    showBubble(`${msg.exercise.emoji} ${msg.exercise.name} · 一起来`, msg.exercise.cue);
  } else if (msg.pet === "happy") {
    showBubble(`好样的！连续第 ${msg.streakDays} 天 🎉`, "摸摸头～");
    setTimeout(hideBubble, 2500);
  } else if (msg.pet === "idle") {
    setTimeout(() => { if (petState === "idle") hideBubble(); }, 300);
  }
  if (msg.wiggle) wiggleUntil = performance.now() + 700; // 蹭蹭反馈
});

canvas.addEventListener("click", () => {
  if (petState === "idle" || petState === "happy") wiggleUntil = performance.now() + 700;
  microPet.petClick();
});

microPet.ready();
