// LIVE end-to-end: two browsers play online Pong through the REAL deployed Cloudflare Worker
// (Durable Object relay) + a live leaderboard write/read. No mock server.
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WS = "wss://chriskit-arcade.coreinnovation.workers.dev";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pong";
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const mk = async () => { const p = await browser.newPage(); await p.setViewport({ width: 480, height: 820, deviceScaleFactor: 1 }); await p.evaluateOnNewDocument((u) => { window.ARCADE_NET_URL = u; }, WS); const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p._errs = errs; await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p; };
  const A = await mk(), B = await mk();
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(1200);   // real network round-trips
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c); }, code);
  await A.bringToFront();
  await A.evaluate(() => { window.__arcade._paused = false; const g = window.__arcade._game; if (g.resume) g.resume(); });
  await sleep(1500);
  const roles = await Promise.all([
    A.evaluate(() => ({ role: window.__arcade._game.lobby.role, phase: window.__arcade._game.lobby.phase, peer: window.__arcade._game.lobby.peerName })),
    B.evaluate(() => ({ role: window.__arcade._game.lobby.role, phase: window.__arcade._game.lobby.phase, peer: window.__arcade._game.lobby.peerName }))
  ]);
  // guest input -> host (through the real DO)
  await B.evaluate(() => { const g = window.__arcade._game; g.cpuP.x = g.court.x + g.court.w * 0.3; });
  await sleep(500);
  const inputSync = await A.evaluate(() => { const g = window.__arcade._game; return { guestX: Math.round(g._guestX), expect: Math.round(g.court.x + g.court.w * 0.3) }; });
  // host state -> guest
  await sleep(1500);
  const snap = await Promise.all([
    A.evaluate(() => { const g = window.__arcade._game; return { bx: Math.round(g.ball.x), sH: g.sH, sG: g.sG }; }),
    B.evaluate(() => { const g = window.__arcade._game; return { bx: Math.round(g.ball.x), sH: g.sH, sG: g.sG }; })
  ]);
  // live leaderboard from the page
  const lb = await A.evaluate(async () => { await Arcade.Scores.submit("pong", "LIVEPLAYER", 777, "desktop"); const t = await Arcade.Scores.top("pong", 5, "desktop"); return t; });
  console.log(JSON.stringify({
    code, roles,
    rolesOk: roles[0].role === "host" && roles[1].role === "guest" && roles[0].phase === "play" && roles[1].phase === "play" && !!roles[0].peer && !!roles[1].peer,
    inputSync, inputOk: Math.abs(inputSync.guestX - inputSync.expect) <= 5,
    scoreSync: snap[0].sH === snap[1].sH && snap[0].sG === snap[1].sG,
    ballClose: Math.abs(snap[0].bx - snap[1].bx) <= 90, snap,
    leaderboardLive: Array.isArray(lb) && lb.some(r => r.name === "LIVEPLAYER"),
    errsA: A._errs.slice(0, 4), errsB: B._errs.slice(0, 4)
  }, null, 2));
  await browser.close();
})();
