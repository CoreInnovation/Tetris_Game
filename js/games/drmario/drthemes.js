/* =========================================================
   Dr. Quackers themes (skins). Same data-driven structure as the
   Tetris skins. Three play colors: R (red), Y (yellow), B (blue).
   ========================================================= */
(function (Arcade) {
  "use strict";

  const CLASSIC = {
    id: "classic",
    name: "Classic",
    palette: {
      R: "#e23030", Y: "#e8c000", B: "#3050e0",
      ghost: "rgba(255,255,255,0.16)",
      board: "#0c0c12", boardBorder: "#4a4a5a",
      glass: "rgba(180,200,255,0.04)",
      grid: "rgba(255,255,255,0.05)",
      panel: "#13131c", panelBorder: "#2a2a3a",
      text: "#e8e8f0", textDim: "#8a8aa0", accent: "#e8c000",
      eye: "#ffffff", pupil: "#111118"
    },
    bg: { type: "solid", colors: ["#08080c"] },
    block: "bevel",
    effects: { glow: false, particles: false, shake: false, scanlines: true, gridLines: true, bgAnim: false },
    fonts: { ui: '"Consolas","Courier New",monospace' }
  };

  const MODERN = {
    id: "modern",
    name: "Modern Neon",
    palette: {
      R: "#ff4d6d", Y: "#ffe14d", B: "#4d8bff",
      ghost: "rgba(255,255,255,0.10)",
      board: "rgba(10,12,24,0.5)", boardBorder: "rgba(120,180,255,0.35)",
      glass: "rgba(140,190,255,0.06)",
      grid: "rgba(255,255,255,0.045)",
      panel: "rgba(16,18,34,0.55)", panelBorder: "rgba(120,180,255,0.25)",
      text: "#f0f4ff", textDim: "#9aa6c8", accent: "#46f0c0",
      eye: "#ffffff", pupil: "#0a0a14"
    },
    bg: { type: "animated", colors: ["#0a0a18", "#10142e", "#06121f"] },
    block: "neon",
    effects: { glow: true, particles: true, shake: true, scanlines: false, gridLines: true, bgAnim: true },
    fonts: { ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif' }
  };

  Arcade.DrMario = Arcade.DrMario || {};
  Arcade.DrMario.Themes = [CLASSIC, MODERN];
  Arcade.DrMario.getTheme = function (id) {
    return Arcade.DrMario.Themes.find(t => t.id === id) || Arcade.DrMario.Themes[0];
  };
})(window.Arcade = window.Arcade || {});
