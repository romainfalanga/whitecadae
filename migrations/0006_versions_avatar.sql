-- Système de versions : chaque nouvelle interprétation (ou modification d'une
-- interprétation existante) est un brouillon privé, visible uniquement par son
-- auteur, jusqu'à ce qu'il publie une nouvelle version depuis sa page profil.
-- Les lignes déjà présentes avant cette migration sont considérées publiées
-- (is_published = 1 par défaut) pour ne pas faire disparaître le contenu existant.

CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_versions_user ON versions(user_id, number);

ALTER TABLE annotations ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE annotations ADD COLUMN version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL;

ALTER TABLE essays ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE essays ADD COLUMN version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL;

-- Photo de profil : stockée directement en base (recadrée/compressée côté
-- client avant l'envoi), servie via /api/users/:username/avatar.
ALTER TABLE users ADD COLUMN avatar_data TEXT;
ALTER TABLE users ADD COLUMN avatar_mime TEXT;
