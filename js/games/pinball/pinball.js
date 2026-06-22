/* =========================================================
   Space Pinball — an original space-cadet-style pinball table with
   real ball physics: flippers, pop bumpers, slingshots, a plunger,
   multiball, lives, and synthesized SFX. Implements GameInstance.
   (Original homage — not the copyrighted Microsoft table/assets.)
   ========================================================= */
(function (Arcade) {
  "use strict";

  const P = Arcade.Pinball;
  const MK = Arcade.MusicKit;

  const PW = 420, PH = 680;                 // logical playfield
  const G = 980, REST = 0.5, BALL_R = 9, MAXV = 1300;
  const BUMP_KICK = 350, SLING_KICK = 320, FLIP_BOOST = 560, FLIP_ANG = 26;
  // launch must clear ~600px up the lane to reach the top arch and feed into play
  const PLUNGE_MIN = 1080, PLUNGE_MAX = 1260, DRAIN_Y = 652, MAX_BALLS = 5;

  // ---- music (original) ----
  const PIN_ARP = [
    ["A4",.5],["E5",.5],["A5",.5],["C6",.5],["A5",.5],["E5",.5],["A4",.5],["E5",.5],
    ["F4",.5],["C5",.5],["F5",.5],["A5",.5],["F5",.5],["C5",.5],["F4",.5],["C5",.5],
    ["G4",.5],["D5",.5],["G5",.5],["B5",.5],["G5",.5],["D5",.5],["G4",.5],["D5",.5],
    ["E4",.5],["B4",.5],["E5",.5],["G5",.5],["E5",.5],["B4",.5],["E4",.5],["B4",.5],
    ["A4",.5],["E5",.5],["A5",.5],["C6",.5],["A5",.5],["E5",.5],["A4",.5],["E5",.5],
    ["F4",.5],["C5",.5],["F5",.5],["A5",.5],["F5",.5],["C5",.5],["F4",.5],["C5",.5],
    ["G4",.5],["D5",.5],["G5",.5],["B5",.5],["G5",.5],["D5",.5],["G4",.5],["D5",.5],
    ["E4",.5],["B4",.5],["E5",.5],["G5",.5],["E5",.5],["B4",.5],["E4",.5],["B4",.5]
  ];
  const PIN_ROOTS = ["A2","F2","G2","E2","A2","F2","G2","E2"];
  const SONG_DRIFT = {
    bpm: 128, volume: 0.15,
    tracks: [
      { wave: "triangle", gain: 0.16, notes: PIN_ARP },
      { wave: "square", gain: 0.10, notes: MK.quarterBass(PIN_ROOTS) }
    ]
  };
  const SONG_TECHNO = {
    bpm: 138, volume: 0.16,
    tracks: [
      { wave: "sawtooth", gain: 0.12, notes: PIN_ARP },
      { wave: "square", gain: 0.13, notes: MK.eighthBass(PIN_ROOTS) },
      { drum: true, gain: 0.34, notes: MK.fourOnFloor(32) },
      { drum: true, gain: 0.09, notes: MK.eighthHats(32) },
      { drum: true, gain: 0.20, notes: MK.backbeat(8) }
    ]
  };
  const SONGS = [{ id: "drift", name: "Space Drift", song: SONG_DRIFT }, { id: "techno", name: "Techno Remix", song: SONG_TECHNO }];
  P.SONGS = SONGS;

  // ---- mission / rank progression (original "space cadet" spirit) ----
  // Drop the target bank to launch a mission; complete the objective before time runs out to rank up,
  // bump the playfield multiplier, and trigger multiball.
  const MISSIONS = [
    { name: "CORE BREACH", type: "reactor", goal: 5, time: 26 },
    { name: "ION STORM", type: "bumper", goal: 24, time: 30 },
    { name: "WORMHOLE RUN", type: "reactor", goal: 7, time: 30 },
    { name: "SUPERNOVA", type: "bumper", goal: 34, time: 34 }
  ];
  const RANKS = ["CADET", "ENSIGN", "LIEUTENANT", "CAPTAIN", "COMMANDER", "ADMIRAL", "FLEET ADMIRAL"];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function seg(x1, y1, x2, y2, thick) { return { x1: x1, y1: y1, x2: x2, y2: y2, thick: thick || 2 }; }

  class Pinball {
    constructor(ctx) {
      this.shell = ctx; this.ctx2d = ctx.ctx; this.particles = ctx.particles; this.audio = ctx.audio;
      this.renderer = new P.Renderer();
      this.theme = P.getTheme(ctx.storage.get("pinball:theme", "modern"));
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("pinball:song", 0) | 0));
      this.songIdxDefault = this.songIdx;
      this.touchLayout = "flippers";   // spread the flipper buttons to the far left/right (thumbs), LAUNCH in the middle
      this.touchLabels = { left: "◀ FLIP", right: "FLIP ▶", hard: "LAUNCH", cw: "", ccw: "", soft: "", hold: "" };
      this.dev = false;
      this._unsub = []; this.paused = false; this.state = "playing"; this._now = 0;
      this._w = 800; this._h = 600;
      this._buildTable();
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    _buildTable() {
      const W = [];
      W.push(seg(30, 90, 30, 500));            // left wall
      W.push(seg(30, 90, 98, 36));             // top-left chamfer
      W.push(seg(98, 36, 300, 36));            // top
      W.push(seg(300, 36, 338, 46));           // top-right chamfer -> meets the deflector
      W.push(seg(338, 46, 394, 95));           // lane-top deflector ("\"): throws the rising ball LEFT over the top
      W.push(seg(352, 140, 352, 500));         // right play wall (top open above y140 so the ball enters over the top)
      W.push(seg(30, 500, 122, 628));          // left lower funnel
      W.push(seg(352, 500, 298, 628));         // right lower funnel
      W.push(seg(368, 140, 368, 662));         // lane left wall
      W.push(seg(394, 60, 394, 662));          // lane right wall (table edge)
      this.walls = W;
      this.slings = [
        { x1: 104, y1: 548, x2: 150, y2: 604, hit: 0 },   // left slingshot
        { x1: 316, y1: 548, x2: 270, y2: 604, hit: 0 }    // right slingshot
      ];
      this.bumpers = [
        { x: 128, y: 198, r: 18, hit: 0 },
        { x: 252, y: 182, r: 18, hit: 0 },
        { x: 192, y: 272, r: 18, hit: 0 },
        { x: 84, y: 252, r: 15, hit: 0 },    // extra pop bumpers for more chaos
        { x: 300, y: 238, r: 15, hit: 0 },
        { x: 60, y: 170, r: 11, hit: 0 },    // small upper "post" kickers
        { x: 322, y: 158, r: 11, hit: 0 }
      ];
      this.flippers = [   // pivots spread wide; inner tips leave a ~40px center DRAIN gap (≈2 ball widths)
        { px: 122, py: 600, len: 78, thick: 8, rest: 0.46, active: -0.50, angle: 0.46, prev: 0.46, angVel: 0, pressed: false },
        { px: 302, py: 600, len: 78, thick: 8, rest: Math.PI - 0.46, active: Math.PI + 0.50, angle: Math.PI - 0.46, prev: Math.PI - 0.46, angVel: 0, pressed: false }
      ];
      // a bank of drop targets (classic scoring feature)
      this.targets = [];
      for (let i = 0; i < 6; i++) this.targets.push({ x: 66 + i * 26, y1: 118, y2: 142, down: false, hit: 0 });
      this.reactor = { x: 191, y: 408, r: 25, lit: 0 };   // glowing central core — the mission objective + a big bumper
      this.plungerX = 381;
    }

    _reset() {
      this.score = 0; this.lives = 3; this.bumperHits = 0;
      this.rank = 0; this.mult = 1; this.mission = null; this.missionIdx = 0; this.reactor.lit = 0;
      this.balls = []; this.charging = false; this.plunge = 0;
      this.flippers.forEach(f => { f.pressed = false; f.angle = f.rest; });
      this.msg = ""; this.msgT = 0; this.shakeMag = 0;
      this.targets.forEach(t => { t.down = false; t.hit = 0; });
      this.particles.clear();
      this.state = "playing"; this.paused = false;
      this._spawnLaunchBall();
      this._applyMusic();
    }

    _spawnLaunchBall() { this.balls.push({ x: this.plungerX, y: 628, vx: 0, vy: 0, r: BALL_R, mode: "launch", trail: [] }); this.charging = false; this.plunge = 0; }
    _spawnBall(x, y, vx, vy) { if (this.balls.length < MAX_BALLS) this.balls.push({ x: x, y: y, vx: vx, vy: vy, r: BALL_R, mode: "play", trail: [] }); }

    pause() { this.paused = true; this.flippers.forEach(f => f.pressed = false); this.charging = false; this.audio.suspendMusic(); }
    resume() { this.paused = false; this.audio.resumeMusic(); }
    destroy() { this.audio.stopMusic(); this._unsub.forEach(fn => fn()); this._unsub.length = 0; }

    cycleTheme() {
      const list = P.Themes; this.theme = list[(list.indexOf(this.theme) + 1) % list.length];
      this.shell.storage.set("pinball:theme", this.theme.id);
      if (!this.theme.effects.particles) this.particles.clear();
      return this.theme.name;
    }
    _applyMusic() { this.audio.playMusic(SONGS[this.songIdx].song); }
    cycleMusic() {
      this.songIdx = (this.songIdx + 1) % SONGS.length;
      this.shell.storage.set("pinball:song", this.songIdx);
      this._applyMusic(); const name = SONGS[this.songIdx].name; this._flash(name); return name;
    }
    toggleDev() { this.dev = !this.dev; this._flash(this.dev ? "DEV: no drain" : "DEV OFF"); return this.dev; }

    _bindInput() {
      const input = this.shell.input;
      this._unsub.push(input.onDown((code, e, repeat) => {
        if (this.paused || this.state !== "playing") return;
        if (code === "ArrowLeft" || code === "KeyZ") this.flippers[0].pressed = true;
        else if (code === "ArrowRight" || code === "Slash" || code === "KeyM" || code === "Period") this.flippers[1].pressed = true;
        else if ((code === "Space" || code === "ArrowDown") && !repeat) this.charging = true;
      }));
      this._unsub.push(input.onUp((code) => {
        if (code === "ArrowLeft" || code === "KeyZ") this.flippers[0].pressed = false;
        else if (code === "ArrowRight" || code === "Slash" || code === "KeyM" || code === "Period") this.flippers[1].pressed = false;
        else if (code === "Space" || code === "ArrowDown") this._launch();
      }));
    }

    _launch() {
      if (!this.charging) return;
      const power = PLUNGE_MIN + (PLUNGE_MAX - PLUNGE_MIN) * this.plunge;
      let launched = false;
      for (const b of this.balls) if (b.mode === "launch") { b.vy = -power; b.vx = rand(-10, 10); b.mode = "play"; launched = true; }
      this.charging = false; this.plunge = 0;
      if (launched) this.audio.play("plunger");
    }

    _flash(msg) { this.msg = msg; this.msgT = 1600; }
    _shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
    _gameOver() { if (this.state === "over") return; this.state = "over"; this.audio.stopMusic(); this.shell.requestGameOver({ score: this.score }); }

    _burst(x, y, color, count) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: x, y: y, count: count, colors: [color, "#ffffff"], speedMin: 30, speedMax: 220,
        gravity: 120, drag: 1, sizeMin: 1.2, sizeMax: 3, lifeMin: 0.25, lifeMax: 0.7, glow: this.theme.effects.glow, shape: "circle", spin: 5 });
    }

    // reflect ball off a segment; returns hit info or null
    _collideSeg(b, x1, y1, x2, y2, thick, e) {
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
      let t = ((b.x - x1) * dx + (b.y - y1) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const cx = x1 + t * dx, cy = y1 + t * dy;
      let nx = b.x - cx, ny = b.y - cy, d = Math.hypot(nx, ny);
      const minD = b.r + thick;
      if (d >= minD) return null;
      if (d < 0.0001) { nx = -dy; ny = dx; d = Math.hypot(nx, ny) || 1; }
      nx /= d; ny /= d;
      b.x = cx + nx * minD; b.y = cy + ny * minD;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
      return { nx: nx, ny: ny, t: t };
    }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now;
      if (this.shakeMag > 0) { this.shakeMag -= dt * 0.05; if (this.shakeMag < 0) this.shakeMag = 0; }
      this.particles.update(dt);
      if (this.msgT > 0) this.msgT -= dt;
      for (const b of this.bumpers) if (b.hit > 0) b.hit -= dt / 1000;
      for (const s of this.slings) if (s.hit > 0) s.hit -= dt / 1000;
      for (const t of this.targets) if (t.hit > 0) t.hit -= dt / 1000;
      if (this.reactor.lit > 0) this.reactor.lit -= dt / 1000;
      if (this.mission) { this.mission.t -= dt / 1000; if (this.mission.t <= 0) { this.mission = null; this._flash("MISSION FAILED"); } }
      if (this.state !== "playing") return;

      // flippers
      for (const f of this.flippers) {
        f.prev = f.angle;
        const target = f.pressed ? f.active : f.rest;
        const max = FLIP_ANG * (dt / 1000);
        if (Math.abs(target - f.angle) <= max) f.angle = target;
        else f.angle += Math.sign(target - f.angle) * max;
        f.angVel = (f.angle - f.prev) / (dt / 1000);
        f.moving = Math.abs(f.angVel) > 1.5;
      }

      // plunger charge
      if (this.charging) { this.plunge = Math.min(1, this.plunge + dt / 700); }

      // physics substeps
      const steps = Math.max(1, Math.min(8, Math.round(dt / 4)));
      const sdt = (dt / steps) / 1000;
      for (let st = 0; st < steps; st++) this._physics(sdt);

      // trails
      if (this.theme.effects.trail) for (const b of this.balls) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.shift(); }

      // drained balls (dev mode bounces them back instead of losing them)
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        if (b.y > DRAIN_Y) { if (this.dev) { b.y = DRAIN_Y - 4; b.vy = -Math.abs(b.vy) - 180; } else this.balls.splice(i, 1); }
      }
      if (this.balls.length === 0) {
        this.lives--; this.audio.play("drain");
        if (this.lives < 0) { this.lives = 0; this._gameOver(); }
        else { this._spawnLaunchBall(); this._flash("BALL " + (3 - this.lives)); }
      }
    }

    _physics(dt) {
      for (const b of this.balls) {
        if (b.mode === "launch") {
          // sit in the lane until launched (gravity keeps it seated at the bottom)
          b.vy += G * dt; b.y += b.vy * dt;
          if (b.y > 628) { b.y = 628; b.vy = 0; }
          // keep in lane horizontally
          if (b.x < 372) b.x = 372; if (b.x > 392) b.x = 392;
          continue;
        }
        b.vy += G * dt;
        let sp = Math.hypot(b.vx, b.vy); if (sp > MAXV) { b.vx *= MAXV / sp; b.vy *= MAXV / sp; }
        b.x += b.vx * dt; b.y += b.vy * dt;

        for (const w of this.walls) this._collideSeg(b, w.x1, w.y1, w.x2, w.y2, w.thick, REST);

        for (const t of this.targets) {
          if (t.down) continue;
          if (this._collideSeg(b, t.x, t.y1, t.x, t.y2, 4, 0.4)) {
            t.down = true; t.hit = 0.2; this.score += 250 * this.mult; this.audio.play("bump");
            this._burst(t.x, (t.y1 + t.y2) / 2, this.theme.palette.accent, 8);
            if (this.targets.every(q => q.down)) {
              this.score += 2000 * this.mult; this.targets.forEach(q => q.down = false);
              if (!this.mission) this._startMission(); else this._flash("TARGET BANK +" + (2000 * this.mult));
            }
          }
        }

        for (const s of this.slings) {
          const hit = this._collideSeg(b, s.x1, s.y1, s.x2, s.y2, 4, 0.4);
          if (hit) {
            const out = b.vx * hit.nx + b.vy * hit.ny;
            if (out < SLING_KICK) { b.vx += hit.nx * (SLING_KICK - out); b.vy += hit.ny * (SLING_KICK - out); }
            s.hit = 0.12; this.score += 25 * this.mult; this.audio.play("flip"); this._burst(b.x, b.y, this.theme.palette.sling, 5);
          }
        }

        for (const bm of this.bumpers) {
          let nx = b.x - bm.x, ny = b.y - bm.y, d = Math.hypot(nx, ny);
          if (d < b.r + bm.r) {
            if (d < 0.0001) { nx = 0; ny = -1; d = 1; }
            nx /= d; ny /= d; b.x = bm.x + nx * (b.r + bm.r); b.y = bm.y + ny * (b.r + bm.r);
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
            const out = b.vx * nx + b.vy * ny;
            if (out < BUMP_KICK) { b.vx += nx * (BUMP_KICK - out); b.vy += ny * (BUMP_KICK - out); }
            bm.hit = 0.12; this.score += 100 * this.mult; this.bumperHits++;
            this.audio.play("bump"); this._burst(bm.x, bm.y, this.theme.palette.bumperHit, 9);
            if (this.theme.effects.shake) this._shake(2);
            this._missionProgress("bumper");
            if (this.bumperHits % 24 === 0) this._multiball();
          }
        }

        // central reactor — a big bumper + the main mission objective
        { const rc = this.reactor; let nx = b.x - rc.x, ny = b.y - rc.y, d = Math.hypot(nx, ny);
          if (d < b.r + rc.r) {
            if (d < 0.0001) { nx = 0; ny = -1; d = 1; }
            nx /= d; ny /= d; b.x = rc.x + nx * (b.r + rc.r); b.y = rc.y + ny * (b.r + rc.r);
            const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
            const out = b.vx * nx + b.vy * ny; if (out < BUMP_KICK) { b.vx += nx * (BUMP_KICK - out); b.vy += ny * (BUMP_KICK - out); }
            rc.lit = 0.5; this.score += 500 * this.mult; this.audio.play("bump"); this._burst(rc.x, rc.y, this.theme.palette.accent, 12);
            if (this.theme.effects.shake) this._shake(3); this._missionProgress("reactor");
          }
        }

        for (const f of this.flippers) {
          const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
          const hit = this._collideSeg(b, f.px, f.py, tx, ty, f.thick, 0.4);
          if (hit) {
            // impart the flipper's surface velocity at the contact point (v = ω × r) — the tip launches hardest
            const rx = b.x - f.px, ry = b.y - f.py;
            const svx = -f.angVel * ry, svy = f.angVel * rx;
            const along = svx * hit.nx + svy * hit.ny;
            if (along > 0) { b.vx += hit.nx * along; b.vy += hit.ny * along; }
            if (f.pressed && f.moving) { const out = b.vx * hit.nx + b.vy * hit.ny; if (out < FLIP_BOOST) { b.vx += hit.nx * (FLIP_BOOST - out); b.vy += hit.ny * (FLIP_BOOST - out); } }
          }
        }
      }
    }

    _multiball() {
      let added = 0;
      for (let k = 0; k < 2 && this.balls.length < MAX_BALLS; k++) { this._spawnBall(rand(120, 280), rand(150, 260), rand(-120, 120), rand(-60, 60)); added++; }
      if (added) { this._flash("MULTIBALL!"); this.audio.play("win"); if (this.theme.effects.shake) this._shake(5); }
    }

    _startMission() {
      const m = MISSIONS[this.missionIdx % MISSIONS.length]; this.missionIdx++;
      this.mission = { name: m.name, type: m.type, goal: m.goal, prog: 0, t: m.time, tMax: m.time };
      this._flash("MISSION: " + m.name); this.audio.play("extralife");
    }
    _missionProgress(type) {
      if (!this.mission || this.mission.type !== type) return;
      this.mission.prog++;
      if (this.mission.prog >= this.mission.goal) this._completeMission();
    }
    _completeMission() {
      this.score += 5000 * this.mult;
      if (this.rank < RANKS.length - 1) this.rank++;
      this.mult = Math.min(6, this.mult + 1);
      this.mission = null;
      this._flash("MISSION COMPLETE!  " + RANKS[this.rank]);
      this.audio.play("win"); if (this.theme.effects.shake) this._shake(7);
      this._multiball();
    }

    // ---------------- render ----------------
    resize(w, h, inset) {
      this._w = w; this._h = h - (inset || 0);
      this.renderer.resize(w, h);
      this.scale = Math.min((w - 16) / PW, (this._h - 16) / PH);
      this.ox = (w - PW * this.scale) / 2;
      this.oy = (this._h - PH * this.scale) / 2;
    }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme;
      R.drawBackground(ctx, th, now);
      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }
      ctx.save();
      ctx.translate(this.ox + sx, this.oy + sy); ctx.scale(this.scale, this.scale);
      R.drawPlayfield(ctx, th, PW, PH);
      for (const w of this.walls) R.drawWall(ctx, th, w);
      for (const t of this.targets) R.drawTarget(ctx, th, t);
      for (const s of this.slings) R.drawSling(ctx, th, s, now);
      for (const bm of this.bumpers) R.drawBumper(ctx, th, bm);
      R.drawReactor(ctx, th, this.reactor, now);
      for (const f of this.flippers) R.drawFlipper(ctx, th, f);
      R.drawPlunger(ctx, th, this.plungerX, 642, this.charging ? this.plunge : 0);
      this.particles.render(ctx);
      for (const b of this.balls) R.drawBall(ctx, th, b, b.trail);
      ctx.restore();
      R.drawHUD(ctx, th, { score: this.score, balls: this.lives, multiball: this.balls.length > 1, rank: RANKS[this.rank], mult: this.mult, mission: this.mission });
      if (this.msgT > 0) R.drawMessage(ctx, th, this.msg, now);
      R.drawScanlines(ctx, th);
    }
  }

  P.Game = Pinball;
})(window.Arcade = window.Arcade || {});
