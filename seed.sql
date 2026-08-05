-- WhiteCadae — données initiales : album « 18 juillet 2019 »

INSERT INTO albums (title, slug, release_date, is_single, position)
VALUES ('18 juillet 2019', '18-juillet-2019', '2019-07-18', 0, 1);

INSERT INTO songs (album_id, title, slug, track_number) VALUES
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Wanheda', 'wanheda', 1),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Quand je vois je pense', 'quand-je-vois-je-pense', 2),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Ma folie', 'ma-folie', 3),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Un fil entre deux infinis', 'un-fil-entre-deux-infinis', 4),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Rendors-toi', 'rendors-toi', 5);
