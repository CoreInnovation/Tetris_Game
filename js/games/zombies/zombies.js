/* =========================================================
   DEADGRID: Last Stand — isometric zombie-horde survivor.
   You start in the center; the dead pour in from every edge in
   escalating waves. Auto-fire your active weapon at the nearest
   ghoul, kite forever, scoop XP, and on every level-up CHOOSE
   one of three upgrades. Collect & switch between 12 weapons,
   buy 8 attributes, grab powerups, and survive the bosses.
   Controls: thumbstick / WASD move, auto-aim, Space dash,
   Shift sprint, Q-E or 1-9 switch weapon.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const Z = Arcade.Zombies;
  const MK = Arcade.MusicKit;
  const TAU = Math.PI * 2;
  const KX = 1.0, KY = 0.5;             // must match renderer
  const MOVE = 1.15;                    // global speed scalar (world feel)
  const DESPAWN = 2400;                 // cull enemies that wander this far (world px)
  const BASE_SPEED = 150;               // player base world px/s (pre-MOVE)
  const ARENA = 1500;                   // player roam radius (world px)
  const MAX_ENEMIES = 150;

  // ---------------- enemy roster ----------------
  // speed/dmg/radius in world px; introWave compressed for arcade pacing.
  const ENEMIES = [
    { key: "shuffler",  name: "Shuffler",       glyph: "🧟", role: "shambler", introWave: 1,  hp: 20,  speed: 55,  dmg: 8,  radius: 16, color: "#6aa84f", xp: 1,  score: 10 },
    { key: "sprinter",  name: "Sprinter",       glyph: "🏃", role: "runner",   introWave: 2,  hp: 14,  speed: 185, dmg: 10, radius: 12, color: "#45c4e0", xp: 2,  score: 18 },
    { key: "bull",      name: "Bonehead Bull",  glyph: "🐂", role: "charger",  introWave: 3,  hp: 60,  speed: 70,  dmg: 22, radius: 22, color: "#c0504d", xp: 5,  score: 40 },
    { key: "hocker",    name: "Hocker",         glyph: "🤮", role: "ranged",   introWave: 4,  hp: 28,  speed: 45,  dmg: 6,  radius: 15, color: "#9fc83a", xp: 3,  score: 30 },
    { key: "puffball",  name: "Puffball",       glyph: "💥", role: "exploder", introWave: 5,  hp: 18,  speed: 95,  dmg: 30, radius: 18, color: "#7bbf3a", xp: 3,  score: 35 },
    { key: "crawler",   name: "Crawler",        glyph: "🦗", role: "swarm",    introWave: 6,  hp: 5,   speed: 160, dmg: 4,  radius: 7,  color: "#5c4b7d", xp: 1,  score: 6 },
    { key: "brood",     name: "Brood Mother",   glyph: "🥚", role: "spawner",  introWave: 7,  hp: 110, speed: 40,  dmg: 12, radius: 26, color: "#b06fd6", xp: 8,  score: 70 },
    { key: "hulk",      name: "Hulk Husk",      glyph: "🗿", role: "tank",     introWave: 8,  hp: 320, speed: 50,  dmg: 26, radius: 34, color: "#8a8d91", xp: 10, score: 120 },
    { key: "banshee",   name: "Wailing Banshee",glyph: "👻", role: "support",  introWave: 10, hp: 70,  speed: 65,  dmg: 8,  radius: 20, color: "#9fd8ff", xp: 6,  score: 80 },
    { key: "necro",     name: "Necro Conductor",glyph: "🪦", role: "special",  introWave: 12, hp: 140, speed: 60,  dmg: 10, radius: 22, color: "#5fae8c", xp: 8,  score: 100 },
    { key: "boss",      name: "The Gloom Maw",  glyph: "👹", role: "boss",     introWave: 99, hp: 800, speed: 70,  dmg: 40, radius: 56, color: "#3a2a4d", xp: 100, score: 1000 }
  ];
  const EMAP = {}; ENEMIES.forEach(e => EMAP[e.key] = e);
  Z.ENEMIES = EMAP;

  // ---------------- weapon arsenal ----------------
  const WEAPONS = [
    { id: "popgun",   name: "Rusty Popper",       tier: 1,  fireType: "projectile", dmg: 8,  fireRate: 520,  range: 340, projSpeed: 460, color: "#c9c27a", draw: "diamond" },
    { id: "scatter",  name: "Scatterjack",        tier: 2,  fireType: "spread",     dmg: 6,  fireRate: 760,  range: 240, projSpeed: 420, pellets: 5, fan: 0.7, knock: 70, color: "#ff8c42", draw: "diamond" },
    { id: "razor",    name: "Razor Carousel",     tier: 3,  fireType: "orbit",      dmg: 10, fireRate: 0,    range: 92,  projSpeed: 0,   blades: 3, color: "#7ad0ff" },
    { id: "boomfork", name: "Boomfork",           tier: 4,  fireType: "boomerang",  dmg: 16, fireRate: 900,  range: 300, projSpeed: 520, color: "#b6ff5e", draw: "fork" },
    { id: "lobnade",  name: "Glob Lobber",        tier: 5,  fireType: "aoe_lob",    dmg: 26, fireRate: 1100, range: 300, projSpeed: 300, blast: 80, color: "#5bf0a0", draw: "blob" },
    { id: "wasp",     name: "Wasp Swarm",         tier: 6,  fireType: "homing",     dmg: 14, fireRate: 380,  range: 380, projSpeed: 380, count: 2, turn: 5.2, color: "#ffd23f", draw: "dart" },
    { id: "arc",      name: "Arc Conductor",      tier: 7,  fireType: "chain",      dmg: 22, fireRate: 700,  range: 320, projSpeed: 0,   chain: 5, decay: 0.15, color: "#8be9ff" },
    { id: "flame",    name: "Cinder Tongue",      tier: 7,  fireType: "beam",       dmg: 12, fireRate: 70,   range: 210, projSpeed: 0,   half: 0.42, color: "#ff5a36" },
    { id: "rot",      name: "Plague Censer",      tier: 8,  fireType: "dot_field",  dmg: 18, fireRate: 1000, range: 260, projSpeed: 260, cloud: 4, color: "#9d4edd", draw: "blob" },
    { id: "rail",     name: "Voidlance Railgun",  tier: 9,  fireType: "piercing",   dmg: 60, fireRate: 1300, range: 640, projSpeed: 0,   color: "#ff3df0" },
    { id: "turret",   name: "Bolt Buddy Turret",  tier: 10, fireType: "summon",     dmg: 20, fireRate: 0,    range: 360, projSpeed: 520, max: 2, color: "#3df0a0" },
    { id: "scythe",   name: "Reaper's Backhand",  tier: 10, fireType: "melee_arc",  dmg: 75, fireRate: 650,  range: 140, projSpeed: 0,   half: 1.9, knock: 160, lifesteal: 1, color: "#e0e0ff" }
  ];
  const WMAP = {}; WEAPONS.forEach(w => WMAP[w.id] = w);
  Z.WEAPONS = WMAP;

  // ---------------- attributes ----------------
  const ATTRS = [
    { id: "max_health", name: "Iron Hide",         icon: "❤", max: 7, short: "+20 max HP (and heal up)" },
    { id: "move_speed", name: "Fleet Foot",        icon: "🥾", max: 6, short: "+8% move speed" },
    { id: "stamina",    name: "Second Wind",       icon: "💨", max: 5, short: "+25 stamina (more dashes)" },
    { id: "fire_rate",  name: "Trigger Frenzy",    icon: "🔥", max: 6, short: "+10% fire rate" },
    { id: "crit",       name: "Killshot Instinct", icon: "🎯", max: 7, short: "+6% crit chance (2.5x)" },
    { id: "lifesteal",  name: "Vampire Coil",      icon: "🩸", max: 5, short: "+2% damage healed back" },
    { id: "magnet",     name: "Loot Lasso",        icon: "🧲", max: 5, short: "+45px pickup magnet" },
    { id: "luck",       name: "Lucky Charm",       icon: "🍀", max: 5, short: "+12% drops, better rolls" }
  ];
  const AMAP = {}; ATTRS.forEach(a => AMAP[a.id] = a);

  // ---------------- powerups ----------------
  const POWERUPS = [
    { id: "med",        name: "Med-Diamond",   icon: "✚", color: "#46f06a", weight: 40 },
    { id: "adrenal",    name: "Adrenal Surge", icon: "⚡", color: "#ff9a2a", weight: 18 },
    { id: "frost",      name: "Frost Nova",    icon: "❄", color: "#8fd9ff", weight: 14 },
    { id: "overcharge", name: "Overcharge",    icon: "🔋", color: "#7a6bff", weight: 12 },
    { id: "boom",       name: "Boom Barrel",   icon: "💣", color: "#ff4a3a", weight: 9 },
    { id: "gold",       name: "Gold Cache",    icon: "★", color: "#ffd24d", weight: 5 }
  ];
  const PMAP = {}; POWERUPS.forEach(p => PMAP[p.id] = p);
  Z.POWERUPS = PMAP;

  // ---------------- music ----------------
  function song(def) {
    const tracks = [
      { wave: "square", gain: 0.16, notes: def.melody },
      { wave: "triangle", gain: 0.20, notes: def.bass }
    ];
    if (def.drumBeats) { tracks.push({ drum: true, gain: 0.30, notes: MK.fourOnFloor(def.drumBeats) }); tracks.push({ drum: true, gain: 0.18, notes: MK.backbeat(def.drumBeats / 4) }); }
    return { bpm: def.bpm, volume: def.volume, tracks: tracks };
  }
  const MAIN = song({ bpm: 138, volume: 0.16, drumBeats: 32,
    melody: [["A4",.5],["B4",.5],["C5",1],["B4",.5],["A4",.5],["E4",1],["A4",.5],["B4",.5],["C5",.5],["E5",.5],["D5",1],["C5",1],["A4",.5],["B4",.5],["C5",1],["B4",.5],["G4",.5],["E4",1],["F4",.5],["E4",.5],["D4",.5],["E4",.5],["A4",2],["E5",.5],["D5",.5],["C5",1],["B4",.5],["A4",.5],["G4",1],["A4",.5],["C5",.5],["E5",.5],["A5",.5],["G5",1],["E5",1],["F5",.5],["E5",.5],["D5",1],["C5",.5],["B4",.5],["A4",1],["B4",.5],["C5",.5],["B4",.5],["A4",.5],["A4",2]],
    bass: [["A2",1],["A2",1],["E2",1],["E2",1],["A2",1],["A2",1],["C3",1],["C3",1],["A2",1],["A2",1],["E2",1],["G2",1],["F2",1],["F2",1],["E2",1],["E2",1],["A2",1],["A2",1],["G2",1],["G2",1],["A2",1],["C3",1],["E3",1],["E3",1],["F2",1],["D2",1],["E2",1],["E2",1],["A2",1],["G2",1],["E2",1],["E2",1]] });
  const CREEP = song({ bpm: 96, volume: 0.13, drumBeats: 16,
    melody: [["D4",1],[null,.5],["F4",.5],["E4",1],[null,1],["D4",1],[null,.5],["Eb4",.5],["D4",1],["A3",1],["F4",1],[null,.5],["G4",.5],["A4",1],[null,1],["Bb4",1],["A4",.5],["F4",.5],["D4",2],["A4",1],[null,.5],["C5",.5],["Bb4",1],[null,1],["A4",1],["G4",.5],["F4",.5],["E4",1],["D4",1],["Eb4",1],[null,.5],["D4",.5],["C4",1],[null,1],["D4",1],[null,1],["A3",1],["D4",1]],
    bass: [["D2",2],["D2",1],["A2",1],["D2",2],["Bb1",1],["A1",1],["D2",2],["F2",1],["F2",1],["Bb1",2],["A1",2],["D2",2],["F2",1],["F2",1],["A1",2],["A1",2],["Bb1",2],["A1",1],["A1",1],["D2",2],["A1",2]] });
  const HORDE = song({ bpm: 160, volume: 0.18, drumBeats: 32,
    melody: [["E5",.5],["E5",.5],["G5",.5],["E5",.5],["B5",.5],["A5",.5],["G5",1],["E5",.5],["F#5",.5],["G5",.5],["A5",.5],["B5",1],["E5",1],["E5",.5],["E5",.5],["G5",.5],["E5",.5],["C6",.5],["B5",.5],["A5",1],["G5",.5],["F#5",.5],["E5",.5],["D5",.5],["E5",2],["B5",.5],["A5",.5],["G5",.5],["F#5",.5],["E5",.5],["D5",.5],["B4",1],["C5",.5],["D5",.5],["E5",.5],["G5",.5],["B5",1],["A5",1],["G5",.5],["A5",.5],["B5",.5],["C6",.5],["D6",.5],["B5",.5],["G5",1],["A5",.5],["G5",.5],["F#5",.5],["E5",.5],["E5",2]],
    bass: [["E2",.5],["E2",.5],["E2",.5],["E2",.5],["B2",.5],["B2",.5],["B2",1],["C3",.5],["C3",.5],["C3",.5],["C3",.5],["B2",1],["E2",1],["E2",.5],["E2",.5],["E2",.5],["E2",.5],["A2",.5],["A2",.5],["A2",1],["G2",.5],["G2",.5],["G2",.5],["G2",.5],["E2",2],["E2",.5],["E2",.5],["E2",.5],["E2",.5],["D2",.5],["D2",.5],["D2",1],["C2",.5],["C2",.5],["C2",.5],["C2",.5],["B1",1],["A1",1],["G1",.5],["G1",.5],["G1",.5],["G1",.5],["D2",.5],["D2",.5],["D2",1],["A1",.5],["A1",.5],["B1",.5],["B1",.5],["E2",2]] });
  const SONGS = [{ id: "main", name: "Dead Reckoning", song: MAIN }, { id: "creep", name: "Rot Beneath", song: CREEP }, { id: "horde", name: "Swarm Singularity", song: HORDE }];
  Z.SONGS = SONGS;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function angNorm(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

  class Game {
    constructor(ctx) {
      this.shell = ctx; this.ctx2d = ctx.ctx; this.particles = ctx.particles; this.audio = ctx.audio;
      this.renderer = new Z.Renderer();
      this.theme = Z.getTheme(ctx.storage.get("zombies:theme", "modern"));
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("zombies:song", 0) | 0));
      this.aimMode = ctx.storage.get("zombies:aim", "auto");   // "auto" = lock+fire nearest | "manual" = you aim (mouse / aim-stick)
      this.pointerInput = true;
      this.dev = false;
      this._unsub = []; this.paused = false; this._now = 0;
      this._cssW = 800; this._cssH = 600; this._w = 800; this._h = 600;
      this._keys = {};
      this.stick = { active: false, id: null, baseX: 0, baseY: 0, kx: 0, ky: 0, dx: 0, dy: 0, mag: 0 };
      this.aimStick = { active: false, id: null, baseX: 0, baseY: 0, kx: 0, ky: 0, dx: 0, dy: 0, mag: 0 };
      this._mouse = { x: 0, y: 0, on: false };
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      this.state = "playing"; this.paused = false;
      this.score = 0; this.level = 1; this.xp = 0; this.xpNeed = 50; this._pendingLevels = 0;
      this.combo = 1; this.comboKills = 0; this.comboT = 0;
      this.wave = 0; this.spawnQueue = []; this.spawnT = 0; this.spawnGap = 900; this.breatherT = 0; this.betweenWaves = false;
      this.player = { wx: 0, wy: 0, hp: 100, maxHp: 100, stam: 100, maxStam: 100, aim: 0, radius: 15, invuln: 0, dashT: 0, dashCd: 0, hurtCd: 0, walk: 0, moving: false, flip: 1, regenPause: 0 };
      this.attr = {}; ATTRS.forEach(a => this.attr[a.id] = 0);
      this.weapons = ["popgun"]; this.weapon = "popgun"; this.fireCd = 0; this._popShot = 0; this.fuel = 100;
      if (this.dev) this.weapons = WEAPONS.map(w => w.id);
      this.enemies = []; this.bullets = []; this.eproj = []; this.pickups = [];
      this.fields = []; this.decals = []; this.turrets = []; this.dmgNums = [];
      this.zaps = []; this.rails = []; this.sweeps = []; this.shocks = []; this.toasts = [];
      this.orbit = { count: 0, ang: 0, r: 92, hitCd: {} };
      this.beam = null;
      this.boosts = { adrenal: 0, overcharge: 0, frostSlow: 0 };
      this.boss = null; this._bossMusic = false; this._lastMoveDir = null;
      this.shakeMag = 0; this._eid = 1;
      this.camX = 0; this.camY = 0; this._lastOx = null; this._lastOy = null;
      this.introT = 7000;   // controls hint, fades after a few seconds or first input
      this.particles.clear();
      this._nextWave();
      this._applyMusic();
    }

    // ---------------- derived stats ----------------
    _maxHp() { return 100 + this.attr.max_health * 20; }
    _maxStam() { return 100 + this.attr.stamina * 25; }
    _speedMult() { return (1 + this.attr.move_speed * 0.08) * (this.boosts.adrenal > 0 ? 1.25 : 1); }
    _fireMult() { return Math.pow(0.90, this.attr.fire_rate) * (this.boosts.adrenal > 0 ? 0.72 : 1); }
    _critChance() { return this.attr.crit * 0.06; }
    _lifesteal() { return this.attr.lifesteal * 0.02; }
    _magnetR() { return 40 + this.attr.magnet * 45; }
    _luck() { return this.attr.luck * 0.12; }

    // ---------------- menus / chrome ----------------
    menus() {
      const self = this;
      return {
        control: {
          profiles: [{ id: "auto", name: "Auto-aim (locks nearest)" }, { id: "manual", name: "Manual aim (mouse / aim-stick)" }],
          profile: this.aimMode,
          setProfile: (id) => { self._setAimMode(id); }
        },
        music: { options: SONGS.map((s, i) => ({ id: i, name: s.name })), current: this.songIdx, set: (i) => { self.songIdx = i; self.shell.storage.set("zombies:song", i); self._applyMusic(); self._toast("♪ " + SONGS[i].name); } },
        skin: { options: Z.Themes.map(t => ({ id: t.id, name: t.name })), current: this.theme.id, set: (id) => { const t = Z.Themes.find(x => x.id === id); if (t) { self.theme = t; self.shell.storage.set("zombies:theme", id); if (!t.effects.particles) self.particles.clear(); } } }
      };
    }
    cycleTheme() { const l = Z.Themes; this.theme = l[(l.indexOf(this.theme) + 1) % l.length]; this.shell.storage.set("zombies:theme", this.theme.id); return this.theme.name; }
    _applyMusic() { this.audio.playMusic(SONGS[this.songIdx].song); }
    cycleMusic() { this._bossMusic = false; this.songIdx = (this.songIdx + 1) % SONGS.length; this.shell.storage.set("zombies:song", this.songIdx); this._applyMusic(); const n = SONGS[this.songIdx].name; this._toast("♪ " + n); return n; }
    _setAimMode(id) { this.aimMode = id; this.shell.storage.set("zombies:aim", id); this._clearSticks(); this._toast(id === "auto" ? "AUTO-AIM" : "MANUAL AIM", true, this.theme.palette.accent); }
    _toggleAim() { this._setAimMode(this.aimMode === "auto" ? "manual" : "auto"); }
    toggleDev() {
      this.dev = !this.dev;
      if (this.dev) { this.weapons = WEAPONS.map(w => w.id); this.player.hp = this._maxHp(); }
      this._toast(this.dev ? "DEV — all weapons + godmode" : "DEV OFF");
      return this.dev;
    }

    pause() { this.paused = true; this._clearTouch(); this.audio.suspendMusic(); }
    resume() { this.paused = false; this.audio.resumeMusic(); }
    destroy() { this.audio.stopMusic(); this._clearTouch(); this._unsub.forEach(fn => fn()); this._unsub.length = 0; }
    _clearSticks() { this.stick.active = false; this.stick.id = null; this.stick.mag = 0; this.aimStick.active = false; this.aimStick.id = null; this.aimStick.mag = 0; }
    _clearTouch() { this._clearSticks(); this._keys = {}; }

    _toast(text, big, color) { this.toasts.push({ text: text, born: this._now, life: 1500, big: !!big, color: color }); if (this.toasts.length > 4) this.toasts.shift(); }
    _shake(m) { if (this.theme.effects.shake) this.shakeMag = Math.max(this.shakeMag, m); }

    // ---------------- input ----------------
    _bindInput() {
      const input = this.shell.input;
      this._unsub.push(input.onDown((code, e, repeat) => {
        if (this.state === "levelup") { if (code === "Digit1") this._chooseCard(0); else if (code === "Digit2") this._chooseCard(1); else if (code === "Digit3") this._chooseCard(2); else if (code === "Digit4") this._chooseCard(3); return; }
        if (this.paused || this.state !== "playing") return;
        this._keys[code] = true; this.introT = 0;
        if (repeat) return;
        if (code === "Space") this._dash();
        else if (code === "KeyF") this._toggleAim();
        else if (code === "KeyQ" || code === "BracketLeft") this._switchWeapon(-1);
        else if (code === "KeyE" || code === "BracketRight") this._switchWeapon(1);
        else if (code.indexOf("Digit") === 0) { const n = parseInt(code.slice(5), 10) - 1; if (n >= 0 && n < this.weapons.length) { this.weapon = this.weapons[n]; this.audio.play("select"); this._toast(WMAP[this.weapon].name); } }
      }));
      this._unsub.push(input.onUp((code) => { this._keys[code] = false; }));
      if (this.shell.isTouch) this._bindTouch();
      // mouse aim / level-up clicks / aim-toggle pill
      const canvas = this.shell.canvas;
      const toLocal = (ev) => { const r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (this._cssW / r.width), y: (ev.clientY - r.top) * (this._cssH / r.height) }; };
      const onMove = (ev) => { const p = toLocal(ev); this._mouse.x = p.x; this._mouse.y = p.y; this._mouse.on = true; };
      const onClick = (ev) => { const p = toLocal(ev); this.introT = 0; if (this.state === "levelup") { const i = this.renderer.levelUpHit(p.x, p.y); if (i >= 0) this._chooseCard(i); return; } if (this.renderer.aimToggleHit(p.x, p.y)) this._toggleAim(); };
      canvas.addEventListener("mousemove", onMove); canvas.addEventListener("mousedown", onClick);
      this._unsub.push(() => { canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mousedown", onClick); });
    }

    _bindTouch() {
      const canvas = this.shell.canvas, STICK_MAX = 64;
      const toLocal = (t) => { const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left) * (this._cssW / r.width), y: (t.clientY - r.top) * (this._cssH / r.height) }; };
      const onStart = (e) => {
        if (this.state === "levelup") { for (const t of e.changedTouches) { const p = toLocal(t); const i = this.renderer.levelUpHit(p.x, p.y); if (i >= 0) { this._chooseCard(i); e.preventDefault(); return; } } return; }
        if (this.paused || this.state !== "playing") return;
        e.preventDefault(); this.introT = 0;
        for (const t of e.changedTouches) {
          const p = toLocal(t);
          if (this.renderer.aimToggleHit(p.x, p.y)) { this._toggleAim(); continue; }        // tap the AIM pill to toggle
          if (this._inDash(p.x, p.y)) { this._dash(); continue; }                            // dash button (always present, bottom-right)
          if (p.x < this._cssW * 0.5) { if (this.stick.id != null) continue; const s = this.stick; s.active = true; s.id = t.identifier; s.baseX = p.x; s.baseY = p.y; s.kx = p.x; s.ky = p.y; s.dx = 0; s.dy = 0; s.mag = 0; }
          else { // right side: manual -> aim stick (fires while held); auto -> dash tap
            if (this.aimMode === "manual") { if (this.aimStick.id != null) continue; const a = this.aimStick; a.active = true; a.id = t.identifier; a.baseX = p.x; a.baseY = p.y; a.kx = p.x; a.ky = p.y; a.dx = 0; a.dy = 0; a.mag = 0; }
            else this._dash();
          }
        }
      };
      const onMove = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          for (const s of [this.stick, this.aimStick]) {
            if (t.identifier !== s.id) continue;
            const p = toLocal(t); let vx = p.x - s.baseX, vy = p.y - s.baseY, d = Math.hypot(vx, vy);
            if (d > STICK_MAX) { const nx = vx / d, ny = vy / d; s.baseX = p.x - nx * STICK_MAX; s.baseY = p.y - ny * STICK_MAX; vx = nx * STICK_MAX; vy = ny * STICK_MAX; d = STICK_MAX; }
            s.kx = s.baseX + vx; s.ky = s.baseY + vy;
            if (d > 0.001) { s.dx = vx / d; s.dy = vy / d; } else { s.dx = 0; s.dy = 0; }
            s.mag = Math.min(1, d / STICK_MAX);
          }
        }
      };
      const onEnd = (e) => { for (const t of e.changedTouches) { for (const s of [this.stick, this.aimStick]) { if (t.identifier === s.id) { s.active = false; s.id = null; s.mag = 0; } } } };
      canvas.addEventListener("touchstart", onStart, { passive: false });
      canvas.addEventListener("touchmove", onMove, { passive: false });
      canvas.addEventListener("touchend", onEnd, { passive: false });
      canvas.addEventListener("touchcancel", onEnd, { passive: false });
      this._unsub.push(() => { canvas.removeEventListener("touchstart", onStart); canvas.removeEventListener("touchmove", onMove); canvas.removeEventListener("touchend", onEnd); canvas.removeEventListener("touchcancel", onEnd); });
    }

    _switchWeapon(dir) {
      if (this.weapons.length < 2) return;
      let i = this.weapons.indexOf(this.weapon); i = (i + dir + this.weapons.length) % this.weapons.length;
      this.weapon = this.weapons[i]; this.audio.play("select"); this._toast(WMAP[this.weapon].name);
    }

    // screen-intent (ix,iy) -> normalized WORLD direction (so WASD/stick map to screen axes)
    _screenToWorld(ix, iy) { let dwx = ix * (1 / (2 * KX)) + iy * (1 / (2 * KY)); let dwy = -ix * (1 / (2 * KX)) + iy * (1 / (2 * KY)); const m = Math.hypot(dwx, dwy); return m > 0.001 ? { x: dwx / m, y: dwy / m } : { x: 0, y: 0 }; }
    _dashPos() { return { x: this._cssW - 62, y: this._cssH - 96 }; }
    _inDash(x, y) { const d = this._dashPos(); return Math.hypot(x - d.x, y - d.y) < 44; }

    _dash() {
      const pl = this.player; if (pl.dashCd > 0) return;
      const cost = 35; if (this.boosts.overcharge <= 0 && pl.stam < cost) return;
      const dir = this._lastMoveDir || { x: Math.cos(pl.aim), y: Math.sin(pl.aim) };
      pl.dashVX = dir.x; pl.dashVY = dir.y; pl.dashT = 0.18; pl.dashCd = 0.5; pl.invuln = Math.max(pl.invuln, 250);
      if (this.boosts.overcharge <= 0) pl.stam -= cost; pl.regenPause = 1;
      this.audio.play("dash");
    }

    // ---------------- waves ----------------
    _nextWave() {
      this.wave++;
      this.betweenWaves = false; this.breatherT = 0;
      const isBoss = this.wave >= 6 && this.wave % 6 === 0;
      this.spawnQueue = [];
      if (isBoss) {
        this.spawnQueue.push({ key: "boss", boss: true });
        const trickle = 4 + this.wave; for (let i = 0; i < trickle; i++) this.spawnQueue.push({ key: this._rollEnemy() });
        this.audio.play("bossroar");
        if (this.songIdx !== 2) { this._prevSong = this.songIdx; this.audio.playMusic(SONGS[2].song); this._bossMusic = true; }
      } else {
        if (this._bossMusic) { this._bossMusic = false; this._applyMusic(); }
        const budget = Math.round(6 + this.wave * 2.6);
        for (let i = 0; i < budget; i++) this.spawnQueue.push({ key: this._rollEnemy() });
      }
      this.spawnGap = Math.max(260, 900 - this.wave * 40);
      this.spawnT = 400;
      if (this.wave > 1) this._toast("WAVE " + this.wave, true, this.theme.palette.danger);
      this.audio.play("wavestart");
    }

    _rollEnemy() {
      const avail = ENEMIES.filter(e => e.role !== "boss" && e.introWave <= this.wave);
      // weight: favor newer types a bit, but keep trash common
      const weighted = [];
      for (const e of avail) {
        let w = 5;
        if (e.role === "swarm" || e.role === "shambler") w = 10;
        if (e.role === "tank" || e.role === "spawner" || e.role === "special") w = 2;
        if (e.role === "support") w = 2;
        for (let k = 0; k < w; k++) weighted.push(e.key);
      }
      return pick(weighted);
    }

    _spawnEnemy(key, opt) {
      if (this.enemies.length >= MAX_ENEMIES && key !== "boss") return null;
      const def = EMAP[key], pl = this.player;
      let wx, wy;
      if (opt && opt.wx != null) { wx = opt.wx; wy = opt.wy; }
      else { // spawn on an off-screen ring (screen-space circle, inverse-projected to world)
        const a = rand(0, TAU), Rs = this._screenSpawnR || 760, sdx = Math.cos(a) * Rs, sdy = Math.sin(a) * Rs;
        wx = pl.wx + sdx / (2 * KX) + sdy / (2 * KY); wy = pl.wy - sdx / (2 * KX) + sdy / (2 * KY);
      }
      let hp = def.hp;
      if (def.role !== "boss") hp = Math.round(hp * (1 + (this.wave - 1) * 0.06 + Math.max(0, this.wave - 8) * 0.045));   // super-linear so the late horde isn't trivial
      else { const bossNum = Math.max(0, Math.floor(this.wave / 6) - 1); hp = Math.round(def.hp * (1 + bossNum * 0.6)); }   // 800 at wave 6, +60% each boss
      if (opt && opt.hpScale) hp = Math.round(hp * opt.hpScale);
      const e = { id: this._eid++, key: key, def: def, wx: wx, wy: wy, hp: hp, maxHp: hp, radius: def.radius, vx: 0, vy: 0, kvx: 0, kvy: 0, t: 0, bob: rand(0, TAU), xj: rand(0.9, 1.1), flip: 1, hitFlash: 0, slow: 0, buffT: 0, st: "track", stT: 0, atkT: rand(1, 3) };
      if (def.role === "boss") { e.phase = 0; e.atkMode = "none"; e.atkT = 2; this.boss = e; }
      if (def.role === "support") e.phaseA = 0.8;
      this.enemies.push(e); return e;
    }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now; const s = dt / 1000;
      if (this.shakeMag > 0) { this.shakeMag -= dt * 0.04; if (this.shakeMag < 0) this.shakeMag = 0; }
      for (let i = this.toasts.length - 1; i >= 0; i--) if (now - this.toasts[i].born > this.toasts[i].life) this.toasts.splice(i, 1);
      this.particles.update(dt);
      if (this.state !== "playing") return;

      const pl = this.player;
      // boosts
      for (const k in this.boosts) if (this.boosts[k] > 0) this.boosts[k] = Math.max(0, this.boosts[k] - s);
      // timers
      if (pl.invuln > 0) pl.invuln -= dt;
      if (pl.hurtCd > 0) pl.hurtCd -= dt;
      if (pl.dashCd > 0) pl.dashCd -= s;
      if (pl.regenPause > 0) pl.regenPause -= s;
      if (this.comboT > 0) { this.comboT -= s; if (this.comboT <= 0) { this.combo = 1; this.comboKills = 0; } }

      this._updatePlayer(s);
      this._updateSpawns(dt);
      this._weaponTick(s);
      this._updateBullets(s);
      this._updateEnemies(s);
      this._updateEnemyProj(s);
      this._updateFields(s);
      this._updateTurrets(s);
      this._updatePickups(s);
      this._updateVisuals(s);
      this._collisions(s);

      // camera follows player (snap; iso reads cleaner without lag)
      this.camX = pl.wx; this.camY = pl.wy;

      if (pl.hp <= 0) this._gameOver();
    }

    _updatePlayer(s) {
      const pl = this.player, K = this._keys;
      let ix = 0, iy = 0;
      if (this.stick.active && this.stick.mag > 0.12) { ix = this.stick.dx * this.stick.mag; iy = this.stick.dy * this.stick.mag; }
      else { if (K.KeyA || K.ArrowLeft) ix -= 1; if (K.KeyD || K.ArrowRight) ix += 1; if (K.KeyW || K.ArrowUp) iy -= 1; if (K.KeyS || K.ArrowDown) iy += 1; }
      const mag = Math.min(1, Math.hypot(ix, iy));
      let dir = { x: 0, y: 0 };
      if (mag > 0.01) { dir = this._screenToWorld(ix, iy); this._lastMoveDir = dir; pl.moving = true; pl.flip = (dir.x - dir.y) >= 0 ? 1 : -1; pl.walk += s * 12; }
      else pl.moving = false;
      // sprint
      const wantSprint = (K.ShiftLeft || K.ShiftRight || (this.stick.active && this.stick.mag > 0.92));
      let sprint = 1;
      if (wantSprint && pl.moving && (pl.stam > 0 || this.boosts.overcharge > 0)) { sprint = 1.5; if (this.boosts.overcharge <= 0) { pl.stam -= 30 * s; pl.regenPause = 0.6; } }
      let spd = BASE_SPEED * this._speedMult() * sprint * MOVE;
      // dash overrides
      if (pl.dashT > 0) { pl.dashT -= s; spd = BASE_SPEED * 3.4 * MOVE; dir = { x: pl.dashVX, y: pl.dashVY }; pl.moving = true; }
      if (mag > 0.01 || pl.dashT > 0) { pl.wx += dir.x * spd * s; pl.wy += dir.y * spd * s; }
      // clamp to arena
      const dd = Math.hypot(pl.wx, pl.wy); if (dd > ARENA) { pl.wx *= ARENA / dd; pl.wy *= ARENA / dd; }
      // stamina regen
      if (pl.regenPause <= 0 && pl.stam < this._maxStam()) pl.stam = Math.min(this._maxStam(), pl.stam + 20 * s);
      pl.maxStam = this._maxStam();
      // aim
      const target = this._aimTarget();
      this._aimT = target;
      let ret = null;
      if (this.aimMode === "manual") {
        if (this.shell.isTouch) { if (this.aimStick.active && this.aimStick.mag > 0.15) { const d = this._screenToWorld(this.aimStick.dx, this.aimStick.dy); pl.aim = Math.atan2(d.y, d.x); } }
        else if (this._mouse.on) { const wdir = this._screenToWorld(this._mouse.x - this._cssW / 2, this._mouse.y - this._cssH / 2); pl.aim = Math.atan2(wdir.y, wdir.x); }
        const rr = Math.min(240, WMAP[this.weapon].range || 240);
        ret = { wx: pl.wx + Math.cos(pl.aim) * rr, wy: pl.wy + Math.sin(pl.aim) * rr };
      } else if (target) { pl.aim = Math.atan2(target.wy - pl.wy, target.wx - pl.wx); ret = { wx: target.wx, wy: target.wy, lock: true }; }
      this._reticle = ret;
      if (this.introT > 0) this.introT -= s * 1000;
    }

    _aimTarget() {
      const pl = this.player; let best = null, bd = 1e9;
      const range = (WMAP[this.weapon].range || 400) * 1.3;
      for (const e of this.enemies) { const d = dist(e.wx, e.wy, pl.wx, pl.wy); if (d < bd) { bd = d; best = e; } }
      if (best && bd > range + 200 && WMAP[this.weapon].fireType !== "orbit") return best; // still aim at nearest even if far
      return best;
    }

    _updateSpawns(dt) {
      if (this.betweenWaves) { this.breatherT -= dt; if (this.breatherT <= 0) this._nextWave(); return; }
      if (this.spawnQueue.length > 0) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) { const it = this.spawnQueue.shift(); this._spawnEnemy(it.key); this.spawnT = it.boss ? 600 : this.spawnGap * rand(0.6, 1.1); }
      } else if (!this.boss && this.enemies.length <= 3) {
        // wave cleared -> short breather + survival bonus
        const bonus = this.wave * 250; this.score += bonus; this._toast("WAVE " + this.wave + " CLEARED  +" + bonus, true, this.theme.palette.accent);
        this.betweenWaves = true; this.breatherT = 3000;
      }
    }

    // ---------------- weapons ----------------
    _weaponTick(s) {
      const w = WMAP[this.weapon], pl = this.player;
      // AUTO always fires; MANUAL fires while you direct it (mouse on desktop, aim-stick held on mobile)
      const firing = this.aimMode === "auto" ? true : (this.shell.isTouch ? this.aimStick.active : true);
      // passive: orbit blades (only while selected)
      if (w.fireType === "orbit") { this.orbit.count = w.blades; this.orbit.r = w.range; this.orbit.ang += s * 3.2; this._orbitDamage(s, w); }
      else this.orbit.count = 0;
      // passive: turrets
      if (w.fireType === "summon") this._ensureTurrets(w);
      // beam (continuous)
      if (w.fireType === "beam") { const haveAim = this.aimMode === "manual" || this._aimT; if (firing && haveAim && this.fuel > 0) { this.beam = { wx: pl.wx, wy: pl.wy, ang: pl.aim, len: w.range, half: w.half }; this.fuel = Math.max(0, this.fuel - 35 * s); this._beamDamage(s, w); } else { this.beam = null; this.fuel = Math.min(100, this.fuel + 22 * s); } return; }
      else this.beam = null;
      if (w.fireType === "orbit" || w.fireType === "summon") return;
      // discrete fire
      this.fireCd -= s * 1000;
      if (this.fireCd > 0) return;
      if (!firing) return;
      if (this.aimMode === "auto" && !this._aimT && w.fireType !== "melee_arc") return;   // auto: nothing to shoot at
      this._fire(w);
      this.fireCd = w.fireRate * this._fireMult();
    }

    _fire(w) {
      const pl = this.player, a = pl.aim;
      this.audio.play("zhit");
      if (w.fireType === "projectile") { this._popShot = (this._popShot + 1) % 5; this._spawnBullet(pl.wx, pl.wy, a, w, { forceCrit: this._popShot === 0 }); }
      else if (w.fireType === "spread") { for (let i = 0; i < w.pellets; i++) { const ang = a + (i / (w.pellets - 1) - 0.5) * w.fan; this._spawnBullet(pl.wx, pl.wy, ang, w, { knock: w.knock }); } }
      else if (w.fireType === "boomerang") { this._spawnBullet(pl.wx, pl.wy, a, w, { boomerang: true, origin: { wx: pl.wx, wy: pl.wy }, phase: "out" }); }
      else if (w.fireType === "homing") { for (let i = 0; i < w.count; i++) { const ang = a + (i - (w.count - 1) / 2) * 0.4; this._spawnBullet(pl.wx, pl.wy, ang, w, { homing: true, turn: w.turn }); } }
      else if (w.fireType === "aoe_lob") { const t = this._aimT, tx = t ? t.wx : pl.wx + Math.cos(a) * w.range, ty = t ? t.wy : pl.wy + Math.sin(a) * w.range; this._spawnLob(pl.wx, pl.wy, tx, ty, w, "muck"); }
      else if (w.fireType === "dot_field") { const t = this._aimT, tx = t ? t.wx : pl.wx + Math.cos(a) * w.range, ty = t ? t.wy : pl.wy + Math.sin(a) * w.range; this._spawnLob(pl.wx, pl.wy, tx, ty, w, "rot"); }
      else if (w.fireType === "chain") this._chain(w);
      else if (w.fireType === "piercing") this._rail(w);
      else if (w.fireType === "melee_arc") this._scythe(w);
    }

    _spawnBullet(wx, wy, ang, w, extra) {
      const spd = w.projSpeed * MOVE, life = (w.range / (w.projSpeed || 1));
      const b = Object.assign({ wx: wx, wy: wy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, dmg: w.dmg, wid: w.id, color: w.color, draw: w.draw, life: life, r: 8, pierce: 0, hit: {}, z: 0 }, extra || {});
      this.bullets.push(b);
    }
    _spawnLob(wx, wy, tx, ty, w, kind) {
      const d = dist(wx, wy, tx, ty), spd = Math.max(140, w.projSpeed) * MOVE, life = d / spd;
      this.bullets.push({ wx: wx, wy: wy, vx: (tx - wx) / Math.max(0.001, life), vy: (ty - wy) / Math.max(0.001, life), dmg: w.dmg, wid: w.id, color: w.color, draw: "blob", life: life, r: 8, lob: true, kind: kind, w: w, z: 0, zPeak: 40 + d * 0.06 });
    }

    _orbitDamage(s, w) {
      const pl = this.player; const cd = this.orbit.hitCd;
      for (const id in cd) { cd[id] -= s; if (cd[id] <= 0) delete cd[id]; }
      for (let k = 0; k < this.orbit.count; k++) {
        const a = this.orbit.ang + k * TAU / this.orbit.count, bx = pl.wx + Math.cos(a) * this.orbit.r, by = pl.wy + Math.sin(a) * this.orbit.r;
        for (const e of this.enemies.slice()) { if (cd[e.id]) continue; if (dist(e.wx, e.wy, bx, by) < e.radius + 14) { this._damage(e, w.dmg, bx, by, false, 50); cd[e.id] = 0.35; } }
      }
    }
    _beamDamage(s, w) {
      const pl = this.player;
      for (const e of this.enemies.slice()) { const d = dist(e.wx, e.wy, pl.wx, pl.wy); if (d > w.range + e.radius) continue; const ang = Math.atan2(e.wy - pl.wy, e.wx - pl.wx); if (Math.abs(angNorm(ang - pl.aim)) < w.half) { this._damage(e, w.dmg * s * 12, e.wx, e.wy, false, 0); e.burn = 1.2; if (this.theme.effects.particles && Math.random() < 0.4) this._spark(e.wx, e.wy, "#ff7a2a", 1); } }
      if (this.theme.effects.particles && Math.random() < 0.6) { const r = rand(40, w.range), a = pl.aim + rand(-w.half, w.half); this._spark(pl.wx + Math.cos(a) * r, pl.wy + Math.sin(a) * r, pick(["#ffe14d", "#ff8c2a", "#ff3a1a"]), 2); }
    }
    _chain(w) {
      const pl = this.player; let cx = pl.wx, cy = pl.wy; const used = {}, pts = [{ wx: pl.wx, wy: pl.wy }]; let dmg = w.dmg;
      for (let k = 0; k < w.chain; k++) {
        let best = null, bd = (k === 0 ? w.range : 220);
        for (const e of this.enemies) { if (used[e.id]) continue; const d = dist(e.wx, e.wy, cx, cy); if (d < bd) { bd = d; best = e; } }
        if (!best) break; used[best.id] = 1; pts.push({ wx: best.wx, wy: best.wy }); const slowed = best.slow > 0; this._damage(best, dmg * (slowed ? 1.5 : 1), best.wx, best.wy, false, 0); cx = best.wx; cy = best.wy; dmg *= (1 - w.decay);
      }
      if (pts.length > 1) { this.zaps.push({ pts: pts, life: 0.22, maxLife: 0.22, color: w.color }); this.audio.play("zap"); if (pts.length > 4) this._shake(3); }
    }
    _rail(w) {
      const pl = this.player, a = pl.aim, ex = pl.wx + Math.cos(a) * w.range, ey = pl.wy + Math.sin(a) * w.range;
      for (const e of this.enemies.slice()) { const proj = ((e.wx - pl.wx) * Math.cos(a) + (e.wy - pl.wy) * Math.sin(a)); if (proj < 0 || proj > w.range) continue; const perp = Math.abs(-(e.wx - pl.wx) * Math.sin(a) + (e.wy - pl.wy) * Math.cos(a)); if (perp < e.radius + 16) this._damage(e, w.dmg, e.wx, e.wy, false, 30); }
      this.rails.push({ wx: pl.wx, wy: pl.wy, x2: ex, y2: ey, life: 0.25, maxLife: 0.25, color: w.color });
      pl.wx -= Math.cos(a) * 14; pl.wy -= Math.sin(a) * 14; this.audio.play("rail"); this._shake(5);
    }
    _scythe(w) {
      const pl = this.player; let healed = 0;
      for (const e of this.enemies.slice()) { const d = dist(e.wx, e.wy, pl.wx, pl.wy); if (d > w.range + e.radius) continue; const ang = Math.atan2(e.wy - pl.wy, e.wx - pl.wx); if (Math.abs(angNorm(ang - pl.aim)) < w.half) { this._damage(e, w.dmg, e.wx, e.wy, false, w.knock); if (w.lifesteal) { this.player.hp = Math.min(this._maxHp(), this.player.hp + 1); healed++; } } }
      this.sweeps.push({ wx: pl.wx, wy: pl.wy, ang: pl.aim, half: w.half, r: w.range, life: 0.22, maxLife: 0.22, color: w.color }); this.audio.play("whoosh"); this._shake(2);
    }

    _ensureTurrets(w) {
      const pl = this.player;
      this.turrets = this.turrets.filter(t => t.hp > 0);
      while (this.turrets.length < w.max) { const ang = rand(0, TAU), r = 70; this.turrets.push({ wx: pl.wx + Math.cos(ang) * r, wy: pl.wy + Math.sin(ang) * r, hp: 60, maxHp: 60, fireCd: rand(200, 600), w: w }); }
    }
    _updateTurrets(s) {
      for (const t of this.turrets) {
        t.fireCd -= s * 1000;
        if (t.fireCd <= 0) { let best = null, bd = t.w.range; for (const e of this.enemies) { const d = dist(e.wx, e.wy, t.wx, t.wy); if (d < bd) { bd = d; best = e; } } if (best) { const a = Math.atan2(best.wy - t.wy, best.wx - t.wx), spd = t.w.projSpeed * MOVE; this.bullets.push({ wx: t.wx, wy: t.wy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg: t.w.dmg * (this.dev ? 1 : 1), wid: "turret", color: "#3df0a0", draw: "bolt", life: t.w.range / t.w.projSpeed, r: 7, hit: {} }); t.fireCd = 520 * this._fireMult(); this.audio.play("shoot"); } else t.fireCd = 200; }
      }
    }

    // ---------------- bullets ----------------
    _updateBullets(s) {
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (b.homing) { let t = null, bd = 1e9; for (const e of this.enemies) { if (b.hit[e.id]) continue; const d = dist(e.wx, e.wy, b.wx, b.wy); if (d < bd) { bd = d; t = e; } } if (t) { let cur = Math.atan2(b.vy, b.vx); const diff = angNorm(Math.atan2(t.wy - b.wy, t.wx - b.wx) - cur); const mt = b.turn * s; cur += Math.max(-mt, Math.min(mt, diff)); const sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp; } }
        if (b.boomerang) {
          if (b.phase === "out") { b.life -= s; b.vx *= (1 - 1.4 * s); b.vy *= (1 - 1.4 * s); if (b.life <= 0 || Math.hypot(b.vx, b.vy) < 60 * MOVE) { b.phase = "back"; } }
          else { const pl = this.player, a = Math.atan2(pl.wy - b.wy, pl.wx - b.wx), sp = WMAP.boomfork.projSpeed * MOVE * 1.1; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; if (dist(b.wx, b.wy, pl.wx, pl.wy) < 24) { this.bullets.splice(i, 1); continue; } }
          b.wx += b.vx * s; b.wy += b.vy * s; continue;
        }
        if (b.lob) {
          b.life -= s; const t = 1 - Math.max(0, b.life) / (b._maxLife || (b._maxLife = b.life + s)); b.z = Math.sin(Math.min(1, t) * Math.PI) * b.zPeak;
          b.wx += b.vx * s; b.wy += b.vy * s;
          if (b.life <= 0) { this._lobLand(b); this.bullets.splice(i, 1); }
          continue;
        }
        b.wx += b.vx * s; b.wy += b.vy * s; b.life -= s;
        if (b.life <= 0) this.bullets.splice(i, 1);
      }
    }
    _lobLand(b) {
      const w = b.w; this._blast(b.wx, b.wy, w.blast || 80, w.dmg, w.color);
      if (b.kind === "muck") this.fields.push({ wx: b.wx, wy: b.wy, r: (w.blast || 80) * 0.9, life: 1.5, maxLife: 1.5, dmg: 0, tick: 0, color: "#5bf0a0", kind: "muck", slow: 0.5, owner: "player" });
      else if (b.kind === "rot") this.fields.push({ wx: b.wx, wy: b.wy, r: 100, life: w.cloud, maxLife: w.cloud, dmg: w.dmg, tick: 0, ramp: 0, color: "#9d4edd", kind: "rot", slow: 0.85, owner: "player" });
      this.audio.play("boom");
    }
    _blast(wx, wy, r, dmg, color) {
      for (const e of this.enemies.slice()) { const d = dist(e.wx, e.wy, wx, wy); if (d < r + e.radius) { const fall = 1 - d / (r + e.radius); this._damage(e, dmg * (0.4 + 0.6 * fall), e.wx, e.wy, false, 80 * fall); } }
      this.shocks.push({ wx: wx, wy: wy, r: 0, maxR: r, life: 0.4, maxLife: 0.4, color: color || this.theme.palette.danger });
      if (this.theme.effects.particles) this.particles.emit(this._burstCfg(wx, wy, color || "#ff8c2a", 16, 240));
      this._shake(4);
    }

    // ---------------- enemies ----------------
    _updateEnemies(s) {
      const pl = this.player;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i], def = e.def; e.t += s; e.bob += s * (3 + def.speed * 0.02);
        if (def.role !== "boss" && dist(e.wx, e.wy, pl.wx, pl.wy) > DESPAWN) { this.enemies.splice(i, 1); continue; }
        if (e.hitFlash > 0) e.hitFlash -= s * 1000;
        if (e.slow > 0) e.slow -= s;
        if (e.buffT > 0) e.buffT -= s;
        if (e.burn > 0) { e.burn -= s; this._damage(e, 6 * s, e.wx, e.wy, false, 0, true); if (e.hp <= 0) continue; }
        // knockback decay
        if (e.kvx || e.kvy) { e.wx += e.kvx * s; e.wy += e.kvy * s; e.kvx *= (1 - 6 * s); e.kvy *= (1 - 6 * s); if (Math.abs(e.kvx) < 2 && Math.abs(e.kvy) < 2) { e.kvx = 0; e.kvy = 0; } }
        const slowF = (e.slow > 0 ? 0.5 : 1) * (this.boosts.frostSlow > 0 ? 0.4 : 1);
        const buffF = e.buffT > 0 ? 1.3 : 1;
        const diff = 1 + Math.max(0, this.wave - 10) * 0.02;   // enemies get faster late so the horde stays threatening
        const spd = def.speed * MOVE * slowF * buffF * diff;
        const toA = Math.atan2(pl.wy - e.wy, pl.wx - e.wx), dToP = dist(e.wx, e.wy, pl.wx, pl.wy);
        e.flip = Math.cos(toA) >= 0 ? 1 : -1;
        const role = def.role;

        if (role === "boss") { this._boss(e, s, dToP, toA); }
        else if (role === "charger") {
          e.stT -= s;
          if (e.st === "track") { this._step(e, toA, spd * 0.7, s); if (e.stT <= 0 && dToP < 520) { e.st = "windup"; e.stT = 0.9; e.tgA = toA; } }
          else if (e.st === "windup") { if (e.stT <= 0) { e.st = "charge"; e.stT = 0.7; this.audio.play("zhit"); } }
          else if (e.st === "charge") { e.wx += Math.cos(e.tgA) * 320 * MOVE * s; e.wy += Math.sin(e.tgA) * 320 * MOVE * s; if (e.stT <= 0) { e.st = "stun"; e.stT = 1; } }
          else { if (e.stT <= 0) { e.st = "track"; e.stT = rand(0.5, 1.5); } }
        }
        else if (role === "runner") { let sp = spd; if (dToP < 80) { e.lunge = 0.4; } if (e.lunge > 0) { e.lunge -= s; sp *= 1.4; } this._step(e, toA, sp, s); }
        else if (role === "ranged") { const want = 280; if (dToP > want + 30) this._step(e, toA, spd, s); else if (dToP < want - 30) this._step(e, toA + Math.PI, spd * 0.8, s); e.atkT -= s; if (e.atkT <= 0 && dToP < 460) { this._hockerSpit(e, pl); e.atkT = 1.8; } }
        else if (role === "exploder") { const swell = Math.max(0, 1 - dToP / 300); e.swell = swell; this._step(e, toA, spd, s); if (!e.armed && dToP < 70) { e.armed = true; e.armT = 0.35; } if (e.armed) { e.armT -= s; if (e.armT <= 0) { this._puffBlast(e); const k = this.enemies.indexOf(e); if (k >= 0) this.enemies.splice(k, 1); continue; } } }
        else if (role === "spawner") { const want = 260; if (dToP > want) this._step(e, toA, spd, s); e.atkT -= s; e.bulge = Math.max(0, 1 - e.atkT / 0.6); if (e.atkT <= 0) { const n = 2 + (Math.random() < 0.5 ? 1 : 0); for (let k = 0; k < n; k++) { const a = rand(0, TAU); this._spawnEnemy("crawler", { wx: e.wx + Math.cos(a) * 24, wy: e.wy + Math.sin(a) * 24 }); } e.atkT = 3; this.audio.play("pickup"); } }
        else if (role === "swarm") { const jit = Math.sin(e.t * 14 + e.id) * 0.5; this._step(e, toA + jit, spd, s); }
        else if (role === "tank") { this._step(e, toA, spd, s); e.atkT -= s; if (e.atkT <= 0 && dToP < 120) { this._slam(e); e.atkT = 3; } }
        else if (role === "support") { const want = 360; if (dToP < want) this._step(e, toA + Math.PI, spd, s); else this._step(e, toA + 0.6, spd * 0.6, s); e.phaseA = 0.55 + 0.35 * Math.sin(e.t * 2); e.pulse = (e.pulse || 0) - s; if (e.pulse <= 0) { e.pulse = 0.25; for (const o of this.enemies) { if (o === e || o.def.role === "boss") continue; const dx = o.wx - e.wx, dy = o.wy - e.wy; if (dx * dx + dy * dy < 40000) o.buffT = 0.45; } } }
        else if (role === "special") { const want = 380; if (dToP < want) this._step(e, toA + Math.PI, spd, s); e.atkT -= s; e.cast = Math.max(0, 1 - e.atkT / 0.8); if (e.atkT <= 0) { this._resurrect(e); e.atkT = 4; } }
        else { // shambler
          if (e.trip > 0) { e.trip -= s; } else { this._step(e, toA, spd, s); if (Math.random() < 0.0015) e.trip = 0.3; }
        }
      }
    }
    _step(e, ang, spd, s) { e.vx = Math.cos(ang) * spd; e.vy = Math.sin(ang) * spd; e.wx += e.vx * s; e.wy += e.vy * s; }

    _hockerSpit(e, pl) {
      const lead = 0.4, tx = pl.wx + (pl._lvx || 0) * lead, ty = pl.wy + (pl._lvy || 0) * lead;
      const d = dist(e.wx, e.wy, tx, ty), life = Math.max(0.4, d / (300 * MOVE));
      this.eproj.push({ wx: e.wx, wy: e.wy, vx: (tx - e.wx) / life, vy: (ty - e.wy) / life, life: life, _max: life, z: 0, zPeak: 30 + d * 0.05, kind: "acid", dmg: e.def.dmg, color: "#9fc83a" });
      this.audio.play("zhit");
    }
    _puffBlast(e) {
      const R = 95; this.shocks.push({ wx: e.wx, wy: e.wy, r: 0, maxR: R, life: 0.4, maxLife: 0.4, color: "#7bbf3a" });
      if (this.theme.effects.particles) this.particles.emit(this._burstCfg(e.wx, e.wy, "#7bbf3a", 22, 280));
      const pl = this.player; if (dist(e.wx, e.wy, pl.wx, pl.wy) < R) this._hurt(e.def.dmg, e.wx, e.wy);
      // chain other puffballs + gas
      for (const o of this.enemies) { if (o === e) continue; const d = dist(o.wx, o.wy, e.wx, e.wy); if (d < R) { if (o.def.role === "exploder" && !o.armed) { o.armed = true; o.armT = 0.12; } else this._damage(o, 24, o.wx, o.wy, false, 60); } }
      this.fields.push({ wx: e.wx, wy: e.wy, r: 70, life: 2, maxLife: 2, dmg: 5, tick: 0, color: "#7bbf3a", kind: "gas", slow: 0, owner: "enemy" });
      this._deathFx(e); this._shake(5); this.audio.play("boom");
    }
    _slam(e) {
      const R = 110; this.shocks.push({ wx: e.wx, wy: e.wy, r: 0, maxR: R, life: 0.5, maxLife: 0.5, color: "#cfcfd6" });
      const pl = this.player; if (dist(e.wx, e.wy, pl.wx, pl.wy) < R) this._hurt(e.def.dmg, e.wx, e.wy);
      this._shake(6); this.audio.play("boom");
      if (this.theme.effects.permaDecals) this._decal(e.wx, e.wy, 22, "#1a1a1a");
    }
    _resurrect(e) {
      let made = 0;
      for (let k = this.decals.length - 1; k >= 0 && made < 3; k--) { const dc = this.decals[k]; if (dc.corpse && dist(dc.wx, dc.wy, e.wx, e.wy) < 360) { this._spawnEnemy("shuffler", { wx: dc.wx, wy: dc.wy, hpScale: 0.6 }); dc.corpse = false; made++; } }
      if (made === 0) { const a = rand(0, TAU); this._spawnEnemy("shuffler", { wx: e.wx + Math.cos(a) * 40, wy: e.wy + Math.sin(a) * 40, hpScale: 0.6 }); }
      this.audio.play("pickup");
    }

    _boss(e, s, dToP, toA) {
      const frac = e.hp / e.maxHp; e.phase = frac < 0.33 ? 2 : (frac < 0.66 ? 1 : 0);
      const spd = e.def.speed * MOVE * (1 + e.phase * 0.18);
      if (e.atkMode === "none") { this._step(e, toA, spd * 0.7, s); e.atkT -= s; if (e.atkT <= 0) { const modes = ["bite", "summon", "fan"]; e.atkMode = pick(modes); e.atkT = 1; e.tgA = toA; } }
      else if (e.atkMode === "bite") { e.atkT -= s; if (e.atkT > 0.5) { /* telegraph */ } else { e.wx += Math.cos(e.tgA) * spd * 2.4 * s; e.wy += Math.sin(e.tgA) * spd * 2.4 * s; } if (e.atkT <= 0) { if (dToP < 120) this._hurt(e.def.dmg, e.wx, e.wy); this._shake(8); e.atkMode = "none"; e.atkT = rand(1.4, 2.4); } }
      else if (e.atkMode === "summon") { e.atkT -= s; this._step(e, toA, spd * 0.4, s); if (e.atkT <= 0) { for (let k = 0; k < 6; k++) { const a = k * TAU / 6; this._spawnEnemy("crawler", { wx: e.wx + Math.cos(a) * 60, wy: e.wy + Math.sin(a) * 60 }); } e.atkMode = "none"; e.atkT = rand(1.6, 2.6); this.audio.play("bossroar"); } }
      else if (e.atkMode === "fan") { e.atkT -= s; this._step(e, toA, spd * 0.3, s); if (e.atkT <= 0) { for (let k = -2; k <= 2; k++) { const a = e.tgA + k * 0.22, d = 360, life = d / (300 * MOVE); this.eproj.push({ wx: e.wx, wy: e.wy, vx: Math.cos(a) * 300 * MOVE, vy: Math.sin(a) * 300 * MOVE, life: life, _max: life, z: 0, zPeak: 40, kind: "acid", dmg: 14, color: "#9fc83a" }); } e.atkMode = "none"; e.atkT = rand(1.4, 2.2); } }
    }

    // ---------------- enemy projectiles / fields ----------------
    _updateEnemyProj(s) {
      for (let i = this.eproj.length - 1; i >= 0; i--) { const b = this.eproj[i]; b.life -= s; const t = 1 - Math.max(0, b.life) / b._max; b.z = Math.sin(Math.min(1, t) * Math.PI) * b.zPeak; b.wx += b.vx * s; b.wy += b.vy * s; if (b.life <= 0) { this.fields.push({ wx: b.wx, wy: b.wy, r: 46, life: 3, maxLife: 3, dmg: b.dmg, tick: 0, color: "#9fc83a", kind: "acid", slow: 0, owner: "enemy" }); this.eproj.splice(i, 1); } }
    }
    _updateFields(s) {
      const pl = this.player;
      for (let i = this.fields.length - 1; i >= 0; i--) {
        const f = this.fields[i]; f.life -= s; f.tick -= s;
        if (f.kind === "rot" && f.ramp != null) f.ramp = Math.min(3, f.ramp + s * 0.5);
        if (f.tick <= 0) {
          f.tick = 0.3;
          if (f.owner === "player") { for (const e of this.enemies.slice()) { if (dist(e.wx, e.wy, f.wx, f.wy) < f.r + e.radius) { this._damage(e, f.dmg * (1 + (f.ramp || 0)), e.wx, e.wy, false, 0); if (f.slow) e.slow = Math.max(e.slow, 0.4); } } }
          else { if (dist(pl.wx, pl.wy, f.wx, f.wy) < f.r) this._hurt(f.dmg, f.wx, f.wy, true); }
        }
        if (f.life <= 0) this.fields.splice(i, 1);
      }
    }

    _updatePickups(s) {
      const pl = this.player, mr = this._magnetR();
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i]; p.t = (p.t || 0) + s;
        if (p.life != null && !p.magnet) { p.life -= s; if (p.life <= 0) { this.pickups.splice(i, 1); continue; } }   // XP shards fade so they can't pile up forever
        const d = dist(p.wx, p.wy, pl.wx, pl.wy);
        if (d < mr || p.magnet) { p.magnet = true; const a = Math.atan2(pl.wy - p.wy, pl.wx - p.wx), sp = 360 * MOVE; p.wx += Math.cos(a) * sp * s; p.wy += Math.sin(a) * sp * s; }
        else if (this.attr.magnet >= 5) { const a = Math.atan2(pl.wy - p.wy, pl.wx - p.wx); p.wx += Math.cos(a) * 60 * s; p.wy += Math.sin(a) * 60 * s; }
        if (d < pl.radius + 18) { this._collect(p); this.pickups.splice(i, 1); }
      }
      // hard cap: collapse the oldest XP shards if the field gets crowded (banks their value so nothing is lost)
      if (this.pickups.length > 110) { for (let i = 0; i < this.pickups.length && this.pickups.length > 90; i++) { if (this.pickups[i].kind === "xp") { this._gainXp(this.pickups[i].value); this.pickups.splice(i, 1); i--; } } }
    }
    _collect(p) {
      if (p.kind === "xp") { this._gainXp(p.value); this.audio.play("pickup"); if (this.theme.effects.particles) this._spark(this.player.wx, this.player.wy, this.theme.palette.accent, 3); }
      else if (p.kind === "weapon") { if (this.weapons.indexOf(p.wid) < 0) { this.weapons.push(p.wid); this.weapon = p.wid; this._toast("GOT " + WMAP[p.wid].name + "!", true, WMAP[p.wid].color); } else this._toast(WMAP[p.wid].name + " (owned)"); this.audio.play("buy"); }
      else this._applyPowerup(p.pid);
    }
    _applyPowerup(pid) {
      const pl = this.player; this.audio.play("buy");
      if (pid === "med") { const heal = Math.max(35, this._maxHp() * 0.25); pl.hp = Math.min(this._maxHp(), pl.hp + heal); this._toast("MED-KIT  +" + Math.round(heal) + " HP", true, "#46f06a"); this._spark(pl.wx, pl.wy, "#46f06a", 8); }
      else if (pid === "adrenal") { this.boosts.adrenal = Math.max(this.boosts.adrenal, 0) + 8; this._toast("ADRENALINE — faster fire & feet!", true, "#ff9a2a"); }
      else if (pid === "frost") { this.boosts.frostSlow = 4; this.audio.play("frost"); this._toast("FROST NOVA — horde frozen!", true, "#8fd9ff"); this.shocks.push({ wx: pl.wx, wy: pl.wy, r: 0, maxR: 400, life: 0.6, maxLife: 0.6, color: "#8fd9ff" }); for (const e of this.enemies) if (dist(e.wx, e.wy, pl.wx, pl.wy) < 240) e.slow = Math.max(e.slow, 2); }
      else if (pid === "overcharge") { pl.stam = this._maxStam(); this.boosts.overcharge = 6; this._toast("OVERCHARGE — free dashes!", true, "#7a6bff"); }
      else if (pid === "boom") { this._blast(pl.wx, pl.wy, 360, 120, "#ff4a3a"); this._toast("BOOM BARREL — screen nuke!", true, "#ff4a3a"); this._shake(10); }
      else if (pid === "gold") { this.score += 150; this._gainXp(120); this._toast("GOLD CACHE — +150 & big XP!", true, "#ffd24d"); }
    }

    _updateVisuals(s) {
      const pl = this.player; pl._lvx = (pl.wx - (pl._px || pl.wx)) / Math.max(0.001, s); pl._lvy = (pl.wy - (pl._py || pl.wy)) / Math.max(0.001, s); pl._px = pl.wx; pl._py = pl.wy;
      for (let i = this.zaps.length - 1; i >= 0; i--) { this.zaps[i].life -= s; if (this.zaps[i].life <= 0) this.zaps.splice(i, 1); }
      for (let i = this.rails.length - 1; i >= 0; i--) { this.rails[i].life -= s; if (this.rails[i].life <= 0) this.rails.splice(i, 1); }
      for (let i = this.sweeps.length - 1; i >= 0; i--) { this.sweeps[i].life -= s; if (this.sweeps[i].life <= 0) this.sweeps.splice(i, 1); }
      for (let i = this.shocks.length - 1; i >= 0; i--) { this.shocks[i].life -= s; if (this.shocks[i].life <= 0) this.shocks.splice(i, 1); }
      for (let i = this.dmgNums.length - 1; i >= 0; i--) { this.dmgNums[i].life -= s; if (this.dmgNums[i].life <= 0) this.dmgNums.splice(i, 1); }
      // decals fade (modern) / cap (retro)
      if (!this.theme.effects.permaDecals) for (let i = this.decals.length - 1; i >= 0; i--) { this.decals[i].life -= s; if (this.decals[i].life <= 0) this.decals.splice(i, 1); }
      if (this.decals.length > 120) this.decals.splice(0, this.decals.length - 120);
    }

    // ---------------- collisions / damage ----------------
    _collisions(s) {
      const pl = this.player;
      // bullets vs enemies
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i]; if (b.lob) continue;
        let removed = false;
        for (const e of this.enemies.slice()) {   // snapshot: _damage->_kill may splice mid-loop (piercing weapons)
          if (b.hit[e.id]) continue;
          if (dist(e.wx, e.wy, b.wx, b.wy) < e.radius + b.r) {
            const w = WMAP[b.wid]; const crit = b.forceCrit || (Math.random() < this._critChance());
            this._damage(e, b.dmg, e.wx, e.wy, crit, b.knock || 30);
            b.hit[e.id] = 1;
            if (b.wid === "rail") continue;
            if (b.boomerang || b.wid === "turret") continue;   // boomerang/turret pierce a bit
            this.bullets.splice(i, 1); removed = true; break;
          }
        }
        if (removed) continue;
      }
      // contact damage (DPS) + bursts handled elsewhere
      if (pl.invuln <= 0 && pl.dashT <= 0) {
        for (const e of this.enemies) {
          if (e.def.role === "boss") continue; // boss damage via attacks
          if (dist(e.wx, e.wy, pl.wx, pl.wy) < e.radius + pl.radius) {
            if (e.def.role === "charger" && e.st === "charge") { this._hurt(e.def.dmg, e.wx, e.wy); e.st = "stun"; e.stT = 1; }
            else this._hurt(e.def.dmg * 0.6 * s, e.wx, e.wy, true);   // smooth contact DPS
          }
        }
      }
      // enemy projectiles vs player
      for (let i = this.eproj.length - 1; i >= 0; i--) { const b = this.eproj[i]; if (b.z < 14 && dist(b.wx, b.wy, pl.wx, pl.wy) < pl.radius + 10) { this._hurt(b.dmg, b.wx, b.wy); this.eproj.splice(i, 1); } }
      // turrets take contact damage from enemies
      for (const t of this.turrets) { for (const e of this.enemies) { if (e.def.role === "boss") continue; if (dist(e.wx, e.wy, t.wx, t.wy) < e.radius + 12) { t.hp -= e.def.dmg * 0.5 * s; } } }
      this.turrets = this.turrets.filter(t => t.hp > 0);
    }

    _damage(e, amount, fx, fy, crit, knock, silent) {
      amount = crit ? amount * 2.5 : amount;
      e.hp -= amount; e.hitFlash = 90;
      if (knock && e.def.role !== "boss" && e.def.role !== "tank") { const a = Math.atan2(e.wy - this.player.wy, e.wx - this.player.wx); e.kvx += Math.cos(a) * knock; e.kvy += Math.sin(a) * knock; }
      if (!silent && (amount >= 1)) this.dmgNums.push({ wx: e.wx, wy: e.wy, val: Math.round(amount), crit: !!crit, life: 0.7, maxLife: 0.7 });
      // lifesteal
      const ls = this._lifesteal(); if (ls > 0) { this.player.hp = Math.min(this._maxHp(), this.player.hp + Math.min(5, amount * ls)); }
      if (crit && this.attr.crit >= 7 && e.def.role !== "boss" && Math.random() < 0.15) e.hp = 0;   // killshot instinct
      if (e.hp <= 0) this._kill(e);
    }

    _kill(e) {
      const idx = this.enemies.indexOf(e); if (idx < 0) return; this.enemies.splice(idx, 1);
      if (e === this.boss) { this.boss = null; this._bossDeath(e); return; }
      // combo + score
      this.comboKills++; this.comboT = 2.5;
      this.combo = this.comboKills >= 10 ? 8 : this.comboKills >= 5 ? 4 : this.comboKills >= 2 ? 2 : 1;
      this.score += e.def.score * this.combo;
      // xp shard
      this.pickups.push({ kind: "xp", wx: e.wx, wy: e.wy, value: e.def.xp, t: 0, r: 8, life: 22 });
      // drops
      this._rollDrops(e);
      this._deathFx(e); this.audio.play("zdeath");
    }
    _bossDeath(e) {
      this.score += e.def.score * 5; this._toast("BOSS DOWN!  +" + (e.def.score * 5), true, this.theme.palette.accent);
      this._blast(e.wx, e.wy, 420, 60, "#ffffff"); this._shake(14);
      for (let k = 0; k < 8; k++) { const a = rand(0, TAU), r = rand(20, 120); this.pickups.push({ kind: "xp", wx: e.wx + Math.cos(a) * r, wy: e.wy + Math.sin(a) * r, value: 14, t: 0, r: 8 }); }
      // guaranteed weapon drop
      const unowned = WEAPONS.filter(w => this.weapons.indexOf(w.id) < 0);
      if (unowned.length) this.pickups.push({ kind: "weapon", wid: pick(unowned).id, wx: e.wx, wy: e.wy, t: 0, r: 12 });
      else this.pickups.push({ kind: "powerup", pid: "gold", wx: e.wx, wy: e.wy, t: 0, r: 10 });
      if (this._bossMusic) { this._bossMusic = false; this._applyMusic(); }
    }
    _rollDrops(e) {
      const luck = this._luck();
      // powerup
      let chance = 0.045 * (1 + luck) + (e.def.score >= 70 ? 0.15 : 0);
      if (Math.random() < chance) { this.pickups.push({ kind: "powerup", pid: this._rollPowerup(luck), wx: e.wx, wy: e.wy, t: 0, r: 10 }); }
      // rare weapon drop
      const unowned = WEAPONS.filter(w => this.weapons.indexOf(w.id) < 0);
      if (unowned.length && Math.random() < 0.012 * (1 + luck * 2)) this.pickups.push({ kind: "weapon", wid: pick(unowned).id, wx: e.wx, wy: e.wy, t: 0, r: 12 });
    }
    _rollPowerup(luck) {
      const total = POWERUPS.reduce((a, p) => a + p.weight * (p.id === "gold" || p.id === "boom" ? (1 + luck * 1.5) : 1), 0);
      let r = Math.random() * total;
      for (const p of POWERUPS) { const w = p.weight * (p.id === "gold" || p.id === "boom" ? (1 + luck * 1.5) : 1); if ((r -= w) <= 0) return p.id; }
      return "med";
    }

    _hurt(amount, fx, fy, smooth) {
      const pl = this.player; if (pl.dashT > 0 || this.dev) return;
      if (!smooth && pl.hurtCd > 0) return;
      pl.hp -= amount;
      if (!smooth) { pl.hurtCd = 350; pl.invuln = Math.max(pl.invuln, 200); const a = Math.atan2(pl.wy - fy, pl.wx - fx); pl.wx += Math.cos(a) * 16; pl.wy += Math.sin(a) * 16; this.audio.play("hurt"); this._shake(5); }
      else if (Math.random() < 0.05) this.audio.play("hurt");
    }

    _gainXp(v) {
      this.xp += v;
      while (this.xp >= this.xpNeed) { this.xp -= this.xpNeed; this.level++; this.xpNeed = 50 + (this.level - 1) * 35; this._pendingLevels = (this._pendingLevels || 0) + 1; }
      if (this.state === "playing" && this._pendingLevels > 0) this._levelUp();
    }
    _levelUp() {
      this.audio.play("levelup");
      // build candidate cards
      const cards = [];
      const attrCands = ATTRS.filter(a => this.attr[a.id] < a.max);
      const shuffled = attrCands.slice().sort(() => Math.random() - 0.5);
      for (const a of shuffled) cards.push({ kind: "attr", id: a.id, title: a.name, tag: "LVL " + this.attr[a.id] + "→" + (this.attr[a.id] + 1), desc: a.short, icon: a.icon, color: this.theme.palette.accent });
      const unowned = WEAPONS.filter(w => this.weapons.indexOf(w.id) < 0);
      if (unowned.length && Math.random() < 0.5) { const w = pick(unowned); cards.unshift({ kind: "weapon", id: w.id, title: w.name, tag: "NEW WEAPON", desc: "Tier " + w.tier + " " + w.fireType.replace("_", " "), icon: "🔫", color: w.color }); }
      let pool = cards.slice(0, 3 + (this.attr.luck >= 5 && Math.random() < 0.4 ? 1 : 0));
      if (pool.length === 0) pool = [{ kind: "heal", title: "Field Medic", tag: "RESTORE", desc: "Heal to full + 300 score", icon: "✚", color: "#46f06a" }];
      this._cards = pool; this._cardSel = 0; this.state = "levelup";
      this._clearTouch(); this.audio.suspendMusic();
    }
    _chooseCard(i) {
      if (this.state !== "levelup" || !this._cards || i < 0 || i >= this._cards.length) return;
      const c = this._cards[i]; this.audio.play("buy");
      if (c.kind === "attr") { this.attr[c.id]++; if (c.id === "max_health") this.player.hp = Math.min(this._maxHp(), this.player.hp + 20); this._toast(c.title + " " + this.attr[c.id], false, this.theme.palette.accent); }
      else if (c.kind === "weapon") { this.weapons.push(c.id); this.weapon = c.id; this._toast("GOT " + WMAP[c.id].name + "!", true, c.color); }
      else if (c.kind === "heal") { this.player.hp = this._maxHp(); this.score += 300; }
      this._cards = null; this._pendingLevels = Math.max(0, (this._pendingLevels || 1) - 1);
      if (this._pendingLevels > 0) this._levelUp();   // queue: present the next level's card
      else { this.state = "playing"; this.audio.resumeMusic(); }
    }

    _gameOver() { if (this.state === "over") return; this.state = "over"; this.audio.stopMusic(); this.shell.requestGameOver({ score: this.score }); }

    // ---------------- fx helpers ----------------
    _burstCfg(wx, wy, color, count, speed) { const s = this.renderer.w2s(wx, wy); return { x: s.x, y: s.y - 8, count: count, colors: [color, "#ffffff"], speedMin: 40, speedMax: speed || 220, gravity: 0, drag: 0.85, sizeMin: 1.5, sizeMax: 3.6, lifeMin: 0.3, lifeMax: 0.8, glow: false, shape: "square", spin: 6 }; }
    _spark(wx, wy, color, n) { if (!this.theme.effects.particles) return; const s = this.renderer.w2s(wx, wy); this.particles.emit({ x: s.x, y: s.y - 8, count: n, colors: [color, "#ffffff"], speedMin: 20, speedMax: 120, drag: 0.85, sizeMin: 1.2, sizeMax: 2.8, lifeMin: 0.25, lifeMax: 0.6, glow: false, shape: "square" }); }
    _deathFx(e) {
      if (this.theme.effects.particles) this.particles.emit(this._burstCfg(e.wx, e.wy, e.def.color, 6 + (e.radius / 4 | 0), 120 + e.radius * 4));
      this._decal(e.wx, e.wy, Math.max(8, e.radius * 0.7), this.theme.palette.blood, true);
    }
    _decal(wx, wy, r, color, corpse) { this.decals.push({ wx: wx, wy: wy, r: r, rot: rand(0, TAU), color: color, life: 4, maxLife: 4, corpse: !!corpse }); }

    // ---------------- render ----------------
    resize(w, h, inset) {
      this._cssW = w; this._cssH = Math.max(140, h - (inset || 0));
      this._w = this._cssW; this._h = this._cssH;
      this._screenSpawnR = Math.hypot(this._cssW, this._cssH) * 0.56;   // just beyond the screen corners
      this.renderer.resize(this._cssW, this._cssH);
    }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme, pl = this.player;
      const ox = Math.round(this._cssW / 2 - (this.camX - this.camY) * KX);
      const oy = Math.round(this._cssH / 2 - (this.camX + this.camY) * KY);
      if (this._lastOx != null) this.particles.shiftAll(ox - this._lastOx, oy - this._lastOy);   // keep particles pinned to the world as the camera scrolls
      this._lastOx = ox; this._lastOy = oy;
      let sx = 0, sy = 0; if (this.shakeMag > 0.1) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }
      R.setCamera(ox + sx, oy + sy);
      R.drawBackground(ctx, th);
      R.drawGround(ctx, th, now, this.camX, this.camY, this.decals);
      // ground hazards + telegraphs
      for (const f of this.fields) R.drawField(ctx, th, f, now);
      this._drawTelegraphs(ctx, R, th, now);
      // shadows (ground pass)
      for (const e of this.enemies) if (e.def.role !== "support") R.drawShadow(ctx, e.wx, e.wy, e.radius * 0.9);
      for (const t of this.turrets) R.drawShadow(ctx, t.wx, t.wy, 12);
      R.drawShadow(ctx, pl.wx, pl.wy, 14);
      // sorted billboard pass
      const draws = [];
      for (const e of this.enemies) draws.push({ d: R.depth(e.wx, e.wy), k: "z", o: e });
      for (const t of this.turrets) draws.push({ d: R.depth(t.wx, t.wy), k: "t", o: t });
      for (const p of this.pickups) draws.push({ d: R.depth(p.wx, p.wy), k: "p", o: p });
      draws.push({ d: R.depth(pl.wx, pl.wy) + 0.5, k: "pl", o: pl });
      draws.sort((a, b) => a.d - b.d);
      for (const it of draws) {
        if (it.k === "z") R.drawZombie(ctx, th, it.o, now);
        else if (it.k === "t") R.drawTurret(ctx, th, it.o, now);
        else if (it.k === "p") R.drawPickup(ctx, th, it.o, now, it.o.kind === "weapon" ? WMAP[it.o.wid] : (it.o.kind === "powerup" ? PMAP[it.o.pid] : null));
        else R.drawPlayer(ctx, th, pl, now);
      }
      // above-ground fx
      R.drawOrbit(ctx, th, pl, this.orbit, now);
      if (this.beam) R.drawBeam(ctx, th, this.beam);
      for (const b of this.bullets) R.drawProjectile(ctx, th, b, now);
      for (const b of this.eproj) R.drawEnemyProj(ctx, th, b);
      for (const z of this.zaps) R.drawZap(ctx, th, z);
      for (const r of this.rails) R.drawRail(ctx, th, r);
      for (const sw of this.sweeps) R.drawSweep(ctx, th, sw);
      for (const sh of this.shocks) R.drawShockwave(ctx, th, sh);
      if (this._reticle) R.drawReticle(ctx, th, this._reticle, now);
      this.particles.render(ctx);
      R.drawDamageNumbers(ctx, th, this.dmgNums);
      // HUD
      R.drawVignette(ctx, th);
      R.drawHUD(ctx, th, { score: this.score, wave: this.wave, level: this.level, combo: this.combo, xpF: this.xp / this.xpNeed });
      R.drawWeaponTag(ctx, th, WMAP[this.weapon], this.weapons.length + (this.dev ? " DEV" : ""));
      R.drawAimToggle(ctx, th, this.aimMode);
      if (this.boss) R.drawBossBar(ctx, th, this.boss);
      R.drawToasts(ctx, th, this.toasts, now);
      if (this.shell.isTouch) R.drawTouchControls(ctx, th, this.stick, this.aimStick, this.aimMode, this._dashPos());
      if (this.introT > 0 && this.state === "playing") R.drawIntro(ctx, th, Math.min(1, this.introT / 1000), this.shell.isTouch);
      if (this.state === "levelup" && this._cards) R.drawLevelUp(ctx, th, this._cards, this._cardSel);
      R.drawScanlines(ctx, th);
    }

    _drawTelegraphs(ctx, R, th, now) {
      for (const e of this.enemies) {
        if (e.def.role === "charger" && e.st === "windup") R.drawTelegraph(ctx, th, { kind: "line", wx: e.wx, wy: e.wy, x2: e.wx + Math.cos(e.tgA) * 360, y2: e.wy + Math.sin(e.tgA) * 360, color: th.palette.danger }, now);
        if (e.def.role === "special" && e.cast > 0.2) R.drawTelegraph(ctx, th, { kind: "circle", wx: e.wx, wy: e.wy, r: 40, color: "#7affc0" }, now);
        if (e.def.role === "boss" && e.atkMode === "bite" && e.atkT > 0.5) R.drawTelegraph(ctx, th, { kind: "cone", wx: e.wx, wy: e.wy, ang: e.tgA, half: 0.5, len: 280, color: th.palette.danger }, now);
      }
    }
  }

  Z.Game = Game;
})(window.Arcade = window.Arcade || {});
