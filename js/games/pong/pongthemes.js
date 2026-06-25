/* =========================================================
   Pong skins. Vertical court: player paddle bottom, CPU top,
   both slide HORIZONTALLY; ball bounces top/bottom.
   3 looks: Modern Neon, Old School (CRT), Mad Max (rust).
   ========================================================= */
(function (Arcade) {
  "use strict";

  const MODERN = {
    id: "modern", name: "Modern Neon",
    palette: {
      bg1: "#0a0a18", bg2: "#10142e",
      wall: "rgba(120,180,255,0.30)", net: "rgba(120,180,255,0.30)",
      player: "#46f0c0", cpu: "#ff5a8a", ball: "#ffffff",
      text: "#f0f4ff", textDim: "#9aa6c8", accent: "#5ad1ff", danger: "#ff4d6d"
    },
    bg: { type: "animated" },
    ball: "circle",
    effects: { glow: true, particles: true, shake: true, scanlines: false, trail: true, bgAnim: true },
    fonts: { ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif', score: '"Segoe UI",system-ui,sans-serif' }
  };

  const CLASSIC = {
    id: "classic", name: "Old School",
    palette: {
      bg1: "#000000", bg2: "#000000",
      wall: "rgba(255,255,255,0.55)", net: "rgba(255,255,255,0.65)",
      player: "#ffffff", cpu: "#ffffff", ball: "#ffffff",
      text: "#ffffff", textDim: "rgba(255,255,255,0.6)", accent: "#ffffff", danger: "#ffffff"
    },
    bg: { type: "solid" },
    ball: "square",
    effects: { glow: false, particles: false, shake: false, scanlines: true, trail: false, bgAnim: false },
    fonts: { ui: '"Courier New",monospace', score: '"Courier New",monospace' }
  };

  const MADMAX = {
    id: "madmax", name: "Mad Max",
    palette: {
      bg1: "#2a1606", bg2: "#160a02",
      wall: "rgba(255,150,60,0.30)", net: "rgba(255,150,60,0.28)",
      player: "#e0a040", cpu: "#9a3b1b", ball: "#d6d2c4",
      text: "#ffd9a0", textDim: "#b98a55", accent: "#ff7a2a", danger: "#ff4a1a"
    },
    bg: { type: "dust" },
    ball: "saw",
    effects: { glow: true, particles: true, shake: true, scanlines: false, trail: true, bgAnim: true },
    fonts: { ui: '"Impact","Arial Black",system-ui,sans-serif', score: '"Impact","Arial Black",sans-serif' }
  };

  Arcade.Pong = Arcade.Pong || {};
  Arcade.Pong.Themes = [MODERN, CLASSIC, MADMAX];
  Arcade.Pong.getTheme = function (id) { return Arcade.Pong.Themes.find(t => t.id === id) || Arcade.Pong.Themes[0]; };
})(window.Arcade = window.Arcade || {});
