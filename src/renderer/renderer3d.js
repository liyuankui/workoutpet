// 3D 渲染层 v0.18：程序化自建猫——每个部位都是我们创建的 mesh，眼睛想闭就闭、身体想呼吸就呼吸
/* global microPet */
import * as THREE from "three";

const canvas = document.getElementById("view3d");
const bubble = document.getElementById("bubble");
const titleEl = bubble.querySelector(".title");
const cueEl = bubble.querySelector(".cue");

// ---------- three 场景 ----------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(96, 110, false);
renderer.setPixelRatio(window.devicePixelRatio || 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 96 / 110, 0.1, 50);
camera.position.set(0, 0.9, 2.6);
camera.lookAt(0, 0.35, 0);
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const key = new THREE.DirectionalLight(0xfff2e0, 0.8);
key.position.set(1.5, 2.5, 2);
scene.add(key);

// ---------- 程序化猫（可爱靠参数：头身 1:1 幼猫比例 + 大眼 + 圆润） ----------
const COAT3D = {
  cream: { body: "#f5c07a", dark: "#d99b4e", light: "#fff1dc", ear: "#f7b1c4" },
  void: { body: "#45414b", dark: "#2e2b33", light: "#5b5663", ear: "#8d8798" },
  snow: { body: "#f7f5f2", dark: "#c9c4bd", light: "#ffffff", ear: "#f7c9d4" },
  cow: { body: "#f7f5f2", dark: "#3d3a3f", light: "#ffffff", ear: "#f7b1c4" },
  calico: { body: "#f5c07a", dark: "#3d3a3f", light: "#fff1dc", ear: "#f7b1c4" },
  blue: { body: "#8f9aa8", dark: "#77828f", light: "#c3ccd6", ear: "#d9a8b8" },
  siamese: { body: "#e8d5b5", dark: "#5a4636", light: "#f6ecd9", ear: "#f7b1c4" },
};

let catParts = null; // { head, body, eyeL, eyeR, pupilL, pupilR, earL, earR, tailSegs, legFL, legFR, legBL, legBR }
let coatNow = "cream";

function buildCat() {
  const coat = COAT3D[coatNow] ?? COAT3D.cream;
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0 });
  const mBody = mat(coat.body);
  const mDark = mat(coat.dark);
  const mLight = mat(coat.light);
  const mEar = mat(coat.ear);
  const mEyeWhite = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
  const mPupil = new THREE.MeshStandardMaterial({ color: "#2a2520", roughness: 0.2 });

  // 身体（胶囊，圆润）
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.25, 8, 16), mBody);
  body.position.set(0, 0.32, 0);
  g.add(body);

  // 头（大球——幼猫比例：头径 ≈ 身宽）
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 24, 24), mBody);
  head.position.set(0.02, 0.78, 0);
  g.add(head);

  // 耳朵（圆锥——圆润不是尖刺）
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.13, 8), mEar);
  earL.position.set(-0.15, 1.02, 0.10);
  earL.rotation.z = 0.25;
  g.add(earL);
  const earR = earL.clone();
  earR.position.set(-0.15, 1.02, -0.10);
  earR.rotation.z = 0.25;
  g.add(earR);

  // 眼睛（独立 mesh——大眼是可爱核心，闭眼=压扁 scale.y）
  const eyeGeo = new THREE.SphereGeometry(0.055, 16, 16);
  const eyeL = new THREE.Mesh(eyeGeo, mEyeWhite);
  eyeL.position.set(0.28, 0.82, 0.11);
  g.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.set(0.28, 0.82, -0.11);
  g.add(eyeR);
  // 瞳孔（大而黑——可爱）
  const pupilGeo = new THREE.SphereGeometry(0.03, 12, 12);
  const pupilL = new THREE.Mesh(pupilGeo, mPupil);
  pupilL.position.set(0.32, 0.82, 0.11);
  g.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.position.set(0.32, 0.82, -0.11);
  g.add(pupilR);

  // 鼻子（小粉球）
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), mEar);
  nose.position.set(0.31, 0.74, 0);
  g.add(nose);

  // 尾巴（链节圆柱——程序摆动）
  const tailSegs = [];
  let prev = body;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04 - i * 0.005, 0.045 - i * 0.005, 0.12, 8), mDark);
    seg.position.set(-0.35 - i * 0.10, 0.45 + i * 0.08, 0);
    seg.rotation.z = -0.5 - i * 0.15;
    g.add(seg);
    tailSegs.push(seg);
  }

  // 腿（短圆柱）
  const legGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.18, 8);
  const mkLeg = (x, z) => {
    const leg = new THREE.Mesh(legGeo, mBody);
    leg.position.set(x, 0.10, z);
    g.add(leg);
    return leg;
  };
  const legFL = mkLeg(0.15, 0.12);
  const legFR = mkLeg(0.15, -0.12);
  const legBL = mkLeg(-0.15, 0.12);
  const legBR = mkLeg(-0.15, -0.12);

  // 肚皮（浅色椭圆贴身前）
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), mLight);
  belly.position.set(0.15, 0.28, 0);
  belly.scale.set(0.6, 1, 0.8);
  g.add(belly);

  catParts = { g, head, body, eyeL, eyeR, pupilL, pupilR, earL, earR, nose, tailSegs, legFL, legFR, legBL, legBR, belly, materials: { mBody, mDark, mLight, mEar } };
  scene.add(g);
  return g;
}

buildCat();

// ---------- 花色换肤 ----------
function applyCoat(id) {
  coatNow = id;
  const coat = COAT3D[id] ?? COAT3D.cream;
  if (!catParts) return;
  catParts.materials.mBody.color.set(coat.body);
  catParts.materials.mDark.color.set(coat.dark);
  catParts.materials.mLight.color.set(coat.light);
  catParts.materials.mEar.color.set(coat.ear);
}

// ---------- 状态动画（全程序化——每个部位直接控制） ----------
let petState = "idle";
let walking = false;
const clock = new THREE.Clock();

function setPet(state) {
  petState = state;
}

// 眼睛控制
function setEyes(open) {
  if (!catParts) return;
  const s = open ? 1 : 0.1;
  catParts.eyeL.scale.y = s;
  catParts.eyeR.scale.y = s;
  catParts.pupilL.visible = open;
  catParts.pupilR.visible = open;
}

function tickCat(dt, t) {
  if (!catParts) return;
  const { g, head, body, earL, earR, tailSegs, legFL, legFR, legBL, legBR } = catParts;

  // 重置每帧基准
  g.rotation.z = 0;
  g.position.y = 0;
  g.position.x = 0;

  if (petState === "idle") {
    // 睡觉：侧躺 + 闭眼 + 呼吸
    g.rotation.z = Math.PI / 2;
    g.position.y = -0.15;
    setEyes(false);
    const breathe = 1 + Math.sin(t * 1.6) * 0.025;
    body.scale.y = breathe;
    body.scale.x = breathe * 0.98; // 呼吸时微胖
    // 耳朵微微下垂
    earL.rotation.x = Math.sin(t * 0.8) * 0.05;
    earR.rotation.x = -Math.sin(t * 0.8) * 0.05;
  } else {
    setEyes(true);
    body.scale.set(1, 1, 1);

    if (petState === "remind" || petState === "session") {
      // 提醒：身体前倾 + 头微点（引起注意但不狂躁）
      g.rotation.z = -0.12;
      head.position.y = 0.78 + Math.sin(t * 3) * 0.03;
      earL.rotation.z = 0.25 + Math.sin(t * 2) * 0.1;
      earR.rotation.z = 0.25 - Math.sin(t * 2) * 0.1;
    } else if (petState === "happy") {
      // 开心：小跳 + 耳朵弹
      g.position.y = Math.abs(Math.sin(t * 5)) * 0.15;
      earL.rotation.z = 0.15;
      earR.rotation.z = 0.35;
      head.position.y = 0.78;
    } else if (petState === "cling") {
      // 撒娇：头歪 + 一耳垂
      g.rotation.z = 0.1;
      head.position.y = 0.76;
      earR.rotation.z = 0.55; // 一耳垂下
      head.rotation.y = Math.sin(t * 1.5) * 0.1;
    } else if (walking) {
      // 走路：腿交替 + 身体颠簸
      const walk = Math.sin(t * 8);
      legFL.position.y = 0.10 + Math.max(0, walk) * 0.06;
      legBR.position.y = 0.10 + Math.max(0, -walk) * 0.06;
      g.position.y = Math.abs(Math.sin(t * 8)) * 0.03;
      head.position.y = 0.78 + Math.sin(t * 4) * 0.015;
    } else {
      // 坐姿安静（清醒但不睡觉的空闲态）
      body.scale.y = 1 + Math.sin(t * 1.6) * 0.01; // 极微呼吸
      head.position.y = 0.78;
    }
  }

  // 尾巴永远轻轻摆（活的证明，但不吵）
  for (let i = 0; i < tailSegs.length; i++) {
    tailSegs[i].rotation.y = Math.sin(t * 2 + i * 0.5) * 0.15;
  }

  renderer.render(scene, camera);
}

// ---------- 临时动作层（反应/演示） ----------
let act3d = null; // { type, start, resume }
let personaPool = "clingy";
let locale3d = "zh-CN";

function playAct(kind, type) {
  const stateMap = { idle: "idle", walk: "walk", run: "run", remind: "remind", session: "session", happy: "happy", cling: "cling" };
  act3d = { kind, type, start: performance.now(), resume: stateMap[petState] ?? "idle" };
}

function tickAct(now) {
  if (!act3d) return null;
  const t = (now - act3d.start) / 1000;
  let ox = 0, oy = 0;
  const finish = () => { const r = act3d?.resume ?? "idle"; act3d = null; setPet(r); return null; };
  if (act3d.type === "jump") { if (t > 1.2) return finish(); oy = Math.round(11 * Math.sin(Math.PI * t / 1.2)); }
  else if (act3d.type === "roll") { if (t > 1.8) return finish(); ox = Math.round(8 * Math.sin(t * 6)); }
  else if (act3d.type === "wiggle") { if (t > 0.7) return finish(); ox = Math.round(4 * (Math.floor(now / 90) % 2 ? 1 : -1)); }
  else if (act3d.type === "meow") { if (t > 0.9) return finish(); oy = Math.round(2 * Math.sin(Math.PI * t / 0.9)); }
  else if (act3d.type === "hop") { if (t > 5) return finish(); const ph = t % 2.2; oy = ph < 0.4 ? Math.round(10 * Math.sin(Math.PI * ph / 0.4)) : ph < 0.8 ? Math.round(8 * Math.sin(Math.PI * (ph - 0.4) / 0.4)) : 0; }
  else if (act3d.type === "mouse") { if (t > 6) return finish(); if (t >= 4.5 && t < 5.5) oy = Math.round(10 * Math.sin(Math.PI * (t - 4.5))); }
  else if (act3d.type === "walk-demo") { if (t > 2.6) return finish(); }
  return [ox, oy];
}

// ---------- 主循环 ----------
let dragSt = null;
let bubbleOn = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  const actOffset = tickAct(performance.now());
  if (catParts && actOffset) {
    catParts.g.position.x = actOffset[0] / 100;
    catParts.g.position.y += actOffset[1] / 100;
  }
  tickCat(dt, t);
}
loop();

// ---------- 行为事件 ----------
microPet.onState((msg) => {
  locale3d = msg.locale ?? locale3d;
  if (msg.pool) personaPool = msg.pool;
  if (msg.coatId && msg.coatId !== coatNow) applyCoat(msg.coatId);
  walking = !!msg.walking;
  if (walking) setPet("walk"); else setPet(msg.pet);

  const s = microPet.strings(locale3d);
  if (msg.walking) hideBubble();
  else if (msg.pet === "remind" && msg.exercise) showBubble(`${msg.exercise.emoji} ${msg.exercise.name} · ${s.bubble.letsGo}`, msg.exercise.cue);
  else if (msg.pet === "happy") { showBubble(microPet.fmt(s.bubble.good, { n: msg.streakDays }), s.bubble.petMe); setTimeout(() => { if (petState !== "happy") hideBubble(); }, 2600); }
  else if (msg.pet === "cling") { const pool = (s.bubble.clingPools || {})[personaPool] || s.bubble.cling || []; if (pool.length) showBubble(pool[Math.floor(Math.random() * pool.length)], ""); setTimeout(() => { if (petState === "cling") hideBubble(); }, 8000); }
  else if (msg.pet === "idle") setTimeout(() => { if (petState === "idle") hideBubble(); }, 300);
});
microPet.onHint((h) => { showBubble(h.title, h.cue); setTimeout(() => hideBubble(), 4500); });

let suppressClickUntil = 0;
function showBubble(title, cue) {
  titleEl.textContent = title;
  cueEl.textContent = cue ?? "";
  cueEl.style.display = cue ? "" : "none";
  bubble.classList.add("show");
  if (!bubbleOn) { bubbleOn = true; microPet.bubbleBox(true); }
}
function hideBubble() {
  bubble.classList.remove("show");
  if (bubbleOn) { bubbleOn = false; microPet.bubbleBox(false); }
}

microPet.onReaction((type) => {
  if (["wiggle", "jump", "meow", "roll"].includes(type)) {
    playAct("reaction", type);
    if (type === "meow") {
      const strs = microPet.strings(locale3d);
      const pool = (strs.bubble.meowPools || {})[personaPool] || [strs.meow];
      showBubble(pool[Math.floor(Math.random() * pool.length)], "");
      setTimeout(() => hideBubble(), 900);
    }
  }
});
microPet.onSkit((msg) => { playAct("skit", msg.type); });
microPet.onPoseDemo((kind) => { playAct("pose", kind === "walk" ? "walk-demo" : kind); });

// 明信片（3D：景点底 + 当前 canvas 快照）
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
    case "pagoda": pctx.fillRect(56, 24, 16, 40); pctx.fillRect(52, 34, 24, 4); pctx.fillRect(48, 54, 32, 4); break;
    case "towers": pctx.fillRect(30, 30, 12, 34); pctx.fillRect(48, 16, 16, 48); pctx.fillRect(90, 24, 12, 40); break;
    case "wall": pctx.fillRect(20, 44, 88, 20); break;
    case "snow": pctx.fillStyle = "#f0f4f8"; pctx.fillRect(0, 60, 128, 4); pctx.fillStyle = sp.land; pctx.fillRect(48, 30, 10, 30); break;
    case "beach": pctx.fillRect(88, 44, 5, 20); pctx.fillRect(76, 40, 28, 5); break;
    default: pctx.fillRect(40, 40, 50, 24);
  }
  try {
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(canvas, 92, 48, 27, 31);
  } catch { }
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
    dragSt.moved = true;
    microPet.dragStart();
  }
  microPet.dragMove();
});
function endDrag() {
  if (!dragSt) return;
  dragSt = null;
}
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

canvas.addEventListener("click", () => {
  if (dragSt?.moved) return;
  microPet.petClick();
});

microPet.ready();
