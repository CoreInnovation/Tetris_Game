// E2E: the REAL local-relay.js (serves the arcade + relays) with two real browsers.
// Proves "two browsers on one machine" co-op works with ZERO config — the page is served
// from localhost so js/core/net.js auto-targets the same-origin relay (no ARCADE_NET_URL inject).
const puppeteer = require("puppeteer-core");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const url = `${BASE}/index.html?game=missile`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitHealth(timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BASE}/health`, res => { res.resume(); resolve(true); });
      req.on("error", () => { if (Date.now() - t0 > timeoutMs) reject(new Error("relay never came up")); else setTimeout(tick, 200); });
    };
    tick();
  });
}

(async () => {
  // 1) start the REAL relay the user will run
  const relay = spawn("node", [path.resolve(__dirname, "server", "local-relay.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  let relayLog = "";
  relay.stdout.on("data", d => relayLog += d.toString());
  relay.stderr.on("data", d => relayLog += d.toString());
  await waitHealth(8000);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const mk = async () => {
    const p = await browser.newPage();
    await p.setViewport({ width: 760, height: 680, deviceScaleFactor: 1 });
    const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    p._errs = errs; await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p;
  };
  const A = await mk(), B = await mk();

  // sanity: the client must have auto-resolved to the same-origin relay (not the cloud)
  const netUrl = await A.evaluate(() => window.Arcade.Net.url());

  // 2) A creates a room, B joins it
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(500);
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c); }, code);
  await A.bringToFront();
  await A.evaluate(() => { window.__arcade._paused = false; const g = window.__arcade._game; if (g.resume) g.resume(); });
  await sleep(2600);

  const roles = await Promise.all([
    A.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, peer: g.peerName }; }),
    B.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, peer: g.peerName }; })
  ]);

  // 3) guest must be receiving the host's authoritative snapshots
  const guestSees = await B.evaluate(() => { const s = window.__arcade._game.coopSnap; return { hasSnap: !!s, enemies: s ? (s.e || []).length : -1, wave: s ? s.w : -1 }; });

  // 4) guest fires (real protocol: raw host px) -> host should process it (aim jumps there)
  const hostW = await A.evaluate(() => window.__arcade._game._w);
  const fx = Math.round(hostW * 0.25), fy = 160;
  const beforeFire = await A.evaluate(() => window.__arcade._game.interceptors.length);
  await B.evaluate((x, y) => { window.__arcade._game.lobby.send({ t: "fire", x, y }); }, fx, fy);
  await sleep(150);
  // a guest fire drives the host's 2nd cannon: it sets guestAim (not the host's own aim) and launches an interceptor
  const hostGotFire = await A.evaluate(() => { const g = window.__arcade._game; return { guestAimX: g.guestAim ? Math.round(g.guestAim.x) : null, interceptors: g.interceptors.length }; });

  // 5) guest leaves -> host should be told the peer left (clean disconnect, not a crash)
  await B.evaluate(() => window.__arcade._game.lobby.leave());
  await sleep(500);
  const hostAfterLeave = await A.evaluate(() => { const g = window.__arcade._game.lobby; return { phase: g.phase, verdict: g._verdictText() }; });

  const out = {
    netUrl, netUrlOk: /^ws:\/\/localhost:8799$/.test(netUrl),
    roles, rolesOk: roles[0].role === "host" && roles[1].role === "guest" && roles[0].phase === "play" && roles[1].phase === "play",
    peersOk: !!roles[0].peer && !!roles[1].peer,
    guestSees, guestSnapOk: guestSees.hasSnap && guestSees.enemies >= 0 && guestSees.wave >= 1,
    hostGotFire, fireOk: hostGotFire.guestAimX === fx && hostGotFire.interceptors > beforeFire,
    hostAfterLeave, leaveOk: hostAfterLeave.phase === "ended" && hostAfterLeave.verdict === "OPPONENT LEFT",
    errsA: A._errs.slice(0, 5), errsB: B._errs.slice(0, 5)
  };
  out.PASS = out.netUrlOk && out.rolesOk && out.peersOk && out.guestSnapOk && out.fireOk && out.leaveOk && out.errsA.length === 0 && out.errsB.length === 0;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  relay.kill();
  process.exit(out.PASS ? 0 : 1);
})().catch(e => { console.error("TEST ERROR:", e); process.exit(1); });
