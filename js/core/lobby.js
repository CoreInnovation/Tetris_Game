/* =========================================================
   Arcade.Lobby — reusable online-session UI + netcode for ANY
   canvas game. The GAME owns its loop + sim; the LOBBY owns all
   networking (via Arcade.Net), the lobby/waiting/ended chrome, the
   on-canvas JOIN keypad (no window.prompt), presence, rematch, and
   the host-authoritative neutral-win relay.

   A game wires SIX call sites (see header of any consumer, e.g. pong.js):
     1) construct in ctor with live getters: new Arcade.Lobby({...})
     2) render LAST in render(now):            lobby.render(now)
     3) pointer FIRST in pointer handlers:     if (lobby.pointerDown(cx,cy)) {e.preventDefault(); return;}
     4) freeze sim at top of update():         if (lobby.blocking()) return;
     5) drive the sim with role + throttle:    lobby.sendThrottled({t:"state",...},30) / lobby.send(...)
     6) destroy:                               lobby.destroy()

   PROTOCOL (rides Arcade.Net / the Worker relay):
     game payloads  -> {t:"msg", d:<your object>}  delivered to onMessage(d, role)
     control (lobby-only): {t:"rematch"}, {t:"emote",k:"start"}, {t:"emote",k:"end",v:verdict}, {t:"bye"}
   The reserved t-values (msg/rematch/emote/bye + Net's role/peer/full/error) never surface to the game.
   ========================================================= */
(function (Arcade) {
  "use strict";

  function rgba(hex, a) {
    if (typeof hex !== "string" || hex[0] !== "#") return hex;
    let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // matches Net.makeCode() — no ambiguous I/O/0/1

  // ---- reusable on-canvas keypad (code/PIN entry) ----
  const Keypad = {
    charset: CHARSET,
    // draw(ctx, theme, rect{x,y,w,h}, value, opts) -> [{x,y,w,h, char?|action?}]
    draw(ctx, theme, rect, value, opts) {
      opts = opts || {}; const p = theme.palette, len = opts.len || 4, now = opts.now || 0, cs = opts.charset || CHARSET;
      const rects = [];
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      // title (sized to fit width so it never clips on narrow screens)
      ctx.fillStyle = p.accent; ctx.font = "800 " + Math.round(Math.min(rect.h * 0.07, rect.w * 0.07)) + "px " + theme.fonts.ui;
      if (theme.effects.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.accent; }
      ctx.fillText(opts.title || "ENTER CODE", rect.x + rect.w / 2, rect.y + rect.h * 0.05); ctx.shadowBlur = 0;
      // slots
      const sw = Math.min(rect.w * 0.16, rect.h * 0.13), gap = sw * 0.35, totalW = len * sw + (len - 1) * gap;
      let sx = rect.x + (rect.w - totalW) / 2, sy = rect.y + rect.h * 0.13;
      for (let i = 0; i < len; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.06)"; rr(ctx, sx, sy, sw, sw, 6); ctx.fill();
        ctx.strokeStyle = i === value.length ? p.accent : rgba(p.text, 0.3); ctx.lineWidth = 2; rr(ctx, sx, sy, sw, sw, 6); ctx.stroke();
        if (value[i]) { ctx.fillStyle = p.text; ctx.font = "800 " + Math.round(sw * 0.6) + "px " + theme.fonts.ui; ctx.fillText(value[i], sx + sw / 2, sy + sw / 2 + 1); }
        else if (i === value.length && (Math.floor(now / 450) % 2 === 0)) { ctx.fillStyle = p.accent; ctx.fillRect(sx + sw / 2 - 1, sy + sw * 0.25, 2, sw * 0.5); }
        sx += sw + gap;
      }
      // key grid
      const cols = 6, rows = Math.ceil(cs.length / cols), gx = rect.w * 0.02;
      const kw = (rect.w - (cols + 1) * gx) / cols, kh = Math.min(kw * 0.82, rect.h * 0.085);
      const gy0 = sy + sw + rect.h * 0.05;
      ctx.font = "800 " + Math.round(kh * 0.5) + "px " + theme.fonts.ui;
      for (let i = 0; i < cs.length; i++) {
        const r = (i / cols) | 0, c = i % cols, kx = rect.x + gx + c * (kw + gx), ky = gy0 + r * (kh + gx);
        ctx.fillStyle = "rgba(255,255,255,0.08)"; rr(ctx, kx, ky, kw, kh, 5); ctx.fill();
        ctx.strokeStyle = rgba(p.wall, 0.5); ctx.lineWidth = 1; rr(ctx, kx, ky, kw, kh, 5); ctx.stroke();
        ctx.fillStyle = p.text; ctx.fillText(cs[i], kx + kw / 2, ky + kh / 2 + 1);
        rects.push({ x: kx, y: ky, w: kw, h: kh, char: cs[i] });
      }
      // action row: DEL | JOIN | BACK
      const ay = gy0 + rows * (kh + gx) + rect.h * 0.02, aw = (rect.w - 4 * gx) / 3, ah = Math.max(kh, rect.h * 0.09);
      const drawA = (label, ix, primary, enabled) => {
        const x = rect.x + gx + ix * (aw + gx);
        ctx.globalAlpha = enabled === false ? 0.4 : 1;
        ctx.fillStyle = primary ? rgba(p.accent, 0.9) : "rgba(255,255,255,0.08)"; rr(ctx, x, ay, aw, ah, 8); ctx.fill();
        ctx.strokeStyle = primary ? p.accent : p.wall; ctx.lineWidth = 1.5; rr(ctx, x, ay, aw, ah, 8); ctx.stroke();
        ctx.fillStyle = primary ? "#06121a" : p.text; ctx.font = "800 " + Math.round(ah * 0.4) + "px " + theme.fonts.ui;
        ctx.fillText(label, x + aw / 2, ay + ah / 2 + 1); ctx.globalAlpha = 1;
        return { x: x, y: ay, w: aw, h: ah };
      };
      rects.push(Object.assign(drawA("⌫ DEL", 0, false, value.length > 0), { action: "del" }));
      rects.push(Object.assign(drawA("JOIN", 1, true, value.length >= len), { action: "submit", disabled: value.length < len }));
      rects.push(Object.assign(drawA("BACK", 2, false, true), { action: "back" }));
      ctx.restore();
      return rects;
    }
  };

  class Lobby {
    constructor(cfg) {
      this.cfg = cfg || {};
      this.canvas = cfg.canvas; this.audio = cfg.audio;
      this._w = typeof cfg.w === "function" ? cfg.w : () => cfg.w || 800;
      this._h = typeof cfg.h === "function" ? cfg.h : () => cfg.h || 600;
      this._theme = typeof cfg.theme === "function" ? cfg.theme : () => cfg.theme;
      this.gameId = cfg.gameId || "g";
      this.title = cfg.title || "MULTIPLAYER";
      this.rules = cfg.rules || "Play a friend in real time";
      this.winLabels = cfg.winLabels || { host: "HOST WINS", guest: "CHALLENGER WINS" };
      this.phase = null; this.online = false; this.role = null; this.code = ""; this.peerName = ""; this.connected = false;
      this.entering = false; this._entry = ""; this._verdict = null; this._note = ""; this._noteT = 0;
      this.net = null; this._uiBtns = []; this._sendTimers = {}; this._leaving = false;
      this._hostVP = null;   // {w,h} the HOST's world size — the guest adopts it (forced aspect ratio + letterbox), so both see the SAME layout
      this._vp = null;       // cached letterbox fit {scale,offX,offY,hw,hh} for the current canvas size (guest only)
      if ((cfg.w && typeof cfg.w !== "function") || (cfg.theme && typeof cfg.theme !== "function")) console.warn("Arcade.Lobby: pass w/h/theme as GETTER functions so resize/skin changes are seen live.");
    }
    isHost() { return this.role === "host"; }
    isGuest() { return this.role === "guest"; }
    blocking() { return (!!this.phase && this.phase !== "play") || this.entering; }
    _name() { return (this.cfg.name && this.cfg.name()) || "Player"; }
    _setPhase(p) { if (this.phase === p) return; this.phase = p; if (this.cfg.onPhase) this.cfg.onPhase(p); }
    _toast(t) { this._note = t; this._noteT = 2200; }

    open() { if (this.online) return; this.entering = false; this._verdict = null; this._setPhase("menu"); if (this.audio && this.audio.unlock) this.audio.unlock(); }
    leave() {
      this._leaving = true;
      if (this.net) { try { this.net.send({ t: "bye" }); } catch (e) {} this.net.close(); this.net = null; }
      this.online = false; this.role = null; this.code = ""; this.peerName = ""; this.connected = false; this.entering = false; this._entry = ""; this._verdict = null;
      this.phase = null; if (this.cfg.onPhase) this.cfg.onPhase(null);
      if (this.cfg.onLeave) this.cfg.onLeave();
      this._leaving = false;
    }
    destroy() { this._leaving = true; if (this.net) { try { this.net.send({ t: "bye" }); } catch (e) {} this.net.close(); this.net = null; } }

    _create() {
      if (!Arcade.Net || !Arcade.Net.configured()) { this._toast("SERVER NOT SET UP"); return; }
      this._connect(Arcade.Net.makeCode());
    }
    _connect(code) {
      this.code = code; this.online = true; this.role = null; this.peerName = ""; this.connected = false; this.entering = false; this._verdict = null;
      this._setPhase("waiting");
      const self = this;
      this.net = Arcade.Net.connect({
        code: code, name: this._name(), game: this.gameId,
        onOpen: () => { self.connected = true; },
        onRole: (m) => { self.role = m.role; },
        onPeer: (m) => {
          if (m.event === "joined") { self.peerName = m.name || "Opponent"; if (self.phase !== "play") self._startMatch(false, false); }
          else if (m.event === "left") self._end({ reason: "left" }, false);
        },
        onFull: () => { self._toast("ROOM FULL"); self.leave(); },
        onMessage: (m) => self._onEnvelope(m),
        onClose: () => { if (!self._leaving && self.online && self.phase !== "ended") self._end({ reason: "disconnected" }, false); },
        onError: () => { self._toast("CONNECTION ERROR"); }
      });
    }
    _onEnvelope(m) {
      if (!m || !m.t) return;
      if (m.t === "msg") { if (this.cfg.onMessage) this.cfg.onMessage(m.d, this.role); }
      else if (m.t === "rematch") { if (this.isHost()) this._startMatch(true, true); }
      else if (m.t === "emote") {
        if (m.k === "start") this._startMatch(true, false);
        else if (m.k === "end") this._end(m.v, false);
        else if (m.k === "vp") { this._hostVP = { w: m.w, h: m.h }; this._vp = null; if (this.cfg.onViewport) this.cfg.onViewport(this._hostVP); }   // adopt the HOST's world size (forced aspect ratio)
      }
      else if (m.t === "bye") { this._end({ reason: "left" }, false); }
    }
    _startMatch(rematch, relay) {
      this._verdict = null; this._setPhase("play"); this._vp = null;
      if (this.cfg.onStart) this.cfg.onStart({ role: this.role, code: this.code, peer: this.peerName, rematch: !!rematch });
      if (relay && this.isHost() && this.net) this.net.send({ t: "emote", k: "start" });
      // HOST broadcasts its world size so the GUEST adopts the same aspect ratio + layout (rides the relayed "emote" channel — no server change)
      if (this.isHost() && this.net) this.net.send({ t: "emote", k: "vp", w: Math.round(this._w()), h: Math.round(this._h()) });
    }
    _end(verdict, relay) {
      if (this.phase === "ended") return;
      this._verdict = verdict || {}; this._setPhase("ended");
      if (this.cfg.onEnd) this.cfg.onEnd(this._verdict);
      if (relay && this.net) this.net.send({ t: "emote", k: "end", v: this._verdict });
    }
    // ---- public game-facing methods ----
    send(msg) { if (this.net && this.online) this.net.send({ t: "msg", d: msg }); }
    sendThrottled(msg, hz) {
      const key = msg.t || "_", iv = 1000 / (hz || 30), now = (this._clock = (this._clock || 0));
      const last = this._sendTimers[key] || 0;
      if (now - last < iv) return false; this._sendTimers[key] = now; this.send(msg); return true;
    }
    tick(dt) { this._clock = (this._clock || 0) + dt; if (this._noteT > 0) this._noteT -= dt; }   // game calls each frame so throttle + notes advance
    end(verdict) { this._end(verdict, true); }   // HOST-only authoritative match-over

    // ============ SHARED HOST-VIEWPORT (forced aspect ratio + letterbox) ============
    // The GUEST adopts the HOST's logical world size and we letterbox-fit it into the guest's own
    // canvas with a UNIFORM scale, so both players see the SAME layout regardless of screen size.
    // No-op for the host and for offline play (identity transform / local coords).
    usingHostWorld() { return this.isGuest() && this.online && !!this._hostVP && this._hostVP.w > 0 && this._hostVP.h > 0; }
    // World dimensions the GAME should LAY OUT / SIMULATE / RENDER in.
    worldW() { return this.usingHostWorld() ? this._hostVP.w : this._w(); }
    worldH() { return this.usingHostWorld() ? this._hostVP.h : this._h(); }
    // Letterbox fit of the host world into THIS canvas (CSS px). Cached; invalidated on resize / new match.
    _fit() {
      if (this._vp) return this._vp;
      const cw = this._w(), ch = this._h(), hw = this.worldW(), hh = this.worldH();
      const scale = Math.min(cw / hw, ch / hh);
      return (this._vp = { scale: scale, offX: (cw - hw * scale) / 2, offY: (ch - hh * scale) / 2, hw: hw, hh: hh });
    }
    // Wrap GAMEPLAY drawing: applyViewport(ctx) … endViewport(ctx). Identity for host/offline.
    applyViewport(ctx) {
      ctx.save();
      if (this.usingHostWorld()) { const v = this._fit(); ctx.translate(v.offX, v.offY); ctx.scale(v.scale, v.scale); }
      return true;
    }
    endViewport(ctx) { ctx.restore(); }
    // Paint the letterbox slack (bars) outside the host-world rect. Guest only; call right after the bg fill.
    drawLetterboxBars(ctx, color) {
      if (!this.usingHostWorld()) return;
      const v = this._fit(), cw = this._w(), ch = this._h();
      ctx.save(); ctx.fillStyle = color || "#05070d";
      if (v.offX > 0.5) { ctx.fillRect(0, 0, v.offX, ch); ctx.fillRect(cw - v.offX, 0, v.offX, ch); }
      if (v.offY > 0.5) { ctx.fillRect(0, 0, cw, v.offY); ctx.fillRect(0, ch - v.offY, cw, v.offY); }
      ctx.restore();
    }
    // Inverse transform: a pointer event's client coords -> WORLD coords (for gameplay hit-tests / aim).
    // Identity-ish (plain CSS-space) for host/offline, matching the games' existing manual mapping.
    mapPoint(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      let x = (clientX - r.left) * (this._w() / r.width), y = (clientY - r.top) * (this._h() / r.height);
      if (this.usingHostWorld()) { const v = this._fit(); x = (x - v.offX) / v.scale; y = (y - v.offY) / v.scale; }
      return { x: x, y: y };
    }
    // The game calls this at the end of its resize(): invalidates the fit; HOST re-broadcasts its world size mid-match.
    notifyResize() {
      this._vp = null;
      if (!(this.isHost() && this.online && this.phase === "play" && this.net)) return;
      const now = this._clock || 0;   // coalesce window drag-resize storms so vp can't flood the relay's per-second cap
      if (now - (this._lastVpT || -1e9) < 140) return;
      this._lastVpT = now;
      this.net.send({ t: "emote", k: "vp", w: Math.round(this._w()), h: Math.round(this._h()) });
    }
    // Self-healing fallback: if the one-shot vp emote was ever lost, the guest adopts the host world
    // from the game's own periodic stream (which carries host w/h). No-op once dims already match.
    noteHostViewport(w, h) {
      if (!w || !h || !this.isGuest()) return;
      if (!this._hostVP || this._hostVP.w !== w || this._hostVP.h !== h) { this._hostVP = { w: w, h: h }; this._vp = null; if (this.cfg.onViewport) this.cfg.onViewport(this._hostVP); }
    }
    rematch() { if (this.isHost()) this._startMatch(true, true); else { if (this.net) this.net.send({ t: "rematch" }); this._toast("Asked host for rematch…"); } }
    _verdictText() {
      const v = this._verdict || {};
      if (v.reason === "left") return "OPPONENT LEFT";
      if (v.reason === "disconnected") return "DISCONNECTED";
      if (v.winner === "draw") return "DRAW";
      if (v.winner) return (v.winner === this.role) ? "YOU WIN! 🏆" : "YOU LOST";
      return "GAME OVER";
    }

    // ---- rendering / input ----
    _uiButton(ctx, th, label, x, y, w, h, fn, primary) {
      const p = th.palette;
      ctx.save();
      ctx.fillStyle = primary ? rgba(p.accent, 0.9) : "rgba(255,255,255,0.08)"; rr(ctx, x, y, w, h, Math.min(10, h / 2)); ctx.fill();
      ctx.strokeStyle = primary ? p.accent : p.wall; ctx.lineWidth = 1.5;
      if (th.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = primary ? p.accent : p.wall; }
      rr(ctx, x, y, w, h, Math.min(10, h / 2)); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = primary ? "#06121a" : p.text; ctx.font = "800 " + Math.round(h * 0.42) + "px " + th.fonts.ui;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
      ctx.restore();
      this._uiBtns.push({ x: x, y: y, w: w, h: h, fn: fn });
    }
    render(now) {
      this._uiBtns = [];
      const th = this._theme(), W = this._w(), H = this._h(), self = this;
      if (!th) return;
      const ctx = this.canvas.getContext("2d");
      if (!this.phase) {   // offline: discreet entry pill at the top
        const bw = Math.min(170, W * 0.5), bx = (W - bw) / 2, bh = Math.max(24, Math.round(H * 0.032));
        this._uiButton(ctx, th, "⇄ PLAY ONLINE", bx, 6, bw, bh, () => self.open(), false);
        return;
      }
      if (this.phase === "play") {
        ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = th.palette.textDim;
        ctx.font = "700 " + Math.round(H * 0.022) + "px " + th.fonts.ui;
        ctx.fillText("ROOM " + this.code + "   ·   VS " + (this.peerName || "?"), W / 2, 6);
        ctx.restore();
        return;
      }
      // dim backdrop for menu / waiting / ended / keypad
      ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.66)"; ctx.fillRect(0, 0, W, H); ctx.restore();
      if (this.entering) { this._drawKeypad(ctx, th, now); return; }
      const cx = W / 2, panelW = Math.min(340, W * 0.86), bx = cx - panelW / 2, bh = Math.max(34, Math.round(H * 0.05)), gap = 12;
      const title = (txt, y, color) => { ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color || th.palette.text; if (th.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = color || th.palette.accent; } ctx.font = "800 " + Math.round(H * 0.04) + "px " + th.fonts.ui; ctx.fillText(txt, cx, y); ctx.restore(); };
      const sub = (txt, y, color) => { ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color || th.palette.textDim; ctx.font = "600 " + Math.round(H * 0.022) + "px " + th.fonts.ui; ctx.fillText(txt, cx, y); ctx.restore(); };
      let y = H * 0.28;
      if (this.phase === "menu") {
        title(this.title, y, th.palette.accent); y += H * 0.06;
        sub((!Arcade.Net || !Arcade.Net.configured()) ? "Server not set up yet — see server/README" : this.rules, y); y += H * 0.045;
        if (this._noteT > 0) { sub(this._note, y, th.palette.danger); y += H * 0.04; }
        this._uiButton(ctx, th, "CREATE GAME", bx, y, panelW, bh, () => self._create(), true); y += bh + gap;
        this._uiButton(ctx, th, "JOIN GAME", bx, y, panelW, bh, () => { self.entering = true; self._entry = ""; }, false); y += bh + gap;
        this._uiButton(ctx, th, "BACK", bx, y, panelW, bh, () => self.leave(), false);
      } else if (this.phase === "waiting") {
        title("ROOM CODE", y, th.palette.accent); y += H * 0.075;
        title(this.code || "····", y, th.palette.text); y += H * 0.06;
        sub("Share this code — waiting for opponent" + ".".repeat(((now / 400) | 0) % 4), y);
        y = H * 0.62; this._uiButton(ctx, th, "CANCEL", bx, y, panelW, bh, () => self.leave(), false);
      } else if (this.phase === "ended") {
        const vt = this._verdictText();
        title(vt, y, /WIN/.test(vt) ? th.palette.accent : th.palette.danger); y += H * 0.06;
        if (this._verdict && this._verdict.sub) { sub(this._verdict.sub, y); y += H * 0.05; }
        const canRematch = this._verdict && !this._verdict.reason;
        if (canRematch) { this._uiButton(ctx, th, "REMATCH", bx, y, panelW, bh, () => self.rematch(), true); y += bh + gap; }
        this._uiButton(ctx, th, "LEAVE", bx, y, panelW, bh, () => self.leave(), false);
      }
    }
    _drawKeypad(ctx, th, now) {
      const W = this._w(), H = this._h(), self = this;
      const rect = { x: W * 0.06, y: H * 0.12, w: W * 0.88, h: H * 0.76 };
      const keys = Keypad.draw(ctx, th, rect, this._entry, { now: now, len: 4, title: "ENTER ROOM CODE" });
      for (const k of keys) {
        const r = { x: k.x, y: k.y, w: k.w, h: k.h };
        if (k.char) r.fn = () => { if (self._entry.length < 4) self._entry += k.char; };
        else if (k.action === "del") r.fn = () => { self._entry = self._entry.slice(0, -1); };
        else if (k.action === "submit") r.fn = () => { if (self._entry.length >= 4) self._connect(self._entry); };
        else if (k.action === "back") r.fn = () => { self.entering = false; self._entry = ""; };
        this._uiBtns.push(r);
      }
    }
    pointerDown(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const x = (clientX - r.left) * (this._w() / r.width), y = (clientY - r.top) * (this._h() / r.height);
      for (const b of this._uiBtns) { if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { if (this.audio && this.audio.unlock) this.audio.unlock(); b.fn && b.fn(); return true; } }
      return false;
    }
    keydown(e) {
      if (!this.entering) return false;
      const k = (e.key || "").toUpperCase();
      if (k === "BACKSPACE") { this._entry = this._entry.slice(0, -1); return true; }
      if (k === "ENTER") { if (this._entry.length >= 4) this._connect(this._entry); return true; }
      if (k === "ESCAPE") { this.entering = false; this._entry = ""; return true; }
      if (k.length === 1 && CHARSET.indexOf(k) >= 0 && this._entry.length < 4) { this._entry += k; return true; }
      return false;
    }
  }

  Arcade.Lobby = Lobby;
  Arcade.Keypad = Keypad;
})(window.Arcade = window.Arcade || {});
