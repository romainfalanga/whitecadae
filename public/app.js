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
function newEpoch() { carteAJour = null; return ++renderEpoch; }
function stale(epoch) { return epoch !== renderEpoch; }

/* La carte des pensées se dessine autrement selon la place : couchée sur un
   écran large, DEBOUT sur un téléphone — un téléphone est haut, pas large, et
   une carte couchée s'y écrase jusqu'à ne plus rien montrer. Le seuil est le
   même que celui de la feuille de style, et la carte de la page courante se
   redessine quand on le franchit (rotation, fenêtre redimensionnée).       */
const CARTE_DEBOUT = window.matchMedia('(max-width: 700px)');
let carteAJour = null;
CARTE_DEBOUT.addEventListener('change', () => { if (carteAJour) carteAJour(); });

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
  if (/^\/(pense-mieux|carre-d-as|societe|brainstorm|114|game-master-orange)(?:\/|$)/.test(path)) {
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

  // Une page qu'on n'a pas encore atteinte ne se discute pas : on revient au
  // 57, sans un mot. Chaque pièce haute a sa clé d'accès ; le serveur revérifie
  // de toute façon à chaque appel.
  const cle = path === '/conversation' ? 'conversation'
    : path.startsWith('/videographie') || path.startsWith('/reflexion/') || path.startsWith('/arbre/') ? 'videographie'
    : 'interpretations';
  if (!state.access[cle]) return navigate('/echelon', true);
  if (path === '/conversation') return WCConversation.page();
  if (path === '/videographie') return vueRythme();
  if (path === '/videographie/carre') return navigate('/videographie', true);
  if ((m = path.match(/^\/videographie\/(\d+)$/))) return pageArbre(+m[1]);
  if ((m = path.match(/^\/reflexion\/(\d+)$/))) return pageArbre(+m[1]);
  if ((m = path.match(/^\/arbre\/(\d+)$/))) return navigate(`/reflexion/${m[1]}`, true);
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
  const a = state.access;
  const liens = ['<a href="/" data-link>Escape Game Orange</a>', '<a href="/musique" data-link>Musiques</a>', '<a href="/paroles" data-link>Paroles</a>', '<a href="/echelon" data-link>Échelons</a>'];
  if (a.conversation) liens.push('<a href="/conversation" data-link>Conversation</a>');
  if (a.videographie) liens.push('<a href="/videographie" data-link>Vidéographie</a>');
  // La déconnexion se fait depuis les paramètres du compte (page profil) :
  // pas besoin de la dupliquer dans le menu.
  if (u) {
    if (u.is_admin) liens.push('<a href="/admin" data-link>Administration</a>');
    // Le profil est public et porte l'échelon : le menu y mène dès la
    // connexion, et c'est aussi par là qu'on règle son compte.
    liens.push(`<a href="${profileHref(u.username)}" data-link>Mon profil</a>`);
  } else {
    liens.push('<a href="/connexion" data-link>Se connecter</a>');
    liens.push('<a href="/inscription" data-link class="btn">Créer un compte</a>');
  }
  nav.innerHTML = liens.join('\n       ');
  nav.querySelectorAll('a').forEach((a) => { if ((a.getAttribute('href') === location.pathname || (a.getAttribute('href') === '/echelon' && location.pathname.startsWith('/echelon/')))) a.setAttribute('aria-current', 'page'); });
  const reglages = document.getElementById('nav-settings');
  if (reglages) reglages.onclick = () => openSettings();
}

/* --------------------------------------------- la conversation (échelon 2)
   Une seule conversation. Chaque message porte l'échelon minimal pour le
   lire, choisi par son auteur : plus on monte, plus on entend. La page se
   relit toute seule, mais seulement quand elle est visible.               */

/* ------------------- les arbres : Pense Mieux (3) et Vidéographie (4) ---
   Un arbre par sujet : un tronc, des branches emboîtées qui se font grandir.
   La forêt, c'est l'ensemble de ses arbres. En Vidéographie chaque branche
   est une vidéo YouTube : on y organise ce qu'on a extériorisé en vidéo.  */

/* --------------------------------------------------------- les deux quêtes ---
   Une réflexion creuse dans UN sens : vers la cause (« Pourquoi ? ») ou vers
   le remède (« Comment faire mieux ? »). Les libellés viennent du serveur
   avec chaque page de Pense Mieux ; ceux d'ici ne servent qu'au premier
   dessin, avant que la réponse arrive. */
let QUETES = [
  { cle: 'pourquoi', titre: 'Pourquoi ?', court: 'Pourquoi',
    sous: 'Descendre vers la cause : pourquoi c’est ainsi, et d’où ça vient.' },
  { cle: 'mieux', titre: 'Comment faire mieux ?', court: 'Faire mieux',
    sous: 'Monter vers le remède : ce qui ferait mieux, et par quel chemin.' },
];
function retientQuetes(data) {
  if (data && Array.isArray(data.quetes) && data.quetes.length) QUETES = data.quetes;
}
function quete(cle) { return QUETES.find((q) => q.cle === cle) || null; }
// La pastille d'une réflexion : ce qu'elle creuse, dit en un mot.
function queteChip(cle) {
  const q = quete(cle);
  return q ? `<span class="quete-chip quete-chip--${cle}">${esc(q.titre)}</span>` : '';
}

const ARBRES_PAGES = {
  video: {
    titre: 'Vidéographie',
    chemin: '/videographie',
    app: 'vg',
    invite: 'Extériorise tes réflexions en vidéo, puis relie-les : chaque entrée est une vidéo YouTube, publique ou privée.',
    vide: 'Aucune vidéo pour l’instant. Ouvre ton premier ensemble.',
  },
};

/* ------------------------------------------ la cartographie des pensées ---
   Des réflexions sur une carte : un disque par réflexion, gros comme ce
   qu'elle porte ; un trait plein par nourriture qui passe de l'une à
   l'autre ; un trait discret pour le rangement (une réflexion tient à son
   espace, une sous-branche à sa catégorie) ; le miroir société ↔ société
   harmonieuse en pointillé. La couleur dit la quête : ce qui creuse le
   pourquoi, ce qui cherche à faire mieux. On s'y voit penser : ce qui
   grossit, ce qui se relie, ce qui reste seul.

   Sur un écran large la carte est couchée ; sur un téléphone elle se dresse
   DEBOUT et se lit en descendant — c'est le sens où un téléphone a de la
   place, et le seul où toutes les réflexions tiennent sans s'écraser.

   `noeuds` : { id, titre, n, espace?, intime?, categorie?, quete? }.
   `liens`  : { de, vers, n?, type: 'lien' | 'range' | 'miroir' }.        */
function carteSvg(noeuds, liens) {
  if (!noeuds.length) return '';
  const debout = CARTE_DEBOUT.matches;
  const rang = new Map(noeuds.map((x, i) => [x.id, i]));
  const aretes = (liens || [])
    .filter((l) => rang.has(l.de) && rang.has(l.vers))
    .map((l) => ({ a: rang.get(l.de), b: rang.get(l.vers), n: l.n || 1, type: l.type || 'lien' }));

  /* La disposition : chaque réflexion part sur une spirale (l'angle d'or fait
     que deux départs ne se superposent jamais), puis quelques tours de
     détente — les liens attirent, toute paire se repousse, le centre
     retient. La spirale est aplatie dans le sens où la place manque : en
     largeur quand la carte est debout, en hauteur quand elle est couchée.
     C'est déterministe : la carte est la même à chaque visite. */
  const L = debout ? 620 : 1000;
  const H = debout
    ? Math.max(620, Math.min(1500, 360 + noeuds.length * 88))
    : Math.max(340, Math.min(640, 220 + noeuds.length * 42));
  const ecrase = 0.62;
  const P = noeuds.map((_, i) => {
    const a = i * 2.399963;
    const r = (debout ? 62 : 55) + (debout ? 118 : 145) * Math.sqrt(i);
    return {
      x: L / 2 + r * Math.cos(a) * (debout ? ecrase : 1),
      y: H / 2 + r * Math.sin(a) * (debout ? 1 : ecrase),
      vx: 0, vy: 0,
    };
  });
  const K = { lien: 0.02, range: 0.016, miroir: 0.012 };
  const centreX = debout ? 0.004 : 0.002;
  const centreY = debout ? 0.002 : 0.004;
  const margeX = debout ? 92 : 110;
  const hautMarge = 46;
  const basMarge = 58; // le nom d'une réflexion s'écrit SOUS son disque
  for (let t = 0; t < 140; t++) {
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      let dx = P[j].x - P[i].x, dy = P[j].y - P[i].y;
      const d2 = Math.max(900, dx * dx + dy * dy);
      const d = Math.sqrt(d2), f = 16000 / d2;
      dx /= d; dy /= d;
      P[i].vx -= dx * f; P[i].vy -= dy * f;
      P[j].vx += dx * f; P[j].vy += dy * f;
    }
    for (const r of aretes) {
      const k = K[r.type] || K.lien;
      const dx = P[r.b].x - P[r.a].x, dy = P[r.b].y - P[r.a].y;
      P[r.a].vx += dx * k; P[r.a].vy += dy * k;
      P[r.b].vx -= dx * k; P[r.b].vy -= dy * k;
    }
    for (const p of P) {
      p.vx += (L / 2 - p.x) * centreX; p.vy += (H / 2 - p.y) * centreY;
      p.x += p.vx * 0.6; p.y += p.vy * 0.6; p.vx *= 0.5; p.vy *= 0.5;
      p.x = Math.min(L - margeX, Math.max(margeX, p.x));
      p.y = Math.min(H - basMarge, Math.max(hautMarge, p.y));
    }
  }

  /* La détente ramasse tout vers le centre : on rouvre. Le nuage est étiré
     jusqu'aux bords de la place disponible, chaque sens indépendamment — une
     carte est un schéma, elle dit qui touche qui, pas à quelle distance. On
     ne fait que grandir (jamais rétrécir : deux disques ne doivent pas se
     rejoindre), et pas au-delà de deux fois et demie. */
  {
    const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const tient = (place, etendue) => Math.min(2.5, Math.max(1, place / Math.max(1, etendue)));
    const kx = tient(L - 2 * margeX, x1 - x0);
    const ky = tient(H - hautMarge - basMarge, y1 - y0);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const p of P) {
      p.x = Math.min(L - margeX, Math.max(margeX, L / 2 + (p.x - cx) * kx));
      p.y = Math.min(H - basMarge, Math.max(hautMarge, H / 2 + (p.y - cy) * ky));
    }
  }

  const traits = aretes.map((r) => `
    <line x1="${P[r.a].x.toFixed(1)}" y1="${P[r.a].y.toFixed(1)}"
          x2="${P[r.b].x.toFixed(1)}" y2="${P[r.b].y.toFixed(1)}"
          class="carte-lien${r.type !== 'lien' ? ` carte-lien--${r.type}` : ''}"
          stroke-width="${(r.type === 'range' ? 1 : Math.min(4, 1 + r.n)).toFixed(1)}"/>`).join('');
  const coupe = debout ? 18 : 24;
  const disques = noeuds.map((x, i) => {
    const p = P[i];
    const r = 9 + Math.min(20, 4 * Math.sqrt(x.n || 0));
    const nom = x.titre.length > coupe ? x.titre.slice(0, coupe - 1) + '…' : x.titre;
    return `
    <a href="/reflexion/${x.id}" data-link
       class="carte-noeud${x.espace ? ' carte-noeud--espace' : ''}${x.intime ? ' carte-noeud--intime' : ''}${
         x.categorie ? ' carte-noeud--categorie' : ''}${x.quete ? ` carte-noeud--${x.quete}` : ''}">
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y + r + 16).toFixed(1)}">${esc(nom)}</text>
    </a>`;
  }).join('');

  /* La légende : la carte ne s'explique pas en paragraphe, mais on doit
     pouvoir dire d'un regard ce que chaque disque est. Elle ne montre que ce
     que la carte porte vraiment. */
  const aQuete = (q) => noeuds.some((x) => x.quete === q);
  const cles = [
    noeuds.some((x) => x.espace) ? ['espace', 'une branche'] : null,
    noeuds.some((x) => x.categorie) ? ['categorie', 'une catégorie'] : null,
    aQuete('pourquoi') ? ['pourquoi', 'Pourquoi ?'] : null,
    aQuete('mieux') ? ['mieux', 'Comment faire mieux ?'] : null,
  ].filter(Boolean);

  return `
    <figure class="carte-pensees${debout ? ' carte-pensees--debout' : ''}">
      <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="La carte des réflexions"
           preserveAspectRatio="xMidYMid meet">${traits}${disques}</svg>
      ${cles.length ? `<figcaption class="carte-legende">${cles.map(([c, mot]) =>
        `<span class="carte-cle carte-cle--${c}">${esc(mot)}</span>`).join('')}</figcaption>` : ''}
    </figure>`;
}

// La carte de l'accueil : les espaces et tout ce qu'ils rangent.
function dessineCarte(data) {
  const noeuds = [
    ...(data.troncs || []).map((t) => ({
      id: t.id, titre: t.title, n: t.branches, espace: true,
    })),
    ...(data.arbres || []).map((a) => ({
      id: a.id, titre: a.title, n: a.branches,
      categorie: a.genre === 'categorie', quete: a.quete || null,
    })),
  ];
  const liens = [
    ...(data.carte || []).map((l) => ({ de: l.de, vers: l.vers, n: l.n, type: 'lien' })),
    ...(data.arbres || []).filter((a) => a.parent_id)
      .map((a) => ({ de: a.parent_id, vers: a.id, type: 'range' })),
  ];
  /* Le miroir, dessiné en pointillé : c'est le serveur qui dit quelle branche
     répond à quelle autre. Une seule ligne par couple. */
  const parAxe = new Map((data.troncs || []).map((t) => [t.axe, t]));
  const vus = new Set();
  for (const t of data.troncs || []) {
    const autre = t.miroir_axe ? parAxe.get(t.miroir_axe) : null;
    if (!autre) continue;
    const cle = [t.id, autre.id].sort((a, b) => a - b).join(':');
    if (vus.has(cle)) continue;
    vus.add(cle);
    liens.push({ de: t.id, vers: autre.id, type: 'miroir' });
  }
  return carteSvg(noeuds, liens);
}

/* ------------------------------------- Pense Mieux : une seule page -------
   La cartographie de toutes ses pensées, puis les trois branches — mon
   fonctionnement, la société, la société harmonieuse — toutes à soi, et à
   personne d'autre. En bas, la recherche plein texte. Tout le reste — créer
   une catégorie, ouvrir une réflexion, dire une pensée — se fait DANS la
   branche concernée, sur sa propre page.                                  */

function dureeCourte(ms) {
  const jours = Math.floor(ms / 86400000);
  if (jours >= 2) return `${jours} j`;
  const heures = Math.floor(ms / 3600000);
  if (heures >= 2) return `${heures} h`;
  return `${Math.max(1, Math.floor(ms / 60000))} min`;
}

async function vueRythme() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api('/api/videographie/rythme'); }
  catch (err) {
    if (err.status === 401) {
      app.innerHTML = '<h1>Vidéographie</h1><p class="empty-note">Connecte-toi.</p>';
      return;
    }
    return navigate('/echelon', true);
  }
  if (stale(epoch)) return;

  // la matière : des compteurs, pas des phrases
  const chips = (m) => {
    const c = [];
    if (m.penseMieux.branches) c.push(`${m.penseMieux.branches} pensée${m.penseMieux.branches > 1 ? 's' : ''}`);
    const carres = m.carres.reduce((n, x) => n + x.branches, 0);
    if (carres) c.push(`${carres} en carré`);
    const messages = m.carres.reduce((n, x) => n + x.messages, 0);
    if (messages) c.push(`${messages} message${messages > 1 ? 's' : ''}`);
    if (m.echanges && m.echanges.recues) c.push(`${m.echanges.recues} réponse${m.echanges.recues > 1 ? 's' : ''} reçue${m.echanges.recues > 1 ? 's' : ''}`);
    if (m.echanges && m.echanges.donnees) c.push(`${m.echanges.donnees} donnée${m.echanges.donnees > 1 ? 's' : ''}`);
    if (m.signes) c.push(`${m.signes} signe${m.signes > 1 ? 's' : ''}`);
    return c.length
      ? c.map((x) => `<span class="ry-chip">${esc(x)}</span>`).join('')
      : '<span class="ry-chip ry-chip--vide">rien encore</span>';
  };

  /* La carte d'une cadence. Le récap ne se dépose que le jour dit : le
     dimanche, le premier dimanche du mois, du 1er au 3 janvier. Hors fenêtre
     la carte montre la matière qui s'accumule et le jour où elle se dira :
     rien à décider, rien à cliquer.                                       */
  const carte = (c) => `
    <section class="ry-carte${c.faite ? ' faite' : ''}${c.ouverte ? ' ouverte' : ''}" data-cadence="${c.cle}">
      <header>
        <h2>${esc(c.cle === 'annee' ? 'Année' : c.cle === 'mois' ? 'Mois' : 'Semaine')}</h2>
        <span class="ry-periode">${esc(c.periode.libelle)}</span>
        <span class="ry-reste">${c.faite ? 'déposée'
          : c.ouverte ? 'c’est aujourd’hui'
          : `${esc(dureeCourte(Math.max(0, c.prochaine.ts - Date.now())))} avant le récap`}</span>
      </header>
      <div class="ry-matiere">${chips(c.matiere)}</div>
      ${c.faite ? `
        <div class="ry-faite">${videoEmbed(c.faite.url)}</div>
        ${c.faite.note ? `<p class="ry-note">${esc(c.faite.note)}</p>` : ''}
        ${c.ouverte ? `<button type="button" class="link-btn" data-refaire="${c.cle}">changer</button>` : ''}` : ''}
      ${c.ouverte ? `
      <form class="ry-form" data-form="${c.cle}"${c.faite ? ' hidden' : ''}>
        <input type="url" data-url placeholder="adresse YouTube du récap"
          value="${esc(c.faite ? c.faite.url : '')}" required>
        <textarea data-note rows="1" maxlength="1000"
          placeholder="en un mot…">${esc(c.faite ? c.faite.note : '')}</textarea>
        <button type="submit" class="primary">${c.faite ? 'Mettre à jour' : 'Déposer'}</button>
        <p class="form-error" data-err></p>
      </form>` : `
      <p class="ry-fenetre">se dépose ${esc(c.jour)} · le ${esc(c.prochaine.libelle)}</p>`}
      ${c.histoire.length ? `<div class="ry-histoire">${c.histoire.map((h) => `
        <a href="${esc(safeUrl(h.url))}" target="_blank" rel="noopener">${esc(h.periode)}</a>`).join('')}</div>` : ''}
    </section>`;

  app.innerHTML = `
    <h1>Vidéographie</h1>
    <div class="rythme">${data.cadences.map(carte).join('')}</div>`;

  app.querySelectorAll('[data-refaire]').forEach((b) => {
    b.onclick = () => {
      const f = app.querySelector(`[data-form="${b.dataset.refaire}"]`);
      if (f) { f.hidden = false; f.querySelector('[data-url]').focus(); }
    };
  });
  app.querySelectorAll('.ry-form').forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = f.querySelector('[data-err]');
      err.textContent = '';
      try {
        await api('/api/videographie/recap', {
          method: 'PUT',
          body: {
            cadence: f.dataset.form,
            url: f.querySelector('[data-url]').value,
            note: f.querySelector('[data-note]').value,
          },
        });
        vueRythme();
      } catch (e2) { err.textContent = e2.message; }
    };
  });
}

// Le nom court d'une branche, pour les chips de nourriture.
function brancheEtiquette(b) {
  const texte = (b.body || '').trim() || (b.url ? 'vidéo' : 'branche');
  return texte.length > 42 ? texte.slice(0, 40) + '…' : texte;
}

// Les branches s'emboîtent : on dessine l'arbre en profondeur. Les
// nourritures (les autres passés d'une branche) s'affichent en chips qui
// mènent à leur source : dans cet arbre, ou dans une autre réflexion.
/* Une pensée. Quand elle a été dite, sa VIDÉO est son contenu : le texte qui
   s'écrit au moment où on le dit. Dessous, repliée, son émergence : l'audio
   d'origine, et le texte que la vidéo dessine — corriger ce texte, c'est
   refaire la vidéo. Une pensée écrite au clavier reste un paragraphe.

   Les réponses que des As avaient déposées du temps où un carré lisait les
   branches restent affichées, avec leur libellé et leur auteur.           */
function brancheHtml(b, enfants, kind, editable, ctx) {
  const vocal = ctx.vocaux.get(b.id);
  const auteurId = b.auteur_id == null ? ctx.porteur : b.auteur_id;
  const mienne = auteurId === ctx.moi;
  const rep = b.reponse ? (ctx.reponses.find((r) => r.cle === b.reponse) || null) : null;

  let contenu;
  if (kind === 'video' || b.url) {
    contenu = `<div class="branche-video">${videoEmbed(b.url)}${b.body ? `<p>${esc(b.body)}</p>` : ''}</div>`;
  } else if (vocal) {
    contenu = `
    <div class="pensee-scene"><span class="branche-video-zone" data-video-zone="${b.id}"></span></div>
    <details class="emergence">
      <summary>L’émergence — l’audio, et le texte de la vidéo</summary>
      <div class="emergence-corps">
        <button type="button" class="link-btn" data-joue="${b.id}">Réécouter l’audio</button>
        <div class="vocal-dit" hidden></div>
        ${editable && mienne ? `
        <textarea class="emergence-texte" data-texte="${b.id}" maxlength="2000" rows="3">${esc(b.body)}</textarea>
        <div class="emergence-pied">
          <button type="button" class="link-btn" data-remonte="${b.id}">Corriger le texte, refaire la vidéo</button>
          <span class="form-error" data-etat="${b.id}"></span>
        </div>` : `<p class="branche-texte">${esc(b.body)}</p>`}
      </div>
    </details>`;
  } else {
    contenu = `<p class="branche-texte">${esc(b.body)}</p>`;
  }

  const sources = (ctx.sourcesDe.get(b.id) || []).map((l) => {
    const ici = l.source_tree_id === ctx.arbreId;
    const etiquette = brancheEtiquette({ body: l.source_body, url: l.source_url });
    const saut = ici
      ? `<button type="button" class="nourrie-va" data-va="${l.source_id}">⇠ ${esc(etiquette)}</button>`
      : `<a class="nourrie-va" href="/reflexion/${l.source_tree_id}#b${l.source_id}" data-link>⇠ ${esc(l.source_tree_title)} · ${esc(etiquette)}</a>`;
    return `<span class="nourrie-chip${ici ? '' : ' nourrie-ailleurs'}">${saut}${editable && mienne
      ? `<button type="button" class="nourrie-oublie" data-oublie="${b.id}:${l.source_id}" aria-label="Détacher">✕</button>` : ''}</span>`;
  }).join('');

  // ce qu'on peut faire ici : prolonger sa pensée, la nourrir, la retirer
  const actions = [];
  if (editable) {
    actions.push(`<button type="button" class="link-btn" data-pousse="${b.id}">prolonger</button>`);
    if (mienne) actions.push(`<button type="button" class="link-btn" data-nourrit="${b.id}">⇠ nourrie par…</button>`);
    actions.push(`<button type="button" class="link-btn danger" data-coupe="${b.id}">retirer</button>`);
  }

  return `<div class="branche${rep ? ` branche--reponse branche--${esc(b.reponse)}` : ''}${vocal ? ' branche--video' : ''}"
      data-branche="${b.id}" data-auteur="${auteurId}">
    ${rep ? `<p class="reponse-tag"><span class="reponse-quoi">${esc(rep.label)}</span>${
      b.auteur ? ` <span class="reponse-qui">${esc(b.auteur)}</span>` : ''}</p>` : ''}
    ${contenu}
    ${sources ? `<div class="branche-nourritures">${sources}</div>` : ''}
    ${actions.length ? `<div class="branche-actions">${actions.join('')}</div>` : ''}
    <div class="branche-enfants">${(enfants.get(b.id) || []).map((e) => brancheHtml(e, enfants, kind, editable, ctx)).join('')}</div>
  </div>`;
}

function videoEmbed(url) {
  const id = youtubeEmbedId(url || '');
  if (!id) return `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(url)}</a>`;
  return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${esc(id)}"
    title="Vidéo" loading="lazy" allowfullscreen
    allow="accelerometer; encrypted-media; picture-in-picture"></iframe></div>`;
}

/* ------------------------------------------------------------- le vocal ---
   Une pensée vient rarement au moment où l'on a un clavier. On la dit, elle
   est transcrite, et le texte devient la branche : l'arborescence se fait
   donc à la voix. L'audio reste attaché avec son minutage, ce qui permet de
   rejouer la pensée en faisant apparaître le texte au fur et à mesure, et
   d'en tirer une vidéo qu'on peut publier.                                */

const VOCAL_MAX_S = 180;

function vocalDisponible() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

/* ------------------------------------------------- la chaîne de la voix ---
   Un micro rend un signal brut : trop de grave, pas assez de présence, un
   niveau qui va et vient. Une voix de podcast, c'est le même signal passé
   dans quatre gestes simples — couper ce qui gronde sous la voix, dégonfler
   la boue, ouvrir la présence là où les consonnes se jouent, et tenir le
   niveau. On les applique À L'ENREGISTREMENT : ce qui est gardé et ce qui
   part à la transcription sont donc déjà propres.

   Les fréquences ne sont pas les mêmes d'une voix à l'autre : le réglage
   s'accorde à la fondamentale de la personne, mesurée une fois (voir plus
   bas), et vit sur son compte.                                            */

const VOIX_DEFAUT = { f0: 120, coupe: 85, corps: 0, presence: 3, presenceHz: 3000, gain: 4 };

function reglageVoix() {
  const v = (state.user && state.user.voix) || null;
  return { ...VOIX_DEFAUT, ...(v || {}) };
}

/* Ce que l'on demande au micro : le signal BRUT. La suppression de bruit et
   le gain automatique du navigateur donnent cette voix « sous l'eau » qui
   ruine tous les enregistrements web : on les coupe, et la chaîne ci-dessous
   fait le travail proprement, accordée au timbre de la personne.
   `voiceIsolation` (l'isolation de voix du système, quand l'appareil sait la
   faire) est demandée en plus ; un navigateur qui ne la connaît pas
   l'ignore, sans erreur. */
const CONTRAINTES_MICRO = {
  audio: {
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    voiceIsolation: true,
  },
};

/* La chaîne, montée sur un contexte audio et rendue sous forme de flux prêt à
   enregistrer. Chaque étage a une raison :
     - passe-haut : le grondement, les plosives, la table qui vibre ;
     - creux bas-médium : la « boue » qui rend une voix sourde ;
     - cloche de présence : l'intelligibilité, donc aussi la transcription ;
     - compresseur : les écarts de distance au micro ;
     - gain : remonter au niveau d'écoute ;
     - limiteur : ne jamais saturer, quoi qu'il arrive.                    */
function chaineVoix(ctx, source, reglage) {
  const r = { ...VOIX_DEFAUT, ...(reglage || {}) };
  const coupe = ctx.createBiquadFilter();
  coupe.type = 'highpass';
  // sous la fondamentale, il n'y a plus de voix : seulement du bruit
  coupe.frequency.value = Math.min(180, Math.max(50, r.coupe));
  coupe.Q.value = 0.7;

  const boue = ctx.createBiquadFilter();
  boue.type = 'peaking';
  boue.frequency.value = Math.max(180, r.f0 * 2.2);
  boue.Q.value = 1;
  boue.gain.value = r.corps - 2.5;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = r.presenceHz;
  presence.Q.value = 0.9;
  presence.gain.value = r.presence;

  const air = ctx.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 7500;
  air.gain.value = 1.5;

  // sur un signal brut (sans le gain automatique du navigateur), c'est lui
  // qui tient la voix : genou large, ratio doux, attaque courte
  const compresseur = ctx.createDynamicsCompressor();
  compresseur.threshold.value = -28;
  compresseur.knee.value = 30;
  compresseur.ratio.value = 3;
  compresseur.attack.value = 0.003;
  compresseur.release.value = 0.25;

  const gain = ctx.createGain();
  gain.gain.value = Math.pow(10, r.gain / 20);

  const limiteur = ctx.createDynamicsCompressor();
  limiteur.threshold.value = -2;
  limiteur.knee.value = 0;
  limiteur.ratio.value = 20;
  limiteur.attack.value = 0.001;
  limiteur.release.value = 0.06;

  source.connect(coupe).connect(boue).connect(presence).connect(air)
    .connect(compresseur).connect(gain).connect(limiteur);
  return limiteur;
}

/* Mesurer une voix. On écoute trois secondes, on cherche la fondamentale par
   autocorrélation (la période qui se ressemble le plus d'un instant à
   l'autre) et le centre de gravité du spectre. De là se déduisent la coupure,
   la cloche de présence et le gain qui conviennent à CETTE voix.          */
function mesureVoix(buffer) {
  const données = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const fenetre = Math.min(2048, données.length);
  const minP = Math.floor(sr / 400);   // 400 Hz
  const maxP = Math.floor(sr / 60);    // 60 Hz
  const f0s = [];
  let sommeCarres = 0;
  // on parcourt le milieu de l'échantillon, là où la voix est installée
  for (let debut = Math.floor(données.length * 0.15);
    debut + fenetre + maxP < données.length;
    debut += fenetre) {
    let energie = 0;
    for (let i = 0; i < fenetre; i++) energie += données[debut + i] * données[debut + i];
    energie = Math.sqrt(energie / fenetre);
    sommeCarres += energie;
    if (energie < 0.012) continue;     // du silence : rien à mesurer
    let meilleur = 0;
    let meilleurP = 0;
    for (let p = minP; p <= maxP; p++) {
      let somme = 0;
      for (let i = 0; i < fenetre; i++) somme += données[debut + i] * données[debut + i + p];
      if (somme > meilleur) { meilleur = somme; meilleurP = p; }
    }
    if (meilleurP) f0s.push(sr / meilleurP);
  }
  if (!f0s.length) return null;
  f0s.sort((a, b) => a - b);
  const f0 = f0s[Math.floor(f0s.length / 2)];
  const niveau = sommeCarres / Math.max(1, Math.floor(données.length / fenetre));

  // une voix grave veut une coupure basse et une présence plus haute ; une
  // voix claire, l'inverse. Et un enregistrement faible veut plus de gain.
  return {
    f0: Math.round(f0),
    coupe: Math.round(Math.min(160, Math.max(55, f0 * 0.72))),
    corps: f0 < 110 ? -1 : 1,
    presence: f0 < 110 ? 4 : 2.5,
    presenceHz: Math.round(f0 < 110 ? 2600 : 3400),
    // sans gain automatique du navigateur, le niveau d'entrée est plus bas :
    // la mesure a le droit de remonter plus fort
    gain: Math.round(Math.min(18, Math.max(0, 20 * Math.log10(0.06 / Math.max(0.003, niveau))))),
  };
}

function blobEnDataUrl(blob) {
  return new Promise((ok, ko) => {
    const l = new FileReader();
    l.onload = () => ok(l.result);
    l.onerror = ko;
    l.readAsDataURL(blob);
  });
}

/* L'enregistreur du formulaire. Il tient un seul vocal à la fois : celui
   qu'on vient de dire. Le signal passe par la chaîne de voix AVANT d'être
   encodé — ce qui est gardé, ce qui est transcrit et ce qui deviendra une
   vidéo sont donc le même son, déjà propre.                               */
function faitEnregistreur(zone, surTexte) {
  let rec = null;
  let flux = null;
  let ctxAudio = null;
  let debut = 0;
  let minuterie = null;
  let dernier = null;   // { data, duree, mots }

  const dis = (html) => { zone.innerHTML = html; };
  const etatRepos = () => dis(`
    <button type="button" class="bouton-doux" data-vocal-start>Dire ma pensée</button>
    ${dernier ? '<span class="vocal-pret">vocal prêt · il part avec la pensée</span>'
      + '<button type="button" class="link-btn danger" data-vocal-oublie>oublier</button>' : ''}`);

  const arrete = () => {
    clearInterval(minuterie);
    if (rec && rec.state !== 'inactive') rec.stop();
    if (flux) flux.getTracks().forEach((t) => t.stop());
    flux = null;
  };

  /* La voix se règle toute seule : chaque enregistrement est mesuré en
     silence (fondamentale, niveau) et le réglage vit sur le compte — le
     suivant s'y accorde. Personne n'a de bouton à connaître. */
  const regle = async (blob) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      const mesure = mesureVoix(buffer);
      ctx.close();
      if (!mesure) return;
      const r = await api('/api/voix', { method: 'PUT', body: mesure });
      if (state.user) state.user.voix = r.voix;
    } catch { /* une mesure manquée n'empêche rien */ }
  };

  const enregistre = async () => {
    try {
      WCPlayer.beforeRecording(); flux = await navigator.mediaDevices.getUserMedia(CONTRAINTES_MICRO); }
    catch {
      dis('<span class="vocal-err">Le micro est refusé. Écris ta pensée, le vocal peut attendre.</span>');
      return;
    }
    ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctxAudio.createMediaStreamSource(flux);
    const sortie = ctxAudio.createMediaStreamDestination();
    chaineVoix(ctxAudio, source, reglageVoix()).connect(sortie);

    const morceaux = [];
    // un débit confortable : la voix passe, le poids reste tenable
    let options = {};
    try {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 };
      }
    } catch { options = {}; }
    rec = new MediaRecorder(sortie.stream, options);
    rec.ondataavailable = (ev) => { if (ev.data.size) morceaux.push(ev.data); };
    rec.onstop = async () => {
      const duree = (Date.now() - debut) / 1000;
      const blob = new Blob(morceaux, { type: rec.mimeType || 'audio/webm' });
      if (ctxAudio) { ctxAudio.close(); ctxAudio = null; }

      dis('<span class="vocal-attente">Transcription…</span>');
      const data = await blobEnDataUrl(blob);
      // la mesure part en fond : le prochain enregistrement en profitera
      regle(blob);
      try {
        const r = await api('/api/vocal/transcription', { method: 'POST', body: { data, duree } });
        dernier = { data, duree, mots: r.mots || [] };
        surTexte(r.texte || '');
      } catch (err) {
        // la transcription peut manquer ; le vocal, lui, est bien là — et le
        // texte s'écrit alors à la main, dans le champ qu'on vient d'ouvrir
        dernier = { data, duree, mots: [] };
        surTexte('');
        dis(`<span class="vocal-err">${esc(err.message)}</span>`);
        setTimeout(etatRepos, 2500);
        return;
      }
      etatRepos();
    };
    debut = Date.now();
    rec.start();
    dis(`<button type="button" class="bouton-doux danger" data-vocal-stop>Arrêter</button>
         <span class="vocal-compte" id="vocal-compte">0:00</span>`);
    minuterie = setInterval(() => {
      const s = Math.floor((Date.now() - debut) / 1000);
      const el = document.getElementById('vocal-compte');
      if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= VOCAL_MAX_S) arrete();
    }, 500);
  };

  zone.addEventListener('click', (e) => {
    if (e.target.closest('[data-vocal-oublie]')) { dernier = null; etatRepos(); return; }
    if (e.target.closest('[data-vocal-stop]')) { arrete(); return; }
    if (e.target.closest('[data-vocal-start]')) enregistre();
  });

  etatRepos();
  return {
    prend: () => { const d = dernier; dernier = null; etatRepos(); return d; },
    ferme: arrete,
  };
}

// Rejouer une pensée : le texte apparaît au fur et à mesure qu'elle se dit.
function joueVocal(brancheId, mots, zone, bouton) {
  const audio = new Audio(`/api/branches/${brancheId}/vocal`);
  WCPlayer.watchMedia(audio);
  zone.hidden = false;
  zone.innerHTML = mots.map((w) => `<span data-t="${w.d}">${esc(w.m)}</span>`).join(' ');
  const spans = [...zone.querySelectorAll('span')];
  const peint = () => {
    const t = audio.currentTime;
    for (const s of spans) s.classList.toggle('dit', Number(s.dataset.t) <= t);
    if (!audio.paused && !audio.ended) requestAnimationFrame(peint);
  };
  audio.onplay = () => { bouton.textContent = 'Arrêter'; requestAnimationFrame(peint); };
  const fin = () => { bouton.textContent = 'Rejouer'; for (const s of spans) s.classList.add('dit'); };
  audio.onended = fin;
  audio.onerror = () => { zone.innerHTML = '<span class="vocal-err">Le vocal ne se charge pas.</span>'; fin(); };
  audio.play().catch(fin);
  return audio;
}

/* ------------------------------------------------------------ la vidéo ---
   Le même texte qui apparaît au fur et à mesure, mais dessiné sur une toile
   et enregistré avec le son. Elle ne se demande plus : elle se fabrique
   d'elle-même dès qu'une pensée dite est déposée, sans bruit (le son ne passe
   pas par les haut-parleurs pendant la fabrication) et sans rien bloquer.

   Le fichier est gardé dans le navigateur : il ne pèse donc rien sur la base,
   et il est là quand on revient.                                          */

function mimeVideo() {
  for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function videoPossible() {
  return !!(mimeVideo() && HTMLCanvasElement.prototype.captureStream && window.indexedDB);
}

function ouvreStock() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('whitecadae-videos', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('v')) r.result.createObjectStore('v'); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function rangeVideo(id, blob) {
  try {
    const db = await ouvreStock();
    await new Promise((ok, ko) => {
      const t = db.transaction('v', 'readwrite');
      t.objectStore('v').put(blob, String(id));
      t.oncomplete = ok; t.onerror = () => ko(t.error);
    });
    db.close();
  } catch { /* le navigateur refuse de garder : la vidéo se refera */ }
}

async function prendVideo(id) {
  try {
    const db = await ouvreStock();
    const blob = await new Promise((ok, ko) => {
      const t = db.transaction('v', 'readonly');
      const q = t.objectStore('v').get(String(id));
      q.onsuccess = () => ok(q.result || null);
      q.onerror = () => ko(q.error);
    });
    db.close();
    return blob;
  } catch { return null; }
}

// Oublier une vidéo fabriquée : quand son texte change, elle se refait.
async function oublieVideo(id) {
  try {
    const db = await ouvreStock();
    await new Promise((ok, ko) => {
      const t = db.transaction('v', 'readwrite');
      t.objectStore('v').delete(String(id));
      t.oncomplete = ok; t.onerror = () => ko(t.error);
    });
    db.close();
  } catch { /* rien en stock : rien à oublier */ }
}

/* Réaligner un texte corrigé sur le minutage d'origine. Même nombre de mots :
   chacun garde exactement le sien. Sinon, la durée totale ne bouge pas et
   chaque mot nouveau reçoit sa part du temps, au prorata de sa longueur —
   la vidéo reste synchrone avec l'audio, à peu de chose près.             */
function remapMots(texte, anciens, duree) {
  const mots = texte.split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  if (anciens.length === mots.length) {
    return mots.map((m, i) => ({ m, d: anciens[i].d, f: anciens[i].f }));
  }
  const total = anciens.length ? (anciens[anciens.length - 1].f || duree || 1) : (duree || 1);
  const poids = mots.map((m) => m.length + 1);
  const somme = poids.reduce((a, b) => a + b, 0);
  let cumul = 0;
  return mots.map((m, i) => {
    const d = (total * cumul) / somme;
    cumul += poids[i];
    return { m, d: +d.toFixed(3), f: +((total * cumul) / somme).toFixed(3) };
  });
}

// Le rendu d'une image : le texte dit jusqu'ici, le mot en cours détaché.
function dessineVideo(g, mots, t, contexte) {
  g.fillStyle = '#101014';
  g.fillRect(0, 0, 1280, 720);

  g.font = 'italic 26px Georgia, serif';
  g.fillStyle = '#8a8a94';
  g.fillText(contexte.sous || '', 90, 78);
  g.font = '30px Georgia, serif';
  g.fillStyle = '#d8c07a';
  g.fillText(contexte.titre || '', 90, 118);

  g.font = '38px Georgia, serif';
  const lignes = [];
  let ligne = [];
  for (const mot of mots) {
    if (mot.d > t) break;
    const essai = [...ligne, mot];
    if (g.measureText(essai.map((m) => m.m).join(' ')).width > 1090) { lignes.push(ligne); ligne = [mot]; }
    else ligne = essai;
  }
  if (ligne.length) lignes.push(ligne);
  const visibles = lignes.slice(-9);
  visibles.forEach((l, i) => {
    let x = 90;
    const y = 210 + i * 54;
    for (const mot of l) {
      const encours = mot.d <= t && mot.f > t;
      g.fillStyle = encours ? '#f4ecd6' : '#d5d2cb';
      g.fillText(mot.m, x, y);
      x += g.measureText(mot.m + ' ').width;
    }
  });

  // la barre du temps, et la signature
  const total = mots.length ? mots[mots.length - 1].f : 1;
  g.fillStyle = '#26262e';
  g.fillRect(90, 640, 1100, 4);
  g.fillStyle = '#d8c07a';
  g.fillRect(90, 640, 1100 * Math.min(1, t / Math.max(0.001, total)), 4);
  g.font = '20px Georgia, serif';
  g.fillStyle = '#6f6f79';
  g.fillText(`White Cadae · ${contexte.auteur || ''}`, 90, 682);
}

/* La fabrication. Elle dure le temps de la pensée : c'est le prix d'un
   enregistrement fait par le navigateur lui-même. Elle est donc silencieuse
   et rendue en fond, pendant qu'on continue à écrire.                     */
async function fabriqueVideo(brancheId, mots, contexte, surEtat) {
  const type = mimeVideo();
  if (!type || !HTMLCanvasElement.prototype.captureStream) throw new Error('navigateur');
  const audio = new Audio(`/api/branches/${brancheId}/vocal`);
  audio.preload = 'auto';
  await new Promise((ok, ko) => { audio.oncanplaythrough = ok; audio.onerror = ko; audio.load(); });

  const ctxA = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctxA.createMediaElementSource(audio);
  const sortie = ctxA.createMediaStreamDestination();
  // on ne branche PAS les haut-parleurs : la fabrication est muette
  source.connect(sortie);

  const toile = document.createElement('canvas');
  toile.width = 1280; toile.height = 720;
  const g = toile.getContext('2d');
  const flux = toile.captureStream(30);
  for (const piste of sortie.stream.getAudioTracks()) flux.addTrack(piste);

  const rec = new MediaRecorder(flux, { mimeType: type });
  const bouts = [];
  rec.ondataavailable = (e) => { if (e.data.size) bouts.push(e.data); };
  const fini = new Promise((r) => { rec.onstop = r; });

  let court = true;
  const total = mots.length ? mots[mots.length - 1].f : (audio.duration || 1);
  const peint = () => {
    dessineVideo(g, mots, audio.currentTime, contexte);
    if (surEtat) surEtat(Math.min(1, audio.currentTime / Math.max(0.001, total)));
    if (court) requestAnimationFrame(peint);
  };

  rec.start();
  await audio.play();
  requestAnimationFrame(peint);
  await new Promise((r) => { audio.onended = r; });
  court = false;
  dessineVideo(g, mots, total + 1, contexte);
  await new Promise((r) => setTimeout(r, 400));
  rec.stop();
  await fini;
  ctxA.close();
  return new Blob(bouts, { type: 'video/webm' });
}

/* La fabrication automatique : aucune vidéo ne se demande. Celle d'une pensée
   qu'on vient de dire se lance au dépôt ; celles qui manquent (autre
   navigateur, cache vidé) se refont d'elles-mêmes à l'ouverture de la page.
   Une à la fois : la fabrication dure le temps de la pensée, la file évite
   de tout jouer en même temps.                                            */
let fileVideos = Promise.resolve();
function metEnFileVideo(brancheId, mots, contexte, zone) {
  fileVideos = fileVideos
    .then(() => videoAutomatique(brancheId, mots, contexte, zone))
    .catch(() => {});
}

const videoRetentee = new Set();
async function videoAutomatique(brancheId, mots, contexte, zone) {
  if (!videoPossible() || !mots.length) return;
  if (await prendVideo(brancheId)) { montreVideo(brancheId, zone); return; }
  if (zone) zone.innerHTML = '<span class="video-etat">vidéo en préparation…</span>';
  const releaseMedia = await WCPlayer.reserveAutomaticMedia();
  try {
    const blob = await fabriqueVideo(brancheId, mots, contexte, (p) => {
      if (zone) zone.innerHTML = `<span class="video-etat">vidéo en préparation… ${Math.round(p * 100)} %</span>`;
    });
    await rangeVideo(brancheId, blob);
    montreVideo(brancheId, zone);
  } catch {
    /* Le plus souvent : le navigateur refuse de jouer un son sans un geste de
       la personne (règle d'autoplay). On réessaie au premier toucher, une
       seule fois, sans rien afficher ni demander. */
    if (zone) zone.innerHTML = '';
    if (videoRetentee.has(brancheId)) return;
    videoRetentee.add(brancheId);
    document.addEventListener('pointerdown', () => {
      metEnFileVideo(brancheId, mots, contexte,
        document.querySelector(`[data-video-zone="${brancheId}"]`));
    }, { once: true });
  } finally {
    releaseMedia();
  }
}

/* La vidéo se regarde EN PLACE : revenir dans ses pensées, c'est revoir le
   fil conducteur — le texte qui apparaît au moment où on le dit. Pas de
   téléchargement, pas de bouton : un lecteur, dans la pensée même.

   Et l'arborescence se parcourt de vidéo en vidéo : quand une vidéo se
   termine, la pensée dite suivante (dans l'ordre de l'arbre) se propose. */
const videoSuite = new Map(); // pensée -> la pensée dite qui la suit

async function montreVideo(brancheId, zone) {
  if (!zone) return;
  const blob = await prendVideo(brancheId);
  if (!blob) { zone.innerHTML = ''; return; }
  const url = URL.createObjectURL(blob);
  zone.innerHTML = `<video class="pensee-video" controls preload="metadata" src="${url}"></video>`;
  const suite = videoSuite.get(+brancheId);
  if (suite == null) return;
  zone.querySelector('video').onended = () => {
    if (zone.querySelector('.video-suite')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'video-suite';
    b.textContent = '▸ la pensée suivante';
    b.onclick = () => {
      b.remove();
      const el = document.querySelector(`[data-branche="${suite}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const v = el.querySelector(`[data-video-zone="${suite}"] video`);
      if (v) v.play().catch(() => {});
    };
    zone.appendChild(b);
  };
}

// Une réflexion se lit par le même chemin où qu'elle vive : /reflexion/:id.
// Son contexte lui vient du serveur, pas de l'URL : sa nature, son axe, son
// carré, et ce que le lecteur a le droit d'y faire.
async function pageArbre(id) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api(`/api/arbres/${id}`); }
  catch { app.innerHTML='<h1>Page indisponible</h1><p><a href="/videographie" data-link>Retour à Vidéographie</a></p>';return; }
  if (stale(epoch)) return;
  retientQuetes(data.arbre);
  const arbre = data.arbre;
  const kind = arbre.kind;
  const def = ARBRES_PAGES[kind];
  const editable = arbre.editable;

  const enfants = new Map();
  const parId = new Map();
  for (const b of arbre.branches) {
    parId.set(b.id, b);
    const cle = b.parent_id || 0;
    if (!enfants.has(cle)) enfants.set(cle, []);
    enfants.get(cle).push(b);
  }
  // chaque présent est le futur de plusieurs passés : les nourritures
  const sourcesDe = new Map();
  for (const l of arbre.liens || []) {
    if (!sourcesDe.has(l.branch_id)) sourcesDe.set(l.branch_id, []);
    sourcesDe.get(l.branch_id).push(l);
  }
  // les vocaux : leur minutage, pour rejouer la pensée telle qu'elle est venue
  const vocaux = new Map((arbre.vocaux || []).map((v) => [v.branch_id, v]));
  const ctx = {
    parId, sourcesDe, vocaux, arbreId: arbre.id,
    moi: arbre.moi, porteur: arbre.user_id,
    reponses: arbre.reponses || [],
    proprietaire: !!arbre.proprietaire,
  };

  /* De vidéo en vidéo : l'ordre de lecture des pensées dites, en profondeur
     — une pensée, puis ce qu'elle a fait naître. Quand une vidéo finit, la
     suivante de ce fil se propose. */
  videoSuite.clear();
  {
    const fil = [];
    const descend = (liste) => {
      for (const b of liste || []) {
        if (vocaux.has(b.id)) fil.push(b.id);
        descend(enfants.get(b.id));
      }
    };
    descend(enfants.get(0));
    for (let i = 0; i < fil.length - 1; i++) videoSuite.set(fil[i], fil[i + 1]);
  }

  // le fil d'ariane : la plateforme, puis l'espace et les catégories d'où
  // l'on descend
  const retour = { chemin: def.chemin, titre: def.titre };
  const ariane = [
    `<a href="${retour.chemin}" data-link>${esc(retour.titre)}</a>`,
    ...(arbre.chemin || []).map((c) => `<a href="/reflexion/${c.id}" data-link>${esc(c.title)}</a>`),
  ].join('<span class="fil-sep">›</span>');

  // les voix de l'arbre : du temps des réponses d'As, un arbre pouvait
  // porter plusieurs voix. On les démêle encore, tant qu'il y en a.
  const auteurs = [];
  const vusAuteurs = new Set();
  for (const b of arbre.branches) {
    const id = b.auteur_id == null ? arbre.user_id : b.auteur_id;
    if (vusAuteurs.has(id)) continue;
    vusAuteurs.add(id);
    auteurs.push({ id, nom: id === arbre.moi ? 'Moi' : (b.auteur || 'un As') });
  }

  const titre = arbre.title;

  /* Ce que l'arbre range : ses catégories et ses réflexions, et de quoi en
     créer sur place — dans l'espace même, ou dans n'importe laquelle de ses
     catégories. C'est le seul endroit où une réflexion naît. */
  const estDossier = arbre.axe || arbre.genre === 'categorie';
  const dedans = arbre.dedans || [];

  /* Créer ici : une réflexion, ou une catégorie. Deux gestes différents, donc
     deux onglets qui s'allument — on doit voir, sans le lire, dans lequel on
     est : l'onglet choisi reste allumé, le formulaire redit ce qu'on est en
     train de faire et où, et le bouton porte le nom du geste. */
  const boutonsQuete = (attribut, choisie) => QUETES.map((q) => `
    <button type="button" class="quete-btn${choisie === q.cle ? ' actif' : ''}"
            ${attribut}="${q.cle}" aria-pressed="${choisie === q.cle}">
      <span class="quete-btn-titre">${esc(q.titre)}</span>
      <span class="quete-btn-sous">${esc(q.sous)}</span>
    </button>`).join('');

  const rangees = estDossier ? `
    <section class="dedans">
      ${dedans.length ? `<div class="foret dedans-liste">
        ${dedans.map((x) => `
        <a class="arbre-card${x.genre === 'categorie' ? ' arbre-card--categorie' : ''}" href="/reflexion/${x.id}" data-link>
          <h2>${esc(x.title)}</h2>
          ${x.trunk ? `<p class="arbre-tronc-apercu">${esc(x.trunk)}</p>` : ''}
          <span class="arbre-meta">${x.genre === 'categorie'
            ? `catégorie · ${x.contenus} réflexion${x.contenus > 1 ? 's' : ''}`
            : `${x.branches} pensée${x.branches > 1 ? 's' : ''}`}</span>
          ${x.genre === 'categorie' ? '' : queteChip(x.quete)}
        </a>`).join('')}
      </div>` : ''}
      ${arbre.proprietaire ? `
      <div class="cree">
        <div class="dedans-crees" role="group" aria-label="Créer ici">
          <button type="button" class="cree-onglet" data-cree="reflexion" aria-pressed="false">
            Ouvrir une réflexion ici</button>
          <button type="button" class="cree-onglet" data-cree="categorie" aria-pressed="false">
            Créer une catégorie</button>
        </div>
        <form id="cree-form" class="arbre-form cree-form" hidden>
          <p class="cree-ou">Dans <strong>${esc(arbre.title)}</strong></p>
          <h3 class="cree-quoi" id="cree-quoi"></h3>
          <p class="cree-aide" id="cree-aide"></p>
          <div class="quete-choix" id="cree-quete" role="group"
               aria-label="Ce que cette réflexion va creuser">
            <span class="quete-legende">Cette réflexion va creuser…</span>
            <div class="quete-boutons">${boutonsQuete('data-quete', null)}</div>
          </div>
          <input id="cree-titre" maxlength="120" required>
          <div class="cree-foot">
            <button type="submit" class="primary" id="cree-ok">Créer</button>
            <button type="button" class="link-btn" id="cree-annule">Annuler</button>
          </div>
          <p class="form-error" id="cree-err"></p>
        </form>
      </div>` : ''}
    </section>` : '';

  /* Ce que creuse cette réflexion : la cause, ou le remède. Il se dit en tête
     de page, et se corrige d'un toucher — une réflexion peut avoir été
     ouverte du mauvais côté. Ni un espace ni une catégorie n'en portent :
     ils rangent, ils ne creusent pas. */
  const bandeauQuete = estDossier ? '' : (arbre.proprietaire ? `
    <div class="quete-choix quete-choix--page" id="quete-page" role="group"
         aria-label="Ce que cette réflexion creuse">
      <span class="quete-legende">Cette réflexion creuse…</span>
      <div class="quete-boutons">${boutonsQuete('data-quete-page', arbre.quete)}</div>
      <span class="quete-etat" id="quete-etat"></span>
    </div>` : (arbre.quete ? `<p class="quete-bandeau">${queteChip(arbre.quete)}</p>` : ''));

  /* La carte de l'espace : sa propre visualisation — ses catégories, ses
     réflexions, et les nourritures qui les relient. On y voit la trajectoire
     de ses pensées dans CETTE branche. */
  let carteEspace = '';
  let dessineEspace = null;
  if (arbre.axe && arbre.proprietaire) {
    try {
      const tout = await api(`/api/arbres?kind=${kind}`);
      const parents = new Map((tout.arbres || []).map((a) => [a.id, a.parent_id]));
      const dansEspace = (tid) => {
        let cur = tid;
        for (let g = 0; g < 20 && cur; g++) { if (cur === arbre.id) return true; cur = parents.get(cur); }
        return false;
      };
      const desc = (tout.arbres || []).filter((a) => a.parent_id && dansEspace(a.parent_id));
      if (desc.length) {
        const noeuds = [
          { id: arbre.id, titre: arbre.title, n: (arbre.branches || []).length, espace: true },
          ...desc.map((a) => ({
            id: a.id, titre: a.title, n: a.branches,
            categorie: a.genre === 'categorie', quete: a.quete || null,
          })),
        ];
        const ids = new Set(noeuds.map((x) => x.id));
        const liens = [
          ...desc.map((a) => ({ de: a.parent_id, vers: a.id, type: 'range' })),
          ...(tout.carte || []).filter((l) => ids.has(l.de) && ids.has(l.vers))
            .map((l) => ({ de: l.de, vers: l.vers, n: l.n, type: 'lien' })),
        ];
        dessineEspace = () => carteSvg(noeuds, liens);
        carteEspace = dessineEspace();
      }
    } catch { /* la carte est un plus, jamais une condition */ }
    if (stale(epoch)) return;
  }

  // la voix d'abord : on dit sa pensée, la transcription s'édite, puis on
  // dépose. Le clavier ne revient que si le navigateur ne sait pas enregistrer.
  const vocalDAbord = kind === 'pensee' && vocalDisponible();

  app.innerHTML = `
    <p class="fil-retour">${ariane}</p>
    <h1>${esc(titre)}</h1>
    ${arbre.sous ? `<p class="arbre-sous">${esc(arbre.sous)}</p>` : ''}
    ${arbre.proprietaire && kind === 'pensee' ? '<p class="arbre-partage">À toi, et à personne d’autre.</p>' : ''}
    ${arbre.miroir ? `<p class="arbre-miroir">En regard : <a href="/reflexion/${arbre.miroir.id}" data-link>${esc(arbre.miroir.title)}</a></p>` : ''}
    ${bandeauQuete}
    ${arbre.trunk ? `<p class="tronc">${esc(arbre.trunk)}</p>` : ''}
    ${carteEspace}
    ${rangees}
    <div class="liaison-bandeau" id="liaison-bandeau" hidden>
      <span>Touche la pensée <strong>qui nourrit</strong> celle-ci</span>
      <select id="liaison-arbre"><option value="">ou depuis une autre réflexion…</option></select>
      <button type="button" class="link-btn" id="liaison-annule">Annuler</button>
      <div id="liaison-sources" hidden></div>
    </div>
    ${auteurs.length > 1 ? `
    <nav class="arbre-voix">
      <button type="button" class="voix-filtre actif" data-voix="tous">Tout le monde</button>
      ${auteurs.map((a) => `<button type="button" class="voix-filtre" data-voix="${a.id}">${esc(a.nom)}</button>`).join('')}
    </nav>` : ''}
    <div class="arbre" id="arbre">
      ${(enfants.get(0) || []).map((b) => brancheHtml(b, enfants, kind, editable, ctx)).join('')
        || `<p class="empty-note">${editable ? 'Rien encore. Dis ou écris ta première pensée.'
             : 'Rien encore ici.'}</p>`}
    </div>
    ${editable ? `
    <form id="branche-form" class="branche-form">
      <input type="hidden" id="branche-parent" value="">
      <p class="branche-ou" id="branche-ou">Une pensée de plus</p>
      ${kind === 'video' ? '<input id="branche-url" type="url" placeholder="https://www.youtube.com/watch?v=…" required>' : ''}
      ${vocalDAbord ? '<div class="vocal-barre" id="vocal-barre"></div>' : ''}
      <textarea id="branche-body" maxlength="2000" rows="3"${vocalDAbord ? ' hidden' : ''}
        placeholder="${vocalDAbord ? 'Ta pensée, transcrite : corrige-la avant de déposer.'
          : kind === 'video' ? 'Quelques mots sur cette vidéo (facultatif)…' : 'Ce qui te vient…'}"></textarea>
      <div class="conv-form-foot">
        <button type="button" class="link-btn" id="branche-annule" hidden>Repartir du début</button>
        <button type="submit" class="primary" id="branche-depose"${vocalDAbord ? ' hidden' : ''}>Déposer</button>
      </div>
      <p class="form-error" id="branche-err"></p>
    </form>
    ${!arbre.axe && !dedans.length ? '<p class="arbre-suppr"><button type="button" class="link-btn danger" id="arbre-suppr">Supprimer cette réflexion</button></p>' : ''}
    ` : ''}`;

  // le saut vers une source : pour tout le monde, lecteur compris
  const vaVers = (cible) => {
    const el = document.querySelector(`[data-branche="${cible}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('branche--visee');
    setTimeout(() => el.classList.remove('branche--visee'), 1600);
  };
  // rejouer une pensée dite, et en faire une vidéo : ouvert aux lecteurs
  // aussi, un vocal se réécoute même quand on n'écrit pas dans l'arbre
  let enCours = null;
  document.getElementById('arbre').addEventListener('click', (e) => {
    const va = e.target.closest('button[data-va]');
    // en mode liaison le toucher désigne une source, il ne navigue pas
    if (va && document.getElementById('liaison-bandeau').hidden) vaVers(+va.dataset.va);

    const joue = e.target.closest('button[data-joue]');
    if (joue) {
      if (enCours) { enCours.pause(); enCours = null; }
      if (joue.textContent === 'Arrêter') { joue.textContent = 'Réécouter l’audio'; return; }
      const bid = +joue.dataset.joue;
      const zone = joue.closest('.emergence-corps, .branche-vocal').querySelector('.vocal-dit');
      enCours = joueVocal(bid, (vocaux.get(bid) || {}).mots || [], zone, joue);
    }
  });

  // ce qui habille la vidéo : de quoi on parle, et qui parle
  const contexteVideo = {
    titre: arbre.title,
    sous: kind === 'video' ? 'Vidéographie' : 'Pense Mieux',
    auteur: arbre.porteur || '',
  };
  // les vidéos déjà fabriquées reviennent ; les manquantes se refont
  // d'elles-mêmes, en fond et une à la fois
  for (const v of arbre.vocaux || []) {
    metEnFileVideo(v.branch_id, v.mots || [], contexteVideo,
      app.querySelector(`[data-video-zone="${v.branch_id}"]`));
  }
  // arrivée par une chip d'un autre arbre : la branche visée s'illumine
  if (/^#b\d+$/.test(location.hash)) setTimeout(() => vaVers(+location.hash.slice(2)), 150);

  // la carte de la branche se redresse (ou se couche) quand la place change
  if (dessineEspace) {
    carteAJour = () => {
      if (stale(epoch)) return;
      const fig = app.querySelector('.carte-pensees');
      if (fig) fig.outerHTML = dessineEspace();
    };
  }

  /* Corriger la quête d'une réflexion : un toucher, et c'est écrit. Le même
     toucher sur la quête déjà choisie la retire — une réflexion peut n'avoir
     pas encore choisi son sens. */
  const blocQuetePage = document.getElementById('quete-page');
  if (blocQuetePage) {
    const etat = document.getElementById('quete-etat');
    blocQuetePage.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-quete-page]');
      if (!b) return;
      const voulue = b.classList.contains('actif') ? null : b.dataset.quetePage;
      try {
        const r = await api(`/api/arbres/${id}`, { method: 'PUT', body: { quete: voulue } });
        arbre.quete = r.quete || null;
        blocQuetePage.querySelectorAll('[data-quete-page]').forEach((x) => {
          const sien = x.dataset.quetePage === arbre.quete;
          x.classList.toggle('actif', sien);
          x.setAttribute('aria-pressed', String(sien));
        });
        if (etat) etat.textContent = arbre.quete ? 'Enregistré.' : 'Sans quête pour l’instant.';
      } catch (err) { if (etat) etat.textContent = err.message; }
    });
  }

  /* Le filtre des voix. Une branche qui n'est pas de la voix choisie reste
     visible mais s'efface, sauf si elle ne porte rien de la voix choisie :
     l'arbre garde sa forme, on ne perd jamais le fil d'une greffe. */
  const filtres = app.querySelectorAll('[data-voix]');
  filtres.forEach((b) => {
    b.onclick = () => {
      filtres.forEach((x) => x.classList.toggle('actif', x === b));
      const voix = b.dataset.voix;
      const garde = (el) => {
        const sien = voix === 'tous' || el.dataset.auteur === voix;
        const enfants = [...el.querySelectorAll(':scope > .branche-enfants > .branche')];
        const dessous = enfants.map(garde).some(Boolean);
        el.classList.toggle('branche--autre', !sien && dessous);
        el.hidden = !sien && !dessous;
        return sien || dessous;
      };
      app.querySelectorAll('#arbre > .branche').forEach(garde);
    };
  });

  if (!editable) return;

  const parentField = document.getElementById('branche-parent');
  const ou = document.getElementById('branche-ou');
  const annule = document.getElementById('branche-annule');
  const formulaire = document.getElementById('branche-form');

  // Poser le formulaire sur une pensée, pour la prolonger.
  function viseParent(cible) {
    parentField.value = cible == null ? '' : String(cible);
    ou.textContent = cible == null ? 'Une pensée de plus' : 'Une pensée qui prolonge celle-ci';
    annule.hidden = cible == null;
    formulaire.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const champ = document.getElementById(kind === 'video' ? 'branche-url' : 'branche-body');
    if (champ) champ.focus();
  }
  // la liaison : « nourrie par… » puis un toucher sur la branche source :
  // dans cet arbre, ou dans un autre choisi au sélecteur
  let liaisonDepuis = null;
  const bandeau = document.getElementById('liaison-bandeau');
  const selArbre = document.getElementById('liaison-arbre');
  const zoneSources = document.getElementById('liaison-sources');
  const fermeLiaison = () => {
    liaisonDepuis = null; bandeau.hidden = true;
    selArbre.value = ''; zoneSources.hidden = true; zoneSources.innerHTML = '';
  };
  document.getElementById('liaison-annule').onclick = fermeLiaison;

  /* Les autres arbres où puiser, chargés à la première liaison : ses propres
     réflexions — toutes, d'où qu'elles soient rangées. Rien d'autre : Pense
     Mieux est à soi. */
  let autresArbres = null;
  const groupe = (label, arbres) => arbres.length
    ? `<optgroup label="${esc(label)}">${arbres.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</optgroup>`
    : '';
  const chargeAutres = async () => {
    if (autresArbres != null) return;
    try {
      const d = await api(`/api/arbres?kind=${kind}`);
      const mienne = [...(d.troncs || []), ...(d.arbres || [])].filter((a) => a.id !== id);
      autresArbres = mienne.length;
      selArbre.innerHTML = '<option value="">ou depuis une autre réflexion…</option>'
        + groupe('Mes réflexions', mienne);
      selArbre.hidden = mienne.length === 0;
    } catch { selArbre.hidden = true; }
  };

  selArbre.onchange = async () => {
    zoneSources.hidden = true; zoneSources.innerHTML = '';
    if (!selArbre.value) return;
    try {
      const d = await api(`/api/arbres/${selArbre.value}`);
      zoneSources.innerHTML = d.arbre.branches.length
        ? d.arbre.branches.map((b) => `<button type="button" class="liaison-source" data-source="${b.id}">
            ${esc(brancheEtiquette(b))}</button>`).join('')
        : '<p class="empty-note">Cette réflexion est encore vide.</p>';
      zoneSources.hidden = false;
    } catch { /* l'arbre a pu disparaître : le sélecteur reste */ }
  };

  zoneSources.addEventListener('click', async (e) => {
    const source = e.target.closest('[data-source]');
    if (!source || liaisonDepuis == null) return;
    const depuis = liaisonDepuis;
    fermeLiaison();
    try {
      await api(`/api/branches/${depuis}/liens`, { method: 'POST', body: { source_id: +source.dataset.source } });
      pageArbre(id);
    } catch (err) { alert(err.message); }
  });

  document.getElementById('arbre').addEventListener('click', async (e) => {
    const pousse = e.target.closest('[data-pousse]');
    const coupe = e.target.closest('[data-coupe]');
    const nourrit = e.target.closest('[data-nourrit]');
    const oublie = e.target.closest('[data-oublie]');
    const remonte = e.target.closest('[data-remonte]');
    if (liaisonDepuis != null) {
      // en mode liaison, tout toucher de branche désigne la source
      const cible = e.target.closest('[data-branche]');
      if (!cible) return;
      const sourceId = +cible.dataset.branche;
      const depuis = liaisonDepuis;
      fermeLiaison();
      if (sourceId === depuis) return;
      try {
        await api(`/api/branches/${depuis}/liens`, { method: 'POST', body: { source_id: sourceId } });
        pageArbre(id);
      } catch (err) { alert(err.message); }
      return;
    }
    if (nourrit) {
      liaisonDepuis = +nourrit.dataset.nourrit;
      bandeau.hidden = false;
      chargeAutres();
      bandeau.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (oublie) {
      const [bId, sId] = oublie.dataset.oublie.split(':');
      await api(`/api/branches/${bId}/liens/${sId}`, { method: 'DELETE' });
      pageArbre(id);
    } else if (remonte) {
      /* L'émergence : corriger le texte d'une pensée dite, c'est corriger sa
         vidéo. Le texte réaligné part sur le compte, la vidéo d'avant
         s'oublie, et la file la refabrique en repeignant la page. */
      const bid = +remonte.dataset.remonte;
      const champ = app.querySelector(`[data-texte="${bid}"]`);
      const etat = app.querySelector(`[data-etat="${bid}"]`);
      const texte = (champ ? champ.value : '').trim();
      if (!texte) { if (etat) etat.textContent = 'Le texte ne peut pas rester vide.'; return; }
      const v = vocaux.get(bid) || {};
      try {
        await api(`/api/branches/${bid}`, {
          method: 'PUT',
          body: { body: texte, mots: remapMots(texte, v.mots || [], v.duree || 0) },
        });
        await oublieVideo(bid);
        pageArbre(id);
      } catch (err) { if (etat) etat.textContent = err.message; }
    } else if (pousse) {
      viseParent(+pousse.dataset.pousse);
    } else if (coupe && confirm('Retirer cette pensée et tout ce qui s’y rattache ?')) {
      await api(`/api/branches/${coupe.dataset.coupe}`, { method: 'DELETE' });
      pageArbre(id);
    }
  });
  annule.onclick = () => viseParent(null);

  /* L'enregistreur du formulaire : LE geste de Pense Mieux. On dit sa
     pensée ; la transcription remplit le champ, qui s'ouvre pour être
     corrigé ; le dépôt n'apparaît qu'alors. L'audio part avec la pensée. */
  const barre = document.getElementById('vocal-barre');
  const enregistreur = barre ? faitEnregistreur(barre, (texte) => {
    const champ = document.getElementById('branche-body');
    champ.hidden = false;
    champ.value = champ.value ? `${champ.value} ${texte}` : texte;
    const depose = document.getElementById('branche-depose');
    if (depose) depose.hidden = false;
    champ.focus();
  }) : null;

  formulaire.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const champUrl = document.getElementById('branche-url');
      const r = await api(`/api/arbres/${id}/branches`, {
        method: 'POST',
        body: {
          parent_id: parentField.value ? +parentField.value : null,
          body: document.getElementById('branche-body').value,
          url: champUrl ? champUrl.value : '',
        },
      });
      const vocal = enregistreur ? enregistreur.prend() : null;
      if (vocal && r.id) {
        // la pensée existe déjà : si le vocal échoue, le texte reste
        try {
          await api(`/api/branches/${r.id}/vocal`, {
            method: 'POST',
            body: { data: vocal.data, duree: vocal.duree, mots: vocal.mots },
          });
          /* La vidéo se fabrique d'elle-même : on ne la demande plus. En
             repeignant la page, la file des vidéos manquantes la voit et la
             lance, en silence, pendant qu'on continue.                    */
          await pageArbre(id);
          return;
        } catch { /* la pensée est écrite, c'est l'essentiel */ }
      }
      pageArbre(id);
    } catch (err) { document.getElementById('branche-err').textContent = err.message; }
  };


  /* Créer ici : une catégorie, ou une réflexion — dans la branche même ou
     dans n'importe laquelle de ses catégories. Deux gestes qui ne se
     ressemblent pas : l'onglet touché reste allumé, le formulaire dit lequel
     est ouvert, et une réflexion ne part pas sans avoir dit ce qu'elle
     creuse. */
  const creeForm = document.getElementById('cree-form');
  if (creeForm) {
    const onglets = [...app.querySelectorAll('[data-cree]')];
    const quoi = document.getElementById('cree-quoi');
    const aide = document.getElementById('cree-aide');
    const blocQuete = document.getElementById('cree-quete');
    const valider = document.getElementById('cree-ok');
    const champ = document.getElementById('cree-titre');
    const erreur = document.getElementById('cree-err');
    const GESTES = {
      reflexion: {
        titre: 'Ouvrir une réflexion ici',
        aide: 'Un sujet à creuser : elle portera des pensées, et elle se rangera ici.',
        marque: 'Ouvrir la réflexion',
        invite: 'Sur quoi veux-tu réfléchir ?',
      },
      categorie: {
        titre: 'Créer une catégorie',
        aide: 'Un tiroir : une catégorie ne porte pas de pensées, elle range des réflexions.',
        marque: 'Créer la catégorie',
        invite: 'Le nom de la catégorie',
      },
    };
    let genreCree = null;
    let queteCree = null;

    const allume = () => {
      onglets.forEach((x) => {
        const sien = x.dataset.cree === genreCree;
        x.classList.toggle('actif', sien);
        x.setAttribute('aria-pressed', String(sien));
      });
    };
    const ferme = () => {
      genreCree = null;
      creeForm.hidden = true;
      erreur.textContent = '';
      allume();
    };
    const ouvre = (genre) => {
      genreCree = genre;
      queteCree = null;
      const g = GESTES[genre];
      creeForm.hidden = false;
      creeForm.classList.toggle('cree-form--categorie', genre === 'categorie');
      quoi.textContent = g.titre;
      aide.textContent = g.aide;
      valider.textContent = g.marque;
      champ.placeholder = g.invite;
      champ.value = '';
      erreur.textContent = '';
      blocQuete.hidden = genre !== 'reflexion';
      blocQuete.querySelectorAll('[data-quete]').forEach((x) => {
        x.classList.remove('actif');
        x.setAttribute('aria-pressed', 'false');
      });
      allume();
      champ.focus();
    };

    onglets.forEach((b) => {
      b.onclick = () => {
        // le même onglet touché deux fois referme : on n'est plus nulle part
        if (genreCree === b.dataset.cree) ferme();
        else ouvre(b.dataset.cree);
      };
    });

    blocQuete.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quete]');
      if (!b) return;
      queteCree = b.dataset.quete;
      blocQuete.querySelectorAll('[data-quete]').forEach((x) => {
        const sien = x === b;
        x.classList.toggle('actif', sien);
        x.setAttribute('aria-pressed', String(sien));
      });
      erreur.textContent = '';
    });

    document.getElementById('cree-annule').onclick = ferme;
    creeForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!genreCree) return;
      if (genreCree === 'reflexion' && !queteCree) {
        erreur.textContent = 'Dis d’abord ce que cette réflexion va creuser.';
        blocQuete.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      try {
        const x = await api('/api/arbres', {
          method: 'POST',
          body: {
            kind, title: champ.value, parent_id: arbre.id, genre: genreCree,
            quete: genreCree === 'reflexion' ? queteCree : null,
          },
        });
        if (genreCree === 'categorie') pageArbre(id);
        else navigate(`/reflexion/${x.id}`);
      } catch (err) { erreur.textContent = err.message; }
    };
  }

  // un espace n'a pas ce bouton : il ne s'abat pas
  const suppr = document.getElementById('arbre-suppr');
  if (suppr) suppr.onclick = async () => {
    if (!confirm('Supprimer cette réflexion et tout ce qu’elle contient ?')) return;
    await api(`/api/arbres/${id}`, { method: 'DELETE' });
    navigate(retour.chemin);
  };
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
  if(value==='/parcours')return value;
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
    ${isMe&&data.journey?`<section class="profile-journey"><div class="jeu-echelon"><span>Échelon</span> <strong>${jeu.echelon}</strong></div><h2>Mon champ des possibles</h2><p>${data.journey.remaining} signes visibles à trouver · ${data.journey.locked} énigmes verrouillées</p><a class="orange-button" href="/parcours" data-link>Explorer mon arborescence →</a><a class="profile-openings-link" href="/parcours?view=ouvertures" data-link>Voir les ouvertures →</a></section>`:jeuHtml(jeu)}
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
