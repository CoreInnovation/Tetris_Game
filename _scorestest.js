// E2E test of shared leaderboards: a local mock HTTP server (same /score + /top contract as the
// Worker's D1 endpoints) + a headless browser exercising Arcade.Scores and the game-over board UI.
const puppeteer = require("puppeteer-core");
const path = require("path");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8793;
const url = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/") + "?game=pong";

const store = []; let nid = 1;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "content-type", "content-type": "application/json" };
  if (req.method === "OPTIONS") { res.writeHead(204, H); res.end(); return; }
  if (u.pathname === "/top") {
    const game = (u.searchParams.get("game") || "").toLowerCase(), device = u.searchParams.get("device") === "mobile" ? "mobile" : "desktop", n = +(u.searchParams.get("n") || 10);
    const rows = store.filter(s => s.game === game && s.device === device).sort((a, b) => b.score - a.score).slice(0, n).map(s => ({ name: s.name, score: s.score }));
    res.writeHead(200, H); res.end(JSON.stringify({ scores: rows, device })); return;
  }
  if (u.pathname === "/score" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c); req.on("end", () => {
      let b = {}; try { b = JSON.parse(body); } catch (e) {}
      const game = String(b.game || "").toLowerCase().slice(0, 16), name = String(b.name || "Player").slice(0, 16), score = Math.max(0, Math.floor(+b.score || 0)), device = b.device === "mobile" ? "mobile" : "desktop";
      store.push({ game, name, score, device, id: nid++ });
      const rank = store.filter(s => s.game === game && s.device === device && s.score > score).length + 1;
      res.writeHead(200, H); res.end(JSON.stringify({ ok: true, rank }));
    }); return;
  }
  res.writeHead(404, H); res.end("{}");
});
server.listen(PORT);

const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 60000 });
  const p = await browser.newPage();
  await p.setViewport({ width: 440, height: 900, deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument((u) => { window.ARCADE_NET_URL = u; }, "ws://localhost:" + PORT);
  const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(url, { waitUntil: "networkidle0" }); await sleep(300);

  // 1) client submit/top contract
  const apiTop = await p.evaluate(async () => {
    await Arcade.Scores.submit("pong", "ALICE", 1234, "desktop");
    await Arcade.Scores.submit("pong", "BOB", 5000, "desktop");
    await Arcade.Scores.submit("pong", "CARL", 300, "desktop");
    return await Arcade.Scores.top("pong", 10, "desktop");
  });

  // 2) game-over board UI: set a name, trigger game over, read the rendered list
  const boardHtml = await p.evaluate(async () => {
    const sh = window.__arcade;
    sh.storage.set("arcade:player", "DEE");
    sh._over = false; sh._onGameOver({ score: 9999 });
    await new Promise(r => setTimeout(r, 500));
    return { visible: !sh.refs.goBoard.classList.contains("hidden"), html: sh.refs.goBoardList.textContent, name: sh.refs.goName.value };
  });

  console.log("errors:", errs.length ? errs.slice(0, 5) : "none");
  console.log("apiTop:", JSON.stringify(apiTop));
  console.log("apiSorted:", apiTop.length === 3 && apiTop[0].name === "BOB" && apiTop[1].name === "ALICE" && apiTop[2].name === "CARL");
  console.log("board:", JSON.stringify(boardHtml));
  console.log("boardHasDEE:", /DEE/.test(boardHtml.html) && /9,?999/.test(boardHtml.html), "boardVisible:", boardHtml.visible);
  await browser.close(); server.close();
})();
