const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pong";
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await browser.newPage();
  await p.setViewport({ width: 440, height: 900, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 350));
  await p.evaluate(async () => {
    // stub the network so we can render the board offline
    Arcade.Scores.configured = () => true;
    Arcade.Scores.submit = () => Promise.resolve({ ok: true, rank: 2 });
    Arcade.Scores.top = () => Promise.resolve([
      { name: "QUACKMASTER", score: 48230 }, { name: "DEE", score: 12999 }, { name: "Chris", score: 9800 },
      { name: "ZARA", score: 7200 }, { name: "BOLT", score: 5100 }, { name: "neo", score: 2400 }
    ]);
    const sh = window.__arcade;
    sh.storage.set("arcade:player", "DEE");
    sh._over = false; sh._onGameOver({ score: 12999 });
    await new Promise(r => setTimeout(r, 400));
  });
  await new Promise(r => setTimeout(r, 200));
  await p.screenshot({ path: path.join(OUT, "leaderboard.png") });
  await browser.close();
})();
