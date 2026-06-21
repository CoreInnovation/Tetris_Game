/* =========================================================
   Missile Defense — a Missile Command–style game. Aim with the
   mouse/finger, fire interceptors from your batteries, detonate
   expanding blasts to vaporize incoming missiles before they hit
   your cities. Chain blasts for combos. Pointer-driven.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const M = Arcade.Missile;
  const MK = Arcade.MusicKit;

  const AMMO = 10, INT_SPEED = 640, BLAST_MAX = 60, BLAST_GROW = 175, BLAST_SHRINK = 95, CHAIN_MAX = 34;
  const ENEMY_BASE = 44, AIM_SPEED = 380;
  const BAT_SLOTS = [0, 4, 8], CITY_SLOTS = [1, 2, 3, 5, 6, 7];

  // ---- music ----
  const MD_CLASSIC = {
    bpm: 100, volume: 0.16,
    tracks: [
      { wave: "triangle", gain: 0.28, notes: [["A2",1],["A2",1],["G2",1],["G2",1],["F2",1],["F2",1],["E2",1],["E2",1]] },
      { drum: true, gain: 0.30, notes: MK.fourOnFloor(8) }
    ]
  };
  const MD_ARP = [
    ["A4",.5],["C5",.5],["E5",.5],["A5",.5],["E5",.5],["C5",.5],["A4",.5],["C5",.5],
    ["F4",.5],["A4",.5],["C5",.5],["F5",.5],["C5",.5],["A4",.5],["F4",.5],["A4",.5],
    ["D4",.5],["F4",.5],["A4",.5],["D5",.5],["A4",.5],["F4",.5],["D4",.5],["F4",.5],
    ["E4",.5],["G#4",.5],["B4",.5],["E5",.5],["B4",.5],["G#4",.5],["E4",.5],["G#4",.5],
    ["A4",.5],["C5",.5],["E5",.5],["A5",.5],["E5",.5],["C5",.5],["A4",.5],["C5",.5],
    ["F4",.5],["A4",.5],["C5",.5],["F5",.5],["C5",.5],["A4",.5],["F4",.5],["A4",.5],
    ["D4",.5],["F4",.5],["A4",.5],["D5",.5],["A4",.5],["F4",.5],["D4",.5],["F4",.5],
    ["E4",.5],["G#4",.5],["B4",.5],["E5",.5],["B4",.5],["G#4",.5],["E4",.5],["G#4",.5]
  ];
  const MD_TECHNO = {
    bpm: 152, volume: 0.16,
    tracks: [
      { wave: "sawtooth", gain: 0.12, notes: MD_ARP },
      { wave: "square", gain: 0.13, notes: MK.eighthBass(["A2","F2","D2","E2","A2","F2","D2","E2"]) },
      { drum: true, gain: 0.36, notes: MK.fourOnFloor(32) },
      { drum: true, gain: 0.09, notes: MK.eighthHats(32) },
      { drum: true, gain: 0.20, notes: MK.backbeat(8) }
    ]
  };
  const SONGS = [
    { id: "classic", name: "Defcon", song: MD_CLASSIC },
    { id: "techno", name: "Techno Remix", song: MD_TECHNO }
  ];
  M.SONGS = SONGS;

  function rand(a, b) { return a + Math.random() * (b - a); }

  class MissileDefense {
    constructor(ctx) {
      this.shell = ctx; this.ctx2d = ctx.ctx; this.particles = ctx.particles; this.audio = ctx.audio;
      this.renderer = new M.Renderer();
      this.theme = M.getTheme(ctx.storage.get("missile:theme", "modern"));
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("missile:song", 0) | 0));
      this.pointerInput = true; // tells the shell to skip the Tetris-style touch buttons
      this._unsub = []; this.paused = false; this.state = "playing"; this._now = 0;
      this._w = 800; this._h = 600;
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      this.score = 0; this.wave = 0;
      this.batteries = BAT_SLOTS.map(s => ({ slot: s, ammo: AMMO, alive: true, x: 0 }));
      this.cities = CITY_SLOTS.map(s => ({ slot: s, alive: true, x: 0 }));
      this.enemies = []; this.interceptors = []; this.explosions = [];
      this.pending = 0; this.spawnT = 0; this.spawnGap = 1200; this.enemySpeed = ENEMY_BASE;
      this.shakeMag = 0; this.flash = 0; this.toasts = [];
      this.aim = { x: this._w / 2, y: this._h * 0.4 };
      this.particles.clear();
      this._layout(this._w, this._h);
      this.state = "playing"; this.paused = false;
      this._nextWave();
      this._applyMusic();
    }

    pause() { this.paused = true; this.audio.suspendMusic(); }
    resume() { this.paused = false; this.audio.resumeMusic(); this._applyTempo(); }
    destroy() {
      this.audio.stopMusic();
      const c = this.shell.canvas;
      if (this._pm) c.removeEventListener("pointermove", this._pm);
      if (this._pd) c.removeEventListener("pointerdown", this._pd);
      this._unsub.forEach(fn => fn()); this._unsub.length = 0;
    }

    cycleTheme() {
      const list = M.Themes; this.theme = list[(list.indexOf(this.theme) + 1) % list.length];
      this.shell.storage.set("missile:theme", this.theme.id);
      if (!this.theme.effects.particles) this.particles.clear();
      return this.theme.name;
    }
    _applyMusic() { this.audio.playMusic(SONGS[this.songIdx].song); this._applyTempo(); }
    _applyTempo() { const base = SONGS[this.songIdx].song.bpm; this.audio.setMusicTempo(Math.round(base * Math.min(1.8, 1 + (this.wave - 1) * 0.06))); }
    cycleMusic() {
      this.songIdx = (this.songIdx + 1) % SONGS.length;
      this.shell.storage.set("missile:song", this.songIdx);
      this._applyMusic(); const name = SONGS[this.songIdx].name; this._toast("♪ " + name); return name;
    }

    _bindInput() {
      const input = this.shell.input, canvas = this.shell.canvas;
      this._unsub.push(input.onDown((code, e, repeat) => {
        if (this.paused || this.state !== "playing" || repeat) return;
        if (code === "Space") this._fire(this.aim.x, this.aim.y);
      }));
      const toLocal = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (this._w / r.width), y: (e.clientY - r.top) * (this._h / r.height) };
      };
      this._pm = (e) => { if (this.paused || this.state !== "playing") return; const p = toLocal(e); this.aim.x = p.x; this.aim.y = p.y; };
      this._pd = (e) => { if (this.paused || this.state !== "playing") return; e.preventDefault(); const p = toLocal(e); this.aim.x = p.x; this.aim.y = p.y; this._fire(p.x, p.y); };
      canvas.addEventListener("pointermove", this._pm);
      canvas.addEventListener("pointerdown", this._pd);
    }

    _layout(w, h) {
      this.groundY = h - 46;
      const slotW = (w - 56) / 9, sx = i => 28 + slotW * (i + 0.5);
      this.batteries.forEach(b => b.x = sx(b.slot));
      this.cities.forEach(c => c.x = sx(c.slot));
      this.slotW = slotW;
    }

    _nextWave() {
      this.wave++;
      this.batteries.forEach(b => { b.ammo = AMMO; b.alive = true; });
      this.pending = 5 + this.wave * 2;
      this.spawnGap = Math.max(380, 1300 - this.wave * 90);
      this.spawnT = 800;
      this.enemySpeed = ENEMY_BASE + this.wave * 6;
      this._applyTempo();
      if (this.wave > 1) this._toast("WAVE " + this.wave, true);
    }

    _aliveTargets() {
      const t = [];
      for (const c of this.cities) if (c.alive) t.push(c);
      for (const b of this.batteries) if (b.alive) t.push(b);
      return t;
    }

    _spawnEnemy(sx, sy, target) {
      const targets = this._aliveTargets();
      if (!targets.length) return;
      if (sx == null) { sx = rand(20, this._w - 20); sy = 0; }
      if (!target) target = targets[(Math.random() * targets.length) | 0];
      const tx = target.x, ty = this.groundY;
      const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
      const sp = this.enemySpeed;
      const m = { sx: sx, sy: sy, x: sx, y: sy, vx: dx / d * sp, vy: dy / d * sp, splitY: null };
      if (this.wave >= 3 && Math.random() < 0.28) m.splitY = rand(this._h * 0.3, this._h * 0.5);
      this.enemies.push(m);
    }

    _fire(tx, ty) {
      if (ty >= this.groundY - 4) ty = this.groundY - 4;
      let best = null, bd = Infinity;
      for (const b of this.batteries) if (b.alive && b.ammo > 0) { const d = Math.abs(b.x - tx); if (d < bd) { bd = d; best = b; } }
      if (!best) { this.audio.play("pill"); return; }
      best.ammo--;
      const bx = best.x, by = this.groundY - 14;
      const dx = tx - bx, dy = ty - by, d = Math.hypot(dx, dy) || 1;
      this.interceptors.push({ bx: bx, by: by, x: bx, y: by, tx: tx, ty: ty, vx: dx / d * INT_SPEED, vy: dy / d * INT_SPEED });
      this.audio.play("launch");
      // muzzle flash / smoke puff at the launcher
      if (this.theme.effects.particles) {
        this.particles.emit({ x: bx, y: by - 2, count: 10,
          colors: [this.theme.palette.exhaust || this.theme.palette.battery, "#ffffff"],
          speedMin: 30, speedMax: 160, angleMin: -Math.PI * 0.88, angleMax: -Math.PI * 0.12,
          gravity: 120, drag: 1.2, sizeMin: 1.5, sizeMax: 3.4, lifeMin: 0.2, lifeMax: 0.55,
          glow: this.theme.effects.glow, shape: "circle" });
      }
    }

    _blast(x, y, maxR, scoreFactor) {
      this.explosions.push({ x: x, y: y, r: 0, maxR: maxR, phase: "grow" });
      this.audio.play("boom");
      if (this.theme.effects.particles) this.particles.emit({ x: x, y: y, count: Math.round(maxR / 3),
        colors: [this.theme.palette.blast, "#ffffff"], speedMin: 40, speedMax: maxR * 4, gravity: 60, drag: 1,
        sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.3, lifeMax: 0.8, glow: this.theme.effects.glow, shape: "circle" });
      if (this.theme.effects.shake) this._shake(Math.min(8, maxR / 9));
    }

    _destroyStructure(x) {
      let hit = null, hd = this.slotW * 0.55;
      for (const c of this.cities) if (c.alive && Math.abs(c.x - x) < hd) { hit = c; break; }
      if (!hit) for (const b of this.batteries) if (b.alive && Math.abs(b.x - x) < hd) { hit = b; break; }
      if (hit) {
        hit.alive = false;
        this._blast(hit.x, this.groundY - 8, 46);
        if (this.theme.effects.shake) this._shake(9);
        this.flash = 1;
        this._burst(hit.x, this.groundY - 8, this.theme.palette.enemy, 26);
        if (this.cities.every(c => !c.alive)) this._gameOver();
      }
    }

    _burst(x, y, color, count) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: x, y: y, count: count, colors: [color, "#ffffff"], speedMin: 50, speedMax: 320,
        gravity: 120, drag: 1, sizeMin: 1.5, sizeMax: 4, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "square", spin: 6 });
    }

    _shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
    _toast(text, big) { this.toasts.push({ text: text, born: this._now, life: 1400, big: !!big }); if (this.toasts.length > 4) this.toasts.shift(); }
    _gameOver() { if (this.state === "over") return; this.state = "over"; this.audio.stopMusic(); this.shell.requestGameOver({ score: this.score }); }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now;
      const s = dt / 1000;
      if (this.shakeMag > 0) { this.shakeMag -= dt * 0.04; if (this.shakeMag < 0) this.shakeMag = 0; }
      if (this.flash > 0) { this.flash -= dt / 350; if (this.flash < 0) this.flash = 0; }
      this.particles.update(dt);
      for (let i = this.toasts.length - 1; i >= 0; i--) if (now - this.toasts[i].born > this.toasts[i].life) this.toasts.splice(i, 1);
      if (this.state !== "playing") return;

      // keyboard aim
      const I = this.shell.input;
      if (I.isDown("ArrowLeft")) this.aim.x -= AIM_SPEED * s;
      if (I.isDown("ArrowRight")) this.aim.x += AIM_SPEED * s;
      if (I.isDown("ArrowUp")) this.aim.y -= AIM_SPEED * s;
      if (I.isDown("ArrowDown")) this.aim.y += AIM_SPEED * s;
      this.aim.x = Math.max(0, Math.min(this._w, this.aim.x));
      this.aim.y = Math.max(0, Math.min(this.groundY - 4, this.aim.y));

      // spawn enemies
      if (this.pending > 0) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this._spawnEnemy(); this.pending--; this.spawnT = this.spawnGap * rand(0.6, 1.4); }
      }

      // enemies
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const m = this.enemies[i];
        m.x += m.vx * s; m.y += m.vy * s;
        if (m.splitY != null && m.y >= m.splitY) {
          m.splitY = null;
          const n = 1 + ((Math.random() * 2) | 0);
          for (let k = 0; k < n; k++) this._spawnEnemy(m.x, m.y);
        }
        if (m.y >= this.groundY) { this._destroyStructure(m.x); this.enemies.splice(i, 1); }
      }

      // interceptors
      for (let i = this.interceptors.length - 1; i >= 0; i--) {
        const it = this.interceptors[i];
        const dx = it.tx - it.x, dy = it.ty - it.y, d = Math.hypot(dx, dy);
        if (d <= INT_SPEED * s + 3) { this._blast(it.tx, it.ty, BLAST_MAX); this.interceptors.splice(i, 1); }
        else { it.x += it.vx * s; it.y += it.vy * s; }
      }
      // rocket exhaust trail (Warhead skin)
      if (this.theme.exhaust && this.theme.effects.particles) {
        for (const it of this.interceptors) {
          const ang = Math.atan2(it.vy, it.vx);
          this.particles.emit({ x: it.x - Math.cos(ang) * 9, y: it.y - Math.sin(ang) * 9, count: 1,
            colors: [this.theme.palette.exhaust, this.theme.palette.exhaust2, "#9aa0aa"],
            vx: -Math.cos(ang) * 26, vy: -Math.sin(ang) * 26, speedMin: 4, speedMax: 36,
            gravity: -8, drag: 1.6, sizeMin: 1.4, sizeMax: 3.4, lifeMin: 0.25, lifeMax: 0.6,
            glow: this.theme.effects.glow, shape: "circle" });
        }
      }

      // explosions (+ destroy enemies within radius -> chain)
      for (let i = this.explosions.length - 1; i >= 0; i--) {
        const ex = this.explosions[i];
        if (ex.phase === "grow") { ex.r += BLAST_GROW * s; if (ex.r >= ex.maxR) { ex.r = ex.maxR; ex.phase = "shrink"; } }
        else { ex.r -= BLAST_SHRINK * s; }
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const m = this.enemies[j];
          if (Math.hypot(m.x - ex.x, m.y - ex.y) < ex.r) {
            this.enemies.splice(j, 1);
            this.score += 25 * this.wave;
            this._burst(m.x, m.y, this.theme.palette.enemy, 8);
            this._blast(m.x, m.y, CHAIN_MAX); // chain reaction
          }
        }
        if (ex.r <= 0) this.explosions.splice(i, 1);
      }

      // wave clear
      if (this.pending <= 0 && this.enemies.length === 0 && this.interceptors.length === 0 && this.explosions.length === 0) {
        const aliveCities = this.cities.filter(c => c.alive).length;
        const ammoLeft = this.batteries.reduce((a, b) => a + (b.alive ? b.ammo : 0), 0);
        const bonus = aliveCities * 100 + ammoLeft * 5;
        if (bonus > 0) { this.score += bonus; this._toast("+" + bonus + " BONUS", true); }
        this._nextWave();
      }
    }

    // ---------------- render ----------------
    resize(w, h) { this._w = w; this._h = h; this._layout(w, h); this.renderer.w = w; this.renderer.h = h; this.renderer.groundY = this.groundY; }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme;
      R.drawBackground(ctx, th, now, this.groundY);
      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }
      ctx.save(); ctx.translate(sx, sy);
      for (const c of this.cities) R.drawCity(ctx, th, c.x, c.alive);
      for (const b of this.batteries) R.drawBattery(ctx, th, b.x, b.ammo, b.alive);
      for (const m of this.enemies) R.drawEnemy(ctx, th, m);
      for (const it of this.interceptors) R.drawInterceptor(ctx, th, it);
      for (const ex of this.explosions) R.drawExplosion(ctx, th, ex);
      this.particles.render(ctx);
      R.drawCrosshair(ctx, th, this.aim.x, this.aim.y);
      ctx.restore();
      R.drawHUD(ctx, th, { score: this.score, wave: this.wave, cities: this.cities.filter(c => c.alive).length });
      this._renderToasts(ctx, R, th, now);
      if (this.flash > 0) { ctx.save(); ctx.globalAlpha = this.flash * 0.5; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, this._w, this._h); ctx.restore(); }
      R.drawScanlines(ctx, th);
    }

    _renderToasts(ctx, R, th, now) {
      if (!this.toasts.length) return;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < this.toasts.length; i++) {
        const t = this.toasts[i], pr = (now - t.born) / t.life;
        const alpha = pr < 0.15 ? pr / 0.15 : (1 - (pr - 0.15) / 0.85);
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = "800 " + (t.big ? 28 : 18) + "px " + th.fonts.ui;
        if (th.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = th.palette.accent; }
        ctx.fillStyle = th.palette.accent;
        ctx.fillText(t.text, this._w / 2, this._h * 0.28 - pr * 20 + i * 30);
      }
      ctx.restore();
    }
  }

  M.Game = MissileDefense;
})(window.Arcade = window.Arcade || {});
