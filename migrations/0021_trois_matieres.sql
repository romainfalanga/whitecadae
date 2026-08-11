-- Pense Mieux redevient privé, et le carré se resserre sur trois matières.
--
-- Ce qu'une personne écrit dans Pense Mieux ne sort plus, sauf trois espaces :
-- sa philosophie, son multivers (les univers renommés) et sa société
-- harmonieuse. Ce sont les seules matières d'un carré, et les seules choses
-- qu'un As voit chez un autre. Sa psychologie, son moi harmonieux et les
-- réflexions qu'il a ouvertes lui-même restent à lui.
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

-- La psychologie et le moi harmonieux ne vivent plus dans un carré : ils sont
-- à leur porteur et à personne d'autre. Ceux qui existaient redescendent dans
-- sa forêt personnelle, avec la mémoire du carré dans leur nom — rien de ce
-- qui a été écrit n'est perdu.
UPDATE reflection_trees
   SET axe = NULL,
       title = title || ' · ' || COALESCE((SELECT nom FROM carres WHERE id = carre_id), 'un carré'),
       carre_id = NULL
 WHERE carre_id IS NOT NULL AND axe IN ('psy', 'moi');

-- Les univers deviennent le multivers. Le titre d'un espace se recalcule à
-- chaque écriture, mais on remet les anciens d'aplomb tout de suite.
UPDATE reflection_trees SET title = 'Mon multivers'
 WHERE axe = 'univers' AND carre_id IS NULL AND title = 'Mes univers';
UPDATE reflection_trees SET title = 'Notre multivers'
 WHERE axe = 'univers' AND carre_id IS NOT NULL AND title = 'Nos univers';

-- Un carré n'a plus ni rôle, ni domaine, ni note : ces colonnes et ces tables
-- ne sont plus lues. On ne les détruit pas — aucune base en service ne doit
-- perdre de données pour un changement d'interface — mais rien ne s'en sert
-- plus : carre_membres.role, carre_membres.domaine, carre_annonces.role,
-- carre_annonces.domaine, carre_notes, carre_auto_notes, carres.cap,
-- carre_relatif_messages, carre_relatif_sources, et reflection_trees.prive.
