// 渲染端：像素猫动画 + 气泡 + 点击互动反应（状态权威在 main 进程，sprite/文案经 preload 注入）
/* global microPet */
let { PALETTE, GRID, FRAMES, SPRITE_ID } = microPet.sprites(); // FRAMES 仅明信片缩样使用；主渲染已全部件化
const SCALE = 4; // 32 × 4 = 128px（32×32 高精网格）

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
    if (mouseVisible) drawMouse(mouseFrame, mx, 128);
    let oy = 0;
    let catState = "walk";
    if (t >= 5 && t < 6.2 && mouseVisible) { // 扑！
      oy = -Math.round(14 * Math.sin(Math.PI * (t - 5) / 1.2));
      catState = "happy";
    } else if (t >= 6.2) {
      catState = skit.caught ? "happy" : "cling"; // 抓到：得意蹦跳；扑空：歪头求安慰
      if (skit.caught && t < 6.6) oy = -6;
    }
    const catOx = Math.max(-44, Math.min(30, mx - 66)); // 紧追其后
    drawPose(poseNow(catState, now), catOx, oy);
    if (t < 5) drawSpeedLines(now, catOx);
  } else if (skit.type === "mouse" && skit.caught && t >= 7.6 && t < 8.4) {
    // 谢幕：叼着战利品亮个相（部件 happy + 微跳）
    drawPose(poseNow("happy", now), 0, -4);
    return true;
  } else if (skit.type === "hop") {
    // hop 剧场：两连蹦 + 歪头期待（部件）
    const phase = t % 2.6;
    if (phase < 0.5) drawPose(poseNow("happy", now), 0, -Math.round(16 * Math.sin(Math.PI * phase / 0.5)));
    else if (phase < 1.0) drawPose(poseNow("happy", now), 0, -Math.round(12 * Math.sin(Math.PI * (phase - 0.5) / 0.5)));
    else drawPose(poseNow("cling", now)); // 歪头期待
  }
  return true;
}

microPet.onSkit((msg) => {
  if (petState === "idle") skit = { type: msg.type, start: performance.now(), caught: !!msg.caught };
});

function drawOutfit(ox, oy) {
  const o = OUTFITS[outfit];
  if (!o) return;
  for (let y = 0; y < o.art.length; y++) {
    for (let x = 0; x < o.art[y].length; x++) {
      const color = OPAL[o.art[y][x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect((o.gx + x) * SCALE + ox, (o.gy + y) * SCALE + oy + LIFT_PAD, SCALE, SCALE);
    }
  }
}


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
      // 部件蹭蹭：身体左右歪 + 头反向 + 双耳交错（替代 1px 抖）
      const dir = Math.floor(now / 90) % 2 === 0 ? 1 : -1;
      const p = poseNow("idle", now);
      p.body.x += 2 * dir;
      p.head.x -= dir;
      p.earL.y += dir;
      p.earR.y -= dir;
      drawPose(p);
    } else if (reaction.type === "meow") {
      const p = poseNow("idle", now);
      p.head.y -= 1; // 微仰头喵一声
      drawPose(p);
    }
    if (reaction) {
      requestAnimationFrame(loop);
      return;
    }
  }
  // 全迁移（F36）：一切状态由部件拼装——骨架帧退役
  const p = poseNow(petState, now);
  drawPose(p);
  if (petState === "walk") drawSpeedLines(now, 0); // 走位拖尾
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
  // 猫贴右下（当前 sprite 的 idleA，2px 格）
  const sprite = microPet.sprites(req.spriteId);
  const pal = sprite.PALETTE;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const ch = sprite.FRAMES.idleA[y][x];
      const color = pal[ch];
      if (!color) continue;
      pctx.fillStyle = color;
      pctx.fillRect(88 + (x >> 2) * 3, 56 + (y >> 2) * 3, 3, 3); // 8×8 缩样
    }
  }
  microPet.sendPostcard(pc.toDataURL("image/png"));
});

// ── F36 部件化 cutout demo：拼装渲染 + 帽挂头部件 + 三动作（walk/roll/jump） ──
const { PARTS: PT, SIT_POSE: SIT } = microPet.parts();
let poseDemo = null; // { kind: "walk"|"roll"|"jump", start }

function drawPart(art, gx, gy, ox = 0, oy = 0) {
  for (let y = 0; y < art.length; y++) {
    for (let x = 0; x < art[y].length; x++) {
      const color = PALETTE[art[y][x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect((gx + x) * SCALE + ox, (gy + y) * SCALE + oy + LIFT_PAD, SCALE, SCALE);
    }
  }
}

function drawPose(p, ox = 0, oy = 0) {
  // 尾 → 身 → 头 → 耳（耳在头坐标系内！帽子随后挂头）
  drawPart(p.tail.wag ? PT.tailWag.art : PT.tailUp.art, p.tail.x, p.tail.y, ox, oy);
  drawPart(PT.body.art, p.body.x, p.body.y, ox, oy);
  const headArt = p.headKind === "blink" ? PT.headBlink.art : p.headKind === "plead" ? PT.headPlead.art : PT.head.art;
  drawPart(headArt, p.head.x, p.head.y, ox, oy);
  drawPart(PT.earL.art, p.earL.x + p.head.x - SIT.head.x, p.earL.y + p.head.y - SIT.head.y + (p.earL.down ? 2 : 0), ox, oy);
  drawPart(PT.earR.art, p.earR.x + p.head.x - SIT.head.x, p.earR.y + p.head.y - SIT.head.y + (p.earR.down ? 2 : 0), ox, oy);
  drawPart(PT.paw.art, p.pawL.x, p.pawL.y, ox, oy);
  drawPart(PT.paw.art, p.pawR.x, p.pawR.y, ox, oy);
  // 装扮部件挂载（F36）：按 anchor 跟随头/颈/身——任何动作永不悬空
  const o = OUTFITS[outfit];
  if (o) {
    let hx = o.gx, hy = o.gy;
    if (o.anchor === "head") { hx += p.head.x - SIT.head.x; hy += p.head.y - SIT.head.y; }
    else if (o.anchor === "neck") { hx += p.head.x - SIT.head.x; hy += Math.round((p.head.y - SIT.head.y) / 2) + 3; } // 颈点：头身各半+跟身
    else { hx += p.body.x - SIT.body.x; hy += p.body.y - SIT.body.y; }
    for (let y = 0; y < o.art.length; y++) for (let x = 0; x < o.art[y].length; x++) {
      const color = OPAL[o.art[y][x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect((hx + x) * SCALE + ox, (hy + y) * SCALE + oy + LIFT_PAD, SCALE, SCALE);
    }
  }
}

// 状态 pose 动画（F36 全迁移）：骨架帧退役，一切姿态=部件拼装
function poseNow(state, now) {
  const p = { ...SIT, head: { ...SIT.head }, earL: { ...SIT.earL }, earR: { ...SIT.earR }, body: { ...SIT.body }, tail: { ...SIT.tail }, pawL: { ...SIT.pawL }, pawR: { ...SIT.pawR } };
  const t = now / 1000;
  if (state === "idle") {
    // 三层微动：头呼吸起伏 + 尾常摆 + 周期眨眼
    p.head.y += Math.round(1.2 * Math.sin(now / 650));
    p.tail.wag = Math.floor(now / 900) % 2 === 0;
    if (t % 3.4 > 3.26) p.headKind = "blink";
  } else if (state === "remind" || state === "session") {
    // 拉伸插值：前倾→伸展→回（周期 2.7s），会话时点缀 happy 头
    const k = Math.sin(Math.PI * ((t % 2.7) / 2.7)); // 0→1→0
    p.body.x -= Math.round(3 * k);       // 前倾
    p.head.x += Math.round(4 * k);       // 头前伸引导
    p.head.y += Math.round(2 * k);
    p.pawL.x -= Math.round(5 * k);       // 前爪探出
    p.pawR.x -= Math.round(4 * k);
    p.tail.wag = k > 0.5;
    if (state === "session" && k > 0.85) p.headKind = "plead"; // 用力时泪光卖力相
  } else if (state === "happy") {
    // 弹跳 + 耳尾滞后（物理惯性）
    const bounce = Math.abs(Math.sin(t * 6));
    p.head.y -= Math.round(6 * bounce);
    p.body.y -= Math.round(5 * bounce);
    p.earL.y += Math.round(2 * (1 - bounce)); // 起跳耳滞后
    p.earR.y += Math.round(2 * (1 - bounce));
    p.pawL.y -= Math.round(6 * bounce);
    p.pawR.y -= Math.round(6 * bounce);
    p.tail.wag = Math.floor(now / 300) % 2 === 0;
  } else if (state === "cling") {
    // 歪头杀：头横移 + 一耳垂 + 泪光
    p.head.x += 2;
    p.head.y += 1;
    p.headKind = "plead";
    p.earR.down = true;
    p.tail.wag = Math.floor(now / 1200) % 2 === 0;
  } else if (state === "walk") {
    const bob = -Math.abs(Math.round(2 * Math.sin(now / 85)));
    p.body.y += bob;
    p.head.y += bob - Math.round(1.5 * Math.sin(now / 85));
    p.tail.wag = Math.floor(now / 200) % 2 === 0;
  }
  return p;
}

function playPoseDemo(now) {
  if (!poseDemo) return false;
  const t = (now - poseDemo.start) / 1000;
  if (t > 2.6) { poseDemo = null; return false; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const p = { ...SIT, head: { ...SIT.head }, earL: { ...SIT.earL }, earR: { ...SIT.earR }, body: { ...SIT.body }, tail: { ...SIT.tail } };
  if (poseDemo.kind === "walk") {
    return { kind: "walk", start: 0 }, drawPose(poseNow("walk", now)), true; // 复用状态 pose
  } else if (poseDemo.kind === "roll") {
    const k = Math.sin(Math.PI * Math.min(1, t / 2.6)); // 滚动强度包络
    p.body.y = SIT.body.y + Math.round(9 * k);           // 身体沉（侧倒感）
    p.head.x = SIT.head.x + Math.round(10 * k);          // 头贴到身侧（打滚）
    p.head.y = SIT.head.y + Math.round(7 * k);
    p.earL.y += Math.round(5 * k); p.earR.y += Math.round(5 * k); // 耳横倒
    p.tail.wag = Math.floor(now / 150) % 2 === 0;
    p.pawL.y += Math.round(6 * k); p.pawR.y += Math.round(6 * k);
  } else if (poseDemo.kind === "jump") {
    const lift = Math.round(16 * Math.sin(Math.PI * Math.min(1, t / 2.6)));
    p.head.y = SIT.head.y - lift;
    p.body.y = SIT.body.y - lift;
    p.earL.y = SIT.earL.y - lift + Math.round(3 * Math.sin(Math.PI * t)); // 耳下压再扬
    p.earR.y = SIT.earR.y - lift + Math.round(3 * Math.sin(Math.PI * t));
    p.pawL.y = SIT.pawL.y - lift - (lift > 4 ? 3 : 0); // 前爪腾空伸出
    p.pawR.y = SIT.pawR.y - lift - (lift > 4 ? 3 : 0);
    p.tail.wag = false;
  }
  drawPose(p);
  return true;
}
