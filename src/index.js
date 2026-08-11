// WhiteCadae : Cloudflare Worker (API + service du site statique)

import {
  getNode, isLocked, matchNode, buildState, currentAnswerId, echelonOf, accessOf,
  delaiEssaiMs, enigmesTrouvees, progresOf,
  ECHELON_CONVERSATION, ECHELON_PENSE_MIEUX, ECHELON_VIDEOGRAPHIE,
  ECHELON_CARRE, ECHELON_BRAINSTORM, ECHELON_GMO,
} from './enigmas57.js';
import { MISSIONS_CARRE, ROLES_CARRE, DOMAINES_CARRE, MECANISMES_GMO } from './contenus.js';

const SESSION_COOKIE = 'wc_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return avecSecurite(await handleApi(request, env, url));
      } catch (err) {
        console.error(err.stack || String(err));
        return avecSecurite(json({ error: 'Erreur interne du serveur.' }, 500));
      }
    }
    // Tout le reste est servi par les assets statiques (mode SPA).
    return avecSecurite(await env.ASSETS.fetch(request));
  },
};

/* ------------------------------------------------- en-têtes de sécurité ---

   Le vrai verrou est `script-src 'self'` : le site n'exécute que ses propres
   fichiers. Si une chaîne écrite par un membre parvenait un jour à s'échapper
   de l'échappement du client, le navigateur refuserait quand même de la
   lancer. Il n'y a aucun script en ligne dans le site : c'est pourquoi le
   repli d'avatar, qui vivait dans un attribut `onerror`, a été déplacé dans
   app.js.

   Les styles gardent 'unsafe-inline' : trois barres de progression posent leur
   largeur en attribut. C'est sans danger comparé aux scripts.

   Deux origines extérieures sont nécessaires et strictement bornées : le
   lecteur YouTube des reprises (`frame-src`), et rien d'autre. `frame-ancestors
   'none'` interdit en retour de mettre le site dans le cadre de quelqu'un
   d'autre, donc de faire cliquer un membre à son insu.                      */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

const SECURITE = {
  'Content-Security-Policy': CSP,
  // sans quoi un fichier déposé par un membre pourrait être deviné exécutable
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  // le navigateur garde le site en HTTPS pendant deux ans, sous-domaines compris
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function avecSecurite(reponse) {
  // 204 et 304 n'ont pas de corps : le recopier ferait échouer la construction.
  const sansCorps = [101, 204, 205, 304].includes(reponse.status);
  const sortie = new Response(sansCorps ? null : reponse.body, reponse);
  for (const [nom, valeur] of Object.entries(SECURITE)) sortie.headers.set(nom, valeur);
  return sortie;
}

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

  // --- l'avatar n'est barré par rien : il s'affiche jusque dans le menu
  if ((p = route('GET', '/api/users/:username/avatar'))) return getAvatar(env, p[0]);

  // --- le profil est public : on y lit l'échelon d'un membre et les énigmes
  //     qu'il a percées. Ce qu'il a écrit, lui, reste soumis à l'accès de
  //     celui qui regarde (voir getProfile).
  if ((p = route('GET', '/api/users/:username'))) return getProfile(env, request, p[0]);

  // --- le 57 : la porte d'entrée, ouverte à tout membre
  if (route('GET', '/api/57')) return signsState(request, env);
  if (route('POST', '/api/57/guess')) return signsGuess(request, env);
  if (route('DELETE', '/api/57/progress')) return signsReset(request, env);

  // --- le compte : toujours accessible, sinon on ne pourrait plus en sortir
  if (route('PUT', '/api/account/username')) return updateUsername(request, env);
  if (route('PUT', '/api/account/password')) return updatePassword(request, env);
  if (route('POST', '/api/account/avatar')) return updateAvatar(request, env);

  // --- les pièces hautes : chacune exige son échelon, vérifié dans son
  //     gestionnaire (le corps de la requête et l'échelon du visiteur s'y
  //     lisent ensemble). L'ordre n'a pas d'importance : rien ici n'est
  //     couvert par le barrage plus bas.
  if (route('GET', '/api/conversation')) return conversationList(request, env);
  if (route('POST', '/api/conversation')) return conversationPost(request, env);

  if (route('GET', '/api/arbres')) return arbresList(request, env, url);
  if (route('POST', '/api/arbres')) return arbresCreate(request, env);
  // avant :id, qui avalerait « recherche »
  if (route('GET', '/api/arbres/recherche')) return arbresRecherche(request, env, url);
  if ((p = route('GET', '/api/arbres/:id'))) return arbresGet(request, env, +p[0]);
  if ((p = route('PUT', '/api/arbres/:id'))) return arbresUpdate(request, env, +p[0]);
  if ((p = route('DELETE', '/api/arbres/:id'))) return arbresDelete(request, env, +p[0]);
  if ((p = route('POST', '/api/arbres/:id/branches'))) return branchesCreate(request, env, +p[0]);
  if ((p = route('PUT', '/api/branches/:id'))) return branchesUpdate(request, env, +p[0]);
  if ((p = route('DELETE', '/api/branches/:id'))) return branchesDelete(request, env, +p[0]);
  if ((p = route('POST', '/api/branches/:id/liens'))) return lienCreate(request, env, +p[0]);
  if ((p = route('DELETE', '/api/branches/:id/liens/:source'))) return lienDelete(request, env, +p[0], +p[1]);
  if ((p = route('GET', '/api/videographie/membre/:id'))) return videographieDuMembre(request, env, +p[0]);

  // les littéraux d'abord, la page d'un carré (:id) ensuite
  if (route('GET', '/api/carre')) return carreGet(request, env);
  if (route('POST', '/api/carre')) return carreCreate(request, env);
  if (route('GET', '/api/carre/as')) return carreAnnuaire(request, env);
  if (route('GET', '/api/carre/recrutement')) return carreRecrutement(request, env);
  if (route('PUT', '/api/carre/annonce')) return carreAnnoncePut(request, env);
  if (route('DELETE', '/api/carre/annonce')) return carreAnnonceDelete(request, env);
  if (route('POST', '/api/carre/invitations')) return carreInvite(request, env);
  if ((p = route('POST', '/api/carre/invitations/:id/accepte'))) return carreInviteAccepte(request, env, +p[0]);
  if ((p = route('POST', '/api/carre/invitations/:id/refuse'))) return carreInviteRefuse(request, env, +p[0]);
  if ((p = route('GET', '/api/carre/:id'))) return carreDetail(request, env, +p[0]);
  if ((p = route('PUT', '/api/carre/:id'))) return carreUpdate(request, env, +p[0]);
  if ((p = route('PUT', '/api/carre/:id/moi'))) return carreUpdateMoi(request, env, +p[0]);
  if ((p = route('POST', '/api/carre/:id/rejoindre'))) return carreJoin(request, env, +p[0]);
  if ((p = route('POST', '/api/carre/:id/quitter'))) return carreLeave(request, env, +p[0]);
  if ((p = route('GET', '/api/carre/:id/conversation'))) return carreChatList(request, env, +p[0]);
  if ((p = route('POST', '/api/carre/:id/conversation'))) return carreChatPost(request, env, +p[0]);
  if ((p = route('PUT', '/api/carre/:id/notes'))) return carreNotes(request, env, +p[0]);
  if ((p = route('GET', '/api/carre/:id/relatif'))) return relatifGet(request, env, +p[0]);
  if ((p = route('POST', '/api/carre/:id/relatif'))) return relatifPost(request, env, +p[0]);
  if ((p = route('PUT', '/api/carre/:id/relatif/sources'))) return relatifSources(request, env, +p[0]);

  if (route('GET', '/api/brainstorms')) return brainstormsList(request, env);
  if (route('POST', '/api/brainstorms')) return brainstormsCreate(request, env);
  if ((p = route('GET', '/api/brainstorms/:id'))) return brainstormGet(request, env, +p[0]);
  if ((p = route('PUT', '/api/brainstorms/:id'))) return brainstormUpdate(request, env, +p[0]);
  if ((p = route('POST', '/api/brainstorms/:id/idees'))) return brainstormIdee(request, env, +p[0]);
  if ((p = route('POST', '/api/brainstorms/:id/votes'))) return brainstormVote(request, env, +p[0]);
  if ((p = route('POST', '/api/brainstorms/:id/retenues'))) return brainstormRetenue(request, env, +p[0]);

  if (route('GET', '/api/gmo')) return gmoGet(request, env);

  // --- le tronc commun : interprétations et reprises. Ouvert dès l'échelon 1,
  //     donc à tout le monde, visiteur compris : le barrage ne ferme plus que
  //     ce qui est au-dessus. On le garde en place : si un jour un échelon
  //     doit se refermer, il suffit de relever la constante.
  const coversRoute = route('GET', '/api/covers/feed') || route('GET', '/api/covers')
    || route('GET', '/api/songs/:slug/covers') || route('POST', '/api/covers')
    || route('DELETE', '/api/covers/:id');
  if (coversRoute) {
    const refus = await requireAccess(request, env, 'reprises');
    if (refus) return refus;
  } else if (path.startsWith('/api/') && !path.startsWith('/api/admin/')) {
    const refus = await requireAccess(request, env, 'interpretations');
    if (refus) return refus;
  }

  // --- lecture
  if (route('GET', '/api/albums')) return listAlbums(env);
  if (route('GET', '/api/corpus')) return getCorpus(env);
  if (route('GET', '/api/feed')) return getFeed(env, request, url);
  if (route('GET', '/api/covers/feed')) return getCoverFeed(env, request, url);
  if (route('GET', '/api/covers')) return listCovers(env, request);
  if ((p = route('GET', '/api/songs/:slug/covers'))) return getSongCovers(env, request, p[0]);
  if ((p = route('GET', '/api/songs/:slug'))) return getSong(env, request, p[0]);

  // --- contributions (connecté)
  if (route('POST', '/api/annotations')) return createAnnotation(request, env);
  if ((p = route('PUT', '/api/annotations/:id'))) return updateAnnotation(request, env, +p[0]);
  if ((p = route('DELETE', '/api/annotations/:id'))) return deleteAnnotation(request, env, +p[0]);
  if ((p = route('POST', '/api/annotations/:id/references'))) return addReference(request, env, +p[0]);
  if ((p = route('DELETE', '/api/references/:id'))) return deleteReference(request, env, +p[0]);
  if (route('POST', '/api/passage-references')) return createPassageReference(request, env);
  if ((p = route('DELETE', '/api/passage-references/:id'))) return deletePassageReference(request, env, +p[0]);
  if (route('POST', '/api/connections')) return createConnection(request, env);
  if ((p = route('DELETE', '/api/connections/:id'))) return deleteConnection(request, env, +p[0]);
  if (route('POST', '/api/essays')) return createEssay(request, env);
  if ((p = route('PUT', '/api/essays/:id'))) return updateEssay(request, env, +p[0]);
  if ((p = route('DELETE', '/api/essays/:id'))) return deleteEssay(request, env, +p[0]);
  if (route('POST', '/api/covers')) return createCover(request, env);
  if ((p = route('DELETE', '/api/covers/:id'))) return deleteCover(request, env, +p[0]);
  if (route('POST', '/api/favorites')) return toggleFavorite(request, env);
  if (route('POST', '/api/comments')) return createComment(request, env);
  if ((p = route('DELETE', '/api/comments/:id'))) return deleteComment(request, env, +p[0]);
  if (route('POST', '/api/profile/publish')) return publishVersion(request, env);

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

// `no-store` : toutes ces réponses dépendent de qui les demande, la session,
// l'échelon atteint, les brouillons qu'on est seul à voir. Aucune ne doit
// dormir dans un cache intermédiaire, encore moins être resservie à
// quelqu'un d'autre. (L'avatar, lui, forge sa propre réponse et reste
// cachable : c'est une image publique.)
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
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

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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

/* --------------------------------------------------- ce que l'échelon ouvre

   Le 57 commande le reste du site : sans mot de passe trouvé, il n'y a que
   lui. Les pages s'ouvrent ensuite une à une (voir accessOf). Le barrage vit
   dans le code : masquer un lien dans l'interface ne ferme aucune porte.

   L'artiste en est exempté : il ne peut pas se retrouver enfermé dehors de
   son propre site par un jeu dont il connaît déjà les réponses.            */

async function viewerAccess(request, env) {
  const user = await getUser(request, env);
  // Sans compte on est au sol, comme tout le monde : l'échelon 1 ouvre déjà
  // les interprétations et les reprises, en lecture.
  if (!user) return { user: null, echelon: 1, solved: new Set(), access: accessOf(1) };
  if (user.is_admin) {
    return { user, echelon: Infinity, solved: new Set(), access: accessOf(Infinity) };
  }
  const rows = await riddleRows(env, user.id);
  const { solved } = progresOf(rows.filter((r) => r.solved_at).map((r) => r.riddle_id));
  const echelon = echelonOf(solved);
  return { user, echelon, solved, access: accessOf(echelon) };
}

// L'échelon exigé par une pièce, et un refus prêt à servir. Le message ne dit
// jamais ce qu'il faudrait trouver.
async function requireEchelon(request, env, minimum, cle) {
  const vu = await viewerAccess(request, env);
  if (vu.echelon >= minimum) return { vu, refus: null };
  return { vu, refus: json({ error: 'Ce n’est pas encore ouvert.', locked: cle }, 403) };
}

// Renvoie null si tout est ouvert, sinon la réponse à servir telle quelle.
// Le message ne dit jamais ce qu'il faudrait trouver.
async function requireAccess(request, env, ...cles) {
  const { access } = await viewerAccess(request, env);
  const manque = cles.find((c) => !access[c]);
  if (!manque) return null;
  return json({ error: 'Ce n’est pas encore ouvert.', locked: manque }, 403);
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

// Les colonnes artist/note (migration 0010) sont ajoutées à la volée si la
// migration n'a pas encore été appliquée : ALTER TABLE n'est pas idempotent
// en SQLite, on regarde donc d'abord ce qui existe.
let refColumnsReady = false;
async function ensureReferenceColumns(env) {
  if (refColumnsReady) return;
  const { results } = await env.DB.prepare('PRAGMA table_info(annotation_references)').all();
  const have = new Set((results || []).map((c) => c.name));
  for (const col of ['artist', 'note']) {
    if (!have.has(col)) {
      await env.DB.prepare(`ALTER TABLE annotation_references ADD COLUMN ${col} TEXT`).run();
    }
  }
  refColumnsReady = true;
}

// Valide la liste de références d'une interprétation. Une référence libre
// nomme l'œuvre et son artiste ; une référence interne vise un passage d'un
// morceau (ref_line_id..ref_end_line_id). Les deux portent une explication.
// Retourne un tableau normalisé, ou une Response d'erreur.
async function parseReferences(env, raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return json({ error: 'Références invalides.' }, 400);
  if (raw.length > 10) return json({ error: '10 références maximum par interprétation.' }, 400);
  const refs = [];
  for (const r of raw) {
    if (r && r.ref_line_id != null) {
      // référence interne vers un passage d'un morceau
      const startId = Number(r.ref_line_id);
      const endId = r.ref_end_line_id == null ? startId : Number(r.ref_end_line_id);
      const start = await env.DB.prepare(
        'SELECT l.id, l.text, l.line_number, l.song_id, s.title FROM lyric_lines l JOIN songs s ON s.id = l.song_id WHERE l.id = ?1'
      ).bind(startId).first();
      const end = startId === endId ? start : await env.DB.prepare(
        'SELECT id, text, line_number, song_id FROM lyric_lines WHERE id = ?1'
      ).bind(endId).first();
      if (!start || !end) return json({ error: 'Passage référencé introuvable.' }, 400);
      if (start.song_id !== end.song_id) return json({ error: 'Le passage référencé doit rester dans un même morceau.' }, 400);
      if (end.line_number < start.line_number) return json({ error: 'Passage référencé invalide (fin avant le début).' }, 400);
      const excerpt = start.text.length > 60 ? start.text.slice(0, 57) + '…' : start.text;
      const label = `${start.title} : « ${excerpt}${endId !== startId ? ' […]' : ''} »`;
      const note = String((r && r.note) || '').trim();
      if (note.length > 2000) return json({ error: 'Explication de référence trop longue (2000 caractères max).' }, 400);
      refs.push({
        label, artist: null, note: note || null, url: null,
        ref_song_id: start.song_id, ref_line_id: startId, ref_end_line_id: endId,
      });
      continue;
    }
    const label = String((r && r.label) || '').trim();
    const artist = String((r && r.artist) || '').trim();
    const note = String((r && r.note) || '').trim();
    if (!label) continue;
    if (label.length > 300) return json({ error: 'Nom de l’œuvre trop long (300 caractères max).' }, 400);
    if (artist.length > 300) return json({ error: 'Nom de l’artiste trop long (300 caractères max).' }, 400);
    if (note.length > 2000) return json({ error: 'Explication de référence trop longue (2000 caractères max).' }, 400);
    refs.push({
      label, artist: artist || null, note: note || null, url: null,
      ref_song_id: null, ref_line_id: null, ref_end_line_id: null,
    });
  }
  return refs;
}

async function replaceReferences(env, annotationId, refs) {
  await ensureReferenceColumns(env);
  const statements = [
    env.DB.prepare('DELETE FROM annotation_references WHERE annotation_id = ?1').bind(annotationId),
  ];
  refs.forEach((r, i) => statements.push(refInsert(env, annotationId, i, r)));
  await env.DB.batch(statements);
}

function refInsert(env, annotationId, position, r) {
  return env.DB.prepare(
    `INSERT INTO annotation_references
      (annotation_id, position, label, artist, note, url, ref_song_id, ref_line_id, ref_end_line_id)
     VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, ?8)`
  ).bind(annotationId, position, r.label, r.artist || null, r.note || null,
         r.ref_song_id || null, r.ref_line_id || null, r.ref_end_line_id || null);
}

// Une référence se publie seule, après coup, sur une interprétation qui
// existe déjà : elle lui est greffée sans qu'il faille la réécrire.
async function addReference(request, env, annotationId) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }
  const ann = await env.DB.prepare('SELECT id, user_id FROM annotations WHERE id = ?1').bind(annotationId).first();
  if (!ann) return json({ error: 'Interprétation introuvable.' }, 404);
  if (ann.user_id !== user.id && !user.is_admin) return json({ error: 'Action non autorisée.' }, 403);

  const body = await readJson(request);
  const parsed = await parseReferences(env, [body]);
  if (parsed instanceof Response) return parsed;
  if (!parsed.length) return json({ error: 'Référence vide.' }, 400);

  await ensureReferenceColumns(env);
  const n = (await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM annotation_references WHERE annotation_id = ?1'
  ).bind(annotationId).first()).n;
  if (n >= 10) return json({ error: '10 références maximum par interprétation.' }, 400);
  await refInsert(env, annotationId, n, parsed[0]).run();
  return json({ ok: true });
}

async function deleteReference(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }
  const row = await env.DB.prepare(
    `SELECT r.id, a.user_id FROM annotation_references r
       JOIN annotations a ON a.id = r.annotation_id WHERE r.id = ?1`
  ).bind(id).first();
  if (!row) return json({ error: 'Référence introuvable.' }, 404);
  if (row.user_id !== user.id && !user.is_admin) return json({ error: 'Action non autorisée.' }, 403);
  await env.DB.prepare('DELETE FROM annotation_references WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

/* ------------------------------------------------------------------- auth */

/* ------------------------------------------------- le barrage des essais ---

   Deux portes s'ouvrent sans rien prouver : la connexion et l'inscription. Sans
   compteur, on peut y taper indéfiniment : essayer des mots de passe de
   membres d'un côté, fabriquer des comptes jetables de l'autre. Or un compte
   jetable, c'est un essai de plus sur les signes du 57 : le minuteur du jeu ne
   tient que par compte, il ne coûte donc rien à qui sait en créer mille.

   Le compteur est tenu par adresse, dans une fenêtre glissante, avec des seuils
   qu'aucun humain n'atteint. Il ne remplace pas le minuteur du jeu : il enlève
   le moyen de le contourner en masse.

   L'adresse vient de `CF-Connecting-IP`, que le réseau de Cloudflare pose
   lui-même : elle ne peut pas être forgée par le visiteur, contrairement à
   `X-Forwarded-For`, qu'on se garde bien de lire. En développement, wrangler
   la pose aussi. Le garde-fou sur son absence n'est donc qu'une ceinture de
   plus : sans adresse, on ne saurait de toute façon pas quoi compter.       */

let barrageTableReady = false;
async function ensureBarrageTable(env) {
  if (barrageTableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS auth_attempts (
       cle TEXT PRIMARY KEY,
       compte INTEGER NOT NULL DEFAULT 0,
       fenetre TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  ).run();
  barrageTableReady = true;
}

function adresseDe(request) {
  return request.headers.get('CF-Connecting-IP') || null;
}

// Renvoie une réponse 429 si le seuil est franchi, sinon null.
async function barrage(request, env, quoi, max, fenetreSecondes) {
  const ip = adresseDe(request);
  if (!ip) return null;
  await ensureBarrageTable(env);
  const row = await env.DB.prepare(
    `SELECT compte, (julianday('now') - julianday(fenetre)) * 86400 AS age
       FROM auth_attempts WHERE cle = ?1`
  ).bind(`${quoi}:${ip}`).first();
  if (!row || row.age >= fenetreSecondes) return null;
  if (row.compte < max) return null;
  const reste = Math.max(1, Math.ceil(fenetreSecondes - row.age));
  return json(
    { error: 'Trop de tentatives. Réessayez plus tard.' },
    429,
    { 'Retry-After': String(reste) }
  );
}

// Incrémente, en repartant de zéro si la fenêtre précédente est écoulée.
async function noteEssai(request, env, quoi, fenetreSecondes) {
  const ip = adresseDe(request);
  if (!ip) return;
  await ensureBarrageTable(env);
  await env.DB.prepare(
    `INSERT INTO auth_attempts (cle, compte, fenetre) VALUES (?1, 1, datetime('now'))
     ON CONFLICT(cle) DO UPDATE SET
       compte = CASE WHEN (julianday('now') - julianday(fenetre)) * 86400 >= ?2
                     THEN 1 ELSE compte + 1 END,
       fenetre = CASE WHEN (julianday('now') - julianday(fenetre)) * 86400 >= ?2
                      THEN datetime('now') ELSE fenetre END`
  ).bind(`${quoi}:${ip}`, fenetreSecondes).run();
  // ménage opportuniste : une fenêtre d'un jour ne sert plus à rien
  await env.DB.prepare(
    `DELETE FROM auth_attempts WHERE julianday('now') - julianday(fenetre) > 1`
  ).run();
}

// Assez large pour une famille derrière une même adresse, assez étroit pour
// qu'on ne fabrique pas une armée de comptes jetables.
const BARRAGE_CONNEXION = { max: 20, fenetre: 15 * 60 };
const BARRAGE_INSCRIPTION = { max: 6, fenetre: 60 * 60 };

async function register(request, env) {
  const stop = await barrage(request, env, 'inscription', BARRAGE_INSCRIPTION.max, BARRAGE_INSCRIPTION.fenetre);
  if (stop) return stop;
  await noteEssai(request, env, 'inscription', BARRAGE_INSCRIPTION.fenetre);

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
  // On ne compte que les échecs : se connecter souvent n'est pas suspect,
  // se tromper vingt fois en un quart d'heure l'est.
  const stop = await barrage(request, env, 'connexion', BARRAGE_CONNEXION.max, BARRAGE_CONNEXION.fenetre);
  if (stop) return stop;

  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const user = await env.DB.prepare(
    'SELECT id, email, username, password_hash, is_admin FROM users WHERE email = ?1'
  ).bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await noteEssai(request, env, 'connexion', BARRAGE_CONNEXION.fenetre);
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

// La session porte aussi ce que l'échelon ouvre et le minuteur d'essai :
// commun à tous les signes du site. L'interface s'y règle dès le chargement,
// sans attendre l'état du jeu.
async function me(request, env) {
  const { user, access, echelon } = await viewerAccess(request, env);
  return json({
    user: user ? { ...user, is_admin: !!user.is_admin } : null,
    access,
    echelon: Number.isFinite(echelon) ? echelon : ECHELON_GMO,
    attenteMs: user && Number.isFinite(echelon) ? await attenteRestante(env, user.id, echelon) : 0,
  });
}

/* ---------------------------------------------------------------- lecture */

// Toutes les phrases de tous les morceaux (hors balises de section et
// lignes vides) : sert au constructeur d'interprétations d'ensemble et
// au moteur de suggestions d'échos.
async function getCorpus(env) {
  const songs = (await env.DB.prepare(
    'SELECT id, title, slug FROM songs ORDER BY title'
  ).all()).results;
  const lines = (await env.DB.prepare(
    `SELECT id, song_id, line_number, text FROM lyric_lines
      WHERE text <> '' AND text NOT LIKE '[%' ORDER BY song_id, line_number`
  ).all()).results;

  // Nombre d'interprétations couvrant chaque phrase : une référence interne
  // ne peut viser qu'un passage déjà interprété : et publié, puisqu'une
  // référence relie une lecture publique à une autre lecture publique.
  const spans = (await env.DB.prepare(
    `SELECT a.song_id, ls.line_number AS from_no,
            COALESCE(le.line_number, ls.line_number) AS to_no
       FROM annotations a
       JOIN lyric_lines ls ON ls.id = a.line_id
       LEFT JOIN lyric_lines le ON le.id = a.end_line_id
      WHERE a.line_id IS NOT NULL AND a.is_published = 1`
  ).all()).results;

  // tableau de différences par morceau : O(phrases + interprétations)
  const deltas = new Map();
  for (const s of spans) {
    if (!deltas.has(s.song_id)) deltas.set(s.song_id, new Map());
    const d = deltas.get(s.song_id);
    const lo = Math.min(s.from_no, s.to_no);
    const hi = Math.max(s.from_no, s.to_no);
    d.set(lo, (d.get(lo) || 0) + 1);
    d.set(hi + 1, (d.get(hi + 1) || 0) - 1);
  }
  // Les balises de section créent des trous dans la numérotation : on
  // applique tous les deltas jusqu'au numéro de phrase courant.
  let currentSong = null;
  let running = 0;
  let keys = [];
  let dmap = null;
  let ki = 0;
  for (const line of lines) {
    if (line.song_id !== currentSong) {
      currentSong = line.song_id;
      running = 0;
      ki = 0;
      dmap = deltas.get(currentSong) || null;
      keys = dmap ? [...dmap.keys()].sort((a, b) => a - b) : [];
    }
    while (ki < keys.length && keys[ki] <= line.line_number) {
      running += dmap.get(keys[ki]);
      ki++;
    }
    line.interp = running;
  }

  return json({ songs, lines });
}

// Le fil : les interprétations publiées, de la plus récente à la plus
// ancienne, avec de quoi afficher le passage visé sans charger le morceau.
// On demande un élément de plus que la page pour savoir s'il en reste.
async function getFeed(env, request, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 30);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const items = (await env.DB.prepare(
    `SELECT a.id, a.user_id, a.content, a.created_at, a.updated_at, a.grid_number,
            a.target_type, a.word_start, a.word_end,
            u.username, s.title AS song_title, s.slug AS song_slug,
            l.text AS line_text, le.text AS end_line_text
       FROM annotations a
       JOIN users u ON u.id = a.user_id
       JOIN songs s ON s.id = a.song_id
       LEFT JOIN lyric_lines l ON l.id = a.line_id
       LEFT JOIN lyric_lines le ON le.id = a.end_line_id
      WHERE a.is_published = 1
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?1 OFFSET ?2`
  ).bind(limit + 1, offset).all()).results;

  const more = items.length > limit;
  if (more) items.pop();

  const viewer = await getUser(request, env);
  await attachSocial(env, viewer, 'annotation', 'SELECT id FROM annotations WHERE is_published = 1', items);
  return json({ items, more });
}

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
  await ensureReferenceColumns(env);
  // Une interprétation non publiée n'est visible que par son auteur : le
  // reste du monde ne voit que ce qui a été intégré à une version publiée.
  const viewer = await getUser(request, env);
  const viewerId = viewer ? viewer.id : 0;

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

  // Grilles de lecture : le numéro de chaque lecture (n°1, n°2, …) est fixé
  // une fois pour toutes à sa création : il n'est jamais recalculé, y compris
  // si une lecture plus ancienne du même auteur sur la même cible est supprimée.
  const annotations = (await env.DB.prepare(
    `SELECT a.id, a.user_id, a.target_type, a.line_id, a.word_start, a.word_end, a.end_line_id,
            a.content, a.created_at, a.updated_at, a.is_published, a.grid_number, u.username
       FROM annotations a JOIN users u ON u.id = a.user_id
      WHERE a.song_id = ?1 AND (a.is_published = 1 OR a.user_id = ?2)
      ORDER BY a.created_at`
  ).bind(song.id, viewerId).all()).results;

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

  // Grilles de lecture venues d'autres morceaux : les interprétations
  // écrites ailleurs qui référencent un passage de ce morceau-ci.
  const inbound = (await env.DB.prepare(
    `SELECT a.id, a.user_id, a.content, a.created_at, a.updated_at, a.is_published, a.grid_number, u.username,
            a.target_type, a.word_start, a.word_end,
            r.ref_line_id, r.ref_end_line_id, r.note AS ref_note,
            rl.text AS ref_text, rl.line_number AS ref_line_number,
            rle.text AS ref_end_text, rle.line_number AS ref_end_number,
            src.title AS source_title, src.slug AS source_slug,
            sl.text AS source_line_text, sle.text AS source_end_text
       FROM annotation_references r
       JOIN annotations a ON a.id = r.annotation_id
       JOIN users u ON u.id = a.user_id
       JOIN songs src ON src.id = a.song_id
       LEFT JOIN lyric_lines rl ON rl.id = r.ref_line_id
       LEFT JOIN lyric_lines rle ON rle.id = r.ref_end_line_id
       LEFT JOIN lyric_lines sl ON sl.id = a.line_id
       LEFT JOIN lyric_lines sle ON sle.id = a.end_line_id
      WHERE r.ref_song_id = ?1 AND a.song_id <> ?1 AND (a.is_published = 1 OR a.user_id = ?2)
      ORDER BY a.created_at`
  ).bind(song.id, viewerId).all()).results;

  // Références autonomes posées sur un passage de ce morceau.
  await ensurePassageRefTable(env);
  const passageRefs = (await env.DB.prepare(
    `SELECT pr.id, pr.user_id, pr.target_type, pr.line_id, pr.word_start, pr.word_end,
            pr.end_line_id, pr.kind, pr.label, pr.artist, pr.note, pr.created_at,
            pr.ref_song_id, pr.ref_line_id, pr.ref_end_line_id,
            u.username, rs.slug AS ref_song_slug
       FROM passage_references pr
       JOIN users u ON u.id = pr.user_id
       LEFT JOIN songs rs ON rs.id = pr.ref_song_id
      WHERE pr.song_id = ?1
      ORDER BY pr.created_at`
  ).bind(song.id).all()).results;

  // Références venues d'ailleurs et qui pointent vers ce morceau.
  const inboundRefs = (await env.DB.prepare(
    `SELECT pr.id, pr.user_id, pr.note, pr.created_at,
            pr.ref_line_id, pr.ref_end_line_id,
            rl.text AS ref_text, rl.line_number AS ref_line_number,
            rle.text AS ref_end_text, rle.line_number AS ref_end_number,
            pr.target_type, pr.word_start, pr.word_end,
            u.username, src.title AS source_title, src.slug AS source_slug,
            sl.text AS source_line_text, sle.text AS source_end_text
       FROM passage_references pr
       JOIN users u ON u.id = pr.user_id
       JOIN songs src ON src.id = pr.song_id
       LEFT JOIN lyric_lines rl ON rl.id = pr.ref_line_id
       LEFT JOIN lyric_lines rle ON rle.id = pr.ref_end_line_id
       LEFT JOIN lyric_lines sl ON sl.id = pr.line_id
       LEFT JOIN lyric_lines sle ON sle.id = pr.end_line_id
      WHERE pr.ref_song_id = ?1 AND pr.song_id <> ?1
      ORDER BY pr.created_at`
  ).bind(song.id).all()).results;

  // Interprétations d'ensemble et leurs connexions entre blocs.
  const essays = (await env.DB.prepare(
    `SELECT e.id, e.user_id, e.content, e.created_at, e.updated_at, e.is_published, u.username
       FROM essays e JOIN users u ON u.id = e.user_id
      WHERE e.song_id = ?1 AND (e.is_published = 1 OR e.user_id = ?2)
      ORDER BY e.created_at`
  ).bind(song.id, viewerId).all()).results;
  const essayLinks = (await env.DB.prepare(
    `SELECT el.id, el.essay_id, el.note,
            el.from_line_id, el.from_word_start, el.from_word_end,
            el.to_line_id, el.to_word_start, el.to_word_end,
            lf.text AS from_text, sf.id AS from_song_id, sf.title AS from_song_title, sf.slug AS from_song_slug,
            lt.text AS to_text, st.id AS to_song_id, st.title AS to_song_title, st.slug AS to_song_slug
       FROM essay_links el
       JOIN lyric_lines lf ON lf.id = el.from_line_id
       JOIN songs sf ON sf.id = lf.song_id
       JOIN lyric_lines lt ON lt.id = el.to_line_id
       JOIN songs st ON st.id = lt.song_id
      WHERE el.essay_id IN (SELECT id FROM essays WHERE song_id = ${song.id})
      ORDER BY el.essay_id, el.position`
  ).all()).results;
  for (const e of essays) e.links = essayLinks.filter((l) => l.essay_id === e.id);

  // Les reprises ont leur propre page dédiée par morceau (/chanson/:slug/reprises) :
  // seul le nombre est utile ici, pour afficher le lien vers cette page.
  const coverCount = (await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM covers WHERE song_id = ?1'
  ).bind(song.id).first()).n;

  // Références jointes aux interprétations (libres ou internes).
  const refs = (await env.DB.prepare(
    `SELECT r.id, r.annotation_id, r.label, r.artist, r.note,
            r.ref_song_id, r.ref_line_id, r.ref_end_line_id, rs.slug AS ref_song_slug
       FROM annotation_references r
       LEFT JOIN songs rs ON rs.id = r.ref_song_id
      WHERE r.annotation_id IN (SELECT id FROM annotations WHERE song_id = ?1)
      ORDER BY r.annotation_id, r.position`
  ).bind(song.id).all()).results;
  for (const a of annotations) {
    a.references = refs.filter((r) => r.annotation_id === a.id);
  }

  // Données sociales : favoris et commentaires des interprétations et connexions.
  await attachSocial(env, viewer, 'annotation',
    `SELECT id FROM annotations WHERE song_id = ${song.id}`, annotations);
  await attachSocial(env, viewer, 'connection',
    `SELECT id FROM song_connections WHERE song_a_id = ${song.id} OR song_b_id = ${song.id}`, connections);
  await attachSocial(env, viewer, 'essay',
    `SELECT id FROM essays WHERE song_id = ${song.id}`, essays);
  if (inbound.length) {
    await attachSocial(env, viewer, 'annotation',
      `SELECT annotation_id AS id FROM annotation_references WHERE ref_song_id = ${song.id}`, inbound);
  }

  return json({ song, lines, annotations, connections, essays, inbound, passageRefs, inboundRefs, coverCount, allSongs });
}

// Page dédiée aux reprises d'un morceau : distincte de la page
// d'interprétation, avec son propre contenu (aucune parole ni annotation ici).
async function getSongCovers(env, request, slug) {
  const song = await env.DB.prepare(
    `SELECT s.id, s.title, s.slug, al.title AS album_title, al.slug AS album_slug
       FROM songs s LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.slug = ?1`
  ).bind(slug).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  const covers = (await env.DB.prepare(
    `SELECT c.id, c.user_id, c.title, c.url, c.description, c.created_at, u.username
       FROM covers c JOIN users u ON u.id = c.user_id
      WHERE c.song_id = ?1 ORDER BY c.created_at DESC`
  ).bind(song.id).all()).results;

  const viewer = await getUser(request, env);
  await attachSocial(env, viewer, 'cover', `SELECT id FROM covers WHERE song_id = ${song.id}`, covers);

  return json({ song, covers });
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

/* ----------------------------------------------------- profils & le livre */

// Profil public d'un membre : ses contributions assemblées morceau par
// morceau, dans l'ordre des albums puis des morceaux puis de la position
// dans le texte. Un visiteur ne voit que ce que le membre a publié ; le
// membre lui-même voit aussi ses brouillons en attente de publication.
// Le profil se lit sans rien avoir trouvé : l'échelon d'un membre et les
// énigmes qu'il a percées sont publics. Ce qu'il a ÉCRIT, en revanche, suit
// l'accès de celui qui regarde : on ne contourne pas les portes par ici.
async function getProfile(env, request, username) {
  await ensureReferenceColumns(env);
  const user = await env.DB.prepare(
    'SELECT id, username, created_at, is_admin FROM users WHERE username = ?1 COLLATE NOCASE'
  ).bind(username).first();
  if (!user) return json({ error: 'Membre introuvable.' }, 404);

  const viewer = await getUser(request, env);
  const isOwner = viewer && viewer.id === user.id ? 1 : 0;

  // La part publique : l'échelon, et les énigmes trouvées telles que celui
  // qui regarde a le droit de les nommer.
  const { solved: solvedCible } = progresOf(
    (await riddleRows(env, user.id)).filter((r) => r.solved_at).map((r) => r.riddle_id)
  );
  const vu = await viewerAccess(request, env);
  const jeu = {
    echelon: echelonOf(solvedCible),
    enigmes: enigmesTrouvees(solvedCible, vu.solved),
  };

  const annotations = (await env.DB.prepare(
    `SELECT a.id, a.target_type, a.content, a.created_at, a.updated_at, a.is_published, a.grid_number,
            a.line_id, a.word_start, a.word_end, a.end_line_id,
            s.id AS song_id, s.title AS song_title, s.slug AS song_slug,
            s.track_number, s.duration_seconds,
            COALESCE(al.position, 999) AS album_position, al.title AS album_title,
            l.text AS line_text, l.line_number,
            le.text AS end_line_text, le.line_number AS end_line_number
       FROM annotations a
       JOIN songs s ON s.id = a.song_id
       LEFT JOIN albums al ON al.id = s.album_id
       LEFT JOIN lyric_lines l ON l.id = a.line_id
       LEFT JOIN lyric_lines le ON le.id = a.end_line_id
      WHERE a.user_id = ?1 AND (a.is_published = 1 OR ?2 = 1)
      ORDER BY album_position, s.track_number,
               CASE WHEN a.line_id IS NULL THEN 0 ELSE 1 END,
               COALESCE(l.line_number, 0), COALESCE(a.word_start, -1), a.created_at`
  ).bind(user.id, isOwner).all()).results;

  const refs = (await env.DB.prepare(
    `SELECT r.id, r.annotation_id, r.label, r.artist, r.note,
            r.ref_song_id, rs.slug AS ref_song_slug
       FROM annotation_references r
       LEFT JOIN songs rs ON rs.id = r.ref_song_id
      WHERE r.annotation_id IN (SELECT id FROM annotations WHERE user_id = ?1)
      ORDER BY r.annotation_id, r.position`
  ).bind(user.id).all()).results;
  for (const a of annotations) a.references = refs.filter((r) => r.annotation_id === a.id);

  const essays = (await env.DB.prepare(
    `SELECT e.id, e.content, e.created_at, e.updated_at, e.is_published,
            s.id AS song_id, s.title AS song_title, s.slug AS song_slug, s.track_number,
            COALESCE(al.position, 999) AS album_position, al.title AS album_title
       FROM essays e
       JOIN songs s ON s.id = e.song_id
       LEFT JOIN albums al ON al.id = s.album_id
      WHERE e.user_id = ?1 AND (e.is_published = 1 OR ?2 = 1)
      ORDER BY album_position, s.track_number, e.created_at`
  ).bind(user.id, isOwner).all()).results;
  const essayLinks = (await env.DB.prepare(
    `SELECT el.essay_id, el.note,
            el.from_word_start, el.from_word_end, el.to_word_start, el.to_word_end,
            lf.text AS from_text, sf.title AS from_song_title,
            lt.text AS to_text, st.title AS to_song_title
       FROM essay_links el
       JOIN lyric_lines lf ON lf.id = el.from_line_id
       JOIN songs sf ON sf.id = lf.song_id
       JOIN lyric_lines lt ON lt.id = el.to_line_id
       JOIN songs st ON st.id = lt.song_id
      WHERE el.essay_id IN (SELECT id FROM essays WHERE user_id = ?1)
      ORDER BY el.essay_id, el.position`
  ).bind(user.id).all()).results;
  for (const e of essays) e.links = essayLinks.filter((l) => l.essay_id === e.id);

  // Les références autonomes posées par ce membre : le passage visé vit dans
  // un morceau, la référence elle-même pointe soit vers un autre passage,
  // soit vers une œuvre extérieure.
  await ensurePassageRefTable(env);
  const passageRefs = (await env.DB.prepare(
    `SELECT pr.id, pr.kind, pr.label, pr.artist, pr.note, pr.created_at,
            pr.target_type, pr.word_start, pr.word_end,
            s.title AS song_title, s.slug AS song_slug,
            l.text AS line_text, le.text AS end_line_text,
            rs.title AS ref_song_title, rs.slug AS ref_song_slug
       FROM passage_references pr
       JOIN songs s ON s.id = pr.song_id
       LEFT JOIN lyric_lines l ON l.id = pr.line_id
       LEFT JOIN lyric_lines le ON le.id = pr.end_line_id
       LEFT JOIN songs rs ON rs.id = pr.ref_song_id
      WHERE pr.user_id = ?1
      ORDER BY pr.created_at DESC`
  ).bind(user.id).all()).results;

  const connections = (await env.DB.prepare(
    `SELECT c.id, c.explanation, c.created_at,
            sa.title AS song_a_title, sa.slug AS song_a_slug,
            sb.title AS song_b_title, sb.slug AS song_b_slug
       FROM song_connections c
       JOIN songs sa ON sa.id = c.song_a_id
       JOIN songs sb ON sb.id = c.song_b_id
      WHERE c.user_id = ?1 ORDER BY c.created_at`
  ).bind(user.id).all()).results;

  const covers = (await env.DB.prepare(
    `SELECT c.id, c.user_id, c.title, c.url, c.description, c.created_at, u.username,
            s.title AS song_title, s.slug AS song_slug
       FROM covers c
       JOIN songs s ON s.id = c.song_id
       JOIN users u ON u.id = c.user_id
      WHERE c.user_id = ?1 ORDER BY c.created_at DESC`
  ).bind(user.id).all()).results;
  await attachSocial(env, viewer, 'cover', `SELECT id FROM covers WHERE user_id = ${user.id}`, covers);

  // Les compteurs publics ne portent que sur ce qui a été publié ; le nombre
  // de brouillons en attente est renvoyé à part (n'a de sens que pour l'auteur).
  const stats = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM annotations WHERE user_id = ?1 AND is_published = 1) AS annotations,
       (SELECT COUNT(*) FROM essays WHERE user_id = ?1 AND is_published = 1) AS essays,
       (SELECT COUNT(*) FROM song_connections WHERE user_id = ?1) AS connections,
       (SELECT COUNT(*) FROM covers WHERE user_id = ?1) AS covers,
       (SELECT COUNT(*) FROM comments WHERE user_id = ?1) AS comments,
       (SELECT COUNT(*) FROM annotations WHERE user_id = ?1 AND is_published = 0) +
       (SELECT COUNT(*) FROM essays WHERE user_id = ?1 AND is_published = 0) AS draft_count,
       (SELECT COUNT(*) FROM favorites f WHERE f.target_kind = 'annotation'
          AND f.target_id IN (SELECT id FROM annotations WHERE user_id = ?1)) +
       (SELECT COUNT(*) FROM favorites f WHERE f.target_kind = 'essay'
          AND f.target_id IN (SELECT id FROM essays WHERE user_id = ?1)) +
       (SELECT COUNT(*) FROM favorites f WHERE f.target_kind = 'connection'
          AND f.target_id IN (SELECT id FROM song_connections WHERE user_id = ?1)) +
       (SELECT COUNT(*) FROM favorites f WHERE f.target_kind = 'cover'
          AND f.target_id IN (SELECT id FROM covers WHERE user_id = ?1)) AS favorites_received`
  ).bind(user.id).first();

  // Historique des publications : les versions successives, la plus récente
  // en tête, avec le nombre de blocs qu'elle a rendus publics.
  const versions = (await env.DB.prepare(
    `SELECT v.id, v.number, v.published_at,
            (SELECT COUNT(*) FROM annotations WHERE version_id = v.id) +
            (SELECT COUNT(*) FROM essays WHERE version_id = v.id) AS item_count
       FROM versions v WHERE v.user_id = ?1 ORDER BY v.number DESC`
  ).bind(user.id).all()).results;

  return json({
    user: { username: user.username, created_at: user.created_at, is_admin: !!user.is_admin },
    jeu,
    stats, annotations, essays, passageRefs, connections, versions, covers,
  });
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
  let endLineId = body.end_line_id == null ? null : Number(body.end_line_id);
  if (lineId != null && endLineId != null && endLineId !== lineId) {
    // passage multi-phrases : de (line_id, word_start) à (end_line_id, word_end)
    const start = await env.DB.prepare(
      'SELECT id, text, line_number FROM lyric_lines WHERE id = ?1 AND song_id = ?2'
    ).bind(lineId, songId).first();
    const end = await env.DB.prepare(
      'SELECT id, text, line_number FROM lyric_lines WHERE id = ?1 AND song_id = ?2'
    ).bind(endLineId, songId).first();
    if (!start || !end) return json({ error: 'Ligne introuvable.' }, 404);
    if (end.line_number <= start.line_number) return json({ error: 'Passage invalide (fin avant le début).' }, 400);
    if (wordStart == null) wordStart = 0;
    if (body.word_end == null) wordEnd = countWords(end.text) - 1;
    if (
      !Number.isInteger(wordStart) || !Number.isInteger(wordEnd) ||
      wordStart < 0 || wordStart >= countWords(start.text) ||
      wordEnd < 0 || wordEnd >= countWords(end.text)
    ) {
      return json({ error: 'Position de mot invalide.' }, 400);
    }
    targetType = 'passage';
  } else if (lineId != null) {
    endLineId = null;
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
    endLineId = null;
    targetType = ['song', 'title', 'duration'].includes(body.target_type) ? body.target_type : 'song';
  }

  const refs = await parseReferences(env, body.references);
  if (refs instanceof Response) return refs;

  // Grille de lecture : le rang de cette lecture parmi celles que cet
  // auteur a déjà écrites sur cette même cible exacte (superposition
  // simultanée de plusieurs lectures possibles d'un même passage).
  const gridNumber = await nextGridNumber(env, user.id, songId, targetType, lineId, wordStart, wordEnd, endLineId);

  // Toute nouvelle interprétation naît en brouillon privé : elle ne devient
  // visible des autres que lorsque son auteur publie une nouvelle version.
  const result = await env.DB.prepare(
    `INSERT INTO annotations (user_id, song_id, target_type, line_id, word_start, word_end, end_line_id, content, is_published, version_id, grid_number)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, NULL, ?9)`
  ).bind(user.id, songId, targetType, lineId, wordStart, wordEnd, endLineId, content, gridNumber).run();

  const annotationId = result.meta.last_row_id;
  if (refs.length) await replaceReferences(env, annotationId, refs);

  return json({ id: annotationId }, 201);
}

// Rang (à partir de 1) de la prochaine lecture de cet auteur sur cette cible
// exacte, parmi celles qu'il a déjà écrites : jamais recalculé après coup.
async function nextGridNumber(env, userId, songId, targetType, lineId, wordStart, wordEnd, endLineId) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(grid_number), 0) AS n FROM annotations
      WHERE user_id = ?1 AND song_id = ?2 AND target_type = ?3
        AND line_id IS ?4 AND word_start IS ?5 AND word_end IS ?6 AND end_line_id IS ?7`
  ).bind(userId, songId, targetType, lineId, wordStart, wordEnd, endLineId).first();
  return row.n + 1;
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

  const refs = await parseReferences(env, body.references);
  if (refs instanceof Response) return refs;

  // Toute modification repasse l'interprétation en brouillon : elle
  // redevient invisible pour les autres jusqu'à la prochaine publication.
  await env.DB.prepare(
    `UPDATE annotations SET content = ?1, updated_at = datetime('now'), is_published = 0, version_id = NULL WHERE id = ?2`
  ).bind(content, id).run();
  if (body.references !== undefined) await replaceReferences(env, id, refs);
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

/* -------------------------------------------- interprétations d'ensemble */

// Valide les connexions entre blocs d'une interprétation d'ensemble.
// Retourne un tableau normalisé, ou une Response d'erreur.
async function parseEssayLinks(env, raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return json({ error: 'Connexions invalides.' }, 400);
  if (raw.length > 20) return json({ error: '20 connexions maximum par interprétation.' }, 400);
  const links = [];
  for (const l of raw) {
    const note = String((l && l.note) || '').trim();
    if (!note) return json({ error: 'Chaque connexion doit être expliquée.' }, 400);
    if (note.length > 1000) return json({ error: 'Explication de connexion trop longue (1000 caractères max).' }, 400);
    const spec = { note };
    for (const side of ['from', 'to']) {
      const lineId = Number(l && l[side + '_line_id']);
      const line = await env.DB.prepare('SELECT id, text FROM lyric_lines WHERE id = ?1').bind(lineId).first();
      if (!line) return json({ error: 'Phrase introuvable dans une connexion.' }, 400);
      let ws = l[side + '_word_start'] == null ? null : Number(l[side + '_word_start']);
      let we = l[side + '_word_end'] == null ? ws : Number(l[side + '_word_end']);
      if (ws != null) {
        const n = countWords(line.text);
        if (!Number.isInteger(ws) || !Number.isInteger(we) || ws < 0 || we < ws || we >= n) {
          return json({ error: 'Position de mot invalide dans une connexion.' }, 400);
        }
      } else {
        we = null;
      }
      spec[side] = { line_id: lineId, ws, we };
    }
    if (spec.from.line_id === spec.to.line_id &&
        spec.from.ws === spec.to.ws && spec.from.we === spec.to.we) {
      return json({ error: 'Une connexion doit relier deux blocs différents.' }, 400);
    }
    links.push(spec);
  }
  return links;
}

async function replaceEssayLinks(env, essayId, links) {
  const statements = [
    env.DB.prepare('DELETE FROM essay_links WHERE essay_id = ?1').bind(essayId),
  ];
  links.forEach((l, i) => {
    statements.push(env.DB.prepare(
      `INSERT INTO essay_links
        (essay_id, position, from_line_id, from_word_start, from_word_end,
         to_line_id, to_word_start, to_word_end, note)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(essayId, i, l.from.line_id, l.from.ws, l.from.we, l.to.line_id, l.to.ws, l.to.we, l.note));
  });
  await env.DB.batch(statements);
}

async function createEssay(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);
  const songId = Number(body.song_id);
  const content = String(body.content || '').trim();
  if (!content) return json({ error: 'L’interprétation ne peut pas être vide.' }, 400);
  if (content.length > 10000) return json({ error: 'Interprétation trop longue (10 000 caractères max).' }, 400);

  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?1').bind(songId).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  const links = await parseEssayLinks(env, body.links);
  if (links instanceof Response) return links;

  const result = await env.DB.prepare(
    'INSERT INTO essays (song_id, user_id, content, is_published, version_id) VALUES (?1, ?2, ?3, 0, NULL)'
  ).bind(songId, user.id, content).run();
  const essayId = result.meta.last_row_id;
  if (links.length) await replaceEssayLinks(env, essayId, links);
  return json({ id: essayId }, 201);
}

async function updateEssay(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const essay = await env.DB.prepare('SELECT id, user_id FROM essays WHERE id = ?1').bind(id).first();
  if (!essay) return json({ error: 'Interprétation introuvable.' }, 404);
  if (essay.user_id !== user.id && !user.is_admin) {
    return json({ error: 'Vous ne pouvez modifier que vos propres interprétations.' }, 403);
  }

  const body = await readJson(request);
  const content = String((body && body.content) || '').trim();
  if (!content) return json({ error: 'L’interprétation ne peut pas être vide.' }, 400);
  if (content.length > 10000) return json({ error: 'Interprétation trop longue (10 000 caractères max).' }, 400);

  const links = await parseEssayLinks(env, body.links);
  if (links instanceof Response) return links;

  await env.DB.prepare(
    `UPDATE essays SET content = ?1, updated_at = datetime('now'), is_published = 0, version_id = NULL WHERE id = ?2`
  ).bind(content, id).run();
  if (body.links !== undefined) await replaceEssayLinks(env, id, links);
  return json({ ok: true });
}

async function deleteEssay(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const essay = await env.DB.prepare('SELECT id, user_id FROM essays WHERE id = ?1').bind(id).first();
  if (!essay) return json({ error: 'Interprétation introuvable.' }, 404);
  if (essay.user_id !== user.id && !user.is_admin) {
    return json({ error: 'Vous ne pouvez supprimer que vos propres interprétations.' }, 403);
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM favorites WHERE target_kind = 'essay' AND target_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM comments WHERE target_kind = 'essay' AND target_id = ?1`).bind(id),
    env.DB.prepare('DELETE FROM essays WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
}

/* ------------------------------------------------------------------ reprises */

// Arborescence complète des reprises : albums (ordre de sortie) → morceaux
// (ordre de piste) → reprises (de la plus récente à la plus ancienne).
// Le fil des reprises : les plus récentes d'abord, à plat, avec le morceau
// repris. Même forme que /api/feed : un élément de plus pour savoir s'il en
// reste.
async function getCoverFeed(env, request, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 30);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const items = (await env.DB.prepare(
    `SELECT c.id, c.song_id, c.user_id, c.title, c.url, c.description, c.created_at,
            u.username, s.title AS song_title, s.slug AS song_slug
       FROM covers c
       JOIN users u ON u.id = c.user_id
       JOIN songs s ON s.id = c.song_id
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ?1 OFFSET ?2`
  ).bind(limit + 1, offset).all()).results;

  const more = items.length > limit;
  if (more) items.pop();

  const viewer = await getUser(request, env);
  await attachSocial(env, viewer, 'cover', 'SELECT id FROM covers', items);
  return json({ items, more });
}

async function listCovers(env, request) {
  const albums = (await env.DB.prepare(
    'SELECT id, title, slug, release_date, is_single FROM albums ORDER BY position, release_date'
  ).all()).results;
  const songs = (await env.DB.prepare(
    'SELECT id, album_id, title, slug, track_number FROM songs ORDER BY track_number, title'
  ).all()).results;
  const covers = (await env.DB.prepare(
    `SELECT c.id, c.song_id, c.user_id, c.title, c.url, c.description, c.created_at, u.username
       FROM covers c JOIN users u ON u.id = c.user_id
      ORDER BY c.created_at DESC`
  ).all()).results;

  const viewer = await getUser(request, env);
  await attachSocial(env, viewer, 'cover', 'SELECT id FROM covers', covers);

  for (const s of songs) s.covers = covers.filter((c) => c.song_id === s.id);
  for (const al of albums) {
    al.is_single = !!al.is_single;
    al.songs = songs.filter((s) => s.album_id === al.id);
  }
  const orphans = songs.filter((s) => !albums.some((al) => al.id === s.album_id));

  return json({ albums, orphans });
}

async function createCover(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);
  const songId = Number(body.song_id);
  const title = String(body.title || '').trim();
  const url = String(body.url || '').trim();
  const description = String(body.description || '').trim();

  if (!title) return json({ error: 'Donnez un titre à votre reprise.' }, 400);
  if (title.length > 200) return json({ error: 'Titre trop long (200 caractères max).' }, 400);
  if (!url || url.length > 600 || !/^https?:\/\//i.test(url)) {
    return json({ error: 'Lien invalide (il doit commencer par http:// ou https://).' }, 400);
  }
  if (description.length > 2000) return json({ error: 'Description trop longue (2000 caractères max).' }, 400);

  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?1').bind(songId).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  const result = await env.DB.prepare(
    'INSERT INTO covers (song_id, user_id, title, url, description) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(songId, user.id, title, url, description || null).run();
  return json({ id: result.meta.last_row_id }, 201);
}

async function deleteCover(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const cover = await env.DB.prepare('SELECT id, user_id FROM covers WHERE id = ?1').bind(id).first();
  if (!cover) return json({ error: 'Reprise introuvable.' }, 404);
  if (cover.user_id !== user.id && !user.is_admin) {
    return json({ error: 'Vous ne pouvez supprimer que vos propres reprises.' }, 403);
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM favorites WHERE target_kind = 'cover' AND target_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM comments WHERE target_kind = 'cover' AND target_id = ?1`).bind(id),
    env.DB.prepare('DELETE FROM covers WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
}

/* ------------------------------------------------------------- publication */

// Rend publiques toutes les interprétations et interprétations d'ensemble
// actuellement en brouillon pour ce membre, regroupées en une nouvelle version.
async function publishVersion(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const pending = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM annotations WHERE user_id = ?1 AND is_published = 0) +
       (SELECT COUNT(*) FROM essays WHERE user_id = ?1 AND is_published = 0) AS n`
  ).bind(user.id).first();
  if (!pending.n) return json({ error: 'Aucune modification en attente de publication.' }, 400);

  const last = await env.DB.prepare(
    'SELECT COALESCE(MAX(number), 0) AS n FROM versions WHERE user_id = ?1'
  ).bind(user.id).first();
  const number = last.n + 1;

  const result = await env.DB.prepare(
    'INSERT INTO versions (user_id, number) VALUES (?1, ?2)'
  ).bind(user.id, number).run();
  const versionId = result.meta.last_row_id;

  await env.DB.batch([
    env.DB.prepare(
      'UPDATE annotations SET is_published = 1, version_id = ?1 WHERE user_id = ?2 AND is_published = 0'
    ).bind(versionId, user.id),
    env.DB.prepare(
      'UPDATE essays SET is_published = 1, version_id = ?1 WHERE user_id = ?2 AND is_published = 0'
    ).bind(versionId, user.id),
  ]);

  const version = await env.DB.prepare(
    'SELECT id, number, published_at FROM versions WHERE id = ?1'
  ).bind(versionId).first();
  return json({ version, count: pending.n }, 201);
}

/* ------------------------------------------------------------------ compte */

async function updateUsername(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  const username = String((body && body.username) || '').trim();
  if (!/^[\p{L}\p{N} _.-]{3,30}$/u.test(username)) {
    return json({ error: 'Le pseudo doit faire entre 3 et 30 caractères (lettres, chiffres, espaces, . _ -).' }, 400);
  }
  if (username === user.username) return json({ ok: true, username });

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ?1 COLLATE NOCASE AND id <> ?2'
  ).bind(username, user.id).first();
  if (existing) return json({ error: 'Ce pseudo est déjà pris.' }, 409);

  await env.DB.prepare('UPDATE users SET username = ?1 WHERE id = ?2').bind(username, user.id).run();
  return json({ ok: true, username });
}

async function updatePassword(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  const current = String((body && body.current_password) || '');
  const next = String((body && body.new_password) || '');
  if (next.length < 8) return json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }, 400);

  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?1').bind(user.id).first();
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    return json({ error: 'Mot de passe actuel incorrect.' }, 401);
  }

  const hash = await hashPassword(next);
  await env.DB.prepare('UPDATE users SET password_hash = ?1 WHERE id = ?2').bind(hash, user.id).run();

  // Changer de mot de passe coupe toutes les autres sessions : si un cookie a
  // fuité, il ne vaut plus rien après ce geste. On garde seulement la session
  // en cours, pour ne pas se déconnecter soi-même.
  const token = getCookie(request, SESSION_COOKIE);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1 AND token <> ?2')
    .bind(user.id, token || '').run();
  return json({ ok: true });
}

// La photo est recadrée en carré et compressée côté client avant l'envoi :
// on ne stocke jamais un fichier brut potentiellement lourd.
async function updateAvatar(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  const dataUrl = String((body && body.data) || '');
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!m) return json({ error: 'Image invalide.' }, 400);
  const [, mime, base64] = m;
  if (base64.length > 1_500_000) return json({ error: 'Image trop lourde.' }, 400);

  await env.DB.prepare(
    'UPDATE users SET avatar_data = ?1, avatar_mime = ?2 WHERE id = ?3'
  ).bind(base64, mime, user.id).run();
  return json({ ok: true });
}

async function getAvatar(env, username) {
  const user = await env.DB.prepare(
    'SELECT avatar_data, avatar_mime FROM users WHERE username = ?1 COLLATE NOCASE'
  ).bind(username).first();
  if (!user || !user.avatar_data) return new Response('', { status: 404 });
  return new Response(fromBase64(user.avatar_data), {
    headers: {
      'Content-Type': user.avatar_mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=600',
    },
  });
}

/* -------------------------------------- les mots de passe de l'EP 57 (/57) */

// Toute la logique du jeu est dans src/enigmas57.js et ne quitte jamais le
// Worker : le client ne reçoit une réponse qu'une fois trouvée.

// La table de progression est additive et n'existe que pour cette page : on
// la crée à la volée si la migration 0009 n'a pas encore été appliquée, une
// seule fois par isolat. `migrations/0009_signes57.sql` reste la référence.
let riddleTableReady = false;
async function ensureRiddleTable(env) {
  if (riddleTableReady) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS riddle_progress (
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         riddle_id TEXT NOT NULL,
         hints_used INTEGER NOT NULL DEFAULT 0,
         revealed INTEGER NOT NULL DEFAULT 0,
         solved_at TEXT,
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (user_id, riddle_id)
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_riddle_progress_user ON riddle_progress(user_id)'),
  ]);
  riddleTableReady = true;
}

/* Un essai par heure. Le délai court dès qu'un mot de passe est proposé,
   juste ou faux : c'est ce qui oblige à réfléchir avant de taper. Il est
   gardé côté serveur : un rechargement de page ne le fait pas sauter.

   La date du dernier essai vit sur une ligne réservée de riddle_progress,
   dont le riddle_id ne correspond à aucune réponse : buildState l'ignore
   comme n'importe quel identifiant inconnu, et il n'y a pas de colonne à
   ajouter à users. */
// Pas d'`export` ici : le module d'entrée d'un Worker ne peut exporter que
// son gestionnaire, le reste fait échouer le démarrage du runtime.
const ESSAI_ROW = '@essai';

// Le délai dépend de l'échelon atteint, et il est relu à chaque fois : monter
// d'un cran allonge donc l'attente en cours. C'est voulu : l'attente est une
// propriété de l'échelon où l'on se trouve. Le moment de la tentative n'y change rien.
async function attenteRestante(env, userId, echelon) {
  await ensureRiddleTable(env);
  const row = await env.DB.prepare(
    `SELECT (julianday('now') - julianday(updated_at)) * 86400000 AS ecoule
       FROM riddle_progress WHERE user_id = ?1 AND riddle_id = ?2`
  ).bind(userId, ESSAI_ROW).first();
  if (!row || row.ecoule == null) return 0;
  return Math.max(0, Math.round(delaiEssaiMs(echelon) - row.ecoule));
}

// Réclame le créneau du minuteur, de façon ATOMIQUE. Renvoie true si le
// créneau était libre (l'essai est autorisé), false s'il court encore.
//
// C'est un unique UPSERT conditionnel : le WHERE du DO UPDATE ne laisse
// réécrire l'horodatage que si le délai est écoulé. D1 sérialise ses écritures,
// donc parmi N requêtes concurrentes du même joueur, une seule modifie la ligne
// (changes = 1) et toutes les autres échouent le WHERE (changes = 0). Au tout
// premier essai, la clé primaire (user_id, '@essai') ne laisse réussir qu'un
// seul INSERT. Un joueur ne peut donc PAS forcer les signes en rafale en
// envoyant dix tentatives à la fois : le vieux schéma « lire l'attente, tester,
// puis marquer » laissait cette course ouverte.
async function marquerEssai(env, userId, delaiMs) {
  await ensureRiddleTable(env);
  const r = await env.DB.prepare(
    `INSERT INTO riddle_progress (user_id, riddle_id, updated_at)
     VALUES (?1, ?2, datetime('now'))
     ON CONFLICT(user_id, riddle_id) DO UPDATE SET updated_at = datetime('now')
       WHERE (julianday('now') - julianday(updated_at)) * 86400000 >= ?3`
  ).bind(userId, ESSAI_ROW, delaiMs).run();
  return r.meta.changes === 1;
}

// Une ligne par réponse trouvée.
async function riddleRows(env, userId) {
  await ensureRiddleTable(env);
  const { results } = await env.DB.prepare(
    'SELECT riddle_id, solved_at FROM riddle_progress WHERE user_id = ?1'
  ).bind(userId).all();
  // Un nœud a pu être réuni à un autre depuis : la progression suit.
  return (results || []).map((r) => ({ ...r, riddle_id: currentAnswerId(r.riddle_id) }));
}

async function riddleState(env, userId) {
  const rows = await riddleRows(env, userId);
  const etat = buildState(rows);
  return { ...etat, attenteMs: await attenteRestante(env, userId, etat.echelon) };
}

// La page se lit sans compte : on voit les éléments, mais rien n'y a été
// trouvé et il n'y a rien à saisir. C'est le POST qui exige un membre.
async function signsState(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ...buildState([]), attenteMs: 0, anonyme: true });
  return json(await riddleState(env, user.id));
}

// Un nœud peut porter plusieurs sens : la réponse proposée est confrontée à
// toutes celles qu'il reste à trouver, dans n'importe quel ordre.
async function signsGuess(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }

  const body = await readJson(request);
  const node = getNode(String(body?.id || ''));
  if (!node) return json({ error: 'Élément introuvable.' }, 404);

  const answer = String(body?.answer ?? '');
  if (answer.length > 200) return json({ error: 'Réponse trop longue.' }, 400);
  if (!answer.trim()) return json({ error: 'Réponse vide.' }, 400);

  // Un essai à la fois, juste ou faux : proposer, c'est déjà jouer.
  const rows = await riddleRows(env, user.id);
  const { solved, parties } = progresOf(rows.filter((r) => r.solved_at).map((r) => r.riddle_id));
  const echelon = echelonOf(solved);

  // On ne fait pas payer un essai sur un élément encore verrouillé : il ne
  // peut de toute façon rien valider.
  if (isLocked(node, solved)) return json({ error: 'Cet élément est encore verrouillé.' }, 403);

  // Le vrai verrou anti-rafale : la réservation atomique du créneau. Une
  // lecture préalable donnerait un 429 plus lisible dans le cas courant, mais
  // ne sérialise rien : c'est ce claim, et lui seul, qui empêche dix essais
  // simultanés de passer ensemble.
  const libre = await marquerEssai(env, user.id, delaiEssaiMs(echelon));
  if (!libre) {
    return json({ error: 'Trop tôt.', attenteMs: await attenteRestante(env, user.id, echelon) }, 429);
  }

  // `echo` rend la proposition mot pour mot : ce qui était juste, ce qui ne
  // l'était pas. Ce qui est juste est gardé même quand le reste est faux.
  const prise = matchNode(node, answer, solved, parties);
  if (!prise || !prise.prises.length) {
    return json({
      ok: false, id: node.id,
      echo: prise ? prise.echo : null,
      attenteMs: delaiEssaiMs(echelon),
    });
  }

  // Une prise s'écrit partie par partie (lignes `id.pN`) ; la réponse entière
  // s'écrit aussi sous son propre identifiant dès qu'elle est complète.
  const lignes = [];
  for (const p of prise.prises) {
    const reponse = node.answers.find((a) => a.id === p.id);
    for (let i = 0; i < reponse.parties.length; i++) {
      if (p.masque & (1 << i)) lignes.push(`${p.id}.p${i}`);
    }
    if (p.complet) lignes.push(p.id);
  }
  const upsert = env.DB.prepare(
    `INSERT INTO riddle_progress (user_id, riddle_id, solved_at)
     VALUES (?1, ?2, datetime('now'))
     ON CONFLICT(user_id, riddle_id) DO UPDATE
       SET solved_at = COALESCE(solved_at, datetime('now')), updated_at = datetime('now')`
  );
  await env.DB.batch(lignes.map((id) => upsert.bind(user.id, id)));

  return json({
    ok: true, id: node.id,
    partiel: prise.prises.some((p) => !p.complet),
    echo: prise.echo,
    state: await riddleState(env, user.id),
  });
}

// Plus proposé dans l'interface, mais conservé : c'est le seul moyen de
// repartir de zéro. On EXCLUT la ligne du minuteur ('@essai') : sans quoi
// remettre sa progression à zéro effacerait aussi le cooldown, et l'on pourrait
// boucler « essai raté → reset → essai » pour forcer les premiers signes sans
// jamais attendre. Le minuteur survit donc au reset.
async function signsReset(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }
  await ensureRiddleTable(env);
  await env.DB.prepare(
    'DELETE FROM riddle_progress WHERE user_id = ?1 AND riddle_id <> ?2'
  ).bind(user.id, ESSAI_ROW).run();
  return json({ ok: true, state: await riddleState(env, user.id) });
}

/* ---------------------------------- références autonomes sur un passage ---
   Sur un passage, trois choses indépendantes peuvent être dites : une
   interprétation, une référence à un passage d'un autre morceau, ou une
   référence à une œuvre. Les deux dernières vivent ici, avec la même cible
   qu'une annotation, et sans dépendre d'une interprétation.               */

// Créée à la volée si la migration 0011 n'a pas encore été appliquée.
let passageRefTableReady = false;
async function ensurePassageRefTable(env) {
  if (passageRefTableReady) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS passage_references (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
         target_type TEXT NOT NULL DEFAULT 'passage',
         line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
         word_start INTEGER,
         word_end INTEGER,
         end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
         kind TEXT NOT NULL,
         label TEXT NOT NULL,
         artist TEXT,
         note TEXT,
         ref_song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
         ref_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
         ref_end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_passage_refs_song ON passage_references(song_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_passage_refs_target ON passage_references(ref_song_id)'),
  ]);
  passageRefTableReady = true;
}

async function createPassageReference(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  if (!body) return json({ error: 'Requête invalide.' }, 400);

  const songId = Number(body.song_id);
  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?1').bind(songId).first();
  if (!song) return json({ error: 'Chanson introuvable.' }, 404);

  // La cible est décrite comme celle d'une annotation.
  const targetType = ['song', 'title', 'line', 'word', 'passage'].includes(body.target_type)
    ? body.target_type : 'passage';
  const lineId = body.line_id == null ? null : Number(body.line_id);
  const endLineId = body.end_line_id == null ? null : Number(body.end_line_id);
  const wordStart = body.word_start == null ? null : Number(body.word_start);
  const wordEnd = body.word_end == null ? null : Number(body.word_end);

  const parsed = await parseReferences(env, [body]);
  if (parsed instanceof Response) return parsed;
  if (!parsed.length) return json({ error: 'Référence vide.' }, 400);
  const r = parsed[0];
  if (!r.note) return json({ error: 'Expliquez en quoi c’est une référence.' }, 400);

  await ensurePassageRefTable(env);
  await env.DB.prepare(
    `INSERT INTO passage_references
      (user_id, song_id, target_type, line_id, word_start, word_end, end_line_id,
       kind, label, artist, note, ref_song_id, ref_line_id, ref_end_line_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
  ).bind(
    user.id, songId, targetType, lineId, wordStart, wordEnd, endLineId,
    r.ref_line_id ? 'internal' : 'work', r.label, r.artist, r.note,
    r.ref_song_id || null, r.ref_line_id || null, r.ref_end_line_id || null
  ).run();
  return json({ ok: true });
}

async function deletePassageReference(request, env, id) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }
  await ensurePassageRefTable(env);
  const row = await env.DB.prepare('SELECT id, user_id FROM passage_references WHERE id = ?1').bind(id).first();
  if (!row) return json({ error: 'Référence introuvable.' }, 404);
  if (row.user_id !== user.id && !user.is_admin) return json({ error: 'Action non autorisée.' }, 403);
  await env.DB.prepare('DELETE FROM passage_references WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

/* ------------------------------------------------- favoris & commentaires */

const FAVORITE_KINDS = { annotation: 'annotations', connection: 'song_connections', essay: 'essays', cover: 'covers' };

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

/* ------------------------------------------------------ les pièces hautes
   Chaque échelon franchi découvre une pièce de plus. Le contrôle est fait
   ici, dans chaque gestionnaire : l'échelon du visiteur est relu à chaque
   requête, jamais supposé.

   Toutes les tables se créent d'elles-mêmes au premier passage, comme
   riddle_progress : le site ne doit pas dépendre d'une migration manuelle. */

let hautesTablesReady = false;
async function ensureHautesTables(env) {
  if (hautesTablesReady) return;
  await env.DB.batch([
    // la conversation : un message, et l'échelon minimal pour le lire
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS conversation_messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         body TEXT NOT NULL,
         min_echelon INTEGER NOT NULL DEFAULT 2,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conv_created ON conversation_messages(created_at)'),
    // les arbres de réflexion : un tronc (le sujet), des branches emboîtées.
    // kind distingue Pense Mieux ('pensee') de la Vidéographie ('video').
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS reflection_trees (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         kind TEXT NOT NULL,
         title TEXT NOT NULL,
         trunk TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_trees_user ON reflection_trees(user_id, kind)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS reflection_branches (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         tree_id INTEGER NOT NULL REFERENCES reflection_trees(id) ON DELETE CASCADE,
         parent_id INTEGER REFERENCES reflection_branches(id) ON DELETE CASCADE,
         body TEXT NOT NULL DEFAULT '',
         url TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_branches_tree ON reflection_branches(tree_id)'),
    // les carrés d'as : quatre membres, un rôle et une connaissance chacun
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carres (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         nom TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    // un As peut appartenir à plusieurs carrés : la clé porte le couple
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_membres (
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         role TEXT,
         domaine TEXT,
         joined_at TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (carre_id, user_id)
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_carre_membres ON carre_membres(carre_id)'),
    // les brainstorms : un live porté par un carré, des idées, des votes
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS brainstorms (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         sujet TEXT NOT NULL,
         plateforme TEXT NOT NULL,
         url TEXT NOT NULL,
         statut TEXT NOT NULL DEFAULT 'annonce',
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         live_depuis TEXT
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_brainstorms_statut ON brainstorms(statut, created_at)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS brainstorm_idees (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         brainstorm_id INTEGER NOT NULL REFERENCES brainstorms(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         body TEXT NOT NULL,
         retenue INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_idees_brainstorm ON brainstorm_idees(brainstorm_id, created_at)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS brainstorm_votes (
         idee_id INTEGER NOT NULL REFERENCES brainstorm_idees(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (idee_id, user_id)
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_votes_idee ON brainstorm_votes(idee_id, created_at)'),
    // une branche peut naître de plusieurs passés : ses liens de nourriture
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS reflection_branch_links (
         branch_id INTEGER NOT NULL REFERENCES reflection_branches(id) ON DELETE CASCADE,
         source_id INTEGER NOT NULL REFERENCES reflection_branches(id) ON DELETE CASCADE,
         PRIMARY KEY (branch_id, source_id)
       )`
    ),
    // la conversation privée d'un carré : son histoire, tout ce qui s'y dit
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         body TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_carre_messages ON carre_messages(carre_id, id)'),
    // le salon de recrutement : les As libres s'annoncent, les carrés invitent
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_annonces (
         user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         note TEXT NOT NULL DEFAULT '',
         role TEXT,
         domaine TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_invitations (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         de_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         note TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         UNIQUE (carre_id, user_id)
       )`
    ),
    // l'évaluation mutuelle : dans chaque domaine, le meilleur du carré vaut
    // 10 et les autres notes se lisent par rapport à lui ; jamais figées
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_notes (
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         rateur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         cible_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         domaine TEXT NOT NULL,
         note INTEGER NOT NULL CHECK (note BETWEEN 1 AND 10),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (carre_id, rateur_id, cible_id, domaine)
       )`
    ),
    // le relatif du carré : ses échanges, et les arbres de pensée que chaque
    // As a choisi de lui offrir (consentement explicite, arbre par arbre)
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_relatif_messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         voix TEXT NOT NULL,
         question TEXT NOT NULL,
         reponse TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_relatif_carre ON carre_relatif_messages(carre_id, id)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_relatif_sources (
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         tree_id INTEGER NOT NULL REFERENCES reflection_trees(id) ON DELETE CASCADE,
         PRIMARY KEY (carre_id, user_id, tree_id)
       )`
    ),
  ]);
  // `retenue` est arrivée après la création de la table sur les bases déjà
  // en service : on regarde avant d'ajouter, ALTER n'est pas idempotent.
  const { results: cols } = await env.DB.prepare('PRAGMA table_info(brainstorm_idees)').all();
  if (!(cols || []).some((c) => c.name === 'retenue')) {
    await env.DB.prepare('ALTER TABLE brainstorm_idees ADD COLUMN retenue INTEGER NOT NULL DEFAULT 0').run();
  }

  // Le carré est devenu pluriel : sur une base d'avant, carre_membres a sa
  // clé primaire sur user_id seul (un carré par As). On reconstruit la table
  // avec la clé (carre_id, user_id) en gardant les rangs existants.
  const { results: mcols } = await env.DB.prepare('PRAGMA table_info(carre_membres)').all();
  const pk = (mcols || []).filter((c) => c.pk > 0).map((c) => c.name);
  if (pk.length && !pk.includes('carre_id')) {
    await env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE carre_membres_v2 (
           user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
           role TEXT,
           domaine TEXT,
           joined_at TEXT NOT NULL DEFAULT (datetime('now')),
           PRIMARY KEY (carre_id, user_id)
         )`
      ),
      env.DB.prepare(
        'INSERT INTO carre_membres_v2 (user_id, carre_id, role, domaine, joined_at) SELECT user_id, carre_id, role, domaine, joined_at FROM carre_membres'
      ),
      env.DB.prepare('DROP TABLE carre_membres'),
      env.DB.prepare('ALTER TABLE carre_membres_v2 RENAME TO carre_membres'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_carre_membres ON carre_membres(carre_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_carre_membres_user ON carre_membres(user_id)'),
    ]);
  }

  // colonnes arrivées avec le carré pluriel : le cap et le salon du carré,
  // l'hôte d'un brainstorm (l'As qui tient l'antenne)
  const { results: ccols } = await env.DB.prepare('PRAGMA table_info(carres)').all();
  if (!(ccols || []).some((c) => c.name === 'cap')) {
    await env.DB.prepare("ALTER TABLE carres ADD COLUMN cap TEXT NOT NULL DEFAULT ''").run();
  }
  if (!(ccols || []).some((c) => c.name === 'discord_url')) {
    await env.DB.prepare("ALTER TABLE carres ADD COLUMN discord_url TEXT NOT NULL DEFAULT ''").run();
  }
  const { results: bcols } = await env.DB.prepare('PRAGMA table_info(brainstorms)').all();
  if (!(bcols || []).some((c) => c.name === 'hote_user_id')) {
    await env.DB.prepare('ALTER TABLE brainstorms ADD COLUMN hote_user_id INTEGER').run();
  }

  // la Psychologie est devenue la Philosophie parmi les quatre connaissances
  await env.DB.batch([
    env.DB.prepare("UPDATE carre_membres SET domaine = 'Philosophie' WHERE domaine = 'Psychologie'"),
    env.DB.prepare("UPDATE carre_annonces SET domaine = 'Philosophie' WHERE domaine = 'Psychologie'"),
  ]);

  hautesTablesReady = true;
}

/* --------------------------------------------- la conversation (échelon 2)
   Une seule conversation, pour tout le monde à partir de l'échelon 2. Mais
   chaque message porte l'échelon minimal pour le lire, choisi par son auteur
   entre 2 et son propre échelon : plus on monte, plus on entend.           */

async function conversationList(request, env) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_CONVERSATION, 'conversation');
  if (refus) return refus;
  await ensureHautesTables(env);
  const plafond = Number.isFinite(vu.echelon) ? vu.echelon : ECHELON_GMO;
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.body, m.min_echelon, m.created_at, u.username
       FROM conversation_messages m JOIN users u ON u.id = m.user_id
      WHERE m.min_echelon <= ?1
      ORDER BY m.id DESC LIMIT 100`
  ).bind(plafond).all();
  return json({ messages: (results || []).reverse(), echelon: plafond });
}

async function conversationPost(request, env) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_CONVERSATION, 'conversation');
  if (refus) return refus;
  if (!vu.user) return json({ error: 'Connexion requise.' }, 401);
  await ensureHautesTables(env);

  const body = await readJson(request);
  const texte = String(body?.body || '').trim();
  if (!texte) return json({ error: 'Message vide.' }, 400);
  if (texte.length > 2000) return json({ error: 'Message trop long (2000 caractères).' }, 400);

  // L'auteur choisit qui peut lire : jamais en dessous de la porte de la
  // page, jamais au-dessus de son propre échelon.
  const plafond = Number.isFinite(vu.echelon) ? vu.echelon : ECHELON_GMO;
  const demande = Number(body?.min_echelon) || ECHELON_CONVERSATION;
  const minEchelon = Math.max(ECHELON_CONVERSATION, Math.min(demande, plafond));

  const r = await env.DB.prepare(
    'INSERT INTO conversation_messages (user_id, body, min_echelon) VALUES (?1, ?2, ?3)'
  ).bind(vu.user.id, texte, minEchelon).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

/* ------------------- les arbres : Pense Mieux (3) et Vidéographie (4) ---
   Même moteur pour les deux : un tronc (le sujet) et des branches emboîtées
   qui se font grandir. En Vidéographie, chaque branche est une vidéo
   YouTube ; l'arbre y organise ce qu'on a extériorisé en vidéo.           */

const ARBRE_KINDS = {
  pensee: { echelon: () => ECHELON_PENSE_MIEUX, cle: 'penseMieux' },
  video: { echelon: () => ECHELON_VIDEOGRAPHIE, cle: 'videographie' },
};

function kindDe(raw) {
  return ARBRE_KINDS[raw] ? raw : null;
}

async function gateArbre(request, env, kind) {
  const def = ARBRE_KINDS[kind];
  const { vu, refus } = await requireEchelon(request, env, def.echelon(), def.cle);
  if (refus) return { refus };
  if (!vu.user) return { refus: json({ error: 'Connexion requise.' }, 401) };
  await ensureHautesTables(env);
  return { vu };
}

// Une URL de vidéo YouTube, et rien d'autre : c'est le matériau imposé de la
// Vidéographie.
function urlYoutubeValide(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.length > 1;
    return host === 'youtube.com' && (u.pathname.startsWith('/watch') || u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/live/') || u.pathname.startsWith('/embed/'));
  } catch { return false; }
}

async function arbresList(request, env, url) {
  const kind = kindDe(url.searchParams.get('kind'));
  if (!kind) return json({ error: 'Nature d’arbre inconnue.' }, 400);
  const { vu, refus } = await gateArbre(request, env, kind);
  if (refus) return refus;
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.title, t.trunk, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM reflection_branches b WHERE b.tree_id = t.id) AS branches
       FROM reflection_trees t WHERE t.user_id = ?1 AND t.kind = ?2
      ORDER BY t.updated_at DESC`
  ).bind(vu.user.id, kind).all();
  return json({ arbres: results || [] });
}

async function arbresCreate(request, env) {
  const body = await readJson(request);
  const kind = kindDe(body?.kind);
  if (!kind) return json({ error: 'Nature d’arbre inconnue.' }, 400);
  const { vu, refus } = await gateArbre(request, env, kind);
  if (refus) return refus;

  const title = String(body?.title || '').trim();
  const trunk = String(body?.trunk || '').trim();
  if (!title) return json({ error: 'Un arbre commence par son sujet.' }, 400);
  if (title.length > 120) return json({ error: 'Sujet trop long (120 caractères).' }, 400);
  if (trunk.length > 4000) return json({ error: 'Tronc trop long (4000 caractères).' }, 400);

  const r = await env.DB.prepare(
    'INSERT INTO reflection_trees (user_id, kind, title, trunk) VALUES (?1, ?2, ?3, ?4)'
  ).bind(vu.user.id, kind, title, trunk).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

// L'arbre entier, branches et liens compris. `proprietaire` distingue le
// sien (modifiable) de celui d'un membre de son carré (lecture seule).
async function chargeArbre(env, id) {
  const tree = await env.DB.prepare(
    'SELECT id, user_id, kind, title, trunk, created_at, updated_at FROM reflection_trees WHERE id = ?1'
  ).bind(id).first();
  if (!tree) return null;
  const { results } = await env.DB.prepare(
    'SELECT id, parent_id, body, url, created_at FROM reflection_branches WHERE tree_id = ?1 ORDER BY id'
  ).bind(id).all();
  // les nourritures : une branche peut naître de plusieurs passés, y compris
  // d'un autre arbre. La chip a donc besoin de connaître sa source.
  const { results: liens } = await env.DB.prepare(
    `SELECT l.branch_id, l.source_id, sb.body AS source_body, sb.url AS source_url,
            st.id AS source_tree_id, st.title AS source_tree_title
       FROM reflection_branch_links l
       JOIN reflection_branches b ON b.id = l.branch_id
       JOIN reflection_branches sb ON sb.id = l.source_id
       JOIN reflection_trees st ON st.id = sb.tree_id
      WHERE b.tree_id = ?1`
  ).bind(id).all();
  return { ...tree, branches: results || [], liens: liens || [] };
}

async function arbresGet(request, env, id) {
  await ensureHautesTables(env);
  const arbre = await chargeArbre(env, id);
  if (!arbre) return json({ error: 'Arbre introuvable.' }, 404);
  // Sous l'échelon requis, on répond « introuvable » plutôt que « pas encore
  // ouvert » : sans quoi le couple 403/404 dirait à un joueur trop bas qu'un
  // arbre existe à cet identifiant. Un arbre qu'on n'a pas le droit de voir se
  // comporte exactement comme un arbre qui n'existe pas.
  const { vu, refus } = await gateArbre(request, env, arbre.kind);
  if (refus) return json({ error: 'Arbre introuvable.' }, 404);

  if (arbre.user_id === vu.user.id) {
    return json({ arbre: { ...arbre, proprietaire: true } });
  }
  // Une vidéographie se partage au sein d'un carré : « analysez mutuellement
  // vos vidéographies ». Un arbre de pensée, lui, reste à son auteur.
  if (arbre.kind === 'video' && await memeCarre(env, vu.user.id, arbre.user_id)) {
    return json({ arbre: { ...arbre, proprietaire: false } });
  }
  return json({ error: 'Arbre introuvable.' }, 404);
}

async function arbresUpdate(request, env, id) {
  await ensureHautesTables(env);
  const tree = await env.DB.prepare('SELECT id, user_id, kind FROM reflection_trees WHERE id = ?1').bind(id).first();
  if (!tree) return json({ error: 'Arbre introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, tree.kind);
  if (refus) return refus;
  if (tree.user_id !== vu.user.id) return json({ error: 'Cet arbre n’est pas le vôtre.' }, 403);

  const body = await readJson(request);
  const title = String(body?.title || '').trim();
  const trunk = String(body?.trunk || '').trim();
  if (!title || title.length > 120) return json({ error: 'Sujet invalide.' }, 400);
  if (trunk.length > 4000) return json({ error: 'Tronc trop long.' }, 400);
  await env.DB.prepare(
    `UPDATE reflection_trees SET title = ?1, trunk = ?2, updated_at = datetime('now') WHERE id = ?3`
  ).bind(title, trunk, id).run();
  return json({ ok: true });
}

async function arbresDelete(request, env, id) {
  await ensureHautesTables(env);
  const tree = await env.DB.prepare('SELECT id, user_id, kind FROM reflection_trees WHERE id = ?1').bind(id).first();
  if (!tree) return json({ error: 'Arbre introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, tree.kind);
  if (refus) return refus;
  if (tree.user_id !== vu.user.id) return json({ error: 'Cet arbre n’est pas le vôtre.' }, 403);
  await env.DB.prepare('DELETE FROM reflection_trees WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

async function branchesCreate(request, env, treeId) {
  await ensureHautesTables(env);
  const tree = await env.DB.prepare('SELECT id, user_id, kind FROM reflection_trees WHERE id = ?1').bind(treeId).first();
  if (!tree) return json({ error: 'Arbre introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, tree.kind);
  if (refus) return refus;
  if (tree.user_id !== vu.user.id) return json({ error: 'Cet arbre n’est pas le vôtre.' }, 403);

  const body = await readJson(request);
  const texte = String(body?.body || '').trim();
  const url = String(body?.url || '').trim();
  const parentId = body?.parent_id == null ? null : Number(body.parent_id);

  if (tree.kind === 'video') {
    if (!urlYoutubeValide(url)) return json({ error: 'Chaque branche d’une vidéographie est une vidéo YouTube.' }, 400);
  } else if (!texte) {
    return json({ error: 'Branche vide.' }, 400);
  }
  if (texte.length > 2000) return json({ error: 'Branche trop longue (2000 caractères).' }, 400);

  if (parentId != null) {
    const parent = await env.DB.prepare(
      'SELECT id FROM reflection_branches WHERE id = ?1 AND tree_id = ?2'
    ).bind(parentId, treeId).first();
    if (!parent) return json({ error: 'Branche mère introuvable.' }, 404);
  }

  const r = await env.DB.prepare(
    'INSERT INTO reflection_branches (tree_id, parent_id, body, url) VALUES (?1, ?2, ?3, ?4)'
  ).bind(treeId, parentId, texte, tree.kind === 'video' ? url : null).run();
  await env.DB.prepare(`UPDATE reflection_trees SET updated_at = datetime('now') WHERE id = ?1`).bind(treeId).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function brancheEtArbre(env, id) {
  return env.DB.prepare(
    `SELECT b.id, b.tree_id, t.user_id, t.kind
       FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
      WHERE b.id = ?1`
  ).bind(id).first();
}

async function branchesUpdate(request, env, id) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, id);
  if (!row) return json({ error: 'Branche introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return refus;
  if (row.user_id !== vu.user.id) return json({ error: 'Cette branche n’est pas la vôtre.' }, 403);

  const body = await readJson(request);
  const texte = String(body?.body || '').trim();
  const url = String(body?.url || '').trim();
  if (row.kind === 'video' && !urlYoutubeValide(url)) return json({ error: 'La branche doit rester une vidéo YouTube.' }, 400);
  if (row.kind !== 'video' && !texte) return json({ error: 'Branche vide.' }, 400);
  if (texte.length > 2000) return json({ error: 'Branche trop longue.' }, 400);

  await env.DB.prepare('UPDATE reflection_branches SET body = ?1, url = ?2 WHERE id = ?3')
    .bind(texte, row.kind === 'video' ? url : null, id).run();
  return json({ ok: true });
}

async function branchesDelete(request, env, id) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, id);
  if (!row) return json({ error: 'Branche introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return refus;
  if (row.user_id !== vu.user.id) return json({ error: 'Cette branche n’est pas la vôtre.' }, 403);
  await env.DB.prepare('DELETE FROM reflection_branches WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

/* Chaque présent est le futur de plusieurs passés : au-delà de sa branche
   mère (sa place dans l'arbre), une branche peut être nourrie par d'autres.
   Ces liens traversent l'arbre sans le déformer : l'arbre reste lisible,
   les nourritures s'y ajoutent en chips. */

async function lienCreate(request, env, brancheId) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, brancheId);
  if (!row) return json({ error: 'Branche introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return refus;
  if (row.user_id !== vu.user.id) return json({ error: 'Cette branche n’est pas la vôtre.' }, 403);

  const body = await readJson(request);
  const sourceId = Number(body?.source_id);
  if (!sourceId || sourceId === brancheId) return json({ error: 'Une branche ne se nourrit pas d’elle-même.' }, 400);
  // la source peut vivre dans n'importe quel arbre de la même forêt : les
  // connexions traversent les arbres, c'est même leur raison d'être
  const source = await env.DB.prepare(
    `SELECT b.id FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
      WHERE b.id = ?1 AND t.user_id = ?2 AND t.kind = ?3`
  ).bind(sourceId, vu.user.id, row.kind).first();
  if (!source) return json({ error: 'Branche source introuvable dans ta forêt.' }, 404);

  await env.DB.prepare(
    'INSERT OR IGNORE INTO reflection_branch_links (branch_id, source_id) VALUES (?1, ?2)'
  ).bind(brancheId, sourceId).run();
  return json({ ok: true }, 201);
}

async function lienDelete(request, env, brancheId, sourceId) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, brancheId);
  if (!row) return json({ error: 'Branche introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return refus;
  if (row.user_id !== vu.user.id) return json({ error: 'Cette branche n’est pas la vôtre.' }, 403);
  await env.DB.prepare(
    'DELETE FROM reflection_branch_links WHERE branch_id = ?1 AND source_id = ?2'
  ).bind(brancheId, sourceId).run();
  return json({ ok: true });
}

// La recherche plein texte dans sa forêt : troncs, sujets et branches.
async function arbresRecherche(request, env, url) {
  const kind = kindDe(url.searchParams.get('kind'));
  if (!kind) return json({ error: 'Nature d’arbre inconnue.' }, 400);
  const { vu, refus } = await gateArbre(request, env, kind);
  if (refus) return refus;
  const q = String(url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json({ arbres: [], branches: [] });
  const motif = '%' + q.replace(/[%_\\]/g, ' ') + '%';

  const arbres = (await env.DB.prepare(
    `SELECT id, title, trunk FROM reflection_trees
      WHERE user_id = ?1 AND kind = ?2 AND (title LIKE ?3 OR trunk LIKE ?3)
      ORDER BY updated_at DESC LIMIT 20`
  ).bind(vu.user.id, kind, motif).all()).results || [];

  const branches = (await env.DB.prepare(
    `SELECT b.id, b.body, b.url, b.created_at, t.id AS tree_id, t.title AS tree_title
       FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
      WHERE t.user_id = ?1 AND t.kind = ?2 AND b.body LIKE ?3
      ORDER BY b.id DESC LIMIT 30`
  ).bind(vu.user.id, kind, motif).all()).results || [];

  return json({ arbres, branches });
}

// La forêt vidéo d'un membre de son propre carré, en lecture : c'est la
// matière du travail mutuel des As.
async function videographieDuMembre(request, env, membreId) {
  const { vu, refus } = await gateArbre(request, env, 'video');
  if (refus) return refus;
  if (!(await memeCarre(env, vu.user.id, membreId))) return json({ error: 'Membre introuvable.' }, 404);
  const membre = await env.DB.prepare('SELECT username FROM users WHERE id = ?1').bind(membreId).first();
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.title, t.trunk, t.updated_at,
            (SELECT COUNT(*) FROM reflection_branches b WHERE b.tree_id = t.id) AS branches
       FROM reflection_trees t WHERE t.user_id = ?1 AND t.kind = 'video'
      ORDER BY t.updated_at DESC`
  ).bind(membreId).all();
  return json({ membre: membre?.username || '', arbres: results || [] });
}

/* --------------------------------------------- le carré d'as (échelon 5)
   Un réseau de carrés. Quatre As par carré, et un As dans plusieurs carrés
   s'il le veut : des groupes de réflexion qui se complètent. Chaque carré
   équilibre deux natures (infinisseur, harmonisateur) et quatre
   connaissances (Philosophie, IA, Religions, Univers), s'évalue domaine par
   domaine, tient un cap, un salon, sa conversation, ses brainstorms et son
   relatif.                                                               */

const MAX_CARRES_PAR_AS = 7;

async function mesCarres(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nom, c.cap, c.discord_url, c.created_at FROM carres c
       JOIN carre_membres m ON m.carre_id = c.id
      WHERE m.user_id = ?1 ORDER BY m.joined_at`
  ).bind(userId).all();
  return results || [];
}

async function monAppartenance(env, carreId, userId) {
  if (!Number.isFinite(carreId)) return null;
  return env.DB.prepare(
    'SELECT user_id, carre_id, role, domaine FROM carre_membres WHERE carre_id = ?1 AND user_id = ?2'
  ).bind(carreId, userId).first();
}

async function membresDe(env, carreId) {
  const { results } = await env.DB.prepare(
    `SELECT m.user_id, m.role, m.domaine, m.joined_at, u.username
       FROM carre_membres m JOIN users u ON u.id = m.user_id
      WHERE m.carre_id = ?1 ORDER BY m.joined_at`
  ).bind(carreId).all();
  return results || [];
}

async function memeCarre(env, a, b) {
  if (a === b) return true;
  await ensureHautesTables(env);
  const row = await env.DB.prepare(
    `SELECT 1 AS oui FROM carre_membres ma JOIN carre_membres mb ON ma.carre_id = mb.carre_id
      WHERE ma.user_id = ?1 AND mb.user_id = ?2`
  ).bind(a, b).first();
  return !!row;
}

// la garde commune des gestes de carré : l'échelon, un compte, les tables
async function gateCarreUser(request, env) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_CARRE, 'carre');
  if (refus) return { refus };
  if (!vu.user) return { refus: json({ error: 'Connexion requise.' }, 401) };
  await ensureHautesTables(env);
  return { vu };
}

/* Le hub : mes carrés, ceux où il reste une place, l'appel du salon. */
async function carreGet(request, env) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_CARRE, 'carre');
  if (refus) return refus;
  await ensureHautesTables(env);

  const reponse = {
    missions: MISSIONS_CARRE, roles: ROLES_CARRE, domaines: DOMAINES_CARRE,
    carres: [], ouverts: [], invitations: 0,
  };
  if (vu.user) {
    const carres = await mesCarres(env, vu.user.id);
    for (const c of carres) c.membres = await membresDe(env, c.id);
    reponse.carres = carres;
    const inv = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM carre_invitations WHERE user_id = ?1'
    ).bind(vu.user.id).first();
    reponse.invitations = inv?.n || 0;
  }
  // les carrés où il reste une place, hors les miens : pour en rejoindre un
  const moi = vu.user ? vu.user.id : 0;
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nom, COUNT(m.user_id) AS membres FROM carres c
       LEFT JOIN carre_membres m ON m.carre_id = c.id
      WHERE c.id NOT IN (SELECT carre_id FROM carre_membres WHERE user_id = ?1)
      GROUP BY c.id HAVING membres < 4 ORDER BY c.created_at DESC LIMIT 25`
  ).bind(moi).all();
  reponse.ouverts = results || [];
  return json(reponse);
}

async function carreCreate(request, env) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const dejas = await mesCarres(env, vu.user.id);
  if (dejas.length >= MAX_CARRES_PAR_AS) {
    return json({ error: `${MAX_CARRES_PAR_AS} carrés au plus par As.` }, 409);
  }

  const body = await readJson(request);
  const nom = String(body?.nom || '').trim();
  if (!nom || nom.length > 60) return json({ error: 'Donnez un nom à votre carré (60 caractères au plus).' }, 400);

  const r = await env.DB.prepare('INSERT INTO carres (nom) VALUES (?1)').bind(nom).run();
  await env.DB.prepare('INSERT INTO carre_membres (user_id, carre_id) VALUES (?1, ?2)')
    .bind(vu.user.id, r.meta.last_row_id).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function carreJoin(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if ((await mesCarres(env, vu.user.id)).length >= MAX_CARRES_PAR_AS) {
    return json({ error: `${MAX_CARRES_PAR_AS} carrés au plus par As.` }, 409);
  }
  const carre = await env.DB.prepare('SELECT id FROM carres WHERE id = ?1').bind(carreId).first();
  if (!carre) return json({ error: 'Carré introuvable.' }, 404);
  if (await monAppartenance(env, carreId, vu.user.id)) return json({ error: 'Vous y êtes déjà.' }, 409);
  const membres = await membresDe(env, carreId);
  if (membres.length >= 4) return json({ error: 'Ce carré est complet.' }, 409);

  await env.DB.prepare('INSERT INTO carre_membres (user_id, carre_id) VALUES (?1, ?2)')
    .bind(vu.user.id, carreId).run();
  return json({ ok: true });
}

/* La page d'un carré. Membre : tout. Un autre As de l'échelon 5 : la façade
   seulement : le nom, les As, les places : rien que l'annuaire ne montrait
   déjà. */
async function carreDetail(request, env, carreId) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_CARRE, 'carre');
  if (refus) return refus;
  await ensureHautesTables(env);
  if (!Number.isFinite(carreId)) return json({ error: 'Carré introuvable.' }, 404);
  const carre = await env.DB.prepare(
    'SELECT id, nom, cap, discord_url, created_at FROM carres WHERE id = ?1'
  ).bind(carreId).first();
  if (!carre) return json({ error: 'Carré introuvable.' }, 404);
  const membres = await membresDe(env, carreId);
  const moi = vu.user ? await monAppartenance(env, carreId, vu.user.id) : null;

  if (!moi) {
    return json({
      publique: true,
      roles: ROLES_CARRE,
      domaines: DOMAINES_CARRE,
      carre: { id: carre.id, nom: carre.nom },
      membres: membres.map((m) => ({ user_id: m.user_id, username: m.username, role: m.role, domaine: m.domaine })),
      places: 4 - membres.length,
    });
  }

  const { results: notes } = await env.DB.prepare(
    'SELECT rateur_id, cible_id, domaine, note FROM carre_notes WHERE carre_id = ?1'
  ).bind(carreId).all();
  const { results: bs } = await env.DB.prepare(
    `SELECT b.id, b.sujet, b.statut, b.plateforme, b.created_at, u.username AS hote_username,
            (SELECT COUNT(*) FROM brainstorm_idees i WHERE i.brainstorm_id = b.id AND i.retenue = 1) AS retenues
       FROM brainstorms b LEFT JOIN users u ON u.id = b.hote_user_id
      WHERE b.carre_id = ?1 ORDER BY b.id DESC LIMIT 20`
  ).bind(carreId).all();

  return json({
    publique: false,
    roles: ROLES_CARRE,
    domaines: DOMAINES_CARRE,
    carre,
    membres,
    moi: { role: moi.role, domaine: moi.domaine },
    notes: notes || [],
    brainstorms: bs || [],
    places: 4 - membres.length,
  });
}

// le salon d'organisation d'un carré vit sur Discord : on ne pointe que vers lui
function lienDiscordValide(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)discord\.(gg|com)$/.test(u.hostname.replace(/^www\./, ''));
  } catch { return false; }
}

/* Le cap et le salon du carré : ce que le carré vise, où il s'organise. */
async function carreUpdate(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);
  const carre = await env.DB.prepare('SELECT nom, cap, discord_url FROM carres WHERE id = ?1').bind(carreId).first();

  const body = await readJson(request);
  const nom = body?.nom === undefined ? carre.nom : String(body.nom).trim();
  const cap = body?.cap === undefined ? carre.cap : String(body.cap).trim();
  const discord = body?.discord_url === undefined ? carre.discord_url : String(body.discord_url).trim();
  if (!nom || nom.length > 60) return json({ error: 'Nom invalide (60 caractères au plus).' }, 400);
  if (cap.length > 1000) return json({ error: 'Le cap tient en 1000 caractères.' }, 400);
  if (!lienDiscordValide(discord)) return json({ error: 'Le salon doit être un lien Discord (https).' }, 400);

  await env.DB.prepare('UPDATE carres SET nom = ?1, cap = ?2, discord_url = ?3 WHERE id = ?4')
    .bind(nom, cap, discord, carreId).run();
  return json({ ok: true });
}

async function carreUpdateMoi(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);

  const body = await readJson(request);
  const role = body?.role == null || body.role === '' ? null : String(body.role);
  const domaine = body?.domaine == null || body.domaine === '' ? null : String(body.domaine);
  if (role && !ROLES_CARRE.includes(role)) return json({ error: 'Rôle inconnu.' }, 400);
  if (domaine && !DOMAINES_CARRE.includes(domaine)) return json({ error: 'Connaissance inconnue.' }, 400);

  await env.DB.prepare('UPDATE carre_membres SET role = ?1, domaine = ?2 WHERE carre_id = ?3 AND user_id = ?4')
    .bind(role, domaine, carreId, vu.user.id).run();
  return json({ ok: true });
}

/* L'évaluation mutuelle. Chacun note les trois autres, domaine par domaine,
   de 1 à 10 : le meilleur du domaine vaut 10 et les autres notes se lisent
   par rapport à lui. Tout le carré voit toutes les notes : la transparence
   est la discussion. Rien n'est figé : on affine.                        */
async function carreNotes(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);
  const membres = await membresDe(env, carreId);
  const ids = new Set(membres.map((m) => m.user_id));

  const body = await readJson(request);
  const notes = Array.isArray(body?.notes) ? body.notes.slice(0, 48) : [];
  const upsert = env.DB.prepare(
    `INSERT INTO carre_notes (carre_id, rateur_id, cible_id, domaine, note, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
     ON CONFLICT(carre_id, rateur_id, cible_id, domaine) DO UPDATE
       SET note = ?5, updated_at = datetime('now')`
  );
  const lot = [];
  for (const n of notes) {
    const cible = Number(n?.cible_id);
    const domaine = String(n?.domaine || '');
    const note = Number(n?.note);
    if (!ids.has(cible) || cible === vu.user.id) return json({ error: 'On note les autres As du carré.' }, 400);
    if (!DOMAINES_CARRE.includes(domaine)) return json({ error: 'Connaissance inconnue.' }, 400);
    if (!Number.isInteger(note) || note < 1 || note > 10) return json({ error: 'Une note va de 1 à 10.' }, 400);
    lot.push(upsert.bind(carreId, vu.user.id, cible, domaine, note));
  }
  if (lot.length) await env.DB.batch(lot);
  return json({ ok: true });
}

/* La conversation du carré : privée, réservée à ses As. C'est aussi son
   histoire : tout ce qui s'y est dit reste, tant que le carré vit.        */
async function carreChatList(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.body, m.created_at, u.username
       FROM carre_messages m JOIN users u ON u.id = m.user_id
      WHERE m.carre_id = ?1 ORDER BY m.id DESC LIMIT 100`
  ).bind(carreId).all();
  return json({ messages: (results || []).reverse() });
}

async function carreChatPost(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);

  const body = await readJson(request);
  const texte = String(body?.body || '').trim();
  if (!texte) return json({ error: 'Message vide.' }, 400);
  if (texte.length > 2000) return json({ error: 'Message trop long (2000 caractères).' }, 400);
  const r = await env.DB.prepare(
    'INSERT INTO carre_messages (carre_id, user_id, body) VALUES (?1, ?2, ?3)'
  ).bind(carreId, vu.user.id, texte).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function carreLeave(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM carre_membres WHERE carre_id = ?1 AND user_id = ?2').bind(carreId, vu.user.id),
    env.DB.prepare('DELETE FROM carre_notes WHERE carre_id = ?1 AND (rateur_id = ?2 OR cible_id = ?2)').bind(carreId, vu.user.id),
    env.DB.prepare('DELETE FROM carre_relatif_sources WHERE carre_id = ?1 AND user_id = ?2').bind(carreId, vu.user.id),
  ]);
  // un carré vide ne garde pas de coquille : tout ce qui était à lui s'en va
  const restants = await membresDe(env, carreId);
  if (!restants.length) {
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM brainstorm_votes WHERE idee_id IN (
           SELECT i.id FROM brainstorm_idees i
           JOIN brainstorms b ON b.id = i.brainstorm_id WHERE b.carre_id = ?1)`
      ).bind(carreId),
      env.DB.prepare(
        'DELETE FROM brainstorm_idees WHERE brainstorm_id IN (SELECT id FROM brainstorms WHERE carre_id = ?1)'
      ).bind(carreId),
      env.DB.prepare('DELETE FROM brainstorms WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carre_messages WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carre_invitations WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carre_notes WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carre_relatif_messages WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carre_relatif_sources WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carres WHERE id = ?1').bind(carreId),
    ]);
  }
  return json({ ok: true });
}

/* L'annuaire des As : tous ceux qui ont atteint l'échelon du carré, avec
   leurs carrés. L'échelon d'un membre est déjà public sur son profil :
   l'annuaire ne montre rien de plus, il rassemble.                        */
async function carreAnnuaire(request, env) {
  const { refus } = await requireEchelon(request, env, ECHELON_CARRE, 'carre');
  if (refus) return refus;
  await ensureHautesTables(env);

  // l'échelon se recalcule des signes trouvés : seule vérité, jamais figée
  const { results } = await env.DB.prepare(
    'SELECT user_id, riddle_id FROM riddle_progress WHERE solved_at IS NOT NULL'
  ).all();
  const parUser = new Map();
  for (const r of results || []) {
    if (!parUser.has(r.user_id)) parUser.set(r.user_id, new Set());
    parUser.get(r.user_id).add(currentAnswerId(r.riddle_id));
  }
  const hauts = [...parUser.entries()]
    .map(([id, ids]) => ({ id, echelon: echelonOf(progresOf(ids).solved) }))
    .filter((u) => u.echelon >= ECHELON_CARRE);
  if (!hauts.length) return json({ as: [] });

  const marks = hauts.map((_, i) => `?${i + 1}`).join(',');
  const users = (await env.DB.prepare(
    `SELECT u.id, u.username,
            (SELECT GROUP_CONCAT(c.nom, ' · ') FROM carre_membres m
              JOIN carres c ON c.id = m.carre_id WHERE m.user_id = u.id) AS carres
       FROM users u WHERE u.id IN (${marks})`
  ).bind(...hauts.map((u) => u.id)).all()).results || [];

  const echelonDe = new Map(hauts.map((u) => [u.id, u.echelon]));
  const as = users
    .map((u) => ({ username: u.username, echelon: echelonDe.get(u.id), carres: u.carres || null }))
    .sort((a, b) => b.echelon - a.echelon || a.username.localeCompare(b.username));
  return json({ as });
}

/* Le salon de recrutement. Les As s'y annoncent : quelques mots sur ce
   qu'ils apporteraient, leur nature, leur connaissance : et les carrés où il
   reste une place les invitent. L'invité accepte ou décline : personne
   n'entre dans un carré sans l'avoir voulu des deux côtés.                */

async function carreRecrutement(request, env) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;

  const annonces = (await env.DB.prepare(
    `SELECT a.user_id, a.note, a.role, a.domaine, a.created_at, u.username,
            (SELECT COUNT(*) FROM carre_membres m WHERE m.user_id = a.user_id) AS carres
       FROM carre_annonces a
       JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 50`
  ).all()).results || [];

  const carres = await mesCarres(env, vu.user.id);
  const mesCarresAvecPlaces = [];
  for (const c of carres) {
    const membres = await membresDe(env, c.id);
    mesCarresAvecPlaces.push({ id: c.id, nom: c.nom, places: 4 - membres.length });
  }

  const reponse = {
    // la charte du bon carré, en une phrase : celle des missions
    charte: MISSIONS_CARRE.blocs[0].texte,
    roles: ROLES_CARRE,
    domaines: DOMAINES_CARRE,
    annonces: annonces.map((a) => ({ ...a, moi: a.user_id === vu.user.id })),
    monAnnonce: await env.DB.prepare(
      'SELECT note, role, domaine FROM carre_annonces WHERE user_id = ?1'
    ).bind(vu.user.id).first(),
    invitations: (await env.DB.prepare(
      `SELECT i.id, i.note, i.created_at, i.carre_id, c.nom AS carre_nom, u.username AS de_username
         FROM carre_invitations i
         JOIN carres c ON c.id = i.carre_id
         JOIN users u ON u.id = i.de_user_id
        WHERE i.user_id = ?1 ORDER BY i.id DESC`
    ).bind(vu.user.id).all()).results || [],
    mesCarres: mesCarresAvecPlaces,
    envoyees: [],
  };

  if (carres.length) {
    const marks = carres.map((_, i) => `?${i + 1}`).join(',');
    reponse.envoyees = (await env.DB.prepare(
      `SELECT i.id, i.note, i.created_at, i.carre_id, c.nom AS carre_nom, u.username
         FROM carre_invitations i
         JOIN carres c ON c.id = i.carre_id
         JOIN users u ON u.id = i.user_id
        WHERE i.carre_id IN (${marks}) ORDER BY i.id DESC`
    ).bind(...carres.map((c) => c.id)).all()).results || [];
  }
  return json(reponse);
}

async function carreAnnoncePut(request, env) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;

  const body = await readJson(request);
  const note = String(body?.note || '').trim();
  const role = body?.role ? String(body.role) : null;
  const domaine = body?.domaine ? String(body.domaine) : null;
  if (note.length > 500) return json({ error: 'L’annonce tient en 500 caractères.' }, 400);
  if (role && !ROLES_CARRE.includes(role)) return json({ error: 'Rôle inconnu.' }, 400);
  if (domaine && !DOMAINES_CARRE.includes(domaine)) return json({ error: 'Connaissance inconnue.' }, 400);

  await env.DB.prepare(
    `INSERT INTO carre_annonces (user_id, note, role, domaine) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id) DO UPDATE SET note = ?2, role = ?3, domaine = ?4`
  ).bind(vu.user.id, note, role, domaine).run();
  return json({ ok: true });
}

async function carreAnnonceDelete(request, env) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  await env.DB.prepare('DELETE FROM carre_annonces WHERE user_id = ?1').bind(vu.user.id).run();
  return json({ ok: true });
}

async function carreInvite(request, env) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;

  const body = await readJson(request);
  const carreId = Number(body?.carre_id);
  const username = String(body?.username || '').trim();
  const note = String(body?.note || '').trim();
  if (note.length > 300) return json({ error: 'Le mot d’invitation tient en 300 caractères.' }, 400);
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);
  const membres = await membresDe(env, carreId);
  if (membres.length >= 4) return json({ error: 'Ce carré est complet.' }, 409);

  // on n'invite que ceux qui se sont annoncés au salon, et pas dans ce carré
  const cible = await env.DB.prepare(
    `SELECT u.id FROM users u
       JOIN carre_annonces a ON a.user_id = u.id
      WHERE u.username = ?1 COLLATE NOCASE`
  ).bind(username).first();
  if (!cible) return json({ error: 'Cet As n’est pas au salon.' }, 404);
  if (cible.id === vu.user.id) return json({ error: 'On ne s’invite pas soi-même.' }, 400);
  if (membres.some((m) => m.user_id === cible.id)) return json({ error: 'Cet As est déjà dans ce carré.' }, 409);

  await env.DB.prepare(
    `INSERT INTO carre_invitations (carre_id, user_id, de_user_id, note) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(carre_id, user_id) DO UPDATE SET note = ?4, de_user_id = ?3`
  ).bind(carreId, cible.id, vu.user.id, note).run();
  return json({ ok: true }, 201);
}

async function carreInviteAccepte(request, env, id) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const invitation = await env.DB.prepare(
    'SELECT id, carre_id FROM carre_invitations WHERE id = ?1 AND user_id = ?2'
  ).bind(id, vu.user.id).first();
  if (!invitation) return json({ error: 'Invitation introuvable.' }, 404);
  if ((await mesCarres(env, vu.user.id)).length >= MAX_CARRES_PAR_AS) {
    return json({ error: `${MAX_CARRES_PAR_AS} carrés au plus par As.` }, 409);
  }
  if (await monAppartenance(env, invitation.carre_id, vu.user.id)) {
    await env.DB.prepare('DELETE FROM carre_invitations WHERE id = ?1').bind(id).run();
    return json({ error: 'Vous êtes déjà dans ce carré.' }, 409);
  }
  const membres = await membresDe(env, invitation.carre_id);
  if (membres.length >= 4) return json({ error: 'Ce carré s’est rempli entre-temps.' }, 409);

  // l'annonce portait déjà la nature et la connaissance : elles suivent.
  // Elle reste au salon : un As peut vouloir d'autres carrés encore.
  const annonce = await env.DB.prepare(
    'SELECT role, domaine FROM carre_annonces WHERE user_id = ?1'
  ).bind(vu.user.id).first();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO carre_membres (user_id, carre_id, role, domaine) VALUES (?1, ?2, ?3, ?4)')
      .bind(vu.user.id, invitation.carre_id, annonce?.role || null, annonce?.domaine || null),
    env.DB.prepare('DELETE FROM carre_invitations WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true, carre_id: invitation.carre_id });
}

async function carreInviteRefuse(request, env, id) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  // l'invité décline, ou le carré qui a invité retire sa main
  const invitation = await env.DB.prepare(
    `SELECT i.id FROM carre_invitations i
      WHERE i.id = ?1 AND (i.user_id = ?2
         OR i.carre_id IN (SELECT carre_id FROM carre_membres WHERE user_id = ?2))`
  ).bind(id, vu.user.id).first();
  if (!invitation) return json({ error: 'Invitation introuvable.' }, 404);
  await env.DB.prepare('DELETE FROM carre_invitations WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

/* ------------------------------------------------- le relatif du carré ---
   L'IA du carré, bâtie sur Pense Mieux. Chaque As choisit, arbre par arbre,
   les pensées qu'il offre au relatif : rien de privé ne le nourrit sans ce
   geste. Les vidéographies, déjà partagées au carré, le nourrissent aussi,
   comme le cap et la récolte des brainstorms. Le relatif parle d'une voix :
   celle d'un As, ou celle du carré entier.                               */

const RELATIF_MODELES = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];

// Le portrait d'un As : ses arbres offerts et ses vidéographies, compilés en
// texte borné. C'est la matière du relatif, et c'est aussi ce qu'on copie
// pour porter la voix ailleurs.
async function portraitDe(env, carreId, userId, plafond = 6000) {
  const { results: arbres } = await env.DB.prepare(
    `SELECT t.id, t.title, t.trunk FROM reflection_trees t
      WHERE t.user_id = ?1 AND (t.kind = 'video' OR t.id IN (
        SELECT tree_id FROM carre_relatif_sources WHERE carre_id = ?2 AND user_id = ?1))
      ORDER BY t.updated_at DESC LIMIT 12`
  ).bind(userId, carreId).all();
  const morceaux = [];
  for (const t of arbres || []) {
    morceaux.push(`Arbre « ${t.title} »${t.trunk ? ` : ${t.trunk}` : ''}`);
    const { results: branches } = await env.DB.prepare(
      "SELECT body FROM reflection_branches WHERE tree_id = ?1 AND body <> '' ORDER BY id LIMIT 40"
    ).bind(t.id).all();
    for (const b of branches || []) morceaux.push(`- ${b.body}`);
  }
  const texte = morceaux.join('\n');
  return texte.length > plafond ? texte.slice(0, plafond) : texte;
}

async function portraitCarre(env, carre, membres) {
  const morceaux = [];
  if (carre.cap) morceaux.push(`Le cap du carré : ${carre.cap}`);
  const { results: retenues } = await env.DB.prepare(
    `SELECT i.body FROM brainstorm_idees i
       JOIN brainstorms b ON b.id = i.brainstorm_id
      WHERE b.carre_id = ?1 AND i.retenue = 1 ORDER BY i.id DESC LIMIT 30`
  ).bind(carre.id).all();
  if ((retenues || []).length) {
    morceaux.push('La récolte des brainstorms :');
    for (const r of retenues) morceaux.push(`- ${r.body}`);
  }
  for (const m of membres) {
    const p = await portraitDe(env, carre.id, m.user_id, 1500);
    if (p) morceaux.push(`\n${m.username}${m.domaine ? ` (${m.domaine})` : ''} :\n${p}`);
  }
  const texte = morceaux.join('\n');
  return texte.length > 6500 ? texte.slice(0, 6500) : texte;
}

async function relatifGet(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);
  const carre = await env.DB.prepare('SELECT id, nom, cap FROM carres WHERE id = ?1').bind(carreId).first();
  const membres = await membresDe(env, carreId);

  const echanges = ((await env.DB.prepare(
    `SELECT r.id, r.voix, r.question, r.reponse, r.created_at, u.username
       FROM carre_relatif_messages r JOIN users u ON u.id = r.user_id
      WHERE r.carre_id = ?1 ORDER BY r.id DESC LIMIT 30`
  ).bind(carreId).all()).results || []).reverse();

  // mes arbres de pensée, et ceux que j'ai déjà offerts à ce carré
  const { results: miens } = await env.DB.prepare(
    `SELECT id, title FROM reflection_trees WHERE user_id = ?1 AND kind = 'pensee'
      ORDER BY updated_at DESC LIMIT 50`
  ).bind(vu.user.id).all();
  const { results: offerts } = await env.DB.prepare(
    'SELECT tree_id FROM carre_relatif_sources WHERE carre_id = ?1 AND user_id = ?2'
  ).bind(carreId, vu.user.id).all();

  // le portrait de la voix demandée, prêt à copier
  const voix = new URL(request.url).searchParams.get('voix') || '';
  let portrait = '';
  if (voix === 'carre') portrait = await portraitCarre(env, carre, membres);
  else if (voix && membres.some((m) => String(m.user_id) === voix)) {
    portrait = await portraitDe(env, carreId, Number(voix));
  }

  return json({
    eveille: !!env.AI,
    carre: { id: carre.id, nom: carre.nom },
    membres: membres.map((m) => ({ user_id: m.user_id, username: m.username, domaine: m.domaine })),
    echanges,
    mesArbres: miens || [],
    offerts: (offerts || []).map((o) => o.tree_id),
    portrait,
  });
}

// Offrir (ou reprendre) ses arbres de pensée au relatif de CE carré. On ne
// peut offrir que ses propres arbres de pensée : le serveur revérifie tout.
async function relatifSources(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);

  const body = await readJson(request);
  const demandes = Array.isArray(body?.tree_ids) ? body.tree_ids.slice(0, 50).map(Number) : [];
  const valides = [];
  for (const treeId of demandes) {
    if (!Number.isFinite(treeId)) continue;
    const t = await env.DB.prepare(
      "SELECT id FROM reflection_trees WHERE id = ?1 AND user_id = ?2 AND kind = 'pensee'"
    ).bind(treeId, vu.user.id).first();
    if (t) valides.push(treeId);
  }
  const lot = [
    env.DB.prepare('DELETE FROM carre_relatif_sources WHERE carre_id = ?1 AND user_id = ?2')
      .bind(carreId, vu.user.id),
    ...valides.map((treeId) => env.DB.prepare(
      'INSERT INTO carre_relatif_sources (carre_id, user_id, tree_id) VALUES (?1, ?2, ?3)'
    ).bind(carreId, vu.user.id, treeId)),
  ];
  await env.DB.batch(lot);
  return json({ ok: true, offerts: valides });
}

async function relatifPost(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);
  const carre = await env.DB.prepare('SELECT id, nom, cap FROM carres WHERE id = ?1').bind(carreId).first();
  const membres = await membresDe(env, carreId);

  const body = await readJson(request);
  const voix = String(body?.voix || '');
  const question = String(body?.question || '').trim();
  if (!question) return json({ error: 'Question vide.' }, 400);
  if (question.length > 500) return json({ error: 'Une question tient en 500 caractères.' }, 400);

  let systeme;
  let portrait;
  if (voix === 'carre') {
    portrait = await portraitCarre(env, carre, membres);
    systeme = `Tu es le relatif du carré « ${carre.nom } » : la voix commune de ses As. `
      + 'Tu parles à partir du cap du carré, de la récolte de ses brainstorms et des pensées de ses As, données ci-dessous. '
      + 'Reste fidèle à ce qu\'elles disent ; si elles ne disent rien sur la question, dis-le simplement. '
      + 'Réponds en français, en quelques phrases.';
  } else {
    const m = membres.find((x) => String(x.user_id) === voix);
    if (!m) return json({ error: 'Voix inconnue.' }, 400);
    portrait = await portraitDe(env, carreId, m.user_id);
    systeme = `Tu es le relatif de ${m.username}, un As du carré « ${carre.nom} ». `
      + 'Tu parles en son nom, à la première personne, à partir de ses pensées données ci-dessous. '
      + 'Reste fidèle à ce qu\'elles disent ; si elles ne disent rien sur la question, dis-le simplement. '
      + 'Réponds en français, en quelques phrases.';
  }
  if (!portrait) {
    return json({ error: 'Cette voix n’a encore rien offert au relatif : des arbres de pensée d’abord.' }, 409);
  }

  if (!env.AI) {
    return json({ error: 'Le relatif dort ici : copie le portrait de la voix et porte-le à ton IA.' }, 503);
  }

  const messages = [
    { role: 'system', content: `${systeme}\n\n${portrait}` },
    { role: 'user', content: question },
  ];
  let reponse = '';
  for (const modele of RELATIF_MODELES) {
    try {
      const r = await env.AI.run(modele, { messages, max_tokens: 600 });
      reponse = String(r?.response || '').trim();
      if (reponse) break;
    } catch { /* on essaie le modèle suivant */ }
  }
  if (!reponse) {
    return json({ error: 'Le relatif n’a pas répondu : réessaie, ou copie le portrait.' }, 502);
  }

  await env.DB.prepare(
    'INSERT INTO carre_relatif_messages (carre_id, user_id, voix, question, reponse) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(carreId, vu.user.id, voix, question, reponse).run();
  return json({ ok: true, reponse });
}

/* ---------------------------------------------- le brainstorm (échelon 6)
   Un carré complet annonce un live (TikTok, YouTube ou Twitch). Pendant le
   live, la salle propose des réflexions et vote ; le carré voit monter les
   plus soutenues du moment. Tout marche par relecture périodique côté
   client, sans serveur temps réel ni connexion tenue ouverte. Le
   coût d'un brainstorm à mille personnes est celui de requêtes ordinaires. */

const PLATEFORMES_LIVE = {
  youtube: (u) => /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname.replace(/^www\.|^m\./, '')),
  twitch: (u) => /(^|\.)twitch\.tv$/.test(u.hostname.replace(/^www\./, '')),
  tiktok: (u) => /(^|\.)tiktok\.com$/.test(u.hostname.replace(/^www\./, '')),
};

async function brainstormsList(request, env) {
  const { refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  await ensureHautesTables(env);
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.sujet, b.plateforme, b.url, b.statut, b.created_at, b.live_depuis,
            c.nom AS carre_nom, h.username AS hote_username,
            (SELECT COUNT(*) FROM brainstorm_idees i WHERE i.brainstorm_id = b.id) AS idees,
            (SELECT COUNT(*) FROM brainstorm_idees i WHERE i.brainstorm_id = b.id AND i.retenue = 1) AS retenues
       FROM brainstorms b JOIN carres c ON c.id = b.carre_id
       LEFT JOIN users h ON h.id = b.hote_user_id
      ORDER BY CASE b.statut WHEN 'live' THEN 0 WHEN 'annonce' THEN 1 ELSE 2 END,
               COALESCE(b.live_depuis, b.created_at) DESC
      LIMIT 50`
  ).all();
  return json({ brainstorms: results || [] });
}

async function brainstormsCreate(request, env) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  if (!vu.user) return json({ error: 'Connexion requise.' }, 401);
  await ensureHautesTables(env);

  const body = await readJson(request);

  // un brainstorm est porté par UN de mes carrés, complet : quatre As
  const carreId = Number(body?.carre_id);
  if (!(await monAppartenance(env, carreId, vu.user.id))) {
    return json({ error: 'Un brainstorm est porté par un de vos carrés d’as.' }, 403);
  }
  const carre = await env.DB.prepare('SELECT id, nom FROM carres WHERE id = ?1').bind(carreId).first();
  const membres = await membresDe(env, carreId);
  if (membres.length < 4) return json({ error: 'Le carré doit être complet : quatre As.' }, 403);

  // l'hôte : l'As du carré qui tient l'antenne, celui du meilleur matériel
  const hote = body?.hote_user_id == null || body.hote_user_id === ''
    ? vu.user.id : Number(body.hote_user_id);
  if (!membres.some((m) => m.user_id === hote)) {
    return json({ error: 'L’hôte doit être un As du carré.' }, 400);
  }

  const sujet = String(body?.sujet || '').trim();
  const plateforme = String(body?.plateforme || '');
  const url = String(body?.url || '').trim();
  if (!sujet || sujet.length > 200) return json({ error: 'Donnez un sujet (200 caractères au plus).' }, 400);
  if (!PLATEFORMES_LIVE[plateforme]) return json({ error: 'Plateforme inconnue : YouTube, Twitch ou TikTok.' }, 400);
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !PLATEFORMES_LIVE[plateforme](u)) {
      return json({ error: 'Le lien ne correspond pas à la plateforme.' }, 400);
    }
  } catch { return json({ error: 'Lien invalide.' }, 400); }

  const r = await env.DB.prepare(
    'INSERT INTO brainstorms (carre_id, user_id, sujet, plateforme, url, hote_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  ).bind(carre.id, vu.user.id, sujet, plateforme, url, hote).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

/* Le classement du direct. Une réflexion monte parce qu'on vient de la
   soutenir : chaque vote pèse selon son âge : la dernière minute pèse 8, les
   cinq dernières 4, les dix dernières 2, le reste 1. C'est tout l'algorithme,
   et il tient dans une requête : rien à maintenir, rien qui tourne en fond,
   le classement se recalcule à la lecture.                                 */
async function brainstormGet(request, env, id) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  await ensureHautesTables(env);

  const b = await env.DB.prepare(
    `SELECT b.id, b.sujet, b.plateforme, b.url, b.statut, b.created_at, b.live_depuis,
            b.carre_id, c.nom AS carre_nom, c.discord_url, h.username AS hote_username
       FROM brainstorms b JOIN carres c ON c.id = b.carre_id
       LEFT JOIN users h ON h.id = b.hote_user_id
      WHERE b.id = ?1`
  ).bind(id).first();
  if (!b) return json({ error: 'Brainstorm introuvable.' }, 404);

  const viewerId = vu.user ? vu.user.id : 0;
  const enAvant = (await env.DB.prepare(
    `SELECT i.id, i.body, i.created_at, i.retenue, u.username,
            COUNT(v.user_id) AS votes,
            COALESCE(SUM(CASE
              WHEN (julianday('now') - julianday(v.created_at)) * 1440 <= 1 THEN 8
              WHEN (julianday('now') - julianday(v.created_at)) * 1440 <= 5 THEN 4
              WHEN (julianday('now') - julianday(v.created_at)) * 1440 <= 10 THEN 2
              ELSE 1 END), 0) AS score,
            MAX(CASE WHEN v.user_id = ?2 THEN 1 ELSE 0 END) AS mon_vote
       FROM brainstorm_idees i
       JOIN users u ON u.id = i.user_id
       LEFT JOIN brainstorm_votes v ON v.idee_id = i.id
      WHERE i.brainstorm_id = ?1
      GROUP BY i.id
      ORDER BY score DESC, i.id DESC
      LIMIT 20`
  ).bind(id, viewerId).all()).results || [];

  const recentes = (await env.DB.prepare(
    `SELECT i.id, i.body, i.created_at, i.retenue, u.username,
            (SELECT COUNT(*) FROM brainstorm_votes v WHERE v.idee_id = i.id) AS votes,
            EXISTS(SELECT 1 FROM brainstorm_votes v WHERE v.idee_id = i.id AND v.user_id = ?2) AS mon_vote
       FROM brainstorm_idees i JOIN users u ON u.id = i.user_id
      WHERE i.brainstorm_id = ?1 ORDER BY i.id DESC LIMIT 20`
  ).bind(id, viewerId).all()).results || [];

  // la récolte : ce que le carré a retenu du live
  const retenues = (await env.DB.prepare(
    `SELECT i.id, i.body, i.created_at, i.retenue, u.username,
            (SELECT COUNT(*) FROM brainstorm_votes v WHERE v.idee_id = i.id) AS votes,
            EXISTS(SELECT 1 FROM brainstorm_votes v WHERE v.idee_id = i.id AND v.user_id = ?2) AS mon_vote
       FROM brainstorm_idees i JOIN users u ON u.id = i.user_id
      WHERE i.brainstorm_id = ?1 AND i.retenue = 1 ORDER BY votes DESC, i.id LIMIT 40`
  ).bind(id, viewerId).all()).results || [];

  const duCarre = vu.user ? !!(await env.DB.prepare(
    'SELECT 1 AS oui FROM carre_membres WHERE user_id = ?1 AND carre_id = ?2'
  ).bind(vu.user.id, b.carre_id).first()) : false;

  // le salon Discord du carré n'appartient qu'à ses As
  if (!duCarre) delete b.discord_url;

  return json({ brainstorm: b, enAvant, recentes, retenues, duCarre });
}

// Retenir une réflexion, ou la relâcher : la récolte du brainstorming,
// choisie par le carré qui le porte pendant que la salle vote.
async function brainstormRetenue(request, env, id) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  if (!vu.user) return json({ error: 'Connexion requise.' }, 401);
  await ensureHautesTables(env);

  const b = await env.DB.prepare('SELECT id, carre_id FROM brainstorms WHERE id = ?1').bind(id).first();
  if (!b) return json({ error: 'Brainstorm introuvable.' }, 404);
  const membre = await env.DB.prepare(
    'SELECT 1 AS oui FROM carre_membres WHERE user_id = ?1 AND carre_id = ?2'
  ).bind(vu.user.id, b.carre_id).first();
  if (!membre && !vu.user.is_admin) return json({ error: 'Seul le carré qui le porte retient.' }, 403);

  const body = await readJson(request);
  const ideeId = Number(body?.idee_id);
  const idee = await env.DB.prepare(
    'SELECT id, retenue FROM brainstorm_idees WHERE id = ?1 AND brainstorm_id = ?2'
  ).bind(ideeId, id).first();
  if (!idee) return json({ error: 'Réflexion introuvable.' }, 404);

  await env.DB.prepare('UPDATE brainstorm_idees SET retenue = ?1 WHERE id = ?2')
    .bind(idee.retenue ? 0 : 1, ideeId).run();
  return json({ ok: true, retenue: !idee.retenue });
}

async function brainstormUpdate(request, env, id) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  if (!vu.user) return json({ error: 'Connexion requise.' }, 401);
  await ensureHautesTables(env);

  const b = await env.DB.prepare('SELECT id, carre_id, statut FROM brainstorms WHERE id = ?1').bind(id).first();
  if (!b) return json({ error: 'Brainstorm introuvable.' }, 404);
  const membre = await env.DB.prepare(
    'SELECT 1 AS oui FROM carre_membres WHERE user_id = ?1 AND carre_id = ?2'
  ).bind(vu.user.id, b.carre_id).first();
  if (!membre && !vu.user.is_admin) return json({ error: 'Seul le carré qui le porte peut le piloter.' }, 403);

  const body = await readJson(request);
  const statut = String(body?.statut || '');
  if (!['annonce', 'live', 'termine'].includes(statut)) return json({ error: 'Statut inconnu.' }, 400);
  await env.DB.prepare(
    `UPDATE brainstorms SET statut = ?1,
            live_depuis = CASE WHEN ?1 = 'live' THEN COALESCE(live_depuis, datetime('now')) ELSE live_depuis END
      WHERE id = ?2`
  ).bind(statut, id).run();
  return json({ ok: true });
}

async function brainstormIdee(request, env, id) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  if (!vu.user) return json({ error: 'Connexion requise.' }, 401);
  await ensureHautesTables(env);

  const b = await env.DB.prepare('SELECT id, statut FROM brainstorms WHERE id = ?1').bind(id).first();
  if (!b) return json({ error: 'Brainstorm introuvable.' }, 404);
  if (b.statut === 'termine') return json({ error: 'Ce brainstorm est terminé.' }, 409);

  const body = await readJson(request);
  const texte = String(body?.body || '').trim();
  if (!texte) return json({ error: 'Réflexion vide.' }, 400);
  if (texte.length > 500) return json({ error: 'Une réflexion tient en 500 caractères.' }, 400);

  const r = await env.DB.prepare(
    'INSERT INTO brainstorm_idees (brainstorm_id, user_id, body) VALUES (?1, ?2, ?3)'
  ).bind(id, vu.user.id, texte).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

// Voter, ou reprendre son vote : le même geste.
async function brainstormVote(request, env, id) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  if (!vu.user) return json({ error: 'Connexion requise.' }, 401);
  await ensureHautesTables(env);

  const body = await readJson(request);
  const ideeId = Number(body?.idee_id);
  const idee = await env.DB.prepare(
    'SELECT id FROM brainstorm_idees WHERE id = ?1 AND brainstorm_id = ?2'
  ).bind(ideeId, id).first();
  if (!idee) return json({ error: 'Réflexion introuvable.' }, 404);

  const existe = await env.DB.prepare(
    'SELECT 1 AS oui FROM brainstorm_votes WHERE idee_id = ?1 AND user_id = ?2'
  ).bind(ideeId, vu.user.id).first();
  if (existe) {
    await env.DB.prepare('DELETE FROM brainstorm_votes WHERE idee_id = ?1 AND user_id = ?2')
      .bind(ideeId, vu.user.id).run();
    return json({ ok: true, vote: false });
  }
  await env.DB.prepare('INSERT INTO brainstorm_votes (idee_id, user_id) VALUES (?1, ?2)')
    .bind(ideeId, vu.user.id).run();
  return json({ ok: true, vote: true });
}

/* ------------------------------------ Game Master Orange (échelon 7) --- */

async function gmoGet(request, env) {
  const { refus } = await requireEchelon(request, env, ECHELON_GMO, 'gmo');
  if (refus) return refus;
  return json({ mecanismes: MECANISMES_GMO });
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
    env.DB.prepare(
      `DELETE FROM favorites WHERE target_kind = 'essay'
        AND target_id IN (SELECT id FROM essays WHERE song_id = ?1)`).bind(id),
    env.DB.prepare(
      `DELETE FROM comments WHERE target_kind = 'essay'
        AND target_id IN (SELECT id FROM essays WHERE song_id = ?1)`).bind(id),
    env.DB.prepare(
      `DELETE FROM favorites WHERE target_kind = 'cover'
        AND target_id IN (SELECT id FROM covers WHERE song_id = ?1)`).bind(id),
    env.DB.prepare(
      `DELETE FROM comments WHERE target_kind = 'cover'
        AND target_id IN (SELECT id FROM covers WHERE song_id = ?1)`).bind(id),
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
