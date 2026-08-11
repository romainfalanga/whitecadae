-- Pense Mieux s'ouvre au carré.
--
-- Ce qu'un As écrit chez lui est désormais lu par les As de ses carrés, et
-- ceux-ci peuvent y RÉPONDRE : approfondir, élargir, ou opposer en résolvant.
-- Personne n'écrit à la place d'un autre — une réponse reste à celui qui l'a
-- déposée, et le porteur garde le dernier mot chez lui.
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

-- Ce qu'une pensée vient faire quand elle est déposée chez un autre. Nul pour
-- ce que l'on écrit chez soi.
ALTER TABLE reflection_branches ADD COLUMN reponse TEXT;

-- Une réflexion est ouverte aux carrés de son porteur ; celle-ci ne l'est pas.
ALTER TABLE reflection_trees ADD COLUMN prive INTEGER NOT NULL DEFAULT 0;

-- Le réglage de voix : ce que la chaîne audio du navigateur applique au timbre
-- de chacun (fondamentale mesurée, coupure, présence, gain). Deux voix n'ont
-- ni la même assise ni les mêmes fréquences ; le vocal s'y accorde.
ALTER TABLE users ADD COLUMN voix TEXT;
