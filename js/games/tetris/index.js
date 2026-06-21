/* =========================================================
   Tetris module manifest. Registering here keeps the game's
   "card" metadata in one obvious place and is the template to
   copy when adding a new game module:

     1. Make a folder under js/games/<yourgame>/
     2. Implement a GameInstance (see gameshell.js for the contract)
     3. Add your <script> tags to index.html
     4. Call Arcade.registerGame({...}) like below
   The shell auto-builds a menu card for every registered game.
   ========================================================= */
(function (Arcade) {
  "use strict";

  Arcade.registerGame({
    id: "tetris",
    name: "Tetris",
    tagline: "Stack. Clear. Repeat.",
    icon: "🟦",
    accent: "#5ad1ff",
    create: function (context) { return new Arcade.Tetris.Game(context); }
  });
})(window.Arcade = window.Arcade || {});
