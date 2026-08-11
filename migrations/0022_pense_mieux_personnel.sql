-- Pense Mieux se range, et le multivers redevient personnel.
--
-- Une réflexion naît désormais DANS un espace (ou dans une catégorie qu'on y
-- a créée) : `parent_id` dit où elle vit, `genre` ce qu'elle est
-- (`categorie` ou `reflexion`). Les cinq espaces gardent leur axe et un
-- parent nul, et tout ce qui est rangé se lit comme son espace racine.
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

ALTER TABLE reflection_trees ADD COLUMN parent_id INTEGER;
ALTER TABLE reflection_trees ADD COLUMN genre TEXT;
CREATE INDEX IF NOT EXISTS idx_trees_parent ON reflection_trees(parent_id);

-- Le multivers ne se travaille plus ni dans un carré ni sous le regard de la
-- plateforme : les modèles d'univers sont à leur porteur, comme la
-- psychologie et le moi harmonieux. Les multivers DE carré redescendent chez
-- celui qui les avait ouverts, avec la mémoire du carré dans leur nom —
-- rien de ce qui a été écrit n'est perdu.
UPDATE reflection_trees
   SET axe = NULL,
       title = title || ' · ' || COALESCE((SELECT nom FROM carres WHERE id = carre_id), 'un carré'),
       carre_id = NULL
 WHERE carre_id IS NOT NULL AND axe = 'univers';
