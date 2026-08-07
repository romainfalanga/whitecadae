-- Grille de lecture : rang (à partir de 1) d'une interprétation parmi
-- celles que son auteur a écrites sur la même cible, dans l'ordre où il les
-- a écrites. Fixé à la création, jamais recalculé (une suppression ne
-- renumérote pas les grilles restantes).
ALTER TABLE annotations ADD COLUMN grid_number INTEGER NOT NULL DEFAULT 1;

-- Rétro-calcul pour les interprétations déjà existantes : certains membres
-- ont déjà pu écrire plusieurs lectures d'une même cible avant cette
-- fonctionnalité, il faut leur attribuer le bon rang plutôt que de tout
-- laisser à 1.
UPDATE annotations SET grid_number = (
  SELECT COUNT(*) FROM annotations b
   WHERE b.user_id = annotations.user_id
     AND b.song_id = annotations.song_id
     AND b.target_type = annotations.target_type
     AND b.line_id IS annotations.line_id
     AND b.word_start IS annotations.word_start
     AND b.word_end IS annotations.word_end
     AND b.end_line_id IS annotations.end_line_id
     AND (b.created_at < annotations.created_at
          OR (b.created_at = annotations.created_at AND b.id <= annotations.id))
);
