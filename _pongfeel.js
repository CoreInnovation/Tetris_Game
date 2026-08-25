// Verify Pong feel: (1) thumb→paddle ratio honors sensitivity, (2) a flick glides after release then settles.
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pong";
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 420, height: 880, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mobile" });
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 400));

  const out = await page.evaluate(async () => {
    const g = window.__arcade._game, cv = g.shell.canvas;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rect = cv.getBoundingClientRect();
    const cl = (cx) => ({ clientX: rect.left + cx * rect.width / g._w, clientY: rect.top + rect.height * 0.9, preventDefault(){} });
    const ev = (cx) => ({ touches: [cl(cx)], preventDefault(){} });
    const c = g.court, minX = c.x + g.pw / 2, maxX = c.x + c.w - g.pw / 2;

    // (1) SENSITIVITY ratio: finger +50 court px at 1.7× → paddle ≈ +85 (clamped)
    g.touchSens = 1.7; g._reset(); g.player.x = c.x + c.w / 2; g._vx = 0;
    const base = g.player.x;
    g._tstart(ev(150)); await sleep(40); g._tmove(ev(200)); await sleep(140);
    const sensDelta = g.player.x - base; g._tend(); await sleep(60);

    // (2) FLICK momentum: start near left, fast drag right, release, watch it keep gliding then settle
    g._reset(); g.player.x = minX + 40; g._vx = 0; await sleep(30);
    g._tstart(ev(150));
    for (let i = 1; i <= 4; i++) { g._tmove(ev(150 + i * 12)); await sleep(16); }
    const xRelease = g.player.x, vRelease = g._vx;
    g._tend();
    await sleep(60); const xGlide = g.player.x;
    await sleep(500); const xSettled = g.player.x;

    return {
      sensDelta: Math.round(sensDelta), sensExpect: 85, sensOk: sensDelta > 70 && sensDelta < 95,
      xRelease: Math.round(xRelease), vRelease: +vRelease.toFixed(3),
      glidedAfterRelease: Math.round(xGlide - xRelease), totalGlide: Math.round(xSettled - xRelease),
      flickOk: (xGlide - xRelease) > 4, settledStopped: Math.abs(g._vx) < 0.012, hitWall: Math.abs(xSettled - maxX) < 2
    };
  });
  console.log("errors:", errs.length ? errs.slice(0, 4) : "none");
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
