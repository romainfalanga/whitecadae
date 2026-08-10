-- Migration 0011 : les références deviennent des contributions à part entière
--
-- Jusqu'ici une référence était accrochée à une interprétation
-- (annotation_references.annotation_id NOT NULL) : impossible d'en poser une
-- sans écrire d'abord une interprétation. Or sur un passage donné, on peut
-- vouloir dire trois choses différentes et indépendantes :
--   - une interprétation (le plus fréquent),
--   - une référence à un passage d'un autre morceau,
--   - une référence à une œuvre extérieure.
--
-- Cette table porte les deux dernières, avec la même cible qu'une annotation.
-- annotation_references reste en place pour les références déjà saisies.

CREATE TABLE IF NOT EXISTS passage_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  -- cible, identique à celle d'une annotation
  target_type TEXT NOT NULL DEFAULT 'passage',
  line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  word_start INTEGER,
  word_end INTEGER,
  end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  -- 'internal' : un passage d'un morceau ; 'work' : une œuvre extérieure
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  artist TEXT,
  note TEXT,
  ref_song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
  ref_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  ref_end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_passage_refs_song ON passage_references(song_id);
CREATE INDEX IF NOT EXISTS idx_passage_refs_target ON passage_references(ref_song_id);
