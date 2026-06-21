/* =========================================================
   Dr. Quackers module manifest. Registers the game so the shell
   builds a menu card for it automatically.
   ========================================================= */
(function (Arcade) {
  "use strict";

  Arcade.registerGame({
    id: "drmario",
    name: "Dr. Quackers",
    tagline: "Bonk the germs with pills!",
    icon: "💊",
    accent: "#46f0c0",
    create: function (context) { return new Arcade.DrMario.Game(context); }
  });
})(window.Arcade = window.Arcade || {});
