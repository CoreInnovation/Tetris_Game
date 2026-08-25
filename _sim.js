/* =====================================================================
   MISSILE DEFENSE — balance simulation lab.
   Headless, fast. Drives the real game with auto-players of varying skill,
   logs kills-by-source, powerup spawn diversity, and survival, and prints
   an aggregate report so we can tune scientifically.
   Usage: node _sim.js [runsPerMode]
   ===================================================================== */
const fs = require("fs"), vm = require("vm"), path = require("path");
function mc() { const grad = { addColorStop() {} }; const base = { canvas: { width: 800, height: 600 }, createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => ({}), measureText: () => ({ width: 12 }), setLineDash() {}, save() {}, restore() {} }; return new Proxy(base, { get(t, k) { return k in t ? t[k] : () => {}; }, set() { return true; } }); }
function ac() { return new Proxy({}, { get() { return () => ({}); } }); }
const elStub = () => ({ style: {}, getContext: () => mc(), addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), appendChild() {}, setAttribute() {} });
const sandbox = { window: {}, document: { createElement: () => elStub(), getElementById: () => elStub(), addEventListener() {}, body: elStub() }, AudioContext: ac, webkitAudioContext: ac, performance: { now: () => 0 }, requestAnimationFrame: () => 0, console };
sandbox.global = sandbox; sandbox.self = sandbox.window; vm.createContext(sandbox);
for (const f of ["js/core/audio.js", "js/games/missile/mdthemes.js", "js/games/missile/mdrenderer.js", "js/games/missile/missiledefense.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), sandbox, { filename: f });
const Arcade = sandbox.window.Arcade;

function newGame() {
  const store = {};
  const shell = { ctx: mc(), canvas: elStub(), input: { onDown() { return () => {}; }, onUp() { return () => {}; }, isDown() { return false; } }, audio: new Proxy({}, { get() { return () => {}; } }), particles: { emit() {}, update() {}, render() {}, clear() {} }, storage: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } }, requestGameOver() {} };
  const g = new Arcade.Missile.Game(shell);
  // disable particle theme work for speed + determinism (no visual)
  g.theme = { ...g.theme, effects: { ...g.theme.effects, particles: false, shake: false } };
  g.start(); g.resize(800, 600);
  return g;
}

// AI profiles: how a player of a given skill behaves
const AIS = {
  passive: { fireMs: 1e9, aimErr: 0, useStreak: false, grab: false },
  casual:  { fireMs: 360, aimErr: 26, useStreak: false, grab: false },
  good:    { fireMs: 175, aimErr: 12, useStreak: true,  grab: true },
  pro:     { fireMs: 100, aimErr: 5,  useStreak: true,  grab: true },
};

function lowestThreat(g) {   // the enemy closest to the ground (most urgent)
  let best = null, by = -1;
  for (const m of g.enemies) if (m.y > by) { by = m.y; best = m; }
  for (const u of g.ufos) if (u.y > by) { by = u.y; best = u; }
  return best;
}

function runGame(ai) {
  const g = newGame();
  let fireT = 0, streakT = 0, frame = 0;
  const CAP = 60000;   // 16 min of game time, hard safety
  while (g.state === "playing" && frame < CAP) {
    const dt = 16, now = frame * dt;
    // ---- AI actions ----
    if (ai.grab && g.powerups.length) { const pu = g.powerups[0]; pu.x = 400; pu.y = 300; g.powerups.shift(); g._collectPowerup(pu, false); }
    if (ai.useStreak && g.streaks.length && (streakT -= dt) <= 0) { g._useStreak(0); streakT = 1500; }
    if ((fireT -= dt) <= 0) {
      const tgt = lowestThreat(g);
      if (tgt) { const ex = (Math.random() * 2 - 1) * ai.aimErr, ey = (Math.random() * 2 - 1) * ai.aimErr; g._fire(tgt.x + ex, tgt.y + ey); }
      fireT = ai.fireMs * (0.85 + Math.random() * 0.3);
    }
    g.update(dt, now);
    frame++;
  }
  return { wave: g.wave, frames: frame, score: g.score, kills: g.statKills, pow: g.statPow,
    citiesLost: 6 - g.cities.filter(c => c.alive).length };
}

function agg(mode, runs) {
  const res = []; for (let i = 0; i < runs; i++) res.push(runGame(AIS[mode]));
  res.sort((a, b) => a.wave - b.wave);
  const waves = res.map(r => r.wave);
  const med = waves[Math.floor(waves.length / 2)];
  const mean = (waves.reduce((a, b) => a + b, 0) / waves.length);
  const kt = {}; let ktot = 0; for (const r of res) for (const k in r.kills) { kt[k] = (kt[k] || 0) + r.kills[k]; ktot += r.kills[k]; }
  const auto = (kt.militia || 0) + (kt.army || 0) + (kt.civ || 0);   // pure auto-defense (exclude fire, which is mixed)
  const autoPct = ktot ? Math.round(100 * auto / ktot) : 0;
  const pt = {}; for (const r of res) for (const k in r.pow) pt[k] = (pt[k] || 0) + r.pow[k];
  return { mode, runs, medWave: med, meanWave: +mean.toFixed(1), minWave: waves[0], maxWave: waves[waves.length - 1],
    autoPct, killShare: shareStr(kt, ktot), pow: pt };
}
function shareStr(kt, tot) { return Object.entries(kt).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + Math.round(100 * v / (tot || 1)) + "%").join("  "); }
function powStr(pt) {
  const tot = Object.values(pt).reduce((a, b) => a + b, 0) || 1;
  const cat = { weapon: 0, town: 0, mult: 0 };
  for (const k in pt) { if (k.startsWith("weapon:")) cat.weapon += pt[k]; else if (k.startsWith("town:")) cat.town += pt[k]; else cat.mult += pt[k]; }
  const wIds = Object.entries(pt).filter(e => e[0].startsWith("weapon:")).sort((a, b) => b[1] - a[1]).map(e => e[0].slice(7) + ":" + e[1]);
  return "categories  weapon " + Math.round(100 * cat.weapon / tot) + "%  town " + Math.round(100 * cat.town / tot) + "%  mult " + Math.round(100 * cat.mult / tot) + "%\n    weapons seen: " + (wIds.join(", ") || "none");
}

// ---- per-weapon effectiveness: lock a "good" player to ONE weapon, measure survival ----
function runWeapon(id) {
  const g = newGame();
  g.unlocked = { interceptor: true }; g.unlocked[id] = true; g.collected = ["interceptor", id]; g.weapon = id;
  const ai = AIS.good; let fireT = 0, streakT = 0, frame = 0; const CAP = 60000;
  while (g.state === "playing" && frame < CAP) {
    const dt = 16, now = frame * dt;
    g.weapon = id;   // stay locked to the weapon under test (ignore weapon pods so we measure THIS weapon)
    if (g.streaks.length && (streakT -= dt) <= 0) { g._useStreak(0); streakT = 1500; }
    if ((fireT -= dt) <= 0) { const t = lowestThreat(g); if (t) { const e = (Math.random() * 2 - 1) * ai.aimErr; g._fire(t.x + e, t.y + (Math.random() * 2 - 1) * ai.aimErr); } fireT = ai.fireMs * (0.85 + Math.random() * 0.3); }
    g.update(dt, now); frame++;
  }
  return g.wave;
}
function weaponTest(runs) {
  const ids = Arcade.Missile.WEAPONS.map(w => w.id);
  console.log("=== PER-WEAPON SURVIVAL  (" + runs + " runs each, 'good' player locked to that weapon) ===\n");
  const rows = [];
  for (const id of ids) { const ws = []; for (let i = 0; i < runs; i++) ws.push(runWeapon(id)); ws.sort((a, b) => a - b); rows.push({ id, med: ws[Math.floor(ws.length / 2)], mean: +(ws.reduce((a, b) => a + b, 0) / ws.length).toFixed(1), min: ws[0], max: ws[ws.length - 1] }); }
  rows.sort((a, b) => b.med - a.med);
  for (const r of rows) console.log("  " + r.id.padEnd(12) + " med " + String(r.med).padStart(3) + "  mean " + String(r.mean).padStart(5) + "  range " + r.min + "-" + r.max);
}

if (process.argv[2] === "weapons") { weaponTest(parseInt(process.argv[3] || "20", 10)); return; }

const RUNS = parseInt(process.argv[2] || "40", 10);
console.log("=== MISSILE DEFENSE BALANCE SIM  (" + RUNS + " runs/mode) ===\n");
let powAll = {};
for (const mode of ["passive", "casual", "good", "pro"]) {
  const a = agg(mode, RUNS);
  console.log(mode.toUpperCase().padEnd(8) + " waves  med " + String(a.medWave).padStart(2) + "  mean " + String(a.meanWave).padStart(4) + "  range " + a.minWave + "-" + a.maxWave + "   auto-defense " + a.autoPct + "% of kills");
  console.log("         kill share: " + a.killShare);
  for (const k in a.pow) powAll[k] = (powAll[k] || 0) + a.pow[k];
}
console.log("\nPOWERUP SPAWNS (all modes):\n    " + powStr(powAll));
