/* =========================================================
   Asteroids — vector space shooter. Rotate, thrust, fire; blast
   rocks into smaller rocks; clear the wave; dodge the UFO.
   Implements the Arcade GameInstance interface.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const A = Arcade.Asteroids;
  const MK = Arcade.MusicKit;

  // tuning (physics in seconds)
  const ROT = 4.2, THRUST = 330, MAXV = 470, DRAG = 0.35;
  // BULLET_LIFE tripled (0.85 -> 2.55) = 3x range; bullet cap raised so the
  // longer-lived shots don't starve the fire rate.
  const BULLET_V = 560, BULLET_LIFE = 2.55, FIRE_CD = 160, MAX_BULLETS = 16, SHIP_R = 14;
  const INVULN = 2400, RESPAWN = 1000;
  const SIZE_R = { 3: 46, 2: 26, 1: 14 }, SIZE_SCORE = { 3: 20, 2: 50, 1: 100 };
  const UFO_SCORE = { big: 200, small: 1000 };

  // ---- music ----
  const AST_CLASSIC = {
    bpm: 110, volume: 0.16,
    tracks: [
      { wave: "triangle", gain: 0.30, notes: [["E2",1],["C2",1],["E2",1],["C2",1],["E2",1],["C2",1],["E2",1],["C2",1]] },
      { drum: true, gain: 0.32, notes: MK.fourOnFloor(8) }
    ]
  };
  const AST_ARP = [
    ["E4",.5],["G4",.5],["B4",.5],["E5",.5],["B4",.5],["G4",.5],["E4",.5],["G4",.5],
    ["C4",.5],["E4",.5],["G4",.5],["C5",.5],["G4",.5],["E4",.5],["C4",.5],["E4",.5],
    ["G3",.5],["B3",.5],["D4",.5],["G4",.5],["D4",.5],["B3",.5],["G3",.5],["B3",.5],
    ["D4",.5],["F#4",.5],["A4",.5],["D5",.5],["A4",.5],["F#4",.5],["D4",.5],["F#4",.5],
    ["E4",.5],["G4",.5],["B4",.5],["E5",.5],["B4",.5],["G4",.5],["E4",.5],["G4",.5],
    ["C4",.5],["E4",.5],["G4",.5],["C5",.5],["G4",.5],["E4",.5],["C4",.5],["E4",.5],
    ["G3",.5],["B3",.5],["D4",.5],["G4",.5],["D4",.5],["B3",.5],["G3",.5],["B3",.5],
    ["D4",.5],["F#4",.5],["A4",.5],["D5",.5],["A4",.5],["F#4",.5],["D4",.5],["F#4",.5]
  ];
  const AST_TECHNO = {
    bpm: 150, volume: 0.16,
    tracks: [
      { wave: "sawtooth", gain: 0.12, notes: AST_ARP },
      { wave: "square", gain: 0.13, notes: MK.eighthBass(["E2","C2","G2","D2","E2","C2","G2","D2"]) },
      { drum: true, gain: 0.36, notes: MK.fourOnFloor(32) },
      { drum: true, gain: 0.09, notes: MK.eighthHats(32) },
      { drum: true, gain: 0.20, notes: MK.backbeat(8) }
    ]
  };
  const SONGS = [
    { id: "classic", name: "Heartbeat", song: AST_CLASSIC },
    { id: "techno", name: "Techno Remix", song: AST_TECHNO }
  ];
  A.SONGS = SONGS;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function shape() { const n = 10, out = []; for (let i = 0; i < n; i++) out.push({ a: (i / n) * Math.PI * 2, r: rand(0.72, 1.18) }); return out; }

  class Asteroids {
    constructor(ctx) {
      this.shell = ctx; this.ctx2d = ctx.ctx; this.particles = ctx.particles; this.audio = ctx.audio;
      this.renderer = new A.Renderer();
      this.theme = A.getTheme(ctx.storage.get("asteroids:theme", "modern"));
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("asteroids:song", 0) | 0));
      this._unsub = []; this.paused = false; this.state = "playing"; this._now = 0;
      this._w = 800; this._h = 600;
      // On touch, relabel the shared control bar for this game (hide unused).
      this.touchLabels = { left: "◀", right: "▶", cw: "THRUST", ccw: "WARP", hard: "FIRE", hold: "", soft: "" };
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      this.score = 0; this.lives = 3; this.wave = 0; this.nextExtra = 10000;
      this.bullets = []; this.enemyBullets = []; this.asteroids = []; this.ufo = null;
      this.fireCd = 0; this.respawnT = 0; this.shakeMag = 0; this.toasts = [];
      this.ufoTimer = rand(12000, 22000);
      this.particles.clear();
      this._spawnShip(true);
      this.state = "playing"; this.paused = false;
      this._nextWave();
      this._applyMusic();
    }

    pause() { this.paused = true; this.audio.suspendMusic(); }
    resume() { this.paused = false; this.audio.resumeMusic(); this._applyTempo(); }
    destroy() { this.audio.stopMusic(); this._unsub.forEach(fn => fn()); this._unsub.length = 0; }

    cycleTheme() {
      const list = A.Themes; this.theme = list[(list.indexOf(this.theme) + 1) % list.length];
      this.shell.storage.set("asteroids:theme", this.theme.id);
      if (!this.theme.effects.particles) this.particles.clear();
      return this.theme.name;
    }
    _applyMusic() { this.audio.playMusic(SONGS[this.songIdx].song); this._applyTempo(); }
    _applyTempo() { const base = SONGS[this.songIdx].song.bpm; this.audio.setMusicTempo(Math.round(base * Math.min(2.1, 1 + (this.wave - 1) * 0.08))); }
    cycleMusic() {
      this.songIdx = (this.songIdx + 1) % SONGS.length;
      this.shell.storage.set("asteroids:song", this.songIdx);
      this._applyMusic();
      const name = SONGS[this.songIdx].name; this._toast("♪ " + name); return name;
    }

    _bindInput() {
      const input = this.shell.input;
      this._unsub.push(input.onDown((code, e, repeat) => {
        if (this.paused || this.state !== "playing" || repeat) return;
        if (code === "KeyZ" || code === "ShiftLeft" || code === "ShiftRight") this._hyperspace();
      }));
    }

    _spawnShip(center) {
      this.ship = { x: this._w / 2, y: this._h / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
        thrusting: false, alive: true, radius: SHIP_R, invuln: center ? 1500 : INVULN };
    }
    _respawnShip() {
      this.ship.x = this._w / 2; this.ship.y = this._h / 2; this.ship.vx = 0; this.ship.vy = 0;
      this.ship.angle = -Math.PI / 2; this.ship.alive = true; this.ship.invuln = INVULN; this.ship.thrusting = false;
    }

    _nextWave() {
      this.wave++;
      const count = Math.min(11, 3 + this.wave);
      for (let i = 0; i < count; i++) this._spawnAsteroid(3);
      this._applyTempo();
      if (this.wave > 1) this._toast("WAVE " + this.wave, true);
    }

    _spawnAsteroid(size, x, y) {
      if (x == null) {
        // spawn away from the ship; cap tries so a tiny canvas can't hang it
        const safe = Math.min(170, Math.hypot(this._w, this._h) * 0.4);
        let tries = 0;
        do { x = rand(0, this._w); y = rand(0, this._h); }
        while (this.ship && Math.hypot(x - this.ship.x, y - this.ship.y) < safe && ++tries < 40);
      }
      const sp = rand(30, 60) + (3 - size) * 30 + this.wave * 3;
      const dir = rand(0, Math.PI * 2);
      this.asteroids.push({ x: x, y: y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
        radius: SIZE_R[size], size: size, shape: shape(), angle: rand(0, Math.PI * 2), spin: rand(-1.4, 1.4) });
    }

    _fire() {
      if (this.bullets.length >= MAX_BULLETS) return;
      const s = this.ship, nx = s.x + Math.cos(s.angle) * s.radius, ny = s.y + Math.sin(s.angle) * s.radius;
      this.bullets.push({ x: nx, y: ny, vx: s.vx + Math.cos(s.angle) * BULLET_V, vy: s.vy + Math.sin(s.angle) * BULLET_V, life: BULLET_LIFE });
      this.audio.play("shoot");
    }

    _hyperspace() {
      if (!this.ship.alive) return;
      this.ship.x = rand(40, this._w - 40); this.ship.y = rand(40, this._h - 40);
      this.ship.vx = 0; this.ship.vy = 0; this.ship.invuln = 1200;
      this.audio.play("hold");
      if (this.theme.effects.particles) this._burst(this.ship.x, this.ship.y, this.theme.palette.ship, 16);
    }

    _hyperToast() {}

    _wrap(o) {
      if (o.x < 0) o.x += this._w; else if (o.x > this._w) o.x -= this._w;
      if (o.y < 0) o.y += this._h; else if (o.y > this._h) o.y -= this._h;
    }

    _burst(x, y, color, count, speed) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: x, y: y, count: count, colors: [color, "#ffffff"],
        speedMin: 40, speedMax: speed || 240, gravity: 0, drag: 0.8,
        sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "square", spin: 6 });
    }

    _explodeAsteroid(a) {
      this.audio.play("boom");
      this._burst(a.x, a.y, this.theme.palette.asteroid, 8 + a.size * 6, 120 + a.size * 60);
      if (this.theme.effects.shake) this._shake(2 + a.size * 1.6);
      this.score += SIZE_SCORE[a.size];
      this._checkExtra();
      if (a.size > 1) { this._spawnAsteroid(a.size - 1, a.x, a.y); this._spawnAsteroid(a.size - 1, a.x, a.y); }
    }

    _checkExtra() {
      if (this.score >= this.nextExtra) { this.lives++; this.nextExtra += 10000; this.audio.play("extralife"); this._toast("EXTRA SHIP!", true); }
    }

    _killShip() {
      if (!this.ship.alive || this.ship.invuln > 0) return;
      this.ship.alive = false;
      this.audio.play("boom");
      this._burst(this.ship.x, this.ship.y, this.theme.palette.ship, 26, 260);
      if (this.theme.effects.shake) this._shake(9);
      this.lives--;
      if (this.lives < 0) { this.lives = 0; this._gameOver(); }
      else this.respawnT = RESPAWN;
    }

    _gameOver() { if (this.state === "over") return; this.state = "over"; this.audio.stopMusic(); this.shell.requestGameOver({ score: this.score }); }

    _spawnUfo() {
      const small = Math.random() < 0.35 && this.wave >= 3;
      const fromLeft = Math.random() < 0.5;
      this.ufo = { x: fromLeft ? -20 : this._w + 20, y: rand(this._h * 0.15, this._h * 0.85),
        vx: (fromLeft ? 1 : -1) * rand(90, 140), vy: 0, radius: small ? 12 : 18, small: small,
        fireCd: 1200, zig: 0 };
      this.audio.play("ufo");
    }

    _ufoFire() {
      const u = this.ufo, s = this.ship;
      let ang;
      if (u.small) { ang = Math.atan2(s.y - u.y, s.x - u.x) + rand(-0.12, 0.12); }
      else { ang = rand(0, Math.PI * 2); }
      this.enemyBullets.push({ x: u.x, y: u.y, vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300, life: 1.4 });
      this.audio.play("shoot");
    }

    _shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
    _toast(text, big) { this.toasts.push({ text: text, born: this._now, life: 1300, big: !!big }); if (this.toasts.length > 4) this.toasts.shift(); }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now;
      const s = dt / 1000;
      if (this.shakeMag > 0) { this.shakeMag -= dt * 0.04; if (this.shakeMag < 0) this.shakeMag = 0; }
      this.particles.update(dt);
      for (let i = this.toasts.length - 1; i >= 0; i--) if (now - this.toasts[i].born > this.toasts[i].life) this.toasts.splice(i, 1);
      if (this.state !== "playing") return;

      const I = this.shell.input, ship = this.ship;
      if (ship.invuln > 0) ship.invuln -= dt;

      if (ship.alive) {
        if (I.isDown("ArrowLeft")) ship.angle -= ROT * s;
        if (I.isDown("ArrowRight")) ship.angle += ROT * s;
        ship.thrusting = I.isDown("ArrowUp");
        if (ship.thrusting) {
          ship.vx += Math.cos(ship.angle) * THRUST * s; ship.vy += Math.sin(ship.angle) * THRUST * s;
          if (this.theme.effects.particles && Math.random() < 0.7) {
            const bx = ship.x - Math.cos(ship.angle) * ship.radius, by = ship.y - Math.sin(ship.angle) * ship.radius;
            this.particles.emit({ x: bx, y: by, count: 1, colors: [this.theme.palette.thrust, "#ffffff"],
              vx: -Math.cos(ship.angle) * 80, vy: -Math.sin(ship.angle) * 80, speedMin: 10, speedMax: 60,
              sizeMin: 1.5, sizeMax: 3, lifeMin: 0.2, lifeMax: 0.5, glow: this.theme.effects.glow, shape: "square" });
          }
        }
        const sp = Math.hypot(ship.vx, ship.vy);
        if (sp > MAXV) { ship.vx *= MAXV / sp; ship.vy *= MAXV / sp; }
        ship.vx *= (1 - DRAG * s); ship.vy *= (1 - DRAG * s);
        ship.x += ship.vx * s; ship.y += ship.vy * s; this._wrap(ship);
        this.fireCd -= dt;
        if (I.isDown("Space") && this.fireCd <= 0) { this._fire(); this.fireCd = FIRE_CD; }
      } else {
        this.respawnT -= dt;
        if (this.respawnT <= 0) this._respawnShip();
      }

      // bullets
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i]; b.x += b.vx * s; b.y += b.vy * s; b.life -= s; this._wrap(b);
        if (b.life <= 0) this.bullets.splice(i, 1);
      }
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        const b = this.enemyBullets[i]; b.x += b.vx * s; b.y += b.vy * s; b.life -= s; this._wrap(b);
        if (b.life <= 0) this.enemyBullets.splice(i, 1);
      }
      // asteroids
      for (const a of this.asteroids) { a.x += a.vx * s; a.y += a.vy * s; a.angle += a.spin * s; this._wrap(a); }
      // ufo
      this.ufoTimer -= dt;
      if (!this.ufo && this.ufoTimer <= 0 && this.asteroids.length > 0 && this.wave >= 2) { this._spawnUfo(); this.ufoTimer = rand(16000, 28000); }
      if (this.ufo) {
        const u = this.ufo; u.zig += s; u.x += u.vx * s; u.y += Math.sin(u.zig * 2.2) * 40 * s;
        u.fireCd -= dt; if (u.fireCd <= 0 && ship.alive) { this._ufoFire(); u.fireCd = u.small ? 900 : 1400; }
        if (u.x < -40 || u.x > this._w + 40) this.ufo = null;
      }

      this._collisions();

      if (this.asteroids.length === 0 && !this.ufo) this._nextWave();
    }

    _collisions() {
      const ast = this.asteroids;
      // bullets vs asteroids
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        for (let j = ast.length - 1; j >= 0; j--) {
          const a = ast[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius) {
            this.bullets.splice(i, 1); ast.splice(j, 1); this._explodeAsteroid(a); break;
          }
        }
      }
      // bullets vs ufo
      if (this.ufo) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
          const b = this.bullets[i];
          if (Math.hypot(this.ufo.x - b.x, this.ufo.y - b.y) < this.ufo.radius + 3) {
            this.bullets.splice(i, 1);
            this.score += this.ufo.small ? UFO_SCORE.small : UFO_SCORE.big; this._checkExtra();
            this.audio.play("boom"); this._burst(this.ufo.x, this.ufo.y, this.theme.palette.ufo, 24, 280);
            if (this.theme.effects.shake) this._shake(6);
            this._toast("+" + (this.ufo.small ? UFO_SCORE.small : UFO_SCORE.big));
            this.ufo = null; break;
          }
        }
      }
      if (!this.ship.alive || this.ship.invuln > 0) return;
      const ship = this.ship;
      for (let j = ast.length - 1; j >= 0; j--) {
        const a = ast[j];
        if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.radius + ship.radius * 0.7) { this._killShip(); return; }
      }
      if (this.ufo && Math.hypot(this.ufo.x - ship.x, this.ufo.y - ship.y) < this.ufo.radius + ship.radius * 0.7) { this._killShip(); return; }
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        const b = this.enemyBullets[i];
        if (Math.hypot(b.x - ship.x, b.y - ship.y) < ship.radius * 0.8) { this.enemyBullets.splice(i, 1); this._killShip(); return; }
      }
    }

    // ---------------- render ----------------
    // Keep the play/wrap field above the touch-control bar (inset); the
    // renderer still fills the full canvas for the background/starfield.
    resize(w, h, inset) { this._w = w; this._h = Math.max(120, h - (inset || 0)); this.renderer.resize(w, h); }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme;
      R.drawBackground(ctx, th, now);
      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }
      ctx.save(); ctx.translate(sx, sy);
      for (const a of this.asteroids) R.drawAsteroid(ctx, a, th);
      for (const b of this.bullets) R.drawBullet(ctx, b, th);
      for (const b of this.enemyBullets) R.drawBullet(ctx, b, th);
      if (this.ufo) R.drawUfo(ctx, this.ufo, th);
      if (this.ship.alive) R.drawShip(ctx, this.ship, th, now, this.ship.invuln > 0 && (Math.floor(now / 120) % 2 === 0));
      this.particles.render(ctx);
      ctx.restore();
      R.drawHUD(ctx, th, { score: this.score, lives: this.lives, wave: this.wave });
      this._renderToasts(ctx, R, th, now);
      R.drawScanlines(ctx, th);
    }

    _renderToasts(ctx, R, th, now) {
      if (!this.toasts.length) return;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < this.toasts.length; i++) {
        const t = this.toasts[i], pr = (now - t.born) / t.life;
        const alpha = pr < 0.15 ? pr / 0.15 : (1 - (pr - 0.15) / 0.85);
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = "800 " + (t.big ? 30 : 18) + "px " + th.fonts.ui;
        if (th.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = th.palette.accent; }
        ctx.fillStyle = th.palette.accent;
        ctx.fillText(t.text, this._w / 2, this._h * 0.3 - pr * 20 + i * 30);
      }
      ctx.restore();
    }
  }

  A.Game = Asteroids;
})(window.Arcade = window.Arcade || {});
