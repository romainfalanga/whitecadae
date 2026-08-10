-- Le carré d'as devient pluriel : un As peut appartenir à plusieurs carrés.
-- La clé de carre_membres passe de user_id seul au couple (carre_id, user_id).
-- Le carré gagne un cap et un salon (Discord), le brainstorm gagne son hôte,
-- et deux organes nouveaux arrivent : l'évaluation mutuelle par domaine, et
-- le relatif (l'IA du carré, nourrie des arbres offerts par ses As).
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage, y compris
-- la reconstruction de carre_membres : cette migration est le chemin propre.)

CREATE TABLE IF NOT EXISTS carre_membres_v2 (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  role TEXT,
  domaine TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (carre_id, user_id)
);
INSERT INTO carre_membres_v2 (user_id, carre_id, role, domaine, joined_at)
  SELECT user_id, carre_id, role, domaine, joined_at FROM carre_membres;
DROP TABLE carre_membres;
ALTER TABLE carre_membres_v2 RENAME TO carre_membres;
CREATE INDEX IF NOT EXISTS idx_carre_membres ON carre_membres(carre_id);
CREATE INDEX IF NOT EXISTS idx_carre_membres_user ON carre_membres(user_id);

ALTER TABLE carres ADD COLUMN cap TEXT NOT NULL DEFAULT '';
ALTER TABLE carres ADD COLUMN discord_url TEXT NOT NULL DEFAULT '';
ALTER TABLE brainstorms ADD COLUMN hote_user_id INTEGER;

-- L'évaluation mutuelle : dans chaque domaine, le meilleur du carré vaut 10
-- et les autres notes se lisent par rapport à lui. Jamais figées.
CREATE TABLE IF NOT EXISTS carre_notes (
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  rateur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cible_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domaine TEXT NOT NULL,
  note INTEGER NOT NULL CHECK (note BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (carre_id, rateur_id, cible_id, domaine)
);

-- Le relatif : ses échanges, et les arbres de pensée que chaque As a choisi
-- de lui offrir (consentement explicite, arbre par arbre).
CREATE TABLE IF NOT EXISTS carre_relatif_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voix TEXT NOT NULL,
  question TEXT NOT NULL,
  reponse TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_relatif_carre ON carre_relatif_messages(carre_id, id);

CREATE TABLE IF NOT EXISTS carre_relatif_sources (
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tree_id INTEGER NOT NULL REFERENCES reflection_trees(id) ON DELETE CASCADE,
  PRIMARY KEY (carre_id, user_id, tree_id)
);

-- La Psychologie devient la Philosophie parmi les quatre connaissances.
UPDATE carre_membres SET domaine = 'Philosophie' WHERE domaine = 'Psychologie';
UPDATE carre_annonces SET domaine = 'Philosophie' WHERE domaine = 'Psychologie';
