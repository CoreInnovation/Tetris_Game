// E2E test of online Pong on the reusable Arcade.Lobby — local mock room server (same protocol as
// server/src/worker.js) + two headless browsers: roles, presence, input/state sync via the generic msg plane.
const puppeteer = require("puppeteer-core");
const path = require("path");
const { WebSocketServer } = require("ws");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8792;
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pong";
const RELAY = new Set(["msg", "rematch", "emote", "bye", "state", "input"]);

// mock room server: per game+code rooms of <=2, relays RELAY msgs to the peer (mirrors PongRoom)
const rooms = new Map();
const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (ws, req) => {
  const u = new URL(req.url, "http://x");
  const code = (u.searchParams.get("code") || "").toUpperCase();
  const game = (u.searchParams.get("game") || "g").toLowerCase();
  const name = u.searchParams.get("name") || "Player";
  const key = game + ":" + code;
  let room = rooms.get(key); if (!room) { room = []; rooms.set(key, room); }
  if (room.length >= 2) { ws.send(JSON.stringify({ t: "full" })); ws.close(); return; }
  const role = room.length === 0 ? "host" : "guest";
  const peer = { ws, role, name }; room.push(peer);
  ws.send(JSON.stringify({ t: "role", role, code, name }));
  const other = room.find(p => p !== peer);
  if (other) { other.ws.send(JSON.stringify({ t: "peer", event: "joined", name })); ws.send(JSON.stringify({ t: "peer", event: "joined", name: other.name })); }
  ws.on("message", (data) => { let m; try { m = JSON.parse(data.toString()); } catch { return; } if (!m || !RELAY.has(m.t)) return; const o = room.find(p => p !== peer); if (o) o.ws.send(data.toString()); });
  ws.on("close", () => { const i = room.indexOf(peer); if (i >= 0) room.splice(i, 1); const o = room[0]; if (o) o.ws.send(JSON.stringify({ t: "peer", event: "left", name })); });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const mk = async () => {
    const p = await browser.newPage();
    await p.setViewport({ width: 480, height: 820, deviceScaleFactor: 1 });
    await p.evaluateOnNewDocument((u) => { window.ARCADE_NET_URL = u; }, "ws://localhost:" + PORT);
    const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    p._errs = errs; await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p;
  };
  const A = await mk(), B = await mk();

  // A creates a room (via the lobby), B joins the same code
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(400);
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c); }, code);
  await sleep(900);

  const roles = await Promise.all([
    A.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, peer: g.peerName }; }),
    B.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, peer: g.peerName }; })
  ]);

  // guest input -> host
  await B.evaluate(() => { const g = window.__arcade._game; g.cpuP.x = g.court.x + g.court.w * 0.25; });
  await sleep(250);
  const inputSync = await A.evaluate(() => { const g = window.__arcade._game; return { guestX: Math.round(g._guestX), expect: Math.round(g.court.x + g.court.w * 0.25) }; });

  // rally a bit, then compare ball + scores
  await sleep(3500);
  const snap = await Promise.all([
    A.evaluate(() => { const g = window.__arcade._game; return { bx: Math.round(g.ball.x), by: Math.round(g.ball.y), hx: Math.round(g.player.x), sH: g.sH, sG: g.sG, phase: g.lobby.phase }; }),
    B.evaluate(() => { const g = window.__arcade._game; return { bx: Math.round(g.ball.x), by: Math.round(g.ball.y), hx: Math.round(g.player.x), sH: g.sH, sG: g.sG, phase: g.lobby.phase }; })
  ]);

  // force a host win to test the neutral-verdict relay
  await A.evaluate(() => { const g = window.__arcade._game; g.sH = 6; g.sG = 0; g._onlinePoint("H"); });
  await sleep(400);
  const ended = await Promise.all([
    A.evaluate(() => { const g = window.__arcade._game.lobby; return { phase: g.phase, verdict: g._verdictText() }; }),
    B.evaluate(() => { const g = window.__arcade._game.lobby; return { phase: g.phase, verdict: g._verdictText() }; })
  ]);

  const out = {
    code, roles,
    rolesOk: roles[0].role === "host" && roles[1].role === "guest" && roles[0].phase === "play" && roles[1].phase === "play",
    peersOk: !!roles[0].peer && !!roles[1].peer,
    inputSync, inputOk: Math.abs(inputSync.guestX - inputSync.expect) <= 4,
    scoresOk: snap[0].sH === snap[1].sH && snap[0].sG === snap[1].sG,
    ballSync: Math.abs(snap[0].bx - snap[1].bx) <= 60 && Math.abs(snap[0].by - snap[1].by) <= 90,
    ended,
    endedOk: ended[0].phase === "ended" && ended[1].phase === "ended" && ended[0].verdict === "YOU WIN! 🏆" && ended[1].verdict === "YOU LOST",
    errsA: A._errs.slice(0, 4), errsB: B._errs.slice(0, 4)
  };
  console.log(JSON.stringify(out, null, 2));
  await browser.close(); wss.close();
})();
