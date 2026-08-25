/* =========================================================
   ChrisKit Arcade — LOCAL multiplayer server (zero cloud needed).

   One command gives you real online play on your own machine:

       node server/local-relay.js

   Then open  http://localhost:8787  in TWO browser windows/tabs
   (or on your phone at  http://<this-pc-ip>:8787 ), pick Missile
   Defense (or Pong) → PLAY ONLINE → CREATE GAME on one, JOIN GAME +
   the code on the other. That's it — no Cloudflare, no login, no build.

   It does two jobs:
     1) serves the static arcade (so the page is same-origin with the
        socket — the client auto-targets this server when it sees it's
        running on localhost; see js/core/net.js).
     2) relays WebSocket messages between the two players in a room,
        speaking the EXACT same protocol as the deployed Cloudflare
        Worker (server/src/worker.js) — roles, presence, host
        promotion, size/rate limits. So what you test here is what
        ships.

   Change the port with:  PORT=9000 node server/local-relay.js
   ========================================================= */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

let WebSocketServer;
try {
  ({ WebSocketServer } = require("ws"));
} catch (e) {
  console.error("\n[arcade] Missing the 'ws' package.\n" +
    "  Run this once from the project root:  npm install ws\n" +
    "  (ws is already vendored in node_modules for this repo, so this normally just works.)\n");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "8787", 10);
const ROOT = path.resolve(__dirname, "..");   // repo root = where index.html lives

// ---- protocol constants — kept identical to server/src/worker.js ----
const RELAY_TYPES = new Set(["msg", "rematch", "emote", "bye", "state", "input"]);
const MAX_MSG_BYTES = 16384;
const MSG_PER_SEC = 90;

// ---- tiny static file server (so the arcade is same-origin with the socket) ----
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".ico": "image/x-icon", ".webp": "image/webp", ".map": "application/json"
};

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/health") { res.writeHead(200, { "content-type": "text/plain" }); res.end("ok"); return; }
    let p = decodeURIComponent(u.pathname);
    if (p === "/" || p === "") p = "/index.html";
    // resolve safely inside ROOT (no path traversal)
    const filePath = path.normalize(path.join(ROOT, p));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found: " + p); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  } catch (e) { res.writeHead(500); res.end("server error"); }
});

// ---- room relay (mirrors PongRoom in src/worker.js) ----
// rooms: Map<"game:code", Array<peer>>  where peer = { ws, role, name, win, winReset }
const rooms = new Map();
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let u;
  try { u = new URL(req.url, "http://localhost"); } catch (e) { socket.destroy(); return; }
  if (u.pathname !== "/room") { socket.destroy(); return; }   // only /room speaks WS
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws, req) => {
  const u = new URL(req.url, "http://localhost");
  const code = (u.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const game = (u.searchParams.get("game") || "g").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "g";
  const name = (u.searchParams.get("name") || "Player").slice(0, 16);
  if (code.length < 4) { try { ws.close(1008, "bad code"); } catch (e) {} return; }

  const key = game + ":" + code;
  let room = rooms.get(key);
  if (!room) { room = []; rooms.set(key, room); }

  // prune any dead sockets so a stale host can't block a reused code
  for (let i = room.length - 1; i >= 0; i--) { if (room[i].ws.readyState > 1) room.splice(i, 1); }

  if (room.length >= 2) { try { ws.send(JSON.stringify({ t: "full" })); ws.close(1000, "full"); } catch (e) {} return; }

  const role = room.some(p => p.role === "host") ? "guest" : "host";   // assign by FREE slot — never two guests
  const peer = { ws, role, name, win: 0, winReset: Date.now() };
  room.push(peer);

  send(ws, { t: "role", role, code, name });
  const other = room.find(p => p !== peer);
  if (other) {
    send(other.ws, { t: "peer", event: "joined", name });
    send(ws, { t: "peer", event: "joined", name: other.name });
  }
  log(`+ ${name} joined ${key} as ${role}  (room ${room.length}/2)`);

  ws.on("message", (data) => {
    const str = data.toString();
    // rate limit (token bucket reset each second)
    const now = Date.now();
    if (now - peer.winReset > 1000) { peer.winReset = now; peer.win = 0; }
    if (++peer.win > MSG_PER_SEC) return;
    if (str.length > MAX_MSG_BYTES) return;
    let msg; try { msg = JSON.parse(str); } catch (e) { return; }
    if (!msg || !RELAY_TYPES.has(msg.t)) return;
    for (const o of room) { if (o !== peer) send(o.ws, str); }   // relay verbatim to the other peer(s)
  });

  const drop = () => {
    const i = room.indexOf(peer); if (i < 0) return;
    room.splice(i, 1);
    for (const o of room) {
      // if the HOST left, promote the survivor so a rejoin doesn't create a two-guest room
      if (peer.role === "host" && o.role !== "host") { o.role = "host"; send(o.ws, { t: "role", role: "host" }); }
      send(o.ws, { t: "peer", event: "left", name: peer.name });
    }
    if (room.length === 0) rooms.delete(key);
    log(`- ${name} left ${key}  (room ${room.length}/2)`);
  };
  ws.on("close", drop);
  ws.on("error", drop);
});

function send(ws, objOrStr) {
  if (ws.readyState !== 1) return;
  try { ws.send(typeof objOrStr === "string" ? objOrStr : JSON.stringify(objOrStr)); } catch (e) {}
}
function log(s) { console.log(`[arcade] ${s}`); }

server.listen(PORT, () => {
  const nets = require("os").networkInterfaces();
  const lan = [];
  for (const name of Object.keys(nets)) for (const ni of nets[name] || []) {
    if (ni.family === "IPv4" && !ni.internal) lan.push(ni.address);
  }
  console.log("\n  🎮  ChrisKit Arcade — local multiplayer server\n");
  console.log("  Open in TWO browser windows on this machine:");
  console.log(`      http://localhost:${PORT}\n`);
  if (lan.length) {
    console.log("  Or from another device on your network (e.g. your phone):");
    for (const ip of lan) console.log(`      http://${ip}:${PORT}`);
    console.log("");
  }
  console.log("  Then: PLAY ONLINE → CREATE GAME on one, JOIN GAME + code on the other.");
  console.log("  (Ctrl+C to stop)\n");
});
