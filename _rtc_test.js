// E2E: WebRTC peer-to-peer co-op (NO server / NO Cloudflare) via the PeerJS broker + free STUN.
// Two SEPARATE headless browsers (data channels get throttled across tabs in one browser),
// page loaded from file:// so transport defaults to "rtc". Proves free internet-style P2P play.
//   PEER_LOCAL=1 -> use a local PeerServer at 127.0.0.1:9000 instead of the public broker.
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=missile";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOCAL = process.env.PEER_LOCAL === "1";

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-sandbox", "--disable-features=WebRtcHideLocalIpsWithMdns"],   // expose host ICE candidates so two local Chrome instances can pair
    protocolTimeout: 60000
  });
}

(async () => {
  const bH = await launch(), bG = await launch();
  const mk = async (browser) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 760, height: 680, deviceScaleFactor: 1 });
    await p.evaluateOnNewDocument((local) => {
      window.ARCADE_NET_TRANSPORT = "rtc";
      if (local) window.ARCADE_PEERJS_CONFIG = { host: "localhost", port: 9000, path: "/" };
    }, LOCAL);
    const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    p._errs = errs; await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300); return p;
  };
  const A = await mk(bH), B = await mk(bG);

  // sanity: both must have chosen the rtc transport
  const transport = await A.evaluate(() => window.Arcade.Net.transport());

  // A creates (host), B joins (guest)
  const code = await A.evaluate(() => { const g = window.__arcade._game; g.lobby.open(); g.lobby._create(); return g.lobby.code; });
  await sleep(1500);   // host registers its PeerJS id
  await B.evaluate((c) => { const g = window.__arcade._game; g.lobby.open(); g.lobby._connect(c, false); }, code);

  // wait (up to ~12s) for the data channel + match start
  let roles = null;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    roles = await Promise.all([
      A.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, peer: g.peerName, open: !!(g.net && g.net.open) }; }),
      B.evaluate(() => { const g = window.__arcade._game.lobby; return { role: g.role, phase: g.phase, peer: g.peerName, open: !!(g.net && g.net.open) }; })
    ]);
    if (roles[0].phase === "play" && roles[1].phase === "play") break;
  }
  await A.bringToFront();
  await A.evaluate(() => { window.__arcade.togglePause(false); });
  await sleep(2600);

  const guestSees = await B.evaluate(() => { const s = window.__arcade._game.coopSnap; return { hasSnap: !!s, enemies: s ? (s.e || []).length : -1, wave: s ? s.w : -1 }; });

  // instrument the host to record exactly what co-op messages it receives
  await A.evaluate(() => {
    const g = window.__arcade._game; window.__rx = [];
    const orig = g._onCoopMsg.bind(g);
    g._onCoopMsg = (m, role) => { try { window.__rx.push({ t: m && m.t, x: m && m.x, role }); } catch (e) {} return orig(m, role); };
  });
  // guest fires (raw host px) -> host drives 2nd cannon. Send a few times over ~1s (P2P warm-up / pacing).
  const hostW = await A.evaluate(() => window.__arcade._game._w);
  const fx = Math.round(hostW * 0.3), fy = 170;
  const beforeFire = await A.evaluate(() => window.__arcade._game.interceptors.length);
  for (let i = 0; i < 5; i++) { await B.evaluate((x, y) => { window.__arcade._game.lobby.send({ t: "fire", x, y }); }, fx, fy); await sleep(220); }
  const hostGotFire = await A.evaluate(() => { const g = window.__arcade._game; return { interceptors: g.interceptors.length, gotFire: (window.__rx || []).some(e => e.t === "fire"), fireX: ((window.__rx || []).find(e => e.t === "fire") || {}).x }; });
  hostGotFire.before = beforeFire;

  // guest leaves -> host hears it
  await B.evaluate(() => window.__arcade._game.lobby.leave());
  await sleep(800);
  const hostAfterLeave = await A.evaluate(() => { const g = window.__arcade._game.lobby; return { phase: g.phase, verdict: g._verdictText() }; });

  const out = {
    broker: LOCAL ? "local PeerServer :9000" : "public PeerJS cloud",
    transport, transportOk: transport === "rtc",
    roles, rolesOk: roles && roles[0].role === "host" && roles[1].role === "guest" && roles[0].phase === "play" && roles[1].phase === "play",
    peersOk: roles && !!roles[0].peer && !!roles[1].peer,
    guestSees, guestSnapOk: guestSees.hasSnap && guestSees.enemies >= 0 && guestSees.wave >= 1,
    hostGotFire, fireOk: hostGotFire.gotFire && hostGotFire.fireX === fx && hostGotFire.interceptors > beforeFire,
    hostAfterLeave, leaveOk: hostAfterLeave.phase === "ended" && hostAfterLeave.verdict === "OPPONENT LEFT",
    errsA: A._errs.slice(0, 6), errsB: B._errs.slice(0, 6)
  };
  out.PASS = out.transportOk && out.rolesOk && out.peersOk && out.guestSnapOk && out.fireOk && out.leaveOk;
  console.log(JSON.stringify(out, null, 2));
  await bH.close(); await bG.close();
  process.exit(out.PASS ? 0 : 1);
})().catch(e => { console.error("TEST ERROR:", e); process.exit(1); });
