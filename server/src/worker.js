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

const RELAY_TYPES = new Set(["state", "input", "rematch", "bye", "emote"]);
const MAX_MSG_BYTES = 4096;          // generous for a paddle/ball snapshot; rejects abuse
const MSG_PER_SEC = 90;              // ~30Hz state + input headroom; over this = dropped

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // CORS preflight / health check (HTTP)
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/" || url.pathname === "/health") return cors(new Response("ok", { status: 200 }));

    if (url.pathname === "/room") {
      if (request.headers.get("Upgrade") !== "websocket") return cors(new Response("expected websocket", { status: 426 }));
      const code = (url.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (code.length < 4) return cors(new Response("bad room code", { status: 400 }));
      const id = env.PONG_ROOM.idFromName("pong:" + code);
      return env.PONG_ROOM.get(id).fetch(request);
    }
    return cors(new Response("not found", { status: 404 }));
  }
};

function cors(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "*");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h, webSocket: resp.webSocket });
}

export class PongRoom {
  constructor(state) { this.state = state; this.peers = []; }   // peers: [{ ws, role, name, win, winReset }]

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Player").slice(0, 16);
    if (this.peers.length >= 2) {
      const pair = new WebSocketPair();
      pair[1].accept(); pair[1].send(JSON.stringify({ t: "full" })); pair[1].close(1000, "full");
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const role = this.peers.length === 0 ? "host" : "guest";
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
    if (other) { try { other.ws.send(JSON.stringify({ t: "peer", event: "left", name: peer.name })); } catch {} }
  }
}
