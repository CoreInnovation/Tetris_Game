// Two SEPARATE browser instances (each its own foreground, no rAF throttling) → verifies BOTH
// directions of the live Cloudflare relay: guest->host input AND host->guest state.
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WS = "wss://chriskit-arcade.coreinnovation.workers.dev";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pong";
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const launch = () => puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const br1 = await launch(), br2 = await launch();
  const mk = async (br) => { const p = await br.newPage(); await p.setViewport({ width: 480, height: 820 }); await p.evaluateOnNewDocument((u) => { window.ARCADE_NET_URL = u; }, WS); await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p; };
  const A = await mk(br1), B = await mk(br2);
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(1200);
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c); }, code);
  await sleep(2000);
  // guest moves its paddle → host should receive it
  await B.evaluate(() => { const g = window.__arcade._game; g.cpuP.x = g.court.x + g.court.w * 0.3; });
  await sleep(900);
  const r = await Promise.all([
    A.evaluate(() => { const g = window.__arcade._game; return { role: g.lobby.role, guestX: g._guestX == null ? null : Math.round(g._guestX), expect: Math.round(g.court.x + g.court.w * 0.3), bx: Math.round(g.ball.x) }; }),
    B.evaluate(() => { const g = window.__arcade._game; return { role: g.lobby.role, bx: Math.round(g.ball.x) }; })
  ]);
  console.log(JSON.stringify({
    hostRole: r[0].role, guestRole: r[1].role,
    guestToHostInput: r[0], inputOk: r[0].guestX != null && Math.abs(r[0].guestX - r[0].expect) <= 6,
    hostToGuestBall: { hostBx: r[0].bx, guestBx: r[1].bx }, ballSync: Math.abs(r[0].bx - r[1].bx) <= 90
  }, null, 2));
  await br1.close(); await br2.close();
})();
