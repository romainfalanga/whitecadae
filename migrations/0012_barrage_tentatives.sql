-- Barrage des tentatives de connexion et d'inscription (par adresse).
CREATE TABLE IF NOT EXISTS auth_attempts (
  cle TEXT PRIMARY KEY,
  compte INTEGER NOT NULL DEFAULT 0,
  fenetre TEXT NOT NULL DEFAULT (datetime('now'))
);
