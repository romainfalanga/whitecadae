-- WhiteCadae — données initiales : discographie complète de White Cadae

INSERT INTO albums (title, slug, release_date, is_single, position) VALUES
  ('18 juillet 2019', '18-juillet-2019', '2019-07-18', 0, 1),
  ('57', '57', NULL, 0, 2),
  ('Multivers', 'multivers', NULL, 0, 3),
  ('114', '114', NULL, 0, 4),
  ('Double sens', 'double-sens', NULL, 1, 5),
  ('La mélodie du silence', 'la-melodie-du-silence', NULL, 1, 6);

INSERT INTO songs (album_id, title, slug, track_number) VALUES
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Wanheda', 'wanheda', 1),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Quand je vois je pense', 'quand-je-vois-je-pense', 2),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Ma folie', 'ma-folie', 3),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Un fil entre deux infinis', 'un-fil-entre-deux-infinis', 4),
  ((SELECT id FROM albums WHERE slug = '18-juillet-2019'), 'Rendors-toi', 'rendors-toi', 5),
  ((SELECT id FROM albums WHERE slug = '57'), '13h20', '13h20', 1),
  ((SELECT id FROM albums WHERE slug = '57'), '30 vins divins', '30-vins-divins', 2),
  ((SELECT id FROM albums WHERE slug = '57'), 'Sans indice dans les dés', 'sans-indice-dans-les-des', 3),
  ((SELECT id FROM albums WHERE slug = '57'), 'Orange', 'orange', 4),
  ((SELECT id FROM albums WHERE slug = 'multivers'), 'Multivers', 'multivers', 1),
  ((SELECT id FROM albums WHERE slug = 'multivers'), 'Galaxies vivantes', 'galaxies-vivantes', 2),
  ((SELECT id FROM albums WHERE slug = 'multivers'), 'Le cœur d''une galaxie', 'le-coeur-d-une-galaxie', 3),
  ((SELECT id FROM albums WHERE slug = '114'), 'La matière danse', 'la-matiere-dense', 1),
  ((SELECT id FROM albums WHERE slug = '114'), 'Les probabilités', 'les-probabilites', 2),
  ((SELECT id FROM albums WHERE slug = '114'), 'Fais mieux', 'fais-mieux', 3),
  ((SELECT id FROM albums WHERE slug = 'double-sens'), 'Double sens', 'double-sens', 1),
  ((SELECT id FROM albums WHERE slug = 'la-melodie-du-silence'), 'La mélodie du silence', 'la-melodie-du-silence', 1);
