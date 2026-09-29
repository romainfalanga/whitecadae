// WhiteCadae : application frontend (SPA vanilla)

const app = document.getElementById('app');
const nav = document.getElementById('nav');

// Keep taps and long presses from selecting page text and opening browser search.
// Text fields retain native selection, editing and paste.
function isEditableTarget(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  return !!element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
}
for (const type of ['selectstart', 'contextmenu']) {
  document.addEventListener(type, (event) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  });
}

const state = {
  user: null,
  // droits aux espaces privés, distincts du compteur du jeu Échelon
  access: { interpretations: false },
  echelon: 1, // rang d'accès historique, tenu par le serveur
};

/* ------------------------------------------------------------------ utils */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Un href de lien externe : on ne laisse passer que http(s). La politique de
// sécurité bloque déjà un javascript: sur un clic, mais on ferme la porte plus
// tôt. À passer par esc() pour l'attribut.
function safeUrl(url) {
  const u = String(url ?? '').trim();
  return /^https?:\/\//i.test(u) ? u : '#';
}

function tokens(text) {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
}

function mmss(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
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
  if (!res.ok) {
    const err = new Error((data && data.error) || `Erreur ${res.status}`);
    err.status = res.status;
    err.data = data; // le corps de l'erreur porte parfois de quoi réagir
    throw err;
  }
  return data;
}

/* ---------------------------------------------------------------- routage */

// Jeton de navigation : un rendu asynchrone lancé avant un changement de page
// est abandonné à son réveil au lieu d'écraser la page courante.
let renderEpoch = 0;
function newEpoch() { return ++renderEpoch; }
function stale(epoch) { return epoch !== renderEpoch; }

// `remplace` : pas de trace dans l'historique. Utile quand on
// renvoie quelqu'un d'une page qui ne lui est pas encore ouverte, pour que le
// bouton « retour » ne l'y ramène pas en boucle.
function navigate(path, remplace) {
  if (remplace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  route();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
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

// Le battement d'une page vivante (conversation, brainstorm) : un seul à la
// fois, toujours coupé quand on quitte la page.
let pageTimer = null;
function coupePageTimer() {
  if (pageTimer) { clearInterval(pageTimer); pageTimer = null; }
}

async function route() {
  if (window.WCGame) WCGame.leave();
  if (window.WCJourney) WCJourney.leave();
  window.scrollTo(0, 0);
  closeNav();
  coupePageTimer();
  // le dock d'une application ne suit pas hors de chez elle
  document.body.classList.remove('avec-dock');
  const path = location.pathname;
  newEpoch();
  document.title = 'White Cadae';
  closeSettings();
  renderNav();
  let m;
  if (path === '/' || path === '') return pageOrange();
  if (path === '/aa' || path === '/aa/') return navigate('/',true);
  if (path === '/parcours') return WCJourney.page();
  if (path === '/escape-game-orange') return navigate('/', true);
  if (path === '/57') return navigate('/musique#album-57', true);
  if (path === '/musique') return pageMusique();
  if (path === '/paroles') return pageParoles();
  if (path === '/interpretations' || path === '/fil') return navigate('/paroles', true);
  if ((m = path.match(/^\/chanson\/([^/]+)$/))) return pageSong(decodeURIComponent(m[1]));
  if (path === '/echelon' || path === '/echelon/horloge') return WCGame.page();
  // Old bookmarks converge on the two game pages; no puzzle subpages remain.
  if ((m = path.match(/^\/echelon\/enigme\/([a-z0-9-]+)$/))) return navigate('/echelon#' + m[1], true);
  if ((m = path.match(/^\/echelon\/atelier\/(eg-1[0-3])$/))) return navigate('/echelon/horloge' + (m[1] === 'eg-10' ? '' : '#' + m[1]), true);
  if (/^\/echelon\/(lecture|galerie)\/[a-z0-9-]+$/.test(path)) return navigate('/echelon', true);
  if (/^\/(conversation|sujets|projets|brainstorm|videographie|reflexion|arbre|pense-mieux|carre-d-as|societe|114|game-master-orange)(?:\/|$)/.test(path)) {
    app.innerHTML = '<h1>Cette page a été supprimée</h1><p><a href="/echelon" data-link>Retrouver Échelons</a></p>';
    return;
  }
  if (path === '/connexion') return pageLogin();
  if (path === '/inscription') return pageRegister();
  if (path === '/admin') return pageAdmin();

  // Le profil est public : on y lit l'échelon d'un membre et les énigmes
  // qu'il a percées sans rien avoir trouvé soi-même. Ce qu'il a écrit reste
  // soumis à l'accès de celui qui regarde : le serveur s'en charge.
  if ((m = path.match(/^\/membre\/([^/]+)$/))) return pageProfile(decodeURIComponent(m[1]));

  app.innerHTML = '<h1>Page introuvable</h1><p><a href="/paroles" data-link>Retour aux paroles</a></p>';
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
  return `<img class="${className}" src="${avatarHref(username)}" alt="" data-avatar>`;
}

// Le repli quand un membre n'a pas de photo. Il était écrit dans un attribut
// `onerror`, ce que la politique de sécurité du site interdit désormais : on
// écoute donc à la capture, puisque `error` ne remonte pas depuis une image.
// L'attribut est retiré au passage : si le repli lui-même échouait, on
// tournerait en boucle.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-avatar')) return;
  img.removeAttribute('data-avatar');
  img.src = DEFAULT_AVATAR;
}, true);

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
    ${user.is_admin?'<p><a href="/admin" data-link>Administration</a></p>':''}

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
      if (newName !== oldName && location.pathname.startsWith('/membre/')) navigate(profileHref(newName));
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
    // sans compte on garde le sol : les interprétations restent là
    state.access = { interpretations: true };
    state.echelon = 1;
    WCPlayer.setAlbums([]);
    oublieAttente();
    closeSettings();
    navigate('/');
  };
}

// Le menu ne montre que ce qui est ouvert : une page qu'on n'a pas encore
// méritée n'apparaît pas du tout, pas même grisée.
function renderNav() {
  const u = state.user;
  const liens = ['<a href="/" data-link>Escape Game Orange</a>', '<a href="/musique" data-link>Musique</a>', '<a href="/echelon" data-link>Échelon</a>'];
  document.getElementById('account-access').innerHTML=u
    ? '<button id="nav-settings" class="account-button" aria-label="Paramètres du compte" title="Mon compte">' + WCIcon('user') + '</button>'
    : '<a href="/connexion" data-link class="account-button" aria-label="Se connecter" title="Se connecter">' + WCIcon('user') + '</a>';
  nav.innerHTML = liens.join('\n       ');
  nav.querySelectorAll('a').forEach((a) => { if ((a.getAttribute('href') === location.pathname || (a.getAttribute('href') === '/echelon' && location.pathname.startsWith('/echelon/')))) a.setAttribute('aria-current', 'page'); });
  const reglages = document.getElementById('nav-settings');
  if (reglages) reglages.onclick = () => openSettings();
}

/* -------------------------------------------------------- interprétations */

// L'API sert les albums du plus ancien au plus récent (colonne `position`).
// La page des interprétations les présente dans l'autre sens : la dernière
// sortie en premier. L'ordre des morceaux à l'intérieur d'un album ne change
// pas : il suit toujours le numéro de piste.
function newestFirst(albums) {
  return [...albums].reverse();
}

/* Le passage sur lequel porte une interprétation, reconstitué sans avoir à
   charger tout le morceau : le fil d'un profil s'en sert. */
function feedQuote(it) {
  if (it.target_type === 'song') return 'le morceau entier';
  if (it.target_type === 'title') return `le titre « ${it.song_title} »`;
  if (it.target_type === 'duration') return 'la durée';
  if (!it.line_text) return '';
  if (it.target_type === 'word') {
    return `« ${tokens(it.line_text).slice(it.word_start, it.word_end + 1).join(' ')} »`;
  }
  if (it.target_type === 'passage' && it.end_line_text) {
    const from = tokens(it.line_text).slice(it.word_start || 0).join(' ');
    const to = tokens(it.end_line_text).slice(0, (it.word_end == null ? 0 : it.word_end) + 1).join(' ');
    return `« ${from} […] ${to} »`;
  }
  return `« ${it.line_text} »`;
}

async function pageParoles() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api('/api/albums'); } catch (err) {
    if (!stale(epoch)) app.innerHTML = `<h1>Paroles</h1><p>${esc(err.message)}</p><a href="/paroles" data-link>Réessayer</a>`;
    return;
  }
  if (stale(epoch)) return;
  document.title = 'Paroles · White Cadae';
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
            <span class="song-meta">${s.line_count ? '' : 'paroles à venir'}</span>
          </li>`).join('')}
      </ol>
    </section>`).join('');

  app.innerHTML = `
    <p class="eyebrow">Les textes, au fil des albums</p>
    <h1>Paroles</h1>
    <p class="subtitle">Prends le temps de lire chaque morceau. Pour explorer les signes de 57, tu peux aussi <a href="/musique#album-57" data-link>écouter l’album</a>.</p>
    <h2 class="albums-title">Les morceaux</h2>
    ${albums || '<p class="empty-note">Aucun album pour le moment.</p>'}
    ${data.orphans?.length ? `<section class="album-card"><h2>Autres morceaux</h2><ul class="song-list">${data.orphans.map((s) => `<li><a href="/chanson/${encodeURIComponent(s.slug)}" data-link>${esc(s.title)}</a></li>`).join('')}</ul></section>` : ''}`;
}

/* ------------------------------------------------------- connexion/compte */

// La session porte le membre et ce que son échelon a ouvert : on la relit
// après chaque connexion, sans quoi le menu resterait celui d'avant.
async function refreshSession() {
  try {
    const data = await api('/api/me');
    state.user = data.user;
    state.access = data.access || { interpretations: true };
    state.echelon = data.echelon || 1;
    state.attenteMs = data.attenteMs || 0;
  } catch {
    // même injoignable, le serveur n'aurait pas refusé le sol
    state.user = null;
    state.access = { interpretations: true };
    state.echelon = 1;
    state.attenteMs = 0;
  }
  try { const music=await api('/api/music');WCPlayer.setAlbums(music.albums); }
  catch { WCPlayer.setAlbums([]); }
}

function accountDestination() {
  const value = new URLSearchParams(location.search).get('retour');
  if(value==='/parcours?view=ouvertures')return '/#mon-palier';
  if(value==='/parcours'||value==='/#mon-palier')return value;
  if (value === '57' || value === 'echelon') return '/echelon';
  return /^\/echelon(?:\/horloge|\/(?:enigme|lecture|galerie|atelier)\/[a-z0-9-]+)?(?:#[a-z0-9-]+)?$/.test(value || '') ? value : '/';
}

function pageLogin() {
  newEpoch();
  const destination = accountDestination();
  app.innerHTML = `
    <form class="form-card" id="login-form">
      <h1>Se connecter</h1>
      <label for="lf-email">Email</label>
      <input id="lf-email" type="email" required autocomplete="email">
      <label for="lf-password">Mot de passe</label>
      <input id="lf-password" type="password" required autocomplete="current-password">
      <div class="error-msg" id="lf-error"></div>
      <button type="submit" class="primary">Connexion</button>
      <p class="form-footer">Pas encore de compte ? <a href="/inscription${destination !== '/' ? '?retour=' + encodeURIComponent(destination) : ''}" data-link>Inscrivez-vous</a></p>
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
      await refreshSession();
      navigate(destination);
    } catch (err) {
      document.getElementById('lf-error').textContent = err.message;
    }
  };
}

function pageRegister() {
  newEpoch();
  const destination = accountDestination();
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
      <p class="form-footer">Déjà inscrit ? <a href="/connexion${destination !== '/' ? '?retour=' + encodeURIComponent(destination) : ''}" data-link>Connectez-vous</a></p>
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
      await refreshSession();
      navigate(destination);
    } catch (err) {
      document.getElementById('rf-error').textContent = err.message;
    }
  };
}

/* ---------------------------------------------------------------- chanson */

async function pageSong(slug) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement des paroles…</div>';
  try {
    const { song, lines } = await api(`/api/songs/${encodeURIComponent(slug)}`);
    if (stale(epoch)) return;
    const track = WCPlayer.findTrack(song.slug);
    document.title = `${song.title} · Paroles · White Cadae`;
    app.innerHTML = `<article class="lyrics-page">
      ${track ? '' : '<a class="back-link" href="/paroles" data-link>← Toutes les paroles</a>'}
      <p class="eyebrow">${esc(song.album_title || 'White Cadae')} · Paroles</p>
      <h1>${esc(song.title)}</h1>
      ${track ? `<div class="lyrics-actions"><button class="orange-button" data-play-track="${esc(track.slug)}">${WCIcon('play')} Écouter le morceau</button><a href="/echelon" data-link>Proposer un signe ${WCIcon('arrow')}</a></div>` : ''}
      <div class="lyrics-readable">${lines.length ? lines.map((l) => l.text ? `<p>${esc(l.text)}</p>` : '<div class="lyrics-break" aria-hidden="true"></div>').join('') : '<p>Les paroles de ce morceau seront bientôt disponibles.</p>'}</div>
      ${track ? `<a class="back-link" href="/musique#album-${esc(track.albumId)}" data-link>Retrouver l’album ${esc(track.album)} →</a>` : ''}
    </article>`;
    bindMusicButtons();
  } catch (err) {
    if (!stale(epoch)) app.innerHTML = `<h1>Paroles indisponibles</h1><p>${esc(err.message)}</p><a href="/paroles" data-link>Retour aux paroles</a>`;
  }
}

function excerptOf(text, ws, we) {
  if (ws == null) return text;
  return tokens(text).slice(ws, we + 1).join(' ');
}

function refTitle(r) {
  if (r.ref_song_slug) {
    return `<a href="/chanson/${encodeURIComponent(r.ref_song_slug)}" data-link>♪ ${esc(r.label)}</a>`;
  }
  return `<span class="ref-work">${esc(r.label)}</span>${r.artist ? ` <span class="ref-artist-name">· ${esc(r.artist)}</span>` : ''}`;
}

function referencesList(a) {
  if (!a.references || !a.references.length) return '';
  return `<ul class="ref-list">
    ${a.references.map((r) => `<li class="ref-item">
      <div class="ref-item-head">
        ${refTitle(r)}
      </div>
      ${r.note ? `<p class="ref-item-note">${esc(r.note)}</p>` : ''}
    </li>`).join('')}
  </ul>`;
}

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

/* ------------------------------------------------------ profil = timeline

   La page de profil EST le fil de ce qu'un membre a fait ici, du plus récent
   au plus ancien : interprétations, interprétations d'ensemble, références,
   connexions, et les publications qui ont rendu tout cela visible.
   Un seul fil, daté de bout en bout : ni sections, ni compteurs, ni
   présentation.                                                          */

const TIMELINE_KIND = {
  interpretation: 'Interprétation',
  ensemble: 'Interprétation d’ensemble',
  reference: 'Référence',
  connexion: 'Connexion',
};

// La coquille commune à toutes les entrées : la date d'abord, puisque c'est
// elle qui fait le fil.
function timelineEntry(kind, at, { where = '', body = '', badge = '' }) {
  return `<article class="tl-entry tl-${kind}">
    <div class="tl-meta">
      <time class="tl-date">${esc(formatDate(at))}</time>
      <span class="tl-kind">${TIMELINE_KIND[kind]}</span>
      ${badge}
    </div>
    ${where ? `<div class="tl-where">${where}</div>` : ''}
    ${body ? `<div class="tl-body">${body}</div>` : ''}
  </article>`;
}

const songLink = (slug, title) =>
  `<a href="/chanson/${encodeURIComponent(slug)}" data-link>${esc(title)}</a>`;

const draftBadge = () => '';

// Les connexions qui justifient une interprétation d'ensemble.
function essayLinksHtml(e) {
  if (!e.links || !e.links.length) return '';
  return `<div class="tl-links">${e.links.map((l) => `
    <div class="essay-link">
      <div class="essay-link-blocks">
        <span class="excerpt">« ${esc(excerptOf(l.from_text, l.from_word_start, l.from_word_end))} »</span>
        <span class="link-song">(${esc(l.from_song_title)})</span>
        <span class="arrow">⟷</span>
        <span class="excerpt">« ${esc(excerptOf(l.to_text, l.to_word_start, l.to_word_end))} »</span>
        <span class="link-song">(${esc(l.to_song_title)})</span>
      </div>
      <div class="essay-link-note">${esc(l.note)}</div>
    </div>`).join('')}</div>`;
}

// Ce vers quoi pointe une référence : le passage d'un autre morceau, ou une
// œuvre extérieure.
function refTargetHtml(r) {
  const cible = r.kind === 'internal'
    ? `♪ ${r.ref_song_slug ? songLink(r.ref_song_slug, r.label) : esc(r.label)}`
    : `${esc(r.label)}${r.artist ? ` <span class="ref-artist-name">· ${esc(r.artist)}</span>` : ''}`;
  return `<div class="tl-ref-target">${cible}</div>`;
}

// L'échelon d'un membre et les énigmes qu'il a percées : publics, et lisibles
// par n'importe qui. Jamais les réponses : seulement le nom de ce qui a été
// trouvé, tel que le serveur autorise celui qui regarde à le nommer.
function jeuHtml(jeu) {
  if (!jeu) return '';
  const liste = jeu.enigmes.length
    ? `<ul class="jeu-liste">${jeu.enigmes.map((e) => `
        <li>
          <span class="jeu-source">${e.source ? esc(e.source) : '<em>·</em>'}</span>
          <span class="jeu-compte">${e.found}${e.total ? `<span>/${e.total}</span>` : ''}</span>
        </li>`).join('')}</ul>`
    : '<p class="empty-note">Aucune énigme percée pour l’instant.</p>';
  return `<section class="jeu-bloc">
    <div class="jeu-echelon"><span>Échelon</span> <strong>${jeu.echelon}</strong></div>
    ${liste}
  </section>`;
}

async function pageProfile(username) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try {
    data = await api(`/api/users/${encodeURIComponent(username)}`);
  } catch {
    if (!stale(epoch)) app.innerHTML = '<h1>Membre introuvable</h1><p><a href="/paroles" data-link>Retour aux paroles</a></p>';
    return;
  }
  if (stale(epoch)) return;

  const { user, jeu, stats, annotations, essays, passageRefs, connections } = data;
  const isMe = state.user && state.user.username === user.username;

  // Tout ce qu'a fait ce membre devient une entrée datée, puis le fil se
  // reforme dans l'ordre. Les dates viennent toutes de datetime('now') :
  // elles se comparent telles quelles, sans passer par Date.
  const entries = [];
  const add = (at, html) => entries.push({ at: at || '', html });

  for (const a of annotations) {
    add(a.created_at, timelineEntry('interpretation', a.created_at, {
      badge: draftBadge(a) + (a.grid_number > 1 ? `<span class="tl-grid">n°${a.grid_number}</span>` : ''),
      where: songLink(a.song_slug, a.song_title),
      body: `<div class="tl-quote">${esc(feedQuote(a))}</div>
        <div class="annotation-body">${esc(a.content)}</div>
        ${referencesList(a)}`,
    }));
  }
  for (const e of essays) {
    add(e.created_at, timelineEntry('ensemble', e.created_at, {
      badge: draftBadge(e),
      where: songLink(e.song_slug, e.song_title),
      body: `<div class="annotation-body">${esc(e.content)}</div>${essayLinksHtml(e)}`,
    }));
  }
  for (const r of passageRefs || []) {
    add(r.created_at, timelineEntry('reference', r.created_at, {
      where: songLink(r.song_slug, r.song_title),
      body: `<div class="tl-quote">${esc(feedQuote(r))}</div>
        ${refTargetHtml(r)}
        ${r.note ? `<div class="annotation-body">${esc(r.note)}</div>` : ''}`,
    }));
  }
  for (const c of connections) {
    add(c.created_at, timelineEntry('connexion', c.created_at, {
      where: `${songLink(c.song_a_slug, c.song_a_title)}
        <span class="arrow">⟷</span>
        ${songLink(c.song_b_slug, c.song_b_title)}`,
      body: `<div class="annotation-body">${esc(c.explanation)}</div>`,
    }));
  }
  entries.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  app.innerHTML = `
    <div class="profile-head">
      ${avatarImg(user.username, 'profile-avatar')}
      <h1>${esc(user.username)}${user.is_admin ? ' <span class="album-date">artiste</span>' : ''}</h1>
      ${isMe ? `<button type="button" class="icon-btn" id="settings-btn"
        title="Paramètres du compte" aria-label="Paramètres du compte">⚙</button>` : ''}
    </div>
    ${isMe&&data.journey?`<section class="profile-journey"><div class="jeu-echelon"><span>Échelon</span> <strong>${jeu.echelon}</strong></div><h2>Mon champ des possibles</h2><p>${data.journey.remaining} signes visibles à trouver · ${data.journey.locked} énigmes verrouillées</p><a class="orange-button" href="/parcours" data-link>Explorer mon arborescence →</a></section>`:jeuHtml(jeu)}
    ${data.restreint ? '' : `<div class="timeline">${entries.map((e) => e.html).join('')
      || '<p class="empty-note">Rien pour l’instant.</p>'}</div>`}`;

  if (isMe) {
    document.getElementById('settings-btn').onclick = () => openSettings();
  }
}

// Échelon owns its timers, drafts and navigation.
function oublieAttente() { state.attenteMs = 0; WCGame.clear(); }

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
            <option value="">Sans album</option>
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
          <option value="">Choisir une chanson…</option>
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
  await refreshSession();
  route();
})();
