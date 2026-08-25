// Visual proof: screenshots of two browsers in co-op Missile Defense via the real local-relay.
const puppeteer = require("puppeteer-core");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8801, BASE = `http://localhost:${PORT}`, url = `${BASE}/index.html?game=missile`;
const OUT = process.env.SHOT_DIR || path.resolve(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitHealth = (t) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const r = http.get(`${BASE}/health`, x => { x.resume(); res(); }); r.on("error", () => Date.now() - t0 > t ? rej(new Error("no relay")) : setTimeout(tick, 200)); }; tick(); });
(async () => {
  const relay = spawn("node", [path.resolve(__dirname, "server", "local-relay.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  await waitHealth(8000);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const mk = async () => { const p = await browser.newPage(); await p.setViewport({ width: 760, height: 680 }); await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p; };
  const A = await mk(), B = await mk();
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(500);
  await A.screenshot({ path: path.join(OUT, "shot_host_waiting.png") });   // host: "ROOM CODE XXXX, waiting…"
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c); }, code);
  await A.bringToFront();
  await A.evaluate(() => { window.__arcade.togglePause(false); });   // clear the pre-online blur-pause (test artifact of opening a 2nd tab)
  await B.evaluate(() => { window.__arcade.togglePause(false); });
  await sleep(2600);
  await A.evaluate(() => { window.__arcade.togglePause(false); });
  await B.evaluate(() => { window.__arcade.togglePause(false); });
  await A.screenshot({ path: path.join(OUT, "shot_host_coop.png") });   // host in co-op
  await B.screenshot({ path: path.join(OUT, "shot_guest_coop.png") });  // guest mirroring host's world
  console.log("code:", code, "-> wrote shot_host_waiting.png, shot_host_coop.png, shot_guest_coop.png to", OUT);
  await browser.close(); relay.kill();
})().catch(e => { console.error(e); process.exit(1); });
