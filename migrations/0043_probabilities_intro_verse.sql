-- Separate the intro from the verse without replacing any surviving line.
-- Apply the whole file as one batch.
CREATE TABLE IF NOT EXISTS site_content_migrations (
  id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO site_content_migrations(id)
SELECT '0043-probabilities-intro-verse-pending'
WHERE NOT EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0043-probabilities-intro-verse')
  AND (SELECT count(*) FROM lyric_lines
       WHERE song_id=(SELECT id FROM songs WHERE slug='les-probabilites')
         AND line_number BETWEEN 1 AND 5
         AND text=CASE line_number
           WHEN 1 THEN '[Couplet]'
           WHEN 2 THEN 'Tu n''existes pas.'
           WHEN 3 THEN 'Tu n''existes pas.'
           WHEN 4 THEN 'Sans tes filtres, tu n''existes pas.'
           WHEN 5 THEN 'Contrôle les lois de ton univers.' END)=5;
UPDATE lyric_lines SET text='[Intro]'
WHERE song_id=(SELECT id FROM songs WHERE slug='les-probabilites')
  AND line_number=1
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0043-probabilities-intro-verse-pending');
UPDATE lyric_lines SET line_number=line_number+3
WHERE song_id=(SELECT id FROM songs WHERE slug='les-probabilites')
  AND line_number>=5
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0043-probabilities-intro-verse-pending');
INSERT INTO lyric_lines(song_id,line_number,text)
SELECT s.id,5,''
FROM songs s WHERE slug='les-probabilites'
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0043-probabilities-intro-verse-pending');
INSERT INTO lyric_lines(song_id,line_number,text)
SELECT s.id,6,'[Couplet]'
FROM songs s WHERE slug='les-probabilites'
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0043-probabilities-intro-verse-pending');
INSERT INTO lyric_lines(song_id,line_number,text)
SELECT s.id,7,'Tu n''existes pas sans tes filtres,'
FROM songs s WHERE slug='les-probabilites'
  AND EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0043-probabilities-intro-verse-pending');
UPDATE site_content_migrations SET id='0043-probabilities-intro-verse'
WHERE id='0043-probabilities-intro-verse-pending';
