// Verify Pong RELATIVE touch drag (no jump-to-finger) + sensitivity slider.
const puppeteer = require("puppeteer-core");
const path = require("path"), fs = require("fs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "C:/Users/ChrisCertus/AppData/Local/Temp/tetris-shots";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pong";

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 412, height: 892, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile" });
  const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("console", m => { if (m.type()==="error") errs.push(m.text()); });
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 500));

  const test = await page.evaluate(async () => {
    const g = window.__arcade && window.__arcade._game;
    if (!g) return { error: "no game" };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rect = g.shell.canvas.getBoundingClientRect();
    const cssW = g._w, scale = rect.width / cssW;
    const toClient = (courtX) => rect.left + courtX / scale;   // inverse of courtX()
    g._reset();
    const startPad = g.player.x;
    // 1) ABSOLUTE-style: a touch START far from the paddle should NOT teleport the paddle (relative anchor)
    g._tstart({ touches: [{ clientX: toClient(g.court.x + 30) }], preventDefault(){} });
    await sleep(60);
    const afterStartFarTouch = g.player.x;   // should be ~startPad (no jump)
    const center = g.court.x + g.court.w / 2;
    // 2) RELATIVE drag at 1x: finger +60 court px → paddle ~+60 from anchor
    g._tend(); g.player.x = center; g.touchSens = 1.0;
    g._tstart({ touches: [{ clientX: toClient(200) }], preventDefault(){} });
    const padX0 = g.player.x;
    g._tmove({ touches: [{ clientX: toClient(260) }], preventDefault(){} });
    await sleep(120);
    const movedBy = g.player.x - padX0;
    // 3) sensitivity 2x: same +60 finger delta → ~+120 paddle delta
    g._tend(); g.player.x = center; g.touchSens = 2.0;
    g._tstart({ touches: [{ clientX: toClient(200) }], preventDefault(){} });
    const p2 = g.player.x;
    g._tmove({ touches: [{ clientX: toClient(260) }], preventDefault(){} });
    await sleep(120);
    const movedBy2x = g.player.x - p2;
    return {
      startPad: Math.round(startPad), afterStartFarTouch: Math.round(afterStartFarTouch),
      noJump: Math.abs(afterStartFarTouch - startPad) < 5,
      movedBy: Math.round(movedBy), movedBy2x: Math.round(movedBy2x),
      hasSlider: !!(g.menus().control && g.menus().control.sliders && g.menus().control.sliders.length)
    };
  });

  // open the control chooser and screenshot the slider
  await page.evaluate(() => { window.__arcade._openChooser && window.__arcade._openChooser("control"); });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT, "pong-sens-slider.png") });

  console.log("errors:", errs.length ? errs.slice(0, 6) : "none");
  console.log(JSON.stringify(test, null, 2));
  await browser.close();
})();
