/* Asteroids module manifest. */
(function (Arcade) {
  "use strict";
  Arcade.registerGame({
    id: "asteroids",
    name: "Asteroids",
    tagline: "Blast rocks. Don't become one.",
    icon: "🚀",
    accent: "#b48bff",
    create: function (context) { return new Arcade.Asteroids.Game(context); }
  });
})(window.Arcade = window.Arcade || {});
