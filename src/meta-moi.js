// Lyrics supplied by the artist. Blank lines separate the five sections.
export const META_MOI_LYRICS = `[couplet 1]
Tout n'est que cause conséquence.
Je subis, même quand j'modifie
l'arborescence de ce que je suis.
Quand je m'en rapproche, il s'éloigne.
Quand je comprends mes mécanismes,
la matière qui les conscientise
est elle-même faite de mécanismes.
Comme la vitesse de la lumière, c'est la limite.
J'peux pas l'atteindre, plus je m'en rapproche, plus il me fuit.
C'est quand j'compare que c'est visible,
plus j'm'analyse et plus j'existe.
Plus j'conscientise, plus je maîtrise.
Plus je me rapproche du Méta-Moi.
Mais je le toucherai jamais,
puisque chaque nouvelle pensée
rejoint mes mécanismes et conditionne
la suivante que j'aurai.

[refrain]
Je monte les étages
de cette tour infinie…
Plus je monte,
plus j'peux voir ce que je suis.
Quoi que je fasse,
je suis ma géodésique,
à jamais l'esclave
de mes mécanismes.
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais jamais jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais jamais jamais libre

[couplet 2]
Plus je creuse…
Plus il y a à creuser…
Donc je m'enfonce pour m'rapprocher du méta-moi.
Mais je le suis déjà.
Pour le moi du passé.
Je suis un tout.
Chaque partie de moi me compose.
Mais chacune d'elles
résulte de tellement de choses.
Quand, quand j'rentre dedans,
je comprends
que tout est connecté, y a pas de biais.
Juste de la matière qui façonne
le tissu d'ma personnalité.
Plus c'est massif,
plus ça conditionne ce que je serai.
Toute la matière qui est en moi
est, en miroir,
l'équivalence de mes lois.
Mes mécanismes résultent de mon passé.
Esclave de lui à jamais,
vu qu'il contrôle ma façon et mon envie
de me modifier, d'évoluer.

[pont]
J'suis une branche qui se croit libre
de créer ses feuilles,
mais c'est mon tronc qui décide
en subissant ses racines.
Je peux devenir ce que je veux,
dans mon champ des possibles.
Mais ce que je veux
résulte de mes mécanismes.

[refrain]
Je monte les étages
de cette tour infinie…
Plus je monte,
plus j'peux voir ce que je suis.
Quoi que je fasse,
je suis ma géodésique,
à jamais l'esclave
de mes mécanismes.
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais jamais jamais libre
Jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Je monte les étages
de cette tour infinie…
Plus je monte,
plus j'peux voir ce que je suis.
Quoi que je fasse,
je suis ma géodésique,
à jamais l'esclave
de mes mécanismes.
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Jamais jamais jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Jamais jamais jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais jamais jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Je serai jamais libre
Jamais libre
Jamais jamais jamais libre`;

const ready = new WeakMap();
const migration = '0030-meta-moi-lyrics';

// Add the missing song once through the Worker's existing D1 binding. The
// transaction and marker prevent duplicate lines and preserve later edits.
export async function ensureMetaMoi(env) {
  if (ready.has(env.DB)) return ready.get(env.DB);
  const pending = (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_content_migrations (
      id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    if (await env.DB.prepare('SELECT id FROM site_content_migrations WHERE id=?1').bind(migration).first()) return;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO songs (title,slug)
        SELECT 'Meta moi','meta-moi' WHERE NOT EXISTS (SELECT 1 FROM site_content_migrations WHERE id=?1)
        ON CONFLICT(slug) DO NOTHING`).bind(migration),
      env.DB.prepare(`WITH target AS MATERIALIZED (
          SELECT id FROM songs WHERE slug='meta-moi'
            AND NOT EXISTS (SELECT 1 FROM lyric_lines WHERE song_id=songs.id)
            AND NOT EXISTS (SELECT 1 FROM site_content_migrations WHERE id=?1)
        ) INSERT INTO lyric_lines (song_id,line_number,text)
        SELECT target.id,CAST(lines.key AS INTEGER)+1,lines.value
        FROM target,json_each(?2) AS lines`).bind(migration,JSON.stringify(META_MOI_LYRICS.split('\n'))),
      env.DB.prepare('INSERT OR IGNORE INTO site_content_migrations (id) VALUES (?1)').bind(migration),
    ]);
  })();
  ready.set(env.DB,pending);
  try { await pending; } catch (error) { ready.delete(env.DB); throw error; }
}
