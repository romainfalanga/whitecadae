-- Les pièces hautes : conversation (échelon 2), arbres de réflexion
-- (Pense Mieux 3, Vidéographie 4), carrés d'as (5), brainstorms (6).
-- Toutes ces tables se créent aussi d'elles-mêmes au premier passage du
-- Worker (ensureHautesTables) : cette migration est le chemin propre.

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  min_echelon INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_created ON conversation_messages(created_at);

CREATE TABLE IF NOT EXISTS reflection_trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  trunk TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trees_user ON reflection_trees(user_id, kind);

CREATE TABLE IF NOT EXISTS reflection_branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL REFERENCES reflection_trees(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES reflection_branches(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_branches_tree ON reflection_branches(tree_id);

CREATE TABLE IF NOT EXISTS carres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carre_membres (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  role TEXT,
  domaine TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carre_membres ON carre_membres(carre_id);

CREATE TABLE IF NOT EXISTS brainstorms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sujet TEXT NOT NULL,
  plateforme TEXT NOT NULL,
  url TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'annonce',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  live_depuis TEXT
);
CREATE INDEX IF NOT EXISTS idx_brainstorms_statut ON brainstorms(statut, created_at);

CREATE TABLE IF NOT EXISTS brainstorm_idees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brainstorm_id INTEGER NOT NULL REFERENCES brainstorms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idees_brainstorm ON brainstorm_idees(brainstorm_id, created_at);

CREATE TABLE IF NOT EXISTS brainstorm_votes (
  idee_id INTEGER NOT NULL REFERENCES brainstorm_idees(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (idee_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_idee ON brainstorm_votes(idee_id, created_at);
