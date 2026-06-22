/* =========================================================
   DEADGRID themes. Two skins:
   - Boneyard CRT (retro): dusty asphalt, dried blood, amber/green
     phosphor, scanlines + vignette, no glow.
   - Neon Overdrive (modern): glowing magenta grid, cyan hero,
     synthwave fog, glow + vignette.
   Each theme also carries iso config (diamond tile size).
   ========================================================= */
(function (Arcade) {
  "use strict";

  const RETRO = {
    id: "retro",
    name: "Boneyard CRT",
    palette: {
      ground1: "#3a3128", ground2: "#2c251d", gridLine: "#5a4a2e",
      player: "#e8c66a", playerAccent: "#9bd14a", zombie: "#7a8c4a",
      blood: "#7a1f17", bullet: "#ffe08a",
      text: "#f2d98a", textDim: "#8a7a4a", accent: "#9bd14a", danger: "#c4452a",
      bg1: "#1a1610", bg2: "#0d0b07", star: "#5a4a2e"
    },
    lineWidth: 2,
    iso: { tile: 64 },
    effects: { glow: false, particles: true, shake: true, scanlines: true, vignette: true, gridGlow: false, permaDecals: true },
    fonts: { ui: '"Consolas","Courier New",monospace' }
  };

  const MODERN = {
    id: "modern",
    name: "Neon Overdrive",
    palette: {
      ground1: "#1a0f2e", ground2: "#120a22", gridLine: "#ff2d95",
      player: "#22e0ff", playerAccent: "#ffffff", zombie: "#b042ff",
      blood: "#ff2d6b", bullet: "#fff27a",
      text: "#eafcff", textDim: "#6b7fb0", accent: "#39ffd0", danger: "#ff2d6b",
      bg1: "#0a0618", bg2: "#03020a", star: "#3a2a6a"
    },
    lineWidth: 2.5,
    iso: { tile: 64 },
    effects: { glow: true, particles: true, shake: true, scanlines: false, vignette: true, gridGlow: true, permaDecals: false },
    fonts: { ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif' }
  };

  Arcade.Zombies = Arcade.Zombies || {};
  Arcade.Zombies.Themes = [RETRO, MODERN];
  Arcade.Zombies.getTheme = function (id) {
    return Arcade.Zombies.Themes.find(t => t.id === id) || Arcade.Zombies.Themes[0];
  };
})(window.Arcade = window.Arcade || {});
