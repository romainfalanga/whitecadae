-- Migration 0004 — interprétations d'ensemble avec connexions entre blocs
-- (appliquée le 2026-08-05 ; le schéma complet à jour reste schema.sql)

CREATE TABLE IF NOT EXISTS essays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_essays_song ON essays(song_id);

CREATE TABLE IF NOT EXISTS essay_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  essay_id INTEGER NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  from_line_id INTEGER NOT NULL REFERENCES lyric_lines(id) ON DELETE CASCADE,
  from_word_start INTEGER,
  from_word_end INTEGER,
  to_line_id INTEGER NOT NULL REFERENCES lyric_lines(id) ON DELETE CASCADE,
  to_word_start INTEGER,
  to_word_end INTEGER,
  note TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_essay_links_essay ON essay_links(essay_id);
