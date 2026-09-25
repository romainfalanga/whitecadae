-- Rename only the existing album; keep its id, song links, order and lyrics.
UPDATE albums SET title = 'Fais mieux'
WHERE id = 4 AND slug = '114' AND title = '114'
  AND EXISTS (SELECT 1 FROM songs WHERE album_id = albums.id AND slug = 'fais-mieux');
