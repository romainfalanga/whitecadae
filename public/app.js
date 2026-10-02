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
  gameEchelon: 1,
  echelon: 1, // rang d'accès historique, tenu par le serveur
};
const accountChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('wc-account-context'):null;
let observedAccount;
accountChannel?.addEventListener('message',event=>{
  if(event.data?.type!=='account-changed'||event.data.userId===state.user?.id)return;
  window.WCPrivate?.leave();
  app.innerHTML='<div class="loading">Le compte connecté a changé…</div>';
  refreshSession().then(route);
});

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

function continuationMarkup(item) {
  if (!item) return '';
  return `<section class="game-continuation" aria-label="Échelon ${esc(item.level)}"><a class="game-gate" href="${esc(safeUrl(item.href))}" target="_blank" rel="noopener noreferrer"><span class="gate-orbit" aria-hidden="true"></span><span class="gate-title">Échelon <strong>${esc(item.level)}</strong></span><span class="gate-action">Rejoindre <span aria-hidden="true">↗</span></span><span class="sr-only"> (nouvel onglet)</span></a></section>`;
}

function accountEntryMarkup(destination=location.pathname+location.hash) {
  const query='?retour='+encodeURIComponent(destination);
  return `<div class="eg-account"><a class="orange-button" href="/connexion${esc(query)}" data-link>Se connecter</a><a href="/inscription${esc(query)}" data-link>Créer un compte</a></div>`;
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
  window.WCPrivate?.leave();
  if (window.WCGame) WCGame.leave();
  if (window.WCJourney) WCJourney.leave();
  if (window.WCRoadmap) WCRoadmap.leave();
  window.scrollTo(0, 0);
  closeNav();
  coupePageTimer();
  // le dock d'une application ne suit pas hors de chez elle
  document.body.classList.remove('avec-dock');
  const path = location.pathname.replace(/\/+$/,'') || '/';
  newEpoch();
  document.title = 'White Cadae';
  renderNav();
  let m;
  if (path === '/' || path === '') return pageOrange();
  if (path === '/aa' || path === '/aa/') return navigate('/',true);
  if (path === '/parcours') return navigate('/echelon',true);
  if (path === '/escape-game-orange') return navigate('/', true);
  if (path === '/57') return navigate('/musique#album-57', true);
  if (path === '/musique') return pageMusique();
  if (path === '/paroles') return pageParoles();
  if (path === '/interpretations' || path === '/fil') return navigate('/paroles', true);
  if ((m = path.match(/^\/chanson\/([^/]+)$/))) return pageSong(decodeURIComponent(m[1]));
  if (path === '/signes' || path === '/signes/horloge') return WCGame.page();
  if (path === '/echelon') {
    if(/^#(?:eg-|n-)[a-z0-9-]+$/.test(location.hash))return navigate('/signes'+location.hash,true);
    return WCRoadmap.page();
  }
  if (path === '/echelon/horloge') return navigate('/signes/horloge'+location.hash,true);
  if(path==='/arbre-de-vie')return navigate('/matiere'+location.hash,true);
  if(['/game-master-orange','/matiere','/carre-d-as','/signalements'].includes(path)||/^\/carre-d-as\/fil\/\d+$/.test(path)||/^\/mecanisme(?:\/(?:[1-9]|10))?$/.test(path)){
    const epoch=renderEpoch;
    app.innerHTML='<div class="loading">Chargement…</div>';
    try{
      const module=await import('/private-pages.js');
      if(!stale(epoch)){window.WCPrivate=module;return module.page(path,{app,api,esc,state,navigate,accountEntryMarkup,isCurrent:()=>!stale(epoch)});}
    }catch(error){if(!stale(epoch))app.innerHTML='<p>Cette page n’a pas pu être chargée. Réessaie lorsque la connexion est revenue.</p>';}
    return;
  }
  // Old bookmarks converge on the two game pages; no puzzle subpages remain.
  if ((m = path.match(/^\/echelon\/enigme\/([a-z0-9-]+)$/))) return navigate('/signes#' + m[1], true);
  if ((m = path.match(/^\/echelon\/atelier\/(eg-\d+)$/))) return navigate('/signes/horloge' + (m[1] === 'eg-10' ? '' : '#' + m[1]), true);
  if (/^\/echelon\/(lecture|galerie)\/[a-z0-9-]+$/.test(path)) return navigate('/signes', true);
  if (/^\/(conversation|sujets|projets|brainstorm|videographie|reflexion|arbre|pense-mieux|carre-d-as|societe|114|game-master-orange)(?:\/|$)/.test(path)) {
    app.innerHTML = '<h1>Cette page a été supprimée</h1><p><a href="/signes" data-link>Retrouver les signes</a></p>';
    return;
  }
  if (path === '/connexion') return pageLogin();
  if (path === '/inscription') return pageRegister();
  if (path === '/admin') return pageAdmin();

  if (/^\/membre(?:\/|$)/.test(path)) return navigate('/echelon',true);

  app.innerHTML = '<h1>Page introuvable</h1><p><a href="/paroles" data-link>Retour aux paroles</a></p>';
}

function renderNav() {
  const badge=document.getElementById('header-level');if(badge){badge.hidden=!state.user;badge.textContent=state.user?String(state.gameEchelon):'';badge.setAttribute('aria-label','Échelon '+state.gameEchelon);}
  const liens = ['<a href="/" data-link>Escape Game Orange</a>', '<a href="/musique" data-link>Musiques</a>', '<a href="/signes" data-link>Signes</a>', '<a href="/echelon" data-link>Échelons</a>'];
  if(state.user&&state.access.horloge)liens.splice(3,0,'<a href="/signes/horloge" data-link>Horloge</a>');
  for(const [access,href,title] of [['gameMaster','/game-master-orange','Game Master Orange'],['mechanisms','/mecanisme','Mécanismes'],['lifeTree','/matiere','Matière'],['aceSquare','/carre-d-as','Carré d’AS']])if(state.user&&state.access[access])liens.push(`<a href="${href}" data-link>${title}</a>`);
  nav.innerHTML = liens.join('\n       ');
  nav.querySelectorAll('a').forEach((a) => { if (a.getAttribute('href') === location.pathname) a.setAttribute('aria-current', 'page'); });

}

/* -------------------------------------------------------- interprétations */

// L'API sert les albums du plus ancien au plus récent (colonne `position`).
// La page des interprétations les présente dans l'autre sens : la dernière
// sortie en premier. L'ordre des morceaux à l'intérieur d'un album ne change
// pas : il suit toujours le numéro de piste.
function newestFirst(albums) {
  return [...albums].reverse();
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
    state.gameEchelon = data.gameEchelon || 1;
    state.attenteMs = data.attenteMs || 0;
  } catch {
    // même injoignable, le serveur n'aurait pas refusé le sol
    state.user = null;
    state.access = { interpretations: true };
    state.echelon = 1;
    state.gameEchelon = 1;
    state.attenteMs = 0;
  }
  const currentAccount=state.user?.id||null;
  if(observedAccount!==undefined&&observedAccount!==currentAccount)accountChannel?.postMessage({type:'account-changed',userId:currentAccount});
  observedAccount=currentAccount;
  try { const music=await api('/api/music');WCPlayer.setAlbums(music.albums); }
  catch { WCPlayer.setAlbums([]); }
}

function accountDestination() {
  const value = new URLSearchParams(location.search).get('retour');
  if(value==='57')return '/signes';
  if(value==='echelon'||value==='/parcours')return '/echelon';
  return /^\/(?:signes(?:\/horloge)?|echelon(?:\/horloge)?|game-master-orange|mecanisme(?:\/(?:[1-9]|10))?|arbre-de-vie|matiere|carre-d-as(?:\/fil\/\d+)?)(?:#[a-z0-9-]+)?$/.test(value || '') ? value : '/';
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
      ${track ? `<div class="lyrics-actions"><button class="orange-button" data-play-track="${esc(track.slug)}">${WCIcon('play')} Écouter le morceau</button></div>` : ''}
      <div class="lyrics-readable">${lines.length ? lines.map((l) => l.text ? `<p>${esc(l.text)}</p>` : '<div class="lyrics-break" aria-hidden="true"></div>').join('') : '<p>Les paroles de ce morceau seront bientôt disponibles.</p>'}</div>
      ${track ? `<a class="back-link" href="/musique#album-${esc(track.albumId)}" data-link>Retrouver l’album ${esc(track.album)} →</a>` : ''}
    </article>`;
    bindMusicButtons();
  } catch (err) {
    if (!stale(epoch)) app.innerHTML = `<h1>Paroles indisponibles</h1><p>${esc(err.message)}</p><a href="/paroles" data-link>Retour aux paroles</a>`;
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
    <p><a href="/signalements" data-link>Examiner les signalements des carrés</a></p>
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
