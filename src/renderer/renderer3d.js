// 3D 渲染层（spike）：three.js + GLB 骨骼动画——行为事件（broadcast/IPC）与 2D 版完全复用
// 模型未到位时用程序化占位猫（呼吸/律动）验证管线；GLB 经 preload base64 供（asar 兼容）
/* global microPet */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.getElementById("view3d");
const bubble = document.getElementById("bubble");
const titleEl = bubble.querySelector(".title");
const cueEl = bubble.querySelector(".cue");

// ---------- three 场景（透明、轻光照） ----------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true }); // toDataURL/明信片可读
renderer.setSize(96, 110, false);
renderer.setPixelRatio(window.devicePixelRatio || 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 96 / 110, 0.1, 50);
camera.position.set(0, 1.3, 4.4); // 拉远 28%：静止猫顶距 ~18px，28px 跳弧全程可见（相机下移方案失败：反而把猫拉满画幅）
camera.lookAt(0, 0.5, 0);
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xfff2e0, 1.1);
key.position.set(2, 3, 2);
scene.add(key);

let mixer = null; // 已弃用（GLB 轨道在 AnimationMixer 下静默 NoOp——猫显示动作全不动的根因），保留占位
let curClipName = null; // 当前播放 clip 名
const animClock = { t: 0 }; // 手动驱动时钟

/** 手动插值驱动（绕开 AnimationMixer）：按 track.name 解析节点，线性 lerp position/scale、slerp quaternion */
function driveAnim(root, clip, dt) {
  if (!clip) return;
  animClock.t = (animClock.t + dt) % clip.duration;
  const t = animClock.t;
  for (const tr of clip.tracks) {
    const dot = tr.name.lastIndexOf(".");
    const nodeName = tr.name.slice(0, dot);
    const prop = tr.name.slice(dot + 1);
    const node = nodeName === "" ? root : root.getObjectByName(nodeName);
    if (!node) continue;
    const times = tr.times;
    const dim = tr.values.length / times.length;
    // 区间查找
    let i = 0;
    while (i < times.length - 1 && times[i + 1] < t) i++;
    const t0 = times[i];
    const t1 = times[Math.min(i + 1, times.length - 1)];
    const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    if (prop === "quaternion") {
      const a = new THREE.Quaternion(tr.values[i * 4], tr.values[i * 4 + 1], tr.values[i * 4 + 2], tr.values[i * 4 + 3]);
      const b = new THREE.Quaternion(tr.values[(i + 1) * 4], tr.values[(i + 1) * 4 + 1], tr.values[(i + 1) * 4 + 2], tr.values[(i + 1) * 4 + 3]);
      node.quaternion.slerpQuaternions(a, b, k);
    } else if (prop === "position" || prop === "scale") {
      const target = prop === "position" ? node.position : node.scale;
      for (let d = 0; d < 3; d++) {
        const v0 = tr.values[i * 3 + d];
        const v1 = tr.values[(i + 1) * 3 + d];
        target.setComponent(d, v0 + (v1 - v0) * k);
      }
    }
  }
}
let catRoot = null;
const clips = {}; // name → AnimationClip
const clock = new THREE.Clock();

// ---------- 占位猫（程序化 box 组合：身体/头/双耳/尾） ----------
function buildPlaceholderCat() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.45), mat("#f5c07a"));
  body.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.4), mat("#f5c07a"));
  head.position.set(0.34, 0.78, 0);
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.12), mat("#f7b1c4"));
  earL.position.set(0.34, 1.04, 0.13);
  const earR = earL.clone();
  earR.position.z = -0.13;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.09), mat("#d99b4e"));
  tail.position.set(-0.5, 0.55, 0);
  g.add(body, head, earL, earR, tail);
  g.userData.parts = { body, head, earL, earR, tail };
  return g;
}

// ---------- GLB 加载（base64 → parse） ----------
(async () => {
  const buf = microPet.glb(); // ArrayBuffer | null（main 读 assets/models/cat.glb）
  if (buf) {
    const gltf = await new GLTFLoader().parseAsync(buf, "");
    catRoot = gltf.scene;
    // GLB 轨道丢 type（GLTFLoader 产物 track.type=undefined → AnimationMixer 静默 NoOp——
    // 「猫显示但所有动作不动」的根因）。按 values 维度补类型：3=Vector，4=Quaternion
    for (const clip of gltf.animations) {
      for (const tr of clip.tracks) {
        if (!tr.type) {
          const dim = tr.values.length / Math.max(1, tr.times.length);
          tr.type = dim === 4 ? "QuaternionKeyframeTrack" : "VectorKeyframeTrack";
        }
      }
    }
    // Kenney GLB 外置 Textures/colormap.png：parse 内相对 URI 失败，用 dataURL 手动补
    const texUrl = microPet.texDataUrl && microPet.texDataUrl();
    if (texUrl) {
      const tex = await new THREE.TextureLoader().loadAsync(texUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // GLTF 贴图语义不翻转——默认 true 曾致 UV 上下镜像采进黑区（黑猫根因）
      let patched = 0;
      catRoot.traverse((o) => {
        if (o.isMesh) {
          // 桌宠卡通风：MeshBasicMaterial 贴图原色直出（不受光照单位影响——
          // MeshStandard+物理光照单位曾把 Kenney 灰紫猫压成黑影，官方预览即无光照平色）
          const old = Array.isArray(o.material) ? o.material[0] : o.material;
          const m = new THREE.MeshBasicMaterial({ map: tex });
          m.userData = old?.userData ?? {};
          o.material = m;
          patched++;
        }
      });
      console.log(`[3d] 已切换 BasicMaterial + 贴图（${patched} mesh）`);
    }
    mixer = new THREE.AnimationMixer(catRoot);
    for (const clip of gltf.animations) clips[clip.name.toLowerCase()] = clip;
    console.log("[3d] GLB loaded, clips:", Object.keys(clips).join(","));
  } else {
    catRoot = buildPlaceholderCat();
    console.log("[3d] 占位猫（GLB 未就位）");
  }
  catRoot.scale.setScalar(1.0);
  scene.add(catRoot);

  // 闭眼（睡觉时显示）：两个暗色小面片贴在头部（cube 猫头在 body 前上方）
  sleepEyes = new THREE.Group();
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#2a2520" });
  const eyeGeo = new THREE.BoxGeometry(0.06, 0.015, 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(0.30, 0.82, 0.09);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.30, 0.82, -0.09);
  sleepEyes.add(eyeL, eyeR);
  sleepEyes.visible = false;
  catRoot.add(sleepEyes);
})();

let sleepEyes = null;

// ---------- 花色换肤（材质基色替换——3D 比 LUT 干净） ----------
const COAT3D = {
  cream: ["#f5c07a", "#d99b4e", "#fff1dc"],
  void: ["#45414b", "#5b5663", "#6b6675"],
  snow: ["#f7f5f2", "#c9c4bd", "#ffffff"],
  cow: ["#f7f5f2", "#3d3a3f", "#ffffff"],
  calico: ["#f5c07a", "#3d3a3f", "#fff1dc"],
  blue: ["#8f9aa8", "#77828f", "#c3ccd6"],
  siamese: ["#e8d5b5", "#5a4636", "#f6ecd9"],
};
let coatNow = "cream";
/** 贴图重着色：保留纹理明暗细节，色相/饱和度换成花色（缓存每花色一份 CanvasTexture） */
function applyCoat(id) {
  const base = new THREE.Color((COAT3D[id] ?? COAT3D.cream)[0]);
  const bhsl = {}; base.getHSL(bhsl);
  catRoot?.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData.coatId === id) continue;
      if (!m.map) { m.color.copy(base); m.userData.coatId = id; continue; } // 无贴图：基色
      if (!m.userData.origMap) m.userData.origMap = m.map;
      const orig = m.userData.origMap;
      m.userData.tinted ??= {};
      if (!m.userData.tinted[id]) {
        const img = orig.image;
        const cv = document.createElement("canvas");
        cv.width = img.width; cv.height = img.height;
        const c = cv.getContext("2d");
        c.drawImage(img, 0, 0);
        const d = c.getImageData(0, 0, cv.width, cv.height);
        for (let i = 0; i < d.data.length; i += 4) {
          if (!d.data[i + 3]) continue;
          const col = new THREE.Color((d.data[i] << 16) | (d.data[i + 1] << 8) | d.data[i + 2]);
          const hsl = {}; col.getHSL(hsl);
          const nc = new THREE.Color().setHSL(bhsl.h, bhsl.s, Math.min(0.92, Math.max(0.06, hsl.l * 0.85 + 0.10)));
          d.data[i] = nc.r * 255; d.data[i + 1] = nc.g * 255; d.data[i + 2] = nc.b * 255;
        }
        c.putImageData(d, 0, 0);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        m.userData.tinted[id] = tex;
      }
      m.map = m.userData.tinted[id];
      m.needsUpdate = true;
      m.userData.coatId = id;
    }
  });
}

// ---------- 3D 配饰：子节点挂骨骼，动画自动跟随（dance 转头帽随头转） ----------
let outfitNode = null;
function buildHat3D() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.14, 10),
    new THREE.MeshStandardMaterial({ color: "#f5c07a", roughness: 0.85 }),
  );
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12),
    new THREE.MeshStandardMaterial({ color: "#d99b4e", roughness: 0.85 }),
  );
  brim.position.y = -0.07;
  g.add(crown, brim);
  return g;
}
function applyOutfit3D(id) {
  if (outfitNode) { outfitNode.parent?.remove(outfitNode); outfitNode = null; }
  if (!id || !catRoot) return;
  // Kenney cube 猫为头身一体：挂 body 主体节点（按节点名定位——「最高 mesh」启发曾误挂立尾）
  let body = null;
  catRoot.traverse((o) => { if (o.name === "body") body = o; });
  if (!body) return;
  outfitNode = id === "hat" ? buildHat3D() : null;
  if (outfitNode) {
    outfitNode.position.set(0.28, 0.34, 0);
    outfitNode.rotation.z = -0.12; // 微歪戴
    body.add(outfitNode);
  }
}








// ---------- 状态 → 动画/律动 ----------
let petState = "idle";
let walking = false;
function playClip(name) {
  if (!clips[name]) return false;
  if (curClipName !== name) {
    curClipName = name;
    animClock.t = 0; // 换动画归零
  }
  return true;
}
function setPet(state) {
  petState = state;
  // Kenney Cube Pets clip 契约：remind/session=gesture-positive（来，跟我做）、happy=dance、cling=gesture-negative（委屈卖萌）
  const map = { idle: "idle", walk: "walk", run: "run", remind: "gesture-positive", session: "gesture-positive", happy: "dance", cling: "gesture-negative" };
  if (!playClip(map[state] ?? "idle")) petState = state; // clip 缺时律动兜底
}

// 占位律动（无 GLB clip 时表达活性）
function tickPlaceholder(dt, t) {
  if (!catRoot?.userData.parts || mixer) return;
  const p = catRoot.userData.parts;
  const breathe = Math.sin(t * 2.2) * 0.02;
  p.body.scale.y = 1 + breathe;
  p.head.position.y = 0.78 + Math.sin(t * 2.2) * 0.015;
  p.head.rotation.z = petState === "cling" ? 0.22 : Math.sin(t * 0.7) * 0.04;
  p.tail.rotation.y = Math.sin(t * (petState === "walk" ? 9 : 2.5)) * 0.6;
  p.earL.rotation.z = Math.sin(t * 3) * 0.08;
  p.earR.rotation.z = -Math.sin(t * 3) * 0.08;
  const hop = petState === "happy" ? Math.abs(Math.sin(t * 6)) * 0.18 : 0;
  catRoot.position.y = hop;
}

// ---------- 主循环 ----------
function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  // v0.17 安静哲学：idle=睡觉（侧躺，真猫行为）；有事件时醒来起身
  if (curClipName && curClipName !== "idle" && clips[curClipName] && catRoot) driveAnim(catRoot, clips[curClipName], dt);
  // 睡/醒过渡（0.4s lerp）：idle→躺（rotation.z→π/2 + 微降），非 idle→坐（rotation.z→0）
  const targetZ = petState === "idle" ? Math.PI / 2 : 0;
  const targetY = petState === "idle" ? -0.22 : 0;
  if (catRoot && Math.abs(catRoot.rotation.z - targetZ) > 0.01) {
    catRoot.rotation.z += (targetZ - catRoot.rotation.z) * Math.min(1, dt * 8);
    catRoot.position.y += (targetY - catRoot.position.y) * Math.min(1, dt * 8);
  }
  // 睡觉动画（v0.17.1）：呼吸（body scale.y 慢波 ±2%）+ 闭眼显示
  if (catRoot && petState === "idle") {
    const breathe = 1 + Math.sin(t * 1.8) * 0.02; // 3.5s 周期，±2% 幅度
    let bodyMesh = null;
    catRoot.traverse((o) => { if (o.name === "body") bodyMesh = o; });
    if (bodyMesh) bodyMesh.scale.y = breathe;
    if (sleepEyes) sleepEyes.visible = true;
  } else {
    if (sleepEyes) sleepEyes.visible = false;
    // 恢复 body scale
    if (catRoot) catRoot.traverse((o) => { if (o.name === "body") o.scale.y = 1; });
  }
  // 交互动作叠加位移（反应/小剧场/演示）
  const actOffset = tickAct3d(performance.now());
  if (catRoot) {
    catRoot.position.x = actOffset ? actOffset[0] / 100 : 0; // 100≈场景单位比例
    catRoot.position.y = actOffset ? actOffset[1] / 100 : 0;
  }
  tickPlaceholder(dt, t);
  renderer.render(scene, camera);
}
loop();

// ---------- 行为事件（与 2D 版同源） ----------
microPet.onState((msg) => {
  locale3d = msg.locale ?? locale3d;
  if (msg.pool) personaPool = msg.pool;
  if (msg.coatId && msg.coatId !== coatNow) {
    coatNow = msg.coatId;
    applyCoat(coatNow);
  }
  walking = !!msg.walking;
  applyOutfit3D(msg.outfit === undefined ? null : msg.outfit); // 广播带装扮（hat/scarf/bow，3D 版先支持 hat）
  setPet(walking ? "walk" : msg.pet);
  // 气泡文案（复用 2D 逻辑精简版）
  const s = microPet.strings(msg.locale ?? "zh-CN");
  if (msg.walking) hideBubble();
  else if (msg.pet === "remind" && msg.exercise) showBubble(`${msg.exercise.emoji} ${msg.exercise.name} · ${s.bubble.letsGo}`, msg.exercise.cue);
  else if (msg.pet === "happy") { showBubble(microPet.fmt(s.bubble.good, { n: msg.streakDays }), s.bubble.petMe); setTimeout(() => { if (petState !== "happy") hideBubble(); }, 2600); }
  else if (msg.pet === "cling") { const pool = (s.bubble.clingPools || {})[personaPool] || s.bubble.cling || []; if (pool.length) showBubble(pool[Math.floor(Math.random() * pool.length)], ""); setTimeout(() => { if (petState === "cling") hideBubble(); }, 8000); }
  else if (msg.pet === "idle") setTimeout(() => { if (petState === "idle") hideBubble(); }, 300);
});
microPet.onHint((h) => { showBubble(h.title, h.cue); setTimeout(() => hideBubble(), 4500); });
let personaPool = "clingy";
let bubbleOn = false;
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

// ---------- 交互动作（F34 补 3D 版）：反应池/小剧场/演示/拖动 ----------
let act3d = null; // { kind: reaction|skit|pose, type, start }——临时动作覆盖层
let dragSt = null; // 拖动 { startX, startY, moved }

function playAct(kind, type) {
  // resume 取「当前状态应播的 clip」而非 curClipName：连续触发两个动作时，
  // 第二次的 resume 会捕获上一次的动作 clip（如 dance）→ 结束后 dance 无限循环（无休止真凶）
  const stateMap = { idle: "idle", walk: "walk", run: "run", remind: "gesture-positive", session: "gesture-positive", happy: "dance", cling: "gesture-negative" };
  act3d = { kind, type, start: performance.now(), resume: stateMap[petState] ?? "idle" };
  // 动作期 clip 选择
  const clipMap = { jump: "dance", roll: "run", wiggle: "idle", meow: "gesture-positive", hop: "dance", mouse: "run", walk: "walk" };
  // mouse 剧场的分段 clip：潜伏 sit → 追 run → 得手/蔫 sit
  if (type === "mouse") {
    setTimeout(() => { if (act3d?.type === "mouse") playClip("sit"); }, 3400); // 追完坐回
  }
  playClip(clipMap[type] ?? "idle");
}

/** 临时动作的位移律动（在 clip 动画之上叠加）——返回 [ox, oy] 或 null 结束 */
function tickAct3d(now) {
  if (!act3d) return null;
  const t = (now - act3d.start) / 1000;
  let ox = 0, oy = 0;
  const finish = () => { const r = act3d?.resume ?? "idle"; act3d = null; playClip(r === "walk-demo" ? "idle" : r); return null; };
  if (act3d.type === "jump") {
    if (t > 1.2) { return finish(); }
    oy = Math.round(11 * Math.sin(Math.PI * Math.min(1, t / 1.2))); // 弧高 11px=静止余量 13px 的安全值（46→28→11 三次实测收敛；3D 相机已拉远 d=4.4）
  } else if (act3d.type === "roll") {
    if (t > 1.8) { return finish(); }
    // 原地打滚：横向摆 + 下沉
    ox = Math.round(8 * Math.sin(t * 6));
    oy = -Math.round(4 * Math.abs(Math.sin(t * 3)));
  } else if (act3d.type === "wiggle") {
    if (t > 0.7) { return finish(); }
    ox = Math.round(4 * (Math.floor(now / 90) % 2 ? 1 : -1));
  } else if (act3d.type === "meow") {
    if (t > 0.9) { return finish(); }
    oy = Math.round(2 * Math.sin(Math.PI * t / 0.9));
  } else if (act3d.type === "hop") { // 蹦跳 5s（8s 太长）
    if (t > 5) { return finish(); }
    const ph = t % 2.2;
    oy = ph < 0.4 ? Math.round(10 * Math.sin(Math.PI * ph / 0.4)) : ph < 0.8 ? Math.round(8 * Math.sin(Math.PI * (ph - 0.4) / 0.4)) : 0;
  } else if (act3d.type === "mouse") { // 抓老鼠：run 追→4.5s 扑→6s 收
    if (t > 6) { return finish(); }
    if (t >= 4.5 && t < 5.5) oy = Math.round(10 * Math.sin(Math.PI * (t - 4.5)));
  } else if (act3d.type === "walk-demo") {
    if (t > 2.6) { return finish(); }
  }
  return [ox, oy];
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

// F33 明信片（3D 版）：景点剪影底 + 本页 canvas 实时快照——旅行照片感
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
    case "pagoda": pctx.fillRect(56, 24, 16, 40); pctx.fillRect(52, 34, 24, 4); pctx.fillRect(48, 54, 32, 4); pctx.fillRect(62, 14, 4, 10); break;
    case "towers": pctx.fillRect(30, 30, 12, 34); pctx.fillRect(48, 16, 16, 48); pctx.fillRect(70, 36, 14, 28); pctx.fillRect(90, 24, 12, 40); break;
    case "bamboo": for (const [x, h] of [[40, 34], [50, 42], [62, 30], [76, 40]]) { pctx.fillRect(x, 64 - h, 4, h); pctx.fillRect(x - 4, 66 - h, 12, 3); } break;
    case "wall": pctx.fillRect(20, 44, 88, 20); for (let x = 20; x < 108; x += 12) pctx.fillRect(x, 38, 7, 6); break;
    case "palace": pctx.fillRect(38, 48, 52, 16); pctx.fillRect(30, 44, 68, 4); pctx.fillRect(46, 36, 36, 8); pctx.fillRect(58, 26, 12, 10); break;
    case "snow": pctx.fillStyle = "#f0f4f8"; pctx.fillRect(0, 60, 128, 4); pctx.fillStyle = sp.land; pctx.fillRect(24, 40, 8, 20); pctx.fillRect(48, 30, 10, 30); pctx.fillRect(78, 44, 8, 16); break;
    case "beach": pctx.fillRect(88, 44, 5, 20); pctx.fillRect(76, 40, 28, 5); pctx.fillStyle = "#7fc8d8"; pctx.fillRect(0, 66, 60, 4); break;
    case "desk": pctx.fillRect(34, 32, 44, 26); pctx.fillStyle = "#e8e4dc"; pctx.fillRect(38, 36, 36, 18); pctx.fillStyle = sp.land; pctx.fillRect(52, 58, 8, 5); pctx.fillRect(86, 48, 8, 10); break;
    case "printer": pctx.fillRect(38, 36, 40, 16); pctx.fillRect(44, 52, 28, 8); pctx.fillStyle = "#ffffff"; pctx.fillRect(46, 30, 24, 8); break;
    default: pctx.fillRect(40, 40, 50, 24); // island 等
  }
  // 右下角：当前 3D canvas 快照（preserveDrawingBuffer 已开，toDataURL 即照片）
  try {
    const shot = document.createElement("canvas");
    shot.width = 96; shot.height = 110;
    const sctx = shot.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(canvas, 0, 0, 96, 110);
    pctx.drawImage(shot, 92, 48, 27, 31);
  } catch { /* 快照失败不阻断落盘 */ }
  microPet.sendPostcard(pc.toDataURL("image/png"));
});

// 拖动（复用 2D 判定与主进程坐标权威）
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
function endDrag3d() {
  if (!dragSt) return;
  if (dragSt.moved) setTimeout(() => { act3d = null; }, 100); // 拖后不打断，仅清
  dragSt = null;
}
window.addEventListener("pointerup", endDrag3d);
window.addEventListener("pointercancel", endDrag3d);

// ---------- 点击（→ 主进程：提醒/撒娇=打卡，idle=反应池） ----------
canvas.addEventListener("click", () => {
  if (dragSt?.moved) return; // 拖动尾随 click 忽略
  microPet.petClick();
});

let locale3d = "zh-CN";

microPet.ready();
