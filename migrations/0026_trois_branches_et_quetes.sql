-- Trois branches, et deux quêtes.
--
-- Pense Mieux ne porte plus quatre branches mais trois : « Mon
-- fonctionnement », « La société » et « Société harmonieuse ». Et une
-- réflexion dit désormais ce qu'elle creuse : la cause (« Pourquoi ? ») ou le
-- remède (« Comment faire mieux ? »).
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

-- Ce que creuse une réflexion. Nul pour un espace, nul pour une catégorie
-- (elle range, elle ne creuse pas), et nul pour les réflexions d'avant les
-- quêtes : on ne leur en invente pas une.
ALTER TABLE reflection_trees ADD COLUMN quete TEXT;

-- « Ma psychologie » devient « Mon fonctionnement » : c'est le même regard,
-- mieux nommé. « Ma société harmonieuse » devient « Société harmonieuse ».
-- « La société » — ce qui est là, tel que c'est — naît vide au premier
-- regard, comme tout espace qui manque.
UPDATE reflection_trees SET axe = 'fonctionnement', title = 'Mon fonctionnement'
 WHERE axe = 'psy';
UPDATE reflection_trees SET axe = 'societe_harmonieuse', title = 'Société harmonieuse'
 WHERE axe = 'societe';

-- Le miroir change de place : il ne va plus de la psychologie au moi
-- harmonieux, mais de la société à la société harmonieuse. Ce que le moi
-- harmonieux portait — ce vers quoi l'on tend — se dit désormais dans la
-- quête « Comment faire mieux ? », dans n'importe quelle branche.
--
-- « Le moi harmonieux » et « Ma philosophie » ne sont donc plus des
-- branches. Celui qui n'a jamais rien porté s'efface (une coquille créée
-- d'avance, sans un mot dedans) ; celui qui porte des pensées ou range des
-- réflexions devient une catégorie DE « Mon fonctionnement » — rien de ce qui
-- y a été écrit n'est perdu, tout descend d'un cran.
DELETE FROM reflection_trees
 WHERE axe IN ('moi', 'philo') AND trunk = ''
   AND id NOT IN (SELECT tree_id FROM reflection_branches)
   AND id NOT IN (SELECT parent_id FROM reflection_trees WHERE parent_id IS NOT NULL);

UPDATE reflection_trees
   SET axe = NULL,
       genre = 'categorie',
       parent_id = (SELECT f.id FROM reflection_trees f
                     WHERE f.user_id = reflection_trees.user_id
                       AND f.kind = reflection_trees.kind
                       AND f.axe = 'fonctionnement' AND f.carre_id IS NULL)
 WHERE axe IN ('moi', 'philo');
