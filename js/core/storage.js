/* =========================================================
   Storage — namespaced localStorage wrapper with JSON +
   graceful fallback (so the game still runs if storage is
   blocked, e.g. some file:// / private-mode situations).
   ========================================================= */
(function (Arcade) {
  "use strict";

  const PREFIX = "arcade:";

  class Storage {
    constructor() {
      this._mem = {};            // in-memory fallback
      this._ok = this._probe();
    }

    _probe() {
      try {
        const k = PREFIX + "__probe__";
        window.localStorage.setItem(k, "1");
        window.localStorage.removeItem(k);
        return true;
      } catch (_) {
        return false;
      }
    }

    get(key, fallback) {
      const full = PREFIX + key;
      try {
        const raw = this._ok ? window.localStorage.getItem(full) : this._mem[full];
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    }

    set(key, value) {
      const full = PREFIX + key;
      const raw = JSON.stringify(value);
      try {
        if (this._ok) window.localStorage.setItem(full, raw);
        else this._mem[full] = raw;
      } catch (_) {
        this._mem[full] = raw; // last-ditch fallback
      }
    }

    // High scores are kept SEPARATELY per device ("touch" vs "desktop") — touch and
    // keyboard/mouse play very differently. Desktop uses the legacy key (no suffix) so
    // existing records are preserved as desktop scores; touch gets its own ":touch" key.
    _hsKey(gameId, device) { return "highscore:" + gameId + (device === "touch" ? ":touch" : ""); }

    /** Convenience for per-game, per-device high scores. */
    getHighScore(gameId, device) { return this.get(this._hsKey(gameId, device), 0); }

    /** Stores only if higher (for that device). Returns true if it was a new record. */
    setHighScore(gameId, score, device) {
      const best = this.getHighScore(gameId, device);
      if (score > best) {
        this.set(this._hsKey(gameId, device), score);
        return true;
      }
      return false;
    }
  }

  Arcade.Storage = Storage;
})(window.Arcade = window.Arcade || {});
