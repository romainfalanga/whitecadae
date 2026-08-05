// WhiteCadae — Cloudflare Worker : API + service du site statique

const SESSION_COOKIE = 'wc_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error(err.stack || String(err));
        return json({ error: 'Erreur interne du serveur.' }, 500);
      }
    }
    // Tout le reste est servi par les assets statiques (mode SPA).
    return env.ASSETS.fetch(request);
  },
};

/* ---------------------------------------------------------------- routing */

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/api';
  const method = request.method;
  const route = (m, pattern) => {
    if (m !== method) return null;
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$');
    const match = path.match(re);
    return match ? match.slice(1).map(decodeURIComponent) : null;
  };

  let p;

  // --- auth
  if (route('POST', '/api/register')) return register(request, env);
  if (route('POST', '/api/login')) return login(request, env);
  if (route('POST', '/api/logout')) return logout(request, env);
  if (route('GET', '/api/me')) return me(request, env);

  // --- lecture publique
  if (route('GET', '/api/albums')) return listAlbums(env);
  if ((p = route('GET', '/api/songs/:slug'))) return getSong(env, request, p[0]);

  // --- contributions (connecté)
  if (route('POST', '/api/annotations')) return createAnnotation(request, env);
  if ((p = route('PUT', '/api/annotations/:id'))) return updateAnnotation(request, env, +p[0]);
  if ((p = route('DELETE', '/api/annotations/:id'))) return deleteAnnotation(request, env, +p[0]);
  if (route('POST', '/api/connections')) return createConnection(request, env);
  if ((p = route('DELETE', '/api/connections/:id'))) return deleteConnection(request, env, +p[0]);
  if (route('POST', '/api/favorites')) return toggleFavorite(request, env);
  if (route('POST', '/api/comments')) return createComment(request, env);
  if ((p = route('DELETE', '/api/comments/:id'))) return deleteComment(request, env, +p[0]);

  // --- administration
  if (route('POST', '/api/admin/albums')) return adminCreateAlbum(request, env);
  if ((p = route('PUT', '/api/admin/albums/:id'))) return adminUpdateAlbum(request, env, +p[0]);
  if ((p = route('DELETE', '/api/admin/albums/:id'))) return adminDeleteAlbum(request, env, +p[0]);
  if (route('POST', '/api/admin/songs')) return adminCreateSong(request, env);
  if ((p = route('PUT', '/api/admin/songs/:id'))) return adminUpdateSong(request, env, +p[0]);
  if ((p = route('DELETE', '/api/admin/songs/:id'))) return adminDeleteSong(request, env, +p[0]);
  if ((p = route('PUT', '/api/admin/songs/:id/lyrics'))) return adminSetLyrics(request, env, +p[0]);
  if ((p = route('PUT', '/api/admin/songs/:id/duration'))) return adminSetDuration(request, env, +p[0]);

  return json({ error: 'Route introuvable.' }, 404);
}

/* ---------------------------------------------------------------- helpers */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
}

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256
  );
  return toHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt)}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, expected] = stored.split(':');
  const actual = await pbkdf2(password, fromHex(saltHex));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function newToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? match[1] : null;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function getUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.username, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?1 AND s.expires_at > datetime('now')`
  ).bind(token).first();
  return row || null;
}

async function requireUser(request, env) {
  const user = await getUser(request, env);
  if (!user) throw json({ error: 'Connexion requise.' }, 401);
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!user.is_admin) throw json({ error: 'Réservé à l’administrateur.' }, 403);
  return user;
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'sans-titre';
}

async function uniqueSlug(env, table, base) {
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const existing = await env.DB.prepare(`SELECT id FROM ${table} WHERE slug = ?1`).bind(slug).first();
    if (!existing) return slug;
    slug = `${base}-${i}`;
  }
  throw new Error('Impossible de générer un slug unique.');
}

function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/* ------------------------------------------------------------------- auth */

async function register(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);
  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Adresse email invalide.' }, 400);
  if (!/^[\p{L}\p{N} _.-]{3,30}$/u.test(username))
    return json({ error: 'Le pseudo doit faire entre 3 et 30 caractères (lettres, chiffres, espaces, . _ -).' }, 400);
  if (password.length < 8) return json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, 400);

  const existing = await env.DB.prepare(
    'SELECT id, email, username FROM users WHERE email = ?1 OR username = ?2'
  ).bind(email, username).first();
  if (existing) {
    return json({ error: existing.email === email ? 'Un compte existe déjà avec cet email.' : 'Ce pseudo est déjà pris.' }, 409);
  }

  const adminEmails = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminEmails.includes(email) ? 1 : 0;
  const passwordHash = await hashPassword(password);

  const result = await env.DB.prepare(
    'INSERT INTO users (email, username, password_hash, is_admin) VALUES (?1, ?2, ?3, ?4)'
  ).bind(email, username, passwordHash, isAdmin).run();

  const userId = result.meta.last_row_id;
  return openSession(env, { id: userId, email, username, is_admin: isAdmin });
}

async function login(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const user = await env.DB.prepare(
    'SELECT id, email, username, password_hash, is_admin FROM users WHERE email = ?1'
  ).bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Email ou mot de passe incorrect.' }, 401);
  }
  return openSession(env, user);
}

async function openSession(env, user) {
  // Nettoyage opportuniste des sessions expirées.
  await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
  const token = newToken();
  const maxAge = SESSION_DAYS * 24 * 3600;
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?1, ?2, datetime('now', '+${SESSION_DAYS} days'))`
  ).bind(token, user.id).run();
  return json(
    { user: { id: user.id, email: user.email, username: user.username, is_admin: !!user.is_admin } },
    200,
    { 'Set-Cookie': sessionCookie(token, maxAge) }
  );
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(token).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

async function me(request, env) {
  const user = await getUser(request, env);
  return json({ user: user ? { ...user, is_admin: !!user.is_admin } : null });
}

/* ---------------------------------------------------------------- lecture */

async function listAlbums(env) {
  const albums = (await env.DB.prepare(
    'SELECT id, title, slug, release_date, is_single FROM albums ORDER BY position, release_date'
  ).all()).results;
  const songs = (await env.DB.prepare(
    `SELECT s.id, s.album_id, s.title, s.slug, s.track_number,
            (SELECT COUNT(*) FROM annotations a WHERE a.song_id = s.id) AS annotation_count,
            (SELECT COUNT(*) FROM lyric_lines l WHERE l.song_id = s.id AND l.text <> '') AS line_count
       FROM songs s ORDER BY s.track_number, s.title`
  ).all()).results;
  for (const album of albums) {
    album.is_single = !!album.is_single;
    album.songs = songs.filter((s) => s.album_id === album.id);
  }
  const orphans = songs.filter((s) => !albums.some((a) => a.id === s.album_id));
  return json({ albums, orphans });
}

async function getSong(env, request, slug) {
  const song = await env.DB.prepare(
    `SELECT s.id, s.title, s.slug, s.track_number, s.youtube_url, s.duration_seconds, s.album_id,
            al.title AS album_title, al.slug AS album_slug
       FROM songs s LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.slug = ?1`
  ).bind(slug).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  const lines = (await env.DB.prepare(
    'SELECT id, line_number, text FROM lyric_lines WHERE song_id = ?1 ORDER BY line_number'
  ).bind(song.id).all()).results;

  const annotations = (await env.DB.prepare(
    `SELECT a.id, a.user_id, a.target_type, a.line_id, a.word_start, a.word_end, a.content,
            a.created_at, a.updated_at, u.username
       FROM annotations a JOIN users u ON u.id = a.user_id
      WHERE a.song_id = ?1 ORDER BY a.created_at`
  ).bind(song.id).all()).results;

  const connections = (await env.DB.prepare(
    `SELECT c.id, c.song_a_id, c.song_b_id, c.explanation, c.created_at, c.user_id,
            u.username,
            sa.title AS song_a_title, sa.slug AS song_a_slug,
            sb.title AS song_b_title, sb.slug AS song_b_slug
       FROM song_connections c
       JOIN users u ON u.id = c.user_id
       JOIN songs sa ON sa.id = c.song_a_id
       JOIN songs sb ON sb.id = c.song_b_id
      WHERE c.song_a_id = ?1 OR c.song_b_id = ?1
      ORDER BY c.created_at`
  ).bind(song.id).all()).results;

  const allSongs = (await env.DB.prepare(
    'SELECT id, title, slug FROM songs ORDER BY title'
  ).all()).results;

  // Données sociales : favoris et commentaires des interprétations et connexions.
  const viewer = await getUser(request, env);
  await attachSocial(env, viewer, 'annotation',
    `SELECT id FROM annotations WHERE song_id = ${song.id}`, annotations);
  await attachSocial(env, viewer, 'connection',
    `SELECT id FROM song_connections WHERE song_a_id = ${song.id} OR song_b_id = ${song.id}`, connections);

  return json({ song, lines, annotations, connections, allSongs });
}

// Ajoute favorite_count, my_favorite et comments[] à chaque élément.
async function attachSocial(env, viewer, kind, idSubquery, items) {
  const counts = (await env.DB.prepare(
    `SELECT target_id, COUNT(*) AS n FROM favorites
      WHERE target_kind = ?1 AND target_id IN (${idSubquery}) GROUP BY target_id`
  ).bind(kind).all()).results;
  const mine = viewer
    ? (await env.DB.prepare(
        `SELECT target_id FROM favorites
          WHERE user_id = ?1 AND target_kind = ?2 AND target_id IN (${idSubquery})`
      ).bind(viewer.id, kind).all()).results.map((r) => r.target_id)
    : [];
  const comments = (await env.DB.prepare(
    `SELECT c.id, c.target_id, c.user_id, c.content, c.created_at, u.username
       FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.target_kind = ?1 AND c.target_id IN (${idSubquery})
      ORDER BY c.created_at`
  ).bind(kind).all()).results;

  const countMap = new Map(counts.map((r) => [r.target_id, r.n]));
  const mineSet = new Set(mine);
  for (const item of items) {
    item.favorite_count = countMap.get(item.id) || 0;
    item.my_favorite = mineSet.has(item.id);
    item.comments = comments.filter((c) => c.target_id === item.id);
  }
}

/* ------------------------------------------------------------ annotations */

async function createAnnotation(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);
  const songId = Number(body.song_id);
  const lineId = body.line_id == null ? null : Number(body.line_id);
  let wordStart = body.word_start == null ? null : Number(body.word_start);
  let wordEnd = body.word_end == null ? wordStart : Number(body.word_end);
  const content = String(body.content || '').trim();

  if (!content) return json({ error: 'L’explication ne peut pas être vide.' }, 400);
  if (content.length > 5000) return json({ error: 'Explication trop longue (5000 caractères max).' }, 400);

  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?1').bind(songId).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  let targetType;
  if (lineId != null) {
    const line = await env.DB.prepare(
      'SELECT id, text FROM lyric_lines WHERE id = ?1 AND song_id = ?2'
    ).bind(lineId, songId).first();
    if (!line) return json({ error: 'Ligne introuvable.' }, 404);
    if (wordStart != null) {
      const nWords = countWords(line.text);
      if (
        !Number.isInteger(wordStart) || !Number.isInteger(wordEnd) ||
        wordStart < 0 || wordEnd < wordStart || wordEnd >= nWords
      ) {
        return json({ error: 'Position de mot invalide.' }, 400);
      }
      targetType = 'word';
    } else {
      wordEnd = null;
      targetType = 'line';
    }
  } else {
    wordStart = null;
    wordEnd = null;
    targetType = ['song', 'title', 'duration'].includes(body.target_type) ? body.target_type : 'song';
  }

  const result = await env.DB.prepare(
    `INSERT INTO annotations (user_id, song_id, target_type, line_id, word_start, word_end, content)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(user.id, songId, targetType, lineId, wordStart, wordEnd, content).run();

  return json({ id: result.meta.last_row_id }, 201);
}

async function updateAnnotation(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  const content = String((body && body.content) || '').trim();
  if (!content) return json({ error: 'L’explication ne peut pas être vide.' }, 400);
  if (content.length > 5000) return json({ error: 'Explication trop longue (5000 caractères max).' }, 400);

  const ann = await env.DB.prepare('SELECT id, user_id FROM annotations WHERE id = ?1').bind(id).first();
  if (!ann) return json({ error: 'Annotation introuvable.' }, 404);
  if (ann.user_id !== user.id && !user.is_admin) return json({ error: 'Vous ne pouvez modifier que vos propres explications.' }, 403);

  await env.DB.prepare(
    `UPDATE annotations SET content = ?1, updated_at = datetime('now') WHERE id = ?2`
  ).bind(content, id).run();
  return json({ ok: true });
}

async function deleteAnnotation(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const ann = await env.DB.prepare('SELECT id, user_id FROM annotations WHERE id = ?1').bind(id).first();
  if (!ann) return json({ error: 'Annotation introuvable.' }, 404);
  if (ann.user_id !== user.id && !user.is_admin) return json({ error: 'Vous ne pouvez supprimer que vos propres explications.' }, 403);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM favorites WHERE target_kind = 'annotation' AND target_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM comments WHERE target_kind = 'annotation' AND target_id = ?1`).bind(id),
    env.DB.prepare('DELETE FROM annotations WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
}

/* ------------------------------------------------------------- connexions */

async function createConnection(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);
  const songA = Number(body.song_a_id);
  const songB = Number(body.song_b_id);
  const explanation = String(body.explanation || '').trim();

  if (!explanation) return json({ error: 'Expliquez en quoi les deux chansons sont reliées.' }, 400);
  if (explanation.length > 5000) return json({ error: 'Explication trop longue (5000 caractères max).' }, 400);
  if (!songA || !songB || songA === songB) return json({ error: 'Choisissez deux chansons différentes.' }, 400);

  const found = (await env.DB.prepare(
    'SELECT id FROM songs WHERE id IN (?1, ?2)'
  ).bind(songA, songB).all()).results;
  if (found.length !== 2) return json({ error: 'Chanson introuvable.' }, 404);

  const result = await env.DB.prepare(
    'INSERT INTO song_connections (song_a_id, song_b_id, user_id, explanation) VALUES (?1, ?2, ?3, ?4)'
  ).bind(songA, songB, user.id, explanation).run();
  return json({ id: result.meta.last_row_id }, 201);
}

async function deleteConnection(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const conn = await env.DB.prepare('SELECT id, user_id FROM song_connections WHERE id = ?1').bind(id).first();
  if (!conn) return json({ error: 'Connexion introuvable.' }, 404);
  if (conn.user_id !== user.id && !user.is_admin) return json({ error: 'Vous ne pouvez supprimer que vos propres connexions.' }, 403);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM favorites WHERE target_kind = 'connection' AND target_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM comments WHERE target_kind = 'connection' AND target_id = ?1`).bind(id),
    env.DB.prepare('DELETE FROM song_connections WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
}

/* ------------------------------------------------- favoris & commentaires */

const FAVORITE_KINDS = { annotation: 'annotations', connection: 'song_connections' };

async function targetExists(env, kind, id) {
  const table = FAVORITE_KINDS[kind];
  if (!table || !Number.isInteger(id) || id <= 0) return false;
  return !!(await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(id).first());
}

// Ajoute le favori s'il n'existe pas, le retire sinon.
async function toggleFavorite(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  const kind = body && body.target_kind;
  const targetId = body && Number(body.target_id);
  if (!(await targetExists(env, kind, targetId))) return json({ error: 'Cible introuvable.' }, 404);

  const existing = await env.DB.prepare(
    'SELECT 1 AS x FROM favorites WHERE user_id = ?1 AND target_kind = ?2 AND target_id = ?3'
  ).bind(user.id, kind, targetId).first();

  if (existing) {
    await env.DB.prepare(
      'DELETE FROM favorites WHERE user_id = ?1 AND target_kind = ?2 AND target_id = ?3'
    ).bind(user.id, kind, targetId).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO favorites (user_id, target_kind, target_id) VALUES (?1, ?2, ?3)'
    ).bind(user.id, kind, targetId).run();
  }

  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM favorites WHERE target_kind = ?1 AND target_id = ?2'
  ).bind(kind, targetId).first();
  return json({ favorited: !existing, count: count.n });
}

async function createComment(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  const kind = body && body.target_kind;
  const targetId = body && Number(body.target_id);
  const content = String((body && body.content) || '').trim();

  if (!content) return json({ error: 'Le commentaire ne peut pas être vide.' }, 400);
  if (content.length > 2000) return json({ error: 'Commentaire trop long (2000 caractères max).' }, 400);
  if (!(await targetExists(env, kind, targetId))) return json({ error: 'Cible introuvable.' }, 404);

  const result = await env.DB.prepare(
    'INSERT INTO comments (target_kind, target_id, user_id, content) VALUES (?1, ?2, ?3, ?4)'
  ).bind(kind, targetId, user.id, content).run();
  return json({ id: result.meta.last_row_id }, 201);
}

async function deleteComment(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const comment = await env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ?1').bind(id).first();
  if (!comment) return json({ error: 'Commentaire introuvable.' }, 404);
  if (comment.user_id !== user.id && !user.is_admin) {
    return json({ error: 'Vous ne pouvez supprimer que vos propres commentaires.' }, 403);
  }
  await env.DB.prepare('DELETE FROM comments WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

/* ---------------------------------------------------------------- admin */

async function adminCreateAlbum(request, env) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  const title = String((body && body.title) || '').trim();
  if (!title) return json({ error: 'Le titre est requis.' }, 400);
  const releaseDate = String((body && body.release_date) || '').trim() || null;
  const isSingle = body && body.is_single ? 1 : 0;
  const slug = await uniqueSlug(env, 'albums', slugify(title));
  const maxPos = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM albums').first();
  const result = await env.DB.prepare(
    'INSERT INTO albums (title, slug, release_date, is_single, position) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(title, slug, releaseDate, isSingle, maxPos.p + 1).run();
  return json({ id: result.meta.last_row_id, slug }, 201);
}

async function adminUpdateAlbum(request, env, id) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  const album = await env.DB.prepare('SELECT id FROM albums WHERE id = ?1').bind(id).first();
  if (!album) return json({ error: 'Album introuvable.' }, 404);
  const title = String((body && body.title) || '').trim();
  if (!title) return json({ error: 'Le titre est requis.' }, 400);
  const releaseDate = String((body && body.release_date) || '').trim() || null;
  const isSingle = body && body.is_single ? 1 : 0;
  await env.DB.prepare(
    'UPDATE albums SET title = ?1, release_date = ?2, is_single = ?3 WHERE id = ?4'
  ).bind(title, releaseDate, isSingle, id).run();
  return json({ ok: true });
}

async function adminDeleteAlbum(request, env, id) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  await env.DB.prepare('DELETE FROM albums WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

async function adminCreateSong(request, env) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  const title = String((body && body.title) || '').trim();
  if (!title) return json({ error: 'Le titre est requis.' }, 400);
  const albumId = body && body.album_id ? Number(body.album_id) : null;
  const trackNumber = body && body.track_number ? Number(body.track_number) : null;
  const youtubeUrl = String((body && body.youtube_url) || '').trim() || null;
  if (albumId != null) {
    const album = await env.DB.prepare('SELECT id FROM albums WHERE id = ?1').bind(albumId).first();
    if (!album) return json({ error: 'Album introuvable.' }, 404);
  }
  const slug = await uniqueSlug(env, 'songs', slugify(title));
  const result = await env.DB.prepare(
    'INSERT INTO songs (album_id, title, slug, track_number, youtube_url) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(albumId, title, slug, trackNumber, youtubeUrl).run();
  return json({ id: result.meta.last_row_id, slug }, 201);
}

async function adminUpdateSong(request, env, id) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?1').bind(id).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);
  const title = String((body && body.title) || '').trim();
  if (!title) return json({ error: 'Le titre est requis.' }, 400);
  const albumId = body && body.album_id ? Number(body.album_id) : null;
  const trackNumber = body && body.track_number ? Number(body.track_number) : null;
  const youtubeUrl = String((body && body.youtube_url) || '').trim() || null;
  await env.DB.prepare(
    'UPDATE songs SET title = ?1, album_id = ?2, track_number = ?3, youtube_url = ?4 WHERE id = ?5'
  ).bind(title, albumId, trackNumber, youtubeUrl, id).run();
  return json({ ok: true });
}

async function adminDeleteSong(request, env, id) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM favorites WHERE target_kind = 'annotation'
        AND target_id IN (SELECT id FROM annotations WHERE song_id = ?1)`).bind(id),
    env.DB.prepare(
      `DELETE FROM comments WHERE target_kind = 'annotation'
        AND target_id IN (SELECT id FROM annotations WHERE song_id = ?1)`).bind(id),
    env.DB.prepare(
      `DELETE FROM favorites WHERE target_kind = 'connection'
        AND target_id IN (SELECT id FROM song_connections WHERE song_a_id = ?1 OR song_b_id = ?1)`).bind(id),
    env.DB.prepare(
      `DELETE FROM comments WHERE target_kind = 'connection'
        AND target_id IN (SELECT id FROM song_connections WHERE song_a_id = ?1 OR song_b_id = ?1)`).bind(id),
    env.DB.prepare('DELETE FROM songs WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
}

// Durée de la chanson, au format "m:ss" ou en secondes.
async function adminSetDuration(request, env, id) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?1').bind(id).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  const raw = String((body && body.duration) || '').trim();
  let seconds = null;
  if (raw !== '') {
    const m = raw.match(/^(\d+):([0-5]?\d)$/);
    if (m) seconds = Number(m[1]) * 60 + Number(m[2]);
    else if (/^\d+$/.test(raw)) seconds = Number(raw);
    else return json({ error: 'Format de durée invalide (utilisez m:ss, par exemple 3:57).' }, 400);
  }
  await env.DB.prepare('UPDATE songs SET duration_seconds = ?1 WHERE id = ?2').bind(seconds, id).run();
  return json({ ok: true, duration_seconds: seconds });
}

// Remplace l'intégralité du texte d'une chanson. Attention : les
// annotations liées aux anciennes lignes sont supprimées (cascade).
async function adminSetLyrics(request, env, id) {
  try { await requireAdmin(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?1').bind(id).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  const text = String((body && body.text) || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n').map((l) => l.trim());
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  while (lines.length && lines[0] === '') lines.shift();

  const statements = [
    env.DB.prepare(
      `DELETE FROM favorites WHERE target_kind = 'annotation'
        AND target_id IN (SELECT id FROM annotations WHERE song_id = ?1 AND line_id IS NOT NULL)`).bind(id),
    env.DB.prepare(
      `DELETE FROM comments WHERE target_kind = 'annotation'
        AND target_id IN (SELECT id FROM annotations WHERE song_id = ?1 AND line_id IS NOT NULL)`).bind(id),
    env.DB.prepare('DELETE FROM lyric_lines WHERE song_id = ?1').bind(id),
  ];
  lines.forEach((line, i) => {
    statements.push(
      env.DB.prepare('INSERT INTO lyric_lines (song_id, line_number, text) VALUES (?1, ?2, ?3)').bind(id, i + 1, line)
    );
  });
  await env.DB.batch(statements);
  return json({ ok: true, line_count: lines.filter((l) => l !== '').length });
}
