-- Chaque présent est le futur de plusieurs passés : les liens de nourriture
-- entre branches, la conversation privée des carrés, la récolte des
-- brainstorms. (Le Worker crée aussi tout cela de lui-même au premier
-- passage : cette migration est le chemin propre.)

CREATE TABLE IF NOT EXISTS reflection_branch_links (
  branch_id INTEGER NOT NULL REFERENCES reflection_branches(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES reflection_branches(id) ON DELETE CASCADE,
  PRIMARY KEY (branch_id, source_id)
);

CREATE TABLE IF NOT EXISTS carre_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carre_messages ON carre_messages(carre_id, id);

-- `retenue` sur brainstorm_idees : le Worker l'ajoute de lui-même si la
-- colonne manque (ALTER guidé par PRAGMA) : ne pas la doubler ici, un ALTER
-- échouerait sur une base où il est déjà passé.
