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
  const BURN_THRUST = 560, BURN_MAX = 470, TURN_RATE = 3.4, BURN_DRAG = 0.9, SEEK_REACH = 200;
  const PANIC_DIST = 195, SLOW_FACTOR = 0.42, HEAT_IDLE = 650, HEAT_DECAY = 0.7, MULT_DURATION = 14000;
  const ARMY_RANGE = 300;   // soldiers at a battery only open up when a threat is actually within reach (not always blasting)
  const SUPPORT_MIN_WAVE = 8;   // support drops (×2/×3 multi-fire AND militia/base upgrades) only start once you're deeper in — early game is all about earning your weapons
  const HORNET_SPEED = 430, HORNET_TURN = 6.5, BH_PULL = 340, ZIG_AMP = 48;   // hornets nerfed: slower + lazier tracking
  const DOCK_H = 120, POWERUP_LIFE = 16000, POWERUP_SLOTS = 3;   // two-row dock + how long a pickup LINGERS (longer so you actually see/grab it)
  // Screen-shake is tuned GENTLE: every _shake() request is scaled down and hard-capped, and it
  // decays fast, so even a wall of explosions reads as a firm rumble, not a chaotic earthquake.
  const SHAKE_SCALE = 0.42, SHAKE_CAP = 5.5, SHAKE_DECAY = 0.06;

  // Primitive stats only — reload/heat/cool are DERIVED below from a balance model.
  // minWave = the wave a weapon becomes ELIGIBLE to drop (powerful ones arrive later, so they're
  // not OP in the opening waves). Ordered weakest -> strongest; dev mode ignores the gate.
  const WEAPONS = [
    { id: "interceptor", name: "INTERCEPTOR", short: "INT", kind: "direct", speed: 640, blast: 60, base: true, minWave: 1, sfx: "launch", color: null },
    { id: "artillery", name: "ARTILLERY", short: "ART", kind: "arc", speed: 1150, blast: 74, minWave: 2, sfx: "artillery", color: "#ff9a3a" },
    { id: "railgun", name: "RAIL GUN", short: "RAIL", kind: "direct", speed: 2600, blast: 44, minWave: 3, sfx: "rail", color: "#7afcff" },
    { id: "missile", name: "WARHEAD", short: "WAR", kind: "cold", speed: 320, blast: 170, minWave: 3, sfx: "eject", color: null },
    { id: "cryo", name: "CRYO PULSE", short: "CRYO", kind: "direct", speed: 700, blast: 78, slow: 2.6, minWave: 4, sfx: "cryo", color: "#8fd9ff" },
    { id: "flak", name: "FLAK", short: "FLAK", kind: "direct", speed: 760, blast: 34, pellets: 3, spread: 92, minWave: 4, sfx: "launch", color: "#ffe14d" },
    // homing interceptors that COLD-LAUNCH like the warhead (eject -> ignite -> home); quarter-size blast
    { id: "seeker", name: "SEEKER", short: "SEEK", kind: "cold", homing: true, speed: 320, blast: 15, pellets: 1, reload: 460, mag: 5, cd: 1100, manual: true, minWave: 5, sfx: "eject", color: "#9affd0" },
    // NAPALM — arcs in, splashes a lingering FIRE FIELD that incinerates anything passing through for a few seconds
    { id: "napalm", name: "NAPALM", short: "NAPM", kind: "arc", speed: 820, blast: 46, fire: true, fireR: 86, fireDur: 3.4, manual: true, reload: 520, mag: 4, cd: 1900, minWave: 6, sfx: "boom", color: "#ff6a2a" },
    { id: "cluster", name: "HAILSTORM", short: "HAIL", kind: "direct", speed: 920, blast: 36, cluster: 8, minWave: 6, sfx: "launch", color: "#ff7a3a" },
    { id: "hornets", name: "HORNETS", short: "HORN", kind: "swarm", speed: 430, blast: 24, pellets: 3, pelletsMin: 2, pelletsMax: 3, fuse: 2.6, manual: true, reload: 1450, mag: 4, cd: 2500, minWave: 7, sfx: "launch", color: "#9aff6a" },   // small homing strike (2-3); support, not a clear-all
    { id: "tesla", name: "TESLA COIL", short: "TSLA", kind: "direct", speed: 1700, blast: 28, chain: 2, manual: true, reload: 650, mag: 4, cd: 2300, minWave: 8, sfx: "rail", color: "#b388ff" },   // chains to 2; deliberate fire so it can't faceroll
    { id: "singularity", name: "SINGULARITY", short: "SING", kind: "arc", speed: 760, blast: 150, blackhole: true, manual: true, reload: 600, mag: 4, cd: 1700, minWave: 10, sfx: "cryo", color: "#c86bff" }   // late-game powerhouse: throw black holes fast; huge pull + core-devour + implosion (see _spawnBlackhole)
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
  // rail gun: lots of shots before overheat + a short lockout (Chris loves spamming it)
  WMAP.railgun.mag = 24; WMAP.railgun.cd = 650;

  // ---- KILLSTREAKS: collectible super-weapons earned by kills; they STACK on the right side ----
  const STREAK_EVERY = 18, STREAK_MAX = 5;
  const STREAKS = [
    { id: "nuke",    name: "NUKE",          icon: "☢", color: "#ffe14d" },   // ☢ — huge half-screen blast
    { id: "drone",   name: "DRONE STRIKE",  icon: "✈", color: "#7afcff" },   // ✈ — flies in, rains mini-missiles
    { id: "meteor",  name: "METEOR SHOWER", icon: "☄", color: "#ff7a3a" },   // ☄ — fireballs rain across the map
    { id: "volcano", name: "VOLCANO",       icon: "🌋", color: "#ff5a2a" }    // 🌋 — ground erupts, hurls lava bombs
  ];
  const SMAP = {}; STREAKS.forEach(s => SMAP[s.id] = s);
  M.STREAKS = STREAKS;

  // ---- MILITIA UPGRADES: a SEPARATE set of buffs for the townsfolk's little guns (not your weapons, not killstreaks) ----
  // Earned from falling PERSON-marked pods, held up to TOWN_MAX(8). 9 wild auto-fire weapons (each `proj`-typed + a base
  // `cnt`) the crowd fires at in-range threats + 2 enhancers (RANGE SCOPE = farther/faster, AMMO CRATE = more per volley).
  // Progressive: weak ones drop early (low minWave), strong ones are rare/late. Throughput is bounded by the volley cadence
  // (see _townFire / the volley loop) — holding more weapons = VARIETY, not more total firepower, so it can't outpace you.
  const TOWN_MAX = 8, TOWN_LVL_MAX = 4;
  const TOWN_UPGRADES = [
    { id: "slingshot",  name: "SLINGSHOTS",     short: "SLNG", kind: "weapon", proj: "pellet",  cnt: 1, minWave: 2,  range: 260, sfx: "launch",    color: "#cfd24a" },   // weakest: a single pebble
    { id: "buckshot",   name: "BUCKSHOT",       short: "BUCK", kind: "weapon", proj: "pellet",  cnt: 2, minWave: 3,  range: 300, sfx: "launch",    color: "#ffd24a" },   // fans a spread of pellets
    { id: "crossbow",   name: "CROSSBOWS",      short: "XBOW", kind: "weapon", proj: "pellet",  cnt: 1, minWave: 4,  range: 470, sfx: "rail",      color: "#7afcff" },   // one precise long-range bolt
    { id: "rockets",    name: "BOTTLE ROCKETS", short: "RKT",  kind: "weapon", proj: "rocket",  cnt: 1, fw: 24, minWave: 5,  range: 470, sfx: "eject",     color: "#ff7a3a" },   // arcs up, bursts into a firework
    { id: "bees",       name: "ANGRY BEES",     short: "BEES", kind: "weapon", proj: "bee",     cnt: 1, minWave: 6,  range: 380, sfx: "ufo",       color: "#ffe14d" },   // releases homing stingers
    { id: "potato",     name: "POTATO CANNON",  short: "SPUD", kind: "weapon", proj: "rocket",  cnt: 1, fw: 20, minWave: 7,  range: 360, sfx: "artillery", color: "#d9a441" },   // lobs a spud -> small burst
    { id: "molotov",    name: "MOLOTOVS",       short: "MLTV", kind: "weapon", proj: "molotov", cnt: 1, minWave: 8,  range: 360, sfx: "artillery", color: "#ff5a2a" },   // lobs a bottle -> fire patch
    { id: "cherrybomb", name: "CHERRY BOMBS",   short: "CHRY", kind: "weapon", proj: "rocket",  cnt: 1, fw: 30, minWave: 9,  range: 330, sfx: "boom",      color: "#ff4d6a" },   // a bigger banger
    { id: "tesla",      name: "TESLA FENCE",    short: "FNCE", kind: "weapon", proj: "tesla",   cnt: 2, minWave: 10, range: 165, sfx: "zap",       color: "#b388ff" },   // chain-lightning between threats
    { id: "range",      name: "RANGE SCOPE",    short: "RNG",  kind: "range",  minWave: 3,             sfx: "select",     color: "#7afcff" },   // +reach, +fire rate
    { id: "ammo",       name: "AMMO CRATE",     short: "AMMO", kind: "multi",  minWave: 4,             sfx: "select",     color: "#9aff6a" }    // +shots per volley, more cities fire
  ];
  const TUMAP = {}; TOWN_UPGRADES.forEach(u => TUMAP[u.id] = u);
  M.TOWN_UPGRADES = TOWN_UPGRADES;

  // ---- ENEMY KINDS: distinct falling threats, introduced as waves climb ----
  const ENEMY_KINDS = [
    { id: "basic",     name: "MISSILE",      introWave: 1,  weight: 10, pattern: "straight",      speedMul: 1.0,  amp: 0,   freq: 0,  size: 2.6, color: null },
    { id: "dart",      name: "PLASMA DART",  introWave: 2,  weight: 9,  pattern: "straight_fast", speedMul: 1.85, amp: 0,   freq: 0,  size: 3,   color: "#ff4d4d" },
    { id: "drifter",   name: "DRIFTER MINE", introWave: 3,  weight: 8,  pattern: "drift",         speedMul: 0.65, amp: 0,   freq: 0,  size: 5,   color: "#5bd1c9" },
    { id: "viper",     name: "VIPER",        introWave: 4,  weight: 7,  pattern: "zigzag_sharp",  speedMul: 1.1,  amp: 75,  freq: 9,  size: 4,   color: "#ffd23f" },
    { id: "corkscrew", name: "CORKSCREW",    introWave: 5,  weight: 6,  pattern: "corkscrew",     speedMul: 1.0,  amp: 42,  freq: 7,  size: 4,   color: "#b06bff" },
    { id: "screamer",  name: "SCREAMER",     introWave: 6,  weight: 6,  pattern: "accelerate",    speedMul: 0.55, amp: 0,   freq: 0,  size: 4,   color: "#ff8c1a" },
    { id: "swarm",     name: "WASP SWARM",   introWave: 7,  weight: 5,  pattern: "cluster_swarm", speedMul: 1.2,  amp: 18,  freq: 14, size: 2.5, color: "#9dff3c" },
    { id: "behemoth",  name: "BEHEMOTH",     introWave: 8,  weight: 3,  pattern: "heavy_bomber",  speedMul: 0.45, amp: 0,   freq: 0,  size: 9,   color: "#ff3838" },
    { id: "hydra",     name: "HYDRA",        introWave: 10, weight: 4,  pattern: "split_mirv",    speedMul: 0.95, amp: 0,   freq: 0,  size: 6,   color: "#ff5fa2" },
    { id: "mimic",     name: "MIMIC",        introWave: 12, weight: 4,  pattern: "decoy",         speedMul: 1.0,  amp: 0,   freq: 0,  size: 4,   color: "#c0c4cc" },
    { id: "serpent",   name: "SKY SERPENT",  introWave: 14, weight: 3,  pattern: "squiggle",      speedMul: 0.8,  amp: 175, freq: 4,  size: 6,   color: "#3fe0ff" }
  ];
  const KMAP = {}; ENEMY_KINDS.forEach(k => KMAP[k.id] = k);
  M.ENEMY_KINDS = ENEMY_KINDS;

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
      this.pendingBlasts = []; this.ufos = []; this.zaps = []; this.blackholes = []; this.fires = []; this.napGlobs = [];
      this.streaks = []; this.streakKills = 0; this.streakSlots = []; this.pickupSlots = []; this.drones = []; this.droneShots = []; this.meteors = []; this.meteorN = 0; this.meteorT = 0;
      this._rmbDown = false; this._streakSel = 0; this.volcano = null;
      this.weapon = "interceptor";
      this.unlocked = { interceptor: true };
      this.collected = ["interceptor"];   // up to 4 held weapons (non-dev inventory)
      if (this.dev) WEAPONS.forEach(w => { this.unlocked[w.id] = true; });
      this.reload = {}; this.cdT = {}; this.heat = {}; this.idleT = {}; this.reloadMax = {}; this.cdMax = {};
      WEAPONS.forEach(w => { this.reload[w.id] = 0; this.cdT[w.id] = 0; this.heat[w.id] = 0; this.idleT[w.id] = 9999; });
      this.multishot = 1; this.multishotT = 0;
      // ---- MILITIA (townsfolk) upgrades — tracked entirely separate from weapons/killstreaks ----
      this.townShots = []; this.townUpgrades = []; this.townUnlocked = {}; this.townRangeLvl = 0; this.townMultiLvl = 0; this.townFireT = 1400; this.militiaSlots = [];
      if (this.dev) { this.townUpgrades = ["slingshot", "buckshot", "crossbow", "rockets", "bees", "potato", "molotov", "cherrybomb"]; this.townRangeLvl = 1; this.townMultiLvl = 1; TOWN_UPGRADES.forEach(u => { this.townUnlocked[u.id] = true; }); }
      this.tracers = []; this.sirenT = 0; this.crowdT = 0; this._prevPanic = false; this.peopleCdT = 0; this.armyCdT = 0;
      this.statKills = {}; this.statPow = {};   // balance instrumentation: kills by source + powerup spawns by id/category
      this.hintPow = 0; this.hintStreak = 0; this.hintArsenal = 0;   // dock attention cues (ms remaining)
      this.newWeapon = null; this.newWeaponT = 0; this._bannerRect = null; this._bannerPop = 0;   // big center "NEW WEAPON" banner: id + ms window + clickable rect + click-pop anim
      this.bannerShards = []; this._bannerShatterT = 0;   // banner shatters into flying shards on click (after a brief pop)
      this.betweenWaves = false; this.waveBreakT = 0;
      this.pending = 0; this.spawnT = 0; this.spawnGap = 1200; this.enemySpeed = ENEMY_BASE;
      this.powerupT = rand(4000, 7000); this.ufoT = rand(11000, 17000);
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
      if (this._pu) c.removeEventListener("pointerup", this._pu);
      if (this._pw) c.removeEventListener("wheel", this._pw);
      if (this._cm) c.removeEventListener("contextmenu", this._cm);
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
    menus() {
      const self = this;
      return {
        music: { options: SONGS.map((s, i) => ({ id: i, name: s.name })), current: this.songIdx, set: (i) => { self.songIdx = i; self.shell.storage.set("missile:song", i); self._applyMusic(); self._toast("♪ " + SONGS[i].name); } },
        skin: { options: M.Themes.map(t => ({ id: t.id, name: t.name })), current: this.theme.id, set: (id) => { const t = M.Themes.find(x => x.id === id); if (t) { self.theme = t; self.shell.storage.set("missile:theme", id); if (!t.effects.particles) self.particles.clear(); } } }
      };
    }
    cycleMusic() {
      this.songIdx = (this.songIdx + 1) % SONGS.length;
      this.shell.storage.set("missile:song", this.songIdx);
      this._applyMusic(); const name = SONGS[this.songIdx].name; this._toast("♪ " + name); return name;
    }
    toggleDev() {
      this.dev = !this.dev;
      if (this.dev) {
        WEAPONS.forEach(w => { this.unlocked[w.id] = true; });
        this.townUpgrades = ["slingshot", "buckshot", "crossbow", "rockets", "bees", "potato", "molotov", "cherrybomb"]; this.townRangeLvl = Math.max(1, this.townRangeLvl); this.townMultiLvl = Math.max(1, this.townMultiLvl); TOWN_UPGRADES.forEach(u => { this.townUnlocked[u.id] = true; });
      } else {
        WEAPONS.forEach(w => { this.unlocked[w.id] = false; }); this.collected.forEach(id => { this.unlocked[id] = true; }); if (!this.unlocked[this.weapon]) this.weapon = "interceptor";
      }
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
        else if (code === "KeyR") this._useStreak(0);   // unleash your oldest killstreak
      }));
      const toLocal = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (this._w / r.width), y: (e.clientY - r.top) * (this._h / r.height) };
      };
      this._pm = (e) => { if (this.paused || this.state !== "playing") return; const p = toLocal(e); this.aim.x = p.x; this.aim.y = p.y; };
      this._pd = (e) => {
        if (this.paused || this.state !== "playing") return; e.preventDefault();
        if (e.button === 2) {   // RIGHT button: hold to pick a killstreak (scroll to change), release to FIRE it
          this._rmbDown = true; this._streakSel = Math.max(0, Math.min(this._streakSel || 0, this.streaks.length - 1));
          return;
        }
        if (e.button !== 0 && e.button !== undefined) return;   // ignore middle/extra buttons
        const p = toLocal(e), inR = (r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
        if (this.newWeaponT > 0 && this._bannerRect && this.newWeapon && inR(this._bannerRect)) { this._selectWeapon(this.newWeapon); this._bannerBoom(); return; }   // click the big NEW WEAPON banner -> equip it + pop/explode
        for (const ch of this.weaponChips) { if (inR(ch)) { this._selectWeapon(ch.id); return; } }   // ARSENAL — pick a weapon
        for (let k = 0; k < this.streaks.length && k < this.streakSlots.length; k++) { if (inR(this.streakSlots[k])) { this._useStreak(k); return; } }   // KILLSTREAKS — unleash one
        if (p.y >= this.dockTop) return;   // clicked empty dock space -> don't fire into the playfield
        this.aim.x = p.x; this.aim.y = p.y; this._fire(p.x, p.y);
      };
      this._pu = (e) => {
        if (e.button === 2 && this._rmbDown) { e.preventDefault(); this._rmbDown = false; if (this.state === "playing" && !this.paused) this._useStreak(this._streakSel || 0); }   // release right click -> pop the selected streak
      };
      this._pw = (e) => {   // scroll wheel
        if (this.paused || this.state !== "playing") return; e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        if (this._rmbDown && this.streaks.length > 0) { this._streakSel = (this._streakSel + dir + this.streaks.length) % this.streaks.length; this.audio.play("select"); }   // pick a streak
        else this._selectWeapon(dir > 0 ? this._nextUnlocked() : this._prevUnlocked());   // cycle weapons
      };
      this._cm = (e) => { e.preventDefault(); };   // suppress the browser right-click menu over the canvas
      canvas.addEventListener("pointermove", this._pm);
      canvas.addEventListener("pointerdown", this._pd);
      canvas.addEventListener("pointerup", this._pu);
      canvas.addEventListener("wheel", this._pw, { passive: false });
      canvas.addEventListener("contextmenu", this._cm);
    }

    _selectWeapon(id) { if (id && this.unlocked[id]) { this.weapon = id; this.audio.play("select"); } else this.audio.play("pill"); }

    // satisfying confirmation when you click the NEW WEAPON banner: it pops + flashes, then SHATTERS into shards
    _bannerBoom() {
      const r = this._bannerRect; if (!r) return;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, col = (WMAP[this.newWeapon] && WMAP[this.newWeapon].color) || this.theme.palette.accent;
      this._bannerPop = 1; this._bannerShatterT = 170;   // brief pop/flash (the "dope" effect you have), THEN shatter the box
      this.audio.play("extralife");
      if (this.theme.effects.shake) this._shake(7);
      if (this.theme.effects.particles) this.particles.emit({ x: cx, y: cy, count: 48, colors: [col, "#ffffff", "#ffe14a"],
        speedMin: 90, speedMax: 480, gravity: 140, drag: 0.9, sizeMin: 1.5, sizeMax: 5, lifeMin: 0.4, lifeMax: 1.1, glow: this.theme.effects.glow, shape: "circle", spin: 8 });
    }

    // shatter the banner panel into triangular shards that fan out from its center (like glass breaking)
    _shatterBanner(r, col) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, N = 16, P = 2 * (r.w + r.h);
      const perim = (f) => { let l = ((f % 1) + 1) % 1 * P;   // point at fraction f around the rect perimeter
        if (l < r.w) return { x: r.x + l, y: r.y }; l -= r.w;
        if (l < r.h) return { x: r.x + r.w, y: r.y + l }; l -= r.h;
        if (l < r.w) return { x: r.x + r.w - l, y: r.y + r.h }; l -= r.w;
        return { x: r.x, y: r.y + r.h - l }; };
      const pts = [];
      for (let i = 0; i < N; i++) pts.push(perim((i + rand(-0.25, 0.25)) / N));   // jittered for irregular shards
      for (let i = 0; i < N; i++) {
        const a = pts[i], b = pts[(i + 1) % N];
        const tcx = (cx + a.x + b.x) / 3, tcy = (cy + a.y + b.y) / 3;   // shard centroid
        const dx = tcx - cx, dy = tcy - cy, d = Math.hypot(dx, dy) || 1, spd = rand(70, 300);
        const life = rand(0.7, 1.2);
        this.bannerShards.push({ cx: tcx, cy: tcy, col: col,
          v: [{ x: cx - tcx, y: cy - tcy }, { x: a.x - tcx, y: a.y - tcy }, { x: b.x - tcx, y: b.y - tcy }],   // verts local to centroid
          vx: dx / d * spd + rand(-50, 50), vy: dy / d * spd - rand(30, 140), rot: 0, vrot: rand(-9, 9), life: life, max: life });
      }
    }
    _unlockedIds() { return WEAPONS.filter(w => this.unlocked[w.id]).map(w => w.id); }
    _nextUnlocked() { const u = this._unlockedIds(); return u[(u.indexOf(this.weapon) + 1) % u.length]; }
    _prevUnlocked() { const u = this._unlockedIds(); return u[(u.indexOf(this.weapon) - 1 + u.length) % u.length]; }

    _layout(w, h) {
      // resolution-aware UI scale so the dock/HUD aren't lost in the sauce on big screens (capped so it stays balanced).
      // MOBILE gets a deliberately smaller scale: more play area + breathing room, and it guarantees the two-row dock
      // (8 militia + 5 killstreak tiles) actually fits the narrow width instead of cramming/overflowing.
      this.uiScale = this.shell.isTouch
        ? Math.max(0.52, Math.min(0.95, w / 640))
        : Math.max(1, Math.min(1.7, Math.min(w / 1100, h / 640)));
      this.dockH = Math.round(DOCK_H * this.uiScale);
      this.dockTop = h - this.dockH;
      this.groundY = this.dockTop - 12;   // thin ground strip sits just above the control dock
      const slotW = (w - 56) / 9, sx = i => 28 + slotW * (i + 0.5);
      this.batteries.forEach(b => b.x = sx(b.slot));
      this.cities.forEach(c => c.x = sx(c.slot));
      this.slotW = slotW;
      this._layoutDock();
    }

    // The bottom CONTROL DOCK, two rows so four sections stay sleek & uncramped:
    //   row 1:  ARSENAL (your weapons, left)   ·   INCOMING (pickups, right)
    //   row 2:  MILITIA (townsfolk upgrades, left)   ·   KILLSTREAKS (right)
    // Lays out clickable rects for weapons/pickups/streaks; militia tiles are display-only.
    _layoutDock() {
      const s = this.uiScale || 1;
      const w = this._w || 800, pad = Math.round(10 * s), gap = Math.round(6 * s), labelH = Math.round(12 * s);
      // tiles auto-shrink to guarantee the row-2 blocks (militia + killstreaks) fit the width — never cram/overflow
      const totalTiles = TOWN_MAX + STREAK_MAX, minCenterGap = Math.round(16 * s);
      const availRow2 = w - pad * 2 - minCenterGap - (totalTiles - 1) * gap;
      const tileH = Math.max(Math.round(22 * s), Math.min(Math.round(38 * s), Math.floor(availRow2 / totalTiles)));
      const row1Y = this.dockTop + labelH + Math.round(4 * s);
      const row2Y = row1Y + tileH + labelH + Math.round(4 * s);
      // right column width is governed by the widest right block (killstreaks)
      const sTile = tileH, streakBlockW = STREAK_MAX * sTile + (STREAK_MAX - 1) * gap;
      const rightLeft = w - pad - streakBlockW;
      this.streakSlots = [];
      for (let i = 0; i < STREAK_MAX; i++) this.streakSlots.push({ x: rightLeft + i * (sTile + gap), y: row2Y, w: sTile, h: tileH });
      this.pickupSlots = [];   // pickups fall from the sky now (no dock INCOMING slots)
      // MILITIA — townsfolk upgrade slots on row 2 left
      const mTile = tileH, milBlockW = TOWN_MAX * mTile + (TOWN_MAX - 1) * gap;
      this.militiaSlots = [];
      for (let i = 0; i < TOWN_MAX; i++) this.militiaSlots.push({ x: pad + i * (mTile + gap), y: row2Y, w: mTile, h: tileH });
      // ARSENAL — your held weapons fill row 1 (dev shows all); spans the full width now that INCOMING is gone
      const ids = this.dev ? WEAPONS.map(wp => wp.id) : (this.collected ? this.collected.slice() : ["interceptor"]);
      const n = Math.max(1, ids.length), wLeft = pad, wRight = w - pad, avail = Math.max(120 * s, wRight - wLeft);
      const cw = Math.max(Math.round(34 * s), Math.min(Math.round(96 * s), Math.floor((avail - (n - 1) * gap) / n)));
      this.weaponChips = ids.map((id, i) => ({ id: id, x: wLeft + i * (cw + gap), y: row1Y, w: cw, h: tileH }));
    }
    _layoutChips() { this._layoutDock(); }   // legacy alias (dev toggle / collect calls)

    // Collect a weapon into the 4-slot inventory (drops the oldest spare past 4), then equip it (unless keepActive).
    _collectWeapon(id, keepActive) {
      if (!this.collected.includes(id)) {
        this.collected.push(id); this.unlocked[id] = true;
        while (this.collected.length > 4) {
          const drop = this.collected.find(wid => wid !== "interceptor" && wid !== id && wid !== this.weapon);   // never drop the base, the new one, or what you're holding
          if (!drop) break;
          this.collected.splice(this.collected.indexOf(drop), 1); this.unlocked[drop] = false;
        }
      }
      if (!keepActive) this.weapon = id;
      this._layoutChips();
    }

    // Drop rarity: PROGRESSIVE RANDOM — weaker stuff is common, each step up in power is rarer,
    // and the powerful gear slowly becomes more reachable as waves climb (never hard-gated by level).
    // power ~ the item's old minWave. A weapon `power` steps above the "current tier" decays by 0.55 each step.
    _dropWeight(power) { return Math.pow(0.55, Math.max(0, (power || 1) - (1 + this.wave * 0.35))); }
    _weightedPick(list, powerOf) {
      if (!list.length) return null;
      let tot = 0; for (const it of list) tot += this._dropWeight(powerOf(it));
      let r = Math.random() * tot;
      for (const it of list) { r -= this._dropWeight(powerOf(it)); if (r <= 0) return it; }
      return list[list.length - 1];
    }

    _nextWave() {
      this.wave++;
      this.batteries.forEach(b => { b.alive = true; });
      this.pending = 5 + Math.round(this.wave * 2.4);
      this.spawnGap = Math.max(150, 1250 - this.wave * 64);   // late waves spawn FAST enough to overwhelm even the best weapon -> a real difficulty wall
      this.spawnT = 800;
      this.enemySpeed = ENEMY_BASE + this.wave * 7;
      this.explosions.length = 0; this.pendingBlasts.length = 0; this.blackholes.length = 0; this.tracers.length = 0;   // clean slate so last wave's ordnance can't hit the new one
      this._applyTempo();
      if (this.wave > 1) this._toast("WAVE " + this.wave, true);
      for (const k of ENEMY_KINDS) if (k.introWave === this.wave && this.wave > 1) this._toast("NEW THREAT — " + k.name, false, k.color || this.theme.palette.enemy);   // herald each new enemy type
      const rf = Math.round((1 - this._cooldownScale()) * 100);   // weapons cool/reload this much faster now
      if (this.wave > 1 && this.wave % 3 === 0 && rf > 0) this._toast("RAPID FIRE  ·  weapons " + rf + "% faster", false, "#ffe14d");
    }

    _aliveTargets() {
      const t = [];
      for (const c of this.cities) if (c.alive) t.push(c);
      for (const b of this.batteries) if (b.alive) t.push(b);
      return t;
    }

    _rollKind() {
      const pool = [];
      for (const k of ENEMY_KINDS) { if (k.introWave > this.wave) continue; for (let i = 0; i < k.weight; i++) pool.push(k); }
      return pool.length ? pool[(Math.random() * pool.length) | 0] : KMAP.basic;
    }
    _nearestTarget(x) { const t = this._aliveTargets(); if (!t.length) return null; let best = t[0], bd = 1e9; for (const c of t) { const d = Math.abs(c.x - x); if (d < bd) { bd = d; best = c; } } return best; }

    _spawnEnemy(sx, sy, target, forceKind) {
      const targets = this._aliveTargets();
      if (!targets.length) return null;
      if (sx == null) { sx = rand(20, this._w - 20); sy = 0; }
      if (!target) target = targets[(Math.random() * targets.length) | 0];
      const def = forceKind ? (KMAP[forceKind] || KMAP.basic) : this._rollKind();
      const spd = this.enemySpeed * def.speedMul;
      const dx = target.x - sx, dy = this.groundY - sy, d = Math.hypot(dx, dy) || 1;
      const m = { kind: def.id, def: def, sx: sx, sy: sy, cx: sx, cy: sy, x: sx, y: sy,
        vx: dx / d * spd, vy: dy / d * spd, spd0: spd, slow: 0, t: 0, phase: rand(0, 6.28), amp: def.amp, freq: def.freq, splitY: null };
      if (def.pattern === "drift") { m.vx = (Math.random() < 0.5 ? -1 : 1) * rand(75, 145); m.vy = spd; }   // always crosses the sky on a lazy diagonal
      else if (def.pattern === "accelerate") m.accel = 1.9;
      else if (def.pattern === "decoy") { m.awake = false; m.wakeY = rand(this.groundY * 0.45, this.groundY * 0.60); m.vx *= 0.3; }
      else if (def.id === "hydra") m.splitY = rand(this.groundY * 0.40, this.groundY * 0.55);
      if (def.id === "behemoth") m.heavy = true;
      this.enemies.push(m);
      if (def.pattern === "cluster_swarm" && !forceKind) {   // the rest of the pack arrives together in a tight cluster
        for (let k = 0, n = 5 + ((Math.random() * 3) | 0); k < n; k++) this._spawnEnemy(sx + rand(-34, 34), rand(-60, -4), target, "swarm");
      }
      return m;
    }

    _hydraSplit(m) {
      this._burst(m.x, m.y, "#ff7fc2", 12);
      for (let i = 0; i < 5; i++) { const c = this._spawnEnemy(m.x, Math.min(m.cy, this.groundY - 40), null, "basic"); if (c) c.vx = m.vx + (i - 2) * 90; }
    }

    // A supply pod DROPS FROM THE SKY — you earn it by shooting it (a blast scoops it up); miss it and it's lost.
    // No level gates: any weapon/upgrade can drop at any time, just weighted so powerful gear is RARE (rarer the earlier you are).
    _spawnPowerup() {
      if (this.powerups.length >= POWERUP_SLOTS) return;
      const addPod = (extra, label, col) => {
        if (this.statPow) { const k = extra.town ? "town:" + extra.town : (extra.kind === "mult" ? "mult" : "weapon:" + extra.weapon); this.statPow[k] = (this.statPow[k] || 0) + 1; }
        const x = rand(70, this._w - 70);
        this.powerups.push(Object.assign({ x: x, y: -16, vx: rand(-18, 18), vy: rand(46, 70), sway: rand(0, 6.28), t: 0, color: col || "#ffd24a" }, extra));
        this.audio.play("ufo"); this._toast("DROP INBOUND ↓ " + label + " — shoot it!", true, col || "#ffd24a");
      };
      const mult = () => { const m = Math.random() < 0.62 ? 2 : 3; addPod({ kind: "mult", mult: m }, "×" + m + " FIRE"); };
      const town = () => {   // a MILITIA upgrade for the townsfolk (prefer weapons you don't have yet; enhancers can repeat to level up)
        const fresh = TOWN_UPGRADES.filter(u => u.kind !== "weapon" || !this.townUpgrades.includes(u.id));
        const u = this._weightedPick(fresh.length ? fresh : TOWN_UPGRADES, x => x.minWave);
        addPod({ town: u.id }, u.name, u.color);
      };
      // weighted category roll — prefer weapons you DON'T have yet (the striving), then town upgrades, then a multi-fire
      const lockedW = WEAPONS.filter(w => !w.base && !this.unlocked[w.id]);
      const townPool = TOWN_UPGRADES.filter(u => u.kind !== "weapon" || !this.townUpgrades.includes(u.id));
      const cats = [];
      if (lockedW.length) cats.push(["weapon", 6]);
      if (townPool.length) cats.push(["town", 3]);   // militia drops are progressive via each upgrade's own minWave (weak ones early, strong rare/late)
      if (this.wave >= SUPPORT_MIN_WAVE) cats.push(["mult", 2]);   // multi-fire stays a later-game support drop
      if (!cats.length) cats.push(["mult", 2]);   // safety: always have something to drop
      let total = cats.reduce((a, c) => a + c[1], 0), r = Math.random() * total, pick = cats[0][0];
      for (const c of cats) { if (r < c[1]) { pick = c[0]; break; } r -= c[1]; }
      if (pick === "mult") return mult();
      if (pick === "town") return town();
      const w = this._weightedPick(lockedW, x => x.minWave);   // progressive: powerful weapons are rare, common ones likely
      addPod({ weapon: w.id }, w.name, w.color);
    }

    // collect a MILITIA upgrade: weapons fill the 4-slot town inventory; RANGE/AMMO enhancers level up (one slot each)
    _collectTownUpgrade(id) {
      const u = TUMAP[id]; if (!u) return false;
      if (u.kind === "range") this.townRangeLvl = Math.min(TOWN_LVL_MAX, this.townRangeLvl + 1);
      else if (u.kind === "multi") this.townMultiLvl = Math.min(TOWN_LVL_MAX, this.townMultiLvl + 1);
      const had = this.townUpgrades.includes(id);
      if (!had) {
        this.townUpgrades.push(id); this.townUnlocked[id] = true;
        while (this.townUpgrades.length > TOWN_MAX) { const drop = this.townUpgrades.find(x => x !== id); if (!drop) break; this.townUpgrades.splice(this.townUpgrades.indexOf(drop), 1); delete this.townUnlocked[drop]; }
      }
      const lvl = u.kind === "range" ? this.townRangeLvl : (u.kind === "multi" ? this.townMultiLvl : 0);
      this.audio.play("extralife");
      this._toast("MILITIA — " + u.name + (lvl > 1 ? " Lv" + lvl : "") + "!", true, u.color);
      return true;
    }

    _collectPowerup(pu, auto) {
      if (pu.kind === "mult") {
        this.multishot = Math.max(this.multishot || 1, pu.mult); this.multishotT = MULT_DURATION;
        this.audio.play("extralife");
        this._toast((pu.mult === 3 ? "TRIPLE" : "DOUBLE") + " FIRE!  ×" + pu.mult, true);
        if (this.theme.effects.particles) this.particles.emit({ x: pu.x, y: pu.y, count: 28,
          colors: ["#ffd24a", "#ffae3b", "#ffffff"], speedMin: 50, speedMax: 280, gravity: 60, drag: 1,
          sizeMin: 1.5, sizeMax: 4, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "circle", spin: 6 });
        return;
      }
      if (pu.town) {   // a MILITIA upgrade for the townsfolk (separate set)
        const u = TUMAP[pu.town]; this._collectTownUpgrade(pu.town);
        if (this.theme.effects.particles) this.particles.emit({ x: pu.x, y: pu.y, count: 26,
          colors: [(u && u.color) || "#9aff6a", "#ffe08a", "#ffffff"], speedMin: 50, speedMax: 280, gravity: 60, drag: 1,
          sizeMin: 1.5, sizeMax: 4, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "circle", spin: 6 });
        return;
      }
      const w = WMAP[pu.weapon], wasNew = !this.collected.includes(pu.weapon);
      this._collectWeapon(pu.weapon, auto);   // adds to the 4-slot inventory; manual grab also equips it (auto-grab keeps your current weapon)
      if (wasNew) { this.hintArsenal = 5000; this.newWeapon = pu.weapon; this.newWeaponT = 3000; }   // flag the arsenal + pop the big center "NEW WEAPON" banner (3s window to select)
      this.heat[pu.weapon] = 0; this.cdT[pu.weapon] = 0; this.reload[pu.weapon] = 0;
      this.audio.play("extralife");
      this._toast((wasNew ? "GOT — " : "RESTOCKED — ") + w.name + "!", true, w.color);
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
      this.tracers.push({ x: px, y: py, vx: dx / d * sp, vy: dy / d * sp, life: rand(0.32, 0.6), color: "#ffe066" });
      if (this.theme.effects.particles && Math.random() < 0.5) this.particles.emit({ x: px, y: py - 2, count: 2, colors: ["#ffe08a", "#ffffff"],
        speedMin: 8, speedMax: 46, gravity: 0, drag: 2.2, sizeMin: 1, sizeMax: 2, lifeMin: 0.08, lifeMax: 0.22, glow: this.theme.effects.glow, shape: "circle" });
    }

    // a soldier stationed at a firing base sends an AIMED tracer at the nearest threat (trained — straighter & faster than civvies)
    _spawnSoldierTracer(bx) {
      let tx = bx, ty = 60, bd = 1e9;
      for (const m of this.enemies) { const d = Math.abs(m.x - bx); if (d < bd) { bd = d; tx = m.x; ty = m.y; } }
      const px = bx + rand(-20, 20), py = this.groundY - 12;
      const dx = (tx - px) + rand(-16, 16), dy = (ty - py), d = Math.hypot(dx, dy) || 1, sp = rand(640, 800);
      this.tracers.push({ x: px, y: py, vx: dx / d * sp, vy: dy / d * sp, life: rand(0.34, 0.62), army: true, color: "#a8ff7a" });
      if (this.theme.effects.particles && Math.random() < 0.6) this.particles.emit({ x: px, y: py - 2, count: 2, colors: ["#d6ffb0", "#ffffff"],
        speedMin: 10, speedMax: 60, gravity: 0, drag: 2.2, sizeMin: 1, sizeMax: 2, lifeMin: 0.08, lifeMax: 0.2, glow: this.theme.effects.glow, shape: "circle" });
    }

    // ---------------- MILITIA: the townsfolk's upgraded little guns ----------------
    _townDamage(x, y, r, color, pts) {   // direct town hits (buckshot pellets, bee stings)
      let any = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) { const m = this.enemies[j]; if (Math.hypot(m.x - x, m.y - y) < r) { this.enemies.splice(j, 1); this.score += (pts || 12) + this.wave * 4; this._addKill("militia"); this._burst(m.x, m.y, color || "#ffe066", 8); any = true; } }
      for (let j = this.ufos.length - 1; j >= 0; j--) { const u = this.ufos[j]; if (Math.hypot(u.x - x, u.y - y) < r + u.radius) { this.ufos.splice(j, 1); const p = 150 + this.wave * 25; this.score += p; this._addKill("militia"); this._toast("UFO! +" + p, true); this._burst(u.x, u.y, "#46f0c0", 18); any = true; } }
      return any;
    }
    _townNearest(cx, by, range) { let tgt = null, bd = range; for (const m of this.enemies) { const d = Math.hypot(m.x - cx, m.y - by); if (d < bd) { bd = d; tgt = m; } } return tgt; }

    // fire one militia weapon `id` from a city at `cx` (range already scaled by the RANGE SCOPE level)
    _townFire(cx, id, rangeMul, extraShots) {
      const u = TUMAP[id], by = this.groundY - 9, col = u.color, range = (u.range || 320) * rangeMul;
      const tgt = this._townNearest(cx, by, range);
      if (!tgt) return false;   // ALL town weapons need a threat actually within reach (no firing into empty sky)
      this.audio.play(u.sfx);
      if (this.theme.effects.particles) this.particles.emit({ x: cx, y: by, count: 5, colors: [col, "#ffffff"], speedMin: 30, speedMax: 150, angleMin: -Math.PI * 0.85, angleMax: -Math.PI * 0.15, gravity: 120, drag: 1.2, sizeMin: 1.4, sizeMax: 3, lifeMin: 0.15, lifeMax: 0.4, glow: this.theme.effects.glow, shape: "circle" });
      const ml = this.townMultiLvl, cnt = u.cnt || 1, proj = u.proj;
      if (proj === "pellet") {
        const n = cnt + Math.floor(ml / 2) + extraShots, base = Math.atan2(tgt.y - by, tgt.x - cx), spreadA = cnt > 1 ? 0.14 : 0.05;
        for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * spreadA + rand(-0.04, 0.04), sp = rand(620, 720); this.townShots.push({ type: "pellet", x: cx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 * rangeMul + 0.2, color: col }); }
      } else if (proj === "rocket") {
        const n = cnt + (extraShots > 1 ? 1 : 0);
        for (let i = 0; i < Math.max(1, n); i++) { const t2 = this._townNearest(cx + rand(-30, 30), by, range) || tgt; this.townShots.push({ type: "rocket", x: cx + rand(-8, 8), y: by, tx: t2.x, ty: t2.y, spd: 540, color: col, spin: rand(0, 6.28), fw: u.fw || 24 }); }
      } else if (proj === "molotov") {
        const n = cnt + Math.floor(ml / 3);
        for (let i = 0; i < n; i++) { const tx = tgt.x + rand(-30, 30) * i, dx = tx - cx; this.townShots.push({ type: "molotov", x: cx, y: by, vx: dx / 0.95 * 0.5, vy: -rand(360, 460), spin: rand(0, 6.28), color: col, r: rand(28, 38) * rangeMul }); }
      } else if (proj === "bee") {
        const n = cnt + Math.floor(ml / 2) + extraShots;
        for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + rand(-0.8, 0.8); this.townShots.push({ type: "bee", x: cx + rand(-10, 10), y: by - rand(0, 8), heading: a, spd: rand(230, 290), fuse: 2.0 + rangeMul * 0.3, wig: rand(0, 6.28), color: col }); }
      } else if (proj === "tesla") {
        this._chainZap(cx, by - 4, col, cnt + Math.floor(ml / 2));   // chain-lightning leaps between nearby threats
        if (this.theme.effects.shake) this._shake(3);
      }
      return true;
    }

    _spawnUfo() {
      const fromLeft = Math.random() < 0.5;
      this.ufos.push({ x: fromLeft ? -30 : this._w + 30, y: rand(60, this._h * 0.4), vx: (fromLeft ? 1 : -1) * rand(70, 115), bombT: rand(1000, 2000), radius: 16, zig: 0 });
      this.audio.play("ufo");
    }

    // build a projectile carrying the active weapon's payload flags
    _proj(w, bx, by, tx, ty, extra) {
      const base = { bx: bx, by: by, x: bx, y: by, tx: tx, ty: ty, weapon: w.id, blast: w.blast * (w.id === "railgun" ? (1 + Math.min(0.6, this.wave * 0.02)) : 1),
        color: w.color, cluster: w.cluster || 0, slow: w.slow || 0, chain: w.chain || 0, blackhole: !!w.blackhole,
        fire: !!w.fire, fireR: w.fireR || 0, fireDur: w.fireDur || 0 };
      return Object.assign(base, extra || {});
    }

    _muzzle(bx, by, w) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: bx, y: by - 2, count: 9,
        colors: [w.color || this.theme.palette.exhaust || this.theme.palette.battery, "#ffffff"],
        speedMin: 30, speedMax: 160, angleMin: -Math.PI * 0.88, angleMax: -Math.PI * 0.12,
        gravity: 120, drag: 1.2, sizeMin: 1.5, sizeMax: 3.4, lifeMin: 0.2, lifeMax: 0.55, glow: this.theme.effects.glow, shape: "circle" });
    }

    // reload + overheat get FASTER as waves climb (the harder it gets, the more you can blast). Floored so it stays balanced.
    _cooldownScale() { return Math.max(0.5, 1 - (this.wave - 1) * 0.03); }   // wave1 100% -> wave17 ~52% -> floor 50%

    // where a multi-fire salvo's shots are aimed (so the aim preview can show the SAME spots the shots will hit)
    _salvoPoints(tx, ty) {
      const m = this.multishot || 1, spread = 95 + (m - 2) * 18;   // keep in lockstep with _fire's salvoSpread
      const pts = [];
      for (let mi = 0; mi < m; mi++) pts.push({ x: tx + (mi - (m - 1) / 2) * spread, y: ty });
      return pts;
    }

    _fire(tx, ty) {
      if (ty >= this.groundY - 4) ty = this.groundY - 4;
      const w = WMAP[this.weapon];
      if ((this.cdT[this.weapon] || 0) > 0) { this.audio.play("pill"); return; }   // cooling down
      if ((this.reload[this.weapon] || 0) > 0) return;
      let best = null, bd = Infinity;
      for (const b of this.batteries) if (b.alive) { const d = Math.abs(b.x - tx); if (d < bd) { bd = d; best = b; } }
      if (!best) { this.audio.play("pill"); return; }
      const m = this.multishot || 1, pen = 1 + (m - 1) * 0.5, sc = this._cooldownScale();   // ×2 -> 1.5x, ×3 -> 2x heat & reload "for the extra"
      this.reload[this.weapon] = w.reload * pen * sc; this.reloadMax[this.weapon] = this.reload[this.weapon]; this.idleT[this.weapon] = 0;
      this.heat[this.weapon] += (1 / w.mag) * pen;
      if (this.heat[this.weapon] >= 1) { this.heat[this.weapon] = 1; this.cdT[this.weapon] = w.cd * sc; this.cdMax[this.weapon] = this.cdT[this.weapon]; }   // OVERHEAT -> forced cooldown (also faster late-game)
      const bx = best.x, by = this.groundY - 14;
      this.audio.play(w.sfx);
      for (const pt of this._salvoPoints(tx, ty)) this._launch(w, bx, by, pt.x, pt.y);   // double/triple fire fans out WIDE (see _salvoPoints / aim preview)
    }

    // spawn ONE shot of weapon w aimed at (tx,ty) — called once per missile in a multi-fire salvo
    _launch(w, bx, by, tx, ty) {
      if (w.kind === "cold") {
        const n = w.pellets || 1;
        for (let i = 0; i < n; i++) {
          this.interceptors.push(this._proj(w, bx, by, tx, ty, { vx: rand(-26, 26) + (i - (n - 1) / 2) * 16, vy: -EJECT_V * (w.homing ? 1.2 : 1), mode: "eject",
            igniteTimer: w.homing ? EJECT_DELAY * 0.55 : EJECT_DELAY, ignited: false, guided: true, fuse: 4.5, heading: -Math.PI / 2, homing: !!w.homing }));
        }
        if (this.theme.effects.particles) this.particles.emit({ x: bx, y: by - 4, count: 12, colors: ["#cfd6df", "#ffffff", "#9aa0aa"],
          speedMin: 20, speedMax: 110, angleMin: -Math.PI * 0.95, angleMax: -Math.PI * 0.05, gravity: 90, drag: 1.4,
          sizeMin: 2, sizeMax: 4.5, lifeMin: 0.3, lifeMax: 0.8, glow: false, shape: "circle" });
      } else if (w.kind === "arc") {
        const dx = tx - bx, dy = ty - by, dist = Math.hypot(dx, dy) || 1;
        const bow = Math.max(45, Math.min(150, dist * 0.34));
        const side = Math.random() < 0.5 ? -1 : 1;   // arc randomly bows LEFT or RIGHT, just for fun
        this.interceptors.push(this._proj(w, bx, by, tx, ty, { mode: "arc",
          p1x: (bx + tx) / 2 + side * bow, p1y: (by + ty) / 2 - bow * 0.7, t: 0, dur: Math.max(0.3, dist / w.speed) }));
        this._muzzle(bx, by, w);
      } else if (w.kind === "swarm") {
        const n = w.pelletsMin ? (w.pelletsMin + ((Math.random() * (w.pelletsMax - w.pelletsMin + 1)) | 0)) : (w.pellets || 4);   // random swarm size each shot
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5;   // wider launch fan so the swarm covers more sky
          this.interceptors.push(this._proj(w, bx, by, tx, ty, { mode: "home",
            vx: Math.cos(a) * HORNET_SPEED, vy: Math.sin(a) * HORNET_SPEED, heading: a, fuse: w.fuse || 3.2 }));
        }
        this._muzzle(bx, by, w);
      } else {
        const pellets = w.pellets || 1;
        for (let i = 0; i < pellets; i++) {
          let ax = tx, ay = ty;
          if (pellets > 1) { ax = tx + (i - (pellets - 1) / 2) * (w.spread || 50) * 0.85 + rand(-10, 10); ay = ty + rand(-(w.spread || 50) * 0.32, (w.spread || 50) * 0.32); }
          const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy) || 1;
          this.interceptors.push(this._proj(w, bx, by, ax, ay, { vx: dx / d * w.speed, vy: dy / d * w.speed }));
        }
        this._muzzle(bx, by, w);
      }
    }

    _blast(x, y, maxR, color, growMul) {
      this.explosions.push({ x: x, y: y, r: 0, maxR: maxR, phase: "grow", color: color || this.theme.palette.blast, gw: BLAST_GROW * (growMul || 1) });
      this.audio.play("boom");
      if (this.theme.effects.particles) this.particles.emit({ x: x, y: y, count: Math.min(34, Math.round(maxR / 4)),
        colors: [color || this.theme.palette.blast, "#ffffff"], speedMin: 40, speedMax: Math.min(900, maxR * 4), gravity: 60, drag: 1,
        sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.3, lifeMax: 0.8, glow: this.theme.effects.glow, shape: "circle" });
      if (this.theme.effects.shake) this._shake(Math.min(10, maxR / 8));
    }

    _detonate(it) {
      if (it.blackhole) { this._spawnBlackhole(it.x, it.y, it.color); return; }
      if (it.fire) { this._napalmBurst(it.x, it.y, it.fireDur || 3.2, it.color); return; }
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
        for (let k = 0; k < this.enemies.length; k++) { if (used[k]) continue; const m = this.enemies[k]; const d = Math.hypot(m.x - cx, m.y - cy); if (d < 120 && d < bd) { bd = d; best = k; } }
        if (best < 0) break;
        used[best] = 1; const m = this.enemies[best]; pts.push({ x: m.x, y: m.y }); cx = m.x; cy = m.y; hit.push(best);
      }
      hit.sort((a, b) => b - a).forEach(k => { const m = this.enemies[k]; this.score += 25 * this.wave; this._addKill("weapon"); this._burst(m.x, m.y, color, 6); this.enemies.splice(k, 1); });
      if (pts.length > 1) { this.zaps.push({ points: pts, life: 0.22, color: color || "#b388ff" }); this.audio.play("zap"); if (this.theme.effects.shake) this._shake(3); }
    }

    _spawnBlackhole(x, y, color) {
      this.blackholes.push({ x: x, y: y, t: 0, dur: 1.45, range: 320, color: color || "#c86bff" });   // SINGULARITY: huge pull + long dwell -> a devastating implosion
      this.audio.play("whoosh");   // black-hole forms with a swirling woosh
      if (this.theme.effects.shake) this._shake(4);
    }

    // A fire field: a circular zone that incinerates any enemy/UFO inside for `dur` seconds.
    _spawnFire(x, y, r, dur, color, silent) {
      y = Math.min(y, this.groundY - 6);
      this.fires.push({ x: x, y: y, r: r, dur: dur, t: 0, tick: 0, color: color || "#ff6a2a" });
      if (!silent) { this.audio.play("boom"); if (this.theme.effects.shake) this._shake(4); }
    }

    // NAPALM airburst: scatter a handful of flaming GLOBS that arc out and rain down,
    // each starting its own little fire where it lands (separated patches, like real napalm).
    _napalmBurst(x, y, dur, color) {
      color = color || "#ff6a2a";
      this._blast(x, y, 38, color);   // airburst flash (handles the boom + shake)
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + rand(-1.25, 1.25), sp = rand(95, 250);   // spray mostly up & out
        this.napGlobs.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(20, 90), fuse: rand(0.5, 1.3), dur: dur, color: color });
      }
      if (this.theme.effects.particles) this.particles.emit({ x: x, y: y, count: 16, colors: ["#ffe14a", "#ff8a2a", "#ff4a1a"],
        speedMin: 60, speedMax: 320, gravity: 200, drag: 1, sizeMin: 2, sizeMax: 4.5, lifeMin: 0.3, lifeMax: 0.8, glow: this.theme.effects.glow, shape: "circle" });
    }

    // a townsfolk bottle-rocket bursts into a colorful firework — the _blast handles the kills, the sparks are the show
    _fireworkBurst(x, y, color, blast) {
      this._blast(x, y, blast || 24, color);
      if (this.theme.effects.particles) this.particles.emit({ x: x, y: y, count: 30,
        colors: ["#ff4d4d", "#ffd24a", "#5ad1ff", "#9aff6a", "#ff7adf", "#ffffff"], speedMin: 60, speedMax: 320,
        gravity: 120, drag: 0.9, sizeMin: 1.5, sizeMax: 3.6, lifeMin: 0.4, lifeMax: 1.1, glow: this.theme.effects.glow, shape: "circle", spin: 8 });
    }

    // ---------------- killstreaks ----------------
    _addKill(src) {
      if (this.statKills) { const k = src || "active"; this.statKills[k] = (this.statKills[k] || 0) + 1; }   // balance-sim instrumentation (kills by source)
      this.streakKills++;
      if (this.streakKills >= STREAK_EVERY && this.streaks.length < STREAK_MAX) { this.streakKills = 0; this._earnStreak(); }
      if (this.streaks.length >= STREAK_MAX) this.streakKills = Math.min(this.streakKills, STREAK_EVERY);   // hold "ready" until a slot frees
    }
    _earnStreak() {
      const s = STREAKS[(Math.random() * STREAKS.length) | 0];
      this.streaks.push(s.id); this.audio.play("extralife"); this.hintStreak = 5000;
      this._toast("KILLSTREAK!  " + s.name + " READY →", true);
    }
    _useStreak(idx) {
      if (idx < 0 || idx >= this.streaks.length) return;
      const id = this.streaks.splice(idx, 1)[0];
      if (this.streakKills >= STREAK_EVERY && this.streaks.length < STREAK_MAX) { this.streakKills = 0; this._earnStreak(); }   // grant the held one now that a slot freed
      if (id === "nuke") this._nukeStrike();
      else if (id === "drone") this._droneStrike();
      else if (id === "meteor") this._meteorShower();
      else if (id === "volcano") this._volcano();
    }
    _nukeStrike() {
      const cx = this._w / 2, cy = this._h * 0.42;
      this._blast(cx, cy, this._w * 0.48, "#ffe14d", 4.5);   // HUGE ~half-screen blast that expands FAST
      this.flash = 1; if (this.theme.effects.shake) this._shake(16);
      this._toast("☢ NUKE!", true);
    }
    _droneStrike() {
      const fromLeft = Math.random() < 0.5;
      this.drones.push({ x: fromLeft ? -60 : this._w + 60, y: this._h * rand(0.13, 0.24), vx: (fromLeft ? 1 : -1) * (this._w / 2.0), fireT: 180, shots: 16, color: "#7afcff" });
      this.audio.play("ufo"); this._toast("✈ DRONE STRIKE INBOUND!", true);
    }
    _meteorShower() {
      this.meteorN = 16; this.meteorT = 0; this.audio.play("whoosh"); this._toast("☄ METEOR SHOWER!", true);
    }
    _volcano() {
      this.volcano = { x: this._w * 0.5, t: 0, dur: 2.4, spewT: 0 };
      this._blast(this._w * 0.5, this.groundY - 10, 92, "#ff5a2a"); this.flash = 0.7; if (this.theme.effects.shake) this._shake(18);
      this._spawnFire(this._w * 0.5, this.groundY - 8, 72, 3.2, "#ff5a2a", true);   // lava pool at the base
      this.audio.play("boom"); this._toast("🌋 VOLCANO ERUPTION!", true);
    }

    _destroyStructure(x, heavy) {
      const hd = this.slotW * (heavy ? 1.35 : 0.55);
      let hits = [...this.cities, ...this.batteries].filter(o => o.alive && Math.abs(o.x - x) < hd);
      if (!heavy && hits.length > 1) { hits.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)); hits = hits.slice(0, 1); }   // normal: just the nearest structure
      for (const hit of hits) { hit.alive = false; this._blast(hit.x, this.groundY - 8, heavy ? 64 : 46, heavy ? "#ff3838" : null); this._burst(hit.x, this.groundY - 8, this.theme.palette.enemy, heavy ? 34 : 26); this._gorePeople(hit.x); }
      if (hits.length || heavy) { if (this.theme.effects.shake) this._shake(heavy ? 14 : 9); this.flash = 1; }
      if (heavy && !hits.length) this._blast(x, this.groundY - 8, 64, "#ff3838");   // big boom even on empty ground
      if (this.cities.every(c => !c.alive)) this._gameOver();
    }

    // the little people go out in a (cartoonish) blaze: red mist + blood droplets + bones flipping about
    _gorePeople(x) {
      if (!this.theme.effects.particles) return;
      const gy = this.groundY - 8, s = this.uiScale || 1;
      this.particles.emit({ x: x, y: gy, count: 16, colors: ["#c81e2e", "#e0303a", "#7a0e18"], speedMin: 10, speedMax: 95, spread: 22, spreadY: 9,
        gravity: -10, drag: 1.7, sizeMin: 3, sizeMax: 8 * s, lifeMin: 0.6, lifeMax: 1.5, glow: this.theme.effects.glow, shape: "circle" });   // red mist cloud
      this.particles.emit({ x: x, y: gy, count: 18, colors: ["#e23a3a", "#ff5a5a", "#a01822"], speedMin: 70, speedMax: 320, angleMin: -Math.PI * 0.95, angleMax: -Math.PI * 0.05,
        gravity: 540, drag: 0.6, sizeMin: 1.2, sizeMax: 3, lifeMin: 0.4, lifeMax: 0.9, glow: false, shape: "circle" });   // blood droplets
      this.particles.emit({ x: x, y: gy, count: 11, colors: ["#f2ead8", "#e8dcc0", "#fff7e8"], speedMin: 90, speedMax: 330, angleMin: -Math.PI * 0.9, angleMax: -Math.PI * 0.1,
        gravity: 560, drag: 0.3, spin: 18, sizeMin: 2.2 * s, sizeMax: 4 * s, lifeMin: 0.7, lifeMax: 1.6, glow: false, shape: "bone" });   // bones flipping about
      this.audio.play("hurt");
    }

    _burst(x, y, color, count) {
      if (!this.theme.effects.particles) return;
      this.particles.emit({ x: x, y: y, count: count, colors: [color, "#ffffff"], speedMin: 50, speedMax: 320,
        gravity: 120, drag: 1, sizeMin: 1.5, sizeMax: 4, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "square", spin: 6 });
    }

    _shake(m) { this.shakeMag = Math.min(SHAKE_CAP, Math.max(this.shakeMag, m * SHAKE_SCALE)); }
    _toast(text, big, color) { this.toasts.push({ text: text, born: this._now, life: 1400, big: !!big, color: color || null }); if (this.toasts.length > 4) this.toasts.shift(); }
    _gameOver() { if (this.state === "over") return; this.state = "over"; this.audio.stopMusic(); this.shell.requestGameOver({ score: this.score }); }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now;
      const s = dt / 1000;
      if (this.shakeMag > 0) { this.shakeMag -= dt * SHAKE_DECAY; if (this.shakeMag < 0) this.shakeMag = 0; }
      if (this.flash > 0) { this.flash -= dt / 350; if (this.flash < 0) this.flash = 0; }
      this.particles.update(dt);
      if (this.hintPow > 0) this.hintPow -= dt;        // ~5s "look here!" cues on the dock (tick even between waves)
      if (this.hintStreak > 0) this.hintStreak -= dt;
      if (this.hintArsenal > 0) this.hintArsenal -= dt;
      if (this.newWeaponT > 0) { this.newWeaponT -= dt; if (this.newWeaponT <= 0) this.newWeapon = null; }   // big banner window
      if (this._bannerPop > 0) { this._bannerPop -= dt / 240; if (this._bannerPop < 0) this._bannerPop = 0; }   // click-pop decay
      if (this._bannerShatterT > 0) {   // after the brief pop, the box shatters and is replaced by flying shards
        this._bannerShatterT -= dt;
        if (this._bannerShatterT <= 0 && this._bannerRect && this.newWeapon) {
          const wsh = WMAP[this.newWeapon], col = (wsh && wsh.color) || this.theme.palette.accent;
          this._shatterBanner(this._bannerRect, col);
          if (wsh) this._toast("EQUIPPED — " + wsh.name, true, col);
          this.newWeaponT = 0; this.newWeapon = null; this._bannerRect = null;   // the intact box is gone now
        }
      }
      if (this.bannerShards.length) {   // shard physics
        const ss = dt / 1000;
        for (let i = this.bannerShards.length - 1; i >= 0; i--) {
          const sh = this.bannerShards[i];
          sh.cx += sh.vx * ss; sh.cy += sh.vy * ss; sh.vy += 900 * ss; sh.rot += sh.vrot * ss; sh.life -= ss;
          if (sh.life <= 0) this.bannerShards.splice(i, 1);
        }
      }
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
      this.powerupT -= dt; if (this.powerupT <= 0 && !this.betweenWaves && this.powerups.length < POWERUP_SLOTS) { this._spawnPowerup(); this.powerupT = rand(7000, 12000); }   // a supply pod drops every ~7-12s — a noticeable event you shoot to earn (not during the breather)
      if (!this.betweenWaves && this.multishotT > 0) { this.multishotT -= dt; if (this.multishotT <= 0) { this.multishot = 1; this.multishotT = 0; this._toast("MULTI-FIRE OFF"); } }   // don't burn powerup time during the wave breather
      this.ufoT -= dt; if (this.ufoT <= 0 && this.wave >= 2 && this.ufos.length < 1) { this._spawnUfo(); this.ufoT = rand(14000, 24000); }

      // enemies (each kind moves differently; the "spine" cx/cy tracks the target, x/y add the weave)
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const m = this.enemies[i], pat = m.def ? m.def.pattern : "straight";
        const f = (m.slow > 0) ? SLOW_FACTOR : 1; if (m.slow > 0) m.slow -= s;
        m.t += s;
        if (pat === "accelerate" && m.accel) { const cap = m.spd0 * 2.6; if (Math.hypot(m.vx, m.vy) < cap) { const g = 1 + m.accel * s; m.vx *= g; m.vy *= g; } }
        else if (pat === "drift") m.vx *= (1 - 0.12 * s);   // sideways glide gradually straightens
        else if (pat === "heavy_bomber" && m.cy > this.groundY * 0.8) m.vy *= (1 + 0.5 * s);
        else if (pat === "decoy" && !m.awake && m.cy >= m.wakeY) { m.awake = true; const t = this._nearestTarget(m.cx); if (t) { const ax = t.x - m.cx, ay = this.groundY - m.cy, ad = Math.hypot(ax, ay) || 1, sp = m.spd0 * 1.3; m.vx = ax / ad * sp; m.vy = ay / ad * sp; } this._burst(m.x, m.y, "#ff5a5a", 6); }
        m.cx += m.vx * f * s; m.cy += m.vy * f * s;
        let offX = 0, offY = 0;
        if (pat === "squiggle") offX = Math.sin(m.cy * m.freq * 0.008 + m.phase) * m.amp;
        else if (pat === "corkscrew") { offX = Math.cos(m.cy * m.freq * 0.01 + m.phase) * m.amp; offY = Math.sin(m.cy * m.freq * 0.01 + m.phase) * m.amp * 0.25; }
        else if (pat === "zigzag_sharp") { const seg = 46, pp = Math.floor(m.cy / seg), fr = (m.cy % seg) / seg; offX = ((pp & 1) ? 1 : -1) * m.amp * fr; }
        else if (pat === "cluster_swarm") offX = Math.sin(m.t * m.freq + m.phase) * m.amp;
        m.x = Math.max(6, Math.min(this._w - 6, m.cx + offX)); m.y = m.cy + offY;
        if (m.splitY != null && m.cy >= m.splitY) { this._hydraSplit(m); this.enemies.splice(i, 1); continue; }
        if (m.cy >= this.groundY) { this._destroyStructure(m.x, m.heavy); this.enemies.splice(i, 1); }
      }

      // UFO spaceships
      for (let i = this.ufos.length - 1; i >= 0; i--) {
        const u = this.ufos[i]; u.zig += s; u.x += u.vx * s; u.y += Math.sin(u.zig * 2) * 14 * s;
        u.bombT -= dt; if (u.bombT <= 0) { this._spawnEnemy(u.x, u.y, null, "dart"); u.bombT = rand(1300, 2400); }
        if (u.x < -50 || u.x > this._w + 50) this.ufos.splice(i, 1);
      }

      // powerups wait in the dock's INCOMING slots, ticking down until grabbed (then they quietly expire)
      // FALLING SUPPLY PODS: drift down; a blast scoops one up (you earn it by shooting); if it reaches the ground it's LOST
      if (!this.betweenWaves) for (let i = this.powerups.length - 1; i >= 0; i--) {
        const pu = this.powerups[i]; pu.t += dt; pu.sway += s * 2;
        pu.x += (pu.vx + Math.sin(pu.sway) * 14) * s; pu.y += pu.vy * s;
        if (pu.x < 16) { pu.x = 16; pu.vx = Math.abs(pu.vx); } else if (pu.x > this._w - 16) { pu.x = this._w - 16; pu.vx = -Math.abs(pu.vx); }
        let got = false;
        for (const ex of this.explosions) { if (Math.hypot(pu.x - ex.x, pu.y - ex.y) < ex.r + 15) { got = true; break; } }
        if (got) { this.powerups.splice(i, 1); this._collectPowerup(pu, true); if (this.theme.effects.shake) this._shake(3); continue; }   // shot down -> collected (banner prompts to equip)
        if (pu.y >= this.groundY - 7) { this.powerups.splice(i, 1); this.audio.play("pill"); this._toast("DROP LOST!", false, "#ff7a7a"); }   // missed it -> gone
      }

      // black holes: vacuum enemies/ufos in, DEVOUR anything that reaches the core, then implode
      const CORE = 46;   // anything sucked this close gets eaten
      for (let i = this.blackholes.length - 1; i >= 0; i--) {
        const bh = this.blackholes[i]; bh.t += s;
        for (let j = this.enemies.length - 1; j >= 0; j--) { const m = this.enemies[j]; const dx = bh.x - m.x, dy = bh.y - m.y, d = Math.hypot(dx, dy) || 1; if (d < bh.range) { const fp = BH_PULL * 1.5 * (1 - d / bh.range); m.x += dx / d * fp * s; m.y += dy / d * fp * s; if (d < CORE) { this.enemies.splice(j, 1); this.score += 25 * this.wave; this._addKill("blast"); this._burst(m.x, m.y, bh.color, 6); } } }
        for (let j = this.ufos.length - 1; j >= 0; j--) { const u = this.ufos[j]; const dx = bh.x - u.x, dy = bh.y - u.y, d = Math.hypot(dx, dy) || 1; if (d < bh.range) { const fp = BH_PULL * 1.1 * (1 - d / bh.range); u.x += dx / d * fp * s; u.y += dy / d * fp * s; if (d < CORE + u.radius) { this.ufos.splice(j, 1); const pts = 150 + this.wave * 25; this.score += pts; this._addKill("blast"); this._burst(u.x, u.y, bh.color, 16); } } }
        if (bh.t >= bh.dur) { this._blast(bh.x, bh.y, 215, bh.color, 2.4); if (this.theme.effects.shake) this._shake(12); this.blackholes.splice(i, 1); }
      }

      // napalm globs: flaming bits that arc out, trail fire, and splash a small fire where they land
      for (let i = this.napGlobs.length - 1; i >= 0; i--) {
        const gb = this.napGlobs[i]; gb.vy += 540 * s; gb.x += gb.vx * s; gb.y += gb.vy * s; gb.fuse -= s;
        if (this.theme.effects.particles && Math.random() < 0.7) this.particles.emit({ x: gb.x, y: gb.y, count: 1, colors: ["#ffd24a", "#ff7a2a", "#ff3a1a"],
          speedMin: 5, speedMax: 28, gravity: 70, drag: 1.4, sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.2, lifeMax: 0.5, glow: this.theme.effects.glow, shape: "circle" });
        if (gb.fuse <= 0 || gb.y >= this.groundY - 4) { this._spawnFire(gb.x, Math.min(gb.y, this.groundY - 4), rand(30, 46), gb.dur * rand(0.55, 0.8), gb.color, true); this.napGlobs.splice(i, 1); }
      }

      // killstreak: DRONE STRIKE — drone flies across, rains mini-missiles at random enemies
      for (let i = this.drones.length - 1; i >= 0; i--) {
        const d = this.drones[i]; d.x += d.vx * s; d.fireT -= dt;
        if (d.fireT <= 0 && d.shots > 0 && this.enemies.length) {
          const m = this.enemies[(Math.random() * this.enemies.length) | 0];
          this.droneShots.push({ x: d.x, y: d.y + 6, tx: m.x, ty: m.y, sp: 760, color: d.color }); d.shots--; d.fireT = rand(80, 150); this.audio.play("rail");
        }
        if (d.x < -90 || d.x > this._w + 90) this.drones.splice(i, 1);
      }
      for (let i = this.droneShots.length - 1; i >= 0; i--) {
        const ds = this.droneShots[i], dx = ds.tx - ds.x, dy = ds.ty - ds.y, dd = Math.hypot(dx, dy) || 1, step = ds.sp * s;
        if (dd <= step + 6) { this._blast(ds.tx, ds.ty, 46, ds.color); this.droneShots.splice(i, 1); }
        else { ds.x += dx / dd * step; ds.y += dy / dd * step; }
      }
      // killstreak: METEOR SHOWER — fireballs rain across the whole map, exploding on impact
      if (this.meteorN > 0) { this.meteorT -= dt; if (this.meteorT <= 0) { this.meteorT = rand(70, 130); this.meteorN--; this.meteors.push({ x: rand(this._w * 0.06, this._w * 0.94), y: -20, vx: rand(-40, 40), vy: rand(260, 360), color: "#ff7a3a" }); } }
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const mt = this.meteors[i]; mt.vy += 380 * s; mt.x += mt.vx * s; mt.y += mt.vy * s;
        if (this.theme.effects.particles && Math.random() < 0.6) this.particles.emit({ x: mt.x, y: mt.y, count: 1, colors: ["#ffd24a", "#ff7a2a", "#ff3a1a"], speedMin: 5, speedMax: 26, gravity: 60, drag: 1.4, sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.2, lifeMax: 0.5, glow: this.theme.effects.glow, shape: "circle" });
        let impact = mt.y >= this.groundY - 4;
        if (!impact) for (const m of this.enemies) { if (Math.hypot(m.x - mt.x, m.y - mt.y) < 24) { impact = true; break; } }
        if (impact) { this._blast(mt.x, Math.min(mt.y, this.groundY - 4), 52, mt.color); this.meteors.splice(i, 1); }
      }
      // killstreak: VOLCANO — the ground erupts (sustained shake) and hurls lava bombs that rain back down
      if (this.volcano) {
        const v = this.volcano; v.t += s; v.spewT -= dt;
        if (this.theme.effects.shake) this._shake(7);   // ground keeps shaking through the eruption
        if (v.spewT <= 0 && v.t < v.dur) {
          v.spewT = rand(45, 95);
          for (let k = 0, n = 1 + (Math.random() < 0.6 ? 1 : 0); k < n; k++) { const a = -Math.PI / 2 + rand(-0.7, 0.7), sp = rand(440, 760); this.meteors.push({ x: v.x + rand(-22, 22), y: this.groundY - 16, vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp, color: "#ff5a2a" }); }   // lava bombs launch UP, gravity rains them down
          if (this.theme.effects.particles) this.particles.emit({ x: v.x, y: this.groundY - 14, count: 4, colors: ["#ffd24a", "#ff7a2a", "#ff3a1a"], speedMin: 120, speedMax: 440, angleMin: -Math.PI * 0.8, angleMax: -Math.PI * 0.2, gravity: 520, drag: 0.6, sizeMin: 2, sizeMax: 5, lifeMin: 0.4, lifeMax: 1.0, glow: this.theme.effects.glow, shape: "circle" });
          this.audio.play("eject");
        }
        if (v.t >= v.dur) this.volcano = null;
      }

      // napalm fire fields: incinerate enemies/UFOs inside for a few seconds + lick flames
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i]; f.t += s; f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 110;   // ~9 burn pulses / sec
          const rr = f.r * (0.85 + 0.15 * Math.sin(f.t * 8));
          for (let j = this.enemies.length - 1; j >= 0; j--) { const m = this.enemies[j]; if (Math.hypot(m.x - f.x, m.y - f.y) < rr) { this.enemies.splice(j, 1); this.score += 25 * this.wave; this._addKill("fire"); this._burst(m.x, m.y, "#ff8a3a", 7); } }
          for (let j = this.ufos.length - 1; j >= 0; j--) { const u = this.ufos[j]; if (Math.hypot(u.x - f.x, u.y - f.y) < rr + u.radius) { this.ufos.splice(j, 1); const pts = 150 + this.wave * 25; this.score += pts; this._addKill("fire"); this._burst(u.x, u.y, "#ff8a3a", 20); this._toast("UFO! +" + pts, true); } }
        }
        if (this.theme.effects.particles && Math.random() < 0.9) { const a = Math.random() * Math.PI * 2, rd = Math.sqrt(Math.random()) * f.r;
          this.particles.emit({ x: f.x + Math.cos(a) * rd, y: f.y + Math.sin(a) * rd * 0.55, count: 1, colors: ["#ffe14a", "#ff8a2a", "#ff4a1a"],
            speedMin: 10, speedMax: 45, angleMin: -Math.PI * 0.72, angleMax: -Math.PI * 0.28, gravity: -40, drag: 1.3, sizeMin: 2, sizeMax: 5, lifeMin: 0.3, lifeMax: 0.7, glow: this.theme.effects.glow, shape: "circle" }); }
        if (f.t >= f.dur) this.fires.splice(i, 1);
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
              if (trav >= 0.25 * tot) { it._homeOn = true; it.tx0 = it.tx; it.ty0 = it.ty; }   // short commit, then hunt — snapshot the aim point
            }
            if (it._homeOn) {
              const R = SEEK_REACH;   // chase only THREATS within a wide radius of where you aimed
              let tEn = null, eD = 1e9;
              for (const m of this.enemies) { if (Math.hypot(m.x - it.tx0, m.y - it.ty0) > R) continue; const d = Math.hypot(m.x - it.x, m.y - it.y); if (d < eD) { eD = d; tEn = m; } }
              for (const u of this.ufos) { if (Math.hypot(u.x - it.tx0, u.y - it.ty0) > R) continue; const d = Math.hypot(u.x - it.x, u.y - it.y); if (d < eD) { eD = d; tEn = u; } }
              tgt = tEn;
              it.tx = tgt ? tgt.x : it.tx0; it.ty = tgt ? tgt.y : it.ty0;   // nothing to chase -> keep heading to the aim point
            }
          }
          const dx = it.tx - it.x, dy = it.ty - it.y, dist = Math.hypot(dx, dy);
          let diff = Math.atan2(dy, dx) - it.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          const mt = (it.homing ? TURN_RATE * 2.4 : TURN_RATE) * s; it.heading += Math.max(-mt, Math.min(mt, diff));   // seekers turn tighter so they don't orbit
          const thrust = it.homing ? BURN_THRUST * 1.3 : BURN_THRUST, vmax = it.homing ? BURN_MAX * 1.25 : BURN_MAX;   // seekers launch & cruise a bit faster
          it.vx += Math.cos(it.heading) * thrust * s; it.vy += Math.sin(it.heading) * thrust * s;
          const dragF = 1 - BURN_DRAG * s; it.vx *= dragF; it.vy *= dragF;
          const sp = Math.hypot(it.vx, it.vy); if (sp > vmax) { it.vx *= vmax / sp; it.vy *= vmax / sp; }
          it.x += it.vx * s; it.y += it.vy * s; it.fuse -= s;
          let trig = (dist <= sp * s + 8 || dist < 14 || it.fuse <= 0);
          if (it.homing && tgt) { if (dist < 28) trig = true; else if (it.prevd != null && dist > it.prevd && dist < 95) trig = true; it.prevd = dist; }
          if (trig) {
            if (it.homing && tgt && Math.hypot(tgt.x - it.x, tgt.y - it.y) < 95) {   // a seeker reliably kills its mark
              const ei = this.enemies.indexOf(tgt);
              if (ei >= 0) { this.enemies.splice(ei, 1); this.score += 25 * this.wave; this._addKill("homing"); this._burst(tgt.x, tgt.y, it.color, 7); }
              else { const ui = this.ufos.indexOf(tgt); if (ui >= 0) { this.ufos.splice(ui, 1); const pts = 150 + this.wave * 25; this.score += pts; this._addKill("homing"); this._toast("UFO! +" + pts, true); this._burst(tgt.x, tgt.y, "#46f0c0", 20); } }
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
          let tgt = null, bd = 1e9;   // hornets hunt the nearest enemy/UFO
          for (const m of this.enemies) { const d = Math.hypot(m.x - it.x, m.y - it.y); if (d < bd) { bd = d; tgt = m; } }
          for (const u of this.ufos) { const d = Math.hypot(u.x - it.x, u.y - it.y); if (d < bd) { bd = d; tgt = u; } }
          const aimx = tgt ? tgt.x : it.tx, aimy = tgt ? tgt.y : it.ty;
          let diff = Math.atan2(aimy - it.y, aimx - it.x) - it.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          const mt = HORNET_TURN * s; it.heading += Math.max(-mt, Math.min(mt, diff));
          it.vx = Math.cos(it.heading) * HORNET_SPEED; it.vy = Math.sin(it.heading) * HORNET_SPEED;
          it.x += it.vx * s; it.y += it.vy * s; it.fuse -= s;
          if (this.theme.effects.particles && Math.random() < 0.5) this.particles.emit({ x: it.x, y: it.y, count: 1, colors: [it.color || "#9aff6a", "#ffffff"], speedMin: 2, speedMax: 20, gravity: 0, drag: 1.6, sizeMin: 1.2, sizeMax: 2.4, lifeMin: 0.2, lifeMax: 0.5, glow: this.theme.effects.glow, shape: "circle" });
          let trig = false;
          if (tgt) { if (bd < 28) trig = true; else if (it.prevd != null && bd > it.prevd && bd < 95) trig = true; it.prevd = bd; }
          if (trig || it.fuse <= 0 || it.y > this.groundY) {
            if (tgt && Math.hypot(tgt.x - it.x, tgt.y - it.y) < 95) {  // a homing missile reliably kills its mark (matches the flyby trigger radius)
              const ei = this.enemies.indexOf(tgt);
              if (ei >= 0) { this.enemies.splice(ei, 1); this.score += 25 * this.wave; this._addKill("homing"); this._burst(tgt.x, tgt.y, it.color, 13); if (this.theme.effects.shake) this._shake(3); }
              else { const ui = this.ufos.indexOf(tgt); if (ui >= 0) { this.ufos.splice(ui, 1); const pts = 150 + this.wave * 25; this.score += pts; this._addKill("homing"); this._toast("UFO! +" + pts, true); this._burst(tgt.x, tgt.y, "#46f0c0", 20); if (this.theme.effects.shake) this._shake(6); } }
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
        if (ex.phase === "grow") { ex.r += (ex.gw || BLAST_GROW) * s; if (ex.r >= ex.maxR) { ex.r = ex.maxR; ex.phase = "shrink"; } } else { ex.r -= BLAST_SHRINK * s; }
        for (let j = this.enemies.length - 1; j >= 0; j--) { const m = this.enemies[j]; if (Math.hypot(m.x - ex.x, m.y - ex.y) < ex.r) { this.enemies.splice(j, 1); this.score += 25 * this.wave; this._addKill("blast"); this._burst(m.x, m.y, this.theme.palette.enemy, 8); this._blast(m.x, m.y, CHAIN_MAX, ex.color); } }
        for (let j = this.ufos.length - 1; j >= 0; j--) { const u = this.ufos[j]; if (Math.hypot(u.x - ex.x, u.y - ex.y) < ex.r + u.radius) { this.ufos.splice(j, 1); const pts = 150 + this.wave * 25; this.score += pts; this._addKill("blast"); this._burst(u.x, u.y, "#46f0c0", 26); this._toast("UFO! +" + pts, true); if (this.theme.effects.shake) this._shake(6); } }
        if (ex.r <= 0) this.explosions.splice(i, 1);
      }

      let anyPanic = false;
      for (const c of this.cities) {
        if (!c.alive) { c.panic = false; continue; }
        c.panic = this.enemies.some(m => Math.hypot(m.x - c.x, m.y - this.groundY) < PANIC_DIST);
        if (c.panic) { anyPanic = true; if (this.enemies.length && this.tracers.length < 64 && Math.random() < dt / 150) this._spawnTracer(c.x); }   // panicking folks plink away (harmless)
      }
      // ARMY at the firing bases: stationed soldiers lay down OCCASIONAL covering fire — ONLY when a threat is within reach
      if (this.enemies.length) for (const b of this.batteries) { if (b.alive && this.tracers.length < 80 && Math.random() < dt / 360 && this._townNearest(b.x, this.groundY - 12, ARMY_RANGE)) this._spawnSoldierTracer(b.x); }
      if (this.peopleCdT > 0) this.peopleCdT -= dt;
      if (this.armyCdT > 0) this.armyCdT -= dt;
      for (let i = this.tracers.length - 1; i >= 0; i--) {
        const tr = this.tracers[i]; tr.x += tr.vx * s; tr.y += tr.vy * s; tr.life -= s;
        let hit = false;
        const ready = tr.army ? (this.armyCdT <= 0) : (this.peopleCdT <= 0);   // army + crowd each have their own limited-but-separate firepower
        if (ready) {
          for (let k = this.enemies.length - 1; k >= 0; k--) {
            const m = this.enemies[k];
            if (Math.hypot(m.x - tr.x, m.y - tr.y) < 16) { this.enemies.splice(k, 1); this.score += tr.army ? 15 : 5; this._addKill(tr.army ? "army" : "civ"); this._burst(m.x, m.y, tr.color || "#ffe066", 9); if (tr.army) this.armyCdT = rand(2600, 3600); else this.peopleCdT = rand(2200, 3200); hit = true; break; }
          }
        }
        if (hit || tr.life <= 0 || tr.y < -12) this.tracers.splice(i, 1);
      }

      // ---- MILITIA volleys: when you've armed the townsfolk, the crowd auto-fires its upgraded guns at threats ----
      const townWeapons = this.townUpgrades.filter(id => TUMAP[id].kind === "weapon");
      if (townWeapons.length && this.enemies.length) {
        this.townFireT -= dt;
        if (this.townFireT <= 0) {
          const rangeMul = 1 + this.townRangeLvl * 0.30;
          const baseCd = Math.max(1500, 2600 - this.townMultiLvl * 110 - this.townRangeLvl * 70);   // SUPPORT cadence (floored slow) — RANGE/AMMO only nudge it
          this.townFireT = baseCd * rand(0.85, 1.15);
          const alive = this.cities.filter(c => c.alive);
          if (alive.length) {
            const volleys = 1;   // ONE volley per cadence — many weapons = VARIETY, not more total firepower (so auto-defense can't outpace the wave)
            for (let v = 0; v < volleys; v++) {
              const wid = townWeapons[(Math.random() * townWeapons.length) | 0];
              const reach = (TUMAP[wid].range || 320) * rangeMul;
              const inRange = alive.filter(c => this._townNearest(c.x, this.groundY - 9, reach));   // only cities with a threat actually in reach fire
              if (!inRange.length) continue;   // nothing close enough -> hold fire (keeps it fun)
              this._townFire(inRange[(Math.random() * inRange.length) | 0].x, wid, rangeMul, 0);
            }
          }
        }
      }
      // town projectiles: pellets fly straight, bees home, rockets burst into fireworks, molotovs lob into fire
      for (let i = this.townShots.length - 1; i >= 0; i--) {
        const t = this.townShots[i]; let dead = false;
        if (t.type === "pellet") {
          t.x += t.vx * s; t.y += t.vy * s; t.life -= s;
          if (this._townDamage(t.x, t.y, 13, t.color, 10)) dead = true;
          else if (t.life <= 0 || t.y < -14 || t.x < -14 || t.x > this._w + 14) dead = true;
        } else if (t.type === "bee") {
          const tg = this._townNearest(t.x, t.y, 1e9);
          if (tg) { let diff = Math.atan2(tg.y - t.y, tg.x - t.x) - t.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2; const mt = 7 * s; t.heading += Math.max(-mt, Math.min(mt, diff)); }
          t.wig += s * 22; const perp = t.heading + Math.PI / 2, wob = Math.sin(t.wig) * 34;
          t.x += Math.cos(t.heading) * t.spd * s + Math.cos(perp) * wob * s; t.y += Math.sin(t.heading) * t.spd * s + Math.sin(perp) * wob * s; t.fuse -= s;
          if (this.theme.effects.particles && Math.random() < 0.3) this.particles.emit({ x: t.x, y: t.y, count: 1, colors: [t.color, "#3a2a00"], speedMin: 2, speedMax: 14, gravity: 0, drag: 2, sizeMin: 1, sizeMax: 2, lifeMin: 0.1, lifeMax: 0.3, glow: this.theme.effects.glow, shape: "circle" });
          if (this._townDamage(t.x, t.y, 12, t.color, 9)) dead = true;
          else if (t.fuse <= 0 || t.y > this.groundY) dead = true;
        } else if (t.type === "rocket") {
          const dx = t.tx - t.x, dy = t.ty - t.y, d = Math.hypot(dx, dy) || 1, step = t.spd * s; t.spin += s * 12;
          if (this.theme.effects.particles) this.particles.emit({ x: t.x, y: t.y, count: 1, colors: ["#fff1b0", t.color, "#ff3a1a"], speedMin: 4, speedMax: 26, gravity: 30, drag: 1.4, sizeMin: 1.4, sizeMax: 3, lifeMin: 0.18, lifeMax: 0.45, glow: this.theme.effects.glow, shape: "circle" });
          if (d <= step + 6 || this._townNearest(t.x, t.y, 16)) { this._fireworkBurst(t.x, t.y, t.color, t.fw); dead = true; }
          else { t.x += dx / d * step; t.y += dy / d * step; }
        } else if (t.type === "molotov") {
          t.vy += 620 * s; t.x += t.vx * s; t.y += t.vy * s; t.spin += s * 10;
          if (t.y >= this.groundY - 4 || this._townNearest(t.x, t.y, 14)) { this._spawnFire(t.x, Math.min(t.y, this.groundY - 4), t.r, 2.0, t.color); this._blast(t.x, Math.min(t.y, this.groundY - 4), 24, t.color); dead = true; }
          else if (t.x < -20 || t.x > this._w + 20) dead = true;
        }
        if (dead) this.townShots.splice(i, 1);
      }

      if (anyPanic && !this._prevPanic) { this.sirenT = 0; this.crowdT = 0; }   // siren only re-arms on a genuine calm->panic transition (no flicker spam)
      if (anyPanic) {
        this.sirenT -= dt; if (this.sirenT <= 0) { this.audio.play("siren"); this.sirenT = 9000; }
        this.crowdT -= dt; if (this.crowdT <= 0) { this.audio.play("crowd"); this.crowdT = rand(3000, 5500); }
      }
      this._prevPanic = anyPanic;

      if (!this.betweenWaves && this.pending <= 0 && this.enemies.length === 0 && this.ufos.length === 0) {   // all THREATS down -> start a breather
        const aliveCities = this.cities.filter(c => c.alive).length;
        const bonus = aliveCities * 120;
        if (bonus > 0) { this.score += bonus; this._toast("+" + bonus + " BONUS", true); }
        if (this.powerups.length) {   // pending pods SHATTER (heartbreaking) instead of freezing in the sky — you snooze, you lose
          const R = 14 * (this.uiScale || 1);
          for (const pu of this.powerups) this._shatterBanner({ x: pu.x - R, y: pu.y - R * 0.6, w: R * 2, h: R * 1.35 }, pu.color || "#ffd24a");
          this.audio.play("drain"); this._toast("SUPPLIES LOST — TOO SLOW!", true, "#ff7a7a");
          this.powerups.length = 0;
        }
        this.betweenWaves = true; this.waveBreakT = 5000;
      }
      if (this.betweenWaves) {
        this.waveBreakT -= dt;
        if (this.waveBreakT <= 0) { this.betweenWaves = false; this._nextWave(); }
      }
    }

    // ---------------- render ----------------
    resize(w, h) { this._w = w; this._h = h; this._layout(w, h); this.renderer.w = w; this.renderer.h = h; this.renderer.groundY = this.groundY; }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme;
      R.drawBackground(ctx, th, now, this.groundY);
      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1 && !this.paused) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }   // freeze the shake while paused (no jank)
      ctx.save(); ctx.translate(sx, sy);
      R.drawGround(ctx, th, this.groundY);   // ground rides WITH the shake so the bases stay planted on it
      for (const c of this.cities) { R.drawCity(ctx, th, c.x, c.alive); if (c.alive) R.drawPeople(ctx, th, c.x, c.panic, now); }
      for (const b of this.batteries) { R.drawBattery(ctx, th, b.x, b.alive); if (b.alive) R.drawSoldiers(ctx, th, b.x, now); }
      R.drawTracers(ctx, th, this.tracers);
      for (const bh of this.blackholes) R.drawBlackhole(ctx, th, bh);
      for (const m of this.enemies) R.drawEnemy(ctx, th, m);
      for (const u of this.ufos) R.drawUfo(ctx, th, u, now);
      for (const it of this.interceptors) R.drawInterceptor(ctx, th, it);
      for (const pu of this.powerups) R.drawDrop(ctx, th, pu, now, this.uiScale);   // falling supply pods (shoot to earn)
      for (const ex of this.explosions) R.drawExplosion(ctx, th, ex);
      for (const f of this.fires) R.drawFire(ctx, th, f, now);
      for (const gb of this.napGlobs) R.drawEmber(ctx, th, gb);
      for (const mt of this.meteors) R.drawEmber(ctx, th, mt);
      for (const ds of this.droneShots) R.drawEmber(ctx, th, ds);
      for (const ts of this.townShots) R.drawTownShot(ctx, th, ts, now);
      for (const d of this.drones) R.drawDrone(ctx, th, d, now);
      if (this.volcano) R.drawVolcano(ctx, th, this.volcano, now);
      for (const z of this.zaps) R.drawZap(ctx, th, z);
      this.particles.render(ctx);
      // aim crosshair + (when multi-fire is active) dim markers showing where each extra shot lands
      R.drawCrosshair(ctx, th, this.aim.x, this.aim.y, (this.multishot || 1) > 1 ? this._salvoPoints(this.aim.x, this.aim.y) : null, this.uiScale);
      ctx.restore();
      R.drawHUD(ctx, th, { score: this.score, wave: this.wave, cities: this.cities.filter(c => c.alive).length,
        mult: this.multishot || 1, multFrac: this.multishotT > 0 ? this.multishotT / MULT_DURATION : 0, scale: this.uiScale });
      // ---- bottom CONTROL DOCK: arsenal · militia · killstreaks (pickups now fall from the sky) ----
      const chips = this.weaponChips.map(ch => { const w = WMAP[ch.id]; const cd = this.cdT[ch.id] || 0; return {
        rect: ch, short: w.short, id: ch.id, color: w.color, locked: !this.unlocked[ch.id], active: this.weapon === ch.id,
        heatFrac: this.heat[ch.id] || 0, cooling: cd > 0, cdFrac: cd > 0 ? (cd / (this.cdMax[ch.id] || w.cd)) : 0,
        reloadFrac: 1 - Math.max(0, this.reload[ch.id] || 0) / (this.reloadMax[ch.id] || w.reload), keyNum: WEAPONS.indexOf(w) + 1 }; });
      const strk = this.streaks.map((id, i) => ({ rect: this.streakSlots[i], id: id, icon: SMAP[id].icon, color: SMAP[id].color,
        name: SMAP[id].name, picked: this._rmbDown && i === this._streakSel })).filter(s => s.rect);
      const militia = this.townUpgrades.map((id, i) => { const u = TUMAP[id]; return { rect: this.militiaSlots[i], id: id, short: u.short, color: u.color,
        lvl: u.kind === "range" ? this.townRangeLvl : (u.kind === "multi" ? this.townMultiLvl : 0) }; }).filter(m => m.rect);
      R.drawDock(ctx, th, { dockTop: this.dockTop, dockH: this.dockH, w: this._w, now: now, scale: this.uiScale,
        weapons: chips, streaks: strk, streakSlots: this.streakSlots,
        militia: militia, militiaSlots: this.militiaSlots,
        meter: this.streaks.length < STREAK_MAX ? (this.streakKills / STREAK_EVERY) : 1,
        nextSlot: Math.min(this.streaks.length, STREAK_MAX - 1),
        hint: { arsenal: this.hintArsenal } });
      // big center "NEW WEAPON" banner with a 3s window to select it (clickable — see _pd)
      if (this.newWeaponT > 0 && this.newWeapon) {
        const nw = WMAP[this.newWeapon];
        this._bannerRect = R.drawNewWeaponBanner(ctx, th, { id: this.newWeapon, name: nw.name, color: nw.color || th.palette.accent,
          frac: Math.max(0, this.newWeaponT / 3000), keyNum: WEAPONS.indexOf(nw) + 1, active: this.weapon === this.newWeapon,
          scale: this.uiScale, now: now, pop: this._bannerPop });
      } else this._bannerRect = null;
      // flying banner shards (the box shattering apart)
      if (this.bannerShards.length) {
        const glow = th.effects.glow;
        for (const sh of this.bannerShards) {
          const a = Math.max(0, Math.min(1, sh.life / sh.max));
          ctx.save(); ctx.globalAlpha = a; ctx.translate(sh.cx, sh.cy); ctx.rotate(sh.rot);
          ctx.beginPath(); ctx.moveTo(sh.v[0].x, sh.v[0].y); ctx.lineTo(sh.v[1].x, sh.v[1].y); ctx.lineTo(sh.v[2].x, sh.v[2].y); ctx.closePath();
          ctx.fillStyle = "rgba(11,16,24,0.92)"; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = sh.col;
          if (glow) { ctx.shadowBlur = 8; ctx.shadowColor = sh.col; }
          ctx.stroke(); ctx.restore();
        }
      }
      if (this.betweenWaves) {   // breather countdown between waves
        const p = th.palette, s = this.uiScale || 1, cy = this._h * 0.40, pulse = 0.5 + 0.5 * Math.sin(now / 260);
        ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (th.effects.glow) { ctx.shadowBlur = 16; ctx.shadowColor = p.accent; }
        ctx.fillStyle = p.accent; ctx.font = "800 " + Math.round(30 * s) + "px " + th.fonts.ui;
        ctx.fillText("WAVE " + this.wave + " CLEARED", this._w / 2, cy);
        // new-round flourish: fresh supplies, anything is possible
        ctx.fillStyle = "#ffe14d"; ctx.globalAlpha = 0.6 + 0.4 * pulse; ctx.font = "800 " + Math.round(16 * s) + "px " + th.fonts.ui;
        if (th.effects.glow) ctx.shadowColor = "#ffe14d";
        ctx.fillText("⚡ FRESH DROPS INCOMING — ANYTHING IS POSSIBLE ⚡", this._w / 2, cy + Math.round(30 * s));
        ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.fillStyle = p.textDim; ctx.font = "600 " + Math.round(18 * s) + "px " + th.fonts.ui;
        ctx.fillText("WAVE " + (this.wave + 1) + " IN " + Math.ceil(this.waveBreakT / 1000), this._w / 2, cy + Math.round(58 * s));
        ctx.restore();
      }
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
        const tc = t.color || th.palette.accent;
        if (th.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = tc; }
        ctx.fillStyle = tc;
        ctx.fillText(t.text, this._w / 2, this._h * 0.34 - pr * 20 + i * 30);
      }
      ctx.restore();
    }
  }

  M.Game = MissileDefense;
})(window.Arcade = window.Arcade || {});
