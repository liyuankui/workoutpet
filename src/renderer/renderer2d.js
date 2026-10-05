// 2D 像素猫渲染层 v2.0 —— Shepardskin sprite（CC0）+ palette swap 7 花色 + 安静哲学
/* global microPet */
const canvas = document.getElementById("view2d");
const ctx = canvas.getContext("2d");
const bubble = document.getElementById("bubble");
const titleEl = bubble.querySelector(".title");
const cueEl = bubble.querySelector(".cue");

const SCALE = 2;
const SHEET_INFO = microPet.sheets();
let coatNow = "cream";
const sheetCache = {}; // coatId → { walk, run, sit }
let sheetReady = false;

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const COAT_COLORS = {
  cream: { body: "#f5c07a", dark: "#d99b4e", light: "#fff1dc" },
  void: { body: "#45414b", dark: "#2e2b33", light: "#5b5663" },
  snow: { body: "#f7f5f2", dark: "#c9c4bd", light: "#ffffff" },
  cow: { body: "#f7f5f2", dark: "#3d3a3f", light: "#ffffff" },
  calico: { body: "#f5c07a", dark: "#3d3a3f", light: "#fff1dc" },
  blue: { body: "#8f9aa8", dark: "#77828f", light: "#c3ccd6" },
  siamese: { body: "#e8d5b5", dark: "#5a4636", light: "#f6ecd9" },
};

async function bakeSheet(name, meta, coatId) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("load " + meta.file));
    img.src = SHEET_INFO.pngs[name];
  });
  // Shepardskin sprite 无 alpha（背景=#a475a0=猫体色）→ 两步：泛洪去背景 → palette swap 换色
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext("2d");
  c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height);
  const px = d.data;
  const W = cv.width, H = cv.height;
  const BG = [0xa4, 0x75, 0xa0]; // 紫灰背景（Shepardskin 原色）
  const TOL = 35;
  const visited = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, 0, x, H - 1); }
  for (let y = 0; y < H; y++) { stack.push(0, y, W - 1, y); }
  while (stack.length > 0) {
    const y = stack.pop(); const x = stack.pop();
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const idx = y * W + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const pi = idx * 4;
    if (Math.abs(px[pi] - BG[0]) < TOL && Math.abs(px[pi+1] - BG[1]) < TOL && Math.abs(px[pi+2] - BG[2]) < TOL) {
      px[pi + 3] = 0; // 透明
      stack.push(x-1, y, x+1, y, x, y-1, x, y+1);
    }
  }
  // palette swap（泛洪后，只改不透明像素）
  const lut = SHEET_INFO.luts[coatId] ?? {};
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const hex = "#" + [px[i], px[i+1], px[i+2]].map(v => v.toString(16).padStart(2,"0")).join("");
    const dst = lut[hex];
    if (dst) {
      px[i] = parseInt(dst.slice(1,3),16);
      px[i+1] = parseInt(dst.slice(3,5),16);
      px[i+2] = parseInt(dst.slice(5,7),16);
    }
  }
  c.putImageData(d, 0, 0);
  return cv;
}

(async () => {
  if (!SHEET_INFO.meta) return;
  for (const coatId of Object.keys(COAT_COLORS)) {
    sheetCache[coatId] = {};
    for (const [name, meta] of Object.entries(SHEET_INFO.meta.sheets)) {
      try { sheetCache[coatId][name] = await bakeSheet(name, meta, coatId); } catch { }
    }
  }
  sheetReady = true;
})();

let currentSheet = "sit";
let currentFrame = 0;
let frameTimer = 0;

function drawSheet(name, frame, ox = 0, oy = 0) {
  const meta = SHEET_INFO.meta?.sheets[name];
  const cv = (sheetCache[coatNow] ?? {})[name];
  if (!meta || !cv) return false;
  const f = Math.max(0, Math.min(Math.floor(frame), meta.frames - 1));
  ctx.imageSmoothingEnabled = false;
  const dw = meta.frameW * SCALE, dh = meta.frameH * SCALE;
  ctx.drawImage(cv, f * meta.frameW, 0, meta.frameW, meta.frameH, ox, oy + 8, dw, dh);
  return true;
}

// ---------- 状态动画 ----------
let petState = "idle";
let walking = false;
let act2d = null;
let personaPool = "clingy";
let locale2d = "zh-CN";
let dragSt = null;
let bubbleOn = false;
const clock = { t: 0, last: performance.now() };

function setPet(state) { petState = state; }

function tickPet(dt) {
  const t = clock.t;
  let sheet = "sit", frame = 0, ox = 0, oy = 0;
  const meta = SHEET_INFO.meta?.sheets;

  if (petState === "idle" && !act2d) {
    // 睡觉：静止（安静哲学——不动画）
    sheet = "sit"; frame = 0;
    oy = 0;
  } else if (petState === "idle" && act2d) {
    sheet = "sit"; frame = 0; // 醒了但坐着
  } else if (petState === "walk" || walking) {
    sheet = "walk";
    frame = Math.floor(t * (meta?.walk?.fps ?? 8)) % (meta?.walk?.frames ?? 1);
    oy = Math.round(Math.sin(t * 8) * 2); // 走路颠簸
  } else if (petState === "run") {
    sheet = "run";
    frame = Math.floor(t * (meta?.run?.fps ?? 10)) % (meta?.run?.frames ?? 1);
  } else if (petState === "remind" || petState === "session") {
    sheet = "run";
    frame = Math.floor(t * 4) % (meta?.run?.frames ?? 1);
    ox = -Math.round(4 * Math.sin(t * 2.7));
  } else if (petState === "happy") {
    sheet = "walk";
    frame = 0;
    oy = -Math.round(6 * Math.abs(Math.sin(t * 4)));
  } else if (petState === "cling") {
    sheet = "sit"; frame = 0;
    ox = Math.round(3 * Math.sin(t * 1.5));
  }

  // act2d 覆盖
  if (act2d) {
    const at = (performance.now() - act2d.start) / 1000;
    if (act2d.type === "jump") { if (at > 1.0) { act2d = null; } else { oy = -Math.round(12 * Math.sin(Math.PI * at / 1.0)); sheet = "sit"; frame = 0; } }
    else if (act2d.type === "roll") { if (at > 1.8) { act2d = null; } else { ox = Math.round(6 * Math.sin(at * 5)); sheet = "run"; frame = Math.floor(t * 12) % (meta?.run?.frames ?? 1); } }
    else if (act2d.type === "wiggle") { if (at > 0.8) { act2d = null; } else { ox = Math.round(5 * (Math.floor(performance.now() / 80) % 2 ? 1 : -1)); sheet = "sit"; frame = 0; } }
    else if (act2d.type === "meow") { if (at > 0.9) { act2d = null; } else { oy = -Math.round(3 * Math.sin(Math.PI * at / 0.9)); sheet = "sit"; frame = 0; } }
    else if (act2d.type === "hop") { if (at > 5) { act2d = null; } else { const ph = at % 2.0; oy = ph < 0.35 ? -Math.round(12 * Math.sin(Math.PI * ph / 0.35)) : ph < 0.7 ? -Math.round(10 * Math.sin(Math.PI * (ph - 0.35) / 0.35)) : 0; sheet = "sit"; frame = 0; } }
    else if (act2d.type === "mouse") { if (at > 6) { act2d = null; } else { sheet = "run"; frame = Math.floor(t * 10) % (meta?.run?.frames ?? 1); if (at >= 4.5 && at < 5.5) oy = -Math.round(12 * Math.sin(Math.PI * (at - 4.5))); } }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSheet(sheet, frame, ox, oy);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = (now - clock.last) / 1000;
  clock.last = now;
  clock.t += dt;
  tickPet(dt);
}
requestAnimationFrame(loop);

// ---------- 行为事件 ----------
microPet.onState((msg) => {
  locale2d = msg.locale ?? locale2d;
  if (msg.pool) personaPool = msg.pool;
  if (msg.coatId && msg.coatId !== coatNow) { coatNow = msg.coatId; }
  walking = !!msg.walking;
  if (walking) setPet("walk"); else setPet(msg.pet);
  const s = microPet.strings(locale2d);
  if (msg.walking) hideBubble();
  else if (msg.pet === "remind" && msg.exercise) showBubble(`${msg.exercise.emoji} ${msg.exercise.name} · ${s.bubble.letsGo}`, msg.exercise.cue);
  else if (msg.pet === "happy") { showBubble(microPet.fmt(s.bubble.good, { n: msg.streakDays }), s.bubble.petMe); setTimeout(() => { if (petState !== "happy") hideBubble(); }, 2600); }
  else if (msg.pet === "cling") { const pool = (s.bubble.clingPools || {})[personaPool] || s.bubble.cling || []; if (pool.length) showBubble(pool[Math.floor(Math.random() * pool.length)], ""); setTimeout(() => { if (petState === "cling") hideBubble(); }, 8000); }
  else if (msg.pet === "idle") setTimeout(() => { if (petState === "idle") hideBubble(); }, 300);
});
microPet.onHint((h) => { showBubble(h.title, h.cue); setTimeout(() => hideBubble(), 4500); });

function showBubble(title, cue) {
  titleEl.textContent = title; cueEl.textContent = cue ?? ""; cueEl.style.display = cue ? "" : "none";
  bubble.classList.add("show"); if (!bubbleOn) { bubbleOn = true; microPet.bubbleBox(true); }
}
function hideBubble() {
  bubble.classList.remove("show"); if (bubbleOn) { bubbleOn = false; microPet.bubbleBox(false); }
}

function playAct2d(type) {
  act2d = { type, start: performance.now() };
}

microPet.onReaction((type) => {
  if (["wiggle", "jump", "meow", "roll"].includes(type)) {
    playAct2d(type);
    if (type === "meow") {
      const strs = microPet.strings(locale2d);
      const pool = (strs.bubble.meowPools || {})[personaPool] || [strs.meow];
      showBubble(pool[Math.floor(Math.random() * pool.length)], "");
      setTimeout(() => hideBubble(), 900);
    }
  }
});
microPet.onSkit((msg) => { playAct2d(msg.type); });
microPet.onPoseDemo((kind) => { playAct2d(kind === "walk" ? "wiggle" : kind); });

// 明信片
microPet.onPostcard((req) => {
  const pc = document.createElement("canvas");
  pc.width = 128; pc.height = 96;
  const pctx = pc.getContext("2d");
  const sp = req.spot;
  pctx.fillStyle = sp.sky; pctx.fillRect(0, 0, 128, 96);
  pctx.fillStyle = sp.land; pctx.fillRect(0, 64, 128, 32);
  pctx.fillStyle = "rgba(255,255,255,0.7)";
  pctx.fillRect(8, 8, 2, 2); pctx.fillRect(24, 14, 2, 2); pctx.fillRect(110, 10, 2, 2);
  pctx.fillStyle = sp.land;
  switch (sp.shape) {
    case "pagoda": pctx.fillRect(56, 24, 16, 40); pctx.fillRect(52, 34, 24, 4); break;
    case "towers": pctx.fillRect(30, 30, 12, 34); pctx.fillRect(48, 16, 16, 48); break;
    default: pctx.fillRect(40, 40, 50, 24);
  }
  try { pctx.imageSmoothingEnabled = false; pctx.drawImage(canvas, 92, 48, 27, 31); } catch { }
  microPet.sendPostcard(pc.toDataURL("image/png"));
});

// 拖动
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  dragSt = { startX: e.clientX, startY: e.clientY, moved: false };
});
window.addEventListener("pointermove", (e) => {
  if (!dragSt) return;
  if (!dragSt.moved) {
    if (!microPet.shouldDrag(dragSt.startX, dragSt.startY, e.clientX, e.clientY)) return;
    dragSt.moved = true; microPet.dragStart();
  }
  microPet.dragMove();
});
function endDrag() { dragSt = null; }
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);
canvas.addEventListener("click", () => { if (dragSt?.moved) return; microPet.petClick(); });

microPet.ready();
