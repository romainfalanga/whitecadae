-- Les deux troncs : le moi harmonieux et la société harmonieuse. Ils existent
-- d'avance pour chacun, dans Pense Mieux et dans la Vidéographie, et dans
-- chaque carré : la société y est commune aux quatre, et chaque As y tient son
-- propre moi, lu par les trois autres.
--
-- Ce sont des arbres de réflexion comme les autres, marqués par `axe` et par
-- `carre_id` : ils héritent donc des branches emboîtées, des liens de
-- nourriture, du rendu et de la recherche, sans une ligne de moteur nouveau.
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

ALTER TABLE reflection_trees ADD COLUMN axe TEXT;
ALTER TABLE reflection_trees ADD COLUMN carre_id INTEGER;

-- L'auteur d'une branche. Il ne dit rien de plus que l'arbre chez une
-- personne ; dans l'arbre commun d'un carré, il dit qui parle, et il décide
-- qui peut retoucher ou couper.
ALTER TABLE reflection_branches ADD COLUMN user_id INTEGER;

-- Un seul moi et une seule société par personne et par outil ; dans un carré,
-- un moi par As et une seule société. Ces index sont partiels : au moment de
-- leur création aucun arbre ne porte d'axe, donc aucun conflit n'est possible
-- sur une base en service. Ils doivent venir APRÈS les ALTER ci-dessus.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_perso
  ON reflection_trees(user_id, kind, axe)
  WHERE axe IS NOT NULL AND carre_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_moi
  ON reflection_trees(carre_id, user_id, axe)
  WHERE carre_id IS NOT NULL AND axe = 'moi';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_societe
  ON reflection_trees(carre_id, axe)
  WHERE carre_id IS NOT NULL AND axe = 'societe';

CREATE INDEX IF NOT EXISTS idx_trees_carre ON reflection_trees(carre_id);
