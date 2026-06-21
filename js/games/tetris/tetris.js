/* =========================================================
   Tetris — game instance. Implements the Arcade GameInstance
   interface (start/update/render/resize/pause/resume/restart/
   cycleTheme/destroy).

   Features: SRS rotation + wall kicks, 7-bag randomizer, hold,
   ghost piece, 5-piece preview, DAS/ARR auto-shift, soft/hard
   drop, lock delay with move-reset, line-clear animation, combo
   + back-to-back scoring, level curve, screen shake + particles
   (modern skin), persistent high score.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const T = Arcade.Tetris;
  const Pieces = T.Pieces;
  const util = T._util;

  const CONFIG = { COLS: 10, VISIBLE_ROWS: 20, HIDDEN: 2 };
  CONFIG.ROWS_TOTAL = CONFIG.VISIBLE_ROWS + CONFIG.HIDDEN;
  T.CONFIG = CONFIG;

  // Tuning
  const DAS = 130;          // ms before auto-shift kicks in
  const ARR = 22;           // ms between auto-shifts
  const SOFT_MAX_INTERVAL = 40; // ms per cell while soft dropping
  const LOCK_DELAY = 500;   // ms resting before lock
  const MAX_LOCK_RESETS = 15;
  const LINE_SCORES = [0, 100, 300, 500, 800];

  // "Korobeiniki" — the traditional Russian folk tune used by classic Tetris
  // (public domain). 64-beat loop (A section + B section). We arrange it two
  // ways: a clean chiptune ("Korobeiniki") and a driving techno remix.
  const MK = Arcade.MusicKit;
  const KORO_MELODY = [
    // A section
    ["E5",1],["B4",0.5],["C5",0.5],["D5",1],["C5",0.5],["B4",0.5],
    ["A4",1],["A4",0.5],["C5",0.5],["E5",1],["D5",0.5],["C5",0.5],
    ["B4",1.5],["C5",0.5],["D5",1],["E5",1],
    ["C5",1],["A4",1],["A4",1],[null,1],
    [null,0.5],["D5",1],["F5",0.5],["A5",1],["G5",0.5],["F5",0.5],
    ["E5",1.5],["C5",0.5],["E5",1],["D5",0.5],["C5",0.5],
    ["B4",1],["B4",0.5],["C5",0.5],["D5",1],["E5",1],
    ["C5",1],["A4",1],["A4",1],[null,1],
    // B section
    ["E5",2],["C5",2], ["D5",2],["B4",2], ["C5",2],["A4",2],
    ["G#4",2],["B4",1],[null,1],
    ["E5",2],["C5",2], ["D5",2],["B4",2], ["C5",1],["E5",1],["A5",2],
    ["G#5",2],[null,2]
  ];
  const KORO_ROOTS = [
    "E2","A2","E2","A2","D3","C3","E2","A2",   // under A
    "E2","B2","E2","B2","E2","B2","A2","E2"    // under B
  ];
  const SONG_CLASSIC = {
    bpm: 150, volume: 0.15,
    tracks: [
      { wave: "square", gain: 0.17, notes: KORO_MELODY },
      { wave: "triangle", gain: 0.24, notes: MK.quarterBass(KORO_ROOTS) }
    ]
  };
  // Badass techno remix: saw lead + driving eighth-note saw bass +
  // four-on-the-floor kick, eighth hats, and a backbeat snare.
  const SONG_TECHNO = {
    bpm: 162, volume: 0.17,
    tracks: [
      { wave: "sawtooth", gain: 0.13, notes: KORO_MELODY },
      { wave: "sawtooth", gain: 0.15, notes: MK.eighthBass(KORO_ROOTS) },
      { drum: true, gain: 0.36, notes: MK.fourOnFloor(64) },
      { drum: true, gain: 0.09, notes: MK.eighthHats(64) },
      { drum: true, gain: 0.20, notes: MK.backbeat(16) }
    ]
  };
  const SONGS = [
    { id: "classic", name: "Korobeiniki", song: SONG_CLASSIC },
    { id: "techno", name: "Techno Remix", song: SONG_TECHNO }
  ];
  Arcade.Tetris.SONGS = SONGS;

  function gravityMsForLevel(level) {
    // Clamp the base before exponentiating: past ~level 115 the raw term goes
    // negative and Math.pow(neg, evenInt) explodes to a huge/Infinite value
    // that the lower Math.max can't catch, which would freeze gravity.
    const t = Math.max(0.05, 0.8 - (level - 1) * 0.007);
    return Math.max(10, Math.pow(t, level - 1) * 1000);
  }

  function shuffledBag() {
    const bag = Pieces.TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    return bag;
  }

  class TetrisGame {
    constructor(ctx) {
      this.shell = ctx;                 // shell-provided context
      this.ctx2d = ctx.ctx;
      this.particles = ctx.particles;
      this.audio = ctx.audio;
      this.renderer = new T.Renderer(CONFIG);

      const savedTheme = ctx.storage.get("tetris:theme", "modern");
      this.theme = T.getTheme(savedTheme);
      this.songIdx = Math.min(SONGS.length - 1, Math.max(0, ctx.storage.get("tetris:song", 0) | 0));
      this.dev = false;

      this._unsub = [];
      this.paused = false;
      this.state = "playing"; // playing | clearing | over

      this._bindInput();
    }

    // ---------------- lifecycle ----------------
    start() { this._reset(); }
    restart() { this._reset(); }

    _reset() {
      const C = CONFIG;
      this.grid = [];
      for (let r = 0; r < C.ROWS_TOTAL; r++) this.grid.push(new Array(C.COLS).fill(null));

      this.bag = [];
      this.queue = [];
      this._refillQueue();

      this.cur = null;
      this.holdType = null;
      this.holdUsed = false;

      this.score = 0;
      this.level = 1;
      this.lines = 0;
      this.combo = -1;
      this.b2b = false;

      this.gravityMs = gravityMsForLevel(this.level);
      this.dropTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.grounded = false;

      this.moveDir = 0;
      this.dasTimer = 0;
      this.dasCharged = false;
      this.arrTimer = 0;
      this.softDropping = false;

      this.clearRows = [];
      this.clearTimer = 0;
      this.clearDuration = 0;
      this.clearColors = null;

      this.shakeMag = 0;
      this.afterimages = [];
      this.toasts = [];
      this.ambientTimer = 0;
      this._now = 0;

      this.particles.clear();
      this.state = "playing";
      this.paused = false;

      this._spawn();
      this._applyMusic();
    }

    pause() { this.paused = true; this.moveDir = 0; this.softDropping = false; this.audio.suspendMusic(); }
    resume() { this.paused = false; this.audio.resumeMusic(); this._applyTempo(); }

    // music: play the chosen track and scale its tempo to the level
    _applyMusic() { this.audio.playMusic(SONGS[this.songIdx].song); this._applyTempo(); }
    _applyTempo() {
      const base = SONGS[this.songIdx].song.bpm;
      this.audio.setMusicTempo(Math.round(base * Math.min(1.6, 1 + (this.level - 1) * 0.03)));
    }
    cycleMusic() {
      this.songIdx = (this.songIdx + 1) % SONGS.length;
      this.shell.storage.set("tetris:song", this.songIdx);
      this._applyMusic();
      const name = SONGS[this.songIdx].name;
      this._toast("♪ " + name, this.theme.palette.accent);
      return name;
    }
    toggleDev() { this.dev = !this.dev; this._toast(this.dev ? "DEV: gravity paused" : "DEV OFF", this.theme.palette.accent, true); return this.dev; }

    destroy() {
      this.audio.stopMusic();
      this._unsub.forEach(fn => fn());
      this._unsub.length = 0;
    }

    cycleTheme() {
      const list = T.Themes;
      let i = list.indexOf(this.theme);
      this.theme = list[(i + 1) % list.length];
      this.shell.storage.set("tetris:theme", this.theme.id);
      if (!this.theme.effects.particles) this.particles.clear();
      return this.theme.name;
    }

    // ---------------- input ----------------
    _bindInput() {
      const input = this.shell.input;
      this._unsub.push(input.onDown((code, e, repeat) => this._onKeyDown(code, repeat)));
      this._unsub.push(input.onUp((code) => this._onKeyUp(code)));
    }

    _onKeyDown(code, repeat) {
      if (this.paused || this.state === "over") return;
      // Movement/soft-drop are allowed only while a piece is live.
      const live = (this.state === "playing" && this.cur);
      switch (code) {
        case "ArrowLeft":
          // Ignore OS key-repeat — our own DAS/ARR drives auto-shift.
          if (!live || repeat) return;
          this.moveDir = -1; this.dasTimer = 0; this.dasCharged = false; this.arrTimer = 0;
          this._tryMove(-1, 0);
          break;
        case "ArrowRight":
          if (!live || repeat) return;
          this.moveDir = 1; this.dasTimer = 0; this.dasCharged = false; this.arrTimer = 0;
          this._tryMove(1, 0);
          break;
        case "ArrowDown":
          if (!live || repeat) return;
          this.softDropping = true;
          break;
        case "ArrowUp":
        case "KeyX":
          if (!live || repeat) return;
          this._rotate(1);
          break;
        case "KeyZ":
        case "ControlLeft":
        case "ControlRight":
          if (!live || repeat) return;
          this._rotate(-1);
          break;
        case "Space":
          if (!live || repeat) return;
          this._hardDrop();
          break;
        case "KeyC":
        case "ShiftLeft":
        case "ShiftRight":
          if (!live || repeat) return;
          this._hold();
          break;
        default: break;
      }
    }

    _onKeyUp(code) {
      // Mirror the _onKeyDown gate so releases during pause/over (incl. touch,
      // which bypasses Input's enabled flag) can't mutate movement intent.
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

    // ---------------- piece management ----------------
    _refillQueue() {
      while (this.queue.length <= 7) {
        if (this.bag.length === 0) this.bag = shuffledBag();
        this.queue.push(this.bag.shift());
      }
    }

    _spawn(forcedType) {
      const type = forcedType || this.queue.shift();
      this._refillQueue();
      const size = Pieces.matrixFor(type, 0).length;
      const col = Math.floor((CONFIG.COLS - size) / 2);
      this.cur = { type: type, rot: 0, row: 0, col: col };
      this.holdUsed = false;
      this.dropTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.afterimages.length = 0;
      this.grounded = this._collides(type, 0, this.cur.row + 1, col);

      if (this._collides(type, 0, this.cur.row, col)) {
        this._gameOver();
      }
    }

    _collides(type, rot, row, col) {
      const m = Pieces.matrixFor(type, rot);
      const C = CONFIG;
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          const br = row + r, bc = col + c;
          if (bc < 0 || bc >= C.COLS) return true;
          if (br >= C.ROWS_TOTAL) return true;
          if (br < 0) continue; // above the field is fine
          if (this.grid[br][bc]) return true;
        }
      }
      return false;
    }

    _tryMove(dCol, dRow) {
      if (!this.cur) return false;
      const n = this.cur;
      if (this._collides(n.type, n.rot, n.row + dRow, n.col + dCol)) return false;
      n.col += dCol; n.row += dRow;
      if (this.theme.effects.trails) this._pushAfterimage();
      if (dCol !== 0) {
        this.audio.play("move");
        this._onGroundedReset();
      }
      if (dRow > 0) { this.lockTimer = 0; this.lockResets = 0; }
      this.grounded = this._collides(n.type, n.rot, n.row + 1, n.col);
      return true;
    }

    _rotate(dir) {
      const n = this.cur;
      const from = n.rot;
      const to = ((n.rot + dir) % 4 + 4) % 4;
      const kicks = Pieces.getKicks(n.type, String(from), String(to));
      for (let i = 0; i < kicks.length; i++) {
        const kx = kicks[i][0], ky = kicks[i][1];
        const nc = n.col + kx;
        const nr = n.row - ky;        // board Y is down, SRS Y is up
        if (!this._collides(n.type, to, nr, nc)) {
          n.rot = to; n.col = nc; n.row = nr;
          this.audio.play("rotate");
          if (this.theme.effects.trails) this._pushAfterimage();
          this._onGroundedReset();
          this.grounded = this._collides(n.type, n.rot, n.row + 1, n.col);
          return true;
        }
      }
      return false;
    }

    _onGroundedReset() {
      // Move/rotate "lock reset": if resting on the stack, restart the
      // lock timer a limited number of times so play can't stall forever.
      if (this._collides(this.cur.type, this.cur.rot, this.cur.row + 1, this.cur.col)) {
        if (this.lockResets < MAX_LOCK_RESETS) {
          this.lockTimer = 0;
          this.lockResets++;
        }
      }
    }

    _hardDrop() {
      const n = this.cur;
      let dist = 0;
      while (!this._collides(n.type, n.rot, n.row + 1, n.col)) {
        n.row++; dist++;
        if (this.theme.effects.trails && dist % 1 === 0) this._pushAfterimage(0.5);
      }
      if (dist > 0) this.score += dist * 2;
      this.audio.play("harddrop");
      if (this.theme.effects.shake) this._addShake(Math.min(6, 2 + dist * 0.3));
      this._lock();
    }

    _hold() {
      if (this.holdUsed) return;
      this.audio.play("hold");
      const curType = this.cur.type;
      if (this.holdType == null) {
        this.holdType = curType;
        this._spawn();
      } else {
        const swap = this.holdType;
        this.holdType = curType;
        this._spawn(swap);
      }
      this.holdUsed = true;
    }

    _pushAfterimage(alpha) {
      const n = this.cur;
      const cells = [];
      const m = Pieces.matrixFor(n.type, n.rot);
      Pieces.eachCell(m, (r, c) => cells.push({ r: n.row + r, c: n.col + c }));
      this.afterimages.push({ cells: cells, type: n.type, born: this._now, a0: alpha || 0.5 });
      if (this.afterimages.length > 8) this.afterimages.shift();
    }

    _addShake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); }

    // ---------------- lock + line clears ----------------
    _lock() {
      const n = this.cur;
      const m = Pieces.matrixFor(n.type, n.rot);
      let minRow = 99;
      Pieces.eachCell(m, (r, c) => {
        const br = n.row + r, bc = n.col + c;
        if (br >= 0 && br < CONFIG.ROWS_TOTAL) this.grid[br][bc] = n.type;
        if (br < minRow) minRow = br;
      });

      this.audio.play("lock");

      // Lock-out: piece locked entirely in the hidden buffer.
      if (minRow < CONFIG.HIDDEN) {
        // Find full rows anyway? No — locking above the ceiling ends it.
        const allHidden = (() => {
          let ok = true;
          Pieces.eachCell(m, (r) => { if (n.row + r >= CONFIG.HIDDEN) ok = false; });
          return ok;
        })();
        if (allHidden) { this.cur = null; this._gameOver(); return; }
      }

      // Detect full rows.
      const full = [];
      for (let r = 0; r < CONFIG.ROWS_TOTAL; r++) {
        if (this.grid[r].every(cell => cell)) full.push(r);
      }

      if (full.length === 0) {
        this.combo = -1;
        this.cur = null;
        this._spawn();
        return;
      }

      this._beginClear(full);
    }

    _beginClear(rows) {
      this.state = "clearing";
      this.cur = null;
      this.clearRows = rows;
      this.clearTimer = 0;
      this.clearDuration = this.theme.effects.particles ? 280 : 160;

      // capture colors for particles
      this.clearColors = rows.map(r => this.grid[r].slice());

      const n = rows.length;
      this.combo++;
      const isTetris = (n === 4);
      let base = LINE_SCORES[n] * this.level;
      // back-to-back tetris bonus
      if (isTetris && this.b2b) base = Math.round(base * 1.5);
      this.b2b = isTetris;
      let gained = base;
      if (this.combo > 0) gained += 50 * this.combo * this.level;
      this.score += gained;

      // sfx + toast
      if (n === 4) { this.audio.play("tetris"); this._toast("TETRIS!", this.theme.palette.I, true); }
      else if (n === 3) { this.audio.play("clear3"); this._toast("TRIPLE", this.theme.palette.S); }
      else if (n === 2) { this.audio.play("clear2"); this._toast("DOUBLE", this.theme.palette.T); }
      else { this.audio.play("clear1"); }
      if (this.combo > 0) this._toast("COMBO x" + (this.combo + 1), this.theme.palette.accent, false, 1);

      // particles
      if (this.theme.effects.particles) {
        rows.forEach((r) => {
          const visR = r - CONFIG.HIDDEN;
          if (visR < 0) return;
          for (let c = 0; c < CONFIG.COLS; c++) {
            const px = this.renderer.cellPx(visR, c);
            const color = this.theme.palette[this.grid[r][c]] || "#ffffff";
            this.particles.emit({
              x: px.x + px.size / 2, y: px.y + px.size / 2,
              count: 7, colors: [color, "#ffffff"],
              speedMin: 60, speedMax: 320, gravity: 520,
              sizeMin: 2, sizeMax: px.size * 0.22,
              lifeMin: 0.4, lifeMax: 0.9, glow: true, shape: "square",
              spin: 8, drag: 1.2
            });
          }
        });
      }
      if (this.theme.effects.shake) this._addShake(n >= 4 ? 9 : 3 + n);
    }

    _finishClear() {
      // Remove rows top-down preserving indices.
      const rows = this.clearRows.slice().sort((a, b) => a - b);
      for (let k = rows.length - 1; k >= 0; k--) {
        this.grid.splice(rows[k], 1);
      }
      for (let k = 0; k < rows.length; k++) {
        this.grid.unshift(new Array(CONFIG.COLS).fill(null));
      }

      const cleared = rows.length;
      this.lines += cleared;
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
        this.gravityMs = gravityMsForLevel(this.level);
        this._applyTempo(); // music speeds up with the level (true to the original)
        this.audio.play("levelup");
        this._toast("LEVEL " + this.level, this.theme.palette.accent, true);
      }

      this.clearRows = [];
      this.clearColors = null;
      this.state = "playing";
      this._spawn();
    }

    _gameOver() {
      if (this.state === "over") return;
      this.state = "over";
      this.audio.stopMusic();
      this.shell.requestGameOver({ score: this.score });
    }

    _toast(text, color, big, lane) {
      this.toasts.push({ text: text, color: color || this.theme.palette.text,
        born: this._now, life: 1100, big: !!big, lane: lane || 0 });
      if (this.toasts.length > 6) this.toasts.shift();
    }

    // ---------------- update ----------------
    update(dt, now) {
      this._now = now;
      if (this.theme.effects.bgAnim) { /* bg uses now in render */ }

      // shake decay
      if (this.shakeMag > 0) {
        this.shakeMag -= dt * 0.04;
        if (this.shakeMag < 0) this.shakeMag = 0;
      }

      // particles + ambient
      this.particles.update(dt);
      if (this.theme.effects.particles) {
        this.ambientTimer -= dt;
        if (this.ambientTimer <= 0 && this.renderer.layout) {
          this.ambientTimer = 240;
          const b = this.renderer.layout.board;
          this.particles.emit({
            x: b.x + Math.random() * b.w, y: b.y + b.h,
            count: 1, colors: [util.rgba(this.theme.palette.I, 1), util.rgba(this.theme.palette.T, 1)],
            speedMin: 6, speedMax: 18, angleMin: -Math.PI * 0.6, angleMax: -Math.PI * 0.4,
            gravity: -6, sizeMin: 1, sizeMax: 2.5, lifeMin: 1.6, lifeMax: 3.0,
            glow: true, shape: "circle", fade: true, shrink: false
          });
        }
      }

      // toasts lifetime
      for (let i = this.toasts.length - 1; i >= 0; i--) {
        if (now - this.toasts[i].born > this.toasts[i].life) this.toasts.splice(i, 1);
      }

      if (this.state === "clearing") {
        this.clearTimer += dt;
        if (this.clearTimer >= this.clearDuration) this._finishClear();
        return;
      }
      if (this.state !== "playing" || !this.cur) return;

      // ---- auto-shift (DAS / ARR) ----
      if (this.moveDir !== 0) {
        this.dasTimer += dt;
        if (!this.dasCharged) {
          if (this.dasTimer >= DAS) { this.dasCharged = true; this.arrTimer = 0; this._tryMove(this.moveDir, 0); }
        } else {
          this.arrTimer += dt;
          while (this.arrTimer >= ARR) {
            this.arrTimer -= ARR;
            if (!this._tryMove(this.moveDir, 0)) break;
          }
        }
      }

      // ---- gravity / soft drop ----
      this.grounded = this._collides(this.cur.type, this.cur.rot, this.cur.row + 1, this.cur.col);
      if (this.grounded) {
        this.lockTimer += dt;
        if (this.lockTimer >= LOCK_DELAY) this._lock();
      } else {
        const interval = this.softDropping
          ? Math.min(this.gravityMs, SOFT_MAX_INTERVAL)
          : (this.dev ? 100000 : this.gravityMs);
        this.dropTimer += dt;
        let guard = 0, softSteps = 0;
        while (this.dropTimer >= interval && guard < 40) {
          guard++;
          if (this._collides(this.cur.type, this.cur.rot, this.cur.row + 1, this.cur.col)) break;
          this.cur.row++;
          this.dropTimer -= interval;
          if (this.softDropping) { this.score += 1; softSteps++; }
          this.lockTimer = 0; this.lockResets = 0;
          if (this.theme.effects.trails) this._pushAfterimage(0.35);
        }
        // One SFX per tick, not per cell (avoids a stream of overlapping nodes).
        if (softSteps > 0) this.audio.play("softdrop");
        this.grounded = this._collides(this.cur.type, this.cur.rot, this.cur.row + 1, this.cur.col);
      }
    }

    // ---------------- ghost position ----------------
    _ghostRow() {
      const n = this.cur;
      let row = n.row;
      while (!this._collides(n.type, n.rot, row + 1, n.col)) row++;
      return row;
    }

    // ---------------- render ----------------
    resize(w, h, bottomInset) { this.renderer.computeLayout(w, h, bottomInset || 0); this._w = w; this._h = h; }

    render(now) {
      const ctx = this.ctx2d, R = this.renderer, th = this.theme;
      if (!R.layout) R.computeLayout(this._w || 800, this._h || 600);
      const w = this._w, h = this._h;

      R.drawBackground(ctx, th, w, h, now);

      // shake offset
      let sx = 0, sy = 0;
      if (this.shakeMag > 0.1) {
        sx = (Math.random() * 2 - 1) * this.shakeMag;
        sy = (Math.random() * 2 - 1) * this.shakeMag;
      }

      ctx.save();
      ctx.translate(sx, sy);

      R.drawBoardFrame(ctx, th);
      this._renderStack(ctx, R, th, now);
      this._renderAfterimages(ctx, R, th, now);
      if (this.state === "playing" && this.cur) {
        this._renderGhost(ctx, R, th);
        this._renderCurrent(ctx, R, th);
      }
      this.particles.render(ctx);
      ctx.restore();

      this._renderPanels(ctx, R, th);
      this._renderToasts(ctx, R, th, now);
      R.drawScanlines(ctx, th, w, h);
    }

    _renderStack(ctx, R, th, now) {
      const C = CONFIG;
      const clearing = this.state === "clearing";
      const t = clearing ? (this.clearTimer / this.clearDuration) : 0;
      for (let r = C.HIDDEN; r < C.ROWS_TOTAL; r++) {
        const visR = r - C.HIDDEN;
        const rowClearing = clearing && this.clearRows.indexOf(r) !== -1;
        for (let c = 0; c < C.COLS; c++) {
          const type = this.grid[r][c];
          if (!type) continue;
          const px = R.cellPx(visR, c);
          if (rowClearing) {
            // flash + shrink the clearing row
            if (th.effects.particles) {
              // fade out (particles carry the rest)
              R.drawBlock(ctx, px.x, px.y, px.size, "#ffffff", th, { alpha: Math.max(0, 1 - t) });
            } else {
              // classic: alternating white flash
              const flash = (Math.floor(now / 60) % 2) === 0;
              R.drawBlock(ctx, px.x, px.y, px.size, flash ? "#ffffff" : th.palette[type], th, {});
            }
          } else {
            R.drawBlock(ctx, px.x, px.y, px.size, th.palette[type], th, {});
          }
        }
      }
    }

    _renderAfterimages(ctx, R, th, now) {
      if (!th.effects.trails || !this.afterimages.length) return;
      const FADE = 150;
      ctx.save();
      for (let i = 0; i < this.afterimages.length; i++) {
        const ai = this.afterimages[i];
        const age = now - ai.born;
        if (age > FADE) continue;
        const alpha = ai.a0 * (1 - age / FADE);
        const color = th.palette[ai.type];
        for (let k = 0; k < ai.cells.length; k++) {
          const cell = ai.cells[k];
          const visR = cell.r - CONFIG.HIDDEN;
          if (visR < 0) continue;
          const px = R.cellPx(visR, cell.c);
          R.drawBlock(ctx, px.x, px.y, px.size, color, th, { alpha: alpha, glow: false });
        }
      }
      ctx.restore();
    }

    _renderGhost(ctx, R, th) {
      const n = this.cur;
      const gr = this._ghostRow();
      const m = Pieces.matrixFor(n.type, n.rot);
      const color = th.palette[n.type];
      Pieces.eachCell(m, (r, c) => {
        const visR = (gr + r) - CONFIG.HIDDEN;
        if (visR < 0) return;
        const px = R.cellPx(visR, n.col + c);
        R.drawGhostCell(ctx, px.x, px.y, px.size, color, th);
      });
    }

    _renderCurrent(ctx, R, th) {
      const n = this.cur;
      const m = Pieces.matrixFor(n.type, n.rot);
      const color = th.palette[n.type];
      Pieces.eachCell(m, (r, c) => {
        const visR = (n.row + r) - CONFIG.HIDDEN;
        if (visR < 0) return;
        const px = R.cellPx(visR, n.col + c);
        R.drawBlock(ctx, px.x, px.y, px.size, color, th, { glow: th.effects.glow });
      });
    }

    _renderPanels(ctx, R, th) {
      const L = R.layout;
      // HOLD
      R.drawLabel(ctx, "HOLD", L.hold.box.x, L.hold.box.y - 8, th, { size: 12, color: th.palette.textDim });
      R.drawPanelBox(ctx, L.hold.box, th);
      R.drawMini(ctx, this.holdType, L.hold.box, th, { dim: this.holdUsed });
      // NEXT
      const firstSlot = L.next.slots[0];
      R.drawLabel(ctx, "NEXT", firstSlot.x, firstSlot.y - 8, th, { size: 12, color: th.palette.textDim });
      for (let i = 0; i < L.next.slots.length; i++) {
        const slot = L.next.slots[i];
        R.drawPanelBox(ctx, slot, th);
        if (this.queue[i]) R.drawMini(ctx, this.queue[i], slot, th, {});
      }
      // STATS
      R.drawStats(ctx, th, { score: this.score, level: this.level, lines: this.lines });
    }

    _renderToasts(ctx, R, th, now) {
      if (!this.toasts.length) return;
      const b = R.layout.board;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < this.toasts.length; i++) {
        const t = this.toasts[i];
        const age = now - t.born;
        const p = age / t.life;            // 0..1
        const alpha = p < 0.15 ? p / 0.15 : (1 - (p - 0.15) / 0.85);
        const size = (t.big ? 30 : 20) * (0.8 + 0.2 * Math.min(1, p * 4));
        const cy = b.y + b.h * 0.38 - p * 26 + t.lane * 34;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = "800 " + size + "px " + th.fonts.ui;
        if (th.effects.glow) { ctx.shadowBlur = 16; ctx.shadowColor = t.color; }
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, b.x + b.w / 2, cy);
      }
      ctx.restore();
    }
  }

  // Exposed so the module manifest (index.js) can construct instances.
  T.Game = TetrisGame;
})(window.Arcade = window.Arcade || {});
