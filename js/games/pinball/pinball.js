/* =========================================================
   Space Pinball — an ORIGINAL space-cadet-style table with real ball
   physics and a deep, loaded playfield: top-notch flippers (angular
   velocity transfer + EOS boost + live-catch), proper inlanes/outlanes
   with a center drain, slingshots, pop bumpers, two drop-target banks,
   standup targets, a spinner, WARP top-lanes, a wormhole TUNNEL, a
   ball-LOCK that builds MULTIBALL, a habitrail RAMP, a tractor-beam
   MAGNET, an outlane KICKBACK, a skill shot, missions/modes, bonus &
   playfield multipliers. (Homage — not the copyrighted MS table/assets.)
   Implements GameInstance.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const P = Arcade.Pinball;
  const MK = Arcade.MusicKit;

  const PW = 420, PH = 680;                 // logical playfield
  const G = 1000, REST = 0.45, BALL_R = 9, MAXV = 1350;
  const BUMP_KICK = 360, SLING_KICK = 330, FLIP_BOOST = 600, FLIP_ANG = 27;
  const PLUNGE_MIN = 1120, PLUNGE_MAX = 1320, DRAIN_Y = 662, MAX_BALLS = 5;
  const LOCK_NEED = 3;                       // locks to light multiball

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

  // ---- missions / rank progression (original "space cadet" spirit) ----
  const MISSIONS = [
    { name: "CORE BREACH", type: "reactor", goal: 4, time: 28 },   // hit the reactor
    { name: "ION STORM", type: "bumper", goal: 22, time: 30 },     // pop bumpers (MAGNET engages)
    { name: "SPIN CYCLE", type: "spinner", goal: 30, time: 26 },   // rip the spinner
    { name: "WORMHOLE RUN", type: "tunnel", goal: 3, time: 30 },   // dive the wormhole
    { name: "SUPERNOVA", type: "bumper", goal: 34, time: 34 }
  ];
  const RANKS = ["CADET", "ENSIGN", "LIEUTENANT", "CAPTAIN", "COMMANDER", "ADMIRAL", "FLEET ADMIRAL"];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function seg(x1, y1, x2, y2, thick) { return { x1: x1, y1: y1, x2: x2, y2: y2, thick: thick || 2 }; }
  function arc(out, cx, cy, r, a0, a1, n, thick) {   // push a polyline of segments approximating an arc
    let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
    for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; out.push(seg(px, py, x, y, thick)); px = x; py = y; }
  }

  class Pinball {
    constructor(ctx) {
      this.shell = ctx; this.ctx2d = ctx.ctx; this.particles = ctx.particles; this.audio = ctx.audio;
      this.renderer = new P.Renderer();
      this.theme = P.getTheme(ctx.storage.get("pinball:theme", "modern"));
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("pinball:song", 0) | 0));
      this.touchLayout = "flippers";
      this.touchLabels = { left: "◀ FLIP", right: "FLIP ▶", hard: "LAUNCH", cw: "", ccw: "", soft: "", hold: "" };
      this.dev = false;
      this._unsub = []; this.paused = false; this.state = "playing"; this._now = 0;
      this._w = 800; this._h = 600;
      this._buildTable();
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    // ======================= TABLE =======================
    // Play area is bounded by the left wall (x24) and right play wall (x356); its center is x≈190.
    // The launch lane lives on the far right (x372–396), outside the play walls.
    _buildTable() {
      const W = [];
      // ---- outer shell + top arch ----
      W.push(seg(24, 96, 24, 470));            // left wall
      W.push(seg(24, 96, 92, 36));             // top-left chamfer
      W.push(seg(92, 36, 300, 36));            // top ceiling
      W.push(seg(300, 36, 340, 48));           // top-right chamfer
      W.push(seg(340, 48, 396, 100));          // launch deflector — throws the rising ball LEFT into play
      W.push(seg(372, 150, 372, 654));         // launch-lane inner wall = the upper-right play boundary (one-way: ball exits only over the top)
      W.push(seg(396, 60, 396, 660));          // launch-lane outer wall (table edge)

      // ---- WARP top lanes: three dividers make four rollover lanes across the ceiling ----
      W.push(seg(138, 60, 138, 104));
      W.push(seg(196, 60, 196, 104));
      W.push(seg(254, 60, 254, 104));

      // ---- lower playfield: outer rails, outlane dividers, inlane feeds (mirrored about x≈190) ----
      // LEFT
      W.push(seg(24, 470, 48, 582));           // left outer rail
      W.push(seg(48, 582, 82, 648));           // left outer rail -> bottom-left drain corner
      W.push(seg(118, 560, 100, 648));         // left divider (outlane | inlane)
      W.push(seg(140, 556, 132, 598));         // left inlane feed -> delivers onto the flipper
      // RIGHT (mirror about x=190)
      W.push(seg(372, 470, 334, 582));         // right outer rail (drops off the launch-lane wall)
      W.push(seg(334, 582, 298, 648));         // right outer rail -> bottom-right drain corner
      W.push(seg(262, 560, 280, 648));         // right divider
      W.push(seg(240, 556, 248, 598));         // right inlane feed
      this.walls = W;

      // ---- slingshots (kicking faces; normals point toward center) ----
      this.slings = [
        { x1: 100, y1: 534, x2: 120, y2: 590, hit: 0 },   // left
        { x1: 280, y1: 534, x2: 260, y2: 590, hit: 0 }    // right
      ];

      // ---- pop bumpers (upper cluster) ----
      this.bumpers = [
        { x: 120, y: 200, r: 17, hit: 0 },
        { x: 250, y: 190, r: 17, hit: 0 },
        { x: 186, y: 256, r: 17, hit: 0 },
        { x: 298, y: 232, r: 14, hit: 0 },
        { x: 78, y: 250, r: 13, hit: 0 }
      ];

      // ---- flippers: wide pivots, ~26px center drain gap (~1.5 balls); centered on x≈190 ----
      this.flippers = [
        { px: 124, py: 600, len: 62, thick: 8, rest: 0.55, active: -0.55, angle: 0.55, prev: 0.55, angVel: 0, pressed: false },
        { px: 256, py: 600, len: 62, thick: 8, rest: Math.PI - 0.55, active: Math.PI + 0.55, angle: Math.PI - 0.55, prev: Math.PI - 0.55, angVel: 0, pressed: false }
      ];

      // ---- two drop-target banks ----
      this.banks = [
        { name: "A", targets: [], reset: 0 },   // top horizontal bank — completes -> start a mission / bump bonus X
        { name: "B", targets: [], reset: 0 }    // right vertical bank — completes -> light the LOCK
      ];
      for (let i = 0; i < 5; i++) this.banks[0].targets.push({ x: 56 + i * 22, y1: 116, y2: 140, down: false, hit: 0 });
      for (let i = 0; i < 4; i++) this.banks[1].targets.push({ x: 324, y1: 286 + i * 24, y2: 304 + i * 24, vert: true, down: false, hit: 0 });

      // ---- standup targets (light all to re-arm the kickback) ----
      this.standups = [
        { x: 38, y: 332, r: 9, lit: false, hit: 0 },
        { x: 38, y: 366, r: 9, lit: false, hit: 0 },
        { x: 38, y: 400, r: 9, lit: false, hit: 0 }
      ];

      // ---- spinner (a blade up the left side; rip it for rapid points) ----
      this.spinner = { x: 56, y: 150, ang: 0, vel: 0, hit: 0, cool: 0, x1: 56, y1: 136, x2: 56, y2: 164 };

      // ---- central reactor (big bumper + main mission objective + magnet anchor) ----
      this.reactor = { x: 190, y: 392, r: 24, lit: 0 };
      this.magnet = { x: 190, y: 392, r: 100, active: 0 };   // tractor beam during ION STORM

      // ---- wormhole TUNNEL: dive the entrance saucer, warp across the table ----
      this.tunnels = [
        { ex: 300, ey: 300, r: 16, outx: 90, outy: 120, ejAng: Math.PI * 0.36, ejSpd: 560, glow: 0 }
      ];

      // ---- ball LOCK saucer (build multiball) ----
      this.lock = { x: 110, y: 300, r: 15, count: 0, lit: false, glow: 0 };

      // ---- WARP top-lane rollovers (skill-shot lit on launch) ----
      this.warp = [
        { x: 109, y: 82, lit: false, ch: "W" },
        { x: 167, y: 82, lit: false, ch: "A" },
        { x: 225, y: 82, lit: false, ch: "R" },
        { x: 283, y: 82, lit: false, ch: "P" }
      ];

      // ---- inlane/outlane rollover trigger zones ----
      this.lanes = [
        { kind: "out", side: "L", x: 58, y: 596, w: 44, h: 56, lit: false, cool: 0 },
        { kind: "in", side: "L", x: 104, y: 572, w: 40, h: 52, lit: false, cool: 0 },
        { kind: "in", side: "R", x: 236, y: 572, w: 40, h: 52, lit: false, cool: 0 },
        { kind: "out", side: "R", x: 278, y: 596, w: 44, h: 56, lit: false, cool: 0 }
      ];

      // ---- KICKBACK in the left outlane ----
      this.kickback = { x: 80, y: 642, charged: true, glow: 0 };

      this.plungerX = 384;
      // habitrail RAMP scripted path: enter top-left, loop over the top, drop into the right inlane
      this.rampEntry = { x: 60, y: 300, r: 15, glow: 0 };
      this.rampPath = [{ x: 60, y: 300 }, { x: 70, y: 200 }, { x: 120, y: 130 }, { x: 200, y: 112 }, { x: 280, y: 132 }, { x: 320, y: 220 }, { x: 300, y: 360 }, { x: 268, y: 470 }];
    }

    _reset() {
      this.score = 0; this.lives = 3; this.bumperHits = 0;
      this.rank = 0; this.mult = 1; this.bonusX = 1; this.mission = null; this.missionIdx = 0; this.reactor.lit = 0;
      this.balls = []; this.charging = false; this.plunge = 0;
      this.combo = 0; this.comboT = 0; this.spinCount = 0; this.tunnelCount = 0;
      this.lock.count = 0; this.lock.lit = false; this.magnet.active = 0;
      this.flippers.forEach(f => { f.pressed = false; f.angle = f.rest; });
      this.msg = ""; this.msgT = 0; this.shakeMag = 0; this.skillT = 0; this.skillLane = -1;
      this.banks.forEach(bk => bk.targets.forEach(t => { t.down = false; t.hit = 0; }));
      this.standups.forEach(s => { s.lit = false; s.hit = 0; });
      this.warp.forEach(w => w.lit = false);
      this.lanes.forEach(l => { l.lit = false; l.cool = 0; });
      this.kickback.charged = true;
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
    menus() {
      const self = this;
      return {
        music: { options: SONGS.map((s, i) => ({ id: i, name: s.name })), current: this.songIdx, set: (i) => { self.songIdx = i; self.shell.storage.set("pinball:song", i); self._applyMusic(); self._flash(SONGS[i].name); } },
        skin: { options: P.Themes.map(t => ({ id: t.id, name: t.name })), current: this.theme.id, set: (id) => { const t = P.Themes.find(x => x.id === id); if (t) { self.theme = t; self.shell.storage.set("pinball:theme", id); if (!t.effects.particles) self.particles.clear(); } } }
      };
    }
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
      for (const b of this.balls) if (b.mode === "launch") { b.vy = -power; b.vx = rand(-8, 8); b.mode = "play"; launched = true; }
      this.charging = false; this.plunge = 0;
      if (launched) {
        this.audio.play("plunger");
        // SKILL SHOT: light a random WARP lane; rolling over it before a flipper hit scores big
        this.skillLane = (Math.random() * this.warp.length) | 0; this.skillT = 4500;
        this._flash("SKILL SHOT: " + this.warp[this.skillLane].ch + " LANE");
      }
    }

    _flash(msg) { this.msg = msg; this.msgT = 1700; }
    _shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
    _gameOver() { if (this.state === "over") return; this.state = "over"; this.audio.stopMusic(); this.shell.requestGameOver({ score: this.score }); }
    _score(n) { this.score += Math.round(n * this.mult); }

    _burst(x, y, color, count) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: x, y: y, count: count, colors: [color, "#ffffff"], speedMin: 30, speedMax: 240,
        gravity: 120, drag: 1, sizeMin: 1.2, sizeMax: 3, lifeMin: 0.25, lifeMax: 0.7, glow: this.theme.effects.glow, shape: "circle", spin: 5 });
    }
    _combo() { this.combo++; this.comboT = 2600; if (this.combo >= 2) { this._score(250 * this.combo); this._flash("COMBO ×" + this.combo + "!"); } }

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

    // ======================= UPDATE =======================
    update(dt, now) {
      this._now = now;
      const ds = dt / 1000;
      if (this.shakeMag > 0) { this.shakeMag -= dt * 0.05; if (this.shakeMag < 0) this.shakeMag = 0; }
      this.particles.update(dt);
      if (this.msgT > 0) this.msgT -= dt;
      if (this.skillT > 0) this.skillT -= dt;
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
      for (const b of this.bumpers) if (b.hit > 0) b.hit -= ds;
      for (const s of this.slings) if (s.hit > 0) s.hit -= ds;
      for (const bk of this.banks) for (const t of bk.targets) if (t.hit > 0) t.hit -= ds;
      for (const s of this.standups) if (s.hit > 0) s.hit -= ds;
      for (const l of this.lanes) if (l.cool > 0) l.cool -= dt;
      for (const tn of this.tunnels) if (tn.glow > 0) tn.glow -= ds;
      if (this.lock.glow > 0) this.lock.glow -= ds;
      if (this.rampEntry.glow > 0) this.rampEntry.glow -= ds;
      if (this.kickback.glow > 0) this.kickback.glow -= ds;
      if (this.reactor.lit > 0) this.reactor.lit -= ds;
      if (this.magnet.active > 0) this.magnet.active -= dt;
      // spinner spin-down
      this.spinner.ang += this.spinner.vel * ds; this.spinner.vel *= (1 - 2.2 * ds); if (this.spinner.cool > 0) this.spinner.cool -= dt;
      if (this.mission) { this.mission.t -= ds; if (this.mission.t <= 0) { this.mission = null; this.magnet.active = 0; this._flash("MISSION FAILED"); } }
      if (this.state !== "playing") return;

      // flippers
      for (const f of this.flippers) {
        f.prev = f.angle;
        const target = f.pressed ? f.active : f.rest;
        const max = FLIP_ANG * ds;
        if (Math.abs(target - f.angle) <= max) f.angle = target;
        else f.angle += Math.sign(target - f.angle) * max;
        f.angVel = (f.angle - f.prev) / ds;
        f.moving = Math.abs(f.angVel) > 1.5;
      }

      if (this.charging) this.plunge = Math.min(1, this.plunge + dt / 700);

      // captured / routed balls (saucers, tunnels, ramp) — handled outside the physics substeps
      this._updateHeld(dt);

      // physics substeps
      const steps = Math.max(1, Math.min(8, Math.round(dt / 4)));
      const sdt = (dt / steps) / 1000;
      for (let st = 0; st < steps; st++) this._physics(sdt);

      // trails
      if (this.theme.effects.trail) for (const b of this.balls) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.shift(); }

      // anti-stall failsafe: a ball that stalls in play (wedged in a pocket) gets a gentle nudge so nothing freezes
      for (const b of this.balls) {
        if (b.mode !== "play") { b.stillT = 0; continue; }
        if (Math.hypot(b.vx, b.vy) < 12 && b.y < DRAIN_Y - 16) { b.stillT = (b.stillT || 0) + dt; if (b.stillT > 2000) { b.vx += rand(-180, 180); b.vy -= rand(180, 320); b.stillT = 0; } }
        else b.stillT = 0;
      }

      // drain / kickback
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        if (b.mode === "hold" || b.mode === "ramp") continue;
        if (b.y > DRAIN_Y) {
          if (this.dev) { b.y = DRAIN_Y - 4; b.vy = -Math.abs(b.vy) - 200; continue; }
          // left outlane kickback save
          if (b.x > 60 && b.x < 104 && this.kickback.charged) {
            this.kickback.charged = false; this.kickback.glow = 0.6; b.y = 600; b.vy = -1020; b.vx = rand(40, 120); b.mode = "play";
            this.audio.play("plunger"); this._flash("KICKBACK SAVE!"); this._burst(b.x, b.y, this.theme.palette.kick, 14); if (this.theme.effects.shake) this._shake(4);
            continue;
          }
          this.balls.splice(i, 1);
          this._burst(b.x, DRAIN_Y, this.theme.palette.danger, 10);
        }
      }
      if (this.balls.length === 0) {
        this._endBallBonus();
        this.lives--; this.audio.play("drain");
        if (this.lives < 0) { this.lives = 0; this._gameOver(); }
        else { this._spawnLaunchBall(); this._flash("BALL " + (3 - this.lives)); }
      }
    }

    _endBallBonus() {
      const lanes = this.lanes.filter(l => l.lit).length;
      const bonus = (1000 + this.bumperHits * 20 + lanes * 500) * this.bonusX;
      if (bonus > 0) { this.score += bonus; this._flash("BONUS +" + bonus.toLocaleString() + (this.bonusX > 1 ? "  ×" + this.bonusX : "")); }
      this.lanes.forEach(l => l.lit = false);
    }

    _updateHeld(dt) {
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        if (b.mode === "hold") {
          b.holdT -= dt;
          if (b.holdT <= 0) {
            if (b.holdKind === "tunnel") {   // warp across the table and eject
              const tn = b.holdRef; b.x = tn.outx; b.y = tn.outy; tn.glow = 0.6;
              b.vx = Math.cos(tn.ejAng) * tn.ejSpd; b.vy = Math.sin(tn.ejAng) * tn.ejSpd; b.mode = "play";
              this.audio.play("plunger"); this._burst(tn.outx, tn.outy, this.theme.palette.tunnelExit, 16);
            } else if (b.holdKind === "lock") {   // pop back out (count already advanced / multiball already fired)
              b.x = this.lock.x; b.y = this.lock.y - 4; b.vx = rand(-60, 60); b.vy = -680; b.mode = "play"; this.audio.play("plunger");
            }
          }
        } else if (b.mode === "ramp") {   // travel the habitrail then drop into the right inlane
          b.rampT += dt / 720;
          const path = this.rampPath, fp = Math.min(1, b.rampT) * (path.length - 1), k = Math.floor(fp), f = fp - k;
          const p0 = path[Math.min(k, path.length - 1)], p1 = path[Math.min(k + 1, path.length - 1)];
          b.x = p0.x + (p1.x - p0.x) * f; b.y = p0.y + (p1.y - p0.y) * f;
          if (this.theme.effects.particles && Math.random() < 0.4) this._burst(b.x, b.y, this.theme.palette.ramp, 1);
          if (b.rampT >= 1) { b.mode = "play"; b.vx = 30; b.vy = 260; }
        }
      }
    }

    _physics(dt) {
      for (const b of this.balls) {
        if (b.mode === "hold" || b.mode === "ramp") continue;
        if (b.mode === "launch") {
          b.vy += G * dt; b.y += b.vy * dt;
          if (b.y > 628) { b.y = 628; b.vy = 0; }
          if (b.x < 374) b.x = 374; if (b.x > 394) b.x = 394;
          continue;
        }
        b.vy += G * dt;
        // tractor-beam magnet (active during ION STORM)
        if (this.magnet.active > 0) {
          const mx = this.magnet.x - b.x, my = this.magnet.y - b.y, md = Math.hypot(mx, my);
          if (md < this.magnet.r && md > 2) { const pull = 900 * (1 - md / this.magnet.r); b.vx += (mx / md) * pull * dt; b.vy += (my / md) * pull * dt; }
        }
        let sp = Math.hypot(b.vx, b.vy); if (sp > MAXV) { b.vx *= MAXV / sp; b.vy *= MAXV / sp; }
        b.x += b.vx * dt; b.y += b.vy * dt;

        for (const w of this.walls) this._collideSeg(b, w.x1, w.y1, w.x2, w.y2, w.thick, REST);

        this._hitTargets(b);
        this._hitSlings(b);
        this._hitBumpers(b);
        this._hitReactor(b);
        this._hitSpinner(b);
        this._hitStandups(b);
        this._hitCaptures(b);     // tunnel, lock, ramp entrances
        this._hitLanes(b);        // WARP top lanes + inlane/outlane rollovers
        this._hitFlippers(b);
      }
      this._ballVsBall();
    }

    _hitTargets(b) {
      for (const bk of this.banks) {
        for (const t of bk.targets) {
          if (t.down) continue;
          const hit = t.vert ? this._collideSeg(b, t.x - 11, t.y1, t.x + 11, t.y1, 4, 0.35) : this._collideSeg(b, t.x, t.y1, t.x, t.y2, 4, 0.35);
          if (hit) {
            t.down = true; t.hit = 0.2; this._score(300); this.audio.play("bump");
            this._burst(t.x, t.vert ? t.y1 : (t.y1 + t.y2) / 2, this.theme.palette.accent, 8);
            if (bk.targets.every(q => q.down)) this._bankComplete(bk);
          }
        }
      }
    }
    _bankComplete(bk) {
      this._score(3000); bk.reset = 0.6;
      bk.targets.forEach(q => q.down = false);
      if (bk.name === "A") { if (!this.mission) this._startMission(); else { this.bonusX = Math.min(9, this.bonusX + 1); this._flash("BONUS ×" + this.bonusX); } }
      else { this.lock.lit = true; this.lock.glow = 1; this._flash("LOCK IS LIT!"); }
      this.audio.play("win"); if (this.theme.effects.shake) this._shake(4);
    }

    _hitSlings(b) {
      for (const s of this.slings) {
        const hit = this._collideSeg(b, s.x1, s.y1, s.x2, s.y2, 4, 0.4);
        if (hit) {
          const out = b.vx * hit.nx + b.vy * hit.ny;
          if (out < SLING_KICK) { b.vx += hit.nx * (SLING_KICK - out); b.vy += hit.ny * (SLING_KICK - out); }
          s.hit = 0.12; this._score(45); this.audio.play("flip"); this._burst(b.x, b.y, this.theme.palette.sling, 5);
        }
      }
    }

    _hitBumpers(b) {
      for (const bm of this.bumpers) {
        let nx = b.x - bm.x, ny = b.y - bm.y, d = Math.hypot(nx, ny);
        if (d < b.r + bm.r) {
          if (d < 0.0001) { nx = 0; ny = -1; d = 1; }
          nx /= d; ny /= d; b.x = bm.x + nx * (b.r + bm.r); b.y = bm.y + ny * (b.r + bm.r);
          const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
          const out = b.vx * nx + b.vy * ny; if (out < BUMP_KICK) { b.vx += nx * (BUMP_KICK - out); b.vy += ny * (BUMP_KICK - out); }
          bm.hit = 0.12; this._score(120); this.bumperHits++;
          this.audio.play("bump"); this._burst(bm.x, bm.y, this.theme.palette.bumperHit, 9);
          if (this.theme.effects.shake) this._shake(2);
          this._missionProgress("bumper");
          if (this.bumperHits % 30 === 0) this._multiball();
        }
      }
    }

    _hitReactor(b) {
      const rc = this.reactor; let nx = b.x - rc.x, ny = b.y - rc.y, d = Math.hypot(nx, ny);
      if (d < b.r + rc.r) {
        if (d < 0.0001) { nx = 0; ny = -1; d = 1; }
        nx /= d; ny /= d; b.x = rc.x + nx * (b.r + rc.r); b.y = rc.y + ny * (b.r + rc.r);
        const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
        const out = b.vx * nx + b.vy * ny; if (out < BUMP_KICK) { b.vx += nx * (BUMP_KICK - out); b.vy += ny * (BUMP_KICK - out); }
        rc.lit = 0.5; this._score(600); this.audio.play("bump"); this._burst(rc.x, rc.y, this.theme.palette.accent, 12);
        if (this.theme.effects.shake) this._shake(3); this._missionProgress("reactor");
      }
    }

    _hitSpinner(b) {
      const s = this.spinner;
      // distance to the vertical blade segment
      const hit = (s.cool <= 0) && Math.abs(b.x - s.x) < b.r + 4 && b.y > s.y1 - b.r && b.y < s.y2 + b.r && Math.abs(b.vx) > 30;
      if (hit) {
        const speed = Math.hypot(b.vx, b.vy);
        s.vel = Math.max(s.vel, 8 + speed * 0.02) * Math.sign(b.vx || 1); s.cool = 55; s.hit = 0.2;
        this._score(60); this.spinCount++; this.audio.play("flip"); this._missionProgress("spinner");
        if (this.spinCount % 25 === 0) { this._score(2500); this._flash("SPINNER JACKPOT!"); }
      }
    }

    _hitStandups(b) {
      for (const s of this.standups) {
        let nx = b.x - s.x, ny = b.y - s.y, d = Math.hypot(nx, ny);
        if (d < b.r + s.r) {
          if (d < 0.0001) { nx = 1; ny = 0; d = 1; }
          nx /= d; ny /= d; b.x = s.x + nx * (b.r + s.r); b.y = s.y + ny * (b.r + s.r);
          const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
          if (!s.lit) { s.lit = true; if (this.standups.every(q => q.lit)) { this.kickback.charged = true; this.kickback.glow = 1; this.standups.forEach(q => q.lit = false); this._flash("KICKBACK RE-ARMED!"); this._score(1500); } }
          s.hit = 0.2; this._score(150); this.audio.play("bump"); this._burst(s.x, s.y, this.theme.palette.standupLit, 6);
        }
      }
    }

    _hitCaptures(b) {
      // wormhole tunnel entrances
      for (const tn of this.tunnels) {
        if (Math.hypot(b.x - tn.ex, b.y - tn.ey) < tn.r) {
          b.mode = "hold"; b.holdKind = "tunnel"; b.holdRef = tn; b.holdT = 520; b.vx = b.vy = 0; b.x = tn.ex; b.y = tn.ey; tn.glow = 1;
          this._score(750); this.tunnelCount++; this.audio.play("extralife"); this._burst(tn.ex, tn.ey, this.theme.palette.tunnel, 14);
          this._missionProgress("tunnel"); this._combo(); return;
        }
      }
      // ramp entrance -> habitrail
      if (Math.hypot(b.x - this.rampEntry.x, b.y - this.rampEntry.y) < this.rampEntry.r && b.vy < 40) {
        b.mode = "ramp"; b.rampT = 0; this.rampEntry.glow = 1; this._score(500); this.audio.play("flip"); this._combo(); return;
      }
      // ball lock saucer
      if (Math.hypot(b.x - this.lock.x, b.y - this.lock.y) < this.lock.r) {
        if (this.lock.lit || this.lock.count > 0) {
          this.lock.count++; this.lock.lit = false; this.lock.glow = 1; this._score(1500);
          b.mode = "hold"; b.holdKind = "lock"; b.holdT = 900; b.vx = b.vy = 0; b.x = this.lock.x; b.y = this.lock.y;
          this.audio.play("extralife"); this._burst(this.lock.x, this.lock.y, this.theme.palette.lock, 14);
          if (this.lock.count >= LOCK_NEED) { this.lock.count = 0; this._multiball(); this._flash("LOCK x" + LOCK_NEED + " — MULTIBALL!"); }
          else this._flash("BALL LOCKED  " + this.lock.count + "/" + LOCK_NEED);
        } else {   // not lit: just a soft kicker bounce + small score
          let nx = b.x - this.lock.x, ny = b.y - this.lock.y, d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
          b.x = this.lock.x + nx * (this.lock.r + b.r); b.y = this.lock.y + ny * (this.lock.r + b.r);
          const out = b.vx * nx + b.vy * ny; if (out < 240) { b.vx += nx * (240 - out); b.vy += ny * (240 - out); }
          this._score(80);
        }
      }
    }

    _hitLanes(b) {
      // WARP top-lane rollovers (also the skill shot)
      for (let i = 0; i < this.warp.length; i++) {
        const w = this.warp[i];
        if (!w.lit && Math.abs(b.x - w.x) < 16 && Math.abs(b.y - w.y) < 16) {
          w.lit = true; this._score(200); this.audio.play("flip"); this._burst(w.x, w.y, this.theme.palette.rollOn, 5);
          if (this.skillT > 0 && this.skillLane === i) { this._score(5000); this._flash("SKILL SHOT! +" + (5000 * this.mult)); this.skillT = 0; if (this.theme.effects.shake) this._shake(5); }
          if (this.warp.every(q => q.lit)) { this.warp.forEach(q => q.lit = false); this.bonusX = Math.min(9, this.bonusX + 1); this._score(3000); this._flash("WARP COMPLETE — BONUS ×" + this.bonusX); if (this.bonusX % 3 === 0) { this.lives++; this._flash("EXTRA BALL!"); } }
        }
      }
      // inlane / outlane rollovers
      for (const l of this.lanes) {
        if (l.cool > 0) continue;
        if (b.x > l.x && b.x < l.x + l.w && b.y > l.y && b.y < l.y + l.h) {
          l.cool = 600; l.lit = true; this._score(l.kind === "in" ? 250 : 150);
          this.audio.play("flip"); this._burst(b.x, b.y, this.theme.palette.kick, 4);
          if (l.kind === "in") this._combo();
        }
      }
    }

    _hitFlippers(b) {
      for (const f of this.flippers) {
        const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
        const hit = this._collideSeg(b, f.px, f.py, tx, ty, f.thick, 0.32);
        if (hit) {
          // impart the flipper's surface velocity at the contact point (v = ω × r) — the tip launches hardest
          const rx = b.x - f.px, ry = b.y - f.py;
          const svx = -f.angVel * ry, svy = f.angVel * rx;
          const along = svx * hit.nx + svy * hit.ny;
          if (along > 0) { b.vx += hit.nx * along; b.vy += hit.ny * along; }
          // EOS boost on an active upswing; live-catch (relaxing flipper) deadens instead
          if (f.pressed && f.moving) { const out = b.vx * hit.nx + b.vy * hit.ny; if (out < FLIP_BOOST) { b.vx += hit.nx * (FLIP_BOOST - out); b.vy += hit.ny * (FLIP_BOOST - out); } }
          else if (!f.pressed && f.moving) { b.vx *= 0.6; b.vy *= 0.6; }
        }
      }
    }

    _ballVsBall() {
      for (let i = 0; i < this.balls.length; i++) {
        const a = this.balls[i]; if (a.mode === "hold" || a.mode === "ramp" || a.mode === "launch") continue;
        for (let j = i + 1; j < this.balls.length; j++) {
          const c = this.balls[j]; if (c.mode === "hold" || c.mode === "ramp" || c.mode === "launch") continue;
          let nx = c.x - a.x, ny = c.y - a.y, d = Math.hypot(nx, ny), min = a.r + c.r;
          if (d < min && d > 0.0001) {
            nx /= d; ny /= d; const overlap = (min - d) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap; c.x += nx * overlap; c.y += ny * overlap;
            const rvx = c.vx - a.vx, rvy = c.vy - a.vy, vn = rvx * nx + rvy * ny;
            if (vn < 0) { const imp = vn; a.vx += nx * imp; a.vy += ny * imp; c.vx -= nx * imp; c.vy -= ny * imp; }
          }
        }
      }
    }

    _multiball() {
      let added = 0;
      for (let k = 0; k < 2 && this.balls.length < MAX_BALLS; k++) { this._spawnBall(rand(120, 280), rand(160, 260), rand(-120, 120), rand(-60, 60)); added++; }
      if (added) { this._flash("MULTIBALL!"); this.audio.play("win"); if (this.theme.effects.shake) this._shake(5); }
    }

    _startMission() {
      const m = MISSIONS[this.missionIdx % MISSIONS.length]; this.missionIdx++;
      this.mission = { name: m.name, type: m.type, goal: m.goal, prog: 0, t: m.time, tMax: m.time };
      if (m.type === "bumper") this.magnet.active = m.time * 1000;   // ION STORM engages the tractor beam
      this._flash("MISSION: " + m.name); this.audio.play("extralife");
    }
    _missionProgress(type) {
      if (!this.mission || this.mission.type !== type) return;
      this.mission.prog++;
      if (this.mission.prog >= this.mission.goal) this._completeMission();
    }
    _completeMission() {
      this._score(6000);
      if (this.rank < RANKS.length - 1) this.rank++;
      this.mult = Math.min(8, this.mult + 1);
      this.magnet.active = 0; this.mission = null;
      this._flash("MISSION COMPLETE!  " + RANKS[this.rank]);
      this.audio.play("win"); if (this.theme.effects.shake) this._shake(7);
      this._multiball();
    }

    // ======================= RENDER =======================
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
      R.drawRamp(ctx, th, this.rampPath, this.rampEntry, now);
      R.drawLanes(ctx, th, this.lanes);
      for (const w of this.walls) R.drawWall(ctx, th, w);
      for (const w of this.warp) R.drawRollover(ctx, th, w, now);
      for (const bk of this.banks) for (const t of bk.targets) R.drawTarget(ctx, th, t);
      for (const s of this.standups) R.drawStandup(ctx, th, s);
      R.drawSpinner(ctx, th, this.spinner, now);
      for (const tn of this.tunnels) R.drawTunnel(ctx, th, tn, now);
      R.drawLock(ctx, th, this.lock, now);
      R.drawMagnet(ctx, th, this.magnet, now);
      R.drawKickback(ctx, th, this.kickback, now);
      for (const s of this.slings) R.drawSling(ctx, th, s, now);
      for (const bm of this.bumpers) R.drawBumper(ctx, th, bm);
      R.drawReactor(ctx, th, this.reactor, now);
      for (const f of this.flippers) R.drawFlipper(ctx, th, f);
      R.drawPlunger(ctx, th, this.plungerX, 642, this.charging ? this.plunge : 0);
      this.particles.render(ctx);
      for (const b of this.balls) R.drawBall(ctx, th, b, b.trail);
      ctx.restore();
      R.drawHUD(ctx, th, { score: this.score, balls: this.lives, multiball: this.balls.length > 1, rank: RANKS[this.rank], mult: this.mult, bonusX: this.bonusX, mission: this.mission, lock: this.lock.count });
      if (this.msgT > 0) R.drawMessage(ctx, th, this.msg, now);
      R.drawScanlines(ctx, th);
    }
  }

  P.Game = Pinball;
})(window.Arcade = window.Arcade || {});
