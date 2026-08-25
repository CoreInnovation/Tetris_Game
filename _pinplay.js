// Measure Space Pinball RECOVERABILITY: launch + a simple auto-flipper AI, track how long the ball survives.
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pinball";
const RUNS = parseInt(process.argv[2] || "20", 10);
const CAP = parseInt(process.argv[3] || "15000", 10);

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 880, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 400));

  const lifetimes = [];
  for (let run = 0; run < RUNS; run++) {
    const ms = await page.evaluate(async (CAP) => {
      const g = window.__arcade && window.__arcade._game;
      if (!g) return -1;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      g._reset();
      g.charging = true; g.plunge = Math.random();
      g._launch();
      const startLives = g.lives;
      let t = 0; const start = performance.now();
      while (t < CAP) {
        let L = false, R = false;
        for (const b of g.balls) {
          if (b.mode !== "play") continue;
          if (b.y > 540 && b.y < 622 && b.vy > -20) { if (b.x < 190) L = true; else R = true; }
        }
        g.flippers[0].pressed = L; g.flippers[1].pressed = R;
        await sleep(16); t = performance.now() - start;
        if (g.lives < startLives || g.state === "over") break;
      }
      g.flippers[0].pressed = false; g.flippers[1].pressed = false;
      return Math.round(Math.min(t, CAP));
    }, CAP);
    lifetimes.push(ms);
  }

  lifetimes.sort((a, b) => a - b);
  const sum = lifetimes.reduce((a, b) => a + b, 0);
  console.log("errors:", errs.length ? errs.slice(0, 5) : "none");
  console.log(JSON.stringify({
    runs: RUNS, capMs: CAP,
    medianMs: lifetimes[lifetimes.length >> 1],
    meanMs: Math.round(sum / lifetimes.length),
    minMs: lifetimes[0], maxMs: lifetimes[lifetimes.length - 1],
    under3s: lifetimes.filter(x => x < 3000).length,
    survivedToCap: lifetimes.filter(x => x >= CAP).length
  }, null, 2));
  await browser.close();
})();
