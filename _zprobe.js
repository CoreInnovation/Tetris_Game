// Functional smoke + feel checks for the DEADGRID overhaul.
const puppeteer = require("puppeteer-core");
const path = require("path"), fs = require("fs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=zombies";

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 500));

  const checks = await page.evaluate(async () => {
    const g = window.__arcade && window.__arcade._game;
    const WMAP = window.Arcade.Zombies.WEAPONS;
    if (!g) return { error: "no game" };
    const out = {};
    g.dev = false; g._reset();
    // weapon leveling -> more damage + faster fire
    g.wlvl.popgun = 1; const d1 = g._wdmg(WMAP.popgun), f1 = g._wfireMult(WMAP.popgun);
    g.wlvl.popgun = 6; const d6 = g._wdmg(WMAP.popgun), f6 = g._wfireMult(WMAP.popgun);
    out.levelDmgUp = d6 > d1 * 1.5; out.levelFireFaster = f6 < f1; out.levelExtraProj = g._wextraAt("popgun", 6) >= 2;
    // armor: shield soaks damage first
    g.attr.armor = 3; g.player.shield = g._maxShield(); const sh0 = g.player.shield, hp0 = g.player.hp;
    g._hurt(40, 0, 0, false);
    out.shieldSoaks = g.player.shield < sh0 && g.player.hp === hp0;
    out.maxShield = g._maxShield();
    // berserk doubles damage
    g.boosts.berserk = 0; const nb = g._wdmg(WMAP.razor); g.boosts.berserk = 5; const yb = g._wdmg(WMAP.razor);
    out.berserkDoubles = Math.abs(yb - nb * 2) < 0.01;
    // elites appear at high wave
    g._reset(); g.wave = 14; let elites = 0; for (let i = 0; i < 200; i++) { const e = g._spawnEnemy("shuffler"); if (e && e.elite) elites++; }
    out.elitesSpawn = elites > 0; out.eliteCount = elites;
    // wave modifier can roll
    let mods = 0; for (let i = 0; i < 40; i++) { g.wave = 9; g.betweenWaves = false; g._nextWave(); if (g.waveMod) mods++; }
    out.waveModsRoll = mods > 0;
    // orbital strike queues impacts
    g._reset(); g.weapons.push("orbital"); g.wlvl.orbital = 1; g.weapon = "orbital";
    g._aimT = { wx: g.player.wx + 100, wy: g.player.wy }; g._orbital(WMAP.orbital);
    out.orbitalQueues = g.strikes.length >= 3;
    // one-thumb forces auto-aim
    g._setOneThumb(true); out.oneThumbAuto = g.oneThumb === true && g.aimMode === "auto";
    g._setOneThumb(false);
    return out;
  });

  // live play in dev for ~2.5s to catch runtime errors in update/render with all the new systems
  await page.evaluate(() => { const g = window.__arcade._game; g.dev = true; g._reset(); g.wave = 13; });
  await new Promise(r => setTimeout(r, 2500));
  const liveState = await page.evaluate(() => { const g = window.__arcade._game; return { state: g.state, enemies: g.enemies.length, strikes: g.strikes.length, hp: Math.round(g.player.hp) }; });
  await page.screenshot({ path: path.join(OUT, "deadgrid-overhaul.png") });

  console.log("errors:", errs.length ? errs.slice(0, 8) : "none");
  console.log("checks:", JSON.stringify(checks, null, 2));
  console.log("liveState:", JSON.stringify(liveState));
  await browser.close();
})();
