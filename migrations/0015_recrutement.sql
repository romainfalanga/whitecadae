-- Le salon de recrutement des carrés : les As libres s'annoncent, les carrés
-- incomplets invitent, l'invité accepte ou décline. (Le Worker crée aussi ces
-- tables de lui-même au premier passage.)

CREATE TABLE IF NOT EXISTS carre_annonces (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  role TEXT,
  domaine TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carre_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  de_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (carre_id, user_id)
);
