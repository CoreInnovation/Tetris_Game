// Visual proof: two SEPARATE browsers connected co-op over WebRTC P2P (no server).
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=missile";
const OUT = process.env.SHOT_DIR || path.resolve(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-features=WebRtcHideLocalIpsWithMdns"], protocolTimeout: 60000 });
(async () => {
  const bH = await launch(), bG = await launch();
  const mk = async (b) => { const p = await b.newPage(); await p.setViewport({ width: 760, height: 680 }); await p.evaluateOnNewDocument(() => { window.ARCADE_NET_TRANSPORT = "rtc"; }); await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p; };
  const A = await mk(bH), B = await mk(bG);
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(1500);
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c, false); }, code);
  for (let i = 0; i < 24; i++) { await sleep(500); const ph = await A.evaluate(() => window.__arcade._game.lobby.phase); if (ph === "play") break; }
  await A.evaluate(() => window.__arcade.togglePause(false));
  await B.evaluate(() => window.__arcade.togglePause(false));
  await sleep(2600);
  await A.evaluate(() => window.__arcade.togglePause(false));
  await B.evaluate(() => window.__arcade.togglePause(false));
  await A.screenshot({ path: path.join(OUT, "shot_rtc_host.png") });
  await B.screenshot({ path: path.join(OUT, "shot_rtc_guest.png") });
  console.log("code:", code, "-> shot_rtc_host.png, shot_rtc_guest.png");
  await bH.close(); await bG.close();
})().catch(e => { console.error(e); process.exit(1); });
