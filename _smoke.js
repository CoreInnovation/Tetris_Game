// Regression smoke: load every game offline, run briefly, assert it mounts with no console errors.
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/");
const GAMES = ["tetris", "drmario", "asteroids", "missile", "pinball", "pong", "zombies"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const results = {};
  for (const id of GAMES) {
    const p = await browser.newPage();
    await p.setViewport({ width: 900, height: 680, deviceScaleFactor: 1 });
    const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(root + "?game=" + id, { waitUntil: "networkidle0" });
    await sleep(900);
    const st = await p.evaluate(() => { const g = window.__arcade && window.__arcade._game; return { mounted: !!g, state: g && g.state, hasLobby: !!(g && g.lobby) }; });
    results[id] = { ...st, errs: errs.slice(0, 4) };
    await p.close();
  }
  // also the menu (badges) builds with no errors
  const mp = await browser.newPage(); const merr = []; mp.on("pageerror", e => merr.push(String(e))); mp.on("console", m => { if (m.type() === "error") merr.push(m.text()); });
  await mp.goto(root, { waitUntil: "networkidle0" }); await sleep(400);
  const badges = await mp.evaluate(() => document.querySelectorAll(".gc-online").length);
  results.MENU = { badges, errs: merr.slice(0, 4) };
  console.log(JSON.stringify(results, null, 2));
  const anyErr = Object.values(results).some(r => r.errs && r.errs.length);
  console.log("ALL_CLEAN:", !anyErr);
  await browser.close();
})();
