-- Le carré d'as devient un atelier : quatre As qui imaginent ENSEMBLE des
-- sociétés harmonieuses. Chaque société a un nom et se pense sur deux
-- volets : ce qui lui permet d'être ('etre'), et comment les humains s'y
-- comporteraient ('vivre').
--
-- Et Pense Mieux se resserre sur quatre branches : le multivers s'en va.
-- Rien n'est détruit : le tronc « Mon multivers » vide s'efface (une
-- coquille créée d'avance), celui qui porte quelque chose devient une
-- catégorie sans attache, lisible et rangeable comme avant.
--
-- Le Worker répare aussi ce schéma de lui-même (ensureHautesTables) : cette
-- migration est le même geste, pour les bases qu'on migre à la main.

CREATE TABLE IF NOT EXISTS carre_societes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  creee_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_societes_carre ON carre_societes(carre_id, updated_at);

CREATE TABLE IF NOT EXISTS societe_idees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  societe_id INTEGER NOT NULL REFERENCES carre_societes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  volet TEXT NOT NULL CHECK (volet IN ('etre', 'vivre')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idees_societe ON societe_idees(societe_id, volet, id);

-- le lien d'un brainstorm vers la société qu'il imagine
ALTER TABLE brainstorms ADD COLUMN societe_id INTEGER;

-- le multivers quitte Pense Mieux : quatre branches restent
DELETE FROM reflection_trees
 WHERE axe = 'univers' AND trunk = ''
   AND id NOT IN (SELECT tree_id FROM reflection_branches)
   AND id NOT IN (SELECT parent_id FROM reflection_trees WHERE parent_id IS NOT NULL);
UPDATE reflection_trees SET axe = NULL, genre = 'categorie', parent_id = NULL
 WHERE axe = 'univers';
