/* =========================================================
   Missile Defense themes. Classic = retro vector; Modern = neon
   with glow, gradient sky, and heavy explosion bloom.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const CLASSIC = {
    id: "classic",
    name: "Classic",
    palette: {
      ground: "#39d353", city: "#36c5f0", battery: "#ffd24d", ammo: "#eaeaf0",
      enemy: "#ff5a5a", enemyHead: "#ffd0d0", interceptor: "#9affff", target: "#ffffff",
      blast: "#ffcf57", crosshair: "#ffffff", text: "#eaeaf0", textDim: "#8a8aa0",
      accent: "#ffd24d", bg1: "#04060a", bg2: "#04060a", rubble: "#5a5a66"
    },
    effects: { glow: false, particles: true, shake: false, scanlines: true, bgAnim: false },
    fonts: { ui: '"Consolas","Courier New",monospace' }
  };

  const MODERN = {
    id: "modern",
    name: "Modern Neon",
    palette: {
      ground: "#46f0a0", city: "#5ad1ff", battery: "#ffd24d", ammo: "#cfe6ff",
      enemy: "#ff4d6d", enemyHead: "#ffd0dd", interceptor: "#7affe0", target: "#ffffff",
      blast: "#ffd66b", crosshair: "#8affff", text: "#f0f4ff", textDim: "#9aa6c8",
      accent: "#46f0c0", bg1: "#05071a", bg2: "#0c0822", rubble: "#4a4a5a"
    },
    effects: { glow: true, particles: true, shake: true, scanlines: false, bgAnim: true },
    fonts: { ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif' }
  };

  // "Warhead" — interceptors render as real rockets with exhaust plumes.
  const WARHEAD = {
    id: "warhead",
    name: "Warhead",
    palette: {
      ground: "#2f5d3a", city: "#7fd0ff", battery: "#b9c2cc", ammo: "#eaf2ff",
      enemy: "#ff5a4d", enemyHead: "#ffd2cc", interceptor: "#e8eef7", target: "#ffffff",
      blast: "#ffce5e", crosshair: "#9fe8ff", text: "#eaf2ff", textDim: "#9aa6c8",
      accent: "#ffb43a", bg1: "#0a1422", bg2: "#06101c", rubble: "#4a4a5a",
      body: "#e2e9f3", exhaust: "#ffb43a", exhaust2: "#fff2ac"
    },
    missileStyle: "rocket", exhaust: true,
    effects: { glow: true, particles: true, shake: true, scanlines: false, bgAnim: true },
    fonts: { ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif' }
  };

  Arcade.Missile = Arcade.Missile || {};
  Arcade.Missile.Themes = [CLASSIC, MODERN, WARHEAD];
  Arcade.Missile.getTheme = function (id) {
    return Arcade.Missile.Themes.find(t => t.id === id) || Arcade.Missile.Themes[0];
  };
})(window.Arcade = window.Arcade || {});
