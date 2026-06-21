/* =========================================================
   Dr. Quackers — a Dr. Mario–style game module.

   Drop two-color capsules into the bottle, line up 4+ of a color
   (vertically or horizontally) to clear them. Wipe out every virus
   to clear the bottle and advance. Capsule halves left dangling
   after a clear fall and can trigger chain reactions.

   Implements the Arcade GameInstance interface (see gameshell.js).
   ========================================================= */
(function (Arcade) {
  "use strict";

  const D = Arcade.DrMario;
  const CONFIG = { COLS: 8, ROWS: 16, SPAWN_COL: 3, VIRUS_TOP: 5, MAX_VIRUS: 72 };
  D.CONFIG = CONFIG;

  const COLORS = ["R", "Y", "B"];
  const DAS = 130, ARR = 30;
  const LOCK_DELAY = 320;
  const FLASH_MS = 190, GAP_MS = 110, WIN_MS = 1500;

  function ri(n) { return (Math.random() * n) | 0; }
  function dropMsForLevel(level) { return Math.max(110, 700 - (level - 1) * 45); }

  // ---- original chiptune (NOT Nintendo's tune; composed here). 32-beat loop. ----
  const MK = Arcade.MusicKit;
  const DR_MELODY = [
    ["C5",0.5],["E5",0.5],["G5",0.5],["C6",0.5],["G5",0.5],["E5",0.5],["C5",1],
    ["D5",0.5],["F5",0.5],["A5",0.5],["D6",0.5],["A5",0.5],["F5",0.5],["D5",1],
    ["E5",0.5],["G5",0.5],["C6",0.5],["E6",0.5],["C6",0.5],["G5",0.5],["E5",1],
    ["G5",1],["F5",0.5],["E5",0.5],["D5",1],["G4",1],
    ["C5",0.5],["E5",0.5],["G5",0.5],["C6",0.5],["B5",0.5],["A5",0.5],["G5",1],
    ["A5",0.5],["G5",0.5],["F5",0.5],["E5",0.5],["D5",0.5],["E5",0.5],["F5",1],
    ["E5",0.5],["D5",0.5],["C5",0.5],["D5",0.5],["E5",0.5],["F5",0.5],["G5",1],
    ["C5",1],["G4",1],["C5",1],[null,1]
  ];
  const DR_ROOTS = ["C3","D3","C3","G2","C3","F2","G2","C3"];
  const DR_CLASSIC = {
    bpm: 145, volume: 0.15,
    tracks: [
      { wave: "square", gain: 0.16, notes: DR_MELODY },
      { wave: "triangle", gain: 0.22, notes: MK.quarterBass(DR_ROOTS) }
    ]
  };
  const DR_TECHNO = {
    bpm: 160, volume: 0.17,
    tracks: [
      { wave: "sawtooth", gain: 0.13, notes: DR_MELODY },
      { wave: "sawtooth", gain: 0.15, notes: MK.eighthBass(DR_ROOTS) },
      { drum: true, gain: 0.36, notes: MK.fourOnFloor(32) },
      { drum: true, gain: 0.09, notes: MK.eighthHats(32) },
      { drum: true, gain: 0.20, notes: MK.backbeat(8) }
    ]
  };
  // A second electronic option: a faster acid-arp "Hyperdrive" (Am-F-C-G).
  const HYPER_ARP = [
    ["A4",.5],["C5",.5],["E5",.5],["A5",.5],["E5",.5],["C5",.5],["A4",.5],["C5",.5],
    ["F4",.5],["A4",.5],["C5",.5],["F5",.5],["C5",.5],["A4",.5],["F4",.5],["A4",.5],
    ["C5",.5],["E5",.5],["G5",.5],["C6",.5],["G5",.5],["E5",.5],["C5",.5],["E5",.5],
    ["G4",.5],["B4",.5],["D5",.5],["G5",.5],["D5",.5],["B4",.5],["G4",.5],["B4",.5],
    ["A4",.5],["C5",.5],["E5",.5],["A5",.5],["E5",.5],["C5",.5],["A4",.5],["C5",.5],
    ["F4",.5],["A4",.5],["C5",.5],["F5",.5],["C5",.5],["A4",.5],["F4",.5],["A4",.5],
    ["C5",.5],["E5",.5],["G5",.5],["C6",.5],["G5",.5],["E5",.5],["C5",.5],["E5",.5],
    ["G4",.5],["B4",.5],["D5",.5],["G5",.5],["D5",.5],["B4",.5],["G4",.5],["B4",.5]
  ];
  const HYPER_ROOTS = ["A2","F2","C3","G2","A2","F2","C3","G2"];
  const DR_HYPER = {
    bpm: 172, volume: 0.16,
    tracks: [
      { wave: "sawtooth", gain: 0.12, notes: HYPER_ARP },
      { wave: "square", gain: 0.13, notes: MK.eighthBass(HYPER_ROOTS) },
      { drum: true, gain: 0.36, notes: MK.fourOnFloor(32) },
      { drum: true, gain: 0.09, notes: MK.eighthHats(32) },
      { drum: true, gain: 0.20, notes: MK.backbeat(8) }
    ]
  };
  const SONGS = [
    { id: "classic", name: "Bottle Bop", song: DR_CLASSIC },
    { id: "techno", name: "Techno Remix", song: DR_TECHNO },
    { id: "hyper", name: "Hyperdrive", song: DR_HYPER }
  ];
  D.SONGS = SONGS;

  class DrQuackers {
    constructor(ctx) {
      this.shell = ctx;
      this.ctx2d = ctx.ctx;
      this.particles = ctx.particles;
      this.audio = ctx.audio;
      this.renderer = new D.Renderer(CONFIG);
      this.theme = D.getTheme(ctx.storage.get("drmario:theme", "modern"));
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("drmario:song", 0) | 0));
      this.dev = false;
      this._unsub = [];
      this.paused = false;
      this.state = "playing";
      this._now = 0;
      this._bindInput();
    }

    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      this.level = 1;
      this.score = 0;
      this._buildBottle();
      this.nextPill = [COLORS[ri(3)], COLORS[ri(3)]];
      this.pill = null;
      this.combo = 0;
      this.moveDir = 0; this.dasTimer = 0; this.dasCharged = false; this.arrTimer = 0;
      this.softDropping = false;
      this.dropTimer = 0; this.lockTimer = 0; this.grounded = false;
      this._phase = null; this._clear = null; this._ptimer = 0; this._winTimer = 0;
      this.shakeMag = 0; this.toasts = [];
      this.particles.clear();
      this.state = "playing";
      this.paused = false;
      this._spawnPill();
      this._applyMusic();
    }

    pause() { this.paused = true; this.moveDir = 0; this.softDropping = false; this.audio.suspendMusic(); }
    resume() { this.paused = false; this.audio.resumeMusic(); this._applyTempo(); }
    destroy() { this.audio.stopMusic(); this._unsub.forEach(fn => fn()); this._unsub.length = 0; }

    _applyMusic() { this.audio.playMusic(SONGS[this.songIdx].song); this._applyTempo(); }
    _applyTempo() {
      const base = SONGS[this.songIdx].song.bpm;
      this.audio.setMusicTempo(Math.round(base * Math.min(1.6, 1 + (this.level - 1) * 0.04)));
    }
    cycleMusic() {
      this.songIdx = (this.songIdx + 1) % SONGS.length;
      this.shell.storage.set("drmario:song", this.songIdx);
      this._applyMusic();
      const name = SONGS[this.songIdx].name;
      this._toast("♪ " + name, this.theme.palette.accent);
      return name;
    }
    toggleDev() { this.dev = !this.dev; this._toast(this.dev ? "DEV: drop paused" : "DEV OFF", this.theme.palette.accent, true); return this.dev; }

    cycleTheme() {
      const list = D.Themes;
      this.theme = list[(list.indexOf(this.theme) + 1) % list.length];
      this.shell.storage.set("drmario:theme", this.theme.id);
      if (!this.theme.effects.particles) this.particles.clear();
      return this.theme.name;
    }

    // ---------------- bottle setup ----------------
    _buildBottle() {
      const g = [];
      for (let r = 0; r < CONFIG.ROWS; r++) g.push(new Array(CONFIG.COLS).fill(null));
      this.grid = g;
      this.dropMs = dropMsForLevel(this.level);
      this._populateViruses();
    }

    _populateViruses() {
      const count = Math.min(CONFIG.MAX_VIRUS, this.level * 4 + 4);
      let placed = 0;
      for (let i = 0; i < count; i++) {
        let done = false;
        for (let attempt = 0; attempt < 100 && !done; attempt++) {
          const r = CONFIG.VIRUS_TOP + ri(CONFIG.ROWS - CONFIG.VIRUS_TOP);
          const c = ri(CONFIG.COLS);
          if (this.grid[r][c]) continue;
          // try colors in random order, avoid making 3-in-a-line
          const order = COLORS.slice().sort(() => Math.random() - 0.5);
          for (const color of order) {
            if (this._canPlaceVirus(r, c, color)) {
              this.grid[r][c] = { color: color, kind: "virus", link: null };
              placed++; done = true; break;
            }
          }
        }
      }
      this.virusCount = placed;
    }

    _canPlaceVirus(r, c, color) {
      const g = this.grid, ROWS = CONFIG.ROWS, COLS = CONFIG.COLS;
      const same = (rr, cc) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && g[rr][cc] && g[rr][cc].color === color;
      if (same(r, c - 1) && same(r, c - 2)) return false;
      if (same(r, c + 1) && same(r, c + 2)) return false;
      if (same(r, c - 1) && same(r, c + 1)) return false;
      if (same(r - 1, c) && same(r - 2, c)) return false;
      if (same(r + 1, c) && same(r + 2, c)) return false;
      if (same(r - 1, c) && same(r + 1, c)) return false;
      return true;
    }

    // ---------------- input ----------------
    _bindInput() {
      const input = this.shell.input;
      this._unsub.push(input.onDown((code, e, repeat) => this._onKeyDown(code, repeat)));
      this._unsub.push(input.onUp((code) => this._onKeyUp(code)));
    }

    _onKeyDown(code, repeat) {
      if (this.paused || this.state === "over") return;
      const live = this.state === "playing" && this.pill;
      switch (code) {
        case "ArrowLeft":  if (!live || repeat) return; this.moveDir = -1; this.dasTimer = 0; this.dasCharged = false; this.arrTimer = 0; this._move(-1); break;
        case "ArrowRight": if (!live || repeat) return; this.moveDir = 1; this.dasTimer = 0; this.dasCharged = false; this.arrTimer = 0; this._move(1); break;
        case "ArrowDown":  if (!live || repeat) return; this.softDropping = true; break;
        case "ArrowUp": case "KeyX": if (!live || repeat) return; this._rotate(1); break;
        case "KeyZ": case "ControlLeft": case "ControlRight": if (!live || repeat) return; this._rotate(-1); break;
        case "Space": if (!live || repeat) return; this._hardDrop(); break;
        default: break;
      }
    }

    _onKeyUp(code) {
      if (this.paused || this.state === "over") return;
      if (code === "ArrowLeft" && this.moveDir === -1) this._recomputeDir();
      else if (code === "ArrowRight" && this.moveDir === 1) this._recomputeDir();
      else if (code === "ArrowDown") this.softDropping = false;
    }

    _recomputeDir() {
      const input = this.shell.input;
      if (input.isDown("ArrowLeft") && !input.isDown("ArrowRight")) this.moveDir = -1;
      else if (input.isDown("ArrowRight") && !input.isDown("ArrowLeft")) this.moveDir = 1;
      else this.moveDir = 0;
      this.dasCharged = false; this.dasTimer = 0; this.arrTimer = 0;
    }

    // ---------------- pill geometry ----------------
    _cellsAt(r, c, state, cL, cR) {
      switch (state) {
        case 0: return [{ r: r, c: c, color: cL, link: "R" }, { r: r, c: c + 1, color: cR, link: "L" }];
        case 1: return [{ r: r, c: c, color: cL, link: "U" }, { r: r - 1, c: c, color: cR, link: "D" }];
        case 2: return [{ r: r, c: c, color: cR, link: "R" }, { r: r, c: c + 1, color: cL, link: "L" }];
        default: return [{ r: r, c: c, color: cR, link: "U" }, { r: r - 1, c: c, color: cL, link: "D" }];
      }
    }
    _cells(p) { return this._cellsAt(p.r, p.c, p.state, p.cL, p.cR); }

    _collideAt(r, c, state, cL, cR) {
      const cells = this._cellsAt(r, c, state, cL, cR);
      for (const cell of cells) {
        if (cell.c < 0 || cell.c >= CONFIG.COLS) return true;
        if (cell.r >= CONFIG.ROWS) return true;
        if (cell.r < 0) return true;
        if (this.grid[cell.r][cell.c]) return true;
      }
      return false;
    }

    _move(dc) {
      const p = this.pill;
      if (this._collideAt(p.r, p.c + dc, p.state, p.cL, p.cR)) return false;
      p.c += dc;
      this.audio.play("move");
      if (this._collideAt(p.r + 1, p.c, p.state, p.cL, p.cR)) this.lockTimer = 0;
      return true;
    }

    _rotate(dir) {
      const p = this.pill;
      const ns = ((p.state + dir) % 4 + 4) % 4;
      const kicks = [[0, 0], [0, -1], [0, 1], [1, 0]];
      for (const k of kicks) {
        const nr = p.r + k[0], nc = p.c + k[1];
        if (!this._collideAt(nr, nc, ns, p.cL, p.cR)) {
          p.r = nr; p.c = nc; p.state = ns;
          this.audio.play("rotate");
          if (this._collideAt(p.r + 1, p.c, p.state, p.cL, p.cR)) this.lockTimer = 0;
          return true;
        }
      }
      return false;
    }

    _hardDrop() {
      const p = this.pill;
      let d = 0;
      while (!this._collideAt(p.r + 1, p.c, p.state, p.cL, p.cR)) { p.r++; d++; }
      if (d > 0) this.score += d;
      if (this.theme.effects.shake) this._shake(2 + d * 0.25);
      this._lock();
    }

    // ---------------- lock + resolve chain ----------------
    _lock() {
      const cells = this._cells(this.pill);
      for (const cell of cells) {
        if (cell.r >= 0 && cell.r < CONFIG.ROWS) {
          this.grid[cell.r][cell.c] = { color: cell.color, kind: "pill", link: cell.link };
        }
      }
      this.audio.play("pill");
      this.pill = null;
      this.state = "resolving";
      this.combo = 0;
      this._startResolve();
    }

    _startResolve() {
      const matches = this._findMatches();
      if (matches.length) {
        this._clear = matches;
        this._phase = "flash";
        this._ptimer = 0;
        this.combo++;
        if (this.combo > 1) { this.audio.play("combo"); this._toast("CHAIN x" + this.combo, this.theme.palette.accent); }
      } else {
        this._finishResolve();
      }
    }

    _findMatches() {
      const g = this.grid, ROWS = CONFIG.ROWS, COLS = CONFIG.COLS;
      const set = new Set();
      // horizontal runs
      for (let r = 0; r < ROWS; r++) {
        let c = 0;
        while (c < COLS) {
          if (!g[r][c]) { c++; continue; }
          const color = g[r][c].color; let run = 1;
          while (c + run < COLS && g[r][c + run] && g[r][c + run].color === color) run++;
          if (run >= 4) for (let k = 0; k < run; k++) set.add(r * COLS + (c + k));
          c += run;
        }
      }
      // vertical runs
      for (let c = 0; c < COLS; c++) {
        let r = 0;
        while (r < ROWS) {
          if (!g[r][c]) { r++; continue; }
          const color = g[r][c].color; let run = 1;
          while (r + run < ROWS && g[r + run][c] && g[r + run][c].color === color) run++;
          if (run >= 4) for (let k = 0; k < run; k++) set.add((r + k) * COLS + c);
          r += run;
        }
      }
      return Array.from(set);
    }

    _commitClear(keys) {
      const g = this.grid, COLS = CONFIG.COLS;
      const keySet = new Set(keys);
      let virusesCleared = 0;
      for (const key of keys) {
        const r = (key / COLS) | 0, c = key % COLS;
        const cell = g[r][c];
        if (!cell) continue;
        // orphan a surviving partner
        if (cell.link) {
          let pr = r, pc = c;
          if (cell.link === "L") pc = c - 1; else if (cell.link === "R") pc = c + 1;
          else if (cell.link === "U") pr = r - 1; else if (cell.link === "D") pr = r + 1;
          if (pr >= 0 && pr < CONFIG.ROWS && pc >= 0 && pc < COLS && g[pr][pc] && !keySet.has(pr * COLS + pc)) {
            g[pr][pc].link = null;
          }
        }
        if (cell.kind === "virus") { virusesCleared++; this.virusCount--; }
        if (this.theme.effects.particles) {
          const px = this.renderer.cellPx(r, c);
          this.particles.emit({
            x: px.x + px.size / 2, y: px.y + px.size / 2, count: 8,
            colors: [this.theme.palette[cell.color], "#ffffff"],
            speedMin: 50, speedMax: 280, gravity: 480, drag: 1.1,
            sizeMin: 2, sizeMax: px.size * 0.22, lifeMin: 0.4, lifeMax: 0.85,
            glow: true, shape: cell.kind === "virus" ? "circle" : "square", spin: 8
          });
        }
        g[r][c] = null;
      }
      const mult = Math.max(1, this.combo);
      this.score += (virusesCleared * 100 + keys.length * 10) * mult;
      if (virusesCleared > 0) this.audio.play(this.combo > 1 ? "clear3" : "clear2");
      if (this.theme.effects.shake) this._shake(Math.min(8, 2 + keys.length * 0.4));
    }

    _settleStep() {
      const g = this.grid, ROWS = CONFIG.ROWS, COLS = CONFIG.COLS;
      const done = [];
      for (let r = 0; r < ROWS; r++) done.push(new Array(COLS).fill(false));
      let moved = false;
      for (let r = ROWS - 2; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) {
          const cell = g[r][c];
          if (!cell || done[r][c] || cell.kind === "virus") continue;
          const link = cell.link;
          if (link == null) {
            if (!g[r + 1][c]) { g[r + 1][c] = cell; g[r][c] = null; done[r + 1][c] = true; moved = true; }
          } else if (link === "R") {
            if (c + 1 < COLS && !g[r + 1][c] && !g[r + 1][c + 1]) {
              g[r + 1][c] = cell; g[r + 1][c + 1] = g[r][c + 1];
              g[r][c] = null; g[r][c + 1] = null;
              done[r + 1][c] = true; done[r + 1][c + 1] = true; moved = true;
            }
          } else if (link === "U") {
            // bottom of a vertical pair; its 'D' partner is directly above.
            // Guard the read so a stray/dangling link can never deref g[-1].
            if (r - 1 >= 0 && g[r - 1][c] && !g[r + 1][c]) {
              g[r + 1][c] = cell; g[r][c] = g[r - 1][c]; g[r - 1][c] = null;
              done[r + 1][c] = true; done[r][c] = true; moved = true;
            }
          }
          // 'L' and 'D' handled via their partner
        }
      }
      return moved;
    }

    _finishResolve() {
      this.combo = 0; this._phase = null; this._clear = null;
      if (this.virusCount <= 0) this._levelWin();
      else this._spawnPill();
    }

    _spawnPill() {
      const cL = this.nextPill[0], cR = this.nextPill[1];
      this.nextPill = [COLORS[ri(3)], COLORS[ri(3)]];
      this.pill = { r: 0, c: CONFIG.SPAWN_COL, state: 0, cL: cL, cR: cR };
      this.lockTimer = 0; this.dropTimer = 0; this.grounded = false;
      if (this._collideAt(0, CONFIG.SPAWN_COL, 0, cL, cR)) { this.pill = null; this._gameOver(); return; }
      this.state = "playing";
    }

    _levelWin() {
      this.state = "won";
      this._winTimer = 0;
      this.audio.play("win");
      this._toast("BOTTLE CLEAR!", this.theme.palette.accent, true);
    }
    _nextLevel() {
      this.level++;
      this._buildBottle();
      this.combo = 0;
      this._applyTempo(); // music speeds up as levels climb
      this._toast("LEVEL " + this.level, this.theme.palette.accent, true);
      this._spawnPill();
    }

    _gameOver() {
      if (this.state === "over") return;
      this.state = "over";
      this.audio.stopMusic();
      // The shell's requestGameOver already plays the "gameover" sting — don't
      // double it here.
      this.shell.requestGameOver({ score: this.score });
    }

    _shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
    _toast(text, color, big) {
      this.toasts.push({ text: text, color: color || this.theme.palette.text, born: this._now, life: 1200, big: !!big });
      if (this.toasts.length > 5) this.toasts.shift();
    }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now;
      if (this.shakeMag > 0) { this.shakeMag -= dt * 0.04; if (this.shakeMag < 0) this.shakeMag = 0; }
      this.particles.update(dt);
      for (let i = this.toasts.length - 1; i >= 0; i--) if (now - this.toasts[i].born > this.toasts[i].life) this.toasts.splice(i, 1);

      if (this.state === "won") {
        this._winTimer += dt;
        if (this._winTimer >= WIN_MS) this._nextLevel();
        return;
      }
      if (this.state === "resolving") {
        this._ptimer += dt;
        if (this._phase === "flash" && this._ptimer >= FLASH_MS) {
          this._commitClear(this._clear);
          let guard = 0;
          while (this._settleStep() && guard < 400) guard++;
          this._phase = "gap"; this._ptimer = 0;
        } else if (this._phase === "gap" && this._ptimer >= GAP_MS) {
          this._startResolve();
        }
        return;
      }
      if (this.state !== "playing" || !this.pill) return;

      // DAS / ARR
      if (this.moveDir !== 0) {
        this.dasTimer += dt;
        if (!this.dasCharged) {
          if (this.dasTimer >= DAS) { this.dasCharged = true; this.arrTimer = 0; this._move(this.moveDir); }
        } else {
          this.arrTimer += dt;
          while (this.arrTimer >= ARR) { this.arrTimer -= ARR; if (!this._move(this.moveDir)) break; }
        }
      }

      // gravity / soft drop
      const p = this.pill;
      this.grounded = this._collideAt(p.r + 1, p.c, p.state, p.cL, p.cR);
      if (this.grounded) {
        this.lockTimer += dt;
        if (this.lockTimer >= LOCK_DELAY) this._lock();
      } else {
        const interval = this.softDropping ? Math.min(this.dropMs, 45) : (this.dev ? 100000 : this.dropMs);
        this.dropTimer += dt;
        let guard = 0;
        while (this.dropTimer >= interval && guard < 40) {
          guard++;
          if (this._collideAt(p.r + 1, p.c, p.state, p.cL, p.cR)) break;
          p.r++; this.dropTimer -= interval;
          if (this.softDropping) this.score += 1;
          this.lockTimer = 0;
        }
      }
    }

    // ---------------- render ----------------
    resize(w, h, inset) { this.renderer.computeLayout(w, h, inset || 0); this._w = w; this._h = h; }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme;
      if (!R.layout) R.computeLayout(this._w || 800, this._h || 600);
      const w = this._w, h = this._h;
      R.drawBackground(ctx, th, w, h, now);

      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1) { sx = (Math.random() * 2 - 1) * this.shakeMag; sy = (Math.random() * 2 - 1) * this.shakeMag; }
      ctx.save();
      ctx.translate(sx, sy);

      R.drawBottle(ctx, th);

      const flashing = (this.state === "resolving" && this._phase === "flash") ? new Set(this._clear) : null;
      const flashOn = flashing ? (Math.floor(now / 50) % 2 === 0) : false;
      for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS; c++) {
          const cell = this.grid[r][c];
          if (!cell) continue;
          const px = R.cellPx(r, c);
          if (flashing && flashing.has(r * CONFIG.COLS + c)) {
            R.drawHalf(ctx, px.x, px.y, px.size, flashOn ? "#ffffff" : th.palette[cell.color], null, th, {});
            continue;
          }
          if (cell.kind === "virus") R.drawVirus(ctx, px.x, px.y, px.size, th.palette[cell.color], th, now, (r * 7 + c * 13));
          else R.drawHalf(ctx, px.x, px.y, px.size, th.palette[cell.color], cell.link, th, {});
        }
      }

      if (this.state === "playing" && this.pill) {
        // ghost
        const gr = this._ghostRow();
        this._cellsAt(gr, this.pill.c, this.pill.state, this.pill.cL, this.pill.cR).forEach(cell => {
          if (cell.r < 0) return;
          const px = R.cellPx(cell.r, cell.c);
          R.drawGhostHalf(ctx, px.x, px.y, px.size, th.palette[cell.color], cell.link, th);
        });
        // active pill
        this._cells(this.pill).forEach(cell => {
          if (cell.r < 0) return;
          const px = R.cellPx(cell.r, cell.c);
          R.drawHalf(ctx, px.x, px.y, px.size, th.palette[cell.color], cell.link, th, { glow: th.effects.glow });
        });
      }

      this.particles.render(ctx);
      ctx.restore();

      // panels
      R.label(ctx, R.layout.next.label, R.layout.next.box.x, R.layout.next.box.y - 8, th, { size: 12 });
      R.drawPanelBox(ctx, R.layout.next.box, th);
      R.drawNextPill(ctx, R.layout.next.box, this.nextPill[0], this.nextPill[1], th);
      R.drawStats(ctx, th, { level: this.level, virus: Math.max(0, this.virusCount), score: this.score });

      this._renderToasts(ctx, R, th, now);
      R.drawScanlines(ctx, th, w, h);
    }

    _ghostRow() {
      const p = this.pill;
      let r = p.r;
      while (!this._collideAt(r + 1, p.c, p.state, p.cL, p.cR)) r++;
      return r;
    }

    _renderToasts(ctx, R, th, now) {
      if (!this.toasts.length) return;
      const b = R.layout.board;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < this.toasts.length; i++) {
        const t = this.toasts[i];
        const pr = (now - t.born) / t.life;
        const alpha = pr < 0.15 ? pr / 0.15 : (1 - (pr - 0.15) / 0.85);
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = "800 " + (t.big ? 28 : 18) + "px " + th.fonts.ui;
        if (th.effects.glow) { ctx.shadowBlur = 16; ctx.shadowColor = t.color; }
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, b.x + b.w / 2, b.y + b.h * 0.4 - pr * 24 + i * 30);
      }
      ctx.restore();
    }
  }

  D.Game = DrQuackers;
})(window.Arcade = window.Arcade || {});
