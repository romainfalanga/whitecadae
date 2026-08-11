-- Pense Mieux et la Vidéographie cessent de poursuivre la même chose.
--
-- Pense Mieux est l'outil de la pensée : on y écrit, on y parle (le vocal),
-- on range ses réflexions en arbres, seul ou avec ses carrés. La Vidéographie
-- devient le témoignage rythmé de ce qu'on a vécu : une vidéo par semaine,
-- une par mois, une par an, chacune récapitulant la période du point de vue
-- de ce qu'on a ajouté dans Pense Mieux et vécu avec ses carrés.
--
-- (Le Worker fait aussi tout cela de lui-même au premier passage : cette
-- migration est le chemin propre.)

-- Le rythme. `periode` est la clé de la période récapitulée : 2026-S33 pour
-- une semaine ISO, 2026-08 pour un mois, 2026 pour une année. Une seule vidéo
-- par période, qu'on peut corriger.
CREATE TABLE IF NOT EXISTS videographie_recaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL,
  periode TEXT NOT NULL,
  url TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, cadence, periode)
);

CREATE INDEX IF NOT EXISTS idx_recaps_user
  ON videographie_recaps(user_id, cadence, periode);

-- Le vocal d'une branche : l'audio en base64 (comme l'avatar), sa
-- transcription minutée mot à mot, sa durée. C'est de quoi rejouer la pensée
-- en faisant apparaître le texte au fur et à mesure, et d'en tirer une vidéo.
-- L'audio est borné côté Worker : une pensée jetée est courte, et une ligne
-- de D1 ne dépasse pas deux mégaoctets.
CREATE TABLE IF NOT EXISTS branch_vocaux (
  branch_id INTEGER PRIMARY KEY REFERENCES reflection_branches(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  audio TEXT NOT NULL,
  mots TEXT NOT NULL DEFAULT '[]',
  duree REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- La Vidéographie n'a plus d'axes : elle a un rythme. Les troncs qu'elle
-- portait redescendent dans sa forêt — rien n'est perdu, ils redeviennent des
-- arbres ordinaires.
UPDATE reflection_trees SET axe = NULL
  WHERE kind = 'video' AND axe IS NOT NULL AND carre_id IS NULL;
