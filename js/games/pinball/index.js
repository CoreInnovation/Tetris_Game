/* Space Pinball module manifest. */
(function (Arcade) {
  "use strict";
  Arcade.registerGame({
    id: "pinball",
    name: "Space Pinball",
    tagline: "Flip. Bump. Multiball!",
    icon: "🪐",
    accent: "#46f0c0",
    create: function (context) { return new Arcade.Pinball.Game(context); }
  });
})(window.Arcade = window.Arcade || {});
