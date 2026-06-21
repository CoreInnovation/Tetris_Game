# 🕹️ Arcade — Tetris

A lightweight, fully-portable arcade built in plain HTML5 + Canvas + JavaScript.
**No install, no build step, no internet required.** Just open it and play.

It's a growing little game suite. Two games so far, each with two switchable skins
(**Classic** — beveled blocks + CRT scanlines; **Modern Neon** — glow, animated
background, particles, screen shake) and **retro chiptune music** (synthesized at
runtime — no audio files):

- 🟦 **Tetris** — the classic, scored to **Korobeiniki** (the traditional Tetris folk tune).
- 💊 **Dr. Quackers** — a Dr. Mario–style germ-buster: drop two-color capsules, line up
  4+ to clear, wipe out the goofy viruses, with chain reactions and rising levels.
- 🚀 **Asteroids** — rotate/thrust/fire vector shooter; split rocks, dodge UFOs, clear waves.
- 🛰️ **Missile Defense** — aim with the mouse/finger, intercept incoming missiles with
  expanding chain-reaction blasts, an arsenal of weapons (powerups + heat/cooldown), UFOs.
- 🪐 **Space Pinball** — an original space-cadet-style pinball table: real ball physics,
  flippers, pop bumpers, slingshots, a plunger, and multiball.

Most games have two music tracks (a clean version + a techno remix; Dr. Quackers has three) —
switch with `N` / 🎵. The music **tempo speeds up as you climb levels**, true to the originals.

It's built as a small **arcade shell + pluggable game modules**, so more games can be
dropped in later (the menu builds itself from whatever modules are registered).

---

## ▶️ How to play

**Just double-click `index.html`.** It runs in any modern browser straight from the
file system — no server needed. (Drag it to your taskbar/Start for one-click access,
or copy the whole `Tetris_Game` folder to a USB stick and it works anywhere.)

> Want it as a desktop app later? Because it's pure web tech, this exact folder drops
> straight into Tauri, Electron, or a MAUI BlazorWebView with zero code changes.

### Controls

**Tetris / Dr. Quackers**

| Action | Keys |
|---|---|
| Move left / right | `←` / `→` |
| Soft drop | `↓` |
| Hard drop | `Space` |
| Rotate clockwise | `↑` or `X` |
| Rotate counter-clockwise | `Z` or `Ctrl` |
| Hold piece (Tetris) | `C` or `Shift` |

**Asteroids**: `←`/`→` rotate · `↑` thrust · `Space` fire · `Z` hyperspace
**Missile Defense**: mouse/finger to aim · click/tap to fire · keys `1`-`9` / click chips to switch weapons · 🛠️ dev mode
**Space Pinball**: `←`/`Z` left flipper · `→`/`/` right flipper · hold `Space` to charge the plunger, release to launch

**Anytime**

| Action | Keys |
|---|---|
| Pause | `Esc` or `P` |
| Switch skin | `T` (or the 🎨 button) |
| Switch music track | `N` (or the 🎵 button) |
| Mute / unmute | `M` (or the 🔊 button) |

On touch devices, on-screen buttons appear automatically. The same controls drive both
games (Dr. Quackers ignores Hold). Music + SFX are on by default — press `M` to mute.

---

## 🎮 Game features

**Tetris**
- Super Rotation System (SRS) with full wall-kick tables (incl. I-piece kicks)
- 7-bag randomizer, ghost piece, hold, 5-piece next preview
- DAS / ARR auto-shift, soft & hard drop, lock delay with move-reset
- Combo + back-to-back Tetris scoring, level speed curve, Korobeiniki theme music

**Dr. Quackers**
- Two-color capsules with rotation + wall/floor kicks, ghost preview, DAS/ARR, hard drop
- Goofy animated viruses; match 4+ (any direction) to clear them
- Dangling-half gravity + chain reactions, combos, level progression (clear bottle → next)
- Its own original chiptune

**Shared**
- Animated clears, particles, screen shake (modern skin)
- Runtime-synthesized chiptune music + SFX (no audio files), `M` to mute
- Persistent high scores (per game, via `localStorage`)
- Responsive layout — adapts to desktop (side panels) and phone (compact + touch)

---

## 🧱 Architecture

```
Tetris_Game/
├─ index.html              ← shell page + script load order
├─ css/style.css           ← shell chrome (menu, overlays, buttons)
└─ js/
   ├─ core/                ← reusable engine (game-agnostic)
   │  ├─ eventbus.js       pub/sub
   │  ├─ storage.js        namespaced localStorage + high scores
   │  ├─ input.js          keyboard manager (held state + events)
   │  ├─ loop.js           requestAnimationFrame loop (delta time)
   │  ├─ particles.js      general 2D particle system
   │  ├─ audio.js          WebAudio SFX synth (no asset files)
   │  └─ gameshell.js      menu + game lifecycle + the module contract
   ├─ games/
   │  ├─ tetris/
   │  │  ├─ pieces.js      SRS shapes + wall-kick tables
   │  │  ├─ themes.js      the two skins (pure data)
   │  │  ├─ renderer.js    canvas drawing per skin
   │  │  ├─ tetris.js      game logic + Korobeiniki song (GameInstance)
   │  │  └─ index.js       module manifest (registers the game)
   │  ├─ drmario/          Dr. Quackers (same module pattern)
   │  │  ├─ drthemes.js · drrenderer.js · drmario.js · index.js
   │  ├─ asteroids/        Asteroids (vector shooter)
   │  │  ├─ astthemes.js · astrenderer.js · asteroids.js · index.js
   │  ├─ missile/          Missile Defense (pointer-aimed)
   │  │  ├─ mdthemes.js · mdrenderer.js · missiledefense.js · index.js
   │  └─ pinball/          Space Pinball (physics)
   │     ├─ pinthemes.js · pinrenderer.js · pinball.js · index.js
   └─ main.js              boot
```

Everything uses **classic `<script>` tags + a `window.Arcade` namespace** (not ES
modules) on purpose — that's what lets it run from `file://` with no server.

---

## ➕ Adding a new game module

The shell is built to grow. To add, say, "Snake":

1. Create `js/games/snake/` with a `snake.js` (your `GameInstance`) and `index.js`.
2. Implement the **GameInstance** interface (documented at the top of
   [`js/core/gameshell.js`](js/core/gameshell.js)):
   `start, update(dt,now), render(now), resize(w,h), pause, resume, restart, destroy`
   — and optionally `cycleTheme()` if your game has skins.
3. In `index.js`, call `Arcade.registerGame({ id, name, tagline, icon, accent, create })`.
4. Add your `<script>` tags to `index.html` (before `main.js`).

That's it — a menu card appears automatically, with its own persistent high score.

---

Made for Chris to play when he's bored. Enjoy. 🎉
