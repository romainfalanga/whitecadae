-- Migration 0005 : passages multi-phrases et références internes
-- (appliquée le 2026-08-05 ; le schéma complet à jour reste schema.sql)

-- Une interprétation 'passage' va de (line_id, word_start) à (end_line_id, word_end).
ALTER TABLE annotations ADD COLUMN end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE;

-- Une référence peut pointer vers un passage d'un morceau (référence interne).
ALTER TABLE annotation_references ADD COLUMN ref_song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE;
ALTER TABLE annotation_references ADD COLUMN ref_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE;
ALTER TABLE annotation_references ADD COLUMN ref_end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE;
