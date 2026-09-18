// 渲染端：像素猫动画 + 气泡 + 点击互动反应（状态权威在 main 进程，sprite/文案经 preload 注入）
/* global microPet */
let { PALETTE, GRID, FRAMES, SPRITE_ID } = microPet.sprites(); // FRAMES 仅明信片缩样使用；主渲染已全部件化
const SCALE = 3; // 兼容值（老鼠/明信片缩样仍按格 ×3）

const canvas = document.getElementById("cat");
const ctx = canvas.getContext("2d");
const bubble = document.getElementById("bubble");
const titleEl = bubble.querySelector(".title");
const cueEl = bubble.querySelector(".cue");

const LIFT_PAD = 26; // canvas 顶部跳跃/浮动预留（跳 18px + 余量），无此垫即被 canvas 裁

let petState = "idle";
let locale = "zh-CN";
let personaPool = "clingy"; // 当前猫的性情文案池
let animStart = performance.now();

// 点击互动反应
let reaction = null;        // { type, start, duration }
let lastReactAt = 0;

// 小剧场（F27）：主进程择时开演，自导自演 8s（用户交互 reaction 优先于剧场）
// ── F37 sprite sheet 引擎：现成素材（CC0 专业像素猫）× palette swap 烘焙 ──
const SCALE2 = 3; // sheet 像素 × 3（walk 36→108、sit 46×50→138×150）
const SHEET_INFO = microPet.sheets();
let coatNow = "cream";
const sheetCache = {}; // coatId → { walk/run/sit: 烘好的 canvas }
let sheetReady = false;

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

async function bakeSheet(name, meta, lut) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("load " + meta.file));
    i.src = SHEET_INFO.pngs[name]; // dataURL（asar 内 file:// 不可读）
  });
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext("2d");
  c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < d.data.length; i += 4) {
    if (!d.data[i + 3]) continue;
    const hex = "#" + [d.data[i], d.data[i + 1], d.data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    const dst = lut[hex];
    if (dst) { const [r, g, b] = hexToRgb(dst); d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; }
  }
  c.putImageData(d, 0, 0);
  return cv;
}

(async () => {
  if (!SHEET_INFO.meta) return;
  for (const [coatId, lut] of Object.entries(SHEET_INFO.luts)) {
    sheetCache[coatId] = {};
    for (const [name, meta] of Object.entries(SHEET_INFO.meta.sheets)) {
      try { sheetCache[coatId][name] = await bakeSheet(name, meta, lut); } catch (e) { console.warn("sheet bake fail", name, e); }
    }
  }
  sheetReady = true;
})();

/** 播一帧：drawImage 最近邻放大（imageSmoothing 关） */
// 每 sheet 的头部像素锚（乘 SCALE2 前的格位）——装扮跟头
const SHEET_HEAD = { walk: [10, 6], run: [12, 8], sit: [14, 8] };
function drawSheet(name, frame, ox = 0, oy = 0) {
  const meta = SHEET_INFO.meta?.sheets[name];
  const cv = (sheetCache[coatNow] ?? {})[name];
  if (!meta || !cv) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, frame * meta.frameW, 0, meta.frameW, meta.frameH, ox, oy + LIFT_PAD, meta.frameW * SCALE2, meta.frameH * SCALE2);
  drawOutfitOnSheet(name, meta, ox, oy);
  return true;
}

function drawOutfitOnSheet(name, meta, ox, oy) {
  const o = OUTFITS[outfit];
  if (!o) return;
  const [hx, hy] = SHEET_HEAD[name] ?? [14, 8];
  // outfit art 格 ×SCALE2；帽/结贴头，围巾贴颈（头下 6 格）
  let px = (hx - 1) * SCALE2 + ox;
  let py = (hy - o.art.length) * SCALE2 + oy + LIFT_PAD;
  if (o.anchor === "neck") py = (hy + 6) * SCALE2 + oy + LIFT_PAD;
  for (let y = 0; y < o.art.length; y++) for (let x = 0; x < o.art[y].length; x++) {
    const color = OPAL[o.art[y][x]];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fillRect(px + x * SCALE2, py + y * SCALE2, SCALE2, SCALE2);
  }
}

/** 状态动画：每状态返回 {sheet, frame, ox, oy}（帧表驱动 + 位移律动） */
function sheetPose(state, now) {
  const t = now / 1000;
  const frameAt = (name) => Math.floor((t * (SHEET_INFO.meta?.sheets[name]?.fps ?? 8)) % (SHEET_INFO.meta?.sheets[name]?.frames ?? 1));
  if (state === "walk") return { sheet: "walk", frame: frameAt("walk"), ox: 0, oy: 0 };
  if (state === "run") return { sheet: "run", frame: frameAt("run"), ox: 0, oy: 0 };
  // 以下以坐姿为基底 + 位移律动（素材动画待补：Elthen 全集到位后接 sleep/jump/scared 帧表）
  let ox = 0, oy = 0;
  if (state === "idle") oy = Math.round(1.2 * Math.sin(now / 650));
  else if (state === "remind" || state === "session") { const k = Math.sin(Math.PI * ((t % 2.7) / 2.7)); ox = -Math.round(4 * k); oy = Math.round(1 * k); }
  else if (state === "happy") { const b = Math.abs(Math.sin(t * 6)); oy = -Math.round(7 * b); }
  else if (state === "cling") { ox = Math.round(2 * Math.sin(now / 900)); }
  return { sheet: "sit", frame: 0, ox, oy };
}

const MOUSE = microPet.mouse();
const { OUTFITS, PALETTE: OPAL } = microPet.outfits();
let outfit = null; // 当前装扮 id
const SKIT_MS = 8000;
let skit = null;            // { type, start, caught }

function drawMouse(frame, px, py) {
  const pal = MOUSE.PALETTE;
  for (let y = 0; y < MOUSE.H; y++) {
    for (let x = 0; x < MOUSE.W; x++) {
      const color = pal[frame[y][x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(px + x * SCALE, py + y * SCALE, SCALE, SCALE);
    }
  }
}

// 剧场绘制：返回 true 表示正在演（loop 里优先于常规动画、次于 reaction）
function playSkit(now) {
  if (!skit) return false;
  const t = (now - skit.start) / 1000;
  if (t * 1000 >= SKIT_MS) {
    const caught = skit.caught;
    skit = null;
    if (caught) {
      const strs = microPet.strings(locale);
      showBubble(microPet.fmt(strs.bubble.caughtLine ?? "抓到啦！小鱼干 +1 🐟", {}), "");
      setTimeout(() => { if (petState === "idle") hideBubble(); }, 2600);
    }
    return false;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (skit.type === "mouse") {
    // 老鼠横穿：前 5s 匀速走完全程 2/3，后段加速逃命出画——全程猫鼠同框
    const mx = t < 5 ? -40 + t * 20 : 60 + (t - 5) * 55;
    const mouseFrame = MOUSE.FRAMES[Math.floor(now / 140) % 2 ? "mouseA" : "mouseB"];
    const mouseVisible = mx < 128;
    if (mouseVisible) drawMouse(mouseFrame, mx, 142);
    let oy = 0;
    let catSheet = "run";
    let catOy = 0;
    if (t >= 5 && t < 6.2 && mouseVisible) { // 扑！
      oy = -Math.round(14 * Math.sin(Math.PI * (t - 5) / 1.2));
      catSheet = "sit";
    } else if (t >= 6.2) {
      catSheet = "sit";
      catOy = skit.caught ? -3 : 0; // 抓到：得意微跳；扑空：蔫坐
    }
    const catOx = Math.max(-44, Math.min(24, mx - 60)); // 紧追其后
    drawSheet(catSheet, catSheet === "run" ? Math.floor(now / 100) % 6 : 0, catOx, oy + catOy);
    if (t < 5) drawSpeedLines(now, catOx);
  } else if (skit.type === "mouse" && skit.caught && t >= 7.6 && t < 8.4) {
    drawSheet("sit", 0, 0, -4); // 谢幕叼鱼干
    return true;
  } else if (skit.type === "hop") {
    // hop 剧场：两连蹦 + 期待（sheet 律动）
    const phase = t % 2.6;
    const hop = phase < 0.5 ? -Math.round(16 * Math.sin(Math.PI * phase / 0.5))
      : phase < 1.0 ? -Math.round(12 * Math.sin(Math.PI * (phase - 0.5) / 0.5)) : 0;
    drawSheet("sit", 0, 0, hop);
  }
  return true;
}

microPet.onSkit((msg) => {
  if (petState === "idle") skit = { type: msg.type, start: performance.now(), caught: !!msg.caught };
});



function drawSpeedLines(now, ox) {
  const flick = Math.floor(now / 80) % 3; // 闪烁节拍
  ctx.fillStyle = "rgba(74,59,50,0.35)";
  const baseX = 64 + ox;
  const lines = [
    { y: 40 + flick * 2, len: 14 },
    { y: 60 - flick * 2, len: 10 },
    { y: 84 + flick, len: 12 },
  ];
  for (const l of lines) ctx.fillRect(baseX + 20, l.y, l.len, 3);
}

function loop(now) {
  if (!reaction && playSkit(now)) { // 小剧场（用户点了猫则让位于 reaction）
    requestAnimationFrame(loop);
    return;
  }
  if (!reaction && playPoseDemo(now)) { // 部件化 demo（F36）
    requestAnimationFrame(loop);
    return;
  }
  if (reaction) {
    const p = (now - reaction.start) / reaction.duration; // 0→1
    if (p >= 1) {
      reaction = null;
    } else if (reaction.type === "wiggle") {
      const dir = Math.floor(now / 90) % 2 === 0 ? 1 : -1;
      drawSheet("sit", 0, 3 * dir, 0); // 左右蹭
    } else if (reaction.type === "meow") {
      drawSheet("sit", 0, 0, -1); // 微仰喵
    }
    if (reaction) {
      requestAnimationFrame(loop);
      return;
    }
  }
  // F37：现成素材帧表播放（部件/骨架/自绘全退役——代码只负责让它活）
  const sp = sheetPose(petState, now);
  if (!drawSheet(sp.sheet, sp.frame, sp.ox, sp.oy)) {
    // 烘焙未就绪兜底：原色 sit 直接画
  }
  if (petState === "walk") drawSpeedLines(now, 0);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

let bubbleOn = false;
function showBubble(title, cue) {
  titleEl.textContent = title;
  cueEl.textContent = cue ?? "";
  cueEl.style.display = cue ? "" : "none";
  bubble.classList.add("show");
  if (!bubbleOn) { bubbleOn = true; microPet.bubbleBox(true); } // 通知主进程扩窗（idle 小窗时才生效；已开不重发）
}
function hideBubble() {
  bubble.classList.remove("show");
  if (bubbleOn) { bubbleOn = false; microPet.bubbleBox(false); }
}

// 演示菜单：直发反应（绕过节流——手动触发测试用）
microPet.onReaction((type) => {
  const now = performance.now();
  if (!["wiggle", "jump", "meow", "roll"].includes(type)) return;
  reaction = { type, start: now, duration: type === "meow" ? 900 : 700 };
  if (type === "meow") {
    showBubble(microPet.strings(locale).meow, "");
    setTimeout(() => { if (petState === "idle" || petState === "happy") hideBubble(); }, 900);
  }
});

microPet.onPoseDemo((kind) => {
  if (petState === "idle") poseDemo = { kind, start: performance.now() };
});

// 托盘操作后的非模态提示（如复制配置 Prompt 后告诉用户粘给谁）
microPet.onHint((h) => {
  showBubble(h.title, h.cue);
  setTimeout(() => { if (petState === "idle" || petState === "happy") hideBubble(); }, 4500);
});

microPet.onState((msg) => {
  locale = msg.locale ?? locale;
  if (msg.outfit !== undefined) outfit = msg.outfit;
  if (msg.coatId) coatNow = msg.coatId;
  if (msg.pool) personaPool = msg.pool;
  // 走位中（外出/跑回）：播跑动帧，状态切换冻结（bob 不适用）
  const shown = msg.walking ? "walk" : msg.pet;
  if (shown !== "idle" && skit) skit = null; // 提醒/走位/会话等正戏优先，剧场即让位
  if (msg.spriteId && msg.spriteId !== SPRITE_ID) {
    // 换宠物：重取 sprite 集（网格/色板/帧全换，动画状态照常）
    ({ PALETTE, GRID, FRAMES, SPRITE_ID } = microPet.sprites(msg.spriteId));
  }
  if (shown !== petState) {
    petState = shown;
    animStart = performance.now();
  }
  const s = microPet.strings(locale);
  if (msg.walking) {
    hideBubble(); // 走位中不弹话
  } else if (msg.pet === "remind" && msg.exercise) {
    showBubble(`${msg.exercise.emoji} ${msg.exercise.name} · ${s.bubble.letsGo}`, msg.exercise.cue);
  } else if (msg.pet === "session" && msg.exercise) {
    // F25 陪练：倒数 + 当前步骤（主进程每秒推送）；再点猫提前结束也算完成
    showBubble(`⏱ ${msg.sessionRemainSec ?? "?"}s · ${msg.exercise.emoji} ${msg.exercise.name}`, msg.sessionStep ?? "");
  } else if (msg.pet === "cling") {
    // 撒娇赖留：按性情选池随机一句；显示 8 秒自隐（不糊屏），10 分钟轮换再亮
    const pool = (s.bubble.clingPools && s.bubble.clingPools[personaPool]) || s.bubble.cling || [];
    const line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : s.bubble.petMe;
    const ex = msg.exercise;
    showBubble(ex ? `${line}（${ex.emoji} ${ex.name}）` : line, "");
    setTimeout(() => { if (petState === "cling") hideBubble(); }, 8000);
  } else if (msg.pet === "happy") {
    // F28 举牌：今日 N/M（达标庆祝）；连续天数并到副行
    const n = msg.todayCount ?? 0;
    const m = msg.todayGoal;
    const kind = m && m > 0 ? (n >= m ? "met" : "goalN") : "plainN";
    const board = kind === "met" ? s.bubble.goalMet
      : kind === "goalN" ? microPet.fmt(s.bubble.todayGoalN, { n, m })
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
  if (r === "roll" || r === "jump") {
    // 部件路径（F36）：打滚/跳跃由部件拼装演出——帽子随头部件，永不悬空
    poseDemo = { kind: r, start: now };
    return;
  }
  reaction = { type: r, start: now, duration: r === "meow" ? 900 : 700 };
  if (r === "meow") {
    const strs = microPet.strings(locale);
    const pool = (strs.bubble.meowPools && strs.bubble.meowPools[personaPool]) || [strs.meow];
    showBubble(pool[Math.floor(Math.random() * pool.length)], "");
    setTimeout(() => { if (petState === "idle" || petState === "happy") hideBubble(); }, 900);
  }
});

microPet.ready();

// ── F33 明信片渲染：景点剪影 + 当前猫，128×96 离屏作画回传 ──
microPet.onPostcard((req) => {
  const pc = document.createElement("canvas");
  pc.width = 128; pc.height = 96;
  const pctx = pc.getContext("2d");
  const sp = req.spot;
  // 天空 + 地面
  pctx.fillStyle = sp.sky; pctx.fillRect(0, 0, 128, 96);
  pctx.fillStyle = sp.land; pctx.fillRect(0, 64, 128, 32);
  pctx.fillStyle = "rgba(255,255,255,0.7)"; pctx.fillRect(8, 8, 2, 2); pctx.fillRect(24, 14, 2, 2); pctx.fillRect(110, 10, 2, 2); // 星/灯点
  const D = sp.land;
  pctx.fillStyle = D;
  // 地标剪影（像素块语言，每形状 8-14 块）
  switch (sp.shape) {
    case "pagoda": // 三层塔
      pctx.fillRect(56, 24, 16, 40); pctx.fillRect(52, 34, 24, 4); pctx.fillRect(52, 44, 24, 4); pctx.fillRect(48, 54, 32, 4); pctx.fillRect(62, 14, 4, 10); break;
    case "towers": // 楼群
      pctx.fillRect(30, 30, 12, 34); pctx.fillRect(48, 16, 16, 48); pctx.fillRect(70, 36, 14, 28); pctx.fillRect(90, 24, 12, 40); break;
    case "bridge": // 拱桥（西湖备用形）
      pctx.fillRect(30, 50, 68, 6); pctx.fillRect(40, 56, 6, 8); pctx.fillRect(82, 56, 6, 8); pctx.fillRect(50, 44, 28, 6); break;
    case "bamboo": // 竹丛
      for (const [x, h] of [[40, 34], [50, 42], [62, 30], [76, 40]]) { pctx.fillRect(x, 64 - h, 4, h); pctx.fillRect(x - 4, 66 - h, 12, 3); } break;
    case "wall": // 城墙垛口
      pctx.fillRect(20, 44, 88, 20); for (let x = 20; x < 108; x += 12) pctx.fillRect(x, 38, 7, 6); break;
    case "palace": // 飞檐大殿
      pctx.fillRect(38, 48, 52, 16); pctx.fillRect(30, 44, 68, 4); pctx.fillRect(46, 36, 36, 8); pctx.fillRect(58, 26, 12, 10); break;
    case "island": // 岛屿日光
      pctx.fillRect(16, 60, 96, 4); pctx.fillStyle = "#f2dfa8"; pctx.fillRect(96, 16, 14, 14); break;
    case "snow": // 雪松雪原
      pctx.fillStyle = "#f0f4f8"; pctx.fillRect(0, 60, 128, 4);
      pctx.fillStyle = D; pctx.fillRect(24, 40, 8, 20); pctx.fillRect(48, 30, 10, 30); pctx.fillRect(78, 44, 8, 16); break;
    case "beach": // 棕榈海滩
      pctx.fillRect(88, 44, 5, 20); pctx.fillRect(76, 40, 28, 5); pctx.fillRect(80, 34, 10, 6); pctx.fillStyle = "#7fc8d8"; pctx.fillRect(0, 66, 60, 4); break;
    case "desk": // 显示器与杯子
      pctx.fillRect(34, 32, 44, 26); pctx.fillStyle = "#e8e4dc"; pctx.fillRect(38, 36, 36, 18); pctx.fillStyle = D; pctx.fillRect(52, 58, 8, 5); pctx.fillRect(86, 48, 8, 10); break;
    case "printer": // 打印机
      pctx.fillRect(38, 36, 40, 16); pctx.fillRect(44, 52, 28, 8); pctx.fillStyle = "#ffffff"; pctx.fillRect(46, 30, 24, 8); break;
  }
  // 猫贴右下（sheet sit 缩样，经 palette swap）
  (async () => {
    for (let waited = 0; !sheetReady && waited < 20; waited++) await new Promise((r) => setTimeout(r, 100));
    const cv = (sheetCache[coatNow] ?? Object.values(sheetCache)[0] ?? {})?.sit;
    if (cv) {
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(cv, 0, 0, 46, 50, 92, 48, 27, 30); // 右下角缩样
    }
    microPet.sendPostcard(pc.toDataURL("image/png"));
  })();
});

// ── F36 部件化 cutout demo：拼装渲染 + 帽挂头部件 + 三动作（walk/roll/jump） ──
let poseDemo = null; // { kind: "walk"|"roll"|"jump", start }



// 状态 pose 动画（F36 全迁移）：骨架帧退役，一切姿态=部件拼装

function playPoseDemo(now) {
  if (!poseDemo) return false;
  const t = (now - poseDemo.start) / 1000;
  if (t > 2.6) { poseDemo = null; return false; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (poseDemo.kind === "roll") {
    drawSheet("run", Math.floor(now / 80) % 6, 0, 4);   // 原地疾跑（roll 素材待补）
  } else if (poseDemo.kind === "jump") {
    drawSheet("sit", 0, 0, -Math.round(18 * Math.sin(Math.PI * Math.min(1, t / 2.6))));
  } else {
    drawSheet("walk", Math.floor(now / 120) % 6, 0, 0);
  }
  return true;
}
