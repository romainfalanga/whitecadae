-- Correct only the requested lyric, retaining its ID and every other line.
-- Apply this file as one batch.
CREATE TABLE IF NOT EXISTS site_content_migrations (
  id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
UPDATE lyric_lines SET text='J’ai dit sans vin divin,'
WHERE song_id=(SELECT id FROM songs WHERE slug='13h20')
  AND line_number=50 AND text='J’ai dit sans vins divins,'
  AND NOT EXISTS (SELECT 1 FROM site_content_migrations WHERE id='0044-13h20-sans-vin-divin');
INSERT OR IGNORE INTO site_content_migrations(id)
SELECT '0044-13h20-sans-vin-divin'
WHERE EXISTS (SELECT 1 FROM lyric_lines
  WHERE song_id=(SELECT id FROM songs WHERE slug='13h20')
    AND line_number=50 AND text='J’ai dit sans vin divin,');
