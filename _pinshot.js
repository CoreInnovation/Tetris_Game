const puppeteer = require("puppeteer-core");
const path = require("path"), fs = require("fs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pinball";
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => { const g = window.__arcade._game; g._reset(); g.charging = true; g.plunge = 0.7; g._launch(); });
  await new Promise(r => setTimeout(r, 900));   // ball in play, ball-save arc lit
  await page.screenshot({ path: path.join(OUT, "pinball-ballsave.png") });
  console.log("ballSaveT:", await page.evaluate(() => window.__arcade._game.ballSaveT));
  await browser.close();
})();
