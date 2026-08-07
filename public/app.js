// WhiteCadae — application frontend (SPA vanilla)

const app = document.getElementById('app');
const nav = document.getElementById('nav');

const state = {
  user: null,
  song: null, // données de la page chanson en cours
  sel: null, // sélection : {type:'line'|'word'|'title'|'duration', lineId?, start?, end?}
  openComments: new Set(), // espaces commentaires ouverts, clés "kind:id"
  corpus: null, // {songs, lines} : toutes les phrases de tous les morceaux
  corpusDf: null, // fréquence documentaire des mots (moteur d'échos)
  builder: null, // constructeur d'interprétation d'ensemble en cours
  sheetOpen: false, // feuille du bas ouverte (mobile)
  songModalOpen: false, // fenêtre « l'ensemble du morceau » ouverte
  enigmes: null, // état des énigmes de la page /57
};

/* ------------------------------------------------------------------ utils */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function tokens(text) {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
}

function mmss(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.length <= 10 ? '' : 'Z'));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
  return data;
}

/* ---------------------------------------------------------------- routage */

// Jeton de navigation : un rendu asynchrone lancé avant un changement de page
// est abandonné à son réveil au lieu d'écraser la page courante.
let renderEpoch = 0;
function newEpoch() { return ++renderEpoch; }
function stale(epoch) { return epoch !== renderEpoch; }

function navigate(path) {
  history.pushState(null, '', path);
  route();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a) {
    e.preventDefault();
    navigate(a.getAttribute('href'));
  }
});

window.addEventListener('popstate', route);

function closeNav() {
  document.body.classList.remove('nav-open');
  const t = document.getElementById('nav-toggle');
  if (t) t.setAttribute('aria-expanded', 'false');
}

function bindNavToggle() {
  const toggle = document.getElementById('nav-toggle');
  if (!toggle) return;
  toggle.onclick = (e) => {
    e.stopPropagation();
    const open = !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  };
  // un clic hors de l'en-tête referme le menu
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('nav-open')) return;
    if (e.target.closest && e.target.closest('.site-header')) return;
    closeNav();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });
}

async function route() {
  window.scrollTo(0, 0);
  closeNav();
  const path = location.pathname;
  // toute navigation ferme la sélection en cours
  state.sheetOpen = false;
  state.songModalOpen = false;
  closeSongModal();
  document.body.classList.remove('sheet-open');
  const bar = document.getElementById('sel-bar');
  if (bar) bar.hidden = true;
  const backdrop = document.getElementById('sheet-backdrop');
  if (backdrop) backdrop.hidden = true;
  closeSettings();
  renderNav();
  let m;
  if (path === '/' || path === '') return pageInterpretations();
  if (path === '/connexion') return pageLogin();
  if (path === '/inscription') return pageRegister();
  if (path === '/admin') return pageAdmin();
  if (path === '/reprises') return pageCovers();
  if (path === '/57') return pageEnigmes();
  if ((m = path.match(/^\/chanson\/([^/]+)\/reprises$/))) return pageSongCovers(decodeURIComponent(m[1]));
  if ((m = path.match(/^\/chanson\/([^/]+)$/))) return pageSong(decodeURIComponent(m[1]));
  if ((m = path.match(/^\/membre\/([^/]+)$/))) return pageProfile(decodeURIComponent(m[1]));
  app.innerHTML = '<h1>Page introuvable</h1><p><a href="/" data-link>Retour aux interprétations</a></p>';
}

function profileHref(username) {
  return `/membre/${encodeURIComponent(username)}`;
}

function authorLink(username) {
  return `<a class="annotation-author" href="${profileHref(username)}" data-link>${esc(username)}</a>`;
}

/* -------------------------------------------------------------- compte --- */

function avatarHref(username) {
  return `/api/users/${encodeURIComponent(username)}/avatar`;
}

const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<rect width="100" height="100" fill="#23232b"/>' +
  '<circle cx="50" cy="40" r="18" fill="#4c4c56"/>' +
  '<rect x="18" y="64" width="64" height="32" rx="16" fill="#4c4c56"/></svg>'
);

function avatarImg(username, className) {
  return `<img class="${className}" src="${avatarHref(username)}" alt=""
    onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">`;
}

// Recadre l'image en carré (centré) et la compresse en JPEG avant l'envoi :
// on ne transmet jamais un fichier brut potentiellement lourd au serveur.
function resizeImageToDataUrl(file, size, quality) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('Choisissez un fichier image.'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Image trop lourde (8 Mo maximum).'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image invalide.')); };
    img.src = url;
  });
}

function ensureSettingsChrome() {
  let backdrop = document.getElementById('settings-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'settings-backdrop';
    backdrop.className = 'modal-backdrop';
    backdrop.hidden = true;
    backdrop.onclick = closeSettings;
    document.body.appendChild(backdrop);
  }
  let modal = document.getElementById('settings-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'modal';
    modal.hidden = true;
    document.body.appendChild(modal);
  }
  return { backdrop, modal };
}

function closeSettings() {
  const backdrop = document.getElementById('settings-backdrop');
  const modal = document.getElementById('settings-modal');
  if (backdrop) backdrop.hidden = true;
  if (modal) modal.hidden = true;
}

function openSettings() {
  const user = state.user;
  if (!user) return;
  const { backdrop, modal } = ensureSettingsChrome();

  modal.innerHTML = `
    <button type="button" class="link-btn modal-close" id="settings-close" aria-label="Fermer">✕</button>
    <h2>Paramètres du compte</h2>

    <section class="settings-section">
      <h3>Photo de profil</h3>
      <div class="settings-avatar-row">
        ${avatarImg(user.username, 'settings-avatar-preview')}
        <label class="btn" for="avatar-input">Changer la photo</label>
        <input type="file" id="avatar-input" accept="image/*" hidden>
      </div>
      <div class="error-msg" id="avatar-error"></div>
    </section>

    <section class="settings-section">
      <h3>Pseudo</h3>
      <form id="username-form">
        <input id="username-input" value="${esc(user.username)}" required minlength="3" maxlength="30">
        <div class="error-msg" id="username-error"></div>
        <div class="success-msg" id="username-success"></div>
        <button type="submit" class="primary">Enregistrer</button>
      </form>
    </section>

    <section class="settings-section">
      <h3>Mot de passe</h3>
      <form id="password-form">
        <label for="pwd-current">Mot de passe actuel</label>
        <input type="password" id="pwd-current" required autocomplete="current-password">
        <label for="pwd-new">Nouveau mot de passe <small>(8 caractères minimum)</small></label>
        <input type="password" id="pwd-new" required minlength="8" autocomplete="new-password">
        <div class="error-msg" id="password-error"></div>
        <div class="success-msg" id="password-success"></div>
        <button type="submit" class="primary">Changer le mot de passe</button>
      </form>
    </section>

    <section class="settings-section">
      <button type="button" class="link-btn danger" id="settings-logout">Se déconnecter</button>
    </section>`;

  backdrop.hidden = false;
  modal.hidden = false;

  document.getElementById('settings-close').onclick = closeSettings;

  document.getElementById('avatar-input').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const errBox = document.getElementById('avatar-error');
    errBox.textContent = '';
    try {
      const dataUrl = await resizeImageToDataUrl(file, 480, 0.85);
      await api('/api/account/avatar', { method: 'POST', body: { data: dataUrl } });
      document.getElementById('settings-modal').querySelector('.settings-avatar-preview').src = dataUrl;
    } catch (err) {
      errBox.textContent = err.message;
    }
  };

  document.getElementById('username-form').onsubmit = async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('username-error');
    const okBox = document.getElementById('username-success');
    errBox.textContent = '';
    okBox.textContent = '';
    const newName = document.getElementById('username-input').value.trim();
    try {
      await api('/api/account/username', { method: 'PUT', body: { username: newName } });
      const oldName = state.user.username;
      state.user.username = newName;
      okBox.textContent = 'Pseudo mis à jour.';
      renderNav();
      closeSettings();
      if (newName !== oldName) navigate(profileHref(newName));
    } catch (err) {
      errBox.textContent = err.message;
    }
  };

  document.getElementById('password-form').onsubmit = async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('password-error');
    const okBox = document.getElementById('password-success');
    errBox.textContent = '';
    okBox.textContent = '';
    try {
      await api('/api/account/password', {
        method: 'PUT',
        body: {
          current_password: document.getElementById('pwd-current').value,
          new_password: document.getElementById('pwd-new').value,
        },
      });
      okBox.textContent = 'Mot de passe changé.';
      e.target.reset();
    } catch (err) {
      errBox.textContent = err.message;
    }
  };

  document.getElementById('settings-logout').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    closeSettings();
    navigate('/');
  };
}

function renderNav() {
  const u = state.user;
  // La déconnexion se fait depuis les paramètres du compte (page profil) :
  // pas besoin de la dupliquer dans le menu.
  nav.innerHTML = u
    ? `<a href="/" data-link>Interprétations</a>
       <a href="/57" data-link>57</a>
       <a href="/reprises" data-link>Reprises</a>
       ${u.is_admin ? '<a href="/admin" data-link>Administration</a>' : ''}
       <a href="${profileHref(u.username)}" data-link>Mon profil</a>`
    : `<a href="/" data-link>Interprétations</a>
       <a href="/57" data-link>57</a>
       <a href="/reprises" data-link>Reprises</a>
       <a href="/connexion" data-link>Se connecter</a>
       <a href="/inscription" data-link class="btn">Créer un compte</a>`;
}

/* -------------------------------------------------------- interprétations */

// L'API sert les albums du plus ancien au plus récent (colonne `position`).
// L'accueil et les reprises les présentent dans l'autre sens : la dernière
// sortie en premier. L'ordre des morceaux à l'intérieur d'un album ne change
// pas — il suit toujours le numéro de piste.
function newestFirst(albums) {
  return [...albums].reverse();
}

async function pageInterpretations() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  const data = await api('/api/albums');
  if (stale(epoch)) return;
  // L'API renvoie la discographie dans l'ordre de sortie ; à l'affichage on
  // part du plus récent.
  const albums = newestFirst(data.albums).map((al) => `
    <section class="album-card">
      <div class="album-head">
        <h2>${esc(al.title)}</h2>
      </div>
      <ol class="song-list">
        ${al.songs.map((s) => `
          <li>
            <span class="song-num">${s.track_number ?? ''}</span>
            <a href="/chanson/${encodeURIComponent(s.slug)}" data-link>${esc(s.title)}</a>
            <span class="song-meta">${s.annotation_count ? `${s.annotation_count} interprétation${s.annotation_count > 1 ? 's' : ''}` : (s.line_count ? '' : 'paroles à venir')}</span>
          </li>`).join('')}
      </ol>
    </section>`).join('');

  app.innerHTML = '<h1>Interprétations</h1>' + (albums || '<p class="empty-note">Aucun album pour le moment.</p>');
}

/* ------------------------------------------------------- connexion/compte */

function pageLogin() {
  app.innerHTML = `
    <form class="form-card" id="login-form">
      <h1>Se connecter</h1>
      <label for="lf-email">Email</label>
      <input id="lf-email" type="email" required autocomplete="email">
      <label for="lf-password">Mot de passe</label>
      <input id="lf-password" type="password" required autocomplete="current-password">
      <div class="error-msg" id="lf-error"></div>
      <button type="submit" class="primary">Connexion</button>
      <p class="form-footer">Pas encore de compte ? <a href="/inscription" data-link>Inscrivez-vous</a></p>
    </form>`;
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: {
          email: document.getElementById('lf-email').value,
          password: document.getElementById('lf-password').value,
        },
      });
      state.user = data.user;
      navigate('/');
    } catch (err) {
      document.getElementById('lf-error').textContent = err.message;
    }
  };
}

function pageRegister() {
  app.innerHTML = `
    <form class="form-card" id="reg-form">
      <h1>Créer un compte</h1>
      <label for="rf-username">Pseudo</label>
      <input id="rf-username" required minlength="3" maxlength="30" autocomplete="username">
      <label for="rf-email">Email</label>
      <input id="rf-email" type="email" required autocomplete="email">
      <label for="rf-password">Mot de passe <small>(8 caractères minimum)</small></label>
      <input id="rf-password" type="password" required minlength="8" autocomplete="new-password">
      <div class="error-msg" id="rf-error"></div>
      <button type="submit" class="primary">S’inscrire</button>
      <p class="form-footer">Déjà inscrit ? <a href="/connexion" data-link>Connectez-vous</a></p>
    </form>`;
  document.getElementById('reg-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: {
          username: document.getElementById('rf-username').value,
          email: document.getElementById('rf-email').value,
          password: document.getElementById('rf-password').value,
        },
      });
      state.user = data.user;
      navigate('/');
    } catch (err) {
      document.getElementById('rf-error').textContent = err.message;
    }
  };
}

/* ---------------------------------------------------------------- chanson */

async function pageSong(slug, keepSelection = false) {
  const epoch = newEpoch();
  if (!keepSelection) {
    app.innerHTML = '<div class="loading">Chargement…</div>';
    state.sel = null;
    state.openComments = new Set();
    state.builder = null;
    state.sheetOpen = false;
    document.body.classList.remove('sheet-open');
  }
  let data;
  try {
    data = await api(`/api/songs/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (!stale(epoch)) {
      app.innerHTML = `<h1>Chanson introuvable</h1><p><a href="/" data-link>Retour aux interprétations</a></p>`;
    }
    return;
  }
  if (stale(epoch)) return;
  state.song = data;
  renderSongPage();
}

function annotationsFor(pred) {
  return state.song.annotations.filter(pred);
}

function lineHasNote(lineId) {
  return state.song.annotations.some((a) => a.target_type === 'line' && a.line_id === lineId);
}

// Position ordonnée d'un mot dans le texte : (numéro de ligne, index de mot).
function lineNumberOf(lineId) {
  const l = state.song.lines.find((x) => x.id === lineId);
  return l ? l.line_number : 0;
}

function posKey(lineId, idx) {
  return lineNumberOf(lineId) * 1000 + (idx || 0);
}

function passageRange(a) {
  return [posKey(a.line_id, a.word_start || 0), posKey(a.end_line_id, a.word_end == null ? 999 : a.word_end)];
}

function selPassageRange(sel) {
  return [posKey(sel.startLine, sel.startIdx), posKey(sel.endLine, sel.endIdx)];
}

function wordHasNote(lineId, idx) {
  const pos = posKey(lineId, idx);
  return state.song.annotations.some((a) => {
    if (a.target_type === 'word' && a.line_id === lineId) {
      return idx >= a.word_start && idx <= a.word_end;
    }
    if (a.target_type === 'passage') {
      const [s, e] = passageRange(a);
      return pos >= s && pos <= e;
    }
    return false;
  });
}

// Texte d'un passage : fin de la phrase de départ, phrases entières du
// milieu, début de la phrase d'arrivée.
function passageText(startLineId, startIdx, endLineId, endIdx) {
  const lines = state.song.lines;
  const s = lines.find((l) => l.id === startLineId);
  const e = lines.find((l) => l.id === endLineId);
  if (!s || !e) return '';
  if (s.id === e.id) return tokens(s.text).slice(startIdx, endIdx + 1).join(' ');
  const middle = lines.filter((l) =>
    l.line_number > s.line_number && l.line_number < e.line_number &&
    l.text !== '' && !/^\[[^\]]+\]$/.test(l.text));
  return [
    tokens(s.text).slice(startIdx).join(' '),
    ...middle.map((l) => l.text),
    tokens(e.text).slice(0, endIdx + 1).join(' '),
  ].join(' / ');
}

/* ------------------------------------------------- moteur de sélection ---
   Sélection maison (aucune sélection native du navigateur) : on peint
   directement les mots. Sur mobile, aucun menu système ne s'interpose, et
   deux poignées permettent d'ajuster le début et la fin au mot près.       */

const SEL = {
  dragging: false,
  anchor: null, // extrémité fixe {el, lineId, idx, pos}
  focus: null, // extrémité qui suit le doigt / la souris
  words: [], // index des mots affichés
  painted: null, // dernière plage peinte, pour éviter les repeints inutiles
  edgeTimer: null, // défilement automatique près des bords
  edgeSpeed: 0,
  edgeX: 0,
  edgeY: 0,
};

function indexWords() {
  SEL.words = [...document.querySelectorAll('.lyrics .w')].map((el) => ({
    el,
    lineId: Number(el.dataset.line),
    idx: Number(el.dataset.idx),
    pos: Number(el.dataset.pos),
  }));
}

function wordOf(el) {
  return SEL.words.find((o) => o.el === el) || null;
}

// Mot sous le pointeur ; à défaut, le mot le plus proche — glisser dans une
// marge ou un interligne continue d'étendre la sélection.
function wordAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const hit = el && el.closest ? el.closest('.lyrics .w') : null;
  if (hit) return wordOf(hit);
  let best = null;
  let bestDist = Infinity;
  for (const o of SEL.words) {
    const r = o.el.getBoundingClientRect();
    const dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
    const dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
    const d = dy * 5 + dx; // la proximité verticale prime
    if (d < bestDist) { bestDist = d; best = o; }
  }
  return best;
}

function paintLive() {
  if (!SEL.anchor || !SEL.focus) return;
  const lo = Math.min(SEL.anchor.pos, SEL.focus.pos);
  const hi = Math.max(SEL.anchor.pos, SEL.focus.pos);
  if (SEL.painted && SEL.painted[0] === lo && SEL.painted[1] === hi) return;
  SEL.painted = [lo, hi];
  for (const o of SEL.words) o.el.classList.toggle('sel-live', o.pos >= lo && o.pos <= hi);
  positionHandles('.sel-live');
}

function clearLive() {
  SEL.painted = null;
  for (const o of SEL.words) o.el.classList.remove('sel-live');
}

// Défilement automatique quand on glisse près d'un bord : indispensable
// pour sélectionner un passage plus long que l'écran.
function edgeScroll(y) {
  const MARGIN = 90;
  const speed = y < MARGIN ? -(MARGIN - y) / 5
    : (y > window.innerHeight - MARGIN ? (y - (window.innerHeight - MARGIN)) / 5 : 0);
  if (!speed) { stopEdgeScroll(); return; }
  SEL.edgeSpeed = speed;
  SEL.edgeY = y;
  if (SEL.edgeTimer) return;
  SEL.edgeTimer = setInterval(() => {
    if (!SEL.dragging) { stopEdgeScroll(); return; }
    window.scrollBy(0, SEL.edgeSpeed);
    const w = wordAtPoint(SEL.edgeX, SEL.edgeY);
    if (w) { SEL.focus = w; paintLive(); }
  }, 16);
}

function stopEdgeScroll() {
  if (SEL.edgeTimer) { clearInterval(SEL.edgeTimer); SEL.edgeTimer = null; }
}

// Place les deux poignées aux extrémités des mots portant `selector`.
function positionHandles(selector) {
  const lyrics = document.querySelector('.lyrics');
  const h1 = document.getElementById('sel-handle-start');
  const h2 = document.getElementById('sel-handle-end');
  if (!lyrics || !h1 || !h2) return;
  const els = [...lyrics.querySelectorAll(selector)];
  if (!els.length) { h1.hidden = true; h2.hidden = true; return; }
  const base = lyrics.getBoundingClientRect();
  const a = els[0].getBoundingClientRect();
  const b = els[els.length - 1].getBoundingClientRect();
  h1.style.left = `${a.left - base.left}px`;
  h1.style.top = `${a.top - base.top}px`;
  h1.style.height = `${a.height}px`;
  h2.style.left = `${b.right - base.left}px`;
  h2.style.top = `${b.top - base.top}px`;
  h2.style.height = `${b.height}px`;
  h1.hidden = false;
  h2.hidden = false;
}

// Extrémités de la sélection validée, dans l'ordre du texte.
function committedEnds() {
  const els = [...document.querySelectorAll('.lyrics .selected-word')];
  if (!els.length) return null;
  const a = wordOf(els[0]);
  const b = wordOf(els[els.length - 1]);
  return a && b ? { a, b } : null;
}

function commitSelection() {
  if (!SEL.anchor || !SEL.focus) return;
  const [a, b] = SEL.anchor.pos <= SEL.focus.pos
    ? [SEL.anchor, SEL.focus]
    : [SEL.focus, SEL.anchor];
  state.sel = a.lineId === b.lineId
    ? { type: 'word', lineId: a.lineId, start: a.idx, end: b.idx }
    : { type: 'passage', startLine: a.lineId, startIdx: a.idx, endLine: b.lineId, endIdx: b.idx };
  renderSongPage();
  // sur grand écran, on amène le panneau sous les yeux s'il est hors de vue
  if (!window.matchMedia('(max-width: 900px)').matches) {
    const panel = document.getElementById('panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function clearSelection() {
  state.sel = null;
  state.sheetOpen = false;
  document.body.classList.remove('sheet-open');
  renderSongPage();
}

function bindLyricsSelection() {
  const lyrics = document.querySelector('.lyrics');
  if (!lyrics) return;
  indexWords();

  const startFrom = (w, extend) => {
    if (extend) {
      const ends = committedEnds();
      if (ends) {
        // on garde l'extrémité la plus éloignée comme ancre
        SEL.anchor = Math.abs(ends.a.pos - w.pos) >= Math.abs(ends.b.pos - w.pos) ? ends.a : ends.b;
      } else {
        SEL.anchor = w;
      }
    } else {
      SEL.anchor = w;
    }
    SEL.focus = w;
    SEL.painted = null;
    SEL.dragging = true;
    paintLive();
  };

  lyrics.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.w');
    if (!el) return;
    const w = wordOf(el);
    if (!w) return;
    if (e.pointerType !== 'touch') {
      e.preventDefault();
      try { lyrics.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    }
    startFrom(w, e.shiftKey);
  });

  lyrics.addEventListener('pointermove', (e) => {
    if (!SEL.dragging) return;
    SEL.edgeX = e.clientX;
    edgeScroll(e.clientY);
    const w = wordAtPoint(e.clientX, e.clientY);
    if (w) { SEL.focus = w; paintLive(); }
  });

  const finish = () => {
    stopEdgeScroll();
    if (!SEL.dragging) return;
    SEL.dragging = false;
    commitSelection();
  };
  lyrics.addEventListener('pointerup', finish);
  lyrics.addEventListener('pointercancel', () => {
    stopEdgeScroll();
    SEL.dragging = false;
    clearLive();
    positionHandles('.selected-word');
  });

  // double-clic / double-tap : toute la phrase
  lyrics.addEventListener('dblclick', (e) => {
    const el = e.target.closest && e.target.closest('.w');
    if (!el) return;
    state.sel = { type: 'line', lineId: Number(el.dataset.line) };
    renderSongPage();
  });

  // poignées d'ajustement
  for (const side of ['start', 'end']) {
    const h = document.getElementById(`sel-handle-${side}`);
    if (!h) continue;
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ends = committedEnds();
      if (!ends) return;
      SEL.anchor = side === 'start' ? ends.b : ends.a;
      SEL.focus = side === 'start' ? ends.a : ends.b;
      SEL.painted = null;
      SEL.dragging = true;
      try { h.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
      paintLive();
    });
    h.addEventListener('pointermove', (e) => {
      if (!SEL.dragging) return;
      SEL.edgeX = e.clientX;
      edgeScroll(e.clientY);
      const w = wordAtPoint(e.clientX, e.clientY);
      if (w) { SEL.focus = w; paintLive(); }
    });
    h.addEventListener('pointerup', finish);
  }
}

/* ------------------------------------- barre d'action et feuille du bas */

function selectionQuote() {
  const sel = state.sel;
  if (!sel) return '';
  if (sel.type === 'passage') return passageText(sel.startLine, sel.startIdx, sel.endLine, sel.endIdx);
  const line = state.song.lines.find((l) => l.id === sel.lineId);
  if (!line) return '';
  if (sel.type === 'line') return line.text;
  return tokens(line.text).slice(sel.start, sel.end + 1).join(' ');
}

function renderSelectionUI() {
  positionHandles('.selected-word');

  let bar = document.getElementById('sel-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sel-bar';
    document.body.appendChild(bar);
  }
  const sel = state.sel;
  const isText = sel && ['word', 'line', 'passage'].includes(sel.type);
  // Sur grand écran, le panneau de droite montre déjà la sélection et son
  // formulaire : la barre flottante serait redondante et masquerait le bas
  // de la page. Elle est réservée aux écrans où le panneau est hors de vue.
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  if (!isText || !narrow) {
    bar.hidden = true;
    document.body.classList.remove('bar-visible');
    const install = document.getElementById('install-banner');
    if (install && install.dataset.suspended === '1') {
      delete install.dataset.suspended;
      if (localStorage.getItem('wc_install_dismissed') !== '1') install.hidden = false;
    }
    if (!sel) {
      state.sheetOpen = false;
      document.body.classList.remove('sheet-open');
    }
    document.body.classList.toggle('sheet-open', state.sheetOpen);
    ensureSheetChrome();
    return;
  }

  const quote = selectionQuote();
  const short = quote.length > 90 ? quote.slice(0, 87) + '…' : quote;
  const nWords = sel.type === 'line' ? 0 : quote.split(/\s+/).length;
  const label = sel.type === 'line' ? 'Phrase'
    : (sel.type === 'passage' ? 'Passage' : (nWords > 1 ? `${nWords} mots` : 'Mot'));
  bar.innerHTML = `
    <div class="sel-bar-text">
      <span class="sel-bar-kind">${esc(label)}</span>
      <span class="sel-bar-quote">« ${esc(short)} »</span>
    </div>
    <button class="primary" id="sel-bar-go">✍ Interpréter</button>
    <button class="link-btn" id="sel-bar-clear" title="Annuler la sélection">✕</button>`;
  bar.hidden = false;
  document.body.classList.add('bar-visible');
  // les deux bandeaux occupent le bas de l'écran : l'invitation à installer
  // s'efface tant qu'une sélection est en cours
  const install = document.getElementById('install-banner');
  if (install && !install.hidden) install.dataset.suspended = '1';
  if (install) install.hidden = true;

  document.getElementById('sel-bar-clear').onclick = clearSelection;
  document.getElementById('sel-bar-go').onclick = () => openInterpretation();

  if (state.sheetOpen) document.body.classList.add('sheet-open');
  ensureSheetChrome();
}

function openInterpretation() {
  const panel = document.getElementById('panel');
  if (!panel) return;
  if (window.matchMedia('(max-width: 900px)').matches) {
    state.sheetOpen = true;
    document.body.classList.add('sheet-open');
    ensureSheetChrome();
  } else {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function ensureSheetChrome() {
  let backdrop = document.getElementById('sheet-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sheet-backdrop';
    backdrop.onclick = () => {
      state.sheetOpen = false;
      document.body.classList.remove('sheet-open');
      renderSelectionUI();
    };
    document.body.appendChild(backdrop);
  }
  backdrop.hidden = !state.sheetOpen;
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('settings-modal');
  if (modal && !modal.hidden) { closeSettings(); return; }
  if (state.songModalOpen) { closeSongModal(); return; }
  if (state.sel) clearSelection();
});

window.addEventListener('resize', () => {
  if (state.song && state.sel) positionHandles('.selected-word');
});

function countFor(type) {
  return state.song.annotations.filter((a) => a.target_type === type).length;
}

function renderSongPage() {
  const { song, lines } = state.song;
  const sel = state.sel;
  const duration = mmss(song.duration_seconds);

  const selRange = sel && sel.type === 'passage' ? selPassageRange(sel) : null;
  const lyricsHtml = lines.length
    ? `<div class="lyrics">${lines.map((line) => {
        if (line.text === '') return '<div class="stanza-gap"></div>';
        // [Couplet], [Refrain]… : en-tête de section, non annotable
        if (/^\[[^\]]+\]$/.test(line.text)) {
          return `<div class="section-tag">${esc(line.text.slice(1, -1))}</div>`;
        }
        const toks = tokens(line.text);
        const isSelLine = sel && sel.lineId === line.id;
        let lineInPassage = false;
        const words = toks.map((tok, i) => {
          const classes = ['w'];
          if (wordHasNote(line.id, i)) classes.push('has-note');
          if (isSelLine && sel.type === 'word' && i >= sel.start && i <= sel.end) classes.push('selected-word');
          if (selRange) {
            const pos = line.line_number * 1000 + i;
            if (pos >= selRange[0] && pos <= selRange[1]) { classes.push('selected-word'); lineInPassage = true; }
          }
          return `<span class="${classes.join(' ')}" data-line="${line.id}" data-idx="${i}" data-pos="${line.line_number * 1000 + i}">${esc(tok)}</span>`;
        }).join(' ');
        const lineClasses = ['lyric-line'];
        if (lineHasNote(line.id)) lineClasses.push('has-line-note');
        if (isSelLine && sel.type === 'line') lineClasses.push('selected-line');
        if (lineInPassage) lineClasses.push('selected-line');
        return `<div class="${lineClasses.join(' ')}" data-line-id="${line.id}">${words}</div>`;
      }).join('')}
        <span id="sel-handle-start" class="sel-handle sel-handle-start" hidden></span>
        <span id="sel-handle-end" class="sel-handle sel-handle-end" hidden></span>
      </div>
      <p class="hint">Appuyez sur un mot, puis <strong>faites glisser les poignées</strong> pour étendre la sélection
      au passage exact — même à cheval sur plusieurs phrases. Glisser directement sur le texte fonctionne aussi,
      et un double-clic sélectionne toute la phrase.</p>`
    : `<div class="no-lyrics">Les paroles de « ${esc(song.title)} » seront bientôt disponibles.</div>`;

  app.innerHTML = `
    <div class="breadcrumb"><a href="/" data-link>Interprétations</a> › ${esc(song.album_title || 'Sans album')}</div>
    <h1>${esc(song.title)}</h1>
    <div class="song-targets">
      <button class="target-chip target-chip-write ${sel && sel.type === 'title' ? 'active' : ''}" id="target-title">
        ✍ Interpréter le titre${countFor('title') ? ` · ${countFor('title')}` : ''}
      </button>
      <button class="target-chip target-chip-write ${sel && sel.type === 'duration' ? 'active' : ''}" id="target-duration">
        ✍ Interpréter la durée${duration ? ` (${duration})` : ''}${countFor('duration') ? ` · ${countFor('duration')}` : ''}
      </button>
      ${song.youtube_url ? `<a class="target-chip" href="${esc(song.youtube_url)}" target="_blank" rel="noopener">▶ Écouter</a>` : ''}
      <a class="target-chip" href="/chanson/${encodeURIComponent(song.slug)}/reprises" data-link>
        🎬 Reprises${state.song.coverCount ? ` · ${state.song.coverCount}` : ''}
      </a>
    </div>
    <div class="song-layout">
      <div>
        ${lyricsHtml}
        <div id="inbound"></div>
      </div>
      <aside class="side-panel" id="panel"></aside>
    </div>
    <button type="button" class="fab" id="song-fab"
            title="Interpréter « ${esc(song.title)} » dans son ensemble"
            aria-label="Interpréter la chanson dans son ensemble">
      <span class="fab-icon">💬</span>
      ${countFor('song') ? `<span class="fab-count">${countFor('song')}</span>` : ''}
    </button>`;

  bindLyricsSelection();

  const pickTarget = (type) => {
    const was = sel && sel.type === type;
    state.sel = was ? null : { type };
    renderSongPage();
    if (!was) openInterpretation();
  };
  document.getElementById('target-title').onclick = () => pickTarget('title');
  document.getElementById('target-duration').onclick = () => pickTarget('duration');

  document.getElementById('song-fab').onclick = openSongModal;

  renderPanel();
  renderInbound();
  renderSelectionUI();
  renderSongModal();
}

/* ------------------------------------------------- l'ensemble du morceau ---
   Le sens général, les interprétations d'ensemble et les connexions ne sont
   plus empilés en bas de page : ils vivent dans une fenêtre qu'on ouvre par
   le bouton flottant, atteignable au pouce depuis n'importe quel endroit du
   texte.                                                                   */

function ensureSongModalChrome() {
  let backdrop = document.getElementById('song-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'song-backdrop';
    backdrop.className = 'modal-backdrop';
    backdrop.hidden = true;
    backdrop.onclick = closeSongModal;
    document.body.appendChild(backdrop);
  }
  let modal = document.getElementById('song-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'song-modal';
    modal.className = 'modal modal-song';
    modal.hidden = true;
    document.body.appendChild(modal);
  }
  return { backdrop, modal };
}

function closeSongModal() {
  state.songModalOpen = false;
  const backdrop = document.getElementById('song-backdrop');
  const modal = document.getElementById('song-modal');
  if (backdrop) backdrop.hidden = true;
  if (modal) modal.hidden = true;
}

function openSongModal() {
  state.songModalOpen = true;
  renderSongModal();
}

function renderSongModal() {
  const { backdrop, modal } = ensureSongModalChrome();
  if (!state.songModalOpen || !state.song) {
    backdrop.hidden = true;
    modal.hidden = true;
    return;
  }
  const { song } = state.song;
  const songAnns = annotationsFor((a) => a.target_type === 'song');

  modal.innerHTML = `
    <button type="button" class="link-btn modal-close" id="song-modal-close" aria-label="Fermer">✕</button>
    <h2>« ${esc(song.title)} » dans son ensemble</h2>

    <section class="settings-section">
      <h3>Le sens général</h3>
      ${songAnns.map((a) => annotationCard(a)).join('') || '<p class="empty-note">Aucune interprétation générale pour l’instant.</p>'}
      ${annotationForm('song-ann-form', `Le sens général de « ${song.title} »…`, 'Interpréter la chanson', nextGridFor(songAnns))}
    </section>

    <section class="settings-section">
      <h3>Interprétations d’ensemble</h3>
      <p class="hint">Une lecture globale du morceau, justifiée par des connexions entre phrases —
      y compris avec les phrases d’autres morceaux.</p>
      <div id="essays"></div>
    </section>

    <section class="settings-section">
      <h3>Connexions avec d’autres chansons</h3>
      <div id="connections"></div>
    </section>`;

  backdrop.hidden = false;
  modal.hidden = false;
  document.getElementById('song-modal-close').onclick = closeSongModal;
  bindAnnotationForm('song-ann-form', { song_id: song.id, target_type: 'song' });
  bindAnnotationActions(modal);
  bindSocial(modal);
  renderEssays();
  renderConnections();
}

/* ------------------------- grilles de lecture venues d'autres morceaux ---
   Quand une interprétation écrite sur un autre morceau référence un passage
   de celui-ci, elle s'affiche ici en bloc inversé : c'est une grille de
   lecture supplémentaire, apportée depuis une autre chanson.              */

function inboundAnchorText(r) {
  if (!r.ref_text) return '';
  if (!r.ref_end_text || r.ref_end_number === r.ref_line_number) return r.ref_text;
  return `${r.ref_text} […] ${r.ref_end_text}`;
}

function inboundSourceLabel(r) {
  if (r.target_type === 'title') return 'le titre';
  if (r.target_type === 'duration') return 'la durée';
  if (r.target_type === 'song' || !r.source_line_text) return 'le morceau entier';
  if (r.target_type === 'word') {
    return `« ${tokens(r.source_line_text).slice(r.word_start, r.word_end + 1).join(' ')} »`;
  }
  if (r.target_type === 'passage' && r.source_end_text) {
    const from = tokens(r.source_line_text).slice(r.word_start || 0).join(' ');
    const to = tokens(r.source_end_text).slice(0, (r.word_end == null ? 0 : r.word_end) + 1).join(' ');
    return `« ${from} […] ${to} »`;
  }
  return `« ${r.source_line_text} »`;
}

function renderInbound() {
  const container = document.getElementById('inbound');
  if (!container) return;
  const inbound = state.song.inbound || [];
  if (!inbound.length) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <h2>Grilles de lecture venues d’autres morceaux</h2>
    <p class="hint">Des interprétations écrites sur d’autres chansons qui renvoient à un passage de celle-ci.</p>
    ${inbound.map((r) => `
      <div class="inbound" data-ann="${r.id}">
        <div class="inbound-from">
          ↩ depuis <a href="/chanson/${encodeURIComponent(r.source_slug)}" data-link>${esc(r.source_title)}</a>
          — à propos de ${esc(inboundSourceLabel(r))}
        </div>
        <div class="inbound-anchor">« ${esc(inboundAnchorText(r))} »</div>
        ${r.ref_note ? `<p class="ref-item-note">${esc(r.ref_note)}</p>` : ''}
        <div class="grid-label">Grille de lecture n°${r.grid_number}</div>
        <div class="annotation-body">${esc(r.content)}</div>
        <div class="annotation-head">
          ${authorLink(r.username)}
          <span>${esc(formatDate(r.created_at))}${r.updated_at ? ' (modifié)' : ''}</span>
          ${!r.is_published ? '<span class="draft-badge" title="Visible seulement par vous, tant qu’une nouvelle version n’a pas été publiée">Brouillon</span>' : ''}
        </div>
        ${socialFooter('annotation', r)}
      </div>`).join('')}`;

  bindSocial(container);
}

/* ----------------------------------- interprétations d'ensemble (essais) */

function excerptOf(text, ws, we) {
  if (ws == null) return text;
  return tokens(text).slice(ws, we + 1).join(' ');
}

async function loadCorpus() {
  if (state.corpus) return state.corpus;
  state.corpus = await api('/api/corpus');
  // fréquence documentaire de chaque mot significatif (pour les échos)
  const df = new Map();
  for (const line of state.corpus.lines) {
    for (const w of new Set(sigWords(line.text))) df.set(w, (df.get(w) || 0) + 1);
  }
  state.corpusDf = df;
  return state.corpus;
}

const STOPWORDS = new Set(('dans pour avec tout tous toute toutes plus mais comme quand elle elles ils il sont suis etre cette leur leurs vers fait fais faire meme bien rien sans deux notre votre ton les des une est que qui quoi pas sur par aux ces nos vos ont aussi tres trop deja alors donc ainsi entre chaque encore toujours jamais peux peut veux veut vois voit mon mes tes ses son cest jai tas quon nest plus').split(' '));

function sigWords(text) {
  return tokens(text)
    .map((w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

// Cherche dans tout le répertoire les phrases qui font écho au bloc donné :
// mots significatifs partagés, pondérés par leur rareté dans l'œuvre.
function echoSuggestions(text, excludeLineId, max = 5) {
  const words = new Set(sigWords(text));
  if (!words.size || !state.corpus) return [];
  const scored = [];
  for (const line of state.corpus.lines) {
    if (line.id === excludeLineId) continue;
    let score = 0;
    const lineWords = new Set(sigWords(line.text));
    for (const w of words) {
      if (lineWords.has(w)) score += 1 / (state.corpusDf.get(w) || 1);
    }
    if (score > 0) scored.push([score, line]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, max).map(([, line]) => line);
}

function corpusLine(id) {
  return state.corpus && state.corpus.lines.find((l) => l.id === id);
}

function corpusSong(id) {
  return state.corpus && state.corpus.songs.find((s) => s.id === id);
}

function essayLinkHtml(fromText, fromWs, fromWe, fromTitle, toText, toWs, toWe, toTitle, note, removeBtn = '') {
  const currentTitle = state.song.song.title;
  const tag = (t) => (t && t !== currentTitle) ? ` <span class="link-song">(${esc(t)})</span>` : '';
  return `<div class="essay-link">
    <div class="essay-link-blocks">
      <span class="excerpt">« ${esc(excerptOf(fromText, fromWs, fromWe))} »</span>${tag(fromTitle)}
      <span class="arrow">⟷</span>
      <span class="excerpt">« ${esc(excerptOf(toText, toWs, toWe))} »</span>${tag(toTitle)}
      ${removeBtn}
    </div>
    <div class="essay-link-note">${esc(note)}</div>
  </div>`;
}

function essayCard(e) {
  const u = state.user;
  const own = u && (u.id === e.user_id || u.is_admin);
  return `<div class="essay" data-essay="${e.id}">
    <div class="annotation-head">
      ${authorLink(e.username)}
      <span>${esc(formatDate(e.created_at))}${e.updated_at ? ' (modifié)' : ''}</span>
      ${!e.is_published ? '<span class="draft-badge" title="Visible seulement par vous, tant qu’une nouvelle version n’a pas été publiée">Brouillon</span>' : ''}
      ${own ? `<button class="link-btn" data-essay-edit="${e.id}">modifier</button>
               <button class="link-btn" data-essay-del="${e.id}">supprimer</button>` : ''}
    </div>
    <div class="essay-body">${esc(e.content)}</div>
    ${e.links.length ? `<div class="essay-links-title">Connexions justificatives</div>
      ${e.links.map((l) => essayLinkHtml(
        l.from_text, l.from_word_start, l.from_word_end, l.from_song_title,
        l.to_text, l.to_word_start, l.to_word_end, l.to_song_title, l.note)).join('')}` : ''}
    ${socialFooter('essay', e)}
  </div>`;
}

function blockPickerHtml(side) {
  const b = state.builder.blocs[side];
  const songs = state.corpus.songs;
  const lines = b.song_id ? state.corpus.lines.filter((l) => l.song_id === b.song_id) : [];
  const line = b.line_id ? corpusLine(b.line_id) : null;
  let wordsHtml = '';
  if (line) {
    wordsHtml = `<div class="eb-words">${tokens(line.text).map((tok, i) => {
      const selected = b.ws != null && i >= b.ws && i <= b.we;
      return `<span class="w ${selected ? 'selected-word' : ''}" data-eb-word="${side}:${i}">${esc(tok)}</span>`;
    }).join(' ')}</div>
    <div class="hint">${b.ws == null
      ? 'Toute la phrase est sélectionnée — cliquez sur un mot pour restreindre (Maj+clic pour étendre).'
      : `Mots ${b.ws + 1} à ${b.we + 1} — <button class="link-btn" data-eb-whole="${side}">reprendre toute la phrase</button>`}</div>`;
  }
  return `<div class="eb-block">
    <h4>Bloc ${side}</h4>
    <select data-eb-song="${side}">
      <option value="">— Choisir un morceau —</option>
      ${songs.map((s) => `<option value="${s.id}" ${s.id === b.song_id ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}
    </select>
    <select data-eb-line="${side}" ${b.song_id ? '' : 'disabled'}>
      <option value="">— Choisir une phrase —</option>
      ${lines.map((l) => `<option value="${l.id}" ${l.id === b.line_id ? 'selected' : ''}>${esc(l.text.length > 60 ? l.text.slice(0, 57) + '…' : l.text)}</option>`).join('')}
    </select>
    ${wordsHtml}
  </div>`;
}

function renderEssays() {
  const container = document.getElementById('essays');
  if (!container) return;
  const { essays } = state.song;
  const u = state.user;

  let html = essays.map(essayCard).join('') ||
    '<p class="empty-note">Aucune interprétation d’ensemble pour l’instant.</p>';

  if (state.builder) {
    html += renderEssayBuilderHtml();
  } else if (u) {
    html += `<button class="btn" id="essay-new">✍ Écrire une interprétation d’ensemble</button>`;
  } else {
    html += `<p class="empty-note"><a href="/connexion" data-link>Connectez-vous</a> pour écrire une interprétation d’ensemble.</p>`;
  }

  container.innerHTML = html;
  bindEssays(container);
}

function renderEssayBuilderHtml() {
  const b = state.builder;
  const A = b.blocs.A, B = b.blocs.B;
  const lineA = A.line_id ? corpusLine(A.line_id) : null;

  // suggestions d'échos pour le bloc B, à partir du bloc A choisi
  let suggestions = '';
  if (lineA && !B.line_id) {
    const sugg = echoSuggestions(excerptOf(lineA.text, A.ws, A.we), A.line_id);
    if (sugg.length) {
      suggestions = `<div class="eb-suggestions">
        <div class="essay-links-title">Échos trouvés dans l’œuvre — cliquez pour remplir le bloc B :</div>
        ${sugg.map((l) => {
          const s = corpusSong(l.song_id);
          return `<button type="button" class="eb-suggestion" data-eb-suggest="${l.id}">
            « ${esc(l.text.length > 70 ? l.text.slice(0, 67) + '…' : l.text)} »
            <span class="link-song">(${esc(s ? s.title : '')})</span>
          </button>`;
        }).join('')}
      </div>`;
    }
  }

  return `<div class="panel-card essay-builder" id="essay-builder">
    <h3>${b.essayId ? 'Modifier l’interprétation d’ensemble' : 'Nouvelle interprétation d’ensemble'}</h3>
    <label>Ton interprétation du morceau</label>
    <textarea id="eb-content" maxlength="10000" placeholder="Ce que raconte ce morceau dans son ensemble, selon toi…">${esc(b.content)}</textarea>
    ${b.links.length ? `<div class="essay-links-title">Connexions ajoutées</div>
      ${b.links.map((l, i) => {
        const lf = corpusLine(l.from_line_id), lt = corpusLine(l.to_line_id);
        const sf = lf && corpusSong(lf.song_id), st = lt && corpusSong(lt.song_id);
        return essayLinkHtml(
          lf ? lf.text : '?', l.from_word_start, l.from_word_end, sf && sf.title,
          lt ? lt.text : '?', l.to_word_start, l.to_word_end, st && st.title,
          l.note, `<button class="link-btn" data-eb-remove="${i}">✕</button>`);
      }).join('')}` : ''}
    <div class="essay-links-title">Ajouter une connexion justificative</div>
    <div class="eb-blocks">${blockPickerHtml('A')}${blockPickerHtml('B')}</div>
    ${suggestions}
    <textarea id="eb-note" maxlength="1000" placeholder="En quoi ces deux blocs se répondent-ils ?">${esc(b.note)}</textarea>
    <button type="button" id="eb-add-link">+ Ajouter cette connexion</button>
    <div class="error-msg" id="eb-error"></div>
    <div class="eb-actions">
      <button type="button" class="primary" id="eb-publish">${b.essayId ? 'Enregistrer' : 'Publier l’interprétation'}</button>
      <button type="button" class="link-btn" id="eb-cancel">Annuler</button>
    </div>
  </div>`;
}

function saveBuilderInputs() {
  const c = document.getElementById('eb-content');
  const n = document.getElementById('eb-note');
  if (c) state.builder.content = c.value;
  if (n) state.builder.note = n.value;
}

function bindEssays(container) {
  const newBtn = document.getElementById('essay-new');
  if (newBtn) newBtn.onclick = async () => {
    await loadCorpus();
    state.builder = {
      essayId: null, content: '', note: '',
      links: [],
      blocs: {
        A: { song_id: state.song.song.id, line_id: null, ws: null, we: null },
        B: { song_id: null, line_id: null, ws: null, we: null },
      },
    };
    renderEssays();
  };

  container.querySelectorAll('[data-essay-edit]').forEach((btn) => {
    btn.onclick = async () => {
      await loadCorpus();
      const e = state.song.essays.find((x) => x.id === Number(btn.dataset.essayEdit));
      if (!e) return;
      state.builder = {
        essayId: e.id, content: e.content, note: '',
        links: e.links.map((l) => ({
          from_line_id: l.from_line_id, from_word_start: l.from_word_start, from_word_end: l.from_word_end,
          to_line_id: l.to_line_id, to_word_start: l.to_word_start, to_word_end: l.to_word_end,
          note: l.note,
        })),
        blocs: {
          A: { song_id: state.song.song.id, line_id: null, ws: null, we: null },
          B: { song_id: null, line_id: null, ws: null, we: null },
        },
      };
      renderEssays();
    };
  });

  container.querySelectorAll('[data-essay-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer cette interprétation d’ensemble ?')) return;
      try {
        await api(`/api/essays/${btn.dataset.essayDel}`, { method: 'DELETE' });
        await pageSong(state.song.song.slug, true);
      } catch (err) { alert(err.message); }
    };
  });

  bindSocial(container);
  if (!state.builder) return;

  // --- constructeur
  container.querySelectorAll('[data-eb-song]').forEach((sel) => {
    sel.onchange = () => {
      saveBuilderInputs();
      const side = sel.dataset.ebSong;
      state.builder.blocs[side] = { song_id: Number(sel.value) || null, line_id: null, ws: null, we: null };
      renderEssays();
    };
  });
  container.querySelectorAll('[data-eb-line]').forEach((sel) => {
    sel.onchange = () => {
      saveBuilderInputs();
      const side = sel.dataset.ebLine;
      const b = state.builder.blocs[side];
      b.line_id = Number(sel.value) || null;
      b.ws = null; b.we = null;
      renderEssays();
    };
  });
  container.querySelectorAll('[data-eb-word]').forEach((span) => {
    span.onclick = (ev) => {
      saveBuilderInputs();
      const [side, idxStr] = span.dataset.ebWord.split(':');
      const idx = Number(idxStr);
      const b = state.builder.blocs[side];
      if (ev.shiftKey && b.ws != null) {
        b.ws = Math.min(b.ws, idx); b.we = Math.max(b.we, idx);
      } else {
        b.ws = idx; b.we = idx;
      }
      renderEssays();
    };
  });
  container.querySelectorAll('[data-eb-whole]').forEach((btn) => {
    btn.onclick = () => {
      saveBuilderInputs();
      const b = state.builder.blocs[btn.dataset.ebWhole];
      b.ws = null; b.we = null;
      renderEssays();
    };
  });
  container.querySelectorAll('[data-eb-suggest]').forEach((btn) => {
    btn.onclick = () => {
      saveBuilderInputs();
      const line = corpusLine(Number(btn.dataset.ebSuggest));
      if (!line) return;
      state.builder.blocs.B = { song_id: line.song_id, line_id: line.id, ws: null, we: null };
      renderEssays();
    };
  });
  container.querySelectorAll('[data-eb-remove]').forEach((btn) => {
    btn.onclick = () => {
      saveBuilderInputs();
      state.builder.links.splice(Number(btn.dataset.ebRemove), 1);
      renderEssays();
    };
  });

  const addLink = document.getElementById('eb-add-link');
  if (addLink) addLink.onclick = () => {
    saveBuilderInputs();
    const b = state.builder;
    const A = b.blocs.A, B = b.blocs.B;
    const err = document.getElementById('eb-error');
    if (!A.line_id || !B.line_id) { err.textContent = 'Choisissez une phrase pour chaque bloc.'; return; }
    if (!b.note.trim()) { err.textContent = 'Expliquez en quoi ces deux blocs se répondent.'; return; }
    if (b.links.length >= 20) { err.textContent = '20 connexions maximum.'; return; }
    b.links.push({
      from_line_id: A.line_id, from_word_start: A.ws, from_word_end: A.we,
      to_line_id: B.line_id, to_word_start: B.ws, to_word_end: B.we,
      note: b.note.trim(),
    });
    b.note = '';
    b.blocs.B = { song_id: null, line_id: null, ws: null, we: null };
    err.textContent = '';
    renderEssays();
  };

  const publish = document.getElementById('eb-publish');
  if (publish) publish.onclick = async () => {
    saveBuilderInputs();
    const b = state.builder;
    const err = document.getElementById('eb-error');
    try {
      const payload = { content: b.content, links: b.links };
      if (b.essayId) {
        await api(`/api/essays/${b.essayId}`, { method: 'PUT', body: payload });
      } else {
        await api('/api/essays', { method: 'POST', body: { ...payload, song_id: state.song.song.id } });
      }
      state.builder = null;
      await pageSong(state.song.song.slug, true);
    } catch (e2) {
      err.textContent = e2.message;
    }
  };

  const cancel = document.getElementById('eb-cancel');
  if (cancel) cancel.onclick = () => { state.builder = null; renderEssays(); };
}

/* ------------------------------------ favoris & commentaires (partagé) --- */

function socialFooter(kind, item) {
  const key = `${kind}:${item.id}`;
  const open = state.openComments.has(key);
  const nComments = item.comments ? item.comments.length : 0;
  return `<div class="social-footer">
    <button class="social-btn fav-btn ${item.my_favorite ? 'active' : ''}" data-fav="${kind}:${item.id}"
            title="${item.my_favorite ? 'Retirer des favoris' : 'Mettre en favori'}">
      ${item.my_favorite ? '♥' : '♡'} ${item.favorite_count || 0}
    </button>
    <button class="social-btn ${open ? 'active' : ''}" data-comments-toggle="${key}">
      &#128172; ${nComments} commentaire${nComments > 1 ? 's' : ''}
    </button>
  </div>
  <div class="comments-block" ${open ? '' : 'hidden'} data-comments-block="${key}">
    ${(item.comments || []).map((c) => `
      <div class="comment">
        <div class="comment-head">
          ${authorLink(c.username)}
          <span>${esc(formatDate(c.created_at))}</span>
          ${state.user && (state.user.id === c.user_id || state.user.is_admin)
            ? `<button class="link-btn" data-del-comment="${c.id}">supprimer</button>` : ''}
        </div>
        <div class="comment-body">${esc(c.content)}</div>
      </div>`).join('')}
    ${state.user
      ? `<form class="comment-form" data-comment-form="${key}">
          <textarea placeholder="Répondre à cette interprétation…" required maxlength="2000" rows="2"></textarea>
          <div class="error-msg"></div>
          <button type="submit">Commenter</button>
        </form>`
      : `<p class="empty-note"><a href="/connexion" data-link>Connectez-vous</a> pour commenter.</p>`}
  </div>`;
}

// `opts.reload` (recharge les données depuis le serveur après une mutation)
// et `opts.render` (réaffiche depuis l'état local, ex. ouvrir un fil de
// commentaires) valent par défaut le comportement de la page chanson : les
// autres pages qui réutilisent le bloc social (ex. la page des reprises)
// passent leurs propres callbacks.
function bindSocial(container, opts = {}) {
  const reload = opts.reload || (() => pageSong(state.song.song.slug, true));
  const render = opts.render || renderSongPage;

  container.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.onclick = async () => {
      if (!state.user) { navigate('/connexion'); return; }
      const [kind, id] = btn.dataset.fav.split(':');
      try {
        await api('/api/favorites', {
          method: 'POST',
          body: { target_kind: kind, target_id: Number(id) },
        });
        await reload();
      } catch (err) { alert(err.message); }
    };
  });
  container.querySelectorAll('[data-comments-toggle]').forEach((btn) => {
    btn.onclick = () => {
      const key = btn.dataset.commentsToggle;
      if (state.openComments.has(key)) state.openComments.delete(key);
      else state.openComments.add(key);
      render();
    };
  });
  container.querySelectorAll('[data-comment-form]').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const [kind, id] = form.dataset.commentForm.split(':');
      try {
        await api('/api/comments', {
          method: 'POST',
          body: {
            target_kind: kind,
            target_id: Number(id),
            content: form.querySelector('textarea').value,
          },
        });
        await reload();
      } catch (err) {
        form.querySelector('.error-msg').textContent = err.message;
      }
    };
  });
  container.querySelectorAll('[data-del-comment]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer ce commentaire ?')) return;
      try {
        await api(`/api/comments/${btn.dataset.delComment}`, { method: 'DELETE' });
        await reload();
      } catch (err) { alert(err.message); }
    };
  });
}

/* --------- panneau latéral : interprétations de la sélection en cours ---- */

/* ------------------------------------------------------------ références ---
   Une référence dit trois choses : quelle œuvre, de quel artiste, et en quoi
   c'en est une. Elle se compose dans son propre éditeur et se publie avec son
   propre bouton — greffée à l'interprétation, mais écrite à part.
   En interne, la cible n'est pas une œuvre mais un passage d'un morceau : la
   référence apparaît alors des deux côtés, ici et sur la chanson visée.    */

function refTitle(r) {
  if (r.ref_song_slug) {
    return `<a href="/chanson/${encodeURIComponent(r.ref_song_slug)}" data-link>♪ ${esc(r.label)}</a>`;
  }
  return `<span class="ref-work">${esc(r.label)}</span>${r.artist ? ` <span class="ref-artist-name">— ${esc(r.artist)}</span>` : ''}`;
}

function referencesList(a) {
  if (!a.references || !a.references.length) return '';
  const u = state.user;
  const own = u && (u.id === a.user_id || u.is_admin);
  return `<ul class="ref-list">
    ${a.references.map((r) => `<li class="ref-item">
      <div class="ref-item-head">
        ${refTitle(r)}
        ${own ? `<button type="button" class="link-btn ref-del" data-ref-del="${r.id}" title="Retirer cette référence">✕</button>` : ''}
      </div>
      ${r.note ? `<p class="ref-item-note">${esc(r.note)}</p>` : ''}
    </li>`).join('')}
  </ul>`;
}

// L'éditeur d'une référence libre : l'œuvre, l'artiste, et pourquoi.
function refEditorFree() {
  return `<div class="ref-editor" data-kind="free">
    <label>L’œuvre</label>
    <input class="ref-label" placeholder="Le nom de l’œuvre" maxlength="300">
    <label>L’artiste</label>
    <input class="ref-artist" placeholder="Qui l’a faite" maxlength="300">
    <label>En quoi est-ce une référence ?</label>
    <textarea class="ref-note" rows="5" maxlength="2000"
      placeholder="Ce qui, pour vous, relie ce passage à cette œuvre…"></textarea>
    <div class="ref-editor-actions">
      <button type="button" class="primary ref-commit">Ajouter cette référence</button>
      <button type="button" class="link-btn ref-cancel">Annuler</button>
    </div>
    <div class="error-msg ref-error"></div>
  </div>`;
}

// L'éditeur d'une référence interne : n'importe quel passage de n'importe
// quel morceau — plus seulement ceux déjà interprétés.
function refEditorInternal() {
  const songs = state.corpus.songs.filter((s) => state.corpus.lines.some((l) => l.song_id === s.id));
  return `<div class="ref-editor ref-editor-internal" data-kind="internal">
    <label>Le morceau</label>
    <select class="ref-song"><option value="">— Choisir un morceau —</option>
      ${songs.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}
    </select>
    <label>Du vers</label>
    <select class="ref-start" disabled><option value="">— Choisir d’abord un morceau —</option></select>
    <label>Au vers <small>(facultatif — pour un passage de plusieurs vers)</small></label>
    <select class="ref-end" disabled><option value="">— Le même vers —</option></select>
    <label>En quoi est-ce une référence ?</label>
    <textarea class="ref-note" rows="5" maxlength="2000"
      placeholder="Ce qui relie ce passage à celui-là…"></textarea>
    <div class="ref-editor-actions">
      <button type="button" class="primary ref-commit">Ajouter cette référence</button>
      <button type="button" class="link-btn ref-cancel">Annuler</button>
    </div>
    <div class="error-msg ref-error"></div>
  </div>`;
}

// Une référence composée, en attente de publication avec l'interprétation.
function refStagedHtml(ref) {
  const title = ref.ref_line_id
    ? `♪ ${esc(ref._label || 'Passage d’un morceau')}`
    : `${esc(ref.label)}${ref.artist ? ` — ${esc(ref.artist)}` : ''}`;
  return `<div class="ref-staged" data-ref="${esc(JSON.stringify(ref))}">
    <div class="ref-item-head">
      <span class="ref-work">${title}</span>
      <button type="button" class="link-btn ref-remove" title="Retirer">✕</button>
    </div>
    ${ref.note ? `<p class="ref-item-note">${esc(ref.note)}</p>` : ''}
  </div>`;
}

// Lit un éditeur et renvoie la référence, ou null avec un message d'erreur.
function readRefEditor(editor) {
  const err = editor.querySelector('.ref-error');
  const note = editor.querySelector('.ref-note').value.trim();
  if (editor.dataset.kind === 'internal') {
    const start = editor.querySelector('.ref-start').value;
    if (!start) { err.textContent = 'Choisissez le vers référencé.'; return null; }
    const end = editor.querySelector('.ref-end').value || start;
    const opt = editor.querySelector(`.ref-start option[value="${start}"]`);
    const songSel = editor.querySelector('.ref-song');
    const songName = songSel.options[songSel.selectedIndex].textContent;
    return {
      ref_line_id: Number(start), ref_end_line_id: Number(end), note,
      _label: `${songName} — ${opt ? opt.textContent : ''}`,
    };
  }
  const label = editor.querySelector('.ref-label').value.trim();
  if (!label) { err.textContent = 'Nommez l’œuvre référencée.'; return null; }
  return { label, artist: editor.querySelector('.ref-artist').value.trim(), note };
}

// Remplit les vers d'un morceau dans un éditeur interne.
function bindRefSongPicker(editor) {
  const songSel = editor.querySelector('.ref-song');
  if (!songSel) return;
  songSel.onchange = () => {
    const songId = Number(songSel.value);
    const opts = state.corpus.lines.filter((l) => l.song_id === songId).map((l) => {
      const t = l.text.length > 52 ? l.text.slice(0, 49) + '…' : l.text;
      return `<option value="${l.id}">${esc(t)}</option>`;
    }).join('');
    const start = editor.querySelector('.ref-start');
    const end = editor.querySelector('.ref-end');
    start.innerHTML = '<option value="">— Choisir un vers —</option>' + opts;
    end.innerHTML = '<option value="">— Le même vers —</option>' + opts;
    start.disabled = !opts;
    end.disabled = !opts;
  };
}

// Zone « références » d'un formulaire d'interprétation : un éditeur à la fois,
// et les références déjà composées empilées au-dessus.
function bindReferenceRows(form) {
  const zone = form.querySelector('.refs-zone');
  if (!zone) return;
  const slot = form.querySelector('.ref-editor-slot');

  const bindStaged = () => zone.querySelectorAll('.ref-remove').forEach((b) => {
    b.onclick = () => b.closest('.ref-staged').remove();
  });

  const closeEditor = () => { slot.innerHTML = ''; form.querySelectorAll('.add-ref, .add-ref-internal').forEach((b) => { b.hidden = false; }); };

  const openEditor = (html) => {
    slot.innerHTML = html;
    form.querySelectorAll('.add-ref, .add-ref-internal').forEach((b) => { b.hidden = true; });
    const editor = slot.querySelector('.ref-editor');
    bindRefSongPicker(editor);
    editor.querySelector('.ref-cancel').onclick = closeEditor;
    editor.querySelector('.ref-commit').onclick = () => {
      const ref = readRefEditor(editor);
      if (!ref) return;
      zone.insertAdjacentHTML('beforeend', refStagedHtml(ref));
      bindStaged();
      closeEditor();
    };
  };

  form.querySelector('.add-ref').onclick = () => openEditor(refEditorFree());
  const internalBtn = form.querySelector('.add-ref-internal');
  if (internalBtn) internalBtn.onclick = async () => {
    await loadCorpus();
    openEditor(refEditorInternal());
  };
  bindStaged();
}

function collectReferences(form) {
  return [...form.querySelectorAll('.ref-staged')].map((row) => {
    const r = JSON.parse(row.dataset.ref);
    delete r._label;
    return r;
  });
}

function referencesFieldset(refs = []) {
  return `<div class="refs-block">
    <div class="refs-zone">${refs.map((r) => refStagedHtml(
      r.ref_line_id
        ? { ref_line_id: r.ref_line_id, ref_end_line_id: r.ref_end_line_id, note: r.note || '', _label: r.label }
        : { label: r.label, artist: r.artist || '', note: r.note || '' }
    )).join('')}</div>
    <div class="ref-editor-slot"></div>
    <div class="refs-add">
      <button type="button" class="link-btn add-ref">+ Référence à une œuvre</button>
      <button type="button" class="link-btn add-ref-internal">+ Référence à un passage d’un morceau</button>
    </div>
  </div>`;
}

// Sur une interprétation déjà publiée : on greffe une référence sans avoir à
// réécrire quoi que ce soit.
function bindReferenceAdders(container) {
  container.querySelectorAll('[data-add-ref]').forEach((btn) => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.addRef);
      const host = container.querySelector(`[data-ref-slot="${id}"]`);
      if (!host) return;
      if (host.innerHTML) { host.innerHTML = ''; return; }
      host.innerHTML = `<div class="refs-add">
        <button type="button" class="link-btn ref-pick-free">+ Référence à une œuvre</button>
        <button type="button" class="link-btn ref-pick-internal">+ Référence à un passage d’un morceau</button>
      </div><div class="ref-editor-slot"></div>`;
      const slot = host.querySelector('.ref-editor-slot');
      const publish = async (editor) => {
        const ref = readRefEditor(editor);
        if (!ref) return;
        delete ref._label;
        try {
          await api(`/api/annotations/${id}/references`, { method: 'POST', body: ref });
          await pageSong(state.song.song.slug, true);
        } catch (err) { editor.querySelector('.ref-error').textContent = err.message; }
      };
      const open = (html) => {
        slot.innerHTML = html;
        const editor = slot.querySelector('.ref-editor');
        bindRefSongPicker(editor);
        editor.querySelector('.ref-commit').textContent = 'Publier cette référence';
        editor.querySelector('.ref-cancel').onclick = () => { host.innerHTML = ''; };
        editor.querySelector('.ref-commit').onclick = () => publish(editor);
      };
      host.querySelector('.ref-pick-free').onclick = () => open(refEditorFree());
      host.querySelector('.ref-pick-internal').onclick = async () => { await loadCorpus(); open(refEditorInternal()); };
    };
  });

  container.querySelectorAll('[data-ref-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Retirer cette référence ?')) return;
      try {
        await api(`/api/references/${btn.dataset.refDel}`, { method: 'DELETE' });
        await pageSong(state.song.song.slug, true);
      } catch (err) { alert(err.message); }
    };
  });
}

function annotationCard(a, targetQuote) {
  const u = state.user;
  const own = u && (u.id === a.user_id || u.is_admin);
  return `<div class="annotation" data-ann="${a.id}">
    <div class="grid-label">Grille de lecture n°${a.grid_number}</div>
    <div class="annotation-head">
      ${authorLink(a.username)}
      <span>${esc(formatDate(a.created_at))}${a.updated_at ? ' (modifié)' : ''}</span>
      ${!a.is_published ? '<span class="draft-badge" title="Visible seulement par vous, tant qu’une nouvelle version n’a pas été publiée">Brouillon</span>' : ''}
      ${own ? `<button class="link-btn" data-edit="${a.id}">modifier</button>
               <button class="link-btn" data-del="${a.id}">supprimer</button>` : ''}
    </div>
    ${targetQuote ? `<div class="annotation-target-quote">${targetQuote}</div>` : ''}
    <div class="annotation-body">${esc(a.content)}</div>
    ${referencesList(a)}
    ${own ? `<button type="button" class="link-btn ref-add-btn" data-add-ref="${a.id}">+ Référence</button>` : ''}
    <div data-ref-slot="${a.id}"></div>
    ${socialFooter('annotation', a)}
  </div>`;
}

// Le numéro de la prochaine grille de lecture que cet auteur écrirait sur
// cette cible — 1 pour une première lecture, sinon la suite de ses lectures
// déjà écrites ici (superposition simultanée : chacune s'ajoute, sans
// remplacer les précédentes).
function nextGridFor(anns) {
  const u = state.user;
  if (!u) return 1;
  const mine = anns.filter((a) => a.user_id === u.id);
  return mine.length ? Math.max(...mine.map((a) => a.grid_number)) + 1 : 1;
}

function annotationForm(id, placeholder, buttonLabel, nextGrid = 1) {
  if (!state.user) {
    return `<p class="empty-note"><a href="/connexion" data-link>Connectez-vous</a> pour proposer une interprétation.</p>`;
  }
  return `<form class="annotation-form" id="${id}">
    ${nextGrid > 1 ? `<div class="grid-label grid-label-next">Nouvelle grille de lecture — n°${nextGrid}</div>` : ''}
    <textarea placeholder="${esc(placeholder)}" required maxlength="5000"></textarea>
    ${referencesFieldset()}
    <div class="error-msg"></div>
    <button type="submit" class="primary">${esc(nextGrid > 1 ? `Publier la grille de lecture n°${nextGrid}` : buttonLabel)}</button>
  </form>`;
}

function bindAnnotationForm(id, payloadBase) {
  const form = document.getElementById(id);
  if (!form) return;
  bindReferenceRows(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const textarea = form.querySelector('textarea');
    try {
      await api('/api/annotations', {
        method: 'POST',
        body: { ...payloadBase, content: textarea.value, references: collectReferences(form) },
      });
      await pageSong(state.song.song.slug, true);
    } catch (err) {
      form.querySelector('.error-msg').textContent = err.message;
    }
  };
}

function bindAnnotationActions(container) {
  bindReferenceAdders(container);
  container.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer cette interprétation ?')) return;
      try {
        await api(`/api/annotations/${btn.dataset.del}`, { method: 'DELETE' });
        await pageSong(state.song.song.slug, true);
      } catch (err) { alert(err.message); }
    };
  });
  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => {
      const card = container.querySelector(`[data-ann="${btn.dataset.edit}"]`);
      const ann = state.song.annotations.find((a) => a.id === Number(btn.dataset.edit));
      if (!card || !ann) return;
      card.innerHTML = `<form class="annotation-form">
        <textarea required maxlength="5000">${esc(ann.content)}</textarea>
        ${referencesFieldset(ann.references || [])}
        <div class="error-msg"></div>
        <button type="submit" class="primary">Enregistrer</button>
        <button type="button" class="link-btn cancel">Annuler</button>
      </form>`;
      const form = card.querySelector('form');
      bindReferenceRows(form);
      form.querySelector('.cancel').onclick = () => renderSongPage();
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api(`/api/annotations/${ann.id}`, {
            method: 'PUT',
            body: { content: form.querySelector('textarea').value, references: collectReferences(form) },
          });
          await pageSong(state.song.song.slug, true);
        } catch (err) {
          form.querySelector('.error-msg').textContent = err.message;
        }
      };
    };
  });
}

function renderPanel() {
  const panel = document.getElementById('panel');
  const { song, lines } = state.song;
  const sel = state.sel;
  const duration = mmss(song.duration_seconds);
  let html = '';
  const forms = []; // [id, payload]

  if (sel && sel.type === 'passage') {
    const quote = passageText(sel.startLine, sel.startIdx, sel.endLine, sel.endIdx);
    const [s0, s1] = selPassageRange(sel);
    const passAnns = annotationsFor((a) => {
      if (a.target_type !== 'passage') return false;
      const [a0, a1] = passageRange(a);
      return a0 <= s1 && s0 <= a1;
    });
    html += `<div class="panel-card">
      <h3>Le passage</h3>
      <div class="panel-target">« ${esc(quote)} »</div>
      ${passAnns.map((a) => annotationCard(
        a,
        `« ${esc(passageText(a.line_id, a.word_start || 0, a.end_line_id, a.word_end == null ? 0 : a.word_end))} »`
      )).join('') || '<p class="empty-note">Aucune interprétation de passage ici pour l’instant.</p>'}
      ${annotationForm('passage-ann-form', 'Que raconte ce passage ?', 'Interpréter ce passage', nextGridFor(passAnns))}
    </div>
    <button class="link-btn" id="clear-sel">← Revenir à la chanson</button>`;
    forms.push(['passage-ann-form', {
      song_id: song.id, line_id: sel.startLine, end_line_id: sel.endLine,
      word_start: sel.startIdx, word_end: sel.endIdx,
    }]);
  } else if (sel && (sel.type === 'word' || sel.type === 'line')) {
    const line = lines.find((l) => l.id === sel.lineId);
    const toks = line ? tokens(line.text) : [];

    if (sel.type === 'word') {
      const quote = toks.slice(sel.start, sel.end + 1).join(' ');
      const wordAnns = annotationsFor(
        (a) => a.target_type === 'word' && a.line_id === sel.lineId &&
               a.word_start <= sel.end && a.word_end >= sel.start
      );
      html += `<div class="panel-card">
        <h3>${sel.start === sel.end ? 'Le mot' : 'Les mots'} « ${esc(quote)} »</h3>
        <div class="panel-target">dans : « ${esc(line.text)} »</div>
        ${wordAnns.map((a) => annotationCard(
          a,
          `« ${esc(toks.slice(a.word_start, a.word_end + 1).join(' '))} »`
        )).join('') || '<p class="empty-note">Aucune interprétation pour l’instant.</p>'}
        ${annotationForm('word-ann-form', `Que signifie « ${quote} » ici ?`, 'Interpréter ces mots', nextGridFor(wordAnns))}
      </div>`;
      forms.push(['word-ann-form', { song_id: song.id, line_id: sel.lineId, word_start: sel.start, word_end: sel.end }]);
    }

    const lineAnns = annotationsFor((a) => a.target_type === 'line' && a.line_id === sel.lineId);
    html += `<div class="panel-card">
      <h3>La phrase</h3>
      <div class="panel-target">« ${esc(line ? line.text : '')} »</div>
      ${lineAnns.map((a) => annotationCard(a)).join('') || '<p class="empty-note">Aucune interprétation pour l’instant.</p>'}
      ${annotationForm('line-ann-form', 'Que signifie cette phrase ?', 'Interpréter cette phrase', nextGridFor(lineAnns))}
    </div>
    <button class="link-btn" id="clear-sel">← Revenir à la chanson</button>`;
    forms.push(['line-ann-form', { song_id: song.id, line_id: sel.lineId }]);
  } else if (sel && sel.type === 'title') {
    const titleAnns = annotationsFor((a) => a.target_type === 'title');
    html += `<div class="panel-card">
      <h3>Le titre « ${esc(song.title)} »</h3>
      ${titleAnns.map((a) => annotationCard(a)).join('') || '<p class="empty-note">Aucune interprétation du titre pour l’instant.</p>'}
      ${annotationForm('title-ann-form', `Pourquoi ce titre, « ${song.title} » ?`, 'Interpréter le titre', nextGridFor(titleAnns))}
    </div>
    <button class="link-btn" id="clear-sel">← Revenir à la chanson</button>`;
    forms.push(['title-ann-form', { song_id: song.id, target_type: 'title' }]);
  } else if (sel && sel.type === 'duration') {
    const durAnns = annotationsFor((a) => a.target_type === 'duration');
    html += `<div class="panel-card">
      <h3>La durée${duration ? ` — ${duration}` : ''}</h3>
      ${duration ? '' : '<div class="panel-target">durée non renseignée pour l’instant</div>'}
      ${durAnns.map((a) => annotationCard(a)).join('') || '<p class="empty-note">Aucune interprétation de la durée pour l’instant.</p>'}
      ${annotationForm('duration-ann-form', duration ? `Que disent les chiffres de ${duration} ?` : 'Que dit la durée de cette chanson ?', 'Interpréter la durée', nextGridFor(durAnns))}
    </div>
    <button class="link-btn" id="clear-sel">← Revenir à la chanson</button>`;
    forms.push(['duration-ann-form', { song_id: song.id, target_type: 'duration' }]);
  } else {
    const songAnns = annotationsFor((a) => a.target_type === 'song');
    html += `<div class="panel-card panel-invite">
      <h3>Interpréter</h3>
      <p class="empty-note">Sélectionnez un mot, une phrase ou un passage dans le texte.</p>
      <button type="button" class="btn panel-open-modal">
        💬 L’ensemble du morceau${songAnns.length ? ` · ${songAnns.length}` : ''}
      </button>
    </div>`;

    const passAnns = annotationsFor((a) => a.target_type === 'passage');
    if (passAnns.length) {
      html += `<div class="panel-card">
        <h3>Passages interprétés</h3>
        ${passAnns.map((a) => annotationCard(
          a,
          `« ${esc(passageText(a.line_id, a.word_start || 0, a.end_line_id, a.word_end == null ? 0 : a.word_end))} »`
        )).join('')}
      </div>`;
    }
  }

  panel.innerHTML = html;
  const openModal = panel.querySelector('.panel-open-modal');
  if (openModal) openModal.onclick = openSongModal;
  for (const [id, payload] of forms) bindAnnotationForm(id, payload);
  const clear = document.getElementById('clear-sel');
  if (clear) clear.onclick = clearSelection;
  bindAnnotationActions(panel);
  bindSocial(panel);
}

/* ------------------------------------------------------------- connexions */

function renderConnections() {
  const container = document.getElementById('connections');
  if (!container) return;
  const { song, connections, allSongs } = state.song;
  const u = state.user;

  const list = connections.map((c) => {
    const own = u && (u.id === c.user_id || u.is_admin);
    const isA = c.song_a_id === song.id;
    const otherTitle = isA ? c.song_b_title : c.song_a_title;
    const otherSlug = isA ? c.song_b_slug : c.song_a_slug;
    return `<div class="connection">
      <div class="connection-songs">${esc(song.title)}
        <span class="arrow">⟷</span>
        <a href="/chanson/${encodeURIComponent(otherSlug)}" data-link>${esc(otherTitle)}</a>
      </div>
      <div class="connection-body">${esc(c.explanation)}</div>
      <div class="connection-meta">par ${authorLink(c.username)}, ${esc(formatDate(c.created_at))}
        ${own ? `<button class="link-btn" data-del-conn="${c.id}">supprimer</button>` : ''}
      </div>
      ${socialFooter('connection', c)}
    </div>`;
  }).join('');

  const others = allSongs.filter((s) => s.id !== song.id);
  const form = u
    ? `<form class="panel-card" id="conn-form">
        <h3>Relier « ${esc(song.title)} » à une autre chanson</h3>
        <select id="conn-target" required>
          <option value="">— Choisir une chanson —</option>
          ${others.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}
        </select>
        <textarea id="conn-text" placeholder="En quoi ces deux chansons sont-elles reliées ?" required maxlength="5000"></textarea>
        <div class="error-msg"></div>
        <button type="submit" class="primary">Créer la connexion</button>
      </form>`
    : `<p class="empty-note"><a href="/connexion" data-link>Connectez-vous</a> pour relier cette chanson à une autre.</p>`;

  container.innerHTML = (list || '<p class="empty-note">Aucune connexion pour l’instant.</p>') + form;

  container.querySelectorAll('[data-del-conn]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer cette connexion ?')) return;
      try {
        await api(`/api/connections/${btn.dataset.delConn}`, { method: 'DELETE' });
        await pageSong(song.slug, true);
      } catch (err) { alert(err.message); }
    };
  });

  const connForm = document.getElementById('conn-form');
  if (connForm) connForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/connections', {
        method: 'POST',
        body: {
          song_a_id: song.id,
          song_b_id: Number(document.getElementById('conn-target').value),
          explanation: document.getElementById('conn-text').value,
        },
      });
      await pageSong(song.slug, true);
    } catch (err) {
      connForm.querySelector('.error-msg').textContent = err.message;
    }
  };

  bindSocial(container);
}

/* ------------------------------------------------------------------ reprises */

// Identifiant YouTube d'une URL (watch, youtu.be, shorts, déjà en embed…),
// ou null si le lien ne pointe pas vers YouTube — dans ce cas la reprise
// s'affiche comme une simple carte-lien plutôt qu'un lecteur intégré.
function youtubeEmbedId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
      if (m) return m[1];
    }
  } catch { /* URL invalide : traité comme un lien externe simple */ }
  return null;
}

function coverCard(c) {
  const u = state.user;
  const own = u && (u.id === c.user_id || u.is_admin);
  const ytId = youtubeEmbedId(c.url);
  return `<div class="cover-card" data-cover="${c.id}">
    ${ytId
      ? `<div class="cover-embed"><iframe src="https://www.youtube.com/embed/${esc(ytId)}"
          title="${esc(c.title)}" loading="lazy" allowfullscreen></iframe></div>`
      : `<a class="cover-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">▶ Voir la reprise</a>`}
    <div class="cover-head">
      <h4>${esc(c.title)}</h4>
      ${c.song_slug ? `<a class="cover-song-tag" href="/chanson/${encodeURIComponent(c.song_slug)}/reprises" data-link>${esc(c.song_title)}</a>` : ''}
      <div class="annotation-head">
        ${authorLink(c.username)}
        <span>${esc(formatDate(c.created_at))}</span>
        ${own ? `<button class="link-btn" data-cover-del="${c.id}">supprimer</button>` : ''}
      </div>
    </div>
    ${c.description ? `<div class="cover-desc">${esc(c.description)}</div>` : ''}
    ${socialFooter('cover', c)}
  </div>`;
}

function bindCoverDeletes(container, reload) {
  container.querySelectorAll('[data-cover-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer cette reprise ?')) return;
      try {
        await api(`/api/covers/${btn.dataset.coverDel}`, { method: 'DELETE' });
        await reload();
      } catch (err) { alert(err.message); }
    };
  });
}

// Page dédiée aux reprises d'un morceau — distincte de la page
// d'interprétation (paroles, annotations, essais, connexions) : ici il n'y a
// que les réalisations de la communauté pour ce morceau, et rien d'autre.
async function pageSongCovers(slug) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try {
    data = await api(`/api/songs/${encodeURIComponent(slug)}/covers`);
  } catch {
    if (!stale(epoch)) app.innerHTML = '<h1>Chanson introuvable</h1><p><a href="/" data-link>Retour aux interprétations</a></p>';
    return;
  }
  if (stale(epoch)) return;
  state.songCovers = data;
  renderSongCoversPage();
}

function renderSongCoversPage() {
  const { song, covers } = state.songCovers;
  const u = state.user;

  const list = covers.length
    ? `<div class="covers-grid">${covers.map(coverCard).join('')}</div>`
    : '';

  const form = u
    ? `<form class="panel-card" id="cover-form">
        <h3>Publier une reprise de « ${esc(song.title)} »</h3>
        <label for="cover-title">Titre</label>
        <input id="cover-title" required maxlength="200" placeholder="Ma reprise acoustique…">
        <label for="cover-url">Lien (YouTube, etc.)</label>
        <input id="cover-url" type="url" required maxlength="600" placeholder="https://…">
        <label for="cover-desc">Description (optionnel)</label>
        <textarea id="cover-desc" maxlength="2000" placeholder="Quelques mots sur ta version…"></textarea>
        <div class="error-msg"></div>
        <button type="submit" class="primary">Publier la reprise</button>
      </form>`
    : `<p class="empty-note"><a href="/connexion" data-link>Connectez-vous</a> pour publier une reprise de ce morceau.</p>`;

  app.innerHTML = `
    <div class="breadcrumb"><a href="/" data-link>Interprétations</a> › ${esc(song.album_title || 'Sans album')} ›
      <a href="/chanson/${encodeURIComponent(song.slug)}" data-link>${esc(song.title)}</a> › Reprises</div>
    <h1>Reprises de « ${esc(song.title)} »</h1>
    ${list}
    ${form}`;

  bindSocial(app, { reload: () => pageSongCovers(song.slug), render: () => renderSongCoversPage() });
  bindCoverDeletes(app, () => pageSongCovers(song.slug));

  const coverForm = document.getElementById('cover-form');
  if (coverForm) coverForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/covers', {
        method: 'POST',
        body: {
          song_id: song.id,
          title: document.getElementById('cover-title').value,
          url: document.getElementById('cover-url').value,
          description: document.getElementById('cover-desc').value,
        },
      });
      await pageSongCovers(song.slug);
    } catch (err) {
      coverForm.querySelector('.error-msg').textContent = err.message;
    }
  };
}

/* --------------------------------------------------- profils & le livre */

function bookPassageLabel(a) {
  if (a.target_type === 'song') return 'À propos du morceau';
  if (a.target_type === 'title') return 'Le titre';
  if (a.target_type === 'duration') return `La durée${a.duration_seconds ? ` (${mmss(a.duration_seconds)})` : ''}`;
  if (a.target_type === 'passage') {
    const from = tokens(a.line_text || '').slice(a.word_start || 0).join(' ');
    const to = tokens(a.end_line_text || '').slice(0, (a.word_end == null ? -1 : a.word_end) + 1).join(' ');
    const gap = (a.end_line_number || 0) - (a.line_number || 0) > 1 ? ' […] ' : ' / ';
    return `« ${from}${gap}${to} »`;
  }
  if (a.target_type === 'word') {
    return `« ${tokens(a.line_text || '').slice(a.word_start, a.word_end + 1).join(' ')} » — dans « ${a.line_text || ''} »`;
  }
  return `« ${a.line_text || ''} »`;
}

// Les interprétations d'un membre, regroupées morceau par morceau et
// classées dans l'ordre chronologique des sorties (albums puis pistes),
// chaque bloc citant le passage interprété.
async function pageProfile(username) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try {
    data = await api(`/api/users/${encodeURIComponent(username)}`);
  } catch {
    if (!stale(epoch)) app.innerHTML = '<h1>Membre introuvable</h1><p><a href="/" data-link>Retour aux interprétations</a></p>';
    return;
  }
  if (stale(epoch)) return;

  const { user, stats, annotations, essays, connections, versions, covers } = data;

  // sections par morceau, dans l'ordre livré par le serveur (albums, pistes)
  const sections = [];
  const bySlug = new Map();
  const sectionFor = (item) => {
    if (!bySlug.has(item.song_slug)) {
      const sec = {
        slug: item.song_slug, title: item.song_title, album: item.album_title,
        pos: [item.album_position, item.track_number || 0],
        blocks: [], essays: [],
      };
      bySlug.set(item.song_slug, sec);
      sections.push(sec);
    }
    return bySlug.get(item.song_slug);
  };
  annotations.forEach((a) => sectionFor(a).blocks.push(a));
  essays.forEach((e) => sectionFor(e).essays.push(e));
  sections.sort((x, y) => x.pos[0] - y.pos[0] || x.pos[1] - y.pos[1]);

  const isMe = state.user && state.user.username === user.username;
  const total = stats.annotations + stats.essays;

  const bookHtml = sections.length
    ? sections.map((sec) => `
      <section class="book-song">
        ${sec.album ? `<div class="book-album">${esc(sec.album)}</div>` : ''}
        <h3><a href="/chanson/${encodeURIComponent(sec.slug)}" data-link>${esc(sec.title)}</a></h3>
        ${sec.blocks.map((a) => `
          <div class="book-block ${a.is_published ? '' : 'book-draft'}">
            <div class="grid-label">Grille de lecture n°${a.grid_number}</div>
            <div class="book-passage">${esc(bookPassageLabel(a))}
              ${!a.is_published ? '<span class="draft-badge">Brouillon</span>' : ''}</div>
            <div class="book-content">${esc(a.content)}</div>
            ${referencesList(a)}
          </div>`).join('')}
        ${sec.essays.map((e) => `
          <div class="book-block book-essay ${e.is_published ? '' : 'book-draft'}">
            <div class="book-passage">Interprétation d’ensemble
              ${!e.is_published ? '<span class="draft-badge">Brouillon</span>' : ''}</div>
            <div class="book-content">${esc(e.content)}</div>
            ${e.links.length ? `<div class="essay-links-title">Connexions</div>
              ${e.links.map((l) => `<div class="essay-link">
                <div class="essay-link-blocks">
                  <span class="excerpt">« ${esc(excerptOf(l.from_text, l.from_word_start, l.from_word_end))} »</span>
                  <span class="link-song">(${esc(l.from_song_title)})</span>
                  <span class="arrow">⟷</span>
                  <span class="excerpt">« ${esc(excerptOf(l.to_text, l.to_word_start, l.to_word_end))} »</span>
                  <span class="link-song">(${esc(l.to_song_title)})</span>
                </div>
                <div class="essay-link-note">${esc(l.note)}</div>
              </div>`).join('')}` : ''}
          </div>`).join('')}
      </section>`).join('')
    : `<p class="empty-note">${isMe
        ? 'Tu n’as pas encore écrit d’interprétation : va sur un morceau pour commencer.'
        : 'Ce membre n’a pas encore écrit d’interprétation.'}</p>`;

  const versionsHtml = `
    <h2>Historique des publications</h2>
    ${isMe ? `
      <div class="publish-box">
        ${stats.draft_count
          ? `<p>${stats.draft_count} modification${stats.draft_count > 1 ? 's' : ''} en attente,
             non visible${stats.draft_count > 1 ? 's' : ''} pour les autres membres tant que tu n’as pas publié.</p>
             <button type="button" class="primary" id="publish-btn">Publier une nouvelle version</button>`
          : `<p class="empty-note">Aucune modification en attente : tout ce que tu as écrit est déjà publié.</p>`}
        <div class="error-msg" id="publish-error"></div>
      </div>` : ''}
    ${versions.length
      ? `<ul class="version-list">
          ${versions.map((v) => `
            <li><strong>Version ${v.number}</strong> — publiée le ${esc(formatDate(v.published_at))}
              <span class="version-count">(${v.item_count} bloc${v.item_count > 1 ? 's' : ''})</span></li>`).join('')}
        </ul>`
      : `<p class="empty-note">Aucune version publiée pour l’instant.</p>`}`;

  app.innerHTML = `
    <div class="profile-head">
      ${avatarImg(user.username, 'profile-avatar')}
      <div class="profile-head-text">
        <h1>${esc(user.username)}${user.is_admin ? ' <span class="album-date">— artiste</span>' : ''}</h1>
        <p class="subtitle">Membre depuis ${esc(formatDate(user.created_at))} ·
          ${stats.annotations} interprétation${stats.annotations > 1 ? 's' : ''} ·
          ${stats.essays} interprétation${stats.essays > 1 ? 's' : ''} d’ensemble ·
          ${stats.connections} connexion${stats.connections > 1 ? 's' : ''} ·
          ${stats.covers} reprise${stats.covers > 1 ? 's' : ''} ·
          ♥ ${stats.favorites_received} reçu${stats.favorites_received > 1 ? 's' : ''}</p>
      </div>
      ${isMe ? `<button type="button" class="icon-btn" id="settings-btn" title="Paramètres du compte" aria-label="Paramètres du compte">⚙</button>` : ''}
    </div>
    ${versionsHtml}
    <h2>${isMe ? 'Tes interprétations' : `Les interprétations de ${esc(user.username)}`}</h2>
    <p class="hint">${total} bloc${total > 1 ? 's' : ''} d’interprétation, classé${total > 1 ? 's' : ''} morceau par morceau
    dans l’ordre chronologique des sorties : le passage interprété, puis la lecture qu’${isMe ? 'en fais-tu' : `en fait ${esc(user.username)}`}.</p>
    ${bookHtml}
    ${covers.length ? `<h2>${isMe ? 'Tes reprises' : `Les reprises de ${esc(user.username)}`}</h2>
      <div class="covers-grid">${covers.map(coverCard).join('')}</div>` : ''}
    ${connections.length ? `<h2>Ses connexions entre morceaux</h2>
      ${connections.map((c) => `<div class="connection">
        <div class="connection-songs">
          <a href="/chanson/${encodeURIComponent(c.song_a_slug)}" data-link>${esc(c.song_a_title)}</a>
          <span class="arrow">⟷</span>
          <a href="/chanson/${encodeURIComponent(c.song_b_slug)}" data-link>${esc(c.song_b_title)}</a>
        </div>
        <div class="connection-body">${esc(c.explanation)}</div>
      </div>`).join('')}` : ''}`;

  if (isMe) {
    document.getElementById('settings-btn').onclick = () => openSettings();
    const publishBtn = document.getElementById('publish-btn');
    if (publishBtn) publishBtn.onclick = async () => {
      publishBtn.disabled = true;
      try {
        await api('/api/profile/publish', { method: 'POST' });
        await pageProfile(username);
      } catch (err) {
        document.getElementById('publish-error').textContent = err.message;
        publishBtn.disabled = false;
      }
    };
  }
  if (covers.length) {
    bindSocial(app, { reload: () => pageProfile(username), render: () => pageProfile(username) });
    bindCoverDeletes(app, () => pageProfile(username));
  }
}

/* ------------------------------------------------------------------ reprises */

// Arborescence de toutes les reprises publiées : album (ordre de sortie) →
// morceau (ordre de piste) → reprises, de la plus récente à la plus ancienne.
// Même mise en page que l'accueil (albums → morceaux) : c'est en ouvrant un
// morceau qu'on retrouve toutes ses reprises, sur sa page dédiée.
async function pageCovers() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  const data = await api('/api/covers');
  if (stale(epoch)) return;

  const songRow = (s) => `
    <li>
      <span class="song-num">${s.track_number ?? ''}</span>
      <a href="/chanson/${encodeURIComponent(s.slug)}/reprises" data-link>${esc(s.title)}</a>
      <span class="song-meta">${s.covers.length ? `${s.covers.length} reprise${s.covers.length > 1 ? 's' : ''}` : ''}</span>
    </li>`;

  const albums = newestFirst(data.albums).map((al) => `
    <section class="album-card">
      <div class="album-head">
        <h2>${esc(al.title)}</h2>
      </div>
      <ol class="song-list">${al.songs.map(songRow).join('')}</ol>
    </section>`).join('');

  app.innerHTML = `<h1>Reprises</h1>${albums}`;
}

/* --------------------------------------------------- les énigmes (/57) */

/* Page 57 : un escape game. Aucun texte, aucune explication, aucun indice —
   un élément, un « = », un champ. Rien de ce qui est à trouver n'apparaît
   ici : ni réponse, ni nom de classe, ni identifiant. Le Worker ne renvoie
   une réponse qu'une fois trouvée. */

async function pageEnigmes() {
  const epoch = newEpoch();

  if (!state.user) {
    app.innerHTML = `
      <h1>57</h1>
      <div class="enigmes-gate">
        <p>Réservé aux membres.</p>
        <p class="enigmes-gate-actions">
          <a href="/connexion" data-link class="btn">Se connecter</a>
          <a href="/inscription" data-link class="btn">Créer un compte</a>
        </p>
      </div>`;
    return;
  }

  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try {
    data = await api('/api/57');
  } catch (err) {
    if (stale(epoch)) return;
    app.innerHTML = `<h1>57</h1><p class="empty-note">${esc(err.message)}</p>`;
    return;
  }
  if (stale(epoch)) return;
  state.enigmes = data;
  renderEnigmesPage();
}

function nodeClass(n) {
  if (n.locked) return 'enigme enigme--locked';
  if (n.found.length === n.total) return 'enigme enigme--solved';
  if (n.found.length) return 'enigme enigme--partial';
  return 'enigme';
}

// Un seul champ par élément, même quand il porte plusieurs sens : les
// réponses s'empilent au-dessus au fur et à mesure, dans n'importe quel ordre.
function nodeCardHtml(n) {
  const counter = n.total > 1
    ? `<span class="enigme-count">${n.found.length}/${n.total}</span>` : '';

  if (n.locked) {
    const missing = n.requires
      .map((r) => `<button type="button" class="link-btn enigme-goto" data-goto="${esc(r.node)}">${esc(r.label)}</button>`)
      .join('');
    return `${counter}
      <p class="enigme-line"><span class="enigme-eq">=</span><span class="enigme-blank">?</span></p>
      <p class="enigme-locked-note"><span class="enigme-lock" aria-label="verrouillé">🔒</span>${missing}</p>`;
  }

  const found = n.found
    .map((a) => `<p class="enigme-line"><span class="enigme-eq">=</span><strong class="enigme-answer">${esc(a.label)}</strong></p>`)
    .join('');

  if (n.found.length === n.total) return counter + found;

  return `${counter}${found}
    <form class="enigme-form">
      <span class="enigme-eq">=</span>
      <input class="enigme-input" type="text" placeholder="mot de passe"
             autocomplete="off" autocapitalize="off" autocorrect="off"
             spellcheck="false" enterkeyhint="go" maxlength="200"
             aria-label="Mot de passe pour ${esc(n.source)}">
      <button type="submit" class="primary">Valider</button>
    </form>
    <p class="enigme-msg" role="status" aria-live="polite"></p>`;
}

function enigmesProgressHtml() {
  const d = state.enigmes;
  const pct = d.total ? Math.round((d.solved / d.total) * 100) : 0;
  return `
    <div class="progress-bar"><span style="width:${pct}%"></span></div>
    <p class="progress-text"><strong>${d.solved}</strong> / ${d.total}</p>`;
}

function renderEnigmesPage() {
  const d = state.enigmes;

  const nodes = d.nodes.map((n) => `
    <div class="node-group">
      <div class="node-source" id="src-${esc(n.id)}"><span>${esc(n.source)}</span></div>
      <div class="node-leaves">
        <article class="${nodeClass(n)}" id="e-${esc(n.id)}">${nodeCardHtml(n)}</article>
      </div>
    </div>`).join('');

  app.innerHTML = `
    <h1>57</h1>
    <div class="enigmes-progress" id="enigmes-progress">${enigmesProgressHtml()}</div>
    ${nodes}`;

  d.nodes.forEach((n) => {
    const el = document.getElementById('e-' + n.id);
    if (!el) return;
    el.dataset.sig = JSON.stringify(n);
    bindEnigmeCard(el, n);
  });
}

// Après chaque tentative, le serveur renvoie l'état complet : on ne réécrit
// que ce qui a changé, pour ne pas perdre le focus ni la position de
// défilement (essentiel sur mobile, clavier ouvert).
function applyEnigmesState(data, focusId) {
  state.enigmes = data;

  const prog = document.getElementById('enigmes-progress');
  if (prog) prog.innerHTML = enigmesProgressHtml();

  data.nodes.forEach((n) => {
    const el = document.getElementById('e-' + n.id);
    if (!el) return;
    // le libellé d'une racine est masqué tant que son prérequis manque
    const label = document.getElementById('src-' + n.id)?.firstElementChild;
    if (label && label.textContent !== n.source) label.textContent = n.source;

    const sig = JSON.stringify(n);
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.className = nodeClass(n);
    el.innerHTML = nodeCardHtml(n);
    bindEnigmeCard(el, n);
  });

  if (focusId) flashEnigme(focusId);
}

// Met la carte en évidence et l'amène au centre de l'écran : sur mobile le
// clavier vient de se refermer, la réponse doit atterrir sous les yeux.
function flashEnigme(id) {
  const el = document.getElementById('e-' + id);
  if (!el) return;
  el.classList.add('enigme--just');
  setTimeout(() => el.classList.remove('enigme--just'), 1800);
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
}

// Le refus ne dit rien : la carte tressaille, rougit et vibre. La couleur
// reste jusqu'à la frappe suivante, le tressaillement ne dure qu'un instant.
function enigmeWrong(el, input) {
  el.classList.remove('enigme--wrong');
  void el.offsetWidth; // force le redémarrage de l'animation
  el.classList.add('enigme--wrong');
  if (input) input.select();
  if (navigator.vibrate) navigator.vibrate(40);
}

function bindEnigmeCard(el, n) {
  const form = el.querySelector('.enigme-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = form.querySelector('.enigme-input');
      const btn = form.querySelector('button[type="submit"]');
      const answer = input.value.trim();
      if (!answer) return;
      el.classList.remove('enigme--wrong');
      btn.disabled = true;
      try {
        const res = await api('/api/57/guess', { method: 'POST', body: { id: n.id, answer } });
        if (res.ok) {
          input.blur(); // referme le clavier avant de dérouler la réponse
          applyEnigmesState(res.state, n.id);
        } else {
          btn.disabled = false;
          enigmeWrong(el, input);
        }
      } catch (err) {
        btn.disabled = false;
        const msg = el.querySelector('.enigme-msg');
        if (msg) msg.textContent = err.message;
      }
    };
  }

  const field = el.querySelector('.enigme-input');
  if (field) field.oninput = () => el.classList.remove('enigme--wrong');

  el.querySelectorAll('.enigme-goto').forEach((b) => {
    b.onclick = () => {
      const target = document.getElementById('e-' + b.dataset.goto);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('enigme--just');
      setTimeout(() => target.classList.remove('enigme--just'), 1800);
      // sur mobile, on évite d'ouvrir le clavier au milieu d'un défilement
      if (window.innerWidth > 700) {
        const input = target.querySelector('.enigme-input');
        if (input) setTimeout(() => input.focus(), 450);
      }
    };
  });
}

/* ---------------------------------------------------------------- admin */

async function pageAdmin() {
  if (!state.user || !state.user.is_admin) {
    app.innerHTML = '<h1>Administration</h1><p class="empty-note">Cette page est réservée à l’administrateur.</p>';
    return;
  }
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  const data = await api('/api/albums');
  if (stale(epoch)) return;
  const albums = data.albums;
  const allSongs = albums.flatMap((al) => al.songs.map((s) => ({ ...s, album_title: al.title }))).concat(data.orphans || []);

  app.innerHTML = `
    <h1>Administration</h1>
    <p class="subtitle">Gérez les albums, les chansons et les textes.</p>
    <div class="admin-grid">
      <section class="admin-card">
        <h2>Nouvel album / single</h2>
        <form id="album-form">
          <label>Titre</label><input id="af-title" required>
          <label>Date de sortie</label><input id="af-date" type="date">
          <label><input type="checkbox" id="af-single" style="width:auto"> C’est un single</label>
          <div class="error-msg"></div>
          <button type="submit" class="primary">Créer</button>
        </form>
        <ul class="admin-list">
          ${albums.map((al) => `<li>${esc(al.title)} ${al.is_single ? '(single)' : ''}<span class="spacer"></span>
            <button class="link-btn danger" data-del-album="${al.id}">supprimer</button></li>`).join('')}
        </ul>
      </section>
      <section class="admin-card">
        <h2>Nouvelle chanson</h2>
        <form id="song-form">
          <label>Titre</label><input id="sf-title" required>
          <label>Album</label>
          <select id="sf-album">
            <option value="">— Sans album —</option>
            ${albums.map((al) => `<option value="${al.id}">${esc(al.title)}</option>`).join('')}
          </select>
          <label>Numéro de piste</label><input id="sf-track" type="number" min="1">
          <label>Lien YouTube</label><input id="sf-youtube" type="url" placeholder="https://…">
          <div class="error-msg"></div>
          <button type="submit" class="primary">Créer</button>
        </form>
        <ul class="admin-list">
          ${allSongs.map((s) => `<li>${esc(s.title)}<span class="spacer"></span>
            <button class="link-btn danger" data-del-song="${s.id}">supprimer</button></li>`).join('')}
        </ul>
      </section>
      <section class="admin-card lyrics-editor" style="grid-column: 1 / -1">
        <h2>Paroles &amp; durée</h2>
        <label>Chanson</label>
        <select id="lyrics-song">
          <option value="">— Choisir une chanson —</option>
          ${allSongs.map((s) => `<option value="${s.id}" data-slug="${esc(s.slug)}">${esc(s.title)}</option>`).join('')}
        </select>
        <form id="duration-form" hidden>
          <label>Durée (m:ss, par exemple 3:57)</label>
          <input id="duration-input" placeholder="3:57" pattern="^\\d+:[0-5]?\\d$|^\\d+$|^$">
          <div class="error-msg"></div>
          <div class="success-msg"></div>
          <button type="submit">Enregistrer la durée</button>
        </form>
        <form id="lyrics-form" hidden>
          <label>Texte complet (une ligne par vers, ligne vide entre les strophes)</label>
          <textarea id="lyrics-text"></textarea>
          <p class="hint">⚠ Remplacer le texte supprime les interprétations déjà attachées aux anciennes phrases et mots.</p>
          <div class="error-msg"></div>
          <div class="success-msg"></div>
          <button type="submit" class="primary">Enregistrer les paroles</button>
        </form>
      </section>
    </div>`;

  document.getElementById('album-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/albums', {
        method: 'POST',
        body: {
          title: document.getElementById('af-title').value,
          release_date: document.getElementById('af-date').value,
          is_single: document.getElementById('af-single').checked,
        },
      });
      pageAdmin();
    } catch (err) {
      e.target.querySelector('.error-msg').textContent = err.message;
    }
  };

  document.getElementById('song-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/songs', {
        method: 'POST',
        body: {
          title: document.getElementById('sf-title').value,
          album_id: document.getElementById('sf-album').value || null,
          track_number: document.getElementById('sf-track').value || null,
          youtube_url: document.getElementById('sf-youtube').value,
        },
      });
      pageAdmin();
    } catch (err) {
      e.target.querySelector('.error-msg').textContent = err.message;
    }
  };

  app.querySelectorAll('[data-del-album]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer cet album ? Les chansons resteront mais sans album.')) return;
      await api(`/api/admin/albums/${btn.dataset.delAlbum}`, { method: 'DELETE' });
      pageAdmin();
    };
  });
  app.querySelectorAll('[data-del-song]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer cette chanson, ses paroles et toutes ses interprétations ?')) return;
      await api(`/api/admin/songs/${btn.dataset.delSong}`, { method: 'DELETE' });
      pageAdmin();
    };
  });

  const lyricsSelect = document.getElementById('lyrics-song');
  const lyricsForm = document.getElementById('lyrics-form');
  const durationForm = document.getElementById('duration-form');
  lyricsSelect.onchange = async () => {
    const opt = lyricsSelect.selectedOptions[0];
    if (!opt || !opt.value) { lyricsForm.hidden = true; durationForm.hidden = true; return; }
    const detail = await api(`/api/songs/${encodeURIComponent(opt.dataset.slug)}`);
    document.getElementById('lyrics-text').value = detail.lines.map((l) => l.text).join('\n');
    document.getElementById('duration-input').value = mmss(detail.song.duration_seconds) || '';
    lyricsForm.hidden = false;
    durationForm.hidden = false;
    for (const f of [lyricsForm, durationForm]) {
      f.querySelector('.success-msg').textContent = '';
      f.querySelector('.error-msg').textContent = '';
    }
  };
  durationForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/admin/songs/${lyricsSelect.value}/duration`, {
        method: 'PUT',
        body: { duration: document.getElementById('duration-input').value },
      });
      durationForm.querySelector('.error-msg').textContent = '';
      durationForm.querySelector('.success-msg').textContent = 'Durée enregistrée.';
    } catch (err) {
      durationForm.querySelector('.success-msg').textContent = '';
      durationForm.querySelector('.error-msg').textContent = err.message;
    }
  };
  lyricsForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await api(`/api/admin/songs/${lyricsSelect.value}/lyrics`, {
        method: 'PUT',
        body: { text: document.getElementById('lyrics-text').value },
      });
      lyricsForm.querySelector('.error-msg').textContent = '';
      lyricsForm.querySelector('.success-msg').textContent =
        `Paroles enregistrées (${result.line_count} lignes).`;
    } catch (err) {
      lyricsForm.querySelector('.success-msg').textContent = '';
      lyricsForm.querySelector('.error-msg').textContent = err.message;
    }
  };
}

/* ------------------------------------------------------------- démarrage */

/* ------------------------------------------- installation de l'application */

// Chrome/Android émettent `beforeinstallprompt` : on garde l'événement pour
// déclencher l'installation au bon moment. iOS ne le fait pas : on y explique
// le geste (Partager → Sur l'écran d'accueil).
let deferredInstall = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function showInstallBanner(mode) {
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  if (localStorage.getItem('wc_install_dismissed') === '1') return;
  const hint = document.getElementById('install-hint');
  const go = document.getElementById('install-go');
  if (mode === 'ios') {
    hint.innerHTML = 'Appuyez sur <strong>Partager</strong> puis <strong>« Sur l’écran d’accueil »</strong>.';
    go.hidden = true;
  } else {
    hint.textContent = 'Les textes sur votre écran d’accueil, même hors connexion.';
    go.hidden = false;
  }
  banner.hidden = false;
}

function bindInstall() {
  const banner = document.getElementById('install-banner');
  if (!banner) return;

  const close = document.getElementById('install-close');
  close.onclick = () => {
    banner.hidden = true;
    localStorage.setItem('wc_install_dismissed', '1');
  };

  document.getElementById('install-go').onclick = async () => {
    if (!deferredInstall) return;
    banner.hidden = true;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') localStorage.setItem('wc_install_dismissed', '1');
    deferredInstall = null;
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    showInstallBanner('prompt');
  });

  window.addEventListener('appinstalled', () => {
    banner.hidden = true;
    localStorage.setItem('wc_install_dismissed', '1');
  });

  // iOS : pas d'événement, on propose le geste après quelques secondes
  if (isIOS() && !isStandalone()) {
    setTimeout(() => showInstallBanner('ios'), 2500);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sans incidence */ });
  });
}

(async function init() {
  bindNavToggle();
  bindInstall();
  registerServiceWorker();
  try {
    const data = await api('/api/me');
    state.user = data.user;
  } catch { state.user = null; }
  route();
})();
