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

// PongRoom uses the WebSocket Hibernation API (required for new_sqlite_classes DOs):
//   state.acceptWebSocket(server)  — persists the WS across DO hibernation cycles
//   ws.serializeAttachment(meta)   — stores peer state on the WS itself (survives hibernation)
//   state.getWebSockets()          — returns all live accepted WS for this DO
//   webSocketMessage/Close/Error   — DO-level event handlers (not per-WS addEventListener)
// Using server.accept() + addEventListener() instead would drop connections when the DO
// hibernates between messages, causing "DISCONNECTED" with no apparent reason.
export class PongRoom {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Player").slice(0, 16);
    const code = url.searchParams.get("code") || "";

    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });

    // getWebSockets() returns only live (non-closed) WS that survive hibernation — no manual pruning needed
    const live = this.state.getWebSockets();
    if (live.length >= 2) {
      const pair = new WebSocketPair();
      pair[1].accept(); pair[1].send(JSON.stringify({ t: "full" })); pair[1].close(1000, "full");
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];

    const hasHost = live.some(ws => { try { const m = ws.deserializeAttachment(); return m && m.role === "host"; } catch { return false; } });
    const role = hasHost ? "guest" : "host";   // assign by FREE slot — never two guests

    this.state.acceptWebSocket(server);   // attach to DO so the WS survives hibernation
    server.serializeAttachment({ role, name, win: 0, winReset: 0 });   // peer metadata lives on the WS itself

    server.send(JSON.stringify({ t: "role", role, code, name }));
    // tell each side about the other
    if (live.length > 0) {
      try {
        const other = live[0];
        const otherMeta = other.deserializeAttachment();
        other.send(JSON.stringify({ t: "peer", event: "joined", name }));
        server.send(JSON.stringify({ t: "peer", event: "joined", name: otherMeta ? otherMeta.name : "Opponent" }));
      } catch {}
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // DO-level WebSocket event handlers — called by the CF runtime for any accepted WS
  webSocketMessage(ws, data) {
    const meta = ws.deserializeAttachment();
    if (!meta) return;
    // rate limit (token-bucket: reset counter each second)
    const now = Date.now();
    if (now - (meta.winReset || 0) > 1000) { meta.winReset = now; meta.win = 0; }
    if (++meta.win > MSG_PER_SEC) { ws.serializeAttachment(meta); return; }
    ws.serializeAttachment(meta);
    if (typeof data !== "string" || data.length > MAX_MSG_BYTES) return;
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (!msg || !RELAY_TYPES.has(msg.t)) return;
    const others = this.state.getWebSockets().filter(w => w !== ws);
    for (const other of others) { try { other.send(data); } catch {} }
  }

  webSocketClose(ws) { this._drop(ws); }
  webSocketError(ws) { this._drop(ws); }

  _drop(ws) {
    let meta; try { meta = ws.deserializeAttachment(); } catch {}
    // getWebSockets() still includes ws during the close handler — filter it out
    const others = this.state.getWebSockets().filter(w => w !== ws);
    for (const other of others) {
      try {
        const otherMeta = other.deserializeAttachment();
        // if the HOST left, promote survivor so a rejoin doesn't create a two-guest room
        if (meta && meta.role === "host" && otherMeta && otherMeta.role !== "host") {
          const promoted = Object.assign({}, otherMeta, { role: "host" });
          other.serializeAttachment(promoted);
          other.send(JSON.stringify({ t: "role", role: "host" }));
        }
        other.send(JSON.stringify({ t: "peer", event: "left", name: meta ? meta.name : "" }));
      } catch {}
    }
  }
}
