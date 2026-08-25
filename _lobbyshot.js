const puppeteer = require("puppeteer-core");
const path = require("path"), fs = require("fs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
const root = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/");
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await browser.newPage();
  await p.setViewport({ width: 440, height: 900, deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument(() => { window.ARCADE_NET_URL = "wss://example.workers.dev"; });
  // menu (shows the ONLINE badge on the Pong card)
  await p.goto(root, { waitUntil: "networkidle0" }); await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: path.join(OUT, "menu-badge.png") });
  // pong lobby
  await p.goto(root + "?game=pong", { waitUntil: "networkidle0" }); await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => window.__arcade._game.lobby.open());
  await new Promise(r => setTimeout(r, 250));
  await p.screenshot({ path: path.join(OUT, "lobby-menu.png") });
  // keypad
  await p.evaluate(() => { const g = window.__arcade._game.lobby; g.entering = true; g._entry = "FB"; });
  await new Promise(r => setTimeout(r, 250));
  await p.screenshot({ path: path.join(OUT, "lobby-keypad.png") });
  await browser.close();
})();
