/* =========================================================
   PONG — classic two-paddle Pong vs a CPU adversary, oriented
   VERTICALLY: your paddle sits at the bottom, the CPU's at the
   top, both slide on the HORIZONTAL axis. Move with ←/→ or A/D,
   the mouse, or a finger drag (sleek, no buttons).

   Arcade-scored survival: +1 per return, +25 when you score on
   the CPU; you have 3 lives (a miss costs one). Ball + CPU speed
   up as you rack up points. Implements the GameInstance contract.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const P = Arcade.Pong;
  const START_LIVES = 3;
  const MOMENTUM_FRICTION = 0.990;   // per-ms velocity decay → a flicked paddle glides ~0.35s then settles (tasteful, not slippery)
  const FLICK_MIN = 0.02;            // px/ms below which we stop gliding
  const SENS_DEFAULT = 1.7;          // punchier thumb→paddle ratio: move the thumb less, paddle moves more

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rgba(hex, a) {
    if (typeof hex !== "string" || hex[0] !== "#") return hex;
    let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  class Pong {
    constructor(ctx) {
      this.shell = ctx; this.ctx2d = ctx.ctx; this.particles = ctx.particles; this.audio = ctx.audio;
      this.theme = P.getTheme(ctx.storage.get("pong:theme", "modern"));
      this.pointerInput = true;            // we use drag/pointer — hide the touch button bar
      this._unsub = []; this.paused = false; this.state = "playing"; this._now = 0;
      this._w = 800; this._h = 600;
      this.moveDir = 0; this._ptrActive = false; this._ptrMode = "mouse"; this.targetX = 0; this._vx = 0;
      this.touchSens = clamp(ctx.storage.get("pong:sens", SENS_DEFAULT), 0.5, 3.5);   // mobile drag sensitivity (punchier default)
      // ---- online multiplayer via the reusable Arcade.Lobby (offline vs-CPU is the default) ----
      this.myName = ctx.storage.get("pong:name", "") || ("P" + (1000 + (Math.random() * 9000 | 0)));
      this.sH = 0; this.sG = 0; this._guestX = null;
      const self = this;
      this.lobby = new Arcade.Lobby({
        canvas: ctx.canvas, audio: ctx.audio,
        w: () => this._w, h: () => this._h, theme: () => this.theme, name: () => this.myName,
        gameId: "pong", title: "MULTIPLAYER", rules: "First to 7 wins",
        winLabels: { host: "HOST WINS", guest: "CHALLENGER WINS" },
        onStart: (info) => self._startOnlineMatch(info),
        onMessage: (m, role) => self._onNetMessage(m, role),
        onEnd: () => {},                                   // lobby draws the result; sim is frozen via blocking()
        onLeave: () => { self._reset(); }
      });
      this._bindInput();
    }
    _online() { return !!(this.lobby && this.lobby.phase === "play"); }   // true only during an active online match

    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      this.score = 0; this.lives = START_LIVES;
      this.points = 0; this.cpu = 0;        // points you scored on CPU / on you
      this.rally = 0; this.shakeMag = 0; this.flash = 0; this.toasts = []; this.trail = []; this._vx = 0;
      this.state = "playing"; this.paused = false;
      this._layout();
      this._serve(Math.random() < 0.5 ? 1 : -1);   // dir: +1 toward player (down), -1 toward CPU (up)
      this.particles.clear();
    }

    pause() { this.paused = true; this.moveDir = 0; }
    resume() { this.paused = false; }
    destroy() {
      const c = this.shell.canvas;
      if (this._mm) c.removeEventListener("mousemove", this._mm);
      if (this._md) c.removeEventListener("mousedown", this._md);
      if (this._tstart) { c.removeEventListener("touchstart", this._tstart); c.removeEventListener("touchmove", this._tmove); c.removeEventListener("touchend", this._tend); c.removeEventListener("touchcancel", this._tend); }
      if (this.lobby) this.lobby.destroy();
      this._unsub.forEach(fn => fn()); this._unsub.length = 0;
    }

    cycleTheme() {
      const list = P.Themes; this.theme = list[(list.indexOf(this.theme) + 1) % list.length];
      this.shell.storage.set("pong:theme", this.theme.id);
      if (!this.theme.effects.particles) this.particles.clear();
      return this.theme.name;
    }
    menus() {
      const self = this;
      return {
        control: {
          sliders: [{
            id: "sens", name: "Touch sensitivity", min: 0.5, max: 3.5, step: 0.1, value: this.touchSens,
            format: (v) => v.toFixed(1) + "×",
            set: (v) => { self.touchSens = clamp(v, 0.5, 3.5); self.shell.storage.set("pong:sens", self.touchSens); }
          }]
        },
        skin: { options: P.Themes.map(t => ({ id: t.id, name: t.name })), current: this.theme.id,
          set: (id) => { const t = P.Themes.find(x => x.id === id); if (t) { self.theme = t; self.shell.storage.set("pong:theme", id); if (!t.effects.particles) self.particles.clear(); } } }
      };
    }

    // ---------------- layout ----------------
    _layout() {
      const w = this._w, h = this._h, m = Math.round(Math.min(w, h) * 0.04);
      const ch = h - m * 2, cw = Math.min(w - m * 2, Math.round(ch * 1.05));   // portrait-ish court, centered
      this.court = { x: Math.round((w - cw) / 2), y: m, w: cw, h: ch };
      this.pw = Math.max(54, Math.round(cw * 0.20));        // paddle width
      this.ph = Math.max(8, Math.round(ch * 0.022));        // paddle thickness
      this.br = Math.max(5, Math.round(cw * 0.018));         // ball radius
      this.playerY = this.court.y + this.court.h - Math.round(ch * 0.06);
      this.cpuY = this.court.y + Math.round(ch * 0.06);
      this.pSpeed = cw * 1.9 / 1000;                          // px per ms (keyboard)
      this.ballBase = ch * 0.66 / 1000;                       // base ball speed px/ms
      if (this.player == null) { this.player = { x: this.court.x + cw / 2 }; this.cpuP = { x: this.court.x + cw / 2 }; this.targetX = this.player.x; }
      else { this.player.x = clamp(this.player.x, this.court.x + this.pw / 2, this.court.x + cw - this.pw / 2); }
    }
    resize(w, h) { this._w = w; this._h = h; this._layout(); }

    // ---------------- serve ----------------
    _serve(dir) {
      const c = this.court;
      this.rally = 0;
      this.ball = { x: c.x + c.w / 2, y: c.y + c.h / 2, vx: 0, vy: 0, r: this.br };
      this.serveT = 900;                 // brief pause, then launch toward `dir`
      this._serveDir = dir;
    }
    _launch(dir) {
      const ang = rand(-0.35, 0.35);      // mostly vertical, slight angle
      const sp = this.ballBase * this._speedScale();
      this.ball.vx = Math.sin(ang) * sp;
      this.ball.vy = Math.cos(ang) * sp * dir;   // dir +1 down (player), -1 up (cpu)
    }
    _speedScale() { return 1 + this.points * 0.05 + Math.min(0.5, this.rally * 0.03); }   // faster as you score + within a rally

    // ---------------- input ----------------
    _bindInput() {
      const input = this.shell.input, canvas = this.shell.canvas;
      this._unsub.push(input.onDown((code, e, repeat) => {
        if (this.lobby.keydown(e)) return;        // typing a room code into the on-canvas keypad
        if (this.paused || this.state !== "playing" || repeat || this.lobby.blocking()) return;
        if (code === "ArrowLeft") { this.moveDir = -1; this._ptrActive = false; }
        else if (code === "ArrowRight") { this.moveDir = 1; this._ptrActive = false; }
      }));
      this._unsub.push(input.onUp((code) => {
        if (code === "ArrowLeft" && this.moveDir === -1) this._recompute();
        else if (code === "ArrowRight" && this.moveDir === 1) this._recompute();
      }));
      const courtX = (clientX) => { const r = canvas.getBoundingClientRect(); return (clientX - r.left) * (this._w / r.width); };
      // lobby chrome (PLAY ONLINE pill, lobby/keypad/result buttons) intercepts taps BEFORE paddle control
      this._md = (e) => { this.lobby.pointerDown(e.clientX, e.clientY); };
      canvas.addEventListener("mousedown", this._md);
      // MOUSE: absolute (precise on desktop)
      this._mm = (e) => { if (this.paused || this.state !== "playing" || this.lobby.blocking()) return; this.targetX = courtX(e.clientX); this._ptrActive = true; this._ptrMode = "mouse"; };
      // TOUCH: RELATIVE drag — first touch anchors at the paddle's current spot, then it tracks the
      // finger's *movement* (× sensitivity). No jump-to-finger; drag from anywhere on screen.
      this._tstart = (e) => { const t = e.touches && e.touches[0]; if (!t) return; if (this.lobby.pointerDown(t.clientX, t.clientY)) { e.preventDefault(); return; } if (this.paused || this.state !== "playing" || this.lobby.blocking()) return; e.preventDefault(); this._dragX0 = courtX(t.clientX); this._padX0 = this._ctrlPaddle().x; this.targetX = this._padX0; this._ptrActive = true; this._ptrMode = "touch"; };
      this._tmove = (e) => { if (this.paused || this.state !== "playing" || this.lobby.blocking()) return; const t = e.touches && e.touches[0]; if (!t) return; e.preventDefault(); if (this._dragX0 == null) { this._dragX0 = courtX(t.clientX); this._padX0 = this._ctrlPaddle().x; } this.targetX = this._padX0 + (courtX(t.clientX) - this._dragX0) * this.touchSens; this._ptrMode = "touch"; this._ptrActive = true; };
      this._tend = () => { this._dragX0 = null; this._ptrActive = false; };   // release → paddle keeps its flick momentum (glides in update)
      canvas.addEventListener("mousemove", this._mm);
      canvas.addEventListener("touchstart", this._tstart, { passive: false });
      canvas.addEventListener("touchmove", this._tmove, { passive: false });
      canvas.addEventListener("touchend", this._tend);
      canvas.addEventListener("touchcancel", this._tend);
    }
    _recompute() {
      const input = this.shell.input;
      if (input.isDown("ArrowLeft") && !input.isDown("ArrowRight")) this.moveDir = -1;
      else if (input.isDown("ArrowRight") && !input.isDown("ArrowLeft")) this.moveDir = 1;
      else this.moveDir = 0;
    }

    // ================= ONLINE MULTIPLAYER (via Arcade.Lobby) =================
    // role + connection live in this.lobby; the game keeps only the host/guest SIM.
    _isHost() { return this.lobby.isHost(); }
    _isGuest() { return this.lobby.isGuest(); }
    // The paddle THIS device controls: guest drives the top paddle, host/CPU-mode drives the bottom.
    _ctrlPaddle() { return (this._online() && this._isGuest()) ? this.cpuP : this.player; }

    // lobby fires this on both sides when a match (re)starts
    _startOnlineMatch(info) {
      this.sH = 0; this.sG = 0; this._guestX = null; this._vx = 0;
      this._layout();
      const c = this.court; this.player.x = c.x + c.w / 2; this.cpuP.x = c.x + c.w / 2;
      this.ball = { x: c.x + c.w / 2, y: c.y + c.h / 2, vx: 0, vy: 0, r: this.br };
      if (info.role === "host") this._serve(Math.random() < 0.5 ? 1 : -1); else this.serveT = 900;
      this._toast("VS " + (info.peer || "?"), this.theme.palette.accent, true);
    }
    // relayed game messages (m.t is our own type); role tells us who we are
    _onNetMessage(m, role) {
      if (m.t === "input") { if (role === "host") this._guestX = m.x; }
      else if (m.t === "state") { if (role === "guest") this._applyState(m); }
    }
    _applyState(m) {   // guest: trust the host's authoritative snapshot
      if (!this.ball) this.ball = { x: 0, y: 0, vx: 0, vy: 0, r: this.br };
      const b = this.ball; b.x = m.bx; b.y = m.by; b.vx = m.bvx; b.vy = m.bvy;
      this.player.x = m.hx;                 // host's bottom paddle
      this.sH = m.sH; this.sG = m.sG; this.serveT = m.serveT || 0; this._serveDir = m.sd;
    }
    _netSendState() {
      const b = this.ball || { x: 0, y: 0, vx: 0, vy: 0 };
      this.lobby.sendThrottled({ t: "state", bx: Math.round(b.x), by: Math.round(b.y), bvx: b.vx, bvy: b.vy,
        hx: Math.round(this.player.x), sH: this.sH, sG: this.sG, serveT: Math.max(0, this.serveT | 0), sd: this._serveDir }, 30);
    }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now;
      if (this.shakeMag > 0) { this.shakeMag -= dt * 0.05; if (this.shakeMag < 0) this.shakeMag = 0; }
      if (this.flash > 0) { this.flash -= dt / 300; if (this.flash < 0) this.flash = 0; }
      this.particles.update(dt);
      this.lobby.tick(dt);
      for (let i = this.toasts.length - 1; i >= 0; i--) if (now - this.toasts[i].born > this.toasts[i].life) this.toasts.splice(i, 1);
      if (this.state !== "playing") return;
      if (this.lobby.blocking()) return;   // lobby overlay (menu/waiting/ended/keypad) open → freeze the sim

      const c = this.court;
      const minX = c.x + this.pw / 2, maxX = c.x + c.w - this.pw / 2;
      // ---- local paddle (bottom for host/CPU, top for guest) ----
      const me = this._ctrlPaddle();
      const prevX = me.x; let controlled = false;
      if (this._ptrActive) {
        const tx = clamp(this.targetX, minX, maxX);
        if (this._ptrMode === "touch") { me.x = tx; }                                  // relative drag → 1:1
        else { const d = tx - me.x, step = this.pSpeed * 2.6 * dt; me.x += clamp(d, -step, step); }   // mouse: eased absolute
        controlled = true;
      } else if (this.moveDir !== 0) {
        me.x = clamp(me.x + this.moveDir * this.pSpeed * dt, minX, maxX);
        controlled = true;
      }
      if (controlled) {
        // track paddle velocity (EMA) so a flick carries momentum on release
        const inst = (me.x - prevX) / Math.max(1, dt);
        this._vx = this._vx == null ? inst : this._vx * 0.55 + inst * 0.45;
      } else if (Math.abs(this._vx || 0) > FLICK_MIN) {
        // GLIDE: residual momentum after a flick, decaying with friction
        me.x += this._vx * dt; this._vx *= Math.pow(MOMENTUM_FRICTION, dt);
        if (me.x <= minX) { me.x = minX; this._vx = 0; } else if (me.x >= maxX) { me.x = maxX; this._vx = 0; }
      } else this._vx = 0;
      me.x = clamp(me.x, minX, maxX);

      // ===== GUEST: no local sim — send input, dead-reckon the ball between host snapshots =====
      if (this._isGuest()) {
        this.lobby.sendThrottled({ t: "input", x: Math.round(this.cpuP.x) }, 30);
        const b = this.ball; if (b && this.serveT <= 0) { b.x += b.vx * dt; b.y += b.vy * dt; if (this.theme.effects.trail) { this.trail.push({ x: b.x, y: b.y }); if (this.trail.length > 10) this.trail.shift(); } }
        if (this.serveT > 0) this.serveT = Math.max(0, this.serveT - dt);
        return;
      }

      // ---- serve countdown ----
      if (this.serveT > 0) { this.serveT -= dt; if (this.serveT <= 0) this._launch(this._serveDir); }

      // ---- top paddle: CPU AI (offline) or the remote guest's paddle (online host) ----
      if (this._isHost()) { if (this._guestX != null) this.cpuP.x = clamp(this._guestX, minX, maxX); }
      else {
        const cpuSpeed = this.pSpeed * (0.62 + Math.min(0.5, this.points * 0.035));
        const err = Math.max(6, (this.pw * 0.42) - this.points * 2);
        const aimX = (this.ball.vy < 0 ? this.ball.x : c.x + c.w / 2) + (this._cpuErr || 0);
        if (Math.random() < dt / 600) this._cpuErr = rand(-err, err);
        const cd = clamp(aimX - this.cpuP.x, -cpuSpeed * dt, cpuSpeed * dt);
        this.cpuP.x = clamp(this.cpuP.x + cd, minX, maxX);
      }

      if (this.serveT > 0) { if (this._isHost()) this._netSendState(); return; }   // ball not in play yet

      // ---- ball physics (host + CPU mode) ----
      const b = this.ball;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (this.theme.effects.trail) { this.trail.push({ x: b.x, y: b.y }); if (this.trail.length > 10) this.trail.shift(); }

      // side walls
      if (b.x - b.r < c.x) { b.x = c.x + b.r; b.vx = Math.abs(b.vx); this.audio.play("move"); }
      else if (b.x + b.r > c.x + c.w) { b.x = c.x + c.w - b.r; b.vx = -Math.abs(b.vx); this.audio.play("move"); }

      // bottom paddle (host/you) — ball heading down
      if (b.vy > 0 && b.y + b.r >= this.playerY && b.y + b.r <= this.playerY + this.ph + Math.abs(b.vy * dt) && Math.abs(b.x - this.player.x) <= this.pw / 2 + b.r) {
        this._paddleHit(this.player.x, -1); b.y = this.playerY - b.r;
        if (!this._online()) { this.score += 1; this.rally++; } else this.rally++;
      }
      // top paddle (CPU / remote guest) — ball heading up
      if (b.vy < 0 && b.y - b.r <= this.cpuY + this.ph && b.y - b.r >= this.cpuY - Math.abs(b.vy * dt) && Math.abs(b.x - this.cpuP.x) <= this.pw / 2 + b.r) {
        this._paddleHit(this.cpuP.x, 1); b.y = this.cpuY + this.ph + b.r;
      }

      // scoring
      if (this._online()) {
        if (b.y - b.r > c.y + c.h) { this._onlinePoint("G"); }        // past host (bottom) → guest scores
        else if (b.y + b.r < c.y) { this._onlinePoint("H"); }        // past guest (top) → host scores
        this._netSendState();
      } else {
        if (b.y - b.r > c.y + c.h) { this._miss(); }
        else if (b.y + b.r < c.y) { this._scorePoint(); }
      }
    }

    _onlinePoint(who) {   // HOST-authoritative scoring; first to 7. lobby relays the neutral verdict to both sides.
      if (who === "H") { this.sH++; this.score += 25; } else { this.sG++; }
      this.audio.play(who === "H" ? "extralife" : "drain");
      if (this.theme.effects.shake) this._shake(6);
      this._burst(this.ball.x, who === "H" ? this.court.y : this.court.y + this.court.h, who === "H" ? this.theme.palette.player : this.theme.palette.cpu);
      const WIN = 7;
      if (this.sH >= WIN || this.sG >= WIN) {
        this.serveT = 0; this.ball.vx = this.ball.vy = 0;
        this.lobby.end({ winner: this.sH >= WIN ? "host" : "guest", sub: this.sH + " – " + this.sG });   // each side renders YOU WIN/LOST from its role
        return;
      }
      this._serve(who === "H" ? 1 : -1);   // serve toward whoever just got scored on
    }

    _paddleHit(paddleX, dir) {   // dir: -1 bounce up (player), +1 bounce down (cpu)
      const b = this.ball, off = clamp((b.x - paddleX) / (this.pw / 2), -1, 1);
      const sp = Math.hypot(b.vx, b.vy) * 1.035 + 0.01;          // speed up a touch each hit
      const ang = off * 1.05;                                    // steer by where it struck
      b.vx = Math.sin(ang) * sp;
      b.vy = Math.cos(ang) * sp * dir;
      this.audio.play("bump");
      if (this.theme.effects.shake) this._shake(2.5);
      if (this.theme.effects.particles) this.particles.emit({ x: b.x, y: b.y, count: 8,
        colors: [dir < 0 ? this.theme.palette.player : this.theme.palette.cpu, this.theme.palette.ball],
        speedMin: 40, speedMax: 200, gravity: 0, drag: 1.6, sizeMin: 1.5, sizeMax: 3.2, lifeMin: 0.2, lifeMax: 0.5, glow: this.theme.effects.glow, shape: "circle" });
    }

    _scorePoint() {
      this.points++; this.score += 25; this.audio.play("extralife");
      this._toast("POINT!  +25", this.theme.palette.accent, true);
      if (this.theme.effects.shake) this._shake(5);
      this._burst(this.ball.x, this.court.y, this.theme.palette.player);
      this._serve(1);   // serve back toward the player
    }
    _miss() {
      this.lives--; this.cpu++; this.audio.play("drain");
      if (this.theme.effects.shake) this._shake(7); this.flash = 0.6;
      this._burst(this.ball.x, this.court.y + this.court.h, this.theme.palette.danger);
      if (this.lives <= 0) { this.state = "over"; this.shell.requestGameOver({ score: this.score }); return; }
      this._toast("MISS!  " + this.lives + " LEFT", this.theme.palette.danger, true);
      this._serve(-1);   // serve toward the CPU (your turn to attack)
    }

    _burst(x, y, color) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: x, y: y, count: 22, colors: [color, this.theme.palette.ball, "#ffffff"],
        speedMin: 60, speedMax: 320, gravity: 80, drag: 1, sizeMin: 1.5, sizeMax: 4, lifeMin: 0.3, lifeMax: 0.9, glow: this.theme.effects.glow, shape: "circle", spin: 6 });
    }
    _shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
    _toast(text, color, big) { this.toasts.push({ text: text, color: color, born: this._now, life: 1100, big: !!big }); if (this.toasts.length > 4) this.toasts.shift(); }

    // ---------------- render ----------------
    render(now) {
      const ctx = this.ctx2d, th = this.theme, pal = th.palette, c = this.court;
      this._drawBg(ctx, th, now);
      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1 && !this.paused) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }
      ctx.save(); ctx.translate(sx, sy);

      // court frame + net
      ctx.strokeStyle = pal.wall; ctx.lineWidth = 2;
      if (th.effects.glow) { ctx.shadowBlur = 10; ctx.shadowColor = pal.wall; }
      ctx.strokeRect(c.x, c.y, c.w, c.h); ctx.shadowBlur = 0;
      ctx.strokeStyle = pal.net; ctx.lineWidth = Math.max(2, this.ph * 0.4); ctx.setLineDash([this.ph, this.ph]);
      ctx.beginPath(); ctx.moveTo(c.x + 6, c.y + c.h / 2); ctx.lineTo(c.x + c.w - 6, c.y + c.h / 2); ctx.stroke(); ctx.setLineDash([]);

      this._drawPaddle(ctx, th, this.cpuP.x, this.cpuY, pal.cpu, true);
      this._drawPaddle(ctx, th, this.player.x, this.playerY, pal.player, false);
      this._drawBall(ctx, th, now);
      this.particles.render(ctx);
      ctx.restore();

      this._drawHud(ctx, th, now);
      if (this.flash > 0) { ctx.save(); ctx.globalAlpha = this.flash * 0.4; ctx.fillStyle = pal.danger; ctx.fillRect(0, 0, this._w, this._h); ctx.restore(); }
      this.lobby.render(now);   // PLAY ONLINE pill / lobby / keypad / waiting / result — all reusable chrome
      if (th.effects.scanlines) this._scanlines(ctx);
    }

    _drawBg(ctx, th, now) {
      const w = this._w, h = this._h, pal = th.palette;
      if (th.bg.type === "solid") { ctx.fillStyle = pal.bg1; ctx.fillRect(0, 0, w, h); return; }
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal.bg1); g.addColorStop(1, pal.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (th.bg.type === "dust" && th.effects.particles) {
        // faint drifting dust for Mad Max
        ctx.save(); ctx.globalAlpha = 0.5;
        for (let i = 0; i < 3; i++) { const x = (now * 0.02 * (i + 1) + i * 300) % (w + 80) - 40, y = h * (0.3 + 0.2 * i); ctx.fillStyle = "rgba(255,150,60,0.05)"; ctx.beginPath(); ctx.arc(x, y, 60 + i * 20, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    }

    _drawPaddle(ctx, th, x, y, color, isCpu) {
      const pal = th.palette, w = this.pw, hh = this.ph, left = x - w / 2;
      ctx.save();
      if (th.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = color; }
      if (th.id === "madmax") {   // riveted metal bar
        ctx.fillStyle = color; this._rr(ctx, left, y, w, hh, 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(left, y + hh * 0.55, w, hh * 0.45);
        ctx.fillStyle = "rgba(255,230,180,0.5)"; for (let rx = left + 6; rx < left + w - 4; rx += 14) ctx.fillRect(rx, y + hh * 0.25, 2, 2);
      } else {
        ctx.fillStyle = color; this._rr(ctx, left, y, w, hh, th.id === "classic" ? 0 : Math.min(hh / 2, 6)); ctx.fill();
      }
      ctx.restore();
    }

    _drawBall(ctx, th, now) {
      const b = this.ball, pal = th.palette;
      if (th.effects.trail && this.trail.length) {   // motion trail
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < this.trail.length; i++) { const tp = this.trail[i], a = (i / this.trail.length) * 0.5; ctx.globalAlpha = a; ctx.fillStyle = pal.ball; ctx.beginPath(); ctx.arc(tp.x, tp.y, b.r * (0.4 + 0.6 * i / this.trail.length), 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      ctx.save();
      if (th.effects.glow) { ctx.shadowBlur = 16; ctx.shadowColor = pal.ball; }
      ctx.fillStyle = pal.ball;
      if (th.ball === "square") { ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
      else if (th.ball === "saw") {   // spinning buzzsaw
        const spin = now / 90, n = 8, R = b.r * 1.35;
        ctx.translate(b.x, b.y); ctx.rotate(spin);
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2; ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); ctx.lineTo(Math.cos(a1) * b.r * 0.8, Math.sin(a1) * b.r * 0.8); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.35, 0, Math.PI * 2); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    _drawHud(ctx, th, now) {
      const pal = th.palette, c = this.court;
      ctx.save(); ctx.textAlign = "center";
      // big CPU / YOU tallies flanking the net
      ctx.fillStyle = pal.textDim; ctx.font = "900 " + Math.round(c.h * 0.10) + "px " + th.fonts.score;
      ctx.globalAlpha = th.id === "classic" ? 0.9 : 0.5;
      const online = this._online();
      const topN = online ? this.sG : this.cpu, botN = online ? this.sH : this.points;   // top paddle's score above the net
      ctx.textBaseline = "bottom"; ctx.fillText(String(topN), c.x + c.w * 0.5, c.y + c.h / 2 - 8);
      ctx.textBaseline = "top"; ctx.fillText(String(botN), c.x + c.w * 0.5, c.y + c.h / 2 + 8);
      ctx.globalAlpha = 1;
      // score + lives (top strip)
      ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = pal.text;
      if (th.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = pal.accent; }
      ctx.font = "800 " + Math.round(this._h * 0.03) + "px " + th.fonts.ui;
      ctx.fillText(String(this.score).padStart(5, "0"), c.x + 4, 8); ctx.shadowBlur = 0;
      // lives as dots near the player (offline vs-CPU only)
      if (!online) { const dr = Math.max(4, this.br * 0.7); for (let i = 0; i < START_LIVES; i++) { ctx.fillStyle = i < this.lives ? pal.player : "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(c.x + c.w - 14 - i * (dr * 2.6), 8 + dr, dr, 0, Math.PI * 2); ctx.fill(); } }
      // serve "GET READY"
      if (this.serveT > 0 && this.state === "playing") {
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = pal.accent;
        if (th.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = pal.accent; }
        ctx.font = "800 " + Math.round(c.h * 0.045) + "px " + th.fonts.ui;
        ctx.fillText(this._serveDir > 0 ? "DEFEND!" : "YOUR SERVE", c.x + c.w / 2, c.y + c.h * (this._serveDir > 0 ? 0.66 : 0.34));
        ctx.shadowBlur = 0;
      }
      // toasts
      ctx.textAlign = "center";
      for (let i = 0; i < this.toasts.length; i++) {
        const t = this.toasts[i], pr = (now - t.born) / t.life, alpha = pr < 0.15 ? pr / 0.15 : (1 - (pr - 0.15) / 0.85);
        ctx.globalAlpha = Math.max(0, alpha); ctx.textBaseline = "middle";
        ctx.font = "800 " + Math.round(c.h * (t.big ? 0.05 : 0.035)) + "px " + th.fonts.ui;
        if (th.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = t.color; }
        ctx.fillStyle = t.color; ctx.fillText(t.text, c.x + c.w / 2, c.y + c.h * 0.42 - i * 30);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    _rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    _scanlines(ctx) { ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = "#000"; for (let y = 0; y < this._h; y += 3) ctx.fillRect(0, y, this._w, 1); ctx.restore(); }
  }

  P.Game = Pong;
})(window.Arcade = window.Arcade || {});
