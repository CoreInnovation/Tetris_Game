/* Missile Defense module manifest. */
(function (Arcade) {
  "use strict";
  Arcade.registerGame({
    id: "missile",
    name: "Missile Defense",
    tagline: "Aim. Intercept. Save the cities.",
    icon: "🛰️",
    accent: "#46f0c0",
    create: function (context) { return new Arcade.Missile.Game(context); }
  });
})(window.Arcade = window.Arcade || {});
