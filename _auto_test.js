// E2E: the "auto" transport — WebRTC P2P first, WebSocket-relay fallback.
// Scenario A: P2P works  -> session runs over RTC (via="rtc").
// Scenario B: P2P broker unreachable -> guest times out, falls back to the relay (via="ws").
// The local-relay.js stands in for the Cloudflare relay (same protocol). Two separate browsers per scenario.
const puppeteer = require("puppeteer-core");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8803;
const WS = `ws://localhost:${PORT}`;
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=missile";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitHealth = (t) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const r = http.get(`http://localhost:${PORT}/health`, x => { x.resume(); res(); }); r.on("error", () => Date.now() - t0 > t ? rej(new Error("no relay")) : setTimeout(tick, 200)); }; tick(); });
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-features=WebRtcHideLocalIpsWithMdns"], protocolTimeout: 60000 });

// breakRtc=true points PeerJS at a dead port so no direct channel can form -> forces fallback.
async function scenario(name, breakRtc, expectVia) {
  const bH = await launch(), bG = await launch();
  const mk = async (b) => {
    const p = await b.newPage(); await p.setViewport({ width: 760, height: 680 });
    await p.evaluateOnNewDocument((wsUrl, brk) => {
      window.ARCADE_NET_TRANSPORT = "auto";
      window.ARCADE_NET_URL = wsUrl;            // relay fallback target (stands in for Cloudflare)
      window.ARCADE_RTC_TIMEOUT = 3000;         // shorten the P2P wait for the test
      if (brk) window.ARCADE_PEERJS_CONFIG = { host: "127.0.0.1", port: 1, path: "/" };   // unreachable broker
    }, WS, breakRtc);
    const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    p._errs = errs; await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p;
  };
  const A = await mk(bH), B = await mk(bG);
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(1200);
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c, false); }, code);
  let roles = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    roles = await Promise.all([
      A.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, via: g.net && g.net.via }; }),
      B.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, via: g.net && g.net.via }; })
    ]);
    if (roles[0].phase === "play" && roles[1].phase === "play") break;
  }
  await A.evaluate(() => window.__arcade.togglePause(false));
  await B.evaluate(() => window.__arcade.togglePause(false));
  await sleep(2200);
  const guestSees = await B.evaluate(() => { const s = window.__arcade._game.coopSnap; return { hasSnap: !!s, enemies: s ? (s.e || []).length : -1 }; });
  await B.evaluate(() => window.__arcade._game.lobby.leave());
  await sleep(700);
  const hostAfterLeave = await A.evaluate(() => { const g = window.__arcade._game.lobby; return { phase: g.phase, verdict: g._verdictText() }; });

  const r = {
    name, roles,
    rolesOk: roles && roles[0].role === "host" && roles[1].role === "guest" && roles[0].phase === "play" && roles[1].phase === "play",
    via: roles && roles[0].via, viaOk: roles && roles[0].via === expectVia && roles[1].via === expectVia,
    guestSnapOk: guestSees.hasSnap && guestSees.enemies >= 0,
    leaveOk: hostAfterLeave.phase === "ended" && hostAfterLeave.verdict === "OPPONENT LEFT",
    errs: [...A._errs, ...B._errs].slice(0, 6)
  };
  r.PASS = r.rolesOk && r.viaOk && r.guestSnapOk && r.leaveOk;
  await bH.close(); await bG.close();
  return r;
}

(async () => {
  const relay = spawn("node", [path.resolve(__dirname, "server", "local-relay.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  await waitHealth(8000);
  const a = await scenario("A: P2P works -> via rtc", false, "rtc");
  const b = await scenario("B: P2P broken -> fallback to relay (via ws)", true, "ws");
  console.log(JSON.stringify({ a, b, ALL_PASS: a.PASS && b.PASS }, null, 2));
  relay.kill();
  process.exit(a.PASS && b.PASS ? 0 : 1);
})().catch(e => { console.error("TEST ERROR:", e); process.exit(1); });
