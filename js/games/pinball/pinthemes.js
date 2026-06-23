/* =========================================================
   Space Pinball themes. Original space-cadet-style homage (not the
   copyrighted Microsoft table/art). Classic = clean metal; Modern
   = neon glow + particles.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const CLASSIC = {
    id: "classic",
    name: "Classic",
    palette: {
      bg1: "#0a0c14", bg2: "#0a0c14", table: "#12162400",
      wall: "#c8d0e0", ball: "#e8ecf4", ballShade: "#8a90a0",
      bumper: "#ff6b3d", bumperHit: "#ffd24d", sling: "#46c8ff",
      flipper: "#ffd24d", plunger: "#9aff9a", lane: "#2a3145",
      text: "#eaeef6", textDim: "#8a90a8", accent: "#ffd24d", star: "#ffffff",
      // new elements
      spinner: "#9ad8ff", tunnel: "#b06bff", tunnelExit: "#ff8a3a", lock: "#46f0c0",
      magnet: "#ff5a8a", standup: "#7aa6ff", standupLit: "#ffd24d", ramp: "#5ad1ff",
      post: "#c8d0e0", rollOn: "#ffd24d", rollOffc: "#3a4358",
      kick: "#9aff6a", danger: "#ff5a6e"
    },
    effects: { glow: false, particles: true, shake: false, scanlines: true, bgAnim: false, trail: false },
    fonts: { ui: '"Consolas","Courier New",monospace' }
  };

  const MODERN = {
    id: "modern",
    name: "Modern Neon",
    palette: {
      bg1: "#05060f", bg2: "#0b0a1e", table: "#0a0e2033",
      wall: "#5ad1ff", ball: "#ffffff", ballShade: "#7aa6ff",
      bumper: "#ff5ad1", bumperHit: "#fff14d", sling: "#46f0c0",
      flipper: "#ffd24d", plunger: "#9aff6a", lane: "#141a33",
      text: "#f0f4ff", textDim: "#9aa6c8", accent: "#46f0c0", star: "#bcd0ff",
      spinner: "#9ad8ff", tunnel: "#c86bff", tunnelExit: "#ff9a3a", lock: "#46f0c0",
      magnet: "#ff5a8a", standup: "#7aa6ff", standupLit: "#fff14d", ramp: "#5ad1ff",
      post: "#9ab0d8", rollOn: "#fff14d", rollOffc: "#26304d",
      kick: "#9aff6a", danger: "#ff5a6e"
    },
    effects: { glow: true, particles: true, shake: true, scanlines: false, bgAnim: true, trail: true },
    fonts: { ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif' }
  };

  Arcade.Pinball = Arcade.Pinball || {};
  Arcade.Pinball.Themes = [CLASSIC, MODERN];
  Arcade.Pinball.getTheme = function (id) {
    return Arcade.Pinball.Themes.find(t => t.id === id) || Arcade.Pinball.Themes[0];
  };
})(window.Arcade = window.Arcade || {});
