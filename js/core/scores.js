/* =========================================================
   Arcade.Scores — shared online leaderboards client.
   Talks HTTP to the same Cloudflare Worker as Arcade.Net
   (derives the https:// base from the wss:// net URL).
   All calls fail soft (return empty/null) so offline play is
   never affected.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const Scores = {
    base() {
      const u = (Arcade.Net && Arcade.Net.url && Arcade.Net.url()) || "";
      if (!u) return "";
      return u.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/+$/, "");
    },
    configured() { return !!this.base(); },

    // submit(game, name, score, device) -> Promise<{ok, rank}|null>
    submit(game, name, score, device) {
      const base = this.base(); if (!base) return Promise.resolve(null);
      return fetch(base + "/score", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: game, name: name, score: Math.floor(score) || 0, device: device || "desktop" })
      }).then(r => r.json()).catch(() => null);
    },

    // top(game, n, device) -> Promise<[{name, score}]>
    top(game, n, device) {
      const base = this.base(); if (!base) return Promise.resolve([]);
      const q = "?game=" + encodeURIComponent(game) + "&n=" + (n || 10) + "&device=" + (device || "desktop");
      return fetch(base + "/top" + q).then(r => r.json()).then(d => (d && d.scores) || []).catch(() => []);
    }
  };

  Arcade.Scores = Scores;
})(window.Arcade = window.Arcade || {});
