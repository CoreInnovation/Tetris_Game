/* =========================================================
   Missile Defense — Missile Command–style game with a big ARSENAL,
   weapon heat/cooldown (no ammo), powerup unlocks, UFO spaceships,
   special enemies, and panicking civilians. Pointer-driven.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const M = Arcade.Missile;
  const MK = Arcade.MusicKit;

  const INT_SPEED = 640, BLAST_MAX = 60, BLAST_GROW = 175, BLAST_SHRINK = 95, CHAIN_MAX = 34;
  const ENEMY_BASE = 44, AIM_SPEED = 380;
  const BAT_SLOTS = [0, 4, 8], CITY_SLOTS = [1, 2, 3, 5, 6, 7];
  const EJECT_V = 235, COLD_G = 540, EJECT_DELAY = 0.45;
  const BURN_THRUST = 560, BURN_MAX = 470, TURN_RATE = 3.4, BURN_DRAG = 0.9;
  const PANIC_DIST = 195, SLOW_FACTOR = 0.42, HEAT_IDLE = 650, HEAT_DECAY = 0.7, MULT_DURATION = 14000, POW_FAVOR = 0.6;
  const HORNET_SPEED = 510, HORNET_TURN = 10, BH_PULL = 340, ZIG_AMP = 48;

  // Primitive stats only — reload/heat/cool are DERIVED below from a balance model.
  const WEAPONS = [
    { id: "interceptor", name: "INTERCEPTOR", short: "INT", kind: "direct", speed: 640, blast: 60, base: true, sfx: "launch", color: null },
    { id: "missile", name: "WARHEAD", short: "WAR", kind: "cold", speed: 320, blast: 170, sfx: "eject", color: null },
    { id: "artillery", name: "ARTILLERY", short: "ART", kind: "arc", speed: 1150, blast: 74, sfx: "artillery", color: "#ff9a3a" },
    { id: "railgun", name: "RAIL GUN", short: "RAIL", kind: "direct", speed: 2600, blast: 22, sfx: "rail", color: "#7afcff" },
    { id: "flak", name: "FLAK", short: "FLAK", kind: "direct", speed: 760, blast: 34, pellets: 3, spread: 64, sfx: "launch", color: "#ffe14d" },
    { id: "cluster", name: "HAILSTORM", short: "HAIL", kind: "direct", speed: 920, blast: 30, cluster: 8, sfx: "launch", color: "#ff7a3a" },
    { id: "cryo", name: "CRYO PULSE", short: "CRYO", kind: "direct", speed: 700, blast: 95, slow: 3.5, sfx: "cryo", color: "#8fd9ff" },
    { id: "hornets", name: "HORNETS", short: "HORN", kind: "swarm", speed: 510, blast: 32, pellets: 5, sfx: "launch", color: "#9aff6a" },
    { id: "tesla", name: "TESLA COIL", short: "TSLA", kind: "direct", speed: 1700, blast: 28, chain: 5, weight: 2.6, sfx: "rail", color: "#b388ff" },
    { id: "singularity", name: "SINGULARITY", short: "SING", kind: "arc", speed: 760, blast: 120, blackhole: true, weight: 1.6, sfx: "cryo", color: "#c86bff" },
    // homing interceptors — quarter-size blast, but they track the target themselves (hand-tuned)
    // homing interceptors that COLD-LAUNCH like the warhead (eject -> ignite -> home); quarter-size blast
    { id: "seeker", name: "SEEKER", short: "SEEK", kind: "cold", homing: true, speed: 320, blast: 15, pellets: 1, reload: 460, mag: 5, cd: 1100, manual: true, sfx: "eject", color: "#9affd0" }
  ];
  // ---- balance model ----
  // reload = time between shots (from blast coverage x impacts and speed-to-target).
  // BURST MAGAZINE: a weapon fires up to `mag` shots rapidly, then locks for a `cd` cooldown
  // before refilling. Lighter/faster weapons get bigger bursts; heavy weapons get small ones.
  (function deriveBalance() {
    const REF_AREA = Math.PI * 60 * 60, REF_SPEED = 640, BASE_R = 190;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    for (const w of WEAPONS) {
      if (w.manual) continue; // weapon supplies its own reload/mag/cd
      const r = w.blast, pellets = w.pellets || 1, cluster = w.cluster || 0, chain = w.chain || 0;
      let area = cluster ? (Math.PI * r * r + cluster * Math.PI * (r * 0.85) * (r * 0.85)) : (pellets * Math.PI * r * r);
      if (w.slow) area *= 1.7;
      if (w.blackhole) area *= 1.4;
      const cov = area / REF_AREA;
      const impacts = cluster ? (1 + cluster) : (pellets + chain);
      const weight = w.weight || 1;
      w.reload = Math.round(clamp(BASE_R * Math.pow(cov, 0.7) * Math.pow(impacts, 0.25) * weight, 130, 950) / 5) * 5;
      w.mag = Math.max(3, Math.min(10, Math.round(7 / Math.pow(cov, 0.32))));      // shots to overheat
      w.cd = Math.max(950, Math.min(2800, Math.round(950 + cov * 190)));            // overheat lockout (substantial so you feel it)
    }
  })();
  const WMAP = {}; WEAPONS.forEach(w => WMAP[w.id] = w);
  M.WEAPONS = WEAPONS;

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
      this.pointerInput = true; this.dev = false;
      this._unsub = []; this.paused = false; this.state = "playing"; this._now = 0;
      this._w = 800; this._h = 600; this.weaponChips = [];
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      this.score = 0; this.wave = 0;
      this.batteries = BAT_SLOTS.map(s => ({ slot: s, alive: true, x: 0 }));
      this.cities = CITY_SLOTS.map(s => ({ slot: s, alive: true, x: 0, panic: false }));
      this.enemies = []; this.interceptors = []; this.explosions = []; this.powerups = [];
      this.pendingBlasts = []; this.ufos = []; this.zaps = []; this.blackholes = [];
      this.weapon = "interceptor";
      this.unlocked = { interceptor: true };
      this.collected = ["interceptor"];   // up to 4 held weapons (non-dev inventory)
      if (this.dev) WEAPONS.forEach(w => { this.unlocked[w.id] = true; });
      this.reload = {}; this.cdT = {}; this.heat = {}; this.idleT = {};
      WEAPONS.forEach(w => { this.reload[w.id] = 0; this.cdT[w.id] = 0; this.heat[w.id] = 0; this.idleT[w.id] = 9999; });
      this.multishot = 1; this.multishotT = 0;
      this.tracers = []; this.sirenT = 0; this.crowdT = 0; this._prevPanic = false; this.peopleCdT = 0;
      this.pending = 0; this.spawnT = 0; this.spawnGap = 1200; this.enemySpeed = ENEMY_BASE;
      this.powerupT = rand(6000, 10000); this.ufoT = rand(11000, 17000);
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
    toggleDev() {
      this.dev = !this.dev;
      if (this.dev) WEAPONS.forEach(w => { this.unlocked[w.id] = true; });
      else { WEAPONS.forEach(w => { this.unlocked[w.id] = false; }); this.collected.forEach(id => { this.unlocked[id] = true; }); if (!this.unlocked[this.weapon]) this.weapon = "interceptor"; }
      this._layoutChips();
      this._toast(this.dev ? "DEV MODE ON — all weapons" : "DEV MODE OFF");
      return this.dev;
    }

    _bindInput() {
      const input = this.shell.input, canvas = this.shell.canvas;
      this._unsub.push(input.onDown((code, e, repeat) => {
        if (this.paused || this.state !== "playing" || repeat) return;
        if (code.indexOf("Digit") === 0) { const n = parseInt(code.slice(5), 10) - 1; if (n >= 0 && n < WEAPONS.length) this._selectWeapon(WEAPONS[n].id); return; }
        if (code === "Space") this._fire(this.aim.x, this.aim.y);
        else if (code === "KeyQ") this._selectWeapon(this._prevUnlocked());
        else if (code === "KeyE") this._selectWeapon(this._nextUnlocked());
      }));
      const toLocal = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (this._w / r.width), y: (e.clientY - r.top) * (this._h / r.height) };
      };
      this._pm = (e) => { if (this.paused || this.state !== "playing") return; const p = toLocal(e); this.aim.x = p.x; this.aim.y = p.y; };
      this._pd = (e) => {
        if (this.paused || this.state !== "playing") return; e.preventDefault();
        const p = toLocal(e);
        for (const ch of this.weaponChips) { if (p.x >= ch.x && p.x <= ch.x + ch.w && p.y >= ch.y && p.y <= ch.y + ch.h) { this._selectWeapon(ch.id); return; } }
        this.aim.x = p.x; this.aim.y = p.y; this._fire(p.x, p.y);
      };
      canvas.addEventListener("pointermove", this._pm);
      canvas.addEventListener("pointerdown", this._pd);
    }

    _selectWeapon(id) { if (id && this.unlocked[id]) { this.weapon = id; this.audio.play("select"); } else this.audio.play("pill"); }
    _unlockedIds() { return WEAPONS.filter(w => this.unlocked[w.id]).map(w => w.id); }
    _nextUnlocked() { const u = this._unlockedIds(); return u[(u.indexOf(this.weapon) + 1) % u.length]; }
    _prevUnlocked() { const u = this._unlockedIds(); return u[(u.indexOf(this.weapon) - 1 + u.length) % u.length]; }

    _layout(w, h) {
      this.groundY = h - 46;
      const slotW = (w - 56) / 9, sx = i => 28 + slotW * (i + 0.5);
      this.batteries.forEach(b => b.x = sx(b.slot));
      this.cities.forEach(c => c.x = sx(c.slot));
      this.slotW = slotW;
      this._layoutChips();
    }

    // Weapon chips: dev shows ALL, normal play shows just your collected inventory (<=4). Centered, wraps to rows.
    _layoutChips() {
      const w = this._w || 800;
      const ids = this.dev ? WEAPONS.map(wp => wp.id) : (this.collected ? this.collected.slice() : ["interceptor"]);
      const n = ids.length, gap = 6, ch = 30;
      const cols = Math.max(1, Math.min(n, Math.floor((w - 16) / 64)));
      const cw = Math.max(54, Math.min(110, Math.floor((w - 16 - (cols - 1) * gap) / cols)));
      this.weaponChips = [];
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), c = i % cols, rowCount = Math.min(cols, n - r * cols);
        const total = rowCount * cw + (rowCount - 1) * gap, startX = Math.round((w - total) / 2);
        this.weaponChips.push({ id: ids[i], x: startX + c * (cw + gap), y: 50 + r * (ch + 6), w: cw, h: ch });
      }
    }

    // Collect a weapon into the 4-slot inventory (drops the oldest spare past 4), then equip it.
    _collectWeapon(id) {
      if (!this.collected.includes(id)) {
        this.collected.push(id); this.unlocked[id] = true;
        while (this.collected.length > 4) {
          const drop = this.collected.find(wid => wid !== "interceptor" && wid !== id && wid !== this.weapon);   // never drop the base, the new one, or what you're holding
          if (!drop) break;
          this.collected.splice(this.collected.indexOf(drop), 1); this.unlocked[drop] = false;
        }
      }
      this.weapon = id; this._layoutChips();
    }

    _nextWave() {
      this.wave++;
      this.batteries.forEach(b => { b.alive = true; });
      this.pending = 5 + this.wave * 2;
      this.spawnGap = Math.max(380, 1300 - this.wave * 90);
      this.spawnT = 800;
      this.enemySpeed = ENEMY_BASE + this.wave * 6;
      this.explosions.length = 0; this.pendingBlasts.length = 0; this.blackholes.length = 0; this.tracers.length = 0;   // clean slate so last wave's ordnance can't hit the new one
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
      const dx = target.x - sx, dy = this.groundY - sy, d = Math.hypot(dx, dy) || 1;
      const m = { sx: sx, sy: sy, x: sx, y: sy, vx: dx / d * this.enemySpeed, vy: dy / d * this.enemySpeed, splitY: null, slow: 0, zig: false };
      if (this.wave >= 3 && Math.random() < 0.24) m.splitY = rand(this._h * 0.3, this._h * 0.5);
      else if (this.wave >= 2 && Math.random() < 0.28) { m.zig = true; m.zphase = rand(0, 6.28); }
      this.enemies.push(m);
    }

    _spawnPowerup() {
      const x = rand(this._w * 0.15, this._w * 0.85), vy = this.enemySpeed * 1.5 + 40;
      if (Math.random() < 0.32) {   // sometimes drop a MULTI-FIRE pod instead of a weapon
        const mult = Math.random() < 0.62 ? 2 : 3;
        this.powerups.push({ x: x, y: -12, vy: vy, kind: "mult", mult: mult, radius: 15, t: 0 });
        return;
      }
      const specials = WEAPONS.filter(w => !w.base);
      const locked = specials.filter(w => !this.unlocked[w.id]);
      const pool = locked.length ? locked : specials;
      const w = pool[(Math.random() * pool.length) | 0];
      this.powerups.push({ x: x, y: -12, vy: vy, weapon: w.id, radius: 14, t: 0 });
    }

    _collectPowerup(pu) {
      if (pu.kind === "mult") {
        this.multishot = Math.max(this.multishot || 1, pu.mult); this.multishotT = MULT_DURATION;
        this.audio.play("extralife");
        this._toast((pu.mult === 3 ? "TRIPLE" : "DOUBLE") + " FIRE!  ×" + pu.mult, true);
        if (this.theme.effects.particles) this.particles.emit({ x: pu.x, y: pu.y, count: 28,
          colors: ["#ffd24a", "#ffae3b", "#ffffff"], speedMin: 50, speedMax: 280, gravity: 60, drag: 1,
          sizeMin: 1.5, sizeMax: 4, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "circle", spin: 6 });
        return;
      }
      const w = WMAP[pu.weapon], wasNew = !this.collected.includes(pu.weapon);
      this._collectWeapon(pu.weapon);   // adds to the 4-slot inventory + equips
      this.heat[pu.weapon] = 0; this.cdT[pu.weapon] = 0; this.reload[pu.weapon] = 0;
      this.audio.play("extralife");
      this._toast((wasNew ? "GOT — " : "") + w.name + "!", true);
      if (this.theme.effects.particles) this.particles.emit({ x: pu.x, y: pu.y, count: 26,
        colors: [w.color || this.theme.palette.powerup, this.theme.palette.exhaust, "#ffffff"],
        speedMin: 50, speedMax: 280, gravity: 60, drag: 1, sizeMin: 1.5, sizeMax: 4, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "circle", spin: 6 });
    }

    // a panicking civilian fires a harmless tracer up at the nearest incoming missile (does nothing — they're just trying!)
    _spawnTracer(cx) {
      let tx = cx, ty = 60, bd = 1e9;
      for (const m of this.enemies) { const d = Math.abs(m.x - cx); if (d < bd) { bd = d; tx = m.x; ty = m.y; } }
      const px = cx + rand(-22, 22), py = this.groundY - 9;
      const dx = (tx - px) + rand(-26, 26), dy = (ty - py), d = Math.hypot(dx, dy) || 1, sp = rand(440, 600);
      this.tracers.push({ x: px, y: py, vx: dx / d * sp, vy: dy / d * sp, life: rand(0.32, 0.6) });
      if (this.theme.effects.particles && Math.random() < 0.5) this.particles.emit({ x: px, y: py - 2, count: 2, colors: ["#ffe08a", "#ffffff"],
        speedMin: 8, speedMax: 46, gravity: 0, drag: 2.2, sizeMin: 1, sizeMax: 2, lifeMin: 0.08, lifeMax: 0.22, glow: this.theme.effects.glow, shape: "circle" });
    }

    // homing projectiles vacuum up any powerup they touch (the projectile keeps flying)
    _catchPowerups(it) {
      for (let pi = this.powerups.length - 1; pi >= 0; pi--) {
        const pu = this.powerups[pi];
        if (Math.hypot(pu.x - it.x, pu.y - it.y) < pu.radius + 12) { this.powerups.splice(pi, 1); this._collectPowerup(pu); }
      }
    }

    _spawnUfo() {
      const fromLeft = Math.random() < 0.5;
      this.ufos.push({ x: fromLeft ? -30 : this._w + 30, y: rand(60, this._h * 0.4), vx: (fromLeft ? 1 : -1) * rand(70, 115), bombT: rand(1000, 2000), radius: 16, zig: 0 });
      this.audio.play("ufo");
    }

    // build a projectile carrying the active weapon's payload flags
    _proj(w, bx, by, tx, ty, extra) {
      const base = { bx: bx, by: by, x: bx, y: by, tx: tx, ty: ty, weapon: w.id, blast: w.blast,
        color: w.color, cluster: w.cluster || 0, slow: w.slow || 0, chain: w.chain || 0, blackhole: !!w.blackhole };
      return Object.assign(base, extra || {});
    }

    _muzzle(bx, by, w) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: bx, y: by - 2, count: 9,
        colors: [w.color || this.theme.palette.exhaust || this.theme.palette.battery, "#ffffff"],
        speedMin: 30, speedMax: 160, angleMin: -Math.PI * 0.88, angleMax: -Math.PI * 0.12,
        gravity: 120, drag: 1.2, sizeMin: 1.5, sizeMax: 3.4, lifeMin: 0.2, lifeMax: 0.55, glow: this.theme.effects.glow, shape: "circle" });
    }

    _fire(tx, ty) {
      if (ty >= this.groundY - 4) ty = this.groundY - 4;
      const w = WMAP[this.weapon];
      if ((this.cdT[this.weapon] || 0) > 0) { this.audio.play("pill"); return; }   // cooling down
      if ((this.reload[this.weapon] || 0) > 0) return;
      let best = null, bd = Infinity;
      for (const b of this.batteries) if (b.alive) { const d = Math.abs(b.x - tx); if (d < bd) { bd = d; best = b; } }
      if (!best) { this.audio.play("pill"); return; }
      const m = this.multishot || 1, pen = 1 + (m - 1) * 0.5;   // ×2 -> 1.5x, ×3 -> 2x heat & reload "for the extra"
      this.reload[this.weapon] = w.reload * pen; this.idleT[this.weapon] = 0;
      this.heat[this.weapon] += (1 / w.mag) * pen;
      if (this.heat[this.weapon] >= 1) { this.heat[this.weapon] = 1; this.cdT[this.weapon] = w.cd; }   // OVERHEAT -> forced cooldown
      const bx = best.x, by = this.groundY - 14;
      this.audio.play(w.sfx);
      for (let mi = 0; mi < m; mi++) this._launch(w, bx, by, tx + (mi - (m - 1) / 2) * 44, ty);   // salvo fans out with a slight spread
    }

    // spawn ONE shot of weapon w aimed at (tx,ty) — called once per missile in a multi-fire salvo
    _launch(w, bx, by, tx, ty) {
      if (w.kind === "cold") {
        const n = w.pellets || 1;
        for (let i = 0; i < n; i++) {
          this.interceptors.push(this._proj(w, bx, by, tx, ty, { vx: rand(-26, 26) + (i - (n - 1) / 2) * 16, vy: -EJECT_V, mode: "eject",
            igniteTimer: EJECT_DELAY, ignited: false, guided: true, fuse: 4.5, heading: -Math.PI / 2, homing: !!w.homing }));
        }
        if (this.theme.effects.particles) this.particles.emit({ x: bx, y: by - 4, count: 12, colors: ["#cfd6df", "#ffffff", "#9aa0aa"],
          speedMin: 20, speedMax: 110, angleMin: -Math.PI * 0.95, angleMax: -Math.PI * 0.05, gravity: 90, drag: 1.4,
          sizeMin: 2, sizeMax: 4.5, lifeMin: 0.3, lifeMax: 0.8, glow: false, shape: "circle" });
      } else if (w.kind === "arc") {
        const dx = tx - bx, dy = ty - by, dist = Math.hypot(dx, dy) || 1;
        let nx = -dy / dist, ny = dx / dist; if (ny > 0) { nx = -nx; ny = -ny; }
        const bow = Math.max(45, Math.min(150, dist * 0.34));
        this.interceptors.push(this._proj(w, bx, by, tx, ty, { mode: "arc",
          p1x: (bx + tx) / 2 + nx * bow, p1y: (by + ty) / 2 + ny * bow, t: 0, dur: Math.max(0.3, dist / w.speed) }));
        this._muzzle(bx, by, w);
      } else if (w.kind === "swarm") {
        const n = w.pellets || 4;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.38;   // tighter fan so the swarm converges on targets faster
          this.interceptors.push(this._proj(w, bx, by, tx, ty, { mode: "home",
            vx: Math.cos(a) * HORNET_SPEED, vy: Math.sin(a) * HORNET_SPEED, heading: a, fuse: 4.2 }));
        }
        this._muzzle(bx, by, w);
      } else {
        const pellets = w.pellets || 1;
        for (let i = 0; i < pellets; i++) {
          let ax = tx, ay = ty;
          if (pellets > 1) { ax = tx + (i - (pellets - 1) / 2) * (w.spread || 50) * 0.6 + rand(-8, 8); ay = ty + rand(-(w.spread || 50) * 0.25, (w.spread || 50) * 0.25); }
          const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy) || 1;
          this.interceptors.push(this._proj(w, bx, by, ax, ay, { vx: dx / d * w.speed, vy: dy / d * w.speed }));
        }
        this._muzzle(bx, by, w);
      }
    }

    _blast(x, y, maxR, color) {
      this.explosions.push({ x: x, y: y, r: 0, maxR: maxR, phase: "grow", color: color || this.theme.palette.blast });
      this.audio.play("boom");
      if (this.theme.effects.particles) this.particles.emit({ x: x, y: y, count: Math.round(maxR / 3),
        colors: [color || this.theme.palette.blast, "#ffffff"], speedMin: 40, speedMax: maxR * 4, gravity: 60, drag: 1,
        sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.3, lifeMax: 0.8, glow: this.theme.effects.glow, shape: "circle" });
      if (this.theme.effects.shake) this._shake(Math.min(10, maxR / 8));
    }

    _detonate(it) {
      if (it.blackhole) { this._spawnBlackhole(it.x, it.y, it.color); return; }
      this._blast(it.x, it.y, it.blast, it.color);
      if (it.chain) this._chainZap(it.x, it.y, it.color, it.chain);
      if (it.cluster) {
        const baseAngles = [rand(0, Math.PI * 2), rand(0, Math.PI * 2)];
        for (let k = 0; k < it.cluster; k++) {
          const a = baseAngles[k % baseAngles.length] + rand(-0.22, 0.22);
          const step = Math.floor(k / baseAngles.length) + 1;
          const dist = 34 + step * rand(42, 60);
          let bx = it.x + Math.cos(a) * dist + rand(-16, 16), by = it.y + Math.sin(a) * dist + rand(-16, 16);
          bx = Math.max(10, Math.min(this._w - 10, bx)); by = Math.max(10, Math.min(this.groundY - 4, by));
          this.pendingBlasts.push({ x: bx, y: by, r: Math.round(it.blast * 0.85), color: it.color, delay: step * 70 + rand(0, 45) });
        }
      }
      if (it.slow) {
        const sr = it.blast * 1.8; let n = 0;
        for (const m of this.enemies) if (Math.hypot(m.x - it.x, m.y - it.y) < sr) { m.slow = Math.max(m.slow || 0, it.slow); n++; }
        if (n && this.theme.effects.particles) this.particles.emit({ x: it.x, y: it.y, count: 18, colors: ["#bfeaff", "#ffffff"],
          speedMin: 30, speedMax: sr * 3, gravity: 0, drag: 1.4, sizeMin: 1.5, sizeMax: 3, lifeMin: 0.4, lifeMax: 1.0, glow: true, shape: "circle" });
      }
    }

    _chainZap(x, y, color, maxJumps) {
      let cx = x, cy = y; const used = {}; const pts = [{ x: x, y: y }]; const hit = [];
      for (let j = 0; j < maxJumps; j++) {
        let best = -1, bd = 1e9;
        for (let k = 0; k < this.enemies.length; k++) { if (used[k]) continue; const m = this.enemies[k]; const d = Math.hypot(m.x - cx, m.y - cy); if (d < 155 && d < bd) { bd = d; best = k; } }
        if (best < 0) break;
        used[best] = 1; const m = this.enemies[best]; pts.push({ x: m.x, y: m.y }); cx = m.x; cy = m.y; hit.push(best);
      }
      hit.sort((a, b) => b - a).forEach(k => { const m = this.enemies[k]; this.score += 25 * this.wave; this._burst(m.x, m.y, color, 6); this.enemies.splice(k, 1); });
      if (pts.length > 1) { this.zaps.push({ points: pts, life: 0.22, color: color || "#b388ff" }); this.audio.play("zap"); if (this.theme.effects.shake) this._shake(3); }
    }

    _spawnBlackhole(x, y, color) {
      this.blackholes.push({ x: x, y: y, t: 0, dur: 1.15, range: 200, color: color || "#c86bff" });
      this.audio.play("whoosh");   // black-hole forms with a swirling woosh
      if (this.theme.effects.shake) this._shake(4);
    }

    _destroyStructure(x) {
      let hit = null, hd = this.slotW * 0.55;
      for (const c of this.cities) if (c.alive && Math.abs(c.x - x) < hd) { hit = c; break; }
      if (!hit) for (const b of this.batteries) if (b.alive && Math.abs(b.x - x) < hd) { hit = b; break; }
      if (hit) {
        hit.alive = false;
        this._blast(hit.x, this.groundY - 8, 46);
        if (this.theme.effects.shake) this._shake(9);
        this.flash = 1; this._burst(hit.x, this.groundY - 8, this.theme.palette.enemy, 26);
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

      for (const w of WEAPONS) {
        if (this.reload[w.id] > 0) this.reload[w.id] = Math.max(0, this.reload[w.id] - dt);
        this.idleT[w.id] = (this.idleT[w.id] || 0) + dt;
        if (this.cdT[w.id] > 0) { this.cdT[w.id] -= dt; if (this.cdT[w.id] <= 0) { this.cdT[w.id] = 0; this.heat[w.id] = 0; } }
        else if (this.heat[w.id] > 0 && this.idleT[w.id] > HEAT_IDLE) { this.heat[w.id] = Math.max(0, this.heat[w.id] - HEAT_DECAY * s); }   // pause firing and the bar cools off
      }
      for (let i = this.zaps.length - 1; i >= 0; i--) { this.zaps[i].life -= s; if (this.zaps[i].life <= 0) this.zaps.splice(i, 1); }
      if (this.state !== "playing") return;

      const I = this.shell.input;
      if (I.isDown("ArrowLeft")) this.aim.x -= AIM_SPEED * s;
      if (I.isDown("ArrowRight")) this.aim.x += AIM_SPEED * s;
      if (I.isDown("ArrowUp")) this.aim.y -= AIM_SPEED * s;
      if (I.isDown("ArrowDown")) this.aim.y += AIM_SPEED * s;
      this.aim.x = Math.max(0, Math.min(this._w, this.aim.x));
      this.aim.y = Math.max(0, Math.min(this.groundY - 4, this.aim.y));

      if (this.pending > 0) { this.spawnT -= dt; if (this.spawnT <= 0) { this._spawnEnemy(); this.pending--; this.spawnT = this.spawnGap * rand(0.6, 1.4); } }
      this.powerupT -= dt; if (this.powerupT <= 0 && this.powerups.length < 2) { this._spawnPowerup(); this.powerupT = rand(16000, 28000); }
      if (this.multishotT > 0) { this.multishotT -= dt; if (this.multishotT <= 0) { this.multishot = 1; this.multishotT = 0; this._toast("MULTI-FIRE OFF"); } }
      this.ufoT -= dt; if (this.ufoT <= 0 && this.wave >= 2 && this.ufos.length < 1) { this._spawnUfo(); this.ufoT = rand(14000, 24000); }

      // enemies
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const m = this.enemies[i];
        const f = (m.slow > 0) ? SLOW_FACTOR : 1; if (m.slow > 0) m.slow -= s;
        m.x += m.vx * f * s; m.y += m.vy * f * s;
        if (m.zig) m.x += Math.cos(now * 0.006 + m.zphase) * ZIG_AMP * f * s;
        if (m.splitY != null && m.y >= m.splitY) { m.splitY = null; const n = 1 + ((Math.random() * 2) | 0); for (let k = 0; k < n; k++) this._spawnEnemy(m.x, m.y); }
        if (m.y >= this.groundY) { this._destroyStructure(m.x); this.enemies.splice(i, 1); }
      }

      // UFO spaceships
      for (let i = this.ufos.length - 1; i >= 0; i--) {
        const u = this.ufos[i]; u.zig += s; u.x += u.vx * s; u.y += Math.sin(u.zig * 2) * 14 * s;
        u.bombT -= dt; if (u.bombT <= 0) { this._spawnEnemy(u.x, u.y, null); u.bombT = rand(1300, 2400); }
        if (u.x < -50 || u.x > this._w + 50) this.ufos.splice(i, 1);
      }

      // powerups
      for (let i = this.powerups.length - 1; i >= 0; i--) { const pu = this.powerups[i]; pu.y += pu.vy * s; pu.t += dt; if (pu.y > this.groundY) { this.powerups.splice(i, 1); this._burst(pu.x, this.groundY - 6, "#9aa0aa", 8); } }

      // black holes: pull enemies/ufos in, then implode
      for (let i = this.blackholes.length - 1; i >= 0; i--) {
        const bh = this.blackholes[i]; bh.t += s;
        for (const m of this.enemies) { const dx = bh.x - m.x, dy = bh.y - m.y, d = Math.hypot(dx, dy) || 1; if (d < bh.range) { const fp = BH_PULL * (1 - d / bh.range); m.x += dx / d * fp * s; m.y += dy / d * fp * s; } }
        for (const u of this.ufos) { const dx = bh.x - u.x, dy = bh.y - u.y, d = Math.hypot(dx, dy) || 1; if (d < bh.range) { const fp = BH_PULL * 0.7 * (1 - d / bh.range); u.x += dx / d * fp * s; u.y += dy / d * fp * s; } }
        if (bh.t >= bh.dur) { this._blast(bh.x, bh.y, 130, bh.color); if (this.theme.effects.shake) this._shake(9); this.blackholes.splice(i, 1); }
      }

      // interceptors
      for (let i = this.interceptors.length - 1; i >= 0; i--) {
        const it = this.interceptors[i];
        if (it.mode === "eject") {
          it.vy += COLD_G * s; it.x += it.vx * s; it.y += it.vy * s; it.heading = Math.atan2(it.vy, it.vx);
          it.igniteTimer -= s;
          if (it.igniteTimer <= 0) {
            it.mode = "burn"; it.ignited = true; it.heading = Math.atan2(it.ty - it.y, it.tx - it.x);
            if (Math.hypot(it.vx, it.vy) < 30) { it.vx += Math.cos(it.heading) * 30; it.vy += Math.sin(it.heading) * 30; }
            this.audio.play("launch"); if (this.theme.effects.shake) this._shake(4);
            if (this.theme.effects.particles) this.particles.emit({ x: it.x, y: it.y, count: 12, colors: [this.theme.palette.exhaust, this.theme.palette.exhaust2, "#ffffff"],
              speedMin: 30, speedMax: 180, gravity: 40, drag: 1.1, sizeMin: 1.5, sizeMax: 3.6, lifeMin: 0.2, lifeMax: 0.55, glow: true, shape: "circle" });
          }
        } else if (it.mode === "burn") {
          // homing seekers commit to their clicked trajectory first, then go rogue and re-aim at the nearest target
          let tgt = null;
          if (it.homing) {
            if (!it._homeOn) {
              const tot = Math.hypot(it.tx - it.bx, it.ty - it.by) || 1, trav = Math.hypot(it.x - it.bx, it.y - it.by);
              if (trav >= 0.65 * tot) it._homeOn = true;   // flew ~65% of the way, NOW it can chase
            }
            if (it._homeOn) {
              let tEn = null, eD = 1e9, tPow = null, pD = 1e9;
              for (const m of this.enemies) { const d = Math.hypot(m.x - it.x, m.y - it.y); if (d < eD) { eD = d; tEn = m; } }
              for (const u of this.ufos) { const d = Math.hypot(u.x - it.x, u.y - it.y); if (d < eD) { eD = d; tEn = u; } }
              for (const pu of this.powerups) { const d = Math.hypot(pu.x - it.x, pu.y - it.y); if (d < pD) { pD = d; tPow = pu; } }
              tgt = (tPow && pD * POW_FAVOR <= eD) ? tPow : (tEn || tPow);   // favor powerups a little over enemies
              if (tgt) { it.tx = tgt.x; it.ty = tgt.y; }
            }
          }
          const dx = it.tx - it.x, dy = it.ty - it.y, dist = Math.hypot(dx, dy);
          let diff = Math.atan2(dy, dx) - it.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          const mt = (it.homing ? TURN_RATE * 2.4 : TURN_RATE) * s; it.heading += Math.max(-mt, Math.min(mt, diff));   // seekers turn tighter so they don't orbit
          it.vx += Math.cos(it.heading) * BURN_THRUST * s; it.vy += Math.sin(it.heading) * BURN_THRUST * s;
          const dragF = 1 - BURN_DRAG * s; it.vx *= dragF; it.vy *= dragF;
          const sp = Math.hypot(it.vx, it.vy); if (sp > BURN_MAX) { it.vx *= BURN_MAX / sp; it.vy *= BURN_MAX / sp; }
          it.x += it.vx * s; it.y += it.vy * s; it.fuse -= s;
          this._catchPowerups(it);   // grab powerups it flies through (incl. during the committed phase)
          let trig = (dist <= sp * s + 8 || dist < 14 || it.fuse <= 0);
          if (it.homing && tgt) { if (dist < 28) trig = true; else if (it.prevd != null && dist > it.prevd && dist < 95) trig = true; it.prevd = dist; }
          if (trig) {
            if (it.homing && tgt && Math.hypot(tgt.x - it.x, tgt.y - it.y) < 95) {   // a seeker reliably kills its mark
              const ei = this.enemies.indexOf(tgt);
              if (ei >= 0) { this.enemies.splice(ei, 1); this.score += 25 * this.wave; this._burst(tgt.x, tgt.y, it.color, 7); }
              else { const ui = this.ufos.indexOf(tgt); if (ui >= 0) { this.ufos.splice(ui, 1); const pts = 150 + this.wave * 25; this.score += pts; this._toast("UFO! +" + pts, true); this._burst(tgt.x, tgt.y, "#46f0c0", 20); } }
            }
            this._detonate(it); this.interceptors.splice(i, 1);
          }
        } else if (it.mode === "arc") {
          it.t += s / it.dur;
          if (it.t >= 1) { it.x = it.tx; it.y = it.ty; this._detonate(it); this.interceptors.splice(i, 1); }
          else {
            const u = it.t, iu = 1 - u;
            it.x = iu * iu * it.bx + 2 * iu * u * it.p1x + u * u * it.tx;
            it.y = iu * iu * it.by + 2 * iu * u * it.p1y + u * u * it.ty;
            if (this.theme.effects.particles && Math.random() < 0.6) this.particles.emit({ x: it.x, y: it.y, count: 1, colors: ["#cfd0d6", it.color || "#ffffff"], speedMin: 2, speedMax: 18, gravity: 30, drag: 1.5, sizeMin: 1.2, sizeMax: 2.6, lifeMin: 0.25, lifeMax: 0.55, glow: false, shape: "circle" });
          }
        } else if (it.mode === "home") {
          let tgt = null, bd = 1e9, tEn = null, eD = 1e9, tPow = null, pD = 1e9;
          for (const m of this.enemies) { const d = Math.hypot(m.x - it.x, m.y - it.y); if (d < eD) { eD = d; tEn = m; } }
          for (const u of this.ufos) { const d = Math.hypot(u.x - it.x, u.y - it.y); if (d < eD) { eD = d; tEn = u; } }
          for (const pu of this.powerups) { const d = Math.hypot(pu.x - it.x, pu.y - it.y); if (d < pD) { pD = d; tPow = pu; } }
          if (tPow && pD * POW_FAVOR <= eD) { tgt = tPow; bd = pD; } else if (tEn) { tgt = tEn; bd = eD; } else if (tPow) { tgt = tPow; bd = pD; }   // favor powerups a little
          const aimx = tgt ? tgt.x : it.tx, aimy = tgt ? tgt.y : it.ty;
          let diff = Math.atan2(aimy - it.y, aimx - it.x) - it.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          const mt = HORNET_TURN * s; it.heading += Math.max(-mt, Math.min(mt, diff));
          it.vx = Math.cos(it.heading) * HORNET_SPEED; it.vy = Math.sin(it.heading) * HORNET_SPEED;
          it.x += it.vx * s; it.y += it.vy * s; it.fuse -= s;
          this._catchPowerups(it);   // hornets scoop up powerups too
          if (this.theme.effects.particles && Math.random() < 0.5) this.particles.emit({ x: it.x, y: it.y, count: 1, colors: [it.color || "#9aff6a", "#ffffff"], speedMin: 2, speedMax: 20, gravity: 0, drag: 1.6, sizeMin: 1.2, sizeMax: 2.4, lifeMin: 0.2, lifeMax: 0.5, glow: this.theme.effects.glow, shape: "circle" });
          let trig = false;
          if (tgt) { if (bd < 28) trig = true; else if (it.prevd != null && bd > it.prevd && bd < 95) trig = true; it.prevd = bd; }
          if (trig || it.fuse <= 0 || it.y > this.groundY) {
            if (tgt && Math.hypot(tgt.x - it.x, tgt.y - it.y) < 95) {  // a homing missile reliably kills its mark (matches the flyby trigger radius)
              const ei = this.enemies.indexOf(tgt);
              if (ei >= 0) { this.enemies.splice(ei, 1); this.score += 25 * this.wave; this._burst(tgt.x, tgt.y, it.color, 13); if (this.theme.effects.shake) this._shake(3); }
              else { const ui = this.ufos.indexOf(tgt); if (ui >= 0) { this.ufos.splice(ui, 1); const pts = 150 + this.wave * 25; this.score += pts; this._toast("UFO! +" + pts, true); this._burst(tgt.x, tgt.y, "#46f0c0", 20); if (this.theme.effects.shake) this._shake(6); } }
            }
            this._detonate(it); this.interceptors.splice(i, 1);
          }
        } else {
          const dx = it.tx - it.x, dy = it.ty - it.y, d = Math.hypot(dx, dy);
          if (d <= WMAP[it.weapon].speed * s + 4) { it.x = it.tx; it.y = it.ty; this._detonate(it); this.interceptors.splice(i, 1); }
          else { it.x += it.vx * s; it.y += it.vy * s; }
        }
      }
      // rocket exhaust trail (ignited rockets only; not arc/home)
      if (this.theme.effects.particles) {
        for (const it of this.interceptors) {
          if (it.mode === "arc" || it.mode === "home") continue;
          const isRocket = it.weapon === "missile" || this.theme.missileStyle === "rocket";
          if (!isRocket || it.ignited === false) continue;
          const ang = Math.atan2(it.vy, it.vx);
          this.particles.emit({ x: it.x - Math.cos(ang) * 9, y: it.y - Math.sin(ang) * 9, count: 1,
            colors: [this.theme.palette.exhaust, this.theme.palette.exhaust2, "#9aa0aa"],
            vx: -Math.cos(ang) * 26, vy: -Math.sin(ang) * 26, speedMin: 4, speedMax: 36, gravity: -8, drag: 1.6,
            sizeMin: 1.4, sizeMax: 3.4, lifeMin: 0.25, lifeMax: 0.6, glow: this.theme.effects.glow, shape: "circle" });
        }
      }

      // staggered carpet sub-blasts
      for (let i = this.pendingBlasts.length - 1; i >= 0; i--) { const pb = this.pendingBlasts[i]; pb.delay -= dt; if (pb.delay <= 0) { this._blast(pb.x, pb.y, pb.r, pb.color); this.pendingBlasts.splice(i, 1); } }

      // explosions: destroy enemies / UFOs / collect powerups (chain)
      for (let i = this.explosions.length - 1; i >= 0; i--) {
        const ex = this.explosions[i];
        if (ex.phase === "grow") { ex.r += BLAST_GROW * s; if (ex.r >= ex.maxR) { ex.r = ex.maxR; ex.phase = "shrink"; } } else { ex.r -= BLAST_SHRINK * s; }
        for (let j = this.enemies.length - 1; j >= 0; j--) { const m = this.enemies[j]; if (Math.hypot(m.x - ex.x, m.y - ex.y) < ex.r) { this.enemies.splice(j, 1); this.score += 25 * this.wave; this._burst(m.x, m.y, this.theme.palette.enemy, 8); this._blast(m.x, m.y, CHAIN_MAX, ex.color); } }
        for (let j = this.ufos.length - 1; j >= 0; j--) { const u = this.ufos[j]; if (Math.hypot(u.x - ex.x, u.y - ex.y) < ex.r + u.radius) { this.ufos.splice(j, 1); const pts = 150 + this.wave * 25; this.score += pts; this._burst(u.x, u.y, "#46f0c0", 26); this._toast("UFO! +" + pts, true); if (this.theme.effects.shake) this._shake(6); } }
        for (let j = this.powerups.length - 1; j >= 0; j--) { const pu = this.powerups[j]; if (Math.hypot(pu.x - ex.x, pu.y - ex.y) < ex.r + pu.radius) { this.powerups.splice(j, 1); this._collectPowerup(pu); } }
        if (ex.r <= 0) this.explosions.splice(i, 1);
      }

      let anyPanic = false;
      for (const c of this.cities) {
        if (!c.alive) { c.panic = false; continue; }
        c.panic = this.enemies.some(m => Math.hypot(m.x - c.x, m.y - this.groundY) < PANIC_DIST);
        if (c.panic) { anyPanic = true; if (this.enemies.length && this.tracers.length < 64 && Math.random() < dt / 150) this._spawnTracer(c.x); }   // panicking folks plink away (harmless)
      }
      if (this.peopleCdT > 0) this.peopleCdT -= dt;
      for (let i = this.tracers.length - 1; i >= 0; i--) {
        const tr = this.tracers[i]; tr.x += tr.vx * s; tr.y += tr.vy * s; tr.life -= s;
        let hit = false;
        if (this.peopleCdT <= 0) {   // limited firepower: the crowd can only pick off ~1 enemy every couple seconds (a barrage overwhelms them)
          for (let k = this.enemies.length - 1; k >= 0; k--) {
            const m = this.enemies[k];
            if (Math.hypot(m.x - tr.x, m.y - tr.y) < 16) { this.enemies.splice(k, 1); this.score += 5; this._burst(m.x, m.y, "#ffe066", 9); this.peopleCdT = rand(1700, 2600); hit = true; break; }
          }
        }
        if (hit || tr.life <= 0 || tr.y < -12) this.tracers.splice(i, 1);
      }
      if (anyPanic && !this._prevPanic) { this.sirenT = 0; this.crowdT = 0; }   // siren only re-arms on a genuine calm->panic transition (no flicker spam)
      if (anyPanic) {
        this.sirenT -= dt; if (this.sirenT <= 0) { this.audio.play("siren"); this.sirenT = 9000; }
        this.crowdT -= dt; if (this.crowdT <= 0) { this.audio.play("crowd"); this.crowdT = rand(3000, 5500); }
      }
      this._prevPanic = anyPanic;

      if (this.pending <= 0 && this.enemies.length === 0 && this.ufos.length === 0) {   // advance as soon as all THREATS are down — don't wait for our own missiles/blasts to finish
        const aliveCities = this.cities.filter(c => c.alive).length;
        const bonus = aliveCities * 120;
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
      for (const c of this.cities) { R.drawCity(ctx, th, c.x, c.alive); if (c.alive) R.drawPeople(ctx, th, c.x, c.panic, now); }
      for (const b of this.batteries) R.drawBattery(ctx, th, b.x, b.alive);
      R.drawTracers(ctx, th, this.tracers);
      for (const bh of this.blackholes) R.drawBlackhole(ctx, th, bh);
      for (const m of this.enemies) R.drawEnemy(ctx, th, m);
      for (const u of this.ufos) R.drawUfo(ctx, th, u, now);
      for (const pu of this.powerups) R.drawPowerup(ctx, th, pu, now, WMAP[pu.weapon]);
      for (const it of this.interceptors) R.drawInterceptor(ctx, th, it);
      for (const ex of this.explosions) R.drawExplosion(ctx, th, ex);
      for (const z of this.zaps) R.drawZap(ctx, th, z);
      this.particles.render(ctx);
      R.drawCrosshair(ctx, th, this.aim.x, this.aim.y);
      ctx.restore();
      R.drawHUD(ctx, th, { score: this.score, wave: this.wave, cities: this.cities.filter(c => c.alive).length,
        mult: this.multishot || 1, multFrac: this.multishotT > 0 ? this.multishotT / MULT_DURATION : 0 });
      const chipData = this.weaponChips.map(ch => { const w = WMAP[ch.id]; const cd = this.cdT[ch.id] || 0; return {
        rect: ch, short: w.short, id: ch.id, color: w.color, locked: !this.unlocked[ch.id], active: this.weapon === ch.id,
        heatFrac: this.heat[ch.id] || 0, cooling: cd > 0, cdFrac: cd > 0 ? (cd / w.cd) : 0,
        reloadFrac: 1 - Math.max(0, this.reload[ch.id] || 0) / w.reload, keyNum: WEAPONS.indexOf(w) + 1 }; });
      R.drawWeaponBar(ctx, th, chipData);
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
        ctx.fillText(t.text, this._w / 2, this._h * 0.34 - pr * 20 + i * 30);
      }
      ctx.restore();
    }
  }

  M.Game = MissileDefense;
})(window.Arcade = window.Arcade || {});
