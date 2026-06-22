/* DEADGRID module manifest. */
(function (Arcade) {
  "use strict";
  Arcade.registerGame({
    id: "zombies",
    name: "DEADGRID",
    tagline: "One diamond of dirt. A thousand hungry idiots. Don't stop moving.",
    icon: "🧟",
    accent: "#39ffd0",
    create: function (context) { return new Arcade.Zombies.Game(context); }
  });
})(window.Arcade = window.Arcade || {});
