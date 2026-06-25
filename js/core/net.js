/* =========================================================
   Arcade.Net — tiny WebSocket client for real-time multiplayer.
   Talks to the Cloudflare Worker room server (server/src/worker.js).
   Offline play never touches this; online is purely additive.

   Configure the server URL ONCE after deploying the Worker:
     - edit DEFAULT_URL below to your "wss://<name>.<sub>.workers.dev"
     - or set localStorage["arcade:neturl"] (handy for testing)
   ========================================================= */
(function (Arcade) {
  "use strict";

  const DEFAULT_URL = "";   // e.g. "wss://chriskit-arcade.YOURNAME.workers.dev"  (set after `wrangler deploy`)

  const Net = {
    url() {
      try { const o = localStorage.getItem("arcade:neturl"); if (o) return o; } catch (e) {}
      return (typeof window !== "undefined" && window.ARCADE_NET_URL) || DEFAULT_URL || "";
    },
    configured() { return !!this.url(); },
    makeCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0]; return s; },

    // connect(opts) -> { send(obj), close(), get role(), get open() }
    connect(opts) {
      const base = (opts.url || this.url()).replace(/\/+$/, "");
      const code = (opts.code || "").toUpperCase();
      const name = encodeURIComponent(opts.name || "Player");
      const game = encodeURIComponent(opts.game || "g");
      const ws = new WebSocket(base + "/room?code=" + encodeURIComponent(code) + "&name=" + name + "&game=" + game);
      const conn = {
        ws: ws, role: null, open: false,
        send(obj) { if (ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} } },
        close() { try { ws.close(1000, "bye"); } catch (e) {} }
      };
      ws.addEventListener("open", () => { conn.open = true; opts.onOpen && opts.onOpen(conn); });
      ws.addEventListener("close", (e) => { conn.open = false; opts.onClose && opts.onClose(e); });
      ws.addEventListener("error", (e) => { opts.onError && opts.onError(e); });
      ws.addEventListener("message", (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === "role") { conn.role = m.role; opts.onRole && opts.onRole(m); }
        else if (m.t === "peer") { opts.onPeer && opts.onPeer(m); }
        else if (m.t === "full") { opts.onFull && opts.onFull(m); }
        else if (m.t === "error") { opts.onError && opts.onError(m); }
        else { opts.onMessage && opts.onMessage(m); }
      });
      return conn;
    }
  };

  Arcade.Net = Net;
})(window.Arcade = window.Arcade || {});
