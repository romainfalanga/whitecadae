-- Migration 0010 : références enrichies
--
-- Une référence libre ne se résume plus à un libellé et un lien : elle nomme
-- l'œuvre, son artiste, et explique en quoi c'en est une. Une référence
-- interne (vers un passage d'un morceau) porte la même explication.
--
-- La colonne `url` reste en place pour ne pas perdre les liens déjà saisis,
-- mais elle n'est plus ni proposée ni affichée.

ALTER TABLE annotation_references ADD COLUMN artist TEXT;
ALTER TABLE annotation_references ADD COLUMN note TEXT;
