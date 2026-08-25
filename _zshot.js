const puppeteer = require("puppeteer-core");
const path = require("path"), fs = require("fs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=zombies";
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 900, deviceScaleFactor: 2 });
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    const g = window.__arcade._game, WMAP = window.Arcade.Zombies.WEAPONS;
    g.dev = true; g._reset(); g.introT = 0;
    g.attr.armor = 4; g.player.shield = g._maxShield();
    g.waveMod = { id: "elites", name: "ELITE HUNT — champions", color: "#ffd23f", spd: 1.05, hp: 1.1, elite: 3.2 };
    g.wave = 14;
    // hand-place a few enemies incl. elites around the player so they're on-screen
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, r = 160; const e = g._spawnEnemy("bull", { wx: g.player.wx + Math.cos(a) * r, wy: g.player.wy + Math.sin(a) * r }); if (e && i % 2 === 0) { e.elite = true; e.hp = e.maxHp = e.maxHp * 2.6; e.radius = Math.round(e.def.radius * 1.28); } }
    g.weapon = "orbital"; g.wlvl.orbital = 4; g._aimT = g.enemies[0]; g._orbital(WMAP.orbital);
  });
  await new Promise(r => setTimeout(r, 250));   // catch the orbital markers mid-fall
  await page.screenshot({ path: path.join(OUT, "deadgrid-combat.png") });
  console.log("errors:", errs.length ? errs : "none");
  await browser.close();
})();
