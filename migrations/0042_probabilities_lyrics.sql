-- Correct only the artist-specified opening and preserve the IDs of the rest
-- of the song, including the line about filters. Apply this file as one batch.
CREATE TABLE IF NOT EXISTS site_content_migrations (
  id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admit this migration only when the complete old opening still matches.
INSERT OR IGNORE INTO site_content_migrations(id)
SELECT '0042-probabilities-lyrics-pending'
WHERE NOT EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0042-probabilities-lyrics')
  AND (SELECT count(*) FROM lyric_lines
       WHERE song_id=(SELECT id FROM songs WHERE slug='les-probabilites')
         AND line_number BETWEEN 2 AND 8
         AND text=CASE line_number
           WHEN 2 THEN 'Quand le temps c''est l''enfer,'
           WHEN 3 THEN 'Le paradis c''est la matière.'
           WHEN 4 THEN 'Regarde la mort,'
           WHEN 5 THEN 'Ce que tu vois façonne ta visière.'
           WHEN 6 THEN 'Subis la couleur de tes yeux,'
           WHEN 7 THEN 'Choisis de les avoir ouverts.'
           WHEN 8 THEN 'Tu n''existes pas sans tes filtres,' END)=7;

UPDATE lyric_lines SET text=CASE line_number
  WHEN 2 THEN 'Tu n''existes pas.'
  WHEN 3 THEN 'Tu n''existes pas.'
  WHEN 8 THEN 'Sans tes filtres, tu n''existes pas.' END
WHERE song_id=(SELECT id FROM songs WHERE slug='les-probabilites')
  AND line_number IN (2,3,8)
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0042-probabilities-lyrics-pending');

DELETE FROM lyric_lines
WHERE song_id=(SELECT id FROM songs WHERE slug='les-probabilites')
  AND line_number BETWEEN 4 AND 7
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0042-probabilities-lyrics-pending');

UPDATE lyric_lines SET line_number=line_number-4
WHERE song_id=(SELECT id FROM songs WHERE slug='les-probabilites')
  AND line_number>=8
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0042-probabilities-lyrics-pending');

UPDATE site_content_migrations SET id='0042-probabilities-lyrics'
WHERE id='0042-probabilities-lyrics-pending';
