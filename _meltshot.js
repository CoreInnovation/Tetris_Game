const puppeteer = require("puppeteer-core");
const path = require("path"), fs = require("fs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=missile";
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await browser.newPage();
  await p.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 });
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => {
    const g = window.__arcade._game; g.dev = true; g._reset();
    const y = g.groundY - 200, cols = ["#ffd24a", "#7afcff", "#ff5a8a", "#9aff6a", "#b388ff"];
    // place several melting pods at staggered progress so we see the slump→puddle arc
    for (let i = 0; i < 5; i++) g.meltPods.push({ x: 160 + i * 150, y: y, r: 16, col: cols[i], t: i * 240, life: 1100 });
  });
  await new Promise(r => setTimeout(r, 120));
  await p.screenshot({ path: path.join(OUT, "missile-melt.png") });
  console.log("errors:", errs.length ? errs : "none");
  await browser.close();
})();
