-- WhiteCadae — schéma de la base D1

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Photo de profil : recadrée/compressée côté client, stockée en base et
  -- servie via /api/users/:username/avatar.
  avatar_data TEXT,
  avatar_mime TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Un "album" peut aussi représenter un single (is_single = 1).
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  release_date TEXT,
  is_single INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  track_number INTEGER,
  youtube_url TEXT,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album_id);

-- Chaque ligne de texte d'une chanson. Les lignes vides matérialisent
-- les séparations de strophes.
CREATE TABLE IF NOT EXISTS lyric_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lines_song ON lyric_lines(song_id, line_number);

-- Une version regroupe, à un instant donné, l'ensemble des brouillons qu'un
-- membre choisit de rendre publics (annotations + interprétations d'ensemble).
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_versions_user ON versions(user_id, number);

-- Une annotation (interprétation) cible, selon target_type :
--   - 'song'     : la chanson entière (line_id NULL)
--   - 'title'    : le titre de la chanson (line_id NULL)
--   - 'duration' : la durée de la chanson (line_id NULL)
--   - 'line'     : une ligne (phrase) — line_id renseigné, word_start NULL
--   - 'word'     : un mot ou groupe de mots — line_id + word_start..word_end
--     (indices de mots dans la ligne, en commençant à 0)
--   - 'passage'  : de (line_id, word_start) à (end_line_id, word_end),
--     le début et la fin pouvant tomber au milieu d'une phrase
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'song',
  line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  word_start INTEGER,
  word_end INTEGER,
  end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  -- Système de versions : une nouvelle interprétation (ou une modification)
  -- est un brouillon privé (is_published = 0) jusqu'à ce que son auteur
  -- publie une nouvelle version depuis sa page profil.
  is_published INTEGER NOT NULL DEFAULT 0,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_annotations_song ON annotations(song_id);
CREATE INDEX IF NOT EXISTS idx_annotations_line ON annotations(line_id);

-- Références jointes à une interprétation : ce à quoi le passage fait
-- référence selon l'auteur — libre (label + lien optionnel) ou interne
-- (un passage d'un autre morceau : ref_song_id + ref_line_id..ref_end_line_id).
CREATE TABLE IF NOT EXISTS annotation_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  url TEXT,
  ref_song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
  ref_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  ref_end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refs_annotation ON annotation_references(annotation_id);

-- Connexion entre deux chansons, avec l'explication du lien.
CREATE TABLE IF NOT EXISTS song_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_a_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  song_b_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_connections_a ON song_connections(song_a_id);
CREATE INDEX IF NOT EXISTS idx_connections_b ON song_connections(song_b_id);

-- Interprétation d'ensemble d'un morceau : un texte global, justifié par
-- des connexions entre blocs (phrase entière ou groupe de mots), y compris
-- entre des morceaux différents.
CREATE TABLE IF NOT EXISTS essays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL
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

-- Favoris (♥) sur une interprétation ('annotation'), une connexion
-- ('connection') ou une interprétation d'ensemble ('essay').
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_target ON favorites(target_kind, target_id);

-- Commentaires sous une interprétation ou une connexion.
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_kind, target_id);
