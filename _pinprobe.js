// Diagnose Space Pinball: launch many balls, no flipping, and record where/when they drain.
// Confirms the "ball always drains down the right with no chance" complaint, and measures fixes.
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pinball";
const RUNS = parseInt(process.argv[2] || "40", 10);
const POWER = process.argv[3] != null ? parseFloat(process.argv[3]) : null; // 0..1 plunge, null=random

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 880, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 500));

  const result = await page.evaluate(async (RUNS, POWER) => {
    const g = window.__arcade && window.__arcade._game;
    if (!g) return { error: "no game" };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = { drains: [], survived: 0, byLane: { L_out: 0, R_out: 0, center: 0, R_lane: 0, other: 0 } };
    const DRAIN_Y = 656;
    for (let run = 0; run < RUNS; run++) {
      g._reset();
      // ensure a single launch ball
      g.charging = true; g.plunge = (POWER != null ? POWER : Math.random());
      g._launch();
      let drained = null, t = 0;
      const start = performance.now();
      // watch for up to 8s of real time
      while (t < 8000) {
        await sleep(50); t = performance.now() - start;
        const b = g.balls[0];
        if (!g.balls.length || g.lives < 3) {
          // a life was lost (drain happened); record approx last known x via lastDrainX hook
          drained = { x: g._lastDrainX != null ? g._lastDrainX : (b ? b.x : -1), t: Math.round(t) };
          break;
        }
      }
      if (!drained) { out.survived++; continue; }
      out.drains.push(drained);
      const x = drained.x;
      if (x < 0) out.byLane.other++;
      else if (x < 105) out.byLane.L_out++;
      else if (x > 360) out.byLane.R_lane++;   // drained back down the launch lane (far right)
      else if (x > 280) out.byLane.R_out++;
      else out.byLane.center++;
    }
    const ts = out.drains.map(d => d.t).sort((a, b) => a - b);
    out.medianMs = ts.length ? ts[ts.length >> 1] : null;
    out.fastDrains = out.drains.filter(d => d.t < 2500).length;
    return out;
  }, RUNS, POWER);

  console.log("errors:", errs.length ? errs.slice(0, 5) : "none");
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
