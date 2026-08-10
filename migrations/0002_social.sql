-- Migration 0002 : fonctionnalités sociales
-- (appliquée le 2026-08-05 ; le schéma complet à jour reste schema.sql)

ALTER TABLE songs ADD COLUMN duration_seconds INTEGER;

ALTER TABLE annotations ADD COLUMN target_type TEXT NOT NULL DEFAULT 'song';
UPDATE annotations SET target_type = CASE
  WHEN line_id IS NULL THEN 'song'
  WHEN word_start IS NULL THEN 'line'
  ELSE 'word' END;

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_target ON favorites(target_kind, target_id);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_kind, target_id);
