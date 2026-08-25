const puppeteer = require("puppeteer-core");
const path = require("path"), fs = require("fs");
const { WebSocketServer } = require("ws");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
const PORT = 8795;
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const mk = async () => { const p = await browser.newPage(); await p.setViewport({ width: 820, height: 640, deviceScaleFactor: 2 }); await p.evaluateOnNewDocument((u) => { window.ARCADE_NET_URL = u; }, "ws://localhost:" + PORT); await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p; };
  const A = await mk(), B = await mk();
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(300);
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c); }, code);
  await A.bringToFront();
  await A.evaluate(() => { window.__arcade._paused = false; const g = window.__arcade._game; if (g.resume) g.resume(); g.dev = true; });   // dev = unlock weapons so the host fires freely
  // host auto-fires at enemies for a livelier shot; let several waves of enemies appear
  await A.evaluate(() => { const g = window.__arcade._game; g._coopAutoFire = setInterval(() => { if (g.enemies[0]) g._fire(g.enemies[0].x, g.enemies[0].y); }, 250); });
  await sleep(4000);
  // move the guest's crosshair somewhere nice for the shot
  await B.evaluate(() => { const g = window.__arcade._game; g.aim.x = g._w * 0.62; g.aim.y = g._h * 0.4; });
  await sleep(120);
  await B.screenshot({ path: path.join(OUT, "coop-missile-guest.png") });
  await A.screenshot({ path: path.join(OUT, "coop-missile-host.png") });
  await browser.close(); wss.close();
})();
