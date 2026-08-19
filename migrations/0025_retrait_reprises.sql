-- Retrait des reprises. La page /reprises, son fil et la page par morceau
-- n'existent plus : plus aucun code ne lit ni n'écrit la table covers.
-- Les favoris et les commentaires ne portaient plus que sur les reprises :
-- ils partent avec elles.
-- ⚠ Cette migration supprime définitivement les reprises publiées ainsi que
-- les favoris et commentaires (y compris ceux, déjà inertes, qui visaient des
-- interprétations, des connexions ou des interprétations d'ensemble).
DROP INDEX IF EXISTS idx_covers_song;
DROP TABLE IF EXISTS covers;
DROP INDEX IF EXISTS idx_favorites_target;
DROP TABLE IF EXISTS favorites;
DROP INDEX IF EXISTS idx_comments_target;
DROP TABLE IF EXISTS comments;
