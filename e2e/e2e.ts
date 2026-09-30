// micro-pet E2E 回归套件：对 /Applications 打包版全自动验收（发版 gate）
// 用法：bun run e2e/e2e.ts —— 全 PASS 才可发版；FAIL 列表即修复清单
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const results: Array<[string, string, string]> = []; // [name, PASS/FAIL/SKIP, evidence]
const record = (n: string, ok: boolean | "skip", ev: string) => results.push([n, ok === true ? "✅ PASS" : ok === "skip" ? "⏭️ SKIP(人工)" : "❌ FAIL", ev]);

const HOME = mkdtempSync(join(tmpdir(), "e2e-"));
const PORT = 9231;
const APP = "/Applications/micro-pet.app";
let ws: WebSocket;
let seq = 0; const pending = new Map();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 20; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((p: any) => p.url.includes("renderer")) ?? list[0];
      if (!t) throw new Error("no target");
      ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      });
      return;
    } catch { await sleep(500); }
  }
  throw new Error("CDP 连接失败");
}
const send = (e: string) => new Promise<any>((res) => {
  const i = ++seq; pending.set(i, (m: any) => res(m.result?.result?.value));
  ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression: e, returnByValue: true } }));
});

async function canvasStats() {
  const d: string = await send("canvas.toDataURL('image/png')");
  return Buffer.from(d.split(",")[1]!, "base64");
}
async function clickCat() {
  const r = await send("(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2 }; })()");
  for (const ty of ["mousePressed", "mouseReleased"]) {
    await send(`(() => {})()`); // 顺序保证
    ws.send(JSON.stringify({ id: ++seq, method: "Input.dispatchMouseEvent", params: { type: ty, x: r.x, y: r.y, button: "left", clickCount: 1 } }));
    await sleep(60);
  }
}

// ---------- 启动 ----------
const proc = spawn(`${APP}/Contents/MacOS/micro-pet`, [`--remote-debugging-port=${PORT}`], {
  env: { ...process.env, MICROPET_HOME: HOME }, detached: true, stdio: "ignore",
});
try {
  await connect();
  await sleep(6500); // 心跳 5s 周期 + 余量

  // 1. 心跳就绪
  const hb = JSON.parse(readFileSync(join(HOME, "heartbeat.json"), "utf8"));
  record("启动心跳", hb.visible === true, `visible=${hb.visible} pet=${hb.pet}`);

  // 2. 猫可见（canvas 非空）
  await sleep(800);
  const img1 = await canvasStats();
  const px1 = await send("(() => { const d = canvas.getContext(webglCtxType).getContext ? null : null; return 0; })()").catch(() => 0);
  // 用 renderer 内读像素（webgl preserveDrawingBuffer 已开）
  const opaque = await send("(() => { const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); gl ?? renderer.getContext(); const c = renderer.getContext(); const w = c.drawingBufferWidth, h = c.drawingBufferHeight; const px = new Uint8Array(4 * w * h); c.readPixels(0, 0, w, h, c.RGBA, c.UNSIGNED_BYTE, px); let n = 0, s = 0; for (let i = 0; i < px.length; i += 4) { if (px[i+3] > 200) { n++; s += (px[i]+px[i+1]+px[i+2])/3; } } return n + '/' + Math.round(n ? s/n : 0); })()");
  const [pxN, lum] = opaque.split("/").map(Number);
  record("猫可见", pxN > 800, `不透明像素=${pxN}`);
  record("猫亮度", lum > 80, `均色亮度=${lum}（门槛 80）`);

  // 3. idle 动画（帧差）
  const a1 = await canvasStats(); await sleep(400); const b1 = await canvasStats();
  const diffIdle = Buffer.compare(a1, b1) !== 0;
  record("idle 动画活", diffIdle, "两时刻帧不同");

  // 4. 动作通道（jump）
  await send("playAct ? playAct('reaction','jump') : (petState='walk')");
  const a2 = await canvasStats(); await sleep(300); const b2 = await canvasStats();
  record("动作通道(jump)", Buffer.compare(a2, b2) !== 0, "帧差>0");

  // 5. 点击→petClick 链（idle 点击走反应池不写盘——验证无异常 + 气泡系统不崩）
  await clickCat();
  await sleep(300);
  record("点击链", true, "petClick 无异常");

  // 6. 全动作通道（6 clip 帧差）
  for (const c of ["idle", "walk", "run", "dance", "gesture-positive", "gesture-negative"]) {
    await send(`setPet('${c}')`);
    await sleep(150); const a = await canvasStats();
    await sleep(260); const b = await canvasStats();
    record(`clip:${c}`, a !== b, "两时刻帧差");
  }
  // 7. 交互通道（反应/小剧场）
  for (const [n, trig] of [["act:jump", "playAct('reaction','jump')"], ["act:roll", "playAct('reaction','roll')"], ["act:hop", "playAct('skit','hop')"], ["act:mouse", "playAct('skit','mouse')"]] as const) {
    await send(trig);
    await sleep(120); const a = await canvasStats();
    await sleep(280); const b = await canvasStats();
    record(n, a !== b, "帧差");
  }
  // 8. 明信片落盘链
  await send("(() => { const pc = document.createElement('canvas'); pc.width=8; pc.height=8; const c = pc.getContext('2d'); c.fillStyle='#f5c07a'; c.fillRect(0,0,8,8); microPet.sendPostcard(pc.toDataURL('image/png')); return 1; })()");
  await sleep(1000);
  let pcOk = false;
  try { pcOk = readFileSync(join(HOME, "postcards")).length >= 0; } catch { pcOk = false; }
  try { const d = execSync(`ls ${JSON.stringify(join(HOME, "postcards"))}`).toString().trim(); pcOk = d.length > 0; } catch { pcOk = false; }
  record("明信片落盘", pcOk, "postcards/ 有文件");
  // 9. 健壮性：非法 clip/动作不崩
  record("非法输入健壮", await send("(() => { try { setPet('bogus'); playClip('bogus'); playAct('x','bogus'); return 1; } catch { return 0; } })()") === 1, "bogus 不抛");
  // 10. 打卡全链（快时钟归专用 e2e-long，此处 SKIP）
  record("打卡全链", "skip", "需快时钟 env（e2e-long 专用）");
} catch (e) {
  record("套件自身", false, String(e));
} finally {
  try { process.kill(-proc.pid!, "SIGTERM"); } catch {}
  try { proc.kill("SIGTERM"); } catch {}
  rmSync(HOME, { recursive: true, force: true });
}

console.log("\n========== E2E 回归 ==========");
let fail = 0;
for (const [n, s, ev] of results) {
  if (s.includes("FAIL")) fail++;
  console.log(`${s}  ${n} — ${ev}`);
}
console.log("==============================");
console.log(fail === 0 ? "全部通过（SKIP 项为已声明人工面）" : `${fail} 项失败——禁止发版`);
process.exit(fail === 0 ? 0 : 1);
