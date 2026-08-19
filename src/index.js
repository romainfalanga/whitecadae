// WhiteCadae : Cloudflare Worker (API + service du site statique)

import {
  getNode, isLocked, matchNode, buildState, currentAnswerId, echelonOf, accessOf,
  delaiEssaiMs, enigmesTrouvees, progresOf,
  ECHELON_CONVERSATION, ECHELON_PENSE_MIEUX, ECHELON_VIDEOGRAPHIE,
  ECHELON_CARRE, ECHELON_BRAINSTORM, ECHELON_GMO,
} from './enigmas57.js';
import {
  CHARTE_CARRE, MECANISMES_GMO, AXES, AXES_ORDRE,
  CADENCES, CADENCES_ORDRE, REPONSES,
  VOLETS_SOCIETE, VOLETS_CLES,
} from './contenus.js';

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
   lecteur YouTube des vidéos (`frame-src`), et rien d'autre. `frame-ancestors
   'none'` interdit en retour de mettre le site dans le cadre de quelqu'un
   d'autre, donc de faire cliquer un membre à son insu.                      */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  // le vocal : l'audio vient du site, ou du blob qu'on vient d'enregistrer
  "media-src 'self' blob:",
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
  // le micro est ouvert au site lui-même : Pense Mieux s'écrit à la voix.
  // Tout le reste reste fermé, la caméra comprise.
  'Permissions-Policy': 'geolocation=(), microphone=(self), camera=(), payment=(), usb=()',
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
  // les littéraux avant :id, qui avalerait « rythme » et « recap »
  if (route('GET', '/api/videographie/rythme')) return videographieRythme(request, env);
  if (route('PUT', '/api/videographie/recap')) return videographieRecap(request, env);
  if ((p = route('DELETE', '/api/videographie/recap/:id'))) return videographieRecapDelete(request, env, +p[0]);
  // la galerie des univers : le seul endroit où les arbres de tous se lisent
  // le vocal : la pensée dite, transcrite, rejouée
  if (route('POST', '/api/vocal/transcription')) return vocalTranscription(request, env);
  if (route('PUT', '/api/voix')) return voixPut(request, env);
  if ((p = route('POST', '/api/branches/:id/vocal'))) return vocalAttache(request, env, +p[0]);
  if ((p = route('GET', '/api/branches/:id/vocal'))) return vocalSert(request, env, +p[0]);
  if ((p = route('DELETE', '/api/branches/:id/vocal'))) return vocalDetache(request, env, +p[0]);

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
  if ((p = route('POST', '/api/carre/:id/rejoindre'))) return carreJoin(request, env, +p[0]);
  if ((p = route('POST', '/api/carre/:id/quitter'))) return carreLeave(request, env, +p[0]);
  if ((p = route('GET', '/api/carre/:id/conversation'))) return carreChatList(request, env, +p[0]);
  if ((p = route('POST', '/api/carre/:id/conversation'))) return carreChatPost(request, env, +p[0]);
  // les sociétés harmonieuses : ce qu'un carré imagine ensemble
  if ((p = route('POST', '/api/carre/:id/societes'))) return societeCreate(request, env, +p[0]);
  if ((p = route('GET', '/api/societes/:id'))) return societeGet(request, env, +p[0]);
  if ((p = route('PUT', '/api/societes/:id'))) return societeUpdate(request, env, +p[0]);
  if ((p = route('DELETE', '/api/societes/:id'))) return societeDelete(request, env, +p[0]);
  if ((p = route('POST', '/api/societes/:id/idees'))) return societeIdee(request, env, +p[0]);
  if ((p = route('DELETE', '/api/societes/:id/idees/:idee'))) return societeIdeeDelete(request, env, +p[0], +p[1]);

  if (route('GET', '/api/brainstorms')) return brainstormsList(request, env, url);
  if (route('POST', '/api/brainstorms')) return brainstormsCreate(request, env);
  if ((p = route('GET', '/api/brainstorms/:id'))) return brainstormGet(request, env, +p[0]);
  if ((p = route('PUT', '/api/brainstorms/:id'))) return brainstormUpdate(request, env, +p[0]);
  if ((p = route('POST', '/api/brainstorms/:id/idees'))) return brainstormIdee(request, env, +p[0]);
  if ((p = route('POST', '/api/brainstorms/:id/votes'))) return brainstormVote(request, env, +p[0]);
  if ((p = route('POST', '/api/brainstorms/:id/retenues'))) return brainstormRetenue(request, env, +p[0]);

  if (route('GET', '/api/gmo')) return gmoGet(request, env);

  // --- le tronc commun : les interprétations. Ouvert dès l'échelon 1, donc à
  //     tout le monde, visiteur compris : le barrage ne ferme plus que ce qui
  //     est au-dessus. On le garde en place : si un jour un échelon doit se
  //     refermer, il suffit de relever la constante.
  if (path.startsWith('/api/') && !path.startsWith('/api/admin/')) {
    const refus = await requireAccess(request, env, 'interpretations');
    if (refus) return refus;
  }

  // --- lecture
  if (route('GET', '/api/albums')) return listAlbums(env, request);
  if (route('GET', '/api/corpus')) return getCorpus(env, request);
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
  // les interprétations, en lecture.
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
  // le réglage de voix suit le compte : la chaîne audio s'y accorde dès la
  // première page, sans requête de plus
  let voix = null;
  if (user) {
    await ensureHautesTables(env);
    const l = await env.DB.prepare('SELECT voix FROM users WHERE id = ?1').bind(user.id).first();
    try { voix = l && l.voix ? JSON.parse(l.voix) : null; } catch { voix = null; }
  }
  return json({
    user: user ? { ...user, is_admin: !!user.is_admin, voix } : null,
    access,
    echelon: Number.isFinite(echelon) ? echelon : ECHELON_GMO,
    attenteMs: user && Number.isFinite(echelon) ? await attenteRestante(env, user.id, echelon) : 0,
  });
}

/* ---------------------------------------------------------------- lecture */

// Toutes les phrases de tous les morceaux (hors balises de section et
// lignes vides) : sert au constructeur d'interprétations d'ensemble et
// au moteur de suggestions d'échos.
async function getCorpus(env, request) {
  const viewer = await getUser(request, env);
  const viewerId = viewer ? viewer.id : 0;
  const songs = (await env.DB.prepare(
    'SELECT id, title, slug FROM songs ORDER BY title'
  ).all()).results;
  const lines = (await env.DB.prepare(
    `SELECT id, song_id, line_number, text FROM lyric_lines
      WHERE text <> '' AND text NOT LIKE '[%' ORDER BY song_id, line_number`
  ).all()).results;

  // Nombre de MES interprétations couvrant chaque phrase : une référence
  // interne ne vise qu'un passage que j'ai déjà interprété, puisque je suis
  // le seul à lire ce que j'écris.
  const spans = (await env.DB.prepare(
    `SELECT a.song_id, ls.line_number AS from_no,
            COALESCE(le.line_number, ls.line_number) AS to_no
       FROM annotations a
       JOIN lyric_lines ls ON ls.id = a.line_id
       LEFT JOIN lyric_lines le ON le.id = a.end_line_id
      WHERE a.line_id IS NOT NULL AND a.user_id = ?1`
  ).bind(viewerId).all()).results;

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

async function listAlbums(env, request) {
  const viewer = await getUser(request, env);
  const viewerId = viewer ? viewer.id : 0;
  const albums = (await env.DB.prepare(
    'SELECT id, title, slug, release_date, is_single FROM albums ORDER BY position, release_date'
  ).all()).results;
  // le compteur dit ce que MOI j'ai écrit sur ce morceau : c'est ma mémoire
  // qui se chiffre, pas celle des autres
  const songs = (await env.DB.prepare(
    `SELECT s.id, s.album_id, s.title, s.slug, s.track_number,
            (SELECT COUNT(*) FROM annotations a WHERE a.song_id = s.id AND a.user_id = ?1) AS annotation_count,
            (SELECT COUNT(*) FROM lyric_lines l WHERE l.song_id = s.id AND l.text <> '') AS line_count
       FROM songs s ORDER BY s.track_number, s.title`
  ).bind(viewerId).all()).results;
  for (const album of albums) {
    album.is_single = !!album.is_single;
    album.songs = songs.filter((s) => s.album_id === album.id);
  }
  const orphans = songs.filter((s) => !albums.some((a) => a.id === s.album_id));
  return json({ albums, orphans });
}

async function getSong(env, request, slug) {
  await ensureReferenceColumns(env);
  /* Une interprétation n'appartient qu'à celui qui l'écrit. C'est SA mémoire
     de ce morceau : ce qu'il y a lu, ce qu'il y a relié. Personne d'autre ne
     la voit — ni un visiteur, ni un autre membre. Toutes les requêtes qui
     suivent sont donc bornées à `viewerId`, et un visiteur sans compte lit
     les paroles sans rien d'autre. */
  const viewer = await getUser(request, env);
  const viewerId = viewer ? viewer.id : 0;

  const song = await env.DB.prepare(
    `SELECT s.id, s.title, s.slug, s.track_number, s.youtube_url, s.duration_seconds, s.album_id,
            al.title AS album_title
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
      WHERE a.song_id = ?1 AND a.user_id = ?2
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
      WHERE (c.song_a_id = ?1 OR c.song_b_id = ?1) AND c.user_id = ?2
      ORDER BY c.created_at`
  ).bind(song.id, viewerId).all()).results;

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
      WHERE r.ref_song_id = ?1 AND a.song_id <> ?1 AND a.user_id = ?2
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
      WHERE pr.song_id = ?1 AND pr.user_id = ?2
      ORDER BY pr.created_at`
  ).bind(song.id, viewerId).all()).results;

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
      WHERE pr.ref_song_id = ?1 AND pr.song_id <> ?1 AND pr.user_id = ?2
      ORDER BY pr.created_at`
  ).bind(song.id, viewerId).all()).results;

  // Interprétations d'ensemble et leurs connexions entre blocs.
  const essays = (await env.DB.prepare(
    `SELECT e.id, e.user_id, e.content, e.created_at, e.updated_at, e.is_published, u.username
       FROM essays e JOIN users u ON u.id = e.user_id
      WHERE e.song_id = ?1 AND e.user_id = ?2
      ORDER BY e.created_at`
  ).bind(song.id, viewerId).all()).results;
  const essayLinks = (await env.DB.prepare(
    `SELECT el.id, el.essay_id, el.note,
            el.from_line_id, el.from_word_start, el.from_word_end,
            el.to_line_id, el.to_word_start, el.to_word_end,
            lf.text AS from_text, sf.title AS from_song_title,
            lt.text AS to_text, st.title AS to_song_title
       FROM essay_links el
       JOIN lyric_lines lf ON lf.id = el.from_line_id
       JOIN songs sf ON sf.id = lf.song_id
       JOIN lyric_lines lt ON lt.id = el.to_line_id
       JOIN songs st ON st.id = lt.song_id
      WHERE el.essay_id IN (SELECT id FROM essays WHERE song_id = ${song.id} AND user_id = ${viewerId})
      ORDER BY el.essay_id, el.position`
  ).all()).results;
  for (const e of essays) e.links = essayLinks.filter((l) => l.essay_id === e.id);

  // Références jointes aux interprétations (libres ou internes).
  const refs = (await env.DB.prepare(
    `SELECT r.id, r.annotation_id, r.label, r.artist, r.note,
            r.ref_song_id, r.ref_line_id, r.ref_end_line_id, rs.slug AS ref_song_slug
       FROM annotation_references r
       LEFT JOIN songs rs ON rs.id = r.ref_song_id
      WHERE r.annotation_id IN (SELECT id FROM annotations WHERE song_id = ?1 AND user_id = ?2)
      ORDER BY r.annotation_id, r.position`
  ).bind(song.id, viewerId).all()).results;
  for (const a of annotations) {
    a.references = refs.filter((r) => r.annotation_id === a.id);
  }

  return json({ song, lines, annotations, connections, essays, inbound, passageRefs, inboundRefs, allSongs });
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
            le.text AS end_line_text
       FROM annotations a
       JOIN songs s ON s.id = a.song_id
       LEFT JOIN albums al ON al.id = s.album_id
       LEFT JOIN lyric_lines l ON l.id = a.line_id
       LEFT JOIN lyric_lines le ON le.id = a.end_line_id
      WHERE a.user_id = ?1 AND ?2 = 1
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
      WHERE e.user_id = ?1 AND ?2 = 1
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
            rs.slug AS ref_song_slug
       FROM passage_references pr
       JOIN songs s ON s.id = pr.song_id
       LEFT JOIN lyric_lines l ON l.id = pr.line_id
       LEFT JOIN lyric_lines le ON le.id = pr.end_line_id
       LEFT JOIN songs rs ON rs.id = pr.ref_song_id
      WHERE pr.user_id = ?1 AND ?2 = 1
      ORDER BY pr.created_at DESC`
  ).bind(user.id, isOwner).all()).results;

  const connections = (await env.DB.prepare(
    `SELECT c.id, c.explanation, c.created_at,
            sa.title AS song_a_title, sa.slug AS song_a_slug,
            sb.title AS song_b_title, sb.slug AS song_b_slug
       FROM song_connections c
       JOIN songs sa ON sa.id = c.song_a_id
       JOIN songs sb ON sb.id = c.song_b_id
      WHERE c.user_id = ?1 AND ?2 = 1 ORDER BY c.created_at`
  ).bind(user.id, isOwner).all()).results;

  /* Les compteurs disent ce que ce membre a fait, sans rien en montrer :
     ses interprétations sont sa mémoire. */
  const stats = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM annotations WHERE user_id = ?1) AS annotations,
       (SELECT COUNT(*) FROM essays WHERE user_id = ?1) AS essays,
       (SELECT COUNT(*) FROM song_connections WHERE user_id = ?1) AS connections`
  ).bind(user.id).first();

  return json({
    user: { username: user.username, created_at: user.created_at, is_admin: !!user.is_admin },
    jeu,
    stats, annotations, essays, passageRefs, connections,
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
    env.DB.prepare('DELETE FROM essays WHERE id = ?1').bind(id),
  ]);
  return json({ ok: true });
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
    // `axe` marque les deux troncs qui existent d'avance pour chacun : le moi
    // harmonieux et la société harmonieuse. `carre_id` distingue l'arbre d'un
    // carré de l'arbre d'une personne. Les deux restent nuls pour un arbre
    // libre, qui se plante et s'abat comme avant.
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS reflection_trees (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         kind TEXT NOT NULL,
         title TEXT NOT NULL,
         trunk TEXT NOT NULL DEFAULT '',
         axe TEXT,
         carre_id INTEGER,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_trees_user ON reflection_trees(user_id, kind)'),
    // `user_id` : l'auteur d'une branche. Dans l'arbre d'une personne il ne
    // dit rien de plus que l'arbre ; dans celui d'un carré, il dit qui parle.
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS reflection_branches (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         tree_id INTEGER NOT NULL REFERENCES reflection_trees(id) ON DELETE CASCADE,
         parent_id INTEGER REFERENCES reflection_branches(id) ON DELETE CASCADE,
         user_id INTEGER,
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
    // se situer soi-même, au recrutement : dans les quatre connaissances, la
    // meilleure vaut 10 et les trois autres se lisent par rapport à elle. La
    // note ne dit pas ce qu'on vaut, elle dit où l'on est le meilleur.
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_auto_notes (
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         domaine TEXT NOT NULL,
         note INTEGER NOT NULL CHECK (note BETWEEN 1 AND 10),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (user_id, domaine)
       )`
    ),
    // le rythme de la Vidéographie : une vidéo par semaine, par mois, par an.
    // `periode` est la clé de la période récapitulée (2026-W33, 2026-08,
    // 2026) : une seule vidéo par période, qu'on peut corriger.
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS videographie_recaps (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         cadence TEXT NOT NULL,
         periode TEXT NOT NULL,
         url TEXT NOT NULL,
         note TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         UNIQUE (user_id, cadence, periode)
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_recaps_user ON videographie_recaps(user_id, cadence, periode)'),
    // le vocal d'une branche : l'audio (en base64, comme l'avatar), sa
    // transcription minutée mot à mot, et sa durée. C'est de quoi rejouer la
    // pensée en faisant apparaître le texte au fur et à mesure.
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS branch_vocaux (
         branch_id INTEGER PRIMARY KEY REFERENCES reflection_branches(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         mime TEXT NOT NULL,
         audio TEXT NOT NULL,
         mots TEXT NOT NULL DEFAULT '[]',
         duree REAL NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    // les sociétés harmonieuses d'un carré : ce que les quatre imaginent
    // ensemble. Chaque société a un nom ; ses idées se rangent sur deux
    // volets : ce qui lui permet d'être ('etre'), comment on y vit ('vivre').
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS carre_societes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
         nom TEXT NOT NULL,
         creee_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_societes_carre ON carre_societes(carre_id, updated_at)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS societe_idees (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         societe_id INTEGER NOT NULL REFERENCES carre_societes(id) ON DELETE CASCADE,
         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         volet TEXT NOT NULL CHECK (volet IN ('etre', 'vivre')),
         body TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_idees_societe ON societe_idees(societe_id, volet, id)'),
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

  // Les deux troncs : l'axe d'un arbre, le carré auquel il appartient, et
  // l'auteur d'une branche. Sur une base neuve, les CREATE TABLE plus haut
  // portent déjà ces colonnes et ces ALTER ne s'exécutent pas.
  //
  // Ces instructions restent HORS du batch du dessus, et séparées les unes
  // des autres : un batch est une transaction, or les index qui suivent
  // portent sur des colonnes que les ALTER viennent d'ajouter. Le PRAGMA et
  // l'ALTER ne forment pas un geste atomique : au premier instant d'un
  // déploiement, plusieurs isolats entrent ici ensemble. Le perdant de la
  // course trouve la colonne déjà posée, et c'est tout ce qu'on voulait ; on
  // relit donc le schéma avant de laisser passer l'erreur.
  await ajouteColonne(env, 'reflection_trees', 'axe', 'ALTER TABLE reflection_trees ADD COLUMN axe TEXT');
  await ajouteColonne(env, 'reflection_trees', 'carre_id', 'ALTER TABLE reflection_trees ADD COLUMN carre_id INTEGER');
  await ajouteColonne(env, 'reflection_branches', 'user_id', 'ALTER TABLE reflection_branches ADD COLUMN user_id INTEGER');
  // Ce qu'un As dépose chez un autre : approfondir, élargir, opposer et
  // résoudre. Nul pour ce que l'on écrit chez soi.
  await ajouteColonne(env, 'reflection_branches', 'reponse', 'ALTER TABLE reflection_branches ADD COLUMN reponse TEXT');
  // `prive` a existé le temps où toute réflexion sortait par défaut. C'est
  // désormais l'axe qui décide de ce qui se partage, et rien d'autre : la
  // colonne reste pour ne pas toucher aux bases en service, mais plus
  // personne ne la lit.
  await ajouteColonne(env, 'reflection_trees', 'prive',
    'ALTER TABLE reflection_trees ADD COLUMN prive INTEGER NOT NULL DEFAULT 0');

  /* La psychologie et le moi harmonieux ne vivent plus dans un carré : ils
     sont à leur porteur et à personne d'autre. Ceux qui existaient
     redescendent dans sa forêt personnelle, avec la mémoire du carré dans
     leur nom — rien de ce qui a été écrit n'est perdu. Idempotent : au second
     passage il n'y en a plus. */
  await env.DB.prepare(
    `UPDATE reflection_trees
        SET axe = NULL,
            title = title || ' · ' || COALESCE((SELECT nom FROM carres WHERE id = carre_id), 'un carré'),
            carre_id = NULL
      WHERE carre_id IS NOT NULL AND axe IN ('psy', 'moi')`
  ).run();

  // les univers sont devenus le multivers : le titre suit
  await env.DB.batch([
    env.DB.prepare(`UPDATE reflection_trees SET title = 'Mon multivers'
                     WHERE axe = 'univers' AND carre_id IS NULL AND title = 'Mes univers'`),
    env.DB.prepare(`UPDATE reflection_trees SET title = 'Notre multivers'
                     WHERE axe = 'univers' AND carre_id IS NOT NULL AND title = 'Nos univers'`),
  ]);
  // Le réglage de voix : ce que la chaîne audio applique au timbre de chacun.
  await ajouteColonne(env, 'users', 'voix', 'ALTER TABLE users ADD COLUMN voix TEXT');

  /* Un seul espace par axe, par personne et par outil. Les index partiels
     qui suivent et qui portent sur `carre_id` datent du temps où un carré
     écrivait en commun : plus aucun arbre n'a de carré, ils ne s'appliquent
     donc à rien. On ne les défait pas — un index qui ne trouve jamais de
     ligne ne coûte rien, et défaire est toujours plus risqué que laisser. */
  for (const sql of [
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_perso ON reflection_trees(user_id, kind, axe)
       WHERE axe IS NOT NULL AND carre_id IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_moi ON reflection_trees(carre_id, user_id, axe)
       WHERE carre_id IS NOT NULL AND axe = 'moi'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_psy ON reflection_trees(carre_id, user_id, axe)
       WHERE carre_id IS NOT NULL AND axe = 'psy'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_societe ON reflection_trees(carre_id, axe)
       WHERE carre_id IS NOT NULL AND axe = 'societe'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_philo ON reflection_trees(carre_id, axe)
       WHERE carre_id IS NOT NULL AND axe = 'philo'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trees_axe_univers ON reflection_trees(carre_id, axe)
       WHERE carre_id IS NOT NULL AND axe = 'univers'`,
    'CREATE INDEX IF NOT EXISTS idx_trees_carre ON reflection_trees(carre_id)',
    // la galerie des univers lit tous les troncs publics d'un outil
    `CREATE INDEX IF NOT EXISTS idx_trees_axe ON reflection_trees(axe, kind)`,
  ]) {
    await env.DB.prepare(sql).run();
  }

  /* La Vidéographie n'a plus d'axes : elle a un rythme. Les troncs qu'elle
     portait redescendent dans sa forêt — rien de ce qui y était écrit n'est
     perdu, mais ils redeviennent des arbres ordinaires, qu'on peut abattre.
     Idempotent : au second passage il n'y en a plus. */
  await env.DB.prepare(
    `UPDATE reflection_trees SET axe = NULL
      WHERE kind = 'video' AND axe IS NOT NULL AND carre_id IS NULL`
  ).run();

  /* Pense Mieux se range : une réflexion naît désormais DANS un espace, ou
     dans une catégorie qu'on y a créée. `parent_id` dit où elle vit, `genre`
     ce qu'elle est (`categorie` ou `reflexion`). Les espaces gardent
     leur axe et un parent nul. */
  await ajouteColonne(env, 'reflection_trees', 'parent_id',
    'ALTER TABLE reflection_trees ADD COLUMN parent_id INTEGER');
  await ajouteColonne(env, 'reflection_trees', 'genre',
    'ALTER TABLE reflection_trees ADD COLUMN genre TEXT');
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_trees_parent ON reflection_trees(parent_id)'
  ).run();

  /* Le multivers redevient personnel : les modèles d'univers ne se
     travaillent ni dans un carré ni sous le regard de la plateforme. Les
     multivers DE carré redescendent chez celui qui les avait ouverts, avec la
     mémoire du carré dans leur nom — rien n'est perdu. Idempotent. */
  await env.DB.prepare(
    `UPDATE reflection_trees
        SET axe = NULL,
            title = title || ' · ' || COALESCE((SELECT nom FROM carres WHERE id = carre_id), 'un carré'),
            carre_id = NULL
      WHERE carre_id IS NOT NULL AND axe = 'univers'`
  ).run();

  /* Un carré est celui d'UNE personne : celle qui l'a fondé. La colonne
     naît ici, et se remplit avec le premier entré — c'est lui qui l'avait
     créé. */
  await ajouteColonne(env, 'carres', 'createur_id',
    'ALTER TABLE carres ADD COLUMN createur_id INTEGER');
  await env.DB.prepare(
    `UPDATE carres SET createur_id = (
       SELECT m.user_id FROM carre_membres m WHERE m.carre_id = carres.id
        ORDER BY m.joined_at, m.rowid LIMIT 1)
      WHERE createur_id IS NULL`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_carres_createur ON carres(createur_id)'
  ).run();

  /* Un carré n'écrit plus rien en commun : il entre chez son porteur. Les
     arbres qui appartenaient à un carré redescendent donc chez celui qui les
     avait ouverts, avec le nom du carré accolé — ce qui y a été écrit reste
     lisible, et par son auteur. Idempotent : au second passage il n'y en a
     plus. */
  await env.DB.prepare(
    `UPDATE reflection_trees
        SET axe = NULL,
            title = title || ' · ' || COALESCE((SELECT nom FROM carres WHERE id = carre_id), 'un carré'),
            carre_id = NULL
      WHERE carre_id IS NOT NULL`
  ).run();

  /* Le multivers quitte Pense Mieux : quatre branches restent. Le tronc
     « Mon multivers » qui n'a jamais rien porté s'efface (c'était une
     coquille créée d'avance, sans un mot dedans) ; celui qui porte des
     pensées ou range des réflexions devient une catégorie sans attache —
     tout ce qui y a été écrit reste lisible et rangeable. Idempotent :
     après le premier passage, plus aucun arbre n'a l'axe 'univers'. */
  await env.DB.prepare(
    `DELETE FROM reflection_trees
      WHERE axe = 'univers' AND trunk = ''
        AND id NOT IN (SELECT tree_id FROM reflection_branches)
        AND id NOT IN (SELECT parent_id FROM reflection_trees WHERE parent_id IS NOT NULL)`
  ).run();
  await env.DB.prepare(
    `UPDATE reflection_trees SET axe = NULL, genre = 'categorie', parent_id = NULL
      WHERE axe = 'univers'`
  ).run();

  // le lien d'un brainstorm vers la société qu'il imagine
  await ajouteColonne(env, 'brainstorms', 'societe_id',
    'ALTER TABLE brainstorms ADD COLUMN societe_id INTEGER');

  hautesTablesReady = true;
}

// Ajoute une colonne si elle manque. ALTER n'est pas idempotent en SQLite et
// le PRAGMA qui le précède ne verrouille rien : si l'erreur arrive quand
// même, on relit le schéma. La colonne est là : la course a simplement été
// perdue, et il n'y a rien à signaler.
async function ajouteColonne(env, table, colonne, sql) {
  const a = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  if ((a.results || []).some((c) => c.name === colonne)) return;
  try {
    await env.DB.prepare(sql).run();
  } catch (err) {
    const b = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    if (!(b.results || []).some((c) => c.name === colonne)) throw err;
  }
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

/* ----------------------------------------------------- les quatre troncs ---
   Quatre arbres existent d'avance pour chacun dans Pense Mieux : la
   psychologie et le moi harmonieux, qui se répondent en miroir (le présent,
   et ce vers quoi il tend), puis la philosophie et la société harmonieuse.
   Ils ne se plantent pas et ne s'abattent pas, on ne fait que les nourrir. */

// Une branche porte le nom de son axe : il ne lui appartient pas.
function titreAxe(axe) {
  return AXES[axe].titre;
}

// Le tronc, créé au premier regard s'il manque. Deux requêtes simultanées ne
// peuvent pas en créer deux : les index uniques partiels tiennent, et
// INSERT OR IGNORE laisse passer le perdant sans erreur.
async function assureTronc(env, { userId, kind, axe }) {
  const lit = () => env.DB.prepare(
    `SELECT id, user_id, kind, title, trunk, axe, carre_id, created_at, updated_at
       FROM reflection_trees
      WHERE user_id = ?1 AND kind = ?2 AND axe = ?3 AND carre_id IS NULL`
  ).bind(userId, kind, axe).first();

  const deja = await lit();
  if (deja) return deja;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO reflection_trees (user_id, kind, title, axe) VALUES (?1, ?2, ?3, ?4)'
  ).bind(userId, kind, titreAxe(axe), axe).run();
  return lit();
}

// Les quatre troncs d'une personne dans Pense Mieux, dans l'ordre. On les lit
// d'un coup : au régime de croisière ils sont tous là, et la création ne
// concerne que ceux qui manquent encore. La Vidéographie n'en a pas : elle
// n'a pas d'axes, elle a un rythme.
async function troncsDe(env, userId, kind) {
  if (kind !== 'pensee') return [];
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, kind, title, trunk, axe, carre_id, created_at, updated_at
       FROM reflection_trees
      WHERE user_id = ?1 AND kind = ?2 AND axe IS NOT NULL AND carre_id IS NULL`
  ).bind(userId, kind).all();
  const parAxe = new Map((results || []).map((t) => [t.axe, t]));
  const troncs = [];
  for (const axe of AXES_ORDRE) {
    const t = parAxe.get(axe) || await assureTronc(env, { userId, kind, axe });
    if (t) troncs.push(t);
  }
  return troncs;
}

/* Le miroir : la psychologie dit le présent, le moi harmonieux dit vers quoi
   il tend. Depuis l'un on passe à l'autre, dans le même contexte : même
   outil, même carré, même personne.                                        */
async function troncMiroir(env, arbre) {
  const autre = arbre.axe && AXES[arbre.axe] ? AXES[arbre.axe].miroir : null;
  if (!autre) return null;
  const t = await env.DB.prepare(
    `SELECT id, title FROM reflection_trees
      WHERE user_id = ?1 AND kind = ?2 AND axe = ?3
        AND ((carre_id IS NULL AND ?4 IS NULL) OR carre_id = ?4)`
  ).bind(arbre.user_id, arbre.kind, autre, arbre.carre_id).first();
  return t ? { id: t.id, title: t.title, axe: autre } : null;
}

/* Qui a le droit de lire, qui a le droit d'écrire : le propriétaire, et
   personne d'autre. Pense Mieux est entièrement à soi — le carré n'y entre
   plus, il imagine des sociétés de son côté. Un seul endroit pour le dire,
   pour que tous les gestionnaires disent la même chose : un arbre qu'on n'a
   pas le droit de voir se comporte partout comme un arbre qui n'existe pas. */
function droitsArbre(vu, tree) {
  const proprietaire = tree.user_id === vu.user.id;
  return { lire: proprietaire, ecrire: proprietaire, proprietaire };
}

// Le propriétaire touche à tout chez lui — ses pensées, et les réponses que
// des As lui avaient déposées du temps où un carré lisait ses branches.
function peutToucherBranche(row, droits) {
  return droits.ecrire;
}

/* Ce que je porte : mes quatre espaces, puis les réflexions que j'ai
   ouvertes. Tout est à moi seul.                                          */
async function arbresList(request, env, url) {
  const kind = kindDe(url.searchParams.get('kind'));
  if (!kind) return json({ error: 'Espace de réflexion inconnu.' }, 400);
  const { vu, refus } = await gateArbre(request, env, kind);
  if (refus) return refus;
  if (kind === 'video') return json({ troncs: [], arbres: [], carres: [] });

  const compte = async (t) => ({
    ...t,
    // ce que porte l'axe : sa phrase d'invite
    sous: AXES[t.axe] ? AXES[t.axe].sous : null,
    branches: (await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM reflection_branches WHERE tree_id = ?1'
    ).bind(t.id).first())?.n || 0,
  });
  const troncs = [];
  for (const t of await troncsDe(env, vu.user.id, kind)) troncs.push(await compte(t));

  // mes catégories et réflexions : chacune vit dans un espace (parent_id) et
  // se lit comme lui. Les plus anciennes, d'avant le rangement, n'ont pas de
  // parent : elles restent visibles, à part.
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.title, t.trunk, t.parent_id, t.genre, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM reflection_branches b WHERE b.tree_id = t.id) AS branches
       FROM reflection_trees t
      WHERE t.user_id = ?1 AND t.kind = ?2 AND t.axe IS NULL AND t.carre_id IS NULL
      ORDER BY t.updated_at DESC`
  ).bind(vu.user.id, kind).all();

  /* La cartographie : quelles réflexions se nourrissent entre elles. Une
     arête par couple de réflexions relié par au moins une nourriture — c'est
     la géographie de la pensée, pas son détail, qui se dessine ici. */
  const { results: carte } = await env.DB.prepare(
    `SELECT ts.id AS de, tc.id AS vers, COUNT(*) AS n
       FROM reflection_branch_links l
       JOIN reflection_branches bs ON bs.id = l.source_id
       JOIN reflection_branches bc ON bc.id = l.branch_id
       JOIN reflection_trees ts ON ts.id = bs.tree_id
       JOIN reflection_trees tc ON tc.id = bc.tree_id
      WHERE ts.user_id = ?1 AND tc.user_id = ?1
        AND ts.carre_id IS NULL AND tc.carre_id IS NULL
        AND ts.kind = ?2 AND tc.kind = ?2 AND ts.id <> tc.id
      GROUP BY ts.id, tc.id`
  ).bind(vu.user.id, kind).all();

  return json({ troncs, arbres: results || [], reponses: REPONSES, carte: carte || [] });
}

async function arbresCreate(request, env) {
  const body = await readJson(request);
  const kind = kindDe(body?.kind);
  if (!kind) return json({ error: 'Espace de réflexion inconnu.' }, 400);
  const { vu, refus } = await gateArbre(request, env, kind);
  if (refus) return refus;

  // La Vidéographie n'a plus d'espaces : elle n'a que ses récaps de période.
  // Tout ce qui se pense vit dans Pense Mieux.
  if (kind === 'video') return json({ error: 'La Vidéographie ne porte que des récaps.' }, 400);

  const title = String(body?.title || '').trim();
  const trunk = String(body?.trunk || '').trim();
  if (!title) return json({ error: 'Une réflexion commence par son sujet.' }, 400);
  if (title.length > 120) return json({ error: 'Sujet trop long (120 caractères).' }, 400);
  if (trunk.length > 4000) return json({ error: 'Point de départ trop long (4000 caractères).' }, 400);

  /* Une réflexion naît DANS un de ses espaces, ou dans une catégorie qu'on y
     a créée : Pense Mieux n'a plus de réflexions hors-sol. Le parent doit
     être à soi, personnel, et être un espace ou une catégorie — jamais une
     réflexion, et jamais un arbre de carré. On ne lit toujours NI axe NI
     carre_id : aucun chemin ne fabrique un espace ni ne s'invite ailleurs. */
  const genre = body?.genre === 'categorie' ? 'categorie' : 'reflexion';
  const parentId = Number(body?.parent_id);
  if (!Number.isFinite(parentId)) return json({ error: 'Une réflexion naît dans un de tes espaces.' }, 400);
  const parent = await env.DB.prepare(
    'SELECT id, user_id, kind, axe, genre, carre_id FROM reflection_trees WHERE id = ?1'
  ).bind(parentId).first();
  if (!parent || parent.user_id !== vu.user.id || parent.carre_id != null
      || parent.kind !== kind || !(parent.axe || parent.genre === 'categorie')) {
    return json({ error: 'Espace introuvable.' }, 404);
  }

  const r = await env.DB.prepare(
    'INSERT INTO reflection_trees (user_id, kind, title, trunk, parent_id, genre) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  ).bind(vu.user.id, kind, title, trunk, parentId, genre).run();
  return json({ ok: true, id: r.meta.last_row_id, genre }, 201);
}

// L'arbre entier, branches et liens compris.
async function chargeArbre(env, id) {
  const tree = await env.DB.prepare(
    `SELECT t.id, t.user_id, t.kind, t.title, t.trunk, t.axe, t.carre_id, t.prive,
            t.parent_id, t.genre,
            t.created_at, t.updated_at, c.nom AS carre_nom, u.username AS porteur
       FROM reflection_trees t
       LEFT JOIN carres c ON c.id = t.carre_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = ?1`
  ).bind(id).first();
  if (!tree) return null;
  // l'auteur d'une branche : il ne dit rien de plus que l'arbre chez une
  // personne, il dit qui parle dans l'arbre commun d'un carré
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.parent_id, b.body, b.url, b.created_at, b.user_id AS auteur_id,
            b.reponse, u.username AS auteur
       FROM reflection_branches b LEFT JOIN users u ON u.id = b.user_id
      WHERE b.tree_id = ?1 ORDER BY b.id`
  ).bind(id).all();
  // les nourritures : une branche peut naître de plusieurs passés, y compris
  // d'un autre arbre. La chip a donc besoin de connaître sa source.
  // les vocaux : leur minutage seulement. L'audio se demande branche par
  // branche, il n'alourdit pas la page.
  const { results: vocaux } = await env.DB.prepare(
    `SELECT v.branch_id, v.mots, v.duree FROM branch_vocaux v
       JOIN reflection_branches b ON b.id = v.branch_id
      WHERE b.tree_id = ?1`
  ).bind(id).all();
  const { results: liens } = await env.DB.prepare(
    `SELECT l.branch_id, l.source_id, sb.body AS source_body, sb.url AS source_url,
            st.id AS source_tree_id, st.title AS source_tree_title,
            st.carre_id AS source_carre_id, sc.nom AS source_carre_nom
       FROM reflection_branch_links l
       JOIN reflection_branches b ON b.id = l.branch_id
       JOIN reflection_branches sb ON sb.id = l.source_id
       JOIN reflection_trees st ON st.id = sb.tree_id
       LEFT JOIN carres sc ON sc.id = st.carre_id
      WHERE b.tree_id = ?1`
  ).bind(id).all();
  return {
    ...tree,
    branches: results || [],
    liens: liens || [],
    vocaux: (vocaux || []).map((v) => ({
      branch_id: v.branch_id, duree: v.duree,
      mots: (() => { try { return JSON.parse(v.mots); } catch { return []; } })(),
    })),
  };
}

async function arbresGet(request, env, id) {
  await ensureHautesTables(env);
  const arbre = await chargeArbre(env, id);
  if (!arbre) return json({ error: 'Réflexion introuvable.' }, 404);
  // Sous l'échelon requis, on répond « introuvable » plutôt que « pas encore
  // ouvert » : sans quoi le couple 403/404 dirait à un joueur trop bas qu'un
  // arbre existe à cet identifiant. Un arbre qu'on n'a pas le droit de voir se
  // comporte exactement comme un arbre qui n'existe pas.
  const { vu, refus } = await gateArbre(request, env, arbre.kind);
  if (refus) return json({ error: 'Réflexion introuvable.' }, 404);

  const droits = droitsArbre(vu, arbre);
  if (!droits.lire) return json({ error: 'Réflexion introuvable.' }, 404);

  // le miroir : de la psychologie au moi harmonieux, et retour. Chez soi, on
  // le crée s'il manque ; ailleurs on se contente de celui qui existe.
  if (droits.proprietaire && arbre.carre_id == null && AXES[arbre.axe] && AXES[arbre.axe].miroir) {
    await assureTronc(env, { userId: vu.user.id, kind: arbre.kind, axe: AXES[arbre.axe].miroir });
  }

  /* Ce que l'arbre contient : les catégories qu'on y a créées, et les
     réflexions qu'on y a rangées. */
  let dedans = [];
  if (arbre.carre_id == null && (arbre.axe || arbre.genre === 'categorie')) {
    const { results } = await env.DB.prepare(
      `SELECT t.id, t.title, t.trunk, t.genre, t.updated_at,
              (SELECT COUNT(*) FROM reflection_branches b WHERE b.tree_id = t.id) AS branches,
              (SELECT COUNT(*) FROM reflection_trees e WHERE e.parent_id = t.id) AS contenus
         FROM reflection_trees t WHERE t.parent_id = ?1
        ORDER BY (t.genre = 'categorie') DESC, t.updated_at DESC`
    ).bind(arbre.id).all();
    dedans = results || [];
  }

  // le fil d'ariane : de l'espace racine jusqu'ici
  const chemin = [];
  let cran = arbre;
  for (let garde = 0; garde < 12 && cran && cran.parent_id; garde++) {
    cran = await env.DB.prepare(
      'SELECT id, title, axe, parent_id FROM reflection_trees WHERE id = ?1'
    ).bind(cran.parent_id).first();
    if (cran) chemin.unshift({ id: cran.id, title: cran.title, axe: cran.axe });
  }

  return json({
    arbre: {
      ...arbre,
      proprietaire: droits.proprietaire,
      editable: droits.ecrire,
      // les libellés des réponses d'autrefois : ils ne servent plus qu'à
      // afficher celles qui ont été déposées avant que le carré se referme
      reponses: REPONSES,
      sous: AXES[arbre.axe] ? AXES[arbre.axe].sous : null,
      miroir: await troncMiroir(env, arbre),
      moi: vu.user.id,
      dedans,
      chemin,
    },
  });
}

// Le sujet d'un tronc ne lui appartient pas : il porte le nom de son axe, et
// seul son texte se nourrit.
async function arbresUpdate(request, env, id) {
  await ensureHautesTables(env);
  const tree = await env.DB.prepare(
    'SELECT id, user_id, kind, axe, genre, parent_id, carre_id, prive FROM reflection_trees WHERE id = ?1'
  ).bind(id).first();
  if (!tree) return json({ error: 'Réflexion introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, tree.kind);
  if (refus) return json({ error: 'Réflexion introuvable.' }, 404);
  const droits = droitsArbre(vu, tree);
  if (!droits.ecrire) return json({ error: 'Réflexion introuvable.' }, 404);

  const body = await readJson(request);
  const trunk = String(body?.trunk || '').trim();
  if (trunk.length > 4000) return json({ error: 'Point de départ trop long.' }, 400);
  let title = String(body?.title || '').trim();
  if (tree.axe) {
    title = titreAxe(tree.axe);
  } else if (!title || title.length > 120) {
    return json({ error: 'Sujet invalide.' }, 400);
  }
  await env.DB.prepare(
    `UPDATE reflection_trees SET title = ?1, trunk = ?2, updated_at = datetime('now') WHERE id = ?3`
  ).bind(title, trunk, id).run();
  return json({ ok: true });
}

async function arbresDelete(request, env, id) {
  await ensureHautesTables(env);
  const tree = await env.DB.prepare(
    'SELECT id, user_id, kind, axe, genre, parent_id, carre_id FROM reflection_trees WHERE id = ?1'
  ).bind(id).first();
  if (!tree) return json({ error: 'Réflexion introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, tree.kind);
  if (refus) return json({ error: 'Réflexion introuvable.' }, 404);
  const droits = droitsArbre(vu, tree);
  if (!droits.ecrire || !droits.proprietaire) return json({ error: 'Réflexion introuvable.' }, 404);
  // un espace n'est pas un arbre qu'on a planté : ses pensées se coupent une
  // à une, lui reste
  if (tree.axe) return json({ error: 'Cet espace ne se referme pas : il t’attend, toujours.' }, 400);
  // une catégorie ne s'emporte pas avec ce qu'elle range
  const plein = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM reflection_trees WHERE parent_id = ?1'
  ).bind(id).first();
  if (plein?.n) return json({ error: 'Cette catégorie range encore des réflexions : vide-la d’abord.' }, 400);
  await env.DB.prepare('DELETE FROM reflection_trees WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}

async function branchesCreate(request, env, treeId) {
  await ensureHautesTables(env);
  const tree = await env.DB.prepare(
    'SELECT id, user_id, kind, axe, genre, parent_id, carre_id, prive FROM reflection_trees WHERE id = ?1'
  ).bind(treeId).first();
  if (!tree) return json({ error: 'Réflexion introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, tree.kind);
  if (refus) return json({ error: 'Réflexion introuvable.' }, 404);
  const droits = droitsArbre(vu, tree);
  if (!droits.ecrire) return json({ error: 'Réflexion introuvable.' }, 404);

  const body = await readJson(request);
  const texte = String(body?.body || '').trim();
  const url = String(body?.url || '').trim();
  const parentId = body?.parent_id == null ? null : Number(body.parent_id);

  if (tree.kind === 'video') {
    if (!urlYoutubeValide(url)) return json({ error: 'Chaque entrée d’une vidéographie est une vidéo YouTube.' }, 400);
  } else if (!texte && !(tree.kind === 'video' && urlYoutubeValide(url))) {
    return json({ error: 'Il n’y a rien à déposer.' }, 400);
  }
  if (texte.length > 2000) return json({ error: 'Trop long (2000 caractères).' }, 400);

  if (parentId != null) {
    const parent = await env.DB.prepare(
      'SELECT id FROM reflection_branches WHERE id = ?1 AND tree_id = ?2'
    ).bind(parentId, treeId).first();
    if (!parent) return json({ error: 'La pensée à laquelle répondre a disparu.' }, 404);
  }

  const r = await env.DB.prepare(
    'INSERT INTO reflection_branches (tree_id, parent_id, user_id, body, url) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(treeId, parentId, vu.user.id, texte,
    tree.kind === 'video' && urlYoutubeValide(url) ? url : null).run();
  await toucheArbre(env, treeId);
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

// Un arbre remonte dans les listes dès qu'on le touche, quel que soit le
// geste : sans quoi l'arbre commun d'un carré s'enfoncerait à mesure qu'on
// l'élague.
async function toucheArbre(env, treeId) {
  await env.DB.prepare(`UPDATE reflection_trees SET updated_at = datetime('now') WHERE id = ?1`)
    .bind(treeId).run();
}

async function brancheEtArbre(env, id) {
  return env.DB.prepare(
    `SELECT b.id, b.tree_id, b.user_id AS auteur_id, b.reponse,
            t.user_id, t.kind, t.axe, t.genre, t.parent_id, t.carre_id, t.prive
       FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
      WHERE b.id = ?1`
  ).bind(id).first();
}

async function branchesUpdate(request, env, id) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, id);
  if (!row) return json({ error: 'Pensée introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return json({ error: 'Pensée introuvable.' }, 404);
  const droits = droitsArbre(vu, row);
  if (!peutToucherBranche(row, droits)) return json({ error: 'Pensée introuvable.' }, 404);

  const body = await readJson(request);
  const texte = String(body?.body || '').trim();
  const url = String(body?.url || '').trim();
  if (row.kind === 'video' && !urlYoutubeValide(url)) return json({ error: 'L’entrée doit rester une vidéo YouTube.' }, 400);
  if (row.kind !== 'video' && !texte) return json({ error: 'Il n’y a rien à déposer.' }, 400);
  if (texte.length > 2000) return json({ error: 'Trop long.' }, 400);

  await env.DB.prepare('UPDATE reflection_branches SET body = ?1, url = ?2 WHERE id = ?3')
    .bind(texte, row.kind === 'video' ? url : null, id).run();

  /* L'émergence d'une vidéo : l'audio, et le texte minuté qui se dessine
     dessus. Corriger le texte d'une pensée dite, c'est corriger sa vidéo :
     le client renvoie le minutage réaligné, et la vidéo se refabrique. */
  if (Array.isArray(body?.mots)) {
    const mots = body.mots.slice(0, 4000).map((w) => ({
      m: String(w.m || '').slice(0, 60), d: Number(w.d) || 0, f: Number(w.f) || 0,
    })).filter((w) => w.m);
    await env.DB.prepare(
      'UPDATE branch_vocaux SET mots = ?1 WHERE branch_id = ?2'
    ).bind(JSON.stringify(mots), id).run();
  }
  await toucheArbre(env, row.tree_id);
  return json({ ok: true });
}

async function branchesDelete(request, env, id) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, id);
  if (!row) return json({ error: 'Pensée introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return json({ error: 'Pensée introuvable.' }, 404);
  const droits = droitsArbre(vu, row);
  if (!peutToucherBranche(row, droits)) return json({ error: 'Pensée introuvable.' }, 404);
  await env.DB.prepare('DELETE FROM reflection_branches WHERE id = ?1').bind(id).run();
  await toucheArbre(env, row.tree_id);
  return json({ ok: true });
}

/* Chaque présent est le futur de plusieurs passés : au-delà de sa branche
   mère (sa place dans l'arbre), une branche peut être nourrie par d'autres.
   Ces liens traversent l'arbre sans le déformer : l'arbre reste lisible,
   les nourritures s'y ajoutent en chips. */

async function lienCreate(request, env, brancheId) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, brancheId);
  if (!row) return json({ error: 'Pensée introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return json({ error: 'Pensée introuvable.' }, 404);
  const droits = droitsArbre(vu, row);
  if (!peutToucherBranche(row, droits)) return json({ error: 'Pensée introuvable.' }, 404);

  const body = await readJson(request);
  const sourceId = Number(body?.source_id);
  if (!sourceId || sourceId === brancheId) return json({ error: 'Une pensée ne se nourrit pas d’elle-même.' }, 400);

  /* Pense Mieux est à soi : une nourriture relie deux de SES pensées, dans
     le même outil, et rien d'autre. */
  const src = await env.DB.prepare(
    `SELECT b.id, t.user_id, t.kind FROM reflection_branches b
       JOIN reflection_trees t ON t.id = b.tree_id WHERE b.id = ?1`
  ).bind(sourceId).first();
  const permis = !!src && src.kind === row.kind && src.user_id === vu.user.id;
  if (!permis) return json({ error: 'Pensée source introuvable.' }, 404);

  await env.DB.prepare(
    'INSERT OR IGNORE INTO reflection_branch_links (branch_id, source_id) VALUES (?1, ?2)'
  ).bind(brancheId, sourceId).run();
  return json({ ok: true }, 201);
}

async function lienDelete(request, env, brancheId, sourceId) {
  await ensureHautesTables(env);
  const row = await brancheEtArbre(env, brancheId);
  if (!row) return json({ error: 'Pensée introuvable.' }, 404);
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return json({ error: 'Pensée introuvable.' }, 404);
  const droits = droitsArbre(vu, row);
  if (!peutToucherBranche(row, droits)) return json({ error: 'Pensée introuvable.' }, 404);
  await env.DB.prepare(
    'DELETE FROM reflection_branch_links WHERE branch_id = ?1 AND source_id = ?2'
  ).bind(brancheId, sourceId).run();
  return json({ ok: true });
}

/* --------------------------------------------------- le timbre de chacun ---
   Deux voix n'ont ni la même fondamentale ni la même assise. Le réglage
   calculé à l'écoute d'un échantillon (fondamentale, centre de gravité
   spectral) vit sur le compte : la chaîne audio du navigateur s'y accorde à
   chaque enregistrement, et l'on obtient une voix nette au lieu d'un signal
   brut.                                                                    */
async function voixPut(request, env) {
  let user;
  try { user = await requireUser(request, env); } catch (resp) { return resp; }
  const body = await readJson(request);
  const nombre = (x, min, max, defaut) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
  };
  // on ne stocke que des nombres bornés : ce réglage revient dans une chaîne
  // audio, il n'a aucune raison d'accepter autre chose
  const reglage = {
    f0: nombre(body?.f0, 50, 400, 120),
    coupe: nombre(body?.coupe, 40, 200, 85),
    corps: nombre(body?.corps, -6, 6, 0),
    presence: nombre(body?.presence, 0, 8, 3),
    presenceHz: nombre(body?.presenceHz, 1500, 6000, 3000),
    gain: nombre(body?.gain, 0, 18, 4),
  };
  await env.DB.prepare('UPDATE users SET voix = ?1 WHERE id = ?2')
    .bind(JSON.stringify(reglage), user.id).run();
  return json({ ok: true, voix: reglage });
}

/* ------------------------------------------- le vocal d'une branche -------
   Pense Mieux se parle autant qu'il s'écrit. Une pensée vient rarement au
   moment où l'on a un clavier : on l'enregistre, elle est transcrite, et le
   texte devient la branche — l'arborescence se fait donc à la voix.

   L'audio reste attaché à sa branche avec le minutage mot à mot : c'est ce
   qui permet de la rejouer en faisant apparaître le texte au fur et à mesure,
   et d'en tirer une vidéo.

   L'audio vit en base64 dans D1, comme l'avatar. Il est donc borné : une
   pensée jetée est courte, et une ligne de D1 ne dépasse pas deux mégaoctets.
                                                                          */

const VOCAL_MAX_BASE64 = 2_000_000;   // trois minutes d'opus, avec du champ
const VOCAL_MODELES = ['@cf/openai/whisper-large-v3-turbo', '@cf/openai/whisper'];

// Le corps d'un vocal : une data-url audio, sa durée. Rien d'autre n'entre.
function litVocal(body) {
  const dataUrl = String((body && body.data) || '');
  const m = dataUrl.match(/^data:(audio\/[a-z0-9.+-]+)(?:;codecs=[^;,]+)?;base64,([a-zA-Z0-9+/=]+)$/i);
  if (!m) return { erreur: 'Enregistrement invalide.' };
  if (m[2].length > VOCAL_MAX_BASE64) return { erreur: 'Vocal trop long : trois minutes au plus.' };
  const duree = Number(body?.duree);
  return { mime: m[1], base64: m[2], duree: Number.isFinite(duree) && duree > 0 ? duree : 0 };
}

/* La transcription. Deux modèles : le rapide d'abord, l'ancien en secours ;
   ils ne parlent pas la même langue d'entrée ni de sortie, on normalise. Sans
   binding AI, on répond 503 et l'écriture au clavier reste : rien ne casse. */
async function vocalTranscription(request, env) {
  const { vu, refus } = await gateArbre(request, env, 'pensee');
  if (refus) return refus;
  if (!env.AI) return json({ error: 'La transcription n’est pas disponible ici.' }, 503);

  const { mime, base64, duree, erreur } = litVocal(await readJson(request));
  if (erreur) return json({ error: erreur }, 400);
  const octets = fromBase64(base64);

  // le rapide d'abord, l'ancien en secours : ils n'attendent pas la même
  // forme d'entrée, et l'un peut être indisponible quand l'autre répond
  let sortie = null;
  for (const modele of VOCAL_MODELES) {
    try {
      sortie = await env.AI.run(modele, modele.endsWith('turbo')
        // la plateforme parle français : le dire au modèle vaut plusieurs
        // points de justesse, et le filtre de voix coupe les silences
        ? { audio: base64, language: 'fr', vad_filter: 'true' }
        : { audio: [...octets] });
      if (sortie) break;
    } catch { sortie = null; }
  }
  if (!sortie) {
    return json({ error: 'La transcription n’a pas abouti. Écris ta pensée, le vocal peut attendre.' }, 503);
  }

  const texte = String(sortie.text || sortie.transcription || '').trim();
  return json({ texte, mots: motsMinutes(sortie, texte, duree), mime });
}

/* Le minutage mot à mot, quelle que soit la forme rendue par le modèle : des
   mots datés, des segments datés, ou rien du tout. Dans ce dernier cas on
   répartit les mots sur la durée : la lecture reste juste à l'œil, ce qui
   est tout ce qu'on lui demande.                                          */
function motsMinutes(sortie, texte, duree) {
  const mots = [];
  if (Array.isArray(sortie.words) && sortie.words.length) {
    for (const w of sortie.words) {
      const m = String(w.word ?? w.text ?? '').trim();
      if (m) mots.push({ m, d: Number(w.start) || 0, f: Number(w.end) || 0 });
    }
    if (mots.length) return mots;
  }
  if (Array.isArray(sortie.segments) && sortie.segments.length) {
    for (const s of sortie.segments) {
      if (Array.isArray(s.words) && s.words.length) {
        for (const w of s.words) {
          const m = String(w.word ?? w.text ?? '').trim();
          if (m) mots.push({ m, d: Number(w.start) || 0, f: Number(w.end) || 0 });
        }
      } else {
        const bruts = String(s.text || '').trim().split(/\s+/).filter(Boolean);
        const d0 = Number(s.start) || 0;
        const pas = ((Number(s.end) || d0) - d0) / Math.max(1, bruts.length);
        bruts.forEach((m, i) => mots.push({ m, d: d0 + i * pas, f: d0 + (i + 1) * pas }));
      }
    }
    if (mots.length) return mots;
  }
  const bruts = texte.split(/\s+/).filter(Boolean);
  const total = duree > 0 ? duree : bruts.length * 0.4;
  const pas = total / Math.max(1, bruts.length);
  return bruts.map((m, i) => ({ m, d: i * pas, f: (i + 1) * pas }));
}

// La branche à qui l'on attache un vocal : la sienne, dans un arbre où l'on
// écrit. Les mêmes droits que pour la retoucher, jamais d'autres.
async function brancheOuVocal(request, env, brancheId) {
  const row = await brancheEtArbre(env, brancheId);
  if (!row) return { refus: json({ error: 'Pensée introuvable.' }, 404) };
  const { vu, refus } = await gateArbre(request, env, row.kind);
  if (refus) return { refus: json({ error: 'Pensée introuvable.' }, 404) };
  const droits = droitsArbre(vu, row);
  return { vu, row, droits };
}

async function vocalAttache(request, env, brancheId) {
  await ensureHautesTables(env);
  const { vu, row, droits, refus } = await brancheOuVocal(request, env, brancheId);
  if (refus) return refus;
  if (row.kind !== 'pensee') return json({ error: 'Le vocal est l’outil de Pense Mieux.' }, 400);
  if (!peutToucherBranche(row, droits)) return json({ error: 'Pensée introuvable.' }, 404);

  const body = await readJson(request);
  const { mime, base64, duree, erreur } = litVocal(body);
  if (erreur) return json({ error: erreur }, 400);
  let mots = [];
  try {
    const brut = Array.isArray(body?.mots) ? body.mots : [];
    mots = brut.slice(0, 4000).map((w) => ({
      m: String(w.m || '').slice(0, 60), d: Number(w.d) || 0, f: Number(w.f) || 0,
    })).filter((w) => w.m);
  } catch { mots = []; }

  await env.DB.prepare(
    `INSERT INTO branch_vocaux (branch_id, user_id, mime, audio, mots, duree)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(branch_id) DO UPDATE SET mime = ?3, audio = ?4, mots = ?5, duree = ?6`
  ).bind(brancheId, vu.user.id, mime, base64, JSON.stringify(mots), duree).run();
  return json({ ok: true, mots, duree }, 201);
}

async function vocalSert(request, env, brancheId) {
  await ensureHautesTables(env);
  const { row, droits, refus } = await brancheOuVocal(request, env, brancheId);
  if (refus) return new Response('', { status: 404 });
  if (!droits.lire) return new Response('', { status: 404 });
  const v = await env.DB.prepare(
    'SELECT mime, audio FROM branch_vocaux WHERE branch_id = ?1'
  ).bind(brancheId).first();
  if (!v) return new Response('', { status: 404 });
  return new Response(fromBase64(v.audio), {
    headers: {
      'Content-Type': v.mime || 'audio/webm',
      // il ne change jamais : une branche a un vocal, ou elle n'en a pas
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename="vocal-${row.id}.webm"`,
    },
  });
}

async function vocalDetache(request, env, brancheId) {
  await ensureHautesTables(env);
  const { vu, row, droits, refus } = await brancheOuVocal(request, env, brancheId);
  if (refus) return refus;
  if (!peutToucherBranche(row, droits)) return json({ error: 'Pensée introuvable.' }, 404);
  await env.DB.prepare('DELETE FROM branch_vocaux WHERE branch_id = ?1').bind(brancheId).run();
  return json({ ok: true });
}

// La recherche plein texte dans sa forêt : troncs, sujets et branches. Elle
// ne fouille que chez soi : Pense Mieux est à soi.
async function arbresRecherche(request, env, url) {
  const kind = kindDe(url.searchParams.get('kind'));
  if (!kind) return json({ error: 'Espace de réflexion inconnu.' }, 400);
  const { vu, refus } = await gateArbre(request, env, kind);
  if (refus) return refus;
  const q = String(url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json({ arbres: [], branches: [] });
  const motif = '%' + q.replace(/[%_\\]/g, ' ') + '%';

  // La recherche de Pense Mieux ne fouille que les réflexions de la personne :
  // ce qui s'écrit dans un carré se retrouve sur la page du carré, pas ici.
  const mien = 't.user_id = ?1 AND t.carre_id IS NULL';

  const arbres = (await env.DB.prepare(
    `SELECT t.id, t.title, t.trunk, t.carre_id FROM reflection_trees t
      WHERE ${mien} AND t.kind = ?2 AND (t.title LIKE ?3 OR t.trunk LIKE ?3)
      ORDER BY t.updated_at DESC LIMIT 20`
  ).bind(vu.user.id, kind, motif).all()).results || [];

  const branches = (await env.DB.prepare(
    `SELECT b.id, b.body, b.url, b.created_at, t.id AS tree_id, t.title AS tree_title, t.carre_id
       FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
      WHERE ${mien} AND t.kind = ?2 AND b.body LIKE ?3
      ORDER BY b.id DESC LIMIT 30`
  ).bind(vu.user.id, kind, motif).all()).results || [];

  return json({ arbres, branches });
}

/* --------------------------------------- la Vidéographie : le rythme ------
   Une vidéo par semaine, une par mois, une par an : le récap de ce qu'on a
   vécu sur la période, du point de vue de ce qu'on a ajouté dans Pense Mieux
   et de ce qu'on a vécu avec ses carrés. La plateforme n'écrit pas le récap :
   elle pose la matière sous les yeux — ce qui a été écrit, dit et décidé
   pendant la période — et c'est à la personne de le raconter.

   C'est ce qui sépare les deux outils. Pense Mieux est la pensée, au moment
   où elle vient. La Vidéographie est le regard en arrière, à intervalle fixe,
   sur ce que cette pensée a produit et sur ce qu'on en a vécu.            */

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// SQLite écrit ses dates ainsi : on compare du texte à du texte.
function horodate(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function jourFr(d) {
  const j = d.getUTCDate();
  return `${j === 1 ? '1er' : j} ${MOIS_FR[d.getUTCMonth()]}`;
}

// La période courante d'une cadence : sa clé, son libellé, ses deux bornes.
// La semaine est celle de la norme ISO : elle commence le lundi, et l'année
// d'une semaine est celle de son jeudi.
function periodeDe(cadence, maintenant) {
  const d = new Date(maintenant);
  if (cadence === 'annee') {
    const an = d.getUTCFullYear();
    return {
      cle: String(an), libelle: String(an),
      debut: horodate(new Date(Date.UTC(an, 0, 1))),
      fin: horodate(new Date(Date.UTC(an + 1, 0, 1))),
    };
  }
  if (cadence === 'mois') {
    const an = d.getUTCFullYear();
    const m = d.getUTCMonth();
    return {
      cle: `${an}-${String(m + 1).padStart(2, '0')}`,
      libelle: `${MOIS_FR[m]} ${an}`,
      debut: horodate(new Date(Date.UTC(an, m, 1))),
      fin: horodate(new Date(Date.UTC(an, m + 1, 1))),
    };
  }
  const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  lundi.setUTCDate(lundi.getUTCDate() - ((lundi.getUTCDay() + 6) % 7));
  const jeudi = new Date(lundi);
  jeudi.setUTCDate(jeudi.getUTCDate() + 3);
  const an = jeudi.getUTCFullYear();
  const premier = new Date(Date.UTC(an, 0, 4));
  premier.setUTCDate(premier.getUTCDate() - ((premier.getUTCDay() + 6) % 7));
  const numero = 1 + Math.round((jeudi - premier) / (7 * 86400000));
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  const fin = new Date(lundi);
  fin.setUTCDate(fin.getUTCDate() + 7);
  return {
    cle: `${an}-S${String(numero).padStart(2, '0')}`,
    libelle: `du ${jourFr(lundi)} au ${jourFr(dimanche)} ${dimanche.getUTCFullYear()}`,
    debut: horodate(lundi), fin: horodate(fin),
  };
}

/* Le jour tel qu'il se vit en France : c'est là que « dimanche » a un sens.
   On projette l'instant sur le calendrier de Paris, et tout le raisonnement
   de fenêtre se fait sur cette projection.                                */
function jourParis(maintenant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date(maintenant));
  const v = {};
  for (const p of parts) v[p.type] = p.value;
  const an = +v.year;
  const mois = +v.month - 1;
  const jour = +v.day;
  return { an, mois, jour, dow: new Date(Date.UTC(an, mois, jour)).getUTCDay() };
}

/* La fenêtre de dépôt d'une cadence. Un récap ne se dépose pas n'importe
   quand : la vidéo de la semaine se fait LE dimanche (elle clôt la semaine
   qui s'achève), celle du mois le premier dimanche du mois (elle raconte le
   mois écoulé), celle de l'année du 1er au 3 janvier (elle raconte l'année
   écoulée). Le reste du temps on vit ; le jour venu, on raconte.

   Hors fenêtre, `periode` est celle que la PROCHAINE fenêtre racontera : la
   carte montre ainsi la matière qui s'accumule pour le jour dit.          */
function fenetreDe(cadence, maintenant) {
  const { an, mois, jour, dow } = jourParis(maintenant);
  // au milieu du jour : les bornes de périodes restent loin des bords de fuseau
  const midi = (a, m, j) => Date.UTC(a, m, j, 12);
  const versDimanche = (depuis) => {
    const d = new Date(depuis);
    d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
    return d;
  };

  if (cadence === 'semaine') {
    const ouverte = dow === 0;
    const prochaine = versDimanche(midi(an, mois, jour + (ouverte ? 0 : 1)));
    return {
      ouverte,
      // le dimanche est le dernier jour de sa semaine ISO : ouvert ou pas, la
      // semaine du prochain dimanche est celle qu'on est en train de vivre
      periode: periodeDe('semaine', ouverte ? midi(an, mois, jour) : prochaine.getTime()),
      jour: 'le dimanche', prochaine,
    };
  }
  if (cadence === 'mois') {
    const ouverte = dow === 0 && jour <= 7;
    let fen = versDimanche(midi(an, mois, 1));
    if (!ouverte && midi(an, mois, jour) > fen.getTime()) fen = versDimanche(midi(an, mois + 1, 1));
    return {
      ouverte,
      // la fenêtre raconte le mois qui précède son dimanche
      periode: periodeDe('mois', Date.UTC(fen.getUTCFullYear(), fen.getUTCMonth(), 0, 12)),
      jour: 'le premier dimanche du mois', prochaine: fen,
    };
  }
  const ouverte = mois === 0 && jour <= 3;
  return {
    ouverte,
    periode: periodeDe('annee', midi(ouverte ? an - 1 : an, 6, 1)),
    jour: 'du 1er au 3 janvier', prochaine: new Date(midi(ouverte ? an : an + 1, 0, 1)),
  };
}

/* La matière du récap : ce que la période a produit. Rien n'est inventé, tout
   est daté — c'est le carnet qu'on relit avant de parler. */
async function matiereDe(env, userId, debut, fin) {
  const { results: arbres } = await env.DB.prepare(
    `SELECT t.title, t.axe, COUNT(b.id) AS branches
       FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
      WHERE t.user_id = ?1 AND t.kind = 'pensee' AND t.carre_id IS NULL
        AND b.created_at >= ?2 AND b.created_at < ?3
      GROUP BY t.id ORDER BY branches DESC LIMIT 12`
  ).bind(userId, debut, fin).all();

  const { results: extraits } = await env.DB.prepare(
    `SELECT b.body FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
      WHERE t.user_id = ?1 AND t.kind = 'pensee' AND t.carre_id IS NULL
        AND b.body <> '' AND b.created_at >= ?2 AND b.created_at < ?3
      ORDER BY b.id DESC LIMIT 5`
  ).bind(userId, debut, fin).all();

  const { results: carres } = await env.DB.prepare(
    `SELECT c.id, c.nom,
            (SELECT COUNT(*) FROM societe_idees i JOIN carre_societes s ON s.id = i.societe_id
              WHERE s.carre_id = c.id AND i.created_at >= ?2 AND i.created_at < ?3) AS branches,
            (SELECT COUNT(*) FROM societe_idees i JOIN carre_societes s ON s.id = i.societe_id
              WHERE s.carre_id = c.id AND i.user_id = ?1
                AND i.created_at >= ?2 AND i.created_at < ?3) AS miennes,
            (SELECT COUNT(*) FROM carre_messages m
              WHERE m.carre_id = c.id AND m.created_at >= ?2 AND m.created_at < ?3) AS messages,
            (SELECT COUNT(*) FROM brainstorms bs
              WHERE bs.carre_id = c.id AND bs.created_at >= ?2 AND bs.created_at < ?3) AS brainstorms
       FROM carres c JOIN carre_membres m ON m.carre_id = c.id AND m.user_id = ?1
      ORDER BY c.nom`
  ).bind(userId, debut, fin).all();

  const signes = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM riddle_progress
      WHERE user_id = ?1 AND solved_at IS NOT NULL AND solved_at >= ?2 AND solved_at < ?3`
  ).bind(userId, debut, fin).first())?.n || 0;

  // ce que le carré m'a apporté, et ce que j'ai apporté aux autres : c'est
  // aussi ce qu'on a vécu, et c'est souvent le plus intéressant à raconter
  const echanges = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
         WHERE t.user_id = ?1 AND b.reponse IS NOT NULL AND b.user_id <> ?1
           AND b.created_at >= ?2 AND b.created_at < ?3) AS recues,
       (SELECT COUNT(*) FROM reflection_branches b JOIN reflection_trees t ON t.id = b.tree_id
         WHERE b.user_id = ?1 AND b.reponse IS NOT NULL AND t.user_id <> ?1
           AND b.created_at >= ?2 AND b.created_at < ?3) AS donnees`
  ).bind(userId, debut, fin).first();

  const branches = (arbres || []).reduce((s, a) => s + a.branches, 0);
  return {
    penseMieux: { branches, arbres: arbres || [], extraits: (extraits || []).map((e) => e.body) },
    carres: (carres || []).filter((c) => c.branches || c.messages || c.brainstorms),
    echanges: { recues: echanges?.recues || 0, donnees: echanges?.donnees || 0 },
    signes,
  };
}

async function videographieRythme(request, env) {
  const { vu, refus } = await gateArbre(request, env, 'video');
  if (refus) return refus;
  const maintenant = Date.now();

  const cadences = [];
  for (const def of CADENCES) {
    const fenetre = fenetreDe(def.cle, maintenant);
    const periode = fenetre.periode;
    const faite = await env.DB.prepare(
      `SELECT id, url, note, updated_at FROM videographie_recaps
        WHERE user_id = ?1 AND cadence = ?2 AND periode = ?3`
    ).bind(vu.user.id, def.cle, periode.cle).first();
    const { results: histoire } = await env.DB.prepare(
      `SELECT id, periode, url, note, updated_at FROM videographie_recaps
        WHERE user_id = ?1 AND cadence = ?2 AND periode <> ?3
        ORDER BY periode DESC LIMIT 6`
    ).bind(vu.user.id, def.cle, periode.cle).all();
    cadences.push({
      ...def,
      periode,
      ouverte: fenetre.ouverte,
      jour: fenetre.jour,
      prochaine: { ts: fenetre.prochaine.getTime(), libelle: jourFr(fenetre.prochaine) },
      faite: faite || null,
      matiere: await matiereDe(env, vu.user.id, periode.debut, periode.fin),
      histoire: histoire || [],
    });
  }
  return json({ cadences });
}

async function videographieRecap(request, env) {
  const { vu, refus } = await gateArbre(request, env, 'video');
  if (refus) return refus;
  const body = await readJson(request);
  const cadence = String(body?.cadence || '');
  if (!CADENCES_ORDRE.includes(cadence)) return json({ error: 'Cadence inconnue.' }, 400);
  const url = String(body?.url || '').trim();
  const note = String(body?.note || '').trim();
  if (!urlYoutubeValide(url)) return json({ error: 'Le récap est une vidéo YouTube.' }, 400);
  if (note.length > 1000) return json({ error: 'La note tient en 1000 caractères.' }, 400);

  /* Le récap se dépose LE jour dit, jamais un autre : le dimanche pour la
     semaine, le premier dimanche du mois pour le mois écoulé, du 1er au 3
     janvier pour l'année écoulée. Corriger l'adresse suit la même règle :
     hors fenêtre, rien ne bouge. */
  const fenetre = fenetreDe(cadence, Date.now());
  if (!fenetre.ouverte) {
    const quoi = { semaine: 'de la semaine', mois: 'du mois', annee: 'de l’année' }[cadence];
    return json({
      error: `La vidéo ${quoi} se dépose ${fenetre.jour}. Prochaine fenêtre : le ${jourFr(fenetre.prochaine)}.`,
    }, 403);
  }
  const periode = fenetre.periode;
  await env.DB.prepare(
    `INSERT INTO videographie_recaps (user_id, cadence, periode, url, note)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, cadence, periode) DO UPDATE
       SET url = ?4, note = ?5, updated_at = datetime('now')`
  ).bind(vu.user.id, cadence, periode.cle, url, note).run();
  return json({ ok: true, periode: periode.cle });
}

async function videographieRecapDelete(request, env, id) {
  const { vu, refus } = await gateArbre(request, env, 'video');
  if (refus) return refus;
  await env.DB.prepare('DELETE FROM videographie_recaps WHERE id = ?1 AND user_id = ?2')
    .bind(id, vu.user.id).run();
  return json({ ok: true });
}

/* --------------------------------------------- le carré d'as (échelon 5)
   Un carré, c'est quatre As qui imaginent ENSEMBLE des sociétés
   harmonieuses. Chaque société a un nom, et se pense sur deux volets : ce
   qui lui permet d'être, et comment les humains s'y comporteraient. Le
   carré ne regarde l'intérieur de personne : il construit des modèles.

   On fonde autant de carrés qu'on veut, on entre dans autant qu'on veut :
   chaque carré est un atelier de plus, avec ses propres sociétés.        */

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

  const reponse = { carres: [], ouverts: [], invitations: 0 };
  if (vu.user) {
    const carres = await mesCarres(env, vu.user.id);
    for (const c of carres) {
      c.membres = await membresDe(env, c.id);
      c.societes = (await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM carre_societes WHERE carre_id = ?1'
      ).bind(c.id).first())?.n || 0;
    }
    reponse.carres = carres;
    const inv = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM carre_invitations WHERE user_id = ?1'
    ).bind(vu.user.id).first();
    reponse.invitations = inv?.n || 0;
  }
  // les carrés où il reste une place, hors les miens : pour en rejoindre un
  const moi = vu.user ? vu.user.id : 0;
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nom, COUNT(m.user_id) AS membres,
            (SELECT COUNT(*) FROM carre_societes s WHERE s.carre_id = c.id) AS societes
       FROM carres c
       LEFT JOIN carre_membres m ON m.carre_id = c.id
      WHERE c.id NOT IN (SELECT carre_id FROM carre_membres WHERE user_id = ?1)
      GROUP BY c.id HAVING membres < 4 ORDER BY c.created_at DESC LIMIT 25`
  ).bind(moi).all();
  reponse.ouverts = results || [];
  return json(reponse);
}

/* Fonder un carré. Autant qu'on veut : chacun est un atelier de plus, avec
   d'autres esprits et d'autres sociétés à imaginer. */
async function carreCreate(request, env) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;

  const body = await readJson(request);
  const nom = String(body?.nom || '').trim();
  if (!nom || nom.length > 60) return json({ error: 'Donnez un nom à votre carré (60 caractères au plus).' }, 400);

  const r = await env.DB.prepare('INSERT INTO carres (nom, createur_id) VALUES (?1, ?2)')
    .bind(nom, vu.user.id).run();
  await env.DB.prepare('INSERT INTO carre_membres (user_id, carre_id) VALUES (?1, ?2)')
    .bind(vu.user.id, r.meta.last_row_id).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function carreJoin(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const carre = await env.DB.prepare('SELECT id FROM carres WHERE id = ?1').bind(carreId).first();
  if (!carre) return json({ error: 'Carré introuvable.' }, 404);
  if (await monAppartenance(env, carreId, vu.user.id)) return json({ error: 'Vous y êtes déjà.' }, 409);
  const membres = await membresDe(env, carreId);
  if (membres.length >= 4) return json({ error: 'Ce carré est complet.' }, 409);

  await env.DB.prepare('INSERT INTO carre_membres (user_id, carre_id) VALUES (?1, ?2)')
    .bind(vu.user.id, carreId).run();
  return json({ ok: true });
}

/* La page d'un carré. Membre : les As et toutes les sociétés de l'atelier.
   Un autre As de l'échelon 5 : la façade seulement : le nom, les As, les
   places, le nombre de sociétés en chantier. */
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

  const noms = membres.map((m) => ({ user_id: m.user_id, username: m.username }));
  const nbSocietes = (await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM carre_societes WHERE carre_id = ?1'
  ).bind(carreId).first())?.n || 0;

  /* La façade d'un carré qui n'est pas le mien : ses As, ses places, et
     combien de sociétés s'y imaginent. Rien de leur contenu. */
  if (!moi) {
    return json({
      publique: true,
      carre: { id: carre.id, nom: carre.nom },
      membres: noms,
      societes: nbSocietes,
      places: 4 - membres.length,
    });
  }

  /* Dedans : les sociétés harmonieuses du carré. Chacune a un nom, et se
     pense sur deux volets — ce qui lui permet d'être, comment on y vit. */
  const societes = (await env.DB.prepare(
    `SELECT s.id, s.nom, s.created_at, s.updated_at, u.username AS creee_par,
            (SELECT COUNT(*) FROM societe_idees i WHERE i.societe_id = s.id AND i.volet = 'etre') AS etre,
            (SELECT COUNT(*) FROM societe_idees i WHERE i.societe_id = s.id AND i.volet = 'vivre') AS vivre
       FROM carre_societes s LEFT JOIN users u ON u.id = s.creee_par
      WHERE s.carre_id = ?1 ORDER BY s.updated_at DESC`
  ).bind(carreId).all()).results || [];

  return json({
    publique: false,
    carre,
    membres: noms,
    societes,
    volets: VOLETS_SOCIETE,
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

  /* Le carré appartient aux quatre, pas à celui qui l'a fondé : n'importe qui
     s'en va, fondateur compris, et l'atelier continue avec les autres. Ce qui
     y a été imaginé reste au carré : les sociétés sont à lui. */
  await env.DB.prepare('DELETE FROM carre_membres WHERE carre_id = ?1 AND user_id = ?2')
    .bind(carreId, vu.user.id).run();

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
      env.DB.prepare(
        'DELETE FROM societe_idees WHERE societe_id IN (SELECT id FROM carre_societes WHERE carre_id = ?1)'
      ).bind(carreId),
      env.DB.prepare('DELETE FROM carre_societes WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carre_messages WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carre_invitations WHERE carre_id = ?1').bind(carreId),
      env.DB.prepare('DELETE FROM carres WHERE id = ?1').bind(carreId),
    ]);
  }
  return json({ ok: true });
}

/* ------------------------------------- les sociétés harmonieuses ----------
   Ce qu'un carré fabrique. Chaque société a un nom ; on l'imagine sur deux
   volets : ce qui lui permet d'être (ses fondations), et comment les humains
   s'y comporteraient (la vie dedans). Membres seulement, lecture comme
   écriture : la société est l'œuvre du carré.                             */

async function societeEtCarre(env, societeId) {
  return env.DB.prepare(
    `SELECT s.id, s.carre_id, s.nom, s.created_at, s.updated_at, c.nom AS carre_nom,
            c.discord_url
       FROM carre_societes s JOIN carres c ON c.id = s.carre_id WHERE s.id = ?1`
  ).bind(societeId).first();
}

async function societeCreate(request, env, carreId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  if (!(await monAppartenance(env, carreId, vu.user.id))) return json({ error: 'Carré introuvable.' }, 404);

  const body = await readJson(request);
  const nom = String(body?.nom || '').trim();
  if (!nom || nom.length > 80) return json({ error: 'Donnez un nom à cette société (80 caractères au plus).' }, 400);

  const r = await env.DB.prepare(
    'INSERT INTO carre_societes (carre_id, nom, creee_par) VALUES (?1, ?2, ?3)'
  ).bind(carreId, nom, vu.user.id).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function societeGet(request, env, societeId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const s = await societeEtCarre(env, societeId);
  if (!s || !(await monAppartenance(env, s.carre_id, vu.user.id))) {
    return json({ error: 'Société introuvable.' }, 404);
  }
  const membres = await membresDe(env, s.carre_id);
  const idees = (await env.DB.prepare(
    `SELECT i.id, i.volet, i.body, i.created_at, i.user_id, u.username
       FROM societe_idees i JOIN users u ON u.id = i.user_id
      WHERE i.societe_id = ?1 ORDER BY i.id`
  ).bind(societeId).all()).results || [];
  return json({
    societe: s,
    membres: membres.map((m) => ({ user_id: m.user_id, username: m.username })),
    idees,
    volets: VOLETS_SOCIETE,
    moi: vu.user.id,
  });
}

// Le nom d'une société se retravaille comme elle : par n'importe quel As.
async function societeUpdate(request, env, societeId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const s = await societeEtCarre(env, societeId);
  if (!s || !(await monAppartenance(env, s.carre_id, vu.user.id))) {
    return json({ error: 'Société introuvable.' }, 404);
  }
  const body = await readJson(request);
  const nom = String(body?.nom || '').trim();
  if (!nom || nom.length > 80) return json({ error: 'Nom invalide (80 caractères au plus).' }, 400);
  await env.DB.prepare(
    `UPDATE carre_societes SET nom = ?1, updated_at = datetime('now') WHERE id = ?2`
  ).bind(nom, societeId).run();
  return json({ ok: true });
}

// Une société vide se referme ; une société pensée reste : elle appartient
// au carré, pas au geste d'un seul.
async function societeDelete(request, env, societeId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const s = await societeEtCarre(env, societeId);
  if (!s || !(await monAppartenance(env, s.carre_id, vu.user.id))) {
    return json({ error: 'Société introuvable.' }, 404);
  }
  const pleine = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM societe_idees WHERE societe_id = ?1'
  ).bind(societeId).first();
  if (pleine?.n) return json({ error: 'Cette société est déjà pensée : elle appartient au carré.' }, 400);
  await env.DB.prepare('DELETE FROM carre_societes WHERE id = ?1').bind(societeId).run();
  return json({ ok: true });
}

async function societeIdee(request, env, societeId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const s = await societeEtCarre(env, societeId);
  if (!s || !(await monAppartenance(env, s.carre_id, vu.user.id))) {
    return json({ error: 'Société introuvable.' }, 404);
  }
  const body = await readJson(request);
  const volet = String(body?.volet || '');
  if (!VOLETS_CLES.includes(volet)) return json({ error: 'Un volet : ce qui lui permet d’être, ou comment on y vit.' }, 400);
  const texte = String(body?.body || '').trim();
  if (!texte) return json({ error: 'Il n’y a rien à déposer.' }, 400);
  if (texte.length > 2000) return json({ error: 'Trop long (2000 caractères).' }, 400);

  const r = await env.DB.prepare(
    'INSERT INTO societe_idees (societe_id, user_id, volet, body) VALUES (?1, ?2, ?3, ?4)'
  ).bind(societeId, vu.user.id, volet, texte).run();
  await env.DB.prepare(
    `UPDATE carre_societes SET updated_at = datetime('now') WHERE id = ?1`
  ).bind(societeId).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

// Chacun retire ce qu'il a déposé, et rien d'autre.
async function societeIdeeDelete(request, env, societeId, ideeId) {
  const { vu, refus } = await gateCarreUser(request, env);
  if (refus) return refus;
  const s = await societeEtCarre(env, societeId);
  if (!s || !(await monAppartenance(env, s.carre_id, vu.user.id))) {
    return json({ error: 'Société introuvable.' }, 404);
  }
  const idee = await env.DB.prepare(
    'SELECT id, user_id FROM societe_idees WHERE id = ?1 AND societe_id = ?2'
  ).bind(ideeId, societeId).first();
  if (!idee || idee.user_id !== vu.user.id) return json({ error: 'Idée introuvable.' }, 404);
  await env.DB.prepare('DELETE FROM societe_idees WHERE id = ?1').bind(ideeId).run();
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
    `SELECT a.user_id, a.note, a.created_at, u.username,
            (SELECT COUNT(*) FROM carre_membres m WHERE m.user_id = a.user_id) AS carres
       FROM carre_annonces a
       JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 50`
  ).all()).results || [];

  /* On invite dans n'importe lequel de SES carrés où il reste une place :
     on n'invite personne dans un carré où l'on n'est pas. */
  const carres = [];
  const mesCarresAvecPlaces = [];
  for (const c of await mesCarres(env, vu.user.id)) {
    carres.push(c);
    const places = 4 - (await membresDe(env, c.id)).length;
    if (places > 0) mesCarresAvecPlaces.push({ id: c.id, nom: c.nom, places });
  }

  const reponse = {
    // la charte du bon carré, en une phrase : celle des missions
    charte: CHARTE_CARRE,
    annonces: annonces.map((a) => ({ ...a, moi: a.user_id === vu.user.id })),
    monAnnonce: await env.DB.prepare(
      'SELECT note FROM carre_annonces WHERE user_id = ?1'
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
  if (note.length > 500) return json({ error: 'L’annonce tient en 500 caractères.' }, 400);

  await env.DB.prepare(
    `INSERT INTO carre_annonces (user_id, note) VALUES (?1, ?2)
     ON CONFLICT(user_id) DO UPDATE SET note = ?2`
  ).bind(vu.user.id, note).run();
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
  const username = String(body?.username || '').trim();
  const note = String(body?.note || '').trim();
  if (note.length > 300) return json({ error: 'Le mot d’invitation tient en 300 caractères.' }, 400);
  // on invite dans un de SES carrés, et seulement s'il y reste une place
  const carreId = Number(body?.carre_id);
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
  if (await monAppartenance(env, invitation.carre_id, vu.user.id)) {
    await env.DB.prepare('DELETE FROM carre_invitations WHERE id = ?1').bind(id).run();
    return json({ error: 'Vous êtes déjà dans ce carré.' }, 409);
  }
  const membres = await membresDe(env, invitation.carre_id);
  if (membres.length >= 4) return json({ error: 'Ce carré s’est rempli entre-temps.' }, 409);

  // l'annonce reste au salon : un As peut vouloir d'autres carrés encore
  await env.DB.batch([
    env.DB.prepare('INSERT INTO carre_membres (user_id, carre_id) VALUES (?1, ?2)')
      .bind(vu.user.id, invitation.carre_id),
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

/* ---------------------------------------------- le brainstorm (échelon 6)
   Un carré complet annonce un live (TikTok, YouTube ou Twitch) pour imaginer
   une de ses sociétés harmonieuses — la concevoir, ou l'améliorer. Pendant
   le live, la salle propose des réflexions et vote ; le carré voit monter
   les plus soutenues du moment. Tout marche par relecture périodique côté
   client, sans serveur temps réel ni connexion tenue ouverte. Le
   coût d'un brainstorm à mille personnes est celui de requêtes ordinaires. */

const PLATEFORMES_LIVE = {
  youtube: (u) => /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname.replace(/^www\.|^m\./, '')),
  twitch: (u) => /(^|\.)twitch\.tv$/.test(u.hostname.replace(/^www\./, '')),
  tiktok: (u) => /(^|\.)tiktok\.com$/.test(u.hostname.replace(/^www\./, '')),
};

/* La liste des brainstorms. `statut` la restreint : sans lui, la scène
   remonte le direct puis l'annoncé, et les archives se retrouvaient reléguées
   en fin de liste — donc coupées par la limite dès que la plateforme vit un
   peu. Les archives demandent maintenant les leurs.                        */
async function brainstormsList(request, env, url) {
  const { refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  await ensureHautesTables(env);
  const brut = String(url.searchParams.get('statut') || '');
  const statut = ['live', 'annonce', 'termine'].includes(brut) ? brut : null;
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.sujet, b.plateforme, b.url, b.statut, b.created_at, b.live_depuis,
            c.nom AS carre_nom, h.username AS hote_username, s.nom AS societe_nom,
            (SELECT COUNT(*) FROM brainstorm_idees i WHERE i.brainstorm_id = b.id) AS idees,
            (SELECT COUNT(*) FROM brainstorm_idees i WHERE i.brainstorm_id = b.id AND i.retenue = 1) AS retenues
       FROM brainstorms b JOIN carres c ON c.id = b.carre_id
       LEFT JOIN users h ON h.id = b.hote_user_id
       LEFT JOIN carre_societes s ON s.id = b.societe_id
      WHERE ?1 IS NULL OR b.statut = ?1
      ORDER BY CASE b.statut WHEN 'live' THEN 0 WHEN 'annonce' THEN 1 ELSE 2 END,
               COALESCE(b.live_depuis, b.created_at) DESC
      LIMIT 50`
  ).bind(statut).all();
  return json({ brainstorms: results || [] });
}

async function brainstormsCreate(request, env) {
  const { vu, refus } = await requireEchelon(request, env, ECHELON_BRAINSTORM, 'brainstorm');
  if (refus) return refus;
  if (!vu.user) return json({ error: 'Connexion requise.' }, 401);
  await ensureHautesTables(env);

  const body = await readJson(request);

  /* Un brainstorm, c'est un carré qui imagine une société harmonieuse en
     public : concevoir un modèle, ou améliorer un modèle qui existe déjà.
     N'importe quel As d'un carré COMPLET l'annonce et tient l'antenne, et le
     live s'attache à une société du carré — une déjà en chantier, ou une qui
     naît pour l'occasion. */
  const carreId = Number(body?.carre_id);
  if (!(await monAppartenance(env, carreId, vu.user.id))) {
    return json({ error: 'Le live est porté par un de tes carrés.' }, 403);
  }
  const membres = await membresDe(env, carreId);
  if (membres.length < 4) return json({ error: 'Le carré doit être complet : quatre As.' }, 403);
  const hote = vu.user.id;

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

  // la société sur laquelle le carré va penser : une des siennes, ou une
  // nouvelle, créée à l'annonce
  let societeId = body?.societe_id == null ? null : Number(body.societe_id);
  const societeNom = String(body?.societe_nom || '').trim();
  if (societeId != null) {
    const s = await env.DB.prepare(
      'SELECT id FROM carre_societes WHERE id = ?1 AND carre_id = ?2'
    ).bind(societeId, carreId).first();
    if (!s) return json({ error: 'Cette société n’est pas de ce carré.' }, 404);
  } else if (societeNom) {
    if (societeNom.length > 80) return json({ error: 'Nom de société trop long (80 caractères).' }, 400);
    const r = await env.DB.prepare(
      'INSERT INTO carre_societes (carre_id, nom, creee_par) VALUES (?1, ?2, ?3)'
    ).bind(carreId, societeNom, vu.user.id).run();
    societeId = r.meta.last_row_id;
  } else {
    return json({ error: 'Un brainstorm porte sur une société : choisis-en une, ou nomme celle qui naît.' }, 400);
  }

  const r = await env.DB.prepare(
    `INSERT INTO brainstorms (carre_id, user_id, sujet, plateforme, url, hote_user_id, societe_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(carreId, vu.user.id, sujet, plateforme, url, hote, societeId).run();
  return json({ ok: true, id: r.meta.last_row_id, societe_id: societeId }, 201);
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
            b.carre_id, c.nom AS carre_nom, c.discord_url, h.username AS hote_username,
            b.societe_id, s.nom AS societe_nom
       FROM brainstorms b JOIN carres c ON c.id = b.carre_id
       LEFT JOIN users h ON h.id = b.hote_user_id
       LEFT JOIN carre_societes s ON s.id = b.societe_id
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
  await env.DB.prepare('DELETE FROM songs WHERE id = ?1').bind(id).run();
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
