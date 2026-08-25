// E2E test of co-op Missile Defense on Arcade.Lobby: mock room server + 2 browsers.
// Host runs the sim + broadcasts snapshots; guest receives them and fires (relayed to host).
const puppeteer = require("puppeteer-core");
const path = require("path");
const { WebSocketServer } = require("ws");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8794;
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=missile";
const RELAY = new Set(["msg", "rematch", "emote", "bye", "state", "input"]);
const rooms = new Map();
const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (ws, req) => {
  const u = new URL(req.url, "http://x"), code = (u.searchParams.get("code") || "").toUpperCase(), game = (u.searchParams.get("game") || "g").toLowerCase(), name = u.searchParams.get("name") || "P";
  const key = game + ":" + code; let room = rooms.get(key); if (!room) { room = []; rooms.set(key, room); }
  if (room.length >= 2) { ws.send(JSON.stringify({ t: "full" })); ws.close(); return; }
  const role = room.some(p => p.role === "host") ? "guest" : "host"; const peer = { ws, role, name }; room.push(peer);
  ws.send(JSON.stringify({ t: "role", role, code, name }));
  const other = room.find(p => p !== peer);
  if (other) { other.ws.send(JSON.stringify({ t: "peer", event: "joined", name })); ws.send(JSON.stringify({ t: "peer", event: "joined", name: other.name })); }
  ws.on("message", (d) => { let m; try { m = JSON.parse(d.toString()); } catch { return; } if (!m || !RELAY.has(m.t)) return; const o = room.find(p => p !== peer); if (o) o.ws.send(d.toString()); });
  ws.on("close", () => { const i = room.indexOf(peer); if (i >= 0) room.splice(i, 1); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const mk = async () => { const p = await browser.newPage(); await p.setViewport({ width: 760, height: 680, deviceScaleFactor: 1 }); await p.evaluateOnNewDocument((u) => { window.ARCADE_NET_URL = u; }, "ws://localhost:" + PORT); const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p._errs = errs; await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p; };
  const A = await mk(), B = await mk();
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(400);
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c); }, code);
  await A.bringToFront();   // a real host keeps their tab active
  await A.evaluate(() => { window.__arcade._paused = false; const g = window.__arcade._game; if (g.resume) g.resume(); });   // clear the pre-online blur-pause (test artifact of opening a 2nd page)
  await sleep(2600);   // let the host sim run + broadcast snapshots

  const roles = await Promise.all([
    A.evaluate(() => ({ role: window.__arcade._game.lobby.role, phase: window.__arcade._game.lobby.phase })),
    B.evaluate(() => ({ role: window.__arcade._game.lobby.role, phase: window.__arcade._game.lobby.phase }))
  ]);
  const guestSees = await B.evaluate(() => { const g = window.__arcade._game; const s = g.coopSnap; return { hasSnap: !!s, enemies: s ? (s.e || []).length : -1, wave: s ? s.w : -1, cities: s ? s.c : -1 }; });
  const diag = await A.evaluate(() => { const g = window.__arcade._game, sh = window.__arcade; const d = { paused: sh._paused, state: g.state, isHost: g._isHost(), phase: g.lobby.phase, online: g.lobby.online, netOpen: !!(g.lobby.net && g.lobby.net.open), clock: g.lobby._clock, enemies: g.enemies.length }; g._coopBroadcast(); d.timers = JSON.stringify(g.lobby._sendTimers); return d; });
  await sleep(250);
  const guest2 = await B.evaluate(() => { const s = window.__arcade._game.coopSnap; return { hasSnap: !!s, enemies: s ? (s.e || []).length : -1 }; });
  console.log("DIAG host:", JSON.stringify(diag));
  console.log("guest after forced broadcast:", JSON.stringify(guest2));

  // guest fires (raw host px) → host drives its 2nd cannon: guestAim jumps there + an interceptor spawns
  const fx = await A.evaluate(() => Math.round(window.__arcade._game._w * 0.2));
  await B.evaluate((x) => { const g = window.__arcade._game; g.lobby.send({ t: "fire", x, y: 160 }); }, fx);
  await sleep(120);
  const hostGotFire = await A.evaluate(() => { const g = window.__arcade._game; return { guestAimX: g.guestAim ? Math.round(g.guestAim.x) : null, interceptors: g.interceptors.length }; });

  console.log(JSON.stringify({
    roles, rolesOk: roles[0].role === "host" && roles[1].role === "guest" && roles[0].phase === "play" && roles[1].phase === "play",
    guestSees, guestSnapOk: guestSees.hasSnap && guestSees.enemies >= 0 && guestSees.wave >= 1,
    hostGotFire, fireOk: hostGotFire.guestAimX === fx && hostGotFire.interceptors > 0,
    errsA: A._errs.slice(0, 5), errsB: B._errs.slice(0, 5)
  }, null, 2));
  await browser.close(); wss.close();
})();
