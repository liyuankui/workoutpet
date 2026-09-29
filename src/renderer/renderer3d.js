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
camera.position.set(0, 1.4, 3.2);
camera.lookAt(0, 0.55, 0);
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
})();

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
  if (curClipName && clips[curClipName] && catRoot) driveAnim(catRoot, clips[curClipName], dt);
  tickPlaceholder(dt, t);
  renderer.render(scene, camera);
}
loop();

// ---------- 行为事件（与 2D 版同源） ----------
microPet.onState((msg) => {
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

// ---------- 点击（raycast → 打卡/反应走主进程） ----------
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
canvas.addEventListener("click", () => {
  microPet.petClick(); // 提醒/撒娇=打卡，idle=反应池（主进程语义不变）
});
// 猫被 hover 时 3D 拾取高亮（留）——spike 用整 canvas 可点即可

microPet.ready();
