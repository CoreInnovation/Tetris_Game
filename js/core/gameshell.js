/* =========================================================
   GameShell — the arcade frame around pluggable game modules.

   A GAME MODULE registers itself via Arcade.registerGame({...}):
     {
       id:       "tetris",                 // unique
       name:     "Tetris",
       tagline:  "Stack. Clear. Repeat.",
       icon:     "🟦",                      // emoji or short text
       accent:   "#5ad1ff",                // menu card accent color
       create(context) -> GameInstance     // factory
     }

   A GAME INSTANCE (returned by create) implements:
     start()                  begin / reset and run
     update(dtMs, nowMs)      advance simulation (skipped while paused)
     render(nowMs)            draw a full frame (owns its background)
     resize(wCss, hCss)       canvas logical size changed
     pause() / resume()       freeze / unfreeze simulation
     restart()                reset to a fresh game
     cycleTheme() -> string   switch skin, return new theme name (optional)
     destroy()                release listeners / resources

   The CONTEXT the shell hands to create():
     { canvas, ctx, width, height, input, storage, audio, events,
       particles, isTouch, requestPause(), requestGameOver({score}) }
   ========================================================= */
(function (Arcade) {
  "use strict";

  Arcade.games = Arcade.games || [];
  Arcade.registerGame = function (mod) {
    if (!mod || !mod.id) { console.warn("[Arcade] invalid game module", mod); return; }
    if (Arcade.games.some(g => g.id === mod.id)) return; // dedupe on reload
    Arcade.games.push(mod);
  };

  class GameShell {
    constructor() {
      this.storage = new Arcade.Storage();
      this.events = new Arcade.EventBus();
      this.audio = new Arcade.AudioEngine(this.storage);
      this.input = new Arcade.Input(window);
      this.isTouch = (("ontouchstart" in window) || navigator.maxTouchPoints > 0);

      this._game = null;       // current GameInstance
      this._module = null;     // current module descriptor
      this._paused = false;
      this._over = false;

      this._loop = new Arcade.GameLoop(
        (dt, now) => { if (this._game && !this._paused) this._game.update(dt, now); },
        (now) => { if (this._game) this._game.render(now); }
      );
    }

    init(refs) {
      this.refs = refs;
      this.canvas = refs.canvas;
      this.ctx = this.canvas.getContext("2d");

      this._buildMenu();
      this._wireChrome();
      this._wireOverlays();
      this._wireGlobalKeys();
      // Touch buttons are static DOM + a singleton Input, so wire them ONCE
      // here (not per mountGame, which would stack duplicate listeners).
      if (this.isTouch) this._wireTouch();
      // Remember default touch-button labels so per-game overrides can reset.
      this._touchDefaults = {};
      this.refs.touchControls.querySelectorAll(".tc-btn").forEach(b => { this._touchDefaults[b.getAttribute("data-act")] = b.textContent; });

      // Unlock audio on the first real gesture. Some mobile browsers only honor touchend (not
      // pointerdown), so we listen on several events in the CAPTURE phase (so a game's
      // preventDefault/stopPropagation can't swallow it) and keep retrying until the context is
      // actually running, then detach.
      const GEST = ["pointerdown", "touchstart", "touchend", "mousedown", "keydown", "click"];
      const tryUnlock = () => { this.audio.unlock(); if (this.audio.running) GEST.forEach(ev => window.removeEventListener(ev, tryUnlock, true)); };
      GEST.forEach(ev => window.addEventListener(ev, tryUnlock, true));

      window.addEventListener("resize", () => this._resize());
      // Auto-pause if the window loses focus, so held keys can't get "stuck".
      window.addEventListener("blur", () => this.togglePause(true));
      document.addEventListener("visibilitychange", () => { if (document.hidden) this.togglePause(true); else this.audio.unlock(); });

      this._updateSoundIcon();
      this.showMenu();
    }

    // ---------------- Menu ----------------
    _buildMenu() {
      const grid = this.refs.gameGrid;
      grid.innerHTML = "";
      Arcade.games.forEach(mod => {
        const card = document.createElement("button");
        card.className = "game-card";
        card.style.setProperty("--card-accent", mod.accent || "#5ad1ff");
        const best = this.storage.getHighScore(mod.id);
        card.innerHTML =
          '<div class="gc-icon">' + (mod.icon || "🎮") + "</div>" +
          '<div class="gc-name">' + esc(mod.name) + "</div>" +
          '<div class="gc-tag">' + esc(mod.tagline || "") + "</div>" +
          '<div class="gc-best">BEST&nbsp;&nbsp;' + best.toLocaleString() + "</div>";
        card.addEventListener("click", () => { this.audio.play("select"); this.mountGame(mod); });
        grid.appendChild(card);
      });

      // Extensibility hint card.
      const soon = document.createElement("div");
      soon.className = "game-card disabled";
      soon.innerHTML =
        '<div class="gc-icon">➕</div>' +
        '<div class="gc-name">More Games</div>' +
        '<div class="gc-tag">Drop a module in js/games/ — it appears here.</div>';
      grid.appendChild(soon);
    }

    showMenu() {
      this._loop.stop();
      if (this._game) { this._game.destroy(); this._game = null; this._module = null; }
      this.input.detach();
      this.input.clearHandlers();
      this._paused = false; this._over = false;
      this._hide(this.refs.pauseOverlay);
      this._hide(this.refs.gameoverOverlay);
      this._hide(this.refs.gameView);
      this._hide(this.refs.backBtn);
      this._hide(this.refs.pauseBtn);
      this._hide(this.refs.controlBtn);
      this._hide(this.refs.chooserOverlay);
      this._hide(this.refs.themeBtn);
      this._hide(this.refs.musicBtn);
      this._hide(this.refs.devBtn);
      this._hide(this.refs.touchControls);
      this._show(this.refs.menu);
      this._buildMenu(); // refresh high scores
    }

    // ---------------- Game lifecycle ----------------
    mountGame(mod) {
      this._module = mod;
      this._hide(this.refs.menu);
      this._hide(this.refs.chooserOverlay);   // never let an open chooser bleed onto a freshly-launched game
      this._show(this.refs.gameView);
      this._show(this.refs.backBtn);
      this._show(this.refs.pauseBtn);

      this.input.attach();
      this.input.setEnabled(true);
      this._paused = false; this._over = false;

      this._resize(); // sizes canvas before create()

      const ctx = this._makeContext();
      this._game = mod.create(ctx);

      // Show theme/music buttons only if the game supports them.
      if (typeof this._game.cycleTheme === "function") this._show(this.refs.themeBtn);
      else this._hide(this.refs.themeBtn);
      if (typeof this._game.cycleMusic === "function") this._show(this.refs.musicBtn);
      else this._hide(this.refs.musicBtn);
      if (typeof this._game.toggleDev === "function") this._show(this.refs.devBtn);
      else this._hide(this.refs.devBtn);
      const menus0 = (typeof this._game.menus === "function") ? this._game.menus() : null;
      if (menus0 && menus0.control) this._show(this.refs.controlBtn); else this._hide(this.refs.controlBtn);
      this._updateDevIcon();

      // Touch buttons: shown for games that use them; pointer-driven games opt out.
      this._refreshTouchLayout();

      this._game.start();
      this._game.resize(this._cssW, this._cssH, this._touchInset());
      this._loop.start();
    }

    // Height occupied by the on-screen touch controls (0 when hidden), so the
    // game can keep the board clear of them. Measured live, with a fallback.
    _touchInset() {
      const tc = this.refs.touchControls;
      if (this.isTouch && tc && !tc.classList.contains("hidden")) {
        const h = Math.ceil(tc.getBoundingClientRect().height);
        return h > 0 ? h : 140;
      }
      return 0;
    }

    _makeContext() {
      const self = this;
      return {
        canvas: this.canvas,
        ctx: this.ctx,
        width: this._cssW,
        height: this._cssH,
        input: this.input,
        storage: this.storage,
        audio: this.audio,
        events: this.events,
        particles: new Arcade.ParticleSystem(1400),
        isTouch: this.isTouch,
        requestPause() { self.togglePause(true); },
        requestGameOver(info) { self._onGameOver(info || {}); }
      };
    }

    togglePause(forceOn) {
      if (this._over || !this._game) return;
      const next = (forceOn === true) ? true : (forceOn === false ? false : !this._paused);
      if (next === this._paused) return;
      this._paused = next;
      if (this._paused) {
        if (this._game.pause) this._game.pause();
        this._show(this.refs.pauseOverlay);
      } else {
        this._hide(this.refs.pauseOverlay);
        if (this._game.resume) this._game.resume();
      }
    }

    _onGameOver(info) {
      if (this._over) return;
      this._over = true;
      this._paused = true;
      if (this._game && this._game.pause) this._game.pause();
      const score = info.score || 0;
      const isNew = this.storage.setHighScore(this._module.id, score);
      const best = this.storage.getHighScore(this._module.id);
      this.refs.goScore.textContent = score.toLocaleString();
      this.refs.goBest.textContent = best.toLocaleString();
      this.refs.goNew.classList.toggle("hidden", !isNew);
      this.audio.play("gameover");
      this._hide(this.refs.pauseOverlay);   // don't leave a pause overlay stacked under game-over
      this._hide(this.refs.pauseBtn);       // pause is meaningless once the game is over
      this._show(this.refs.gameoverOverlay);
    }

    restartGame() {
      this._hide(this.refs.gameoverOverlay);
      this._hide(this.refs.pauseOverlay);
      this._show(this.refs.pauseBtn);
      this._over = false;
      this._paused = false;
      if (this._game && this._game.restart) this._game.restart();
    }

    cycleTheme() {
      if (this._game && this._game.cycleTheme) {
        const name = this._game.cycleTheme();
        this.audio.play("select");
        return name;
      }
    }

    cycleMusic() {
      this.audio.unlock();
      if (this._game && this._game.cycleMusic) return this._game.cycleMusic();
    }

    toggleDev() {
      if (this._game && this._game.toggleDev) { this._game.toggleDev(); this._updateDevIcon(); }
    }
    _updateDevIcon() {
      const on = !!(this._game && this._game.dev);
      this.refs.devBtn.style.background = on ? "rgba(90,209,255,0.30)" : "";
      this.refs.devBtn.style.borderColor = on ? "var(--accent)" : "";
    }

    // ---------------- options chooser (controls / music / skin modals) ----------------
    _gameMenus() { return (this._game && typeof this._game.menus === "function") ? this._game.menus() : null; }

    // (Re)apply the shared touch bar's labels + layout class for the current game (handles live profile switches).
    _refreshTouchLayout() {
      const tc = this.refs.touchControls;
      tc.classList.remove("gamepad", "flippers", "onethumb", "onethumb-left", "onethumb-right");
      if (this._game && this.isTouch && !this._game.pointerInput) {
        this._applyTouchLabels(this._game);
        const lay = this._game.touchLayout;
        if (lay) String(lay).split(/\s+/).forEach(c => c && tc.classList.add(c));
        this._show(tc);
      } else this._hide(tc);
    }

    _openChooser(kind) { this.audio.unlock(); const m = this._gameMenus(); if (!m || !m[kind]) return; this._chooserKind = kind; this._renderChooser(); this._show(this.refs.chooserOverlay); }
    _closeChooser() { this._hide(this.refs.chooserOverlay); }
    _renderChooser() {
      const menus = this._gameMenus(); if (!menus) return this._closeChooser();
      const kind = this._chooserKind, body = this.refs.chooserBody;
      this.refs.chooserTitle.textContent = { control: "Controls", music: "Music", skin: "Skin" }[kind] || "Options";
      body.innerHTML = "";
      const label = (t) => { const h = document.createElement("div"); h.className = "chooser-label"; h.textContent = t; body.appendChild(h); };
      const btn = (name, active, onClick) => { const b = document.createElement("button"); b.className = "btn" + (active ? " primary" : ""); b.textContent = name; b.addEventListener("click", () => { this.audio.unlock(); onClick(); }); body.appendChild(b); };
      if (kind === "music" && menus.music) menus.music.options.forEach(o => btn(o.name, o.id === menus.music.current, () => { menus.music.set(o.id); this._closeChooser(); }));
      else if (kind === "skin" && menus.skin) menus.skin.options.forEach(o => btn(o.name, o.id === menus.skin.current, () => { menus.skin.set(o.id); this._closeChooser(); }));
      else if (kind === "control" && menus.control) {
        const c = menus.control;
        if (c.profiles) { label("Layout"); c.profiles.forEach(o => btn(o.name, o.id === c.profile, () => { c.setProfile(o.id); this._refreshTouchLayout(); const g = this._game; requestAnimationFrame(() => { if (g && g.resize) g.resize(this._cssW, this._cssH, this._touchInset()); }); this._renderChooser(); })); }
        if (c.toggles) { label("Options"); c.toggles.forEach(t => btn(t.name + (t.on ? "   ✓" : "   ✕"), t.on, () => { t.set(!t.on); this._renderChooser(); })); }
      } else this._closeChooser();
    }

    // ---------------- DOM wiring ----------------
    _wireChrome() {
      this.refs.backBtn.addEventListener("click", () => this.showMenu());
      if (this.refs.pauseBtn) this.refs.pauseBtn.addEventListener("click", () => { if (!this._over) this.togglePause(); });
      if (this.refs.controlBtn) this.refs.controlBtn.addEventListener("click", () => this._openChooser("control"));
      this.refs.soundBtn.addEventListener("click", () => {
        this.audio.unlock();
        this.audio.toggleMuted();
        this._updateSoundIcon();
        if (!this.audio.muted) this.audio.play("select");
      });
      this.refs.themeBtn.addEventListener("click", () => { const m = this._gameMenus(); if (m && m.skin) this._openChooser("skin"); else this.cycleTheme(); });
      this.refs.musicBtn.addEventListener("click", () => { this.audio.unlock(); const m = this._gameMenus(); if (m && m.music) this._openChooser("music"); else this.cycleMusic(); });
      this.refs.devBtn.addEventListener("click", () => this.toggleDev());
    }

    _wireOverlays() {
      const handle = (el) => {
        el.querySelectorAll("[data-action]").forEach(btn => {
          btn.addEventListener("click", () => {
            switch (btn.getAttribute("data-action")) {
              case "resume":  this.togglePause(false); break;
              case "restart": this.restartGame(); break;
              case "theme":   this.cycleTheme(); break;
              case "quit":    this.showMenu(); break;
              case "closeChooser": this._closeChooser(); break;
            }
          });
        });
      };
      handle(this.refs.pauseOverlay);
      handle(this.refs.gameoverOverlay);
      handle(this.refs.chooserOverlay);
    }

    _wireGlobalKeys() {
      // Shell-level keys (pause / mute / theme). Game keys are handled
      // separately by the game via the Input manager.
      window.addEventListener("keydown", (e) => {
        if (this.refs.menu && !this.refs.menu.classList.contains("hidden")) return;
        if (e.code === "KeyM") { this.audio.toggleMuted(); this._updateSoundIcon(); }
        else if (e.code === "KeyT") { if (this._over) return; this.cycleTheme(); }
        else if (e.code === "KeyN") { if (this._over) return; this.cycleMusic(); }
        else if (e.code === "Escape" || e.code === "KeyP") {
          if (this._over) return;
          e.preventDefault();
          this.togglePause();
        }
      });
    }

    _wireTouch() {
      const map = {
        left: "ArrowLeft", right: "ArrowRight", soft: "ArrowDown",
        hard: "Space", cw: "ArrowUp", ccw: "KeyZ", hold: "KeyC"
      };
      this.refs.touchControls.querySelectorAll(".tc-btn").forEach(btn => {
        const code = map[btn.getAttribute("data-act")];
        if (!code) return;
        const press = (ev) => {
          ev.preventDefault();
          this.audio.unlock();
          this.input._keys.add(code);
          this.input._down.forEach(fn => fn(code, { code }, false));
        };
        const release = (ev) => {
          ev.preventDefault();
          this.input._keys.delete(code);
          this.input._up.forEach(fn => fn(code, { code }));
        };
        btn.addEventListener("touchstart", press, { passive: false });
        btn.addEventListener("touchend", release, { passive: false });
        btn.addEventListener("touchcancel", release, { passive: false });
      });
    }

    _updateSoundIcon() {
      this.refs.soundBtn.textContent = this.audio.muted ? "🔇" : "🔊";
    }

    // Relabel the shared touch bar per game; a "" label hides that button.
    _applyTouchLabels(game) {
      const labels = game && game.touchLabels;
      this.refs.touchControls.querySelectorAll(".tc-btn").forEach(b => {
        b.style.display = "";   // clear any inline display left by a previous game so CSS/grid rules apply cleanly
        const act = b.getAttribute("data-act");
        const lbl = (labels && Object.prototype.hasOwnProperty.call(labels, act)) ? labels[act] : this._touchDefaults[act];
        b.textContent = lbl;    // always set (clears stale text on hidden buttons too)
        if (lbl === "") b.style.display = "none";
      });
    }

    // ---------------- Sizing ----------------
    _resize() {
      const rect = this.refs.gameView.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this._cssW = Math.max(1, Math.floor(rect.width));
      this._cssH = Math.max(1, Math.floor(rect.height));
      this.canvas.width = Math.floor(this._cssW * dpr);
      this.canvas.height = Math.floor(this._cssH * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this._game && this._game.resize) this._game.resize(this._cssW, this._cssH, this._touchInset());
    }

    // ---------------- helpers ----------------
    _show(el) { if (el) el.classList.remove("hidden"); }
    _hide(el) { if (el) el.classList.add("hidden"); }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  Arcade.GameShell = GameShell;
})(window.Arcade = window.Arcade || {});
