# ChrisKit Arcade — multiplayer backend (Cloudflare)

Real-time rooms for online Pong (and future games). A Cloudflare **Worker** routes
WebSocket connections into per-room **Durable Objects** that relay messages between
the two players. The host is authoritative for the game sim; the room only relays +
rate-limits, so there are no game secrets on the server and nothing to trust from clients
beyond light validation.

The static arcade (GitHub Pages) stays exactly as-is — this is a separate, additive service.

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

## Local test (no Cloudflare needed)
From the repo root: `node _pongnet_test.js` spins up a mock room server + two headless
browsers and asserts roles, presence, and input/state sync. (Untracked dev tool.)

## Protocol
See the header comment in [`src/worker.js`](src/worker.js).
