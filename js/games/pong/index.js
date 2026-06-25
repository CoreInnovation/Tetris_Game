/* =========================================================
   Pong module manifest — registers the game so the shell builds
   a menu card for it automatically.
   ========================================================= */
(function (Arcade) {
  "use strict";

  Arcade.registerGame({
    id: "pong",
    name: "Pong",
    tagline: "Rally the CPU. Don't blink.",
    icon: "🏓",
    accent: "#5ad1ff",
    multiplayer: true,
    create: function (context) { return new Arcade.Pong.Game(context); }
  });
})(window.Arcade = window.Arcade || {});
