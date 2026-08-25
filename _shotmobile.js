// Local mobile screenshot of Missile Defense to verify dock + banner proportions.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=missile";

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  // emulate a phone in portrait with touch
  await page.emulate({
    viewport: { width: 412, height: 892, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
  });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 600));

  // dev-unlock so the dock is full + force a new-weapon banner so we can size-check it
  await page.evaluate(() => {
    const g = window.__arcade && window.__arcade._game;
    if (g) {
      g.dev = true; g._reset && g._reset();
      g.newWeapon = "railgun"; g.newWeaponT = 3000;
    }
  });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, "md-mobile-portrait.png") });

  // landscape phone
  await page.setViewport({ width: 892, height: 412, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => { const g = window.__arcade && window.__arcade._game; if (g) { g.newWeapon = "tesla"; g.newWeaponT = 3000; } });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, "md-mobile-landscape.png") });

  console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
  console.log("uiScale:", await page.evaluate(() => { const g = window.__arcade && window.__arcade._game; return g && g.uiScale; }));
  await browser.close();
})();
