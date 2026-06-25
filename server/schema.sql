-- Shared leaderboards for the ChrisKit Arcade.
-- Apply once after creating the D1 database:
--   wrangler d1 execute chriskit-arcade --remote --file=./schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  game   TEXT    NOT NULL,
  name   TEXT    NOT NULL,
  score  INTEGER NOT NULL,
  device TEXT    NOT NULL DEFAULT 'desktop',   -- mobile vs desktop (separate boards, like local high scores)
  ts     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_board ON scores (game, device, score DESC);
