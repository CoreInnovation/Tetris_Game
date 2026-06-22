/* =========================================================
   Boot. Collects DOM refs and starts the arcade shell once
   the page is ready. All game modules have already registered
   themselves by the time this runs (load order in index.html).
   ========================================================= */
(function (Arcade) {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function boot() {
    const shell = new Arcade.GameShell();
    shell.init({
      menu: $("menu"),
      gameView: $("gameView"),
      gameGrid: $("gameGrid"),
      canvas: $("gameCanvas"),
      backBtn: $("backBtn"),
      pauseBtn: $("pauseBtn"),
      themeBtn: $("themeBtn"),
      musicBtn: $("musicBtn"),
      devBtn: $("devBtn"),
      soundBtn: $("soundBtn"),
      pauseOverlay: $("pauseOverlay"),
      gameoverOverlay: $("gameoverOverlay"),
      touchControls: $("touchControls"),
      goScore: $("goScore"),
      goBest: $("goBest"),
      goNew: $("goNew")
    });
    // Handy for debugging from the console.
    window.__arcade = shell;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.Arcade = window.Arcade || {});
