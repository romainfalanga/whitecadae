-- WhiteCadae — schéma de la base D1

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  youtube_url TEXT
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

-- Une annotation cible :
--   - la chanson entière : line_id NULL
--   - une ligne (phrase)  : line_id renseigné, word_start NULL
--   - un mot ou un groupe de mots : line_id + word_start..word_end
--     (indices de mots dans la ligne, en commençant à 0)
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  word_start INTEGER,
  word_end INTEGER,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_annotations_song ON annotations(song_id);
CREATE INDEX IF NOT EXISTS idx_annotations_line ON annotations(line_id);

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
