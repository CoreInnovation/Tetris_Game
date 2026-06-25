/* =========================================================
   Asteroids — vector space shooter with a full WEAPON ARSENAL
   (ported in spirit from Missile Defense): rapid, spread, seekers,
   cryo, tesla, cluster, nuke, singularity. Weapon powerup pods drift
   in space — shoot them or fly into them to collect. Dev mode (🛠️)
   unlocks every weapon + makes the ship invulnerable for testing.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const A = Arcade.Asteroids;
  const MK = Arcade.MusicKit;

  const ROT = 4.2, THRUST = 330, MAXV = 470, DRAG = 0.35;
  const SHIP_R = 14, INVULN = 2400, RESPAWN = 1000;
  const SIZE_R = { 3: 46, 2: 26, 1: 14 }, SIZE_SCORE = { 3: 20, 2: 50, 1: 100 };
  const UFO_SCORE = { big: 200, small: 1000 };
  const HOMING_TURN = 4.6, BH_PULL = 330, AMMO_GRANT = 40, AST_SLOW = 0.4, MAX_BULLETS = 48;

  // ---- arsenal ----
  const WEAPONS = [
    { id: "blaster", name: "BLASTER", base: true, cd: 150, speed: 560, life: 2.6, color: null },
    { id: "rapid", name: "RAPID", cd: 80, speed: 940, life: 1.5, color: "#7afcff" },
    { id: "spread", name: "SPREAD", cd: 300, speed: 520, life: 1.3, pellets: 5, fan: 0.72, color: "#ffe14d" },
    { id: "seeker", name: "SEEKERS", cd: 380, speed: 380, life: 3.2, homing: true, count: 3, color: "#9aff6a" },
    { id: "cryo", name: "CRYO", cd: 280, speed: 520, life: 2.2, freeze: 3.2, color: "#8fd9ff" },
    { id: "tesla", name: "TESLA", cd: 300, speed: 900, life: 1.8, chain: 4, color: "#b388ff" },
    { id: "cluster", name: "CLUSTER", cd: 360, speed: 470, life: 0.55, split: 6, color: "#ff9a3a" },
    { id: "nuke", name: "NUKE", cd: 720, speed: 360, life: 2.4, blast: 130, color: "#ff5a5a" },
    { id: "singularity", name: "SINGULARITY", cd: 950, speed: 380, life: 2.0, blackhole: true, color: "#c86bff" }
  ];
  const WMAP = {}; WEAPONS.forEach(w => WMAP[w.id] = w);
  A.WEAPONS = WEAPONS;

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
  const SONGS = [{ id: "classic", name: "Heartbeat", song: AST_CLASSIC }, { id: "techno", name: "Techno Remix", song: AST_TECHNO }];
  A.SONGS = SONGS;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function shape() { const n = 10, out = []; for (let i = 0; i < n; i++) out.push({ a: (i / n) * Math.PI * 2, r: rand(0.72, 1.18) }); return out; }

  class Asteroids {
    constructor(ctx) {
      this.shell = ctx; this.ctx2d = ctx.ctx; this.particles = ctx.particles; this.audio = ctx.audio;
      this.renderer = new A.Renderer();
      this.theme = A.getTheme(ctx.storage.get("asteroids:theme", "modern"));
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("asteroids:song", 0) | 0));
      this.pointerInput = true;   // custom thumbstick + fire button instead of the shared touch bar
      this.ctrlProfile = ctx.storage.get("asteroids:ctrl", "float");   // "float" | "static"
      this.tapFire = ctx.storage.get("asteroids:tapfire", true);       // quick-tap in the stick zone fires (one-thumb play)
      const sb = ctx.storage.get("asteroids:stick", null);
      this.stickBase = sb ? { x: sb.x, y: sb.y, set: true } : { x: 0, y: 0, set: false };
      this.stick = { active: false, pending: false, reposition: false, id: null, baseX: 0, baseY: 0, kx: 0, ky: 0, dx: 0, dy: 0, mag: 0, sx: 0, sy: 0, t0: 0, forceFire: false };
      this.firing = false; this.fireId = null; this._fireReq = false;
      this._forceSeen = false;   // becomes true once we observe graded Touch.force (0<f<1) — gates pressure-to-fire so non-supporting phones never false-fire
      this.dev = false;
      this._unsub = []; this.paused = false; this.state = "playing"; this._now = 0;
      this._w = 800; this._h = 600; this._cssW = 800; this._cssH = 600; this.zoom = 1;
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      this.score = 0; this.lives = 3; this.wave = 0; this.nextExtra = 10000;
      this.bullets = []; this.enemyBullets = []; this.asteroids = []; this.ufo = null;
      this.powerups = []; this.blackholes = []; this.zaps = [];
      this.weapon = "blaster"; this.ammo = {}; if (this.dev) WEAPONS.forEach(w => this.ammo[w.id] = Infinity);
      this.fireCd = 0; this.respawnT = 0; this.shakeMag = 0; this.toasts = [];
      this.ufoTimer = rand(12000, 22000); this.powerupTimer = rand(8000, 13000);
      this._clearTouchState();
      this.particles.clear();
      this._spawnShip(true);
      this.state = "playing"; this.paused = false;
      this._nextWave();
      this._applyMusic();
    }

    // drop any held thumbstick/fire so it can't "stick on" across pause / game-over / restart
    _clearTouchState() { this.stick.active = false; this.stick.pending = false; this.stick.reposition = false; this.stick.id = null; this.stick.mag = 0; this.stick.forceFire = false; this.firing = false; this.fireId = null; this._fireReq = false; }
    _staticBase() { return (this.stickBase && this.stickBase.set) ? this.stickBase : { x: this._cssW * 0.22, y: this._cssH * 0.74 }; }
    _onStickHandle(p) { const b = this._staticBase(); return Math.hypot(p.x - b.x, p.y - b.y) < 26; }

    menus() {
      const self = this, SG = A.SONGS;
      return {
        control: {
          profiles: [{ id: "float", name: "Anchored stick (press to place)" }, { id: "static", name: "Static stick (drag ⊕ to place)" }],
          profile: this.ctrlProfile,
          setProfile: (id) => { self.ctrlProfile = id; self.shell.storage.set("asteroids:ctrl", id); self._clearTouchState(); },
          toggles: [{ id: "tap", name: "Tap to fire (one thumb)", on: this.tapFire, set: (v) => { self.tapFire = v; self.shell.storage.set("asteroids:tapfire", v); } }]
        },
        music: { options: SG.map((s, i) => ({ id: i, name: s.name })), current: this.songIdx, set: (i) => { self.songIdx = i; self.shell.storage.set("asteroids:song", i); self._applyMusic(); self._toast("♪ " + SG[i].name); } },
        skin: { options: A.Themes.map(t => ({ id: t.id, name: t.name })), current: this.theme.id, set: (id) => { const t = A.Themes.find(x => x.id === id); if (t) { self.theme = t; self.shell.storage.set("asteroids:theme", id); if (!t.effects.particles) self.particles.clear(); } } }
      };
    }

    pause() { this.paused = true; this._clearTouchState(); this.audio.suspendMusic(); }
    resume() { this.paused = false; this.audio.resumeMusic(); this._applyTempo(); }
    destroy() { this.audio.stopMusic(); this._clearTouchState(); this._unsub.forEach(fn => fn()); this._unsub.length = 0; }

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
      this._applyMusic(); const name = SONGS[this.songIdx].name; this._toast("♪ " + name); return name;
    }
    toggleDev() {
      this.dev = !this.dev;
      if (this.dev) WEAPONS.forEach(w => this.ammo[w.id] = Infinity);
      else WEAPONS.forEach(w => { if (!w.base && this.ammo[w.id] === Infinity) this.ammo[w.id] = 0; });
      this._toast(this.dev ? "DEV MODE ON — all weapons + invuln" : "DEV MODE OFF");
      return this.dev;
    }

    _has(id) { const w = WMAP[id]; return !!w && (w.base || this.dev || (this.ammo[id] || 0) > 0); }

    _bindInput() {
      const input = this.shell.input;
      this._unsub.push(input.onDown((code, e, repeat) => {
        if (this.paused || this.state !== "playing" || repeat) return;
        if (code === "KeyZ" || code === "ShiftLeft" || code === "ShiftRight") this._hyperspace();
        else if (code.indexOf("Digit") === 0) { const n = parseInt(code.slice(5), 10) - 1; if (n >= 0 && n < WEAPONS.length && this._has(WEAPONS[n].id)) { this.weapon = WEAPONS[n].id; this.audio.play("select"); } }
        else if (code === "KeyC" || code === "KeyQ") this._cycleWeapon(-1);   // keyboard Q/C prev weapon
        else if (code === "ArrowDown" || code === "KeyE") this._cycleWeapon(1);  // keyboard E next weapon
      }));
      if (this.shell.isTouch) this._bindTouch();
    }

    // Thumbstick (left) + fire (right). FLOAT profile: the base ANCHORS where you first press and stays put for
    // that whole hold (no recentering) — clamp the throw at STICK_MAX. STATIC profile: the base is pinned (drag the
    // ⊕ to move it). One thumb does everything: a quick TAP fires, and on pressure-capable phones a firm PRESS fires
    // while you keep steering. The dedicated fire button (right side) always works too.
    _bindTouch() {
      const canvas = this.shell.canvas, STICK_MAX = 70, TAP_MOVE = 16, TAP_MS = 200;
      const toLocal = (t) => { const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left) * (this._cssW / r.width), y: (t.clientY - r.top) * (this._cssH / r.height) }; };
      const s = this.stick;
      const onStart = (e) => {
        if (this.paused || this.state !== "playing") return;
        e.preventDefault();
        for (const t of e.changedTouches) {
          const p = toLocal(t);
          if (p.x > this._cssW * 0.6) { if (this.fireId == null) { this.firing = true; this.fireId = t.identifier; } continue; }
          if (s.active || s.pending || s.reposition || s.id != null) continue;   // single stick finger
          if (this.ctrlProfile === "static" && this._onStickHandle(p)) { s.reposition = true; s.id = t.identifier; continue; }   // grab ⊕ to move it
          s.pending = true; s.id = t.identifier; s.sx = p.x; s.sy = p.y; s.t0 = this._now; s.forceFire = false;
          const base = (this.ctrlProfile === "static") ? this._staticBase() : { x: p.x, y: p.y };
          s.baseX = base.x; s.baseY = base.y; s.kx = p.x; s.ky = p.y; s.dx = 0; s.dy = 0; s.mag = 0;
        }
      };
      const onMove = (e) => {
        if (s.id == null) return;
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier !== s.id) continue;
          const p = toLocal(t);
          // PRESSURE-TO-FIRE (phones with graded Touch.force only): a firm press shoots while you steer. Self-calibrating —
          // we only trust force once we've seen a value strictly between 0 and 1, so a device reporting a constant 0 (no
          // support) or a constant 1 never trips it. iOS emits touchmove on force change, so this updates even while still.
          const f = (typeof t.force === "number") ? t.force : 0;
          if (f > 0.02 && f < 0.98) this._forceSeen = true;
          s.forceFire = this._forceSeen && f >= 0.55;
          if (s.reposition) { this.stickBase = { x: p.x, y: p.y, set: true }; continue; }
          if (s.pending) {
            if (Math.hypot(p.x - s.sx, p.y - s.sy) > TAP_MOVE || (this._now - s.t0) > TAP_MS) { s.pending = false; s.active = true; }
            else continue;   // still might be a quick tap
          }
          // base STAYS anchored where the press began — clamp the throw at STICK_MAX, never recenter to follow the finger
          let vx = p.x - s.baseX, vy = p.y - s.baseY, d = Math.hypot(vx, vy);
          if (d > STICK_MAX) { const nx = vx / d, ny = vy / d; vx = nx * STICK_MAX; vy = ny * STICK_MAX; d = STICK_MAX; }
          s.kx = s.baseX + vx; s.ky = s.baseY + vy;
          if (d > 0.001) { s.dx = vx / d; s.dy = vy / d; } else { s.dx = 0; s.dy = 0; }
          s.mag = Math.min(1, d / STICK_MAX);
        }
      };
      const onEnd = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === s.id) {
            if (s.reposition) this.shell.storage.set("asteroids:stick", { x: this._staticBase().x, y: this._staticBase().y });
            else if (s.pending && this.tapFire) this._fireReq = true;   // quick tap -> fire
            s.active = false; s.pending = false; s.reposition = false; s.id = null; s.mag = 0; s.forceFire = false;
          }
          if (t.identifier === this.fireId) { this.firing = false; this.fireId = null; }
        }
      };
      canvas.addEventListener("touchstart", onStart, { passive: false });
      canvas.addEventListener("touchmove", onMove, { passive: false });
      canvas.addEventListener("touchend", onEnd, { passive: false });
      canvas.addEventListener("touchcancel", onEnd, { passive: false });
      this._unsub.push(() => { canvas.removeEventListener("touchstart", onStart); canvas.removeEventListener("touchmove", onMove); canvas.removeEventListener("touchend", onEnd); canvas.removeEventListener("touchcancel", onEnd); });
    }

    // cycle through the currently-available weapons (for touch + Q/E)
    _cycleWeapon(dir) {
      const avail = WEAPONS.filter(w => this._has(w.id));
      if (avail.length < 2) return;
      let i = avail.findIndex(w => w.id === this.weapon);
      i = (i + dir + avail.length) % avail.length;
      this.weapon = avail[i].id; this.audio.play("select");
    }

    _spawnShip(center) { this.ship = { x: this._w / 2, y: this._h / 2, vx: 0, vy: 0, angle: -Math.PI / 2, thrusting: false, alive: true, radius: SHIP_R, invuln: center ? 1500 : INVULN }; }
    _respawnShip() { const s = this.ship; s.x = this._w / 2; s.y = this._h / 2; s.vx = 0; s.vy = 0; s.angle = -Math.PI / 2; s.alive = true; s.invuln = INVULN; s.thrusting = false; }

    _nextWave() {
      this.wave++;
      const count = Math.min(11, 3 + this.wave);
      for (let i = 0; i < count; i++) this._spawnAsteroid(3);
      this._applyTempo();
      if (this.wave > 1) this._toast("WAVE " + this.wave, true);
    }

    _spawnAsteroid(size, x, y) {
      if (x == null) {
        const safe = Math.min(170, Math.hypot(this._w, this._h) * 0.4); let tries = 0;
        do { x = rand(0, this._w); y = rand(0, this._h); } while (this.ship && Math.hypot(x - this.ship.x, y - this.ship.y) < safe && ++tries < 40);
      }
      const sp = rand(30, 60) + (3 - size) * 30 + this.wave * 3, dir = rand(0, Math.PI * 2);
      this.asteroids.push({ x: x, y: y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, radius: SIZE_R[size], size: size, shape: shape(), angle: rand(0, Math.PI * 2), spin: rand(-1.4, 1.4), slow: 0 });
    }

    _addBullet(x, y, a, w, flags) {
      if (this.bullets.length >= MAX_BULLETS) return;
      const s = this.ship;
      // cap range at ~75% of the playfield extent in the firing direction (so shots don't wrap around forever)
      const range = 0.75 * (Math.abs(Math.cos(a)) * this._w + Math.abs(Math.sin(a)) * this._h);
      const life = (flags && flags.homing) ? w.life : Math.min(w.life, range / (w.speed || 1));
      this.bullets.push(Object.assign({ x: x, y: y, vx: s.vx + Math.cos(a) * w.speed, vy: s.vy + Math.sin(a) * w.speed, life: life, color: w.color, wid: w.id }, flags || {}));
    }

    _fire() {
      const w = WMAP[this.weapon]; if (!w) return;
      const s = this.ship, nx = s.x + Math.cos(s.angle) * s.radius, ny = s.y + Math.sin(s.angle) * s.radius;
      if (w.pellets) { for (let i = 0; i < w.pellets; i++) { const a = s.angle + (i / (w.pellets - 1) - 0.5) * w.fan; this._addBullet(nx, ny, a, w); } }
      else if (w.homing) { for (let i = 0; i < (w.count || 3); i++) { const a = s.angle + (i - (w.count - 1) / 2) * 0.26; this._addBullet(nx, ny, a, w, { homing: true }); } }
      else this._addBullet(nx, ny, s.angle, w, { blast: w.blast || 0, freeze: w.freeze || 0, chain: w.chain || 0, split: w.split || 0, blackhole: !!w.blackhole });
      if (!w.base && !this.dev) { this.ammo[w.id] = (this.ammo[w.id] || 0) - 1; if (this.ammo[w.id] <= 0) { this.weapon = "blaster"; this._toast(w.name + " depleted"); } }
      this.audio.play(w.id === "nuke" ? "boom" : "shoot");
    }

    _hyperspace() {
      if (!this.ship.alive) return;
      this.ship.x = rand(40, this._w - 40); this.ship.y = rand(40, this._h - 40);
      this.ship.vx = 0; this.ship.vy = 0; this.ship.invuln = 1200; this.audio.play("hold");
      if (this.theme.effects.particles) this._burst(this.ship.x, this.ship.y, this.theme.palette.ship, 16);
    }

    _wrap(o) { if (o.x < 0) o.x += this._w; else if (o.x > this._w) o.x -= this._w; if (o.y < 0) o.y += this._h; else if (o.y > this._h) o.y -= this._h; }

    _burst(x, y, color, count, speed) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: x, y: y, count: count, colors: [color, "#ffffff"], speedMin: 40, speedMax: speed || 240, gravity: 0, drag: 0.8, sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "square", spin: 6 });
    }

    _explodeAsteroid(a) {
      this.audio.play("boom");
      this._burst(a.x, a.y, this.theme.palette.asteroid, 8 + a.size * 6, 120 + a.size * 60);
      if (this.theme.effects.shake) this._shake(2 + a.size * 1.6);
      this.score += SIZE_SCORE[a.size]; this._checkExtra();
      if (a.size > 1) { this._spawnAsteroid(a.size - 1, a.x, a.y); this._spawnAsteroid(a.size - 1, a.x, a.y); }
    }

    _nuke(x, y, r) {
      this.audio.play("boom"); this._burst(x, y, this.theme.palette.thrust || "#ff5a5a", 30, 320);
      if (this.theme.effects.shake) this._shake(8);
      for (let j = this.asteroids.length - 1; j >= 0; j--) { const a = this.asteroids[j]; if (Math.hypot(a.x - x, a.y - y) < r + a.radius) { this.asteroids.splice(j, 1); this._explodeAsteroid(a); } }
      if (this.ufo && Math.hypot(this.ufo.x - x, this.ufo.y - y) < r + this.ufo.radius) { this.score += this.ufo.small ? UFO_SCORE.small : UFO_SCORE.big; this._burst(this.ufo.x, this.ufo.y, this.theme.palette.ufo, 24, 280); this.ufo = null; }
    }

    _chainZap(x, y, color, jumps) {
      let cx = x, cy = y; const used = {}; const pts = [{ x: x, y: y }]; const hit = [];
      for (let k = 0; k < jumps; k++) {
        let best = -1, bd = 1e9;
        for (let j = 0; j < this.asteroids.length; j++) { if (used[j]) continue; const a = this.asteroids[j]; const d = Math.hypot(a.x - cx, a.y - cy); if (d < 170 && d < bd) { bd = d; best = j; } }
        if (best < 0) break; used[best] = 1; const a = this.asteroids[best]; pts.push({ x: a.x, y: a.y }); cx = a.x; cy = a.y; hit.push(best);
      }
      hit.sort((p, q) => q - p).forEach(j => { const a = this.asteroids[j]; this.asteroids.splice(j, 1); this._explodeAsteroid(a); });
      if (pts.length > 1) { this.zaps.push({ points: pts, life: 0.22, color: color || "#b388ff" }); if (this.theme.effects.shake) this._shake(3); }
    }

    _spawnBlackhole(x, y) { this.blackholes.push({ x: x, y: y, t: 0, dur: 1.25, range: 200, color: "#c86bff" }); this.audio.play("cryo"); if (this.theme.effects.shake) this._shake(4); }

    _spawnPowerup() {
      const specials = WEAPONS.filter(w => !w.base);
      const locked = specials.filter(w => !this.dev && (this.ammo[w.id] || 0) <= 0);
      const pool = locked.length ? locked : specials, w = pool[(Math.random() * pool.length) | 0];
      const edge = (Math.random() * 4) | 0; let x, y;
      if (edge === 0) { x = rand(0, this._w); y = -16; } else if (edge === 1) { x = this._w + 16; y = rand(0, this._h); }
      else if (edge === 2) { x = rand(0, this._w); y = this._h + 16; } else { x = -16; y = rand(0, this._h); }
      const dir = Math.atan2(this._h / 2 - y, this._w / 2 - x) + rand(-0.5, 0.5), sp = rand(30, 55);
      this.powerups.push({ x: x, y: y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, weapon: w.id, radius: 13, t: 0 });
    }

    _collectPowerup(pu) {
      const w = WMAP[pu.weapon]; this.weapon = pu.weapon; this.ammo[pu.weapon] = (this.ammo[pu.weapon] || 0) + AMMO_GRANT;
      this.audio.play("extralife"); this._toast(w.name + "  x" + (this.dev ? "∞" : this.ammo[pu.weapon]), true);
      this._burst(pu.x, pu.y, w.color || this.theme.palette.accent, 22, 240);
    }

    _checkExtra() { if (this.score >= this.nextExtra) { this.lives++; this.nextExtra += 10000; this.audio.play("extralife"); this._toast("EXTRA SHIP!", true); } }

    _killShip() {
      if (!this.ship.alive || this.ship.invuln > 0 || this.dev) return;
      this.ship.alive = false; this.audio.play("boom");
      this._burst(this.ship.x, this.ship.y, this.theme.palette.ship, 26, 260);
      if (this.theme.effects.shake) this._shake(9);
      this.lives--;
      if (this.lives < 0) { this.lives = 0; this._gameOver(); } else this.respawnT = RESPAWN;
    }

    _gameOver() { if (this.state === "over") return; this.state = "over"; this.audio.stopMusic(); this.shell.requestGameOver({ score: this.score }); }

    _spawnUfo() {
      const small = Math.random() < 0.35 && this.wave >= 3, fromLeft = Math.random() < 0.5;
      this.ufo = { x: fromLeft ? -20 : this._w + 20, y: rand(this._h * 0.15, this._h * 0.85), vx: (fromLeft ? 1 : -1) * rand(90, 140), vy: 0, radius: small ? 12 : 18, small: small, fireCd: 1200, zig: 0 };
      this.audio.play("ufo");
    }
    _ufoFire() {
      const u = this.ufo, s = this.ship;
      const ang = u.small ? Math.atan2(s.y - u.y, s.x - u.x) + rand(-0.12, 0.12) : rand(0, Math.PI * 2);
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
      for (let i = this.zaps.length - 1; i >= 0; i--) { this.zaps[i].life -= s; if (this.zaps[i].life <= 0) this.zaps.splice(i, 1); }
      if (this.state !== "playing") return;

      const I = this.shell.input, ship = this.ship;
      if (ship.invuln > 0) ship.invuln -= dt;
      if (ship.alive) {
        if (this.stick.active && this.stick.mag > 0.18) {   // floating thumbstick: turn toward the push direction, thrust with magnitude
          const desired = Math.atan2(this.stick.dy, this.stick.dx);
          let diff = desired - ship.angle; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          const mt = ROT * 1.7 * s; ship.angle += Math.max(-mt, Math.min(mt, diff));
          ship.thrusting = this.stick.mag > 0.4;
        } else {
          if (I.isDown("ArrowLeft")) ship.angle -= ROT * s;
          if (I.isDown("ArrowRight")) ship.angle += ROT * s;
          ship.thrusting = I.isDown("ArrowUp");
        }
        if (ship.thrusting) {
          ship.vx += Math.cos(ship.angle) * THRUST * s; ship.vy += Math.sin(ship.angle) * THRUST * s;
          if (this.theme.effects.particles && Math.random() < 0.7) {
            const bx = ship.x - Math.cos(ship.angle) * ship.radius, by = ship.y - Math.sin(ship.angle) * ship.radius;
            this.particles.emit({ x: bx, y: by, count: 1, colors: [this.theme.palette.thrust, "#ffffff"], vx: -Math.cos(ship.angle) * 80, vy: -Math.sin(ship.angle) * 80, speedMin: 10, speedMax: 60, sizeMin: 1.5, sizeMax: 3, lifeMin: 0.2, lifeMax: 0.5, glow: this.theme.effects.glow, shape: "square" });
          }
        }
        const sp = Math.hypot(ship.vx, ship.vy); if (sp > MAXV) { ship.vx *= MAXV / sp; ship.vy *= MAXV / sp; }
        ship.vx *= (1 - DRAG * s); ship.vy *= (1 - DRAG * s);
        ship.x += ship.vx * s; ship.y += ship.vy * s; this._wrap(ship);
        this.fireCd -= dt;
        if ((I.isDown("Space") || this.firing || this._fireReq || this.stick.forceFire) && this.fireCd <= 0) { this._fire(); this.fireCd = WMAP[this.weapon].cd; }
        this._fireReq = false;
      } else { this.respawnT -= dt; if (this.respawnT <= 0) this._respawnShip(); }

      // bullets (with homing steer + split/blackhole on expiry)
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (b.homing) {
          let tgt = null, bd = 1e9; for (const a of this.asteroids) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; tgt = a; } }
          if (tgt) { let cur = Math.atan2(b.vy, b.vx); let diff = Math.atan2(tgt.y - b.y, tgt.x - b.x) - cur; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2; const mt = HOMING_TURN * s; cur += Math.max(-mt, Math.min(mt, diff)); const spd = Math.hypot(b.vx, b.vy) || 1; b.vx = Math.cos(cur) * spd; b.vy = Math.sin(cur) * spd; }
        }
        b.x += b.vx * s; b.y += b.vy * s; b.life -= s; this._wrap(b);
        if (b.life <= 0) {
          if (b.split) for (let k = 0; k < b.split; k++) { const a = (k / b.split) * Math.PI * 2; this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, life: 1.1, color: b.color, wid: "frag" }); }
          if (b.blackhole) this._spawnBlackhole(b.x, b.y);
          this.bullets.splice(i, 1);
        }
      }
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) { const b = this.enemyBullets[i]; b.x += b.vx * s; b.y += b.vy * s; b.life -= s; this._wrap(b); if (b.life <= 0) this.enemyBullets.splice(i, 1); }

      // asteroids (slowed by cryo move slower)
      for (const a of this.asteroids) { const f = a.slow > 0 ? AST_SLOW : 1; if (a.slow > 0) a.slow -= s; a.x += a.vx * f * s; a.y += a.vy * f * s; a.angle += a.spin * f * s; this._wrap(a); }

      // powerups
      this.powerupTimer -= dt;
      if (this.powerupTimer <= 0 && this.powerups.length < 2) { this._spawnPowerup(); this.powerupTimer = rand(15000, 26000); }
      for (let i = this.powerups.length - 1; i >= 0; i--) { const pu = this.powerups[i]; pu.x += pu.vx * s; pu.y += pu.vy * s; pu.t += dt; this._wrap(pu); }

      // black holes pull asteroids in, then implode
      for (let i = this.blackholes.length - 1; i >= 0; i--) {
        const bh = this.blackholes[i]; bh.t += s;
        for (const a of this.asteroids) { const dx = bh.x - a.x, dy = bh.y - a.y, d = Math.hypot(dx, dy) || 1; if (d < bh.range) { const fp = BH_PULL * (1 - d / bh.range); a.x += dx / d * fp * s; a.y += dy / d * fp * s; } }
        if (bh.t >= bh.dur) { for (let j = this.asteroids.length - 1; j >= 0; j--) { const a = this.asteroids[j]; if (Math.hypot(a.x - bh.x, a.y - bh.y) < bh.range * 0.75) { this.asteroids.splice(j, 1); this._explodeAsteroid(a); } } this._burst(bh.x, bh.y, bh.color, 30, 320); if (this.theme.effects.shake) this._shake(8); this.blackholes.splice(i, 1); }
      }

      // ufo
      this.ufoTimer -= dt;
      if (!this.ufo && this.ufoTimer <= 0 && this.asteroids.length > 0 && this.wave >= 2) { this._spawnUfo(); this.ufoTimer = rand(16000, 28000); }
      if (this.ufo) { const u = this.ufo; u.zig += s; u.x += u.vx * s; u.y += Math.sin(u.zig * 2.2) * 40 * s; u.fireCd -= dt; if (u.fireCd <= 0 && ship.alive) { this._ufoFire(); u.fireCd = u.small ? 900 : 1400; } if (u.x < -40 || u.x > this._w + 40) this.ufo = null; }

      this._collisions();
      if (this.asteroids.length === 0 && !this.ufo) this._nextWave();
    }

    _collisions() {
      const ast = this.asteroids;
      // bullets vs asteroids (with weapon effects)
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        for (let j = ast.length - 1; j >= 0; j--) {
          const a = ast[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius) {
            if (b.blast) { this._nuke(b.x, b.y, b.blast); this.bullets.splice(i, 1); break; }
            if (b.blackhole) { this._spawnBlackhole(b.x, b.y); this.bullets.splice(i, 1); break; }
            if (b.chain) { this._chainZap(a.x, a.y, b.color, b.chain); this.bullets.splice(i, 1); break; }
            if (b.freeze) { for (const o of ast) if (Math.hypot(o.x - a.x, o.y - a.y) < 90) o.slow = Math.max(o.slow || 0, b.freeze); }
            if (b.split) for (let k = 0; k < b.split; k++) { const ang = (k / b.split) * Math.PI * 2; this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360, life: 1.0, color: b.color, wid: "frag" }); }
            ast.splice(j, 1); this._explodeAsteroid(a); this.bullets.splice(i, 1); break;
          }
        }
      }
      // bullets vs ufo
      if (this.ufo) for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (Math.hypot(this.ufo.x - b.x, this.ufo.y - b.y) < this.ufo.radius + 3) {
          this.bullets.splice(i, 1); this.score += this.ufo.small ? UFO_SCORE.small : UFO_SCORE.big; this._checkExtra();
          this.audio.play("boom"); this._burst(this.ufo.x, this.ufo.y, this.theme.palette.ufo, 24, 280);
          if (this.theme.effects.shake) this._shake(6); this._toast("+" + (this.ufo.small ? UFO_SCORE.small : UFO_SCORE.big)); this.ufo = null; break;
        }
      }
      // bullets vs powerups (shoot to collect)
      for (let i = this.bullets.length - 1; i >= 0; i--) { const b = this.bullets[i]; for (let j = this.powerups.length - 1; j >= 0; j--) { const pu = this.powerups[j]; if (Math.hypot(pu.x - b.x, pu.y - b.y) < pu.radius + 4) { this.powerups.splice(j, 1); this._collectPowerup(pu); this.bullets.splice(i, 1); break; } } }

      if (!this.ship.alive || this.ship.invuln > 0) return;
      const ship = this.ship;
      // ship collects powerups by flying into them
      for (let j = this.powerups.length - 1; j >= 0; j--) { const pu = this.powerups[j]; if (Math.hypot(pu.x - ship.x, pu.y - ship.y) < pu.radius + ship.radius) { this.powerups.splice(j, 1); this._collectPowerup(pu); } }
      for (let j = ast.length - 1; j >= 0; j--) { const a = ast[j]; if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.radius + ship.radius * 0.7) { this._killShip(); return; } }
      if (this.ufo && Math.hypot(this.ufo.x - ship.x, this.ufo.y - ship.y) < this.ufo.radius + ship.radius * 0.7) { this._killShip(); return; }
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) { const b = this.enemyBullets[i]; if (Math.hypot(b.x - ship.x, b.y - ship.y) < ship.radius * 0.8) { this.enemyBullets.splice(i, 1); this._killShip(); return; } }
    }

    // ---------------- render ----------------
    resize(w, h, inset) {
      this._cssW = w; this._cssH = Math.max(120, h - (inset || 0));
      this.zoom = Math.min(this._cssW, this._cssH) < 620 ? 0.55 : 1;   // zoom OUT on phones: ~2x bigger play area, smaller ship
      this._w = this._cssW / this.zoom; this._h = this._cssH / this.zoom;
      this.renderer.resize(this._cssW, this._cssH);
    }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme;
      R.drawBackground(ctx, th, now);
      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1 && !this.paused) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }   // no shake while paused
      ctx.save(); ctx.translate(sx, sy); ctx.scale(this.zoom, this.zoom);   // camera zoom (world space)
      for (const bh of this.blackholes) R.drawBlackhole(ctx, th, bh);
      for (const a of this.asteroids) R.drawAsteroid(ctx, a, th);
      for (const b of this.bullets) R.drawBullet(ctx, b, th);
      for (const b of this.enemyBullets) R.drawBullet(ctx, b, th);
      for (const pu of this.powerups) R.drawPowerup(ctx, th, pu, now, WMAP[pu.weapon]);
      if (this.ufo) R.drawUfo(ctx, this.ufo, th);
      for (const z of this.zaps) R.drawZap(ctx, th, z);
      if (this.ship.alive) R.drawShip(ctx, this.ship, th, now, this.ship.invuln > 0 && (Math.floor(now / 120) % 2 === 0));
      this.particles.render(ctx);
      ctx.restore();
      R.drawHUD(ctx, th, { score: this.score, lives: this.lives, wave: this.wave });
      R.drawWeaponTag(ctx, th, WMAP[this.weapon], this.dev ? "∞" : (WMAP[this.weapon].base ? "∞" : (this.ammo[this.weapon] || 0)), this.dev);
      if (this.shell.isTouch) R.drawTouchControls(ctx, th, this.stick, this.firing, this._cssW, this._cssH, this.ctrlProfile, this._staticBase());
      this._renderToasts(ctx, R, th, now);
      R.drawScanlines(ctx, th);
    }

    _renderToasts(ctx, R, th, now) {
      if (!this.toasts.length) return;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < this.toasts.length; i++) {
        const t = this.toasts[i], pr = (now - t.born) / t.life, alpha = pr < 0.15 ? pr / 0.15 : (1 - (pr - 0.15) / 0.85);
        ctx.globalAlpha = Math.max(0, alpha); ctx.font = "800 " + (t.big ? 30 : 18) + "px " + th.fonts.ui;
        if (th.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = th.palette.accent; }
        ctx.fillStyle = th.palette.accent; ctx.fillText(t.text, this._cssW / 2, this._cssH * 0.3 - pr * 20 + i * 30);
      }
      ctx.restore();
    }
  }

  A.Game = Asteroids;
})(window.Arcade = window.Arcade || {});
