/* =========================================================
   ChrisKit Arcade — real-time multiplayer backend (Cloudflare).
   A Worker that routes WebSocket connections into per-room
   Durable Objects. Each PongRoom holds up to 2 players and
   RELAYS messages between them (host is authoritative for the
   sim; the room never trusts or inspects game payloads beyond
   light validation + rate limiting).

   Protocol (JSON over WS):
     server -> client:
       { t:"role",  role:"host"|"guest", code, name }   // on join
       { t:"peer",  event:"joined"|"left", name }        // other side changed
       { t:"full" }                                      // room already has 2
       { t:"error", msg }
     relayed verbatim to the OTHER peer (client -> client):
       { t:"state", ... }   host -> guest  (~30Hz authoritative snapshot)
       { t:"input", ... }   guest -> host  (paddle x)
       { t:"rematch" } | { t:"bye" } | { t:"emote", ... }
   ========================================================= */

const RELAY_TYPES = new Set(["msg", "rematch", "emote", "bye", "state", "input"]);
const MAX_MSG_BYTES = 4096;          // generous for a paddle/ball snapshot; rejects abuse
const MSG_PER_SEC = 90;              // ~30Hz state + input headroom; over this = dropped

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // CORS preflight / health check (HTTP)
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/" || url.pathname === "/health") return cors(new Response("ok", { status: 200 }));

    // ---- shared leaderboards (D1) ----
    if (url.pathname === "/top") return cors(await topScores(env, url));
    if (url.pathname === "/score" && request.method === "POST") return cors(await postScore(env, request));

    if (url.pathname === "/room") {
      if (request.headers.get("Upgrade") !== "websocket") return cors(new Response("expected websocket", { status: 426 }));
      const code = (url.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (code.length < 4) return cors(new Response("bad room code", { status: 400 }));
      const game = (url.searchParams.get("game") || "g").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "g";
      const id = env.PONG_ROOM.idFromName(game + ":" + code);   // rooms namespaced per game so codes can't collide across games
      return env.PONG_ROOM.get(id).fetch(request);
    }
    return cors(new Response("not found", { status: 404 }));
  }
};

function cors(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "content-type");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h, webSocket: resp.webSocket });
}
function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json" } }); }
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);

// GET /top?game=<id>&n=10  ->  { scores: [{name, score}], device }
async function topScores(env, url) {
  if (!env.DB) return json({ scores: [], error: "no-db" });
  const game = slug(url.searchParams.get("game")); if (!game) return json({ scores: [] });
  const device = url.searchParams.get("device") === "mobile" ? "mobile" : "desktop";
  const n = Math.max(1, Math.min(50, parseInt(url.searchParams.get("n") || "10", 10) || 10));
  try {
    const rs = await env.DB.prepare("SELECT name, score FROM scores WHERE game=?1 AND device=?2 ORDER BY score DESC LIMIT ?3").bind(game, device, n).all();
    return json({ scores: (rs.results || []).map(r => ({ name: r.name, score: r.score })), device });
  } catch (e) { return json({ scores: [], error: String(e) }); }
}
// POST /score {game, name, score, device}  ->  { ok, rank? }
async function postScore(env, request) {
  if (!env.DB) return json({ ok: false, error: "no-db" }, 503);
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false, error: "bad-json" }, 400); }
  const game = slug(b.game); if (!game) return json({ ok: false, error: "bad-game" }, 400);
  const name = (String(b.name || "Player").replace(/[^\x20-\x7E]/g, "").trim().slice(0, 16)) || "Player";
  let score = Math.floor(Number(b.score)); if (!isFinite(score)) return json({ ok: false, error: "bad-score" }, 400);
  score = Math.max(0, Math.min(2000000000, score));
  const device = b.device === "mobile" ? "mobile" : "desktop";
  try {
    await env.DB.prepare("INSERT INTO scores (game, name, score, device, ts) VALUES (?1,?2,?3,?4,?5)").bind(game, name, score, device, Date.now()).run();
    // keep the table lean: trim each (game,device) to its top 200
    await env.DB.prepare("DELETE FROM scores WHERE game=?1 AND device=?2 AND id NOT IN (SELECT id FROM scores WHERE game=?1 AND device=?2 ORDER BY score DESC LIMIT 200)").bind(game, device).run();
    const r = await env.DB.prepare("SELECT COUNT(*)+1 AS rank FROM scores WHERE game=?1 AND device=?2 AND score>?3").bind(game, device, score).first();
    return json({ ok: true, rank: r ? r.rank : null });
  } catch (e) { return json({ ok: false, error: String(e) }, 500); }
}

export class PongRoom {
  constructor(state) { this.state = state; this.peers = []; }   // peers: [{ ws, role, name, win, winReset }]

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Player").slice(0, 16);
    this.peers = this.peers.filter(p => { try { return p.ws.readyState === 1; } catch (e) { return false; } });   // prune dead/ghost sockets so a stale host can't block a reused code
    if (this.peers.length >= 2) {
      const pair = new WebSocketPair();
      pair[1].accept(); pair[1].send(JSON.stringify({ t: "full" })); pair[1].close(1000, "full");
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const role = this.peers.some(p => p.role === "host") ? "guest" : "host";   // assign by FREE slot, not count, so we never end up with two guests
    const peer = { ws: server, role, name, win: 0, winReset: Date.now() };
    this.peers.push(peer);

    const code = url.searchParams.get("code") || "";
    server.send(JSON.stringify({ t: "role", role, code, name }));
    // tell each side about the other
    const other = this.peers.find(p => p !== peer);
    if (other) { other.ws.send(JSON.stringify({ t: "peer", event: "joined", name })); server.send(JSON.stringify({ t: "peer", event: "joined", name: other.name })); }

    server.addEventListener("message", (ev) => this._onMessage(peer, ev));
    const bye = () => this._drop(peer);
    server.addEventListener("close", bye);
    server.addEventListener("error", bye);

    return new Response(null, { status: 101, webSocket: client });
  }

  _onMessage(peer, ev) {
    // rate limit (token-ish: reset a counter each second)
    const now = Date.now();
    if (now - peer.winReset > 1000) { peer.winReset = now; peer.win = 0; }
    if (++peer.win > MSG_PER_SEC) return;
    const data = ev.data;
    if (typeof data !== "string" || data.length > MAX_MSG_BYTES) return;
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (!msg || !RELAY_TYPES.has(msg.t)) return;
    const other = this.peers.find(p => p !== peer);
    if (other) { try { other.ws.send(data); } catch {} }
  }

  _drop(peer) {
    const i = this.peers.indexOf(peer); if (i < 0) return;
    this.peers.splice(i, 1);
    const other = this.peers[0];
    if (other) {
      // if the HOST left, promote the survivor so a rejoin doesn't create a two-guest room
      if (peer.role === "host" && other.role !== "host") { other.role = "host"; try { other.ws.send(JSON.stringify({ t: "role", role: "host" })); } catch (e) {} }
      try { other.ws.send(JSON.stringify({ t: "peer", event: "left", name: peer.name })); } catch (e) {}
    }
  }
}
