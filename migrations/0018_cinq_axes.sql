-- Les cinq axes. Aux deux troncs (le moi harmonieux, la société harmonieuse)
-- s'en ajoutent trois : la psychologie, la philosophie et les univers.
--
-- La psychologie est le miroir du moi harmonieux : elle dit le présent, il dit
-- ce vers quoi il tend. Les univers sont le seul axe public de la plateforme :
-- un modèle d'univers ne vaut que confronté aux autres.
--
-- Rien à ajouter sur reflection_trees : `axe` et `carre_id` existent déjà, et
-- les nouveaux axes sont des valeurs de plus. Il ne manque que les index qui
-- garantissent l'unicité de chaque tronc, et la table où chacun se situe.
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

-- Dans un carré : une psychologie par As, comme le moi ; une philosophie et
-- des univers pour les quatre, comme la société. Index partiels : chacun naît
-- avant le premier arbre de son axe, aucun conflit n'est donc possible sur une
-- base en service.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_psy
  ON reflection_trees(carre_id, user_id, axe)
  WHERE carre_id IS NOT NULL AND axe = 'psy';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_philo
  ON reflection_trees(carre_id, axe)
  WHERE carre_id IS NOT NULL AND axe = 'philo';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_univers
  ON reflection_trees(carre_id, axe)
  WHERE carre_id IS NOT NULL AND axe = 'univers';

-- la galerie des univers lit tous les troncs publics d'un outil
CREATE INDEX IF NOT EXISTS idx_trees_axe ON reflection_trees(axe, kind);

-- Se situer soi-même, au recrutement : dans les quatre connaissances, la
-- meilleure vaut 10 et les trois autres se lisent par rapport à elle. La note
-- ne dit pas ce qu'on vaut face aux autres, elle dit où l'on est le meilleur.
CREATE TABLE IF NOT EXISTS carre_auto_notes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domaine TEXT NOT NULL,
  note INTEGER NOT NULL CHECK (note BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, domaine)
);
