// 3D 渲染层 v0.19：程序化猫 v2——灵动可爱版
// 可爱三要素：幼猫比例（头:身 ≈ 1.2:1）+ 大眼有神 + 永远有微动（灵动感）
/* global microPet */
import * as THREE from "three";

const canvas = document.getElementById("view3d");
const bubble = document.getElementById("bubble");
const titleEl = bubble.querySelector(".title");
const cueEl = bubble.querySelector(".cue");

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(96, 110, false);
renderer.setPixelRatio(window.devicePixelRatio || 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 96 / 110, 0.1, 50);
camera.position.set(0, 0.75, 3.0);
camera.lookAt(0, 0.25, 0);
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xfff2e0, 0.7);
key.position.set(1.5, 2.5, 2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xd4e4ff, 0.3);
fill.position.set(-2, 1, -1);
scene.add(fill);

// ---------- 猫色板 ----------
const COAT3D = {
  cream: { body: "#f5c07a", dark: "#d99b4e", light: "#fff1dc", ear: "#f7b1c4", nose: "#e8758a" },
  void: { body: "#45414b", dark: "#2e2b33", light: "#5b5663", ear: "#8d8798", nose: "#8d8798" },
  snow: { body: "#f7f5f2", dark: "#c9c4bd", light: "#ffffff", ear: "#f7c9d4", nose: "#e8758a" },
  cow: { body: "#f7f5f2", dark: "#3d3a3f", light: "#ffffff", ear: "#f7b1c4", nose: "#e8758a" },
  calico: { body: "#f5c07a", dark: "#3d3a3f", light: "#fff1dc", ear: "#f7b1c4", nose: "#e8758a" },
  blue: { body: "#8f9aa8", dark: "#77828f", light: "#c3ccd6", ear: "#d9a8b8", nose: "#8f9aa8" },
  siamese: { body: "#e8d5b5", dark: "#5a4636", light: "#f6ecd9", ear: "#5a4636", nose: "#5a4636" },
};

let catParts = null;
let coatNow = "cream";
let eyeBlinkTimer = 0;
let moodOverlay = 0; // 0=normal, >0 = happy intensity

function buildCat() {
  const coat = COAT3D[coatNow] ?? COAT3D.cream;
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0 });

  const mBody = mat(coat.body);
  const mDark = mat(coat.dark);
  const mLight = mat(coat.light);
  const mEar = mat(coat.ear);
  const mNose = mat(coat.nose);
  const mEyeW = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.15 });
  const mPupil = new THREE.MeshStandardMaterial({ color: "#1a1520", roughness: 0.1 });
  const mGlint = new THREE.MeshBasicMaterial({ color: "#ffffff" });

  // 身体（胖椭圆——圆润感）
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.30, 24, 20), mBody);
  body.scale.set(1, 0.82, 0.95);
  body.position.set(0, 0.28, 0);
  g.add(body);

  // 头（大——幼猫比例）
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 24), mBody);
  head.position.set(0.05, 0.72, 0);
  g.add(head);

  // 耳朵（圆角三角——用 Cone + 底部球盖）
  const mkEar = (z) => {
    const earGrp = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.14, 8), mBody);
    cone.position.y = 0.05;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.09, 8), mEar);
    inner.position.set(0.01, 0.04, 0);
    earGrp.add(cone, inner);
    earGrp.position.set(0.02, 1.00, z);
    earGrp.rotation.z = z > 0 ? -0.2 : 0.2;
    g.add(earGrp);
    return earGrp;
  };
  const earL = mkEar(0.14);
  const earR = mkEar(-0.14);

  // 眼睛（大而圆——可爱核心，带高光）
  const eyeGeo = new THREE.SphereGeometry(0.065, 20, 20);
  const eyeL = new THREE.Mesh(eyeGeo, mEyeW);
  eyeL.position.set(0.30, 0.75, 0.12);
  g.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.set(0.30, 0.75, -0.12);
  g.add(eyeR);
  // 瞳孔（大黑+高光点）
  const pupilGeo = new THREE.SphereGeometry(0.04, 16, 16);
  const pupilL = new THREE.Mesh(pupilGeo, mPupil);
  pupilL.position.set(0.35, 0.75, 0.12);
  g.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.position.set(0.35, 0.75, -0.12);
  g.add(pupilR);
  // 高光（白色小点——灵魂）
  const glintGeo = new THREE.SphereGeometry(0.015, 8, 8);
  const glintL = new THREE.Mesh(glintGeo, mGlint);
  glintL.position.set(0.375, 0.77, 0.13);
  g.add(glintL);
  const glintR = glintL.clone();
  glintR.position.set(0.375, 0.77, -0.11);
  g.add(glintR);

  // 鼻子（小粉三角球）
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mNose);
  nose.position.set(0.36, 0.68, 0);
  g.add(nose);

  // 嘴巴（两条弧线——用 torus 弧段）
  const mouthMat = new THREE.MeshBasicMaterial({ color: "#8d6e63" });
  const mkMouth = (z) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI * 0.6), mouthMat);
    m.position.set(0.35, 0.65, z);
    m.rotation.y = Math.PI / 2;
    m.rotation.x = z > 0 ? -0.3 : 0.3;
    g.add(m);
  };
  mkMouth(0.025);
  mkMouth(-0.025);

  // 胡须（细线）
  const whiskerMat = new THREE.MeshBasicMaterial({ color: "#c9c4bd" });
  const mkWhisker = (x, y, z, rz) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.001, 0.12, 4), whiskerMat);
    w.position.set(x, y, z);
    w.rotation.z = rz;
    g.add(w);
  };
  mkWhisker(0.38, 0.68, 0.05, Math.PI / 2 + 0.15);
  mkWhisker(0.38, 0.67, -0.05, Math.PI / 2 - 0.15);
  mkWhisker(0.38, 0.65, 0.06, Math.PI / 2 + 0.35);
  mkWhisker(0.38, 0.64, -0.06, Math.PI / 2 - 0.35);

  // 尾巴（链节——永远摆）
  const tailSegs = [];
  for (let i = 0; i < 5; i++) {
    const r = 0.045 - i * 0.006;
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), i < 3 ? mBody : mDark);
    seg.position.set(-0.32 - i * 0.07, 0.38 + i * 0.06, 0);
    g.add(seg);
    tailSegs.push(seg);
  }

  // 腿（短圆）
  const legGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.14, 12);
  const mkLeg = (x, z) => {
    const leg = new THREE.Mesh(legGeo, mBody);
    leg.position.set(x, 0.07, z);
    g.add(leg);
    return leg;
  };
  const legFL = mkLeg(0.12, 0.10);
  const legFR = mkLeg(0.12, -0.10);
  const legBL = mkLeg(-0.12, 0.10);
  const legBR = mkLeg(-0.12, -0.10);

  // 肚皮（浅色椭圆）
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), mLight);
  belly.position.set(0.18, 0.22, 0);
  belly.scale.set(0.55, 0.85, 0.7);
  g.add(belly);

  // 脸颊腮红（两粉圆）
  const blushMat = new THREE.MeshBasicMaterial({ color: "#f7b1c4", transparent: true, opacity: 0.4 });
  const mkBlush = (z) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), blushMat);
    b.position.set(0.33, 0.70, z);
    b.scale.set(0.4, 0.6, 0.8);
    g.add(b);
  };
  mkBlush(0.15);
  mkBlush(-0.15);

  catParts = { g, head, body, eyeL, eyeR, pupilL, pupilR, glintL, glintR, earL, earR, nose, tailSegs, legFL, legFR, legBL, legBR, belly,
    materials: { mBody, mDark, mLight, mEar, mNose } };
  g.scale.setScalar(0.85);
  g.rotation.y = -Math.PI / 2; // 面朝镜头：脸在 +X，转 -90° 使 +X→+Z（camera 方向）
  scene.add(g);
  return g;
}

buildCat();

function applyCoat(id) {
  coatNow = id;
  const coat = COAT3D[id] ?? COAT3D.cream;
  if (!catParts) return;
  const m = catParts.materials;
  m.mBody.color.set(coat.body);
  m.mDark.color.set(coat.dark);
  m.mLight.color.set(coat.light);
  m.mEar.color.set(coat.ear);
  m.mNose.color.set(coat.nose);
}

// ---------- 动画 ----------
let petState = "idle";
let walking = false;
const clock = new THREE.Clock();

function setPet(state) { petState = state; }

function setEyes(open) {
  if (!catParts) return;
  const s = open ? 1 : 0.08;
  catParts.eyeL.scale.y = s;
  catParts.eyeR.scale.y = s;
  catParts.pupilL.visible = open;
  catParts.pupilR.visible = open;
  catParts.glintL.visible = open;
  catParts.glintR.visible = open;
}

// 眨眼（清醒时每 3~5s 眨一次）
function tickBlink(dt) {
  if (!catParts || petState === "idle") return;
  eyeBlinkTimer -= dt;
  if (eyeBlinkTimer <= 0) {
    eyeBlinkTimer = 3 + Math.random() * 2;
    // 快速眨眼
    setEyes(false);
    setTimeout(() => { if (petState !== "idle") setEyes(true); }, 120);
  }
}

function tickCat(dt, t) {
  if (!catParts) return;
  const { g, head, body, earL, earR, tailSegs, legFL, legFR, legBL, legBR, glintL, glintR } = catParts;

  // 重置基准
  g.rotation.z = 0;
  g.position.y = 0;
  g.position.x = 0;
  g.rotation.y = -Math.PI / 2;
  head.position.y = 0.72;
  head.rotation.y = 0;
  earL.rotation.z = -0.2;
  earR.rotation.z = 0.2;
  body.scale.set(1, 0.82, 0.95);
  moodOverlay = 0;

  tickBlink(dt);

  if (petState === "idle" && !act3d) {
    // 睡觉：蜷缩（不侧躺——蜷缩可爱且不裁头）
    setEyes(false);
    const breathe = 1 + Math.sin(t * 1.4) * 0.03;
    body.scale.set(breathe, 0.82 * breathe, 0.95);
    head.position.y = 0.70 + Math.sin(t * 1.4) * 0.012; // 头随呼吸微动
    // 耳朵偶尔抖一下（做梦）
    if (Math.random() < 0.008) {
      earL.rotation.z = -0.2 + Math.sin(t * 20) * 0.15;
      earR.rotation.z = 0.2 - Math.sin(t * 20) * 0.15;
    }
    // 蜷缩感：身体微缩
    g.scale.setScalar(0.82);
    g.position.y = -0.04;
  } else if (petState === "idle" && act3d) {
    // 醒来（临时反应中）：坐直+睁眼
    setEyes(true);
    g.scale.setScalar(0.85);
    g.position.y = 0;
    body.scale.set(1, 0.82, 0.95);
    // 清醒微动（灵动感）
    head.position.y = 0.72 + Math.sin(t * 2) * 0.008;
    if (Math.random() < 0.01) { // 耳朵偶尔动
      earL.rotation.z = -0.2 + (Math.random() - 0.5) * 0.1;
      earR.rotation.z = 0.2 + (Math.random() - 0.5) * 0.1;
    }
  } else {
    // 活跃状态（remind/session/happy/cling/walk）
    setEyes(true);
    g.scale.setScalar(0.85);
    g.position.y = 0;
    body.scale.set(1, 0.82, 0.95);

    if (petState === "remind" || petState === "session") {
      g.rotation.z = -0.08;
      head.position.y = 0.72 + Math.sin(t * 3.5) * 0.025;
      earL.rotation.z = -0.2 + Math.sin(t * 2.5) * 0.12;
      earR.rotation.z = 0.2 - Math.sin(t * 2.5) * 0.12;
      // 尾巴兴奋快摆
      for (let i = 0; i < tailSegs.length; i++) {
        tailSegs[i].position.y = 0.38 + i * 0.06 + Math.sin(t * 5 + i * 0.6) * 0.02;
      }
    } else if (petState === "happy") {
      const hop = Math.abs(Math.sin(t * 4.5)) * 0.12;
      g.position.y = hop;
      earL.rotation.z = -0.35;
      earR.rotation.z = 0.35;
      head.position.y = 0.74;
      // 眯眼笑（开心的表达！）
      catParts.eyeL.scale.y = 0.5;
      catParts.eyeR.scale.y = 0.5;
      catParts.pupilL.visible = false;
      catParts.pupilR.visible = false;
      catParts.glintL.visible = false;
      catParts.glintR.visible = false;
    } else if (petState === "cling") {
      g.rotation.z = 0.08;
      head.position.y = 0.70;
      head.rotation.y = Math.sin(t * 1.2) * 0.15;
      earR.rotation.z = 0.55; // 一耳垂（委屈）
      // 泪汪汪：瞳孔放大
      catParts.pupilL.scale.setScalar(1.3);
      catParts.pupilR.scale.setScalar(1.3);
    } else if (walking) {
      const walkCycle = Math.sin(t * 7);
      legFL.position.y = 0.07 + Math.max(0, walkCycle) * 0.05;
      legBR.position.y = 0.07 + Math.max(0, -walkCycle) * 0.05;
      g.position.y = Math.abs(Math.sin(t * 7)) * 0.025;
      head.position.y = 0.72 + Math.sin(t * 3.5) * 0.012;
      g.rotation.y = -Math.PI / 2 + Math.sin(t * 1.5) * 0.03; // 轻微摇摆
    }
  }

  // 尾巴永远轻摆（灵动感核心！）
  const tailSpeed = petState === "idle" ? 1.5 : 3;
  for (let i = 0; i < tailSegs.length; i++) {
    tailSegs[i].position.z = Math.sin(t * tailSpeed + i * 0.7) * 0.03 * (1 + i * 0.3);
    tailSegs[i].position.y = (petState === "idle" ? 0.36 : 0.38) + i * 0.06 + Math.cos(t * tailSpeed + i * 0.5) * 0.015;
  }

  // 瞳孔缩放重置（cling 的放大在 else 分支设置）
  if (petState !== "cling") {
    catParts.pupilL.scale.setScalar(1);
    catParts.pupilR.scale.setScalar(1);
  }

  renderer.render(scene, camera);
}

// ---------- 临时动作 ----------
let act3d = null;
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
  if (act3d.type === "jump") { if (t > 1.0) return finish(); oy = Math.round(11 * Math.sin(Math.PI * t / 1.0)); }
  else if (act3d.type === "roll") { if (t > 1.6) return finish(); ox = Math.round(6 * Math.sin(t * 5)); }
  else if (act3d.type === "wiggle") { if (t > 0.7) return finish(); ox = Math.round(4 * (Math.floor(now / 90) % 2 ? 1 : -1)); }
  else if (act3d.type === "meow") { if (t > 0.9) return finish(); oy = Math.round(2 * Math.sin(Math.PI * t / 0.9)); }
  else if (act3d.type === "hop") { if (t > 5) return finish(); const ph = t % 2.0; oy = ph < 0.35 ? Math.round(10 * Math.sin(Math.PI * ph / 0.35)) : ph < 0.7 ? Math.round(8 * Math.sin(Math.PI * (ph - 0.35) / 0.35)) : 0; }
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
  tickCat(dt, t); // 先跑状态动画（会重置 position）
  const actOffset = tickAct(performance.now());
  if (catParts && actOffset) {
    catParts.g.position.x = actOffset[0] / 100;
    catParts.g.position.y += actOffset[1] / 100;
  }
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

function showBubble(title, cue) {
  titleEl.textContent = title; cueEl.textContent = cue ?? ""; cueEl.style.display = cue ? "" : "none";
  bubble.classList.add("show"); if (!bubbleOn) { bubbleOn = true; microPet.bubbleBox(true); }
}
function hideBubble() {
  bubble.classList.remove("show"); if (bubbleOn) { bubbleOn = false; microPet.bubbleBox(false); }
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
