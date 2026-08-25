# ChrisKit Arcade — multiplayer transports

Online play picks a transport automatically. You almost never need this folder:

1. **`auto` — the DEFAULT.** Tries **WebRTC peer-to-peer first** (free Google STUN + the free
   public PeerJS broker for signaling only — no per-use cost, low latency); if two players
   can't form a direct channel within ~7s (strict NAT), it **silently falls back to the
   Cloudflare relay** so they still connect. The host listens on both at once while waiting;
   whichever the guest arrives on wins, the other closes. Code: [`../js/core/net.js`](../js/core/net.js)
   (`_connectAuto`). PeerJS is vendored at [`../js/vendor/peerjs.min.js`](../js/vendor/peerjs.min.js)
   and lazy-loaded on first use.
2. **Local relay — for same-machine / LAN testing:** `node server/local-relay.js`. Serves the
   arcade *and* relays players. Open `http://localhost:8787` in two windows (auto-used on localhost).
3. **Cloudflare Worker — the relay fallback (`wss://chriskit-arcade…`).** A WebSocket relay
   using per-room Durable Objects (needs the Workers Paid plan, $5/mo — DOs aren't on the free
   tier). Carries only the rare pair that can't go P2P. Set `DEFAULT_URL` in net.js to your own.

The host is authoritative for the game sim; relays only forward + rate-limit, so there are no
game secrets on the server and nothing to trust from clients beyond light validation. The local
relay and the Worker speak the **same protocol**, so what you test locally is what ships.

The static arcade (GitHub Pages) stays exactly as-is — these are separate, additive services.

## Transport switches (browser console / localStorage)

| Want | Do |
|---|---|
| P2P + relay fallback (default) | `localStorage.setItem("arcade:transport","auto")` |
| Force pure peer-to-peer (no fallback) | `localStorage.setItem("arcade:transport","rtc")` |
| Force the WebSocket relay | `localStorage.setItem("arcade:transport","ws")` |
| Point at a specific WS server | `localStorage.setItem("arcade:neturl","wss://…")` |
| Self-host the P2P signaling broker | set `window.ARCADE_PEERJS_CONFIG = {host,port,path}` |

Default (nothing set): `localhost` → local relay; everywhere else → `auto` (P2P first, relay fallback).

## ▶️ Play multiplayer locally (no Cloudflare, ~10 seconds)

From the repo root:

```
node server/local-relay.js
```

Then open **`http://localhost:8787`** in two browser windows (or on your phone at the
`http://<your-pc-ip>:8787` address it prints). Pick **Missile Defense** → **PLAY ONLINE →
CREATE GAME** in one, **JOIN GAME** + the 4-letter code in the other. Done — real co-op,
two browsers, same machine.

> How it auto-connects: when the page is served from `localhost`/`127.0.0.1`, the client
> ([`js/core/net.js`](../js/core/net.js)) targets the **same-origin** relay automatically —
> no config. Served from anywhere else (e.g. GitHub Pages) it uses the Cloudflare Worker.
> You can always force a specific server with
> `localStorage.setItem("arcade:neturl","ws://localhost:8787")` in the console.

## 🩺 Troubleshooting "DISCONNECTED" online (the deployed Worker)

If the **deployed** Worker is up (`/health` returns `ok`) but joining a room shows
**DISCONNECTED**, hit the WebSocket route directly:

```
curl -i -H "Upgrade: websocket" -H "Connection: Upgrade" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     "https://chriskit-arcade.<you>.workers.dev/room?code=TEST&game=missile"
```

A **500 "Worker threw exception"** means the Durable Object can't be provisioned on the
account (the usual culprit: the SQLite-backed DO migration didn't apply, or the Workers
plan gate). The Worker **code is correct** — it passes against `wrangler dev` locally — so
the fix is a clean **redeploy** plus reading the real error:

```
cd server
wrangler deploy
wrangler tail          # then connect from the game; the real exception prints here
```

The Worker now `await`s + try/catches the room dispatch, so any failure logs a readable
reason in `wrangler tail` instead of an opaque 500. Until it's redeployed, use the **local
relay** above — same protocol, fully playable.

## One-time deploy (~5 minutes)

1. **Install the CLI** (Node 18+):
   ```
   npm install -g wrangler
   ```
2. **Log in** to your Cloudflare account (free plan is fine):
   ```
   wrangler login
   ```
3. **Deploy** from this folder:
   ```
   cd server
   wrangler deploy
   ```
   Wrangler prints your Worker URL, e.g. `https://chriskit-arcade.YOURNAME.workers.dev`.
4. **Point the arcade at it.** Edit [`../js/core/net.js`](../js/core/net.js) and set:
   ```js
   const DEFAULT_URL = "wss://chriskit-arcade.YOURNAME.workers.dev";
   ```
   (note the **wss://** scheme, not https). Commit + push so GitHub Pages picks it up.
   - No redeploy of the arcade needed to *test*: you can instead run
     `localStorage.setItem("arcade:neturl","wss://...workers.dev")` in the browser console.

That's it. In Pong, tap **⇄ PLAY ONLINE → CREATE GAME**, share the 4-letter code,
your coworker taps **JOIN GAME** and enters it. First to 7 wins.

## Shared leaderboards (D1) — optional, ~2 more minutes
Every game's Game Over screen shows a **GLOBAL TOP** board (per game, mobile/desktop separate).
It needs a D1 database:
```
cd server
wrangler d1 create chriskit-arcade
# paste the printed database_id into wrangler.toml (the [[d1_databases]] block)
wrangler d1 execute chriskit-arcade --remote --file=./schema.sql
wrangler deploy
```
The client reuses the same Worker URL (it derives `https://` from the `wss://` you set in net.js),
so no extra config. Until D1 is set up the board just stays hidden — games play normally.

## Cost / plan
Durable Objects use the new **SQLite-backed** class (see `wrangler.toml`), which is on the
**Workers free plan**. If your account prompts for the Workers Paid plan ($5/mo), that's the
only cost; everything here fits comfortably in free-tier limits for friends-scale play.

## Security notes
- TLS + DDoS protection are automatic (Cloudflare edge).
- Server validates message shape + size and **rate-limits** each peer (~90 msg/s).
- Rooms cap at 2; a 3rd connection is told `full` and closed.
- No secrets/keys live in the client. Room codes are random.
- For tighter access later: add an allowed-Origin check in `worker.js` and/or a short
  signed token; for now room codes gate entry (fine for private coworker play).

## Automated E2E tests (no Cloudflare needed)
From the repo root:
- `node _auto_test.js` — the **default** transport: proves both halves of auto — (A) P2P
  connects → session runs over WebRTC; (B) P2P broker forced unreachable → both peers fall
  back to the relay. Uses `local-relay.js` as the stand-in relay.
- `node _rtc_test.js` — pure WebRTC: two separate headless browsers connect
  **WebRTC peer-to-peer** (public PeerJS broker) and asserts roles, presence, host→guest
  snapshots, guest→host firing, and a clean "opponent left" disconnect. `PEER_LOCAL=1` uses a
  local PeerServer instead of the public broker. Exits non-zero on any failure.
- `node _relay_test.js` — the **local-relay** transport: starts the real `local-relay.js` +
  two browsers and asserts the same-origin auto-connect + the same co-op flow.
- `node _rtc_shot.js` / `node _relay_shot.js` — write `shot_*_host.png` / `shot_*_guest.png`
  (visual proof of a live session per transport).
- `node _coopmd_test.js`, `node _pongnet_test.js` — older mock-server variants.

(All `_*.js` here are untracked dev tools.)

## Protocol
See the header comment in [`src/worker.js`](src/worker.js).
