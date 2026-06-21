/* =========================================================
   Asteroids themes. Classic = white vector-on-black (authentic);
   Modern = neon glow + starfield + heavy particles.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const CLASSIC = {
    id: "classic",
    name: "Classic",
    palette: {
      ship: "#eaeaf0", thrust: "#ff8c2a", bullet: "#ffffff", asteroid: "#c8c8d2",
      ufo: "#9affba", text: "#eaeaf0", textDim: "#8a8aa0", accent: "#e8c000",
      bg1: "#000000", bg2: "#000000", star: "#ffffff"
    },
    lineWidth: 2,
    effects: { glow: false, particles: true, shake: false, scanlines: true, starfield: false, bgAnim: false },
    fonts: { ui: '"Consolas","Courier New",monospace' }
  };

  const MODERN = {
    id: "modern",
    name: "Modern Neon",
    palette: {
      ship: "#5ad1ff", thrust: "#ffd24d", bullet: "#46f0c0", asteroid: "#b48bff",
      ufo: "#ff5ad1", text: "#f0f4ff", textDim: "#9aa6c8", accent: "#46f0c0",
      bg1: "#05060f", bg2: "#0b0a1e", star: "#bcd0ff"
    },
    lineWidth: 2.5,
    effects: { glow: true, particles: true, shake: true, scanlines: false, starfield: true, bgAnim: true },
    fonts: { ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif' }
  };

  Arcade.Asteroids = Arcade.Asteroids || {};
  Arcade.Asteroids.Themes = [CLASSIC, MODERN];
  Arcade.Asteroids.getTheme = function (id) {
    return Arcade.Asteroids.Themes.find(t => t.id === id) || Arcade.Asteroids.Themes[0];
  };
})(window.Arcade = window.Arcade || {});
