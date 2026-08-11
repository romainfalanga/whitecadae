-- Le carré devient celui d'UNE personne.
--
-- Une personne fonde son carré et y cherche trois As. Ils sont là pour
-- l'aider à harmoniser ses CINQ branches de réflexion : ils les lisent
-- toutes, et peuvent y répondre. Il n'y a plus de privé ni de public entre
-- une personne et son carré — et rien ne sort en dehors de lui.
--
-- Le carré n'écrit donc plus rien « en commun » : il entre chez son porteur.
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

-- Qui porte le carré : celui qui l'a fondé.
ALTER TABLE carres ADD COLUMN createur_id INTEGER;
UPDATE carres SET createur_id = (
  SELECT m.user_id FROM carre_membres m WHERE m.carre_id = carres.id
   ORDER BY m.joined_at, m.rowid LIMIT 1)
 WHERE createur_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_carres_createur ON carres(createur_id);

-- Les arbres qui appartenaient à un carré redescendent chez celui qui les
-- avait ouverts, avec le nom du carré accolé : rien de ce qui a été écrit
-- n'est perdu, et son auteur le relit chez lui.
UPDATE reflection_trees
   SET axe = NULL,
       title = title || ' · ' || COALESCE((SELECT nom FROM carres WHERE id = carre_id), 'un carré'),
       carre_id = NULL
 WHERE carre_id IS NOT NULL;
