/* =========================================================
   Arcade.Net — real-time multiplayer transport for the arcade.
   Offline play never touches this; online is purely additive.

   TWO transports, one tiny seam (connect() returns the same conn shape +
   fires the same callbacks either way, so Arcade.Lobby/the games don't care):

     • "rtc"  — WebRTC peer-to-peer (DEFAULT for internet play).
                Browser↔browser data channel via free Google STUN + the free
                public PeerJS broker for signaling. NO server to host, NO
                Cloudflare/Durable-Object bill — game data goes straight
                between the two players. PeerJS is lazy-loaded from
                js/vendor/peerjs.min.js the first time you go online.

     • "ws"   — WebSocket relay. Used when a server URL is set: the local
                dev relay (server/local-relay.js, auto-detected on localhost)
                or a deployed Cloudflare Worker (set DEFAULT_URL / neturl).

   Pick the transport explicitly with localStorage["arcade:transport"]="rtc"|"ws".
   Force a specific WS server with localStorage["arcade:neturl"]="wss://…".
   ========================================================= */
(function (Arcade) {
  "use strict";

  const DEFAULT_URL = "wss://chriskit-arcade.coreinnovation.workers.dev";   // WS relay FALLBACK target (Cloudflare Worker). Blank = pure P2P, no fallback.
  const RTC_TIMEOUT = 7000;   // ms to wait for a direct P2P connection before falling back to the relay
  // Free STUN servers for NAT traversal (no cost, no account). TURN (paid) is intentionally omitted —
  // a small fraction of strict/symmetric-NAT pairs may not connect; everyone else does.
  const ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ];

  const Net = {
    // ---- server URL (WS transport only) ----
    url() {
      try { const o = localStorage.getItem("arcade:neturl"); if (o) return o; } catch (e) {}
      if (typeof window !== "undefined" && window.ARCADE_NET_URL) return window.ARCADE_NET_URL;
      // running locally? talk to the same-origin local relay (server/local-relay.js) — zero config
      try {
        const loc = (typeof location !== "undefined") ? location : null;
        if (loc && /^https?:$/.test(loc.protocol) && /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(loc.hostname)) {
          return (loc.protocol === "https:" ? "wss://" : "ws://") + loc.host;
        }
      } catch (e) {}
      return DEFAULT_URL || "";
    },
    // an EXPLICIT WS server (manual override or the localhost relay) — NOT the DEFAULT_URL fallback
    _hasExplicitWS() {
      try { if (localStorage.getItem("arcade:neturl")) return true; } catch (e) {}
      if (typeof window !== "undefined" && window.ARCADE_NET_URL) return true;
      try {
        const loc = (typeof location !== "undefined") ? location : null;
        if (loc && /^https?:$/.test(loc.protocol) && /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(loc.hostname)) return true;
      } catch (e) {}
      return false;
    },
    // which transport to use right now:
    //   "ws"   force the WebSocket relay        "rtc"  force pure peer-to-peer (no fallback)
    //   "auto" P2P first, fall back to the relay if a direct connection can't be made
    transport() {
      const ok = (t) => t === "ws" || t === "rtc" || t === "auto";
      try { const t = localStorage.getItem("arcade:transport"); if (ok(t)) return t; } catch (e) {}
      if (typeof window !== "undefined" && ok(window.ARCADE_NET_TRANSPORT)) return window.ARCADE_NET_TRANSPORT;
      if (this._hasExplicitWS()) return "ws";   // local relay (localhost) or an explicit neturl → use it directly
      return DEFAULT_URL ? "auto" : "rtc";       // free P2P first, relay fallback when one is configured
    },
    // online is always available: P2P needs no server, and a relay URL may also be set
    configured() { const t = this.transport(); return t === "rtc" || t === "auto" || !!this.url(); },
    makeCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0]; return s; },

    // connect(opts) -> { send(obj), close(), get role(), get open() }
    // opts: {code, name, game, asHost, onOpen, onClose, onError, onRole, onPeer, onFull, onMessage}
    connect(opts) {
      const t = this.transport();
      if (t === "rtc") return this._connectRTC(opts);
      if (t === "auto") return this._connectAuto(opts);
      return this._connectWS(opts);
    },

    // ============ WebSocket relay transport ============
    _connectWS(opts) {
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
    },

    // ============ WebRTC peer-to-peer transport (PeerJS broker for signaling) ============
    _peerjsSrc() { return (typeof window !== "undefined" && window.ARCADE_PEERJS_URL) || "js/vendor/peerjs.min.js"; },
    _loadPeerJS() {
      if (typeof window !== "undefined" && window.Peer) return Promise.resolve();
      if (this._peerJSP) return this._peerJSP;
      const self = this;
      this._peerJSP = new Promise((resolve, reject) => {
        try {
          const s = document.createElement("script");
          s.src = self._peerjsSrc(); s.async = true;
          s.onload = () => resolve();
          s.onerror = () => { self._peerJSP = null; reject(new Error("peerjs-load-failed")); };
          document.head.appendChild(s);
        } catch (e) { self._peerJSP = null; reject(e); }
      });
      return this._peerJSP;
    },
    _roomId(game, code) {
      const g = (game || "g").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "g";
      const c = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      return "chriskit-" + g + "-" + c;   // deterministic, namespaced so it won't collide with other PeerJS apps
    },
    // PeerJS options. Defaults to the free public broker + free STUN; override the whole
    // signaling server with window.ARCADE_PEERJS_CONFIG (self-host a PeerServer if the public one is ever down).
    _peerOpts() {
      let o = {};
      try { if (typeof window !== "undefined" && window.ARCADE_PEERJS_CONFIG) o = window.ARCADE_PEERJS_CONFIG; } catch (e) {}
      const merged = Object.assign({}, o);
      merged.config = Object.assign({ iceServers: ICE }, o.config || {});
      return merged;
    },
    _connectRTC(opts) {
      const self = this;
      const myName = opts.name || "Player";
      const hostId = this._roomId(opts.game, opts.code);
      const asHost = !!opts.asHost;

      const conn = {
        role: null, open: false, _peer: null, _dc: null, _closed: false, _peerName: "",
        send(obj) { try { if (this._dc && this._dc.open) this._dc.send(obj); } catch (e) {} },
        close() {
          this._closed = true;
          try { if (this._dc) { try { this._dc.send({ t: "bye" }); } catch (e) {} this._dc.close(); } } catch (e) {}
          try { if (this._peer) this._peer.destroy(); } catch (e) {}
        }
      };

      function wireData(dc) {
        conn._dc = dc;
        dc.on("open", () => {
          conn.open = true;
          opts.onOpen && opts.onOpen(conn);
          try { dc.send({ t: "__hello", name: myName }); } catch (e) {}   // exchange display names
        });
        dc.on("data", (m) => {
          if (!m || typeof m !== "object") return;
          if (m.t === "__hello") { conn._peerName = m.name || "Opponent"; opts.onPeer && opts.onPeer({ event: "joined", name: conn._peerName }); return; }
          if (m.t === "__full") { opts.onFull && opts.onFull({ t: "full" }); return; }
          opts.onMessage && opts.onMessage(m);   // a real lobby/game message (msg/rematch/emote/bye/…)
        });
        dc.on("close", () => { if (conn._closed) return; conn.open = false; opts.onPeer && opts.onPeer({ event: "left", name: conn._peerName }); opts.onClose && opts.onClose({}); });
        dc.on("error", () => { opts.onError && opts.onError({ t: "error", msg: "rtc-data-error" }); });
      }

      function startAsHost() {
        let peer; try { peer = new window.Peer(hostId, self._peerOpts()); } catch (e) { opts.onError && opts.onError({ t: "error", msg: "rtc-init" }); opts.onClose && opts.onClose({}); return; }
        conn._peer = peer;
        peer.on("open", () => { conn.role = "host"; opts.onRole && opts.onRole({ t: "role", role: "host" }); });
        peer.on("connection", (dc) => {
          if (conn._dc) {   // room already has a guest → tell the third comer it's full
            dc.on("open", () => { try { dc.send({ t: "__full" }); } catch (e) {} setTimeout(() => { try { dc.close(); } catch (e) {} }, 150); });
            return;
          }
          wireData(dc);
        });
        peer.on("disconnected", () => { if (!conn._closed) { try { peer.reconnect(); } catch (e) {} } });
        peer.on("error", (err) => {
          const t = err && err.type;
          if (t === "unavailable-id") { try { peer.destroy(); } catch (e) {} if (!conn._closed) startAsGuest(); return; }   // someone already hosts this code → join instead
          opts.onError && opts.onError({ t: "error", msg: t || "rtc-error" });
          if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") opts.onClose && opts.onClose({});
        });
      }

      function startAsGuest() {
        let peer; try { peer = new window.Peer(undefined, self._peerOpts()); } catch (e) { opts.onError && opts.onError({ t: "error", msg: "rtc-init" }); opts.onClose && opts.onClose({}); return; }
        conn._peer = peer;
        peer.on("open", () => {
          conn.role = "guest"; opts.onRole && opts.onRole({ t: "role", role: "guest" });
          let dc; try { dc = peer.connect(hostId, { reliable: true }); } catch (e) { opts.onError && opts.onError({ t: "error", msg: "rtc-connect" }); opts.onClose && opts.onClose({}); return; }
          wireData(dc);
        });
        peer.on("disconnected", () => { if (!conn._closed && !conn.open) { try { peer.reconnect(); } catch (e) {} } });
        peer.on("error", (err) => {
          const t = err && err.type;
          if (t === "peer-unavailable") { opts.onError && opts.onError({ t: "error", msg: "no-such-room" }); opts.onClose && opts.onClose({}); return; }   // bad/expired code
          opts.onError && opts.onError({ t: "error", msg: t || "rtc-error" });
          if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") opts.onClose && opts.onClose({});
        });
      }

      this._loadPeerJS().then(() => {
        if (conn._closed) return;
        if (asHost) startAsHost(); else startAsGuest();
      }).catch(() => { opts.onError && opts.onError({ t: "error", msg: "rtc-load-failed" }); opts.onClose && opts.onClose({}); });

      return conn;
    },

    // ============ AUTO: WebRTC P2P first, WebSocket relay fallback ============
    // Free direct P2P for (almost) everyone; the paid relay only carries the rare strict-NAT pair.
    //   HOST  listens on BOTH transports while waiting; the first one a guest arrives on wins, the other closes.
    //   GUEST tries P2P, and if no direct channel forms within RTC_TIMEOUT (or it errors), falls back to the relay.
    // The guest only ever completes ONE transport (it tears down P2P before falling back), so the host can never
    // see two peers. Presents the same conn shape + callbacks as the other transports — the lobby is unchanged.
    _rtcTimeout() { try { if (typeof window !== "undefined" && window.ARCADE_RTC_TIMEOUT) return window.ARCADE_RTC_TIMEOUT; } catch (e) {} return RTC_TIMEOUT; },
    _connectAuto(opts) {
      const self = this;
      const asHost = !!opts.asHost;
      const conn = {
        role: null, open: false, via: null, _winner: null, _subs: [], _closed: false, _timer: null,
        send(obj) { if (this._winner) this._winner.send(obj); },
        close() { this._closed = true; if (this._timer) { clearTimeout(this._timer); this._timer = null; } this._subs.forEach(s => { try { s.close(); } catch (e) {} }); }
      };
      let roleFired = false, openFired = false, rtc = null, ws = null;
      const fireRole = (role) => { if (roleFired) return; roleFired = true; conn.role = role; opts.onRole && opts.onRole({ t: "role", role: role }); if (!openFired) { openFired = true; opts.onOpen && opts.onOpen(conn); } };
      const subOpts = (extra) => Object.assign({ code: opts.code, name: opts.name, game: opts.game }, extra);

      if (asHost) {
        let decided = false;
        const win = (winner, loser, m) => {
          if (decided || conn._closed) return; decided = true;
          conn._winner = winner; conn.via = winner._via; conn.open = true;
          try { loser && loser.close(); } catch (e) {}
          opts.onPeer && opts.onPeer(m);
        };
        const mkHostSub = (kind, connectFn) => {
          const sub = connectFn(subOpts({
            asHost: true,
            onRole: () => fireRole("host"),
            onPeer: (m) => { if (m.event === "joined") win(sub, sub === rtc ? ws : rtc, m); else if (conn._winner === sub) opts.onPeer && opts.onPeer(m); },
            onMessage: (m) => { if (conn._winner === sub) opts.onMessage && opts.onMessage(m); },
            onClose: () => { if (conn._winner === sub) { conn.open = false; opts.onClose && opts.onClose({}); } },
            onError: (e) => { if (conn._winner === sub) opts.onError && opts.onError(e); },
            onFull: (m) => { if (conn._winner === sub) opts.onFull && opts.onFull(m); }
          }));
          sub._via = kind; return sub;
        };
        rtc = mkHostSub("rtc", (o) => self._connectRTC(o));
        ws = mkHostSub("ws", (o) => self._connectWS(o));
        conn._subs = [rtc, ws];
        return conn;
      }

      // ---- guest ----
      let committed = false;
      const goWS = () => {
        if (committed || conn._closed) return; committed = true;
        ws = self._connectWS(subOpts({
          asHost: false,
          onOpen: () => { if (!openFired) { openFired = true; opts.onOpen && opts.onOpen(conn); } },
          onRole: () => fireRole("guest"),
          onPeer: (m) => { if (m.event === "joined") { conn._winner = ws; conn.via = "ws"; conn.open = true; } opts.onPeer && opts.onPeer(m); },
          onMessage: (m) => opts.onMessage && opts.onMessage(m),
          onClose: () => { conn.open = false; opts.onClose && opts.onClose({}); },
          onError: (e) => opts.onError && opts.onError(e),
          onFull: (m) => opts.onFull && opts.onFull(m)
        }));
        conn._subs.push(ws);
      };
      rtc = self._connectRTC(subOpts({
        asHost: false,
        onOpen: () => { if (!openFired && !committed) { openFired = true; opts.onOpen && opts.onOpen(conn); } },
        onRole: () => { if (!committed) fireRole("guest"); },
        onPeer: (m) => {
          if (m.event === "joined") { if (committed) return; committed = true; conn._winner = rtc; conn.via = "rtc"; conn.open = true; if (conn._timer) { clearTimeout(conn._timer); conn._timer = null; } }
          if (conn._winner === rtc) opts.onPeer && opts.onPeer(m);
        },
        onMessage: (m) => { if (conn._winner === rtc) opts.onMessage && opts.onMessage(m); },
        onClose: () => { if (conn._winner === rtc) { conn.open = false; opts.onClose && opts.onClose({}); } else { try { rtc.close(); } catch (e) {} goWS(); } },   // P2P failed before connecting → fall back
        onError: () => { /* swallow during the attempt; onClose drives the fallback */ },
        onFull: (m) => { if (conn._winner === rtc) opts.onFull && opts.onFull(m); }
      }));
      conn._subs.push(rtc);
      conn._timer = setTimeout(() => { if (!committed && !conn._closed) { try { rtc.close(); } catch (e) {} goWS(); } }, this._rtcTimeout());   // no direct channel in time → relay
      return conn;
    }
  };

  Arcade.Net = Net;
})(window.Arcade = window.Arcade || {});
