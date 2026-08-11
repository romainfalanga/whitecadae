// WhiteCadae : application frontend (SPA vanilla)

const app = document.getElementById('app');
const nav = document.getElementById('nav');

const state = {
  user: null,
  // ce que l'échelon atteint sur la page 57 a ouvert du reste du site
  access: { interpretations: false, reprises: false },
  echelon: 1, // l'échelon du visiteur, tenu par le serveur
  song: null, // données de la page chanson en cours
  sel: null, // sélection : {type:'line'|'word'|'title'|'duration', lineId?, start?, end?}
  openComments: new Set(), // espaces commentaires ouverts, clés "kind:id"
  corpus: null, // {songs, lines} : toutes les phrases de tous les morceaux
  corpusDf: null, // fréquence documentaire des mots (moteur d'échos)
  builder: null, // constructeur d'interprétation d'ensemble en cours
  sheetOpen: false, // feuille du bas ouverte (mobile)
  songModalOpen: false, // fenêtre « l'ensemble du morceau » ouverte
  feed: null, // fil des interprétations récentes
  coverFeed: null, // fil des reprises récentes
  enigmes: null, // état des énigmes de la page /57
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

// Le battement d'une page vivante (conversation, brainstorm) : un seul à la
// fois, toujours coupé quand on quitte la page.
let pageTimer = null;
function coupePageTimer() {
  if (pageTimer) { clearInterval(pageTimer); pageTimer = null; }
}

async function route() {
  window.scrollTo(0, 0);
  closeNav();
  coupePageTimer();
  // le dock d'une application ne suit pas hors de chez elle
  document.body.classList.remove('avec-dock');
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
  // On arrive sur la plateforme par le 57 : c'est lui qui ouvre le reste.
  if (path === '/' || path === '' || path === '/57') return pageEnigmes();
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
  const cle =
    (path === '/reprises' || path === '/reprises/fil' || /^\/chanson\/[^/]+\/reprises$/.test(path)) ? 'reprises'
    : path === '/conversation' ? 'conversation'
    // un arbre se lit par son chemin canonique : sa nature vient du serveur,
    // qui refuse en 404 celui qu'on n'a pas le droit de voir
    : path.startsWith('/reflexion/') || path.startsWith('/arbre/') ? 'penseMieux'
    : path.startsWith('/pense-mieux') ? 'penseMieux'
    : path.startsWith('/videographie') ? 'videographie'
    : path.startsWith('/carre-d-as') ? 'carre'
    : path.startsWith('/brainstorm') ? 'brainstorm'
    : path === '/game-master-orange' ? 'gmo'
    : 'interpretations';
  if (!state.access[cle]) return navigate('/57', true);

  if (path === '/interpretations') return pageInterpretations();
  if (path === '/conversation') return pageConversation();
  // les quatre applications : chacune a son dock et ses vues
  if (path === '/pense-mieux') return vueForet('pensee');
  if (path === '/pense-mieux/nouveau') return vueNouvelArbre('pensee');
  if (path === '/pense-mieux/recherche') return vueRecherche('pensee');
  if (path === '/pense-mieux/multivers') return vueUnivers('pensee');
  if (path === '/pense-mieux/univers') return navigate('/pense-mieux/multivers', true);
  if ((m = path.match(/^\/pense-mieux\/(\d+)$/))) return pageArbre(+m[1]);
  if (path === '/videographie') return vueRythme();
  if (path === '/videographie/carre') return vueVideoCarre();
  if ((m = path.match(/^\/videographie\/(\d+)$/))) return pageArbre(+m[1]);
  if (path === '/carre-d-as') return vueMesCarres();
  if (path === '/carre-d-as/recrutement') return vueRecrutement();
  // l'ancien annuaire vit au salon de recrutement ; l'ancienne conversation
  // unique vit dans chaque carré
  if (path === '/carre-d-as/annuaire') return navigate('/carre-d-as/recrutement', true);
  if (path === '/carre-d-as/conversation') return navigate('/carre-d-as', true);
  if (path === '/carre-d-as/missions') return vueMissions();
  if ((m = path.match(/^\/carre-d-as\/(\d+)(?:\/(multivers|philosophie|societe|conversation))?$/))) {
    return pageCarre(+m[1], m[2] || 'multivers');
  }
  if ((m = path.match(/^\/reflexion\/(\d+)$/))) return pageArbre(+m[1]);
  // l'ancien chemin mène au même endroit : rien de ce qui a été partagé ne casse
  if ((m = path.match(/^\/arbre\/(\d+)$/))) return navigate(`/reflexion/${m[1]}`, true);
  if (path === '/brainstorm') return vueScene();
  if (path === '/brainstorm/archives') return vueArchives();
  if (path === '/brainstorm/annoncer') return vueAnnoncer();
  if ((m = path.match(/^\/brainstorm\/(\d+)$/))) return pageBrainstorm(+m[1]);
  if (path === '/game-master-orange') return pageGmo();
  if (path === '/reprises/fil') return pageCoverFeed();
  if (path === '/reprises') return pageCovers();
  if (path === '/fil') return pageFeed();
  if ((m = path.match(/^\/chanson\/([^/]+)\/reprises$/))) return pageSongCovers(decodeURIComponent(m[1]));
  if ((m = path.match(/^\/chanson\/([^/]+)$/))) return pageSong(decodeURIComponent(m[1]));
  app.innerHTML = '<h1>Page introuvable</h1><p><a href="/interpretations" data-link>Retour aux interprétations</a></p>';
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
    // sans compte on garde le sol : interprétations et reprises restent là
    state.access = { interpretations: true, reprises: true };
    state.echelon = 1;
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
  const liens = ['<a href="/57" data-link>57</a>'];
  if (a.interpretations) liens.push('<a href="/interpretations" data-link>Interprétations</a>');
  if (a.reprises) liens.push('<a href="/reprises" data-link>Reprises</a>');
  if (a.conversation) liens.push('<a href="/conversation" data-link>Conversation</a>');
  if (a.penseMieux) liens.push('<a href="/pense-mieux" data-link>Pense Mieux</a>');
  if (a.videographie) liens.push('<a href="/videographie" data-link>Vidéographie</a>');
  if (a.carre) liens.push('<a href="/carre-d-as" data-link>Carré d’As</a>');
  if (a.brainstorm) liens.push('<a href="/brainstorm" data-link>Brainstorm</a>');
  if (a.gmo) liens.push('<a href="/game-master-orange" data-link>Game Master Orange</a>');
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
  const reglages = document.getElementById('nav-settings');
  if (reglages) reglages.onclick = () => openSettings();
}

/* --------------------------------------------- la conversation (échelon 2)
   Une seule conversation. Chaque message porte l'échelon minimal pour le
   lire, choisi par son auteur : plus on monte, plus on entend. La page se
   relit toute seule, mais seulement quand elle est visible.               */

function messageHtml(m) {
  const badge = m.min_echelon > 2
    ? `<span class="msg-echelon" title="Visible dès l’échelon ${m.min_echelon}">≥ ${m.min_echelon}</span>` : '';
  return `<article class="msg">
    <div class="msg-head">${authorLink(m.username)}${badge}
      <time>${esc(formatDate(m.created_at))}</time></div>
    <p class="msg-body">${esc(m.body)}</p>
  </article>`;
}

async function pageConversation() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api('/api/conversation'); }
  catch { return navigate('/57', true); }
  if (stale(epoch)) return;

  // Le filtre est une paire (mode, échelon). « jusqu'à l'échelon 4 », c'est
  // littéralement voir la conversation comme la voit un membre de l'échelon
  // 4 ; « seulement » isole une strate ; « à partir de » ne garde que les
  // hauteurs. Tout se filtre sur place : le serveur a déjà tout envoyé.
  const filtre = { mode: 'tout', niveau: 2 };
  let derniereCle = '';

  const garde = (m) =>
    filtre.mode === 'tout' ? true
    : filtre.mode === 'exact' ? m.min_echelon === filtre.niveau
    : filtre.mode === 'min' ? m.min_echelon >= filtre.niveau
    : m.min_echelon <= filtre.niveau;

  const listeHtml = () => {
    const vus = data.messages.filter(garde);
    return vus.length ? vus.map(messageHtml).join('')
      : `<p class="empty-note">${data.messages.length ? 'Rien à ce niveau du filtre.' : 'Personne n’a encore parlé.'}</p>`;
  };

  const niveauxLisibles = Math.max(2, state.echelon || 2);
  const optionsNiveaux = Array.from({ length: niveauxLisibles - 1 }, (_, i) => i + 2);
  const composer = state.user ? `
    <form id="conv-form" class="conv-form">
      <textarea id="conv-body" maxlength="2000" rows="2"
        placeholder="Ton message…"></textarea>
      <div class="conv-form-foot">
        <label class="conv-vis">Visible dès l’échelon
          <select id="conv-min">${Array.from({ length: Math.max(1, (state.echelon || 2) - 1) },
            (_, i) => `<option value="${i + 2}">${i + 2}</option>`).join('')}</select>
        </label>
        <button type="submit" class="primary">Envoyer</button>
      </div>
      <p class="form-error" id="conv-err"></p>
    </form>` : '';

  app.innerHTML = `
    <h1>Conversation</h1>
    <div class="conv-filtre">
      <label>Voir
        <select id="conv-f-mode">
          <option value="tout">tout ce qui m’est ouvert</option>
          <option value="max">jusqu’à l’échelon…</option>
          <option value="exact">seulement l’échelon…</option>
          <option value="min">à partir de l’échelon…</option>
        </select></label>
      <select id="conv-f-niveau" hidden>
        ${optionsNiveaux.map((n) => `<option value="${n}">${n}</option>`).join('')}
      </select>
    </div>
    <div class="conv-list" id="conv-list">${listeHtml()}</div>
    ${composer}`;
  const liste = document.getElementById('conv-list');
  liste.scrollTop = liste.scrollHeight;

  const modeSel = document.getElementById('conv-f-mode');
  const niveauSel = document.getElementById('conv-f-niveau');
  const applique = () => {
    filtre.mode = modeSel.value;
    filtre.niveau = +niveauSel.value;
    niveauSel.hidden = filtre.mode === 'tout';
    liste.innerHTML = listeHtml();
    liste.scrollTop = liste.scrollHeight;
  };
  modeSel.onchange = applique;
  niveauSel.onchange = applique;

  const form = document.getElementById('conv-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const champ = document.getElementById('conv-body');
      const texte = champ.value.trim();
      if (!texte) return;
      try {
        await api('/api/conversation', {
          method: 'POST',
          body: { body: texte, min_echelon: +document.getElementById('conv-min').value },
        });
        champ.value = '';
        await recharge(true);
      } catch (err) { document.getElementById('conv-err').textContent = err.message; }
    };
  }

  // La relecture ne redessine que si quelque chose a changé : pas de
  // clignotement pour rien, pas de défilement perdu.
  async function recharge(force = false) {
    let d;
    try { d = await api('/api/conversation'); } catch { return; }
    if (stale(epoch)) return;
    data = d;
    const cle = d.messages.map((m) => m.id).join(',');
    if (!force && cle === derniereCle) return;
    derniereCle = cle;
    const enBas = liste.scrollHeight - liste.scrollTop - liste.clientHeight < 60;
    liste.innerHTML = listeHtml();
    if (enBas || force) liste.scrollTop = liste.scrollHeight;
  }
  derniereCle = data.messages.map((m) => m.id).join(',');

  // le battement : toutes les 20 s, si l'onglet est visible
  pageTimer = setInterval(() => {
    if (!document.hidden) recharge();
  }, 20000);
}

/* ------------------- les arbres : Pense Mieux (3) et Vidéographie (4) ---
   Un arbre par sujet : un tronc, des branches emboîtées qui se font grandir.
   La forêt, c'est l'ensemble de ses arbres. En Vidéographie chaque branche
   est une vidéo YouTube : on y organise ce qu'on a extériorisé en vidéo.  */

const ARBRES_PAGES = {
  pensee: {
    titre: 'Pense Mieux',
    chemin: '/pense-mieux',
    app: 'pm',
    invite: 'Un sujet devient une réflexion : un point de départ, des pensées qui la font grandir. Chaque pensée peut être nourrie par d’autres, d’ici ou d’ailleurs.',
    vide: 'Rien encore. Ouvre ta première réflexion.',
  },
  video: {
    titre: 'Vidéographie',
    chemin: '/videographie',
    app: 'vg',
    invite: 'Extériorise tes réflexions en vidéo, puis relie-les : chaque entrée est une vidéo YouTube, publique ou privée.',
    vide: 'Aucune vidéo pour l’instant. Ouvre ton premier ensemble.',
  },
};

/* ------------------------------------------------ le dock des applications
   Les quatre pièces hautes ne sont pas des pages mais des applications :
   chacune a son menu, fixé en bas de l'écran (au pouce sur mobile,
   sous les yeux sur ordinateur), qui suit l'utilisateur dans toutes ses
   vues.                                                                   */

const SOUS_APPS = {
  pm: [
    { cle: 'foret', chemin: '/pense-mieux', label: 'Mes réflexions' },
    { cle: 'nouveau', chemin: '/pense-mieux/nouveau', label: 'Ouvrir' },
    { cle: 'univers', chemin: '/pense-mieux/multivers', label: 'Multivers' },
    { cle: 'recherche', chemin: '/pense-mieux/recherche', label: 'Recherche' },
  ],
  vg: [
    { cle: 'foret', chemin: '/videographie', label: 'Mon rythme' },
    { cle: 'carre', chemin: '/videographie/carre', label: 'Le carré' },
  ],
  ca: [
    { cle: 'carre', chemin: '/carre-d-as', label: 'Mes carrés' },
    { cle: 'recrutement', chemin: '/carre-d-as/recrutement', label: 'Recrutement' },
    { cle: 'missions', chemin: '/carre-d-as/missions', label: 'Missions' },
  ],
  bs: [
    { cle: 'scene', chemin: '/brainstorm', label: 'La scène' },
    { cle: 'archives', chemin: '/brainstorm/archives', label: 'Archives' },
    { cle: 'annoncer', chemin: '/brainstorm/annoncer', label: 'Annoncer' },
  ],
};

// Habille une vue : le contenu, puis le dock de son application. Pas
// d'icônes : la typographie suffit.
function docke(appCle, actif, contenu) {
  document.body.classList.add('avec-dock');
  app.innerHTML = contenu + `
    <nav class="sous-menu" aria-label="Menu de l’application">
      ${SOUS_APPS[appCle].map((t) => `
        <a href="${t.chemin}" data-link class="sm-tab${t.cle === actif ? ' actif' : ''}">${t.label}</a>`).join('')}
    </nav>`;
}

/* -------------------------------------------- la forêt (arbres, racine) */

async function vueForet(kind) {
  const def = ARBRES_PAGES[kind];
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api(`/api/arbres?kind=${kind}`); }
  catch (err) {
    if (err.status === 401) {
      docke(def.app, 'foret', `<h1>${esc(def.titre)}</h1><p class="empty-note">Connecte-toi pour ouvrir tes réflexions.</p>`);
      return;
    }
    return navigate('/57', true);
  }
  if (stale(epoch)) return;

  const totalBranches = data.arbres.reduce((somme, a) => somme + a.branches, 0);
  let tri = 'recent';
  let filtreTexte = '';

  const cartes = () => {
    let arbres = [...data.arbres];
    if (filtreTexte) {
      const q = filtreTexte.toLowerCase();
      arbres = arbres.filter((a) => a.title.toLowerCase().includes(q) || (a.trunk || '').toLowerCase().includes(q));
    }
    if (tri === 'branches') arbres.sort((a, b) => b.branches - a.branches);
    return arbres.length ? arbres.map((a) => `
      <a class="arbre-card${a.axe ? ' arbre-card--tronc' : ''}${a.mien ? ' arbre-card--mien' : ''}"
         href="/reflexion/${a.id}" data-link>
        <h2>${esc(a.title)}</h2>
        ${a.trunk ? `<p class="arbre-tronc-apercu">${esc(a.trunk)}</p>` : ''}
        <span class="arbre-meta">${a.branches} pensée${a.branches > 1 ? 's' : ''}${a.mien ? ' · à toi' : ''}</span>
      </a>`).join('') : `<p class="empty-note">${esc(data.arbres.length ? 'Rien ne porte ce nom.' : def.vide)}</p>`;
  };

  // Les cinq troncs sont là d'avance et ne descendent jamais dans la forêt :
  // on ne les plante pas, on les nourrit. Les deux premiers se répondent en
  // miroir : la psychologie dit le présent, le moi harmonieux dit vers quoi
  // il tend.
  /* Les cinq espaces sont là d'avance : on ne les ouvre pas, on les nourrit.
     Chacun dit qui le lit — c'est la règle de la page, et elle doit se voir
     avant d'écrire, pas après. */
  const qui = (t) => (t.publique ? 'lu par tous les As'
    : t.partage === 'carre' ? 'lu par mes carrés' : 'à moi seul');
  const troncs = (data.troncs || []).map((t) => `
    <a class="arbre-card arbre-card--tronc${t.publique ? ' arbre-card--publique' : ''}${
      t.partage === 'moi' ? ' arbre-card--intime' : ''}"
       href="/reflexion/${t.id}" data-link>
      <h2>${esc(t.title)}</h2>
      ${t.sous ? `<p class="arbre-sous">${esc(t.sous)}</p>` : ''}
      <span class="arbre-meta">${t.branches} pensée${t.branches > 1 ? 's' : ''}
        <span class="arbre-qui">${esc(qui(t))}</span></span>
    </a>`).join('');

  /* Ce que le carré m'a répondu. C'est la contrepartie de l'ouverture : si mes
     réflexions sont lues, ce qu'on m'y apporte doit me revenir en premier. */
  const libelleRep = (cle) => (data.reponses || []).find((r) => r.cle === cle);
  const recues = (data.recues || []).length ? `
    <section class="recues">
      <h2>Ton carré t’a répondu</h2>
      <div class="recues-liste">
        ${data.recues.map((r) => `
          <a class="recue recue--${esc(r.reponse)}" href="/reflexion/${r.tree_id}#b${r.id}" data-link>
            <span class="recue-tag"><span class="reponse-quoi">${esc((libelleRep(r.reponse) || {}).label || r.reponse)}</span></span>
            <span class="recue-qui">${esc(r.username)}</span>
            <span class="recue-ou">${esc(r.tree_title)}</span>
            <p>${esc(r.body || 'une vidéo-réponse')}</p>
          </a>`).join('')}
      </div>
    </section>` : '';

  docke(def.app, 'foret', `
    <h1>${esc(def.titre)}</h1>
    ${recues}
    ${troncs ? `<div class="foret foret-troncs">${troncs}</div>` : ''}
    <div class="foret-outils">
      <span class="foret-stats">${data.arbres.length} réflexion${data.arbres.length > 1 ? 's' : ''} · ${totalBranches} pensée${totalBranches > 1 ? 's' : ''}</span>
      <input id="foret-filtre" placeholder="Filtrer…" autocomplete="off">
      <select id="foret-tri">
        <option value="recent">les plus récents</option>
        <option value="branches">les plus fournis</option>
      </select>
    </div>
    <div class="foret" id="foret">${cartes()}</div>`);

  document.getElementById('foret-filtre').oninput = (e) => {
    filtreTexte = e.target.value.trim();
    document.getElementById('foret').innerHTML = cartes();
  };
  document.getElementById('foret-tri').onchange = (e) => {
    tri = e.target.value;
    document.getElementById('foret').innerHTML = cartes();
  };
}

/* ---------------------------------------------- la Vidéographie : le rythme
   Une seule chose ici : trois vidéos à faire, une par semaine, une par mois,
   une par an. Chacune récapitule sa période. Les trois tiennent côte à côte,
   sans un mot de trop : on arrive, on voit ce qui reste à faire, on dépose.

   Tout ce qui se pense vit dans Pense Mieux. La Vidéographie ne porte que ces
   récaps.                                                                 */

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
      docke('vg', 'foret', '<h1>Vidéographie</h1><p class="empty-note">Connecte-toi.</p>');
      return;
    }
    return navigate('/57', true);
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

  const carte = (c) => `
    <section class="ry-carte${c.faite ? ' faite' : ''}" data-cadence="${c.cle}">
      <header>
        <h2>${esc(c.cle === 'annee' ? 'Année' : c.cle === 'mois' ? 'Mois' : 'Semaine')}</h2>
        <span class="ry-periode">${esc(c.periode.libelle)}</span>
        <span class="ry-reste">${c.faite ? 'déposée' : `${esc(dureeCourte(c.restant))} restants`}</span>
      </header>
      <div class="ry-matiere">${chips(c.matiere)}</div>
      ${c.faite ? `
        <div class="ry-faite">${videoEmbed(c.faite.url)}</div>
        ${c.faite.note ? `<p class="ry-note">${esc(c.faite.note)}</p>` : ''}
        <button type="button" class="link-btn" data-refaire="${c.cle}">changer</button>` : ''}
      <form class="ry-form" data-form="${c.cle}"${c.faite ? ' hidden' : ''}>
        <input type="url" data-url placeholder="adresse YouTube du récap"
          value="${esc(c.faite ? c.faite.url : '')}" required>
        <textarea data-note rows="1" maxlength="1000"
          placeholder="en un mot…">${esc(c.faite ? c.faite.note : '')}</textarea>
        <button type="submit" class="primary">${c.faite ? 'Mettre à jour' : 'Déposer'}</button>
        <p class="form-error" data-err></p>
      </form>
      ${c.histoire.length ? `<div class="ry-histoire">${c.histoire.map((h) => `
        <a href="${esc(safeUrl(h.url))}" target="_blank" rel="noopener">${esc(h.periode)}</a>`).join('')}</div>` : ''}
    </section>`;

  docke('vg', 'foret', `<div class="rythme">${data.cadences.map(carte).join('')}</div>`);

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

/* ------------------------------------------------ la galerie des univers ---
   Le seul endroit où les arbres de tout le monde se lisent. On y regarde les
   modèles d'univers des autres, et on fabrique le sien en reliant ce qu'on y
   trouve : une branche de n'importe quel univers peut nourrir le tien.     */

async function vueUnivers(kind) {
  const def = ARBRES_PAGES[kind];
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api(`/api/univers?kind=${kind}`); }
  catch (err) {
    if (err.status === 401) {
      docke(def.app, 'univers', '<h1>Les multivers</h1><p class="empty-note">Connecte-toi.</p>');
      return;
    }
    return navigate('/57', true);
  }
  if (stale(epoch)) return;

  const carte = (u) => `
    <a class="arbre-card arbre-card--univers${u.mien ? ' arbre-card--mien' : ''}"
       href="/reflexion/${u.id}" data-link>
      <h2>${esc(u.carre_nom ? `${u.carre_nom} · Notre multivers` : `${u.username} · Son multivers`)}</h2>
      ${u.trunk ? `<p class="arbre-tronc-apercu">${esc(u.trunk)}</p>` : ''}
      <span class="arbre-meta">${u.branches} modèle${u.branches > 1 ? 's' : ''}${u.mien ? ' · à toi' : ''}</span>
    </a>`;

  const peint = (liste) => liste.length
    ? liste.map(carte).join('')
    : '<p class="empty-note">Aucun multivers pour l’instant. Ouvre le tien : il sera le premier.</p>';

  docke(def.app, 'univers', `
    <h1>Les multivers</h1>
    <p class="univers-intro">Les modèles d’univers de tous les As. Regarde ceux des autres,
      puis fais-en naître de nouveaux en les reliant depuis le tien.</p>
    <div class="foret-outils">
      <input id="univers-q" placeholder="Chercher…" autocomplete="off">
    </div>
    <div class="foret" id="univers-liste">${peint(data.univers)}</div>`);

  const champ = document.getElementById('univers-q');
  let minuterie = null;
  champ.oninput = () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(async () => {
      const q = champ.value.trim();
      let d;
      try { d = await api(`/api/univers?kind=${kind}&q=${encodeURIComponent(q)}`); }
      catch { return; }
      if (champ.value.trim() !== q) return; // une frappe plus récente a gagné
      document.getElementById('univers-liste').innerHTML = peint(d.univers);
    }, 250);
  };
}

/* --------------------- nouvel arbre : un geste du menu, pas un pavé ----- */

function vueNouvelArbre(kind) {
  const def = ARBRES_PAGES[kind];
  docke(def.app, 'nouveau', `
    <h1>${kind === 'video' ? 'Nouvel ensemble' : 'Ouvrir une réflexion'}</h1>
    <p class="empty-note">${esc(def.invite)}</p>
    <form id="arbre-form" class="arbre-form">
      <input id="arbre-titre" maxlength="120" placeholder="Sur quoi veux-tu penser ?" required autofocus>
      <textarea id="arbre-tronc" maxlength="4000" rows="3" placeholder="D’où tu pars : le constat, la question…"></textarea>
      <button type="submit" class="primary">${kind === 'video' ? 'Ouvrir' : 'Commencer'}</button>
      <p class="form-error" id="arbre-err"></p>
    </form>`);

  document.getElementById('arbre-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/arbres', {
        method: 'POST',
        body: { kind, title: document.getElementById('arbre-titre').value, trunk: document.getElementById('arbre-tronc').value },
      });
      navigate(`/arbre/${r.id}`);
    } catch (err) { document.getElementById('arbre-err').textContent = err.message; }
  };
}

/* -------------------------- la recherche : retrouver une pensée perdue --- */

async function vueRecherche(kind) {
  const def = ARBRES_PAGES[kind];
  docke(def.app, 'recherche', `
    <h1>Recherche</h1>
    <input id="rech-q" placeholder="Un mot de tes réflexions…" autocomplete="off" autofocus>
    <div id="rech-resultats"></div>`);

  const champ = document.getElementById('rech-q');
  const zone = document.getElementById('rech-resultats');
  let minuterie = null;
  champ.oninput = () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(async () => {
      const q = champ.value.trim();
      if (q.length < 2) { zone.innerHTML = ''; return; }
      let d;
      try { d = await api(`/api/arbres/recherche?kind=${kind}&q=${encodeURIComponent(q)}`); }
      catch { return; }
      if (champ.value.trim() !== q) return; // une frappe plus récente a gagné
      const arbres = d.arbres.map((a) => `
        <a class="arbre-card" href="/reflexion/${a.id}" data-link>
          <h2>${esc(a.title)}</h2>
          ${a.trunk ? `<p class="arbre-tronc-apercu">${esc(a.trunk)}</p>` : ''}
        </a>`).join('');
      const branches = d.branches.map((b) => `
        <a class="journal-entree" href="/reflexion/${b.tree_id}#b${b.id}" data-link>
          <div class="journal-corps"><p>${esc(b.body || b.url || '')}</p></div>
          <div class="journal-meta"><span class="journal-arbre">${esc(b.tree_title)}</span></div>
        </a>`).join('');
      zone.innerHTML = (arbres || branches)
        ? `${arbres ? `<h2>Réflexions</h2><div class="foret">${arbres}</div>` : ''}
           ${branches ? `<h2>Pensées</h2><div class="journal">${branches}</div>` : ''}`
        : '<p class="empty-note">Rien ne porte ce mot dans tes réflexions.</p>';
    }, 250);
  };
}

/* ------------- la vidéographie du carré : les forêts de ses As, à lire --- */

async function vueVideoCarre() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let d;
  try { d = await api('/api/carre'); }
  catch (err) {
    if (err.status === 403) return navigate('/videographie', true);
    docke('vg', 'carre', '<h1>Le carré</h1><p class="empty-note">Connecte-toi.</p>');
    return;
  }
  if (stale(epoch)) return;

  if (!(d.carres || []).length) {
    docke('vg', 'carre', `
      <p class="empty-note">Pas encore de carré : il se fonde au <a href="/carre-d-as" data-link>Carré d’As</a>.</p>`);
    return;
  }

  // tous les As de tous mes carrés, chacun une fois, moi excepté
  const vus = new Set();
  const autres = [];
  for (const c of d.carres) {
    for (const m of c.membres) {
      if (state.user && m.user_id === state.user.id) continue;
      if (vus.has(m.user_id)) continue;
      vus.add(m.user_id);
      autres.push(m);
    }
  }
  docke('vg', 'carre', `
    ${autres.length ? `<div class="vg-as">${autres.map((m) => `
      <section class="vg-as-bloc" data-as="${m.user_id}">
        <h2>${esc(m.username)}</h2>
        <div class="vg-as-recaps"><span class="ry-chip ry-chip--vide">…</span></div>
      </section>`).join('')}</div>`
      : '<p class="empty-note">Tes carrés n’ont pas encore d’autre As.</p>'}`);

  for (const m of autres) {
    try {
      const v = await api(`/api/videographie/membre/${m.user_id}`);
      if (stale(epoch)) return;
      const zone = document.querySelector(`[data-as="${m.user_id}"] .vg-as-recaps`);
      if (!zone) continue;
      zone.innerHTML = (v.recaps || []).length
        ? v.recaps.map((r) => `<a class="vg-recap" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">
            <span class="vg-recap-cadence">${esc(r.cadence === 'annee' ? 'année' : r.cadence)}</span>
            <span class="vg-recap-periode">${esc(r.periode)}</span>
            ${r.note ? `<span class="vg-recap-note">${esc(r.note)}</span>` : ''}
          </a>`).join('')
        : '<span class="ry-chip ry-chip--vide">pas encore de récap</span>';
    } catch { /* un As sans accès vidéographie : sa section reste vide */ }
  }
}

// Le nom court d'une branche, pour les chips de nourriture.
function brancheEtiquette(b) {
  const texte = (b.body || '').trim() || (b.url ? 'vidéo' : 'branche');
  return texte.length > 42 ? texte.slice(0, 40) + '…' : texte;
}

// Les branches s'emboîtent : on dessine l'arbre en profondeur. Les
// nourritures (les autres passés d'une branche) s'affichent en chips qui
// mènent à leur source : dans cet arbre, ou ailleurs : la chip porte alors le
// nom de l'arbre, celui de son carré s'il y en a un, et y navigue.
//
// Dans l'arbre commun d'un carré, chaque branche dit qui l'a écrite : chacun
// greffe sur la branche de n'importe qui, personne ne touche celle d'un autre.
/* Une pensée. Elle porte ce qu'on a écrit ou dit, d'où elle se nourrit, et
   ce que les autres y ont répondu. Une réponse dit toujours ce qu'elle vient
   faire — approfondir, élargir, ou opposer en résolvant : c'est ce qui la
   distingue d'un commentaire.                                             */
function brancheHtml(b, enfants, kind, editable, ctx) {
  const contenu = kind === 'video' || b.url
    ? `<div class="branche-video">${videoEmbed(b.url)}${b.body ? `<p>${esc(b.body)}</p>` : ''}</div>`
    : `<p class="branche-texte">${esc(b.body)}</p>`;
  const auteurId = b.auteur_id == null ? ctx.porteur : b.auteur_id;
  const mienne = auteurId === ctx.moi;
  const sienne = !ctx.collectif || mienne;
  const sources = (ctx.sourcesDe.get(b.id) || []).map((l) => {
    const ici = l.source_tree_id === ctx.arbreId;
    const etiquette = brancheEtiquette({ body: l.source_body, url: l.source_url });
    const ou = l.source_carre_nom ? `${l.source_carre_nom} · ${l.source_tree_title}` : l.source_tree_title;
    const saut = ici
      ? `<button type="button" class="nourrie-va" data-va="${l.source_id}">⇠ ${esc(etiquette)}</button>`
      : `<a class="nourrie-va" href="/reflexion/${l.source_tree_id}#b${l.source_id}" data-link>⇠ ${esc(ou)} · ${esc(etiquette)}</a>`;
    return `<span class="nourrie-chip${ici ? '' : ' nourrie-ailleurs'}">${saut}${editable && sienne
      ? `<button type="button" class="nourrie-oublie" data-oublie="${b.id}:${l.source_id}" aria-label="Détacher">✕</button>` : ''}</span>`;
  }).join('');

  const vocal = ctx.vocaux.get(b.id);
  const rep = b.reponse ? (ctx.reponses.find((r) => r.cle === b.reponse) || null) : null;

  // ce qu'on peut faire ici : prolonger sa propre pensée, ou répondre à celle
  // d'un autre pour lui donner des variables de plus
  const actions = [];
  if (editable) actions.push(`<button type="button" class="link-btn" data-pousse="${b.id}">prolonger</button>`);
  if (ctx.repondable || (editable && !mienne)) {
    actions.push(`<button type="button" class="link-btn" data-repond="${b.id}">répondre</button>`);
  }
  if ((editable || ctx.repondable) && mienne) {
    if (editable) actions.push(`<button type="button" class="link-btn" data-nourrit="${b.id}">⇠ nourrie par…</button>`);
    actions.push(`<button type="button" class="link-btn danger" data-coupe="${b.id}">retirer</button>`);
  } else if (editable && ctx.proprietaire && b.reponse) {
    actions.push(`<button type="button" class="link-btn danger" data-coupe="${b.id}">retirer</button>`);
  }

  return `<div class="branche${rep ? ` branche--reponse branche--${esc(b.reponse)}` : ''}"
      data-branche="${b.id}" data-auteur="${auteurId}">
    ${rep ? `<p class="reponse-tag"><span class="reponse-quoi">${esc(rep.label)}</span>${
      b.auteur ? ` <span class="reponse-qui">${esc(b.auteur)}</span>` : ''}</p>` : ''}
    ${contenu}
    ${vocal ? `<div class="branche-vocal">
      <button type="button" class="link-btn" data-joue="${b.id}">Réécouter</button>
      <span class="branche-video-zone" data-video-zone="${b.id}"></span>
      <div class="vocal-dit" hidden></div>
    </div>` : ''}
    ${!rep && ctx.collectif && b.auteur ? `<p class="branche-auteur">${esc(b.auteur)}</p>` : ''}
    ${sources ? `<div class="branche-nourritures">${sources}</div>` : ''}
    ${actions.length ? `<div class="branche-actions">${actions.join('')}</div>` : ''}
    <div class="branche-enfants">${(enfants.get(b.id) || []).map((e) => brancheHtml(e, enfants, kind, editable, ctx)).join('')}</div>
  </div>`;
}

function videoEmbed(url) {
  const id = youtubeEmbedId(url || '');
  if (!id) return `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(url)}</a>`;
  return `<div class="cover-embed"><iframe src="https://www.youtube.com/embed/${esc(id)}"
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

// Ce que l'on demande au micro : une voix, pas une pièce. Le navigateur sait
// annuler l'écho, réduire le souffle et tenir le gain — on le lui demande.
const CONTRAINTES_MICRO = {
  audio: {
    channelCount: 1,
    sampleRate: 48000,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
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

  const compresseur = ctx.createDynamicsCompressor();
  compresseur.threshold.value = -26;
  compresseur.knee.value = 24;
  compresseur.ratio.value = 3.5;
  compresseur.attack.value = 0.006;
  compresseur.release.value = 0.22;

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
    gain: Math.round(Math.min(12, Math.max(0, 20 * Math.log10(0.06 / Math.max(0.004, niveau))))),
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
      + '<button type="button" class="link-btn danger" data-vocal-oublie>oublier</button>' : ''}
    <button type="button" class="link-btn" data-vocal-regle>Régler ma voix</button>`);

  const arrete = () => {
    clearInterval(minuterie);
    if (rec && rec.state !== 'inactive') rec.stop();
    if (flux) flux.getTracks().forEach((t) => t.stop());
    flux = null;
  };

  // Mesurer sa voix et garder le réglage sur son compte : les prochains
  // enregistrements s'y accordent.
  const regle = async (blob, discret) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      const mesure = mesureVoix(buffer);
      ctx.close();
      if (!mesure) return null;
      const r = await api('/api/voix', { method: 'PUT', body: mesure });
      if (state.user) state.user.voix = r.voix;
      if (!discret) {
        dis(`<span class="vocal-pret">Voix réglée : fondamentale ${r.voix.f0} Hz.
          Les prochains enregistrements en profiteront.</span>`);
        setTimeout(etatRepos, 3200);
      }
      return r.voix;
    } catch { return null; }
  };

  const enregistre = async (calibration) => {
    try { flux = await navigator.mediaDevices.getUserMedia(CONTRAINTES_MICRO); }
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
      if (calibration) { await regle(blob, false); return; }

      dis('<span class="vocal-attente">Transcription…</span>');
      const data = await blobEnDataUrl(blob);
      // première fois : on mesure la voix au passage, sans rien demander
      if (!(state.user && state.user.voix)) await regle(blob, true);
      try {
        const r = await api('/api/vocal/transcription', { method: 'POST', body: { data, duree } });
        dernier = { data, duree, mots: r.mots || [] };
        surTexte(r.texte || '');
      } catch (err) {
        // la transcription peut manquer ; le vocal, lui, est bien là
        dernier = { data, duree, mots: [] };
        dis(`<span class="vocal-err">${esc(err.message)}</span>`);
        setTimeout(etatRepos, 2500);
        return;
      }
      etatRepos();
    };
    debut = Date.now();
    rec.start();
    dis(`<button type="button" class="bouton-doux danger" data-vocal-stop>Arrêter</button>
         <span class="vocal-compte" id="vocal-compte">0:00</span>
         ${calibration ? '<span class="vocal-attente">parle normalement, trois secondes suffisent</span>' : ''}`);
    minuterie = setInterval(() => {
      const s = Math.floor((Date.now() - debut) / 1000);
      const el = document.getElementById('vocal-compte');
      if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= (calibration ? 6 : VOCAL_MAX_S)) arrete();
    }, 500);
  };

  zone.addEventListener('click', (e) => {
    if (e.target.closest('[data-vocal-oublie]')) { dernier = null; etatRepos(); return; }
    if (e.target.closest('[data-vocal-stop]')) { arrete(); return; }
    if (e.target.closest('[data-vocal-regle]')) { enregistre(true); return; }
    if (e.target.closest('[data-vocal-start]')) enregistre(false);
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

// La fabrication automatique : lancée dès qu'une pensée dite est déposée, et
// silencieuse. Si le navigateur refuse, on n'insiste pas.
async function videoAutomatique(brancheId, mots, contexte, zone) {
  if (!videoPossible() || !mots.length) return;
  if (await prendVideo(brancheId)) { montreVideo(brancheId, zone); return; }
  if (zone) zone.innerHTML = '<span class="video-etat">vidéo en préparation…</span>';
  try {
    const blob = await fabriqueVideo(brancheId, mots, contexte, (p) => {
      if (zone) zone.innerHTML = `<span class="video-etat">vidéo en préparation… ${Math.round(p * 100)} %</span>`;
    });
    await rangeVideo(brancheId, blob);
    montreVideo(brancheId, zone);
  } catch {
    if (zone) zone.innerHTML = '<button type="button" class="link-btn" data-video="' + brancheId + '">Faire la vidéo</button>';
  }
}

async function montreVideo(brancheId, zone) {
  if (!zone) return;
  const blob = await prendVideo(brancheId);
  zone.innerHTML = blob
    ? `<button type="button" class="link-btn" data-telecharge="${brancheId}">Télécharger la vidéo</button>
       <button type="button" class="link-btn" data-video="${brancheId}">refaire</button>`
    : `<button type="button" class="link-btn" data-video="${brancheId}">Faire la vidéo</button>`;
}

async function telechargeVideo(brancheId) {
  const blob = await prendVideo(brancheId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pensee-${brancheId}.webm`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Une réflexion se lit par le même chemin où qu'elle vive : /reflexion/:id.
// Son contexte lui vient du serveur, pas de l'URL : sa nature, son axe, son
// carré, et ce que le lecteur a le droit d'y faire.
async function pageArbre(id) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api(`/api/arbres/${id}`); }
  catch { return navigate('/pense-mieux', true); }
  if (stale(epoch)) return;
  const arbre = data.arbre;
  const kind = arbre.kind;
  const def = ARBRES_PAGES[kind];
  const editable = arbre.editable;
  const collectif = arbre.carre_id != null;

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
    collectif, moi: arbre.moi, porteur: arbre.user_id,
    reponses: arbre.reponses || [], repondable: !!arbre.repondable,
    proprietaire: !!arbre.proprietaire,
  };

  // le retour et le dock suivent l'arbre : celui d'un carré ne s'affiche pas
  // sous le dock de Pense Mieux, et l'univers d'un autre As ramène à la
  // galerie d'où l'on vient
  const etranger = !arbre.proprietaire && !(collectif && arbre.membre);
  const retour = collectif && arbre.membre
    ? { app: 'ca', onglet: 'carre', chemin: `/carre-d-as/${arbre.carre_id}/harmonie`, titre: arbre.carre_nom || 'Le carré' }
    : etranger && arbre.publique
      ? { app: def.app, onglet: 'univers', chemin: `${def.chemin}/univers`, titre: 'Les univers' }
      : { app: def.app, onglet: 'foret', chemin: def.chemin, titre: def.titre };

  // le champ des possibles : le même axe, ailleurs. Une ligne, pas une page.
  const ailleurs = (arbre.ailleurs || []).map((a) => {
    const nom = a.carre_nom || (a.kind === 'video' ? 'Vidéographie' : 'Pense Mieux');
    return `<a href="/reflexion/${a.id}" data-link>${esc(nom)}</a>`;
  }).join(' · ');

  // les voix de l'arbre : dans un arbre commun, on veut pouvoir ne lire que
  // les siennes, ou celles d'un seul As. Les réflexions communes et celles
  // propres à chacun se démêlent ainsi sans quitter la page.
  const auteurs = [];
  const vusAuteurs = new Set();
  for (const b of arbre.branches) {
    const id = b.auteur_id == null ? arbre.user_id : b.auteur_id;
    if (vusAuteurs.has(id)) continue;
    vusAuteurs.add(id);
    auteurs.push({ id, nom: id === arbre.moi ? 'Moi' : (b.auteur || 'un As') });
  }

  // chez un autre, l'arbre porte son nom : « Mes univers » n'aurait aucun
  // sens sur la page de quelqu'un d'autre
  const titre = etranger && (arbre.carre_nom || arbre.porteur)
    ? `${arbre.carre_nom || arbre.porteur} · ${arbre.title}`
    : arbre.title;

  const nomPorteur = etranger ? (arbre.carre_nom || arbre.porteur || '') : '';

  docke(retour.app, retour.onglet, `
    <p class="fil-retour"><a href="${retour.chemin}" data-link>← ${esc(retour.titre)}</a></p>
    <h1>${esc(titre)}</h1>
    ${arbre.sous && !etranger ? `<p class="arbre-sous">${esc(arbre.sous)}</p>` : ''}
    ${arbre.publique ? '<p class="arbre-public">Lu par tous les As : ce que tu écris ici entre dans la galerie des multivers.</p>' : ''}
    ${!etranger && arbre.partage ? `<p class="arbre-partage">${esc(arbre.partage === 'carre'
      ? 'Les As de tes carrés lisent cet espace et peuvent y répondre.'
      : 'Cet espace est à toi seul. Personne d’autre ne le lit.')}</p>` : ''}
    ${arbre.repondable ? `<p class="arbre-invite-reponse">Tu es ici pour aider ${esc(nomPorteur)} à voir
      plus de variables : approfondis, élargis, ou oppose en proposant une issue.</p>` : ''}
    ${arbre.miroir ? `<p class="arbre-miroir">En regard : <a href="/reflexion/${arbre.miroir.id}" data-link>${esc(arbre.miroir.title)}</a></p>` : ''}
    ${arbre.trunk ? `<p class="tronc">${esc(arbre.trunk)}</p>` : ''}
    ${ailleurs ? `<p class="arbre-ailleurs">Le même ailleurs : ${ailleurs}</p>` : ''}
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
    ${editable || arbre.repondable ? `
    <form id="branche-form" class="branche-form">
      <input type="hidden" id="branche-parent" value="">
      <input type="hidden" id="branche-reponse" value="">
      <p class="branche-ou" id="branche-ou">${editable ? 'Une pensée de plus' : 'Ta réponse'}</p>
      ${arbre.repondable ? `
      <div class="reponse-choix" id="reponse-choix">
        ${(arbre.reponses || []).map((r, i) => `
          <label class="reponse-type">
            <input type="radio" name="reponse-type" value="${esc(r.cle)}"${i === 0 ? ' checked' : ''}>
            <span class="reponse-label">${esc(r.label)}</span>
            <span class="reponse-aide">${esc(r.aide)}</span>
          </label>`).join('')}
      </div>` : ''}
      ${kind === 'video' && editable ? '<input id="branche-url" type="url" placeholder="https://www.youtube.com/watch?v=…" required>' : ''}
      ${arbre.repondable ? '<input id="branche-url" type="url" placeholder="Une vidéo-réponse ? colle son adresse YouTube (facultatif)">' : ''}
      <textarea id="branche-body" maxlength="2000" rows="2"
        placeholder="${kind === 'video' && editable ? 'Quelques mots sur cette vidéo (facultatif)…'
          : arbre.repondable ? 'Ce que tu apportes…' : 'Ce qui te vient…'}"></textarea>
      ${kind === 'pensee' && vocalDisponible() ? '<div class="vocal-barre" id="vocal-barre"></div>' : ''}
      <div class="conv-form-foot">
        <button type="button" class="link-btn" id="branche-annule" hidden>Repartir du début</button>
        <button type="submit" class="primary">${arbre.repondable ? 'Déposer ma réponse' : 'Déposer'}</button>
      </div>
      <p class="form-error" id="branche-err"></p>
    </form>
    ${editable && !arbre.axe ? '<p class="arbre-suppr"><button type="button" class="link-btn danger" id="arbre-suppr">Supprimer cette réflexion</button></p>' : ''}
    ` : `<p class="empty-note">${arbre.publique && etranger
      ? 'Le multivers d’un autre As. Depuis le tien, une pensée peut être nourrie par les siennes.'
      : 'En lecture seule.'}</p>`}`);

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
      if (joue.textContent === 'Arrêter') { joue.textContent = 'Réécouter'; return; }
      const bid = +joue.dataset.joue;
      const zone = joue.closest('.branche-vocal').querySelector('.vocal-dit');
      enCours = joueVocal(bid, (vocaux.get(bid) || {}).mots || [], zone, joue);
    }
    const tele = e.target.closest('button[data-telecharge]');
    if (tele) telechargeVideo(+tele.dataset.telecharge);
    const refaire = e.target.closest('button[data-video]');
    if (refaire) {
      const bid = +refaire.dataset.video;
      videoAutomatique(bid, (vocaux.get(bid) || {}).mots || [], contexteVideo,
        app.querySelector(`[data-video-zone="${bid}"]`));
    }
    // répondre à une pensée : le formulaire vient se poser dessous
    const repond = e.target.closest('button[data-repond]');
    if (repond) viseParent(+repond.dataset.repond, true);
  });

  // ce qui habille la vidéo : de quoi on parle, et qui parle
  const contexteVideo = {
    titre: arbre.title,
    sous: arbre.carre_nom || (kind === 'video' ? 'Vidéographie' : 'Pense Mieux'),
    auteur: arbre.porteur || '',
  };
  // les vidéos déjà fabriquées reviennent d'elles-mêmes
  for (const v of arbre.vocaux || []) {
    montreVideo(v.branch_id, app.querySelector(`[data-video-zone="${v.branch_id}"]`));
  }
  // arrivée par une chip d'un autre arbre : la branche visée s'illumine
  if (/^#b\d+$/.test(location.hash)) setTimeout(() => vaVers(+location.hash.slice(2)), 150);

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

  if (!editable && !arbre.repondable) return;

  const parentField = document.getElementById('branche-parent');
  const ou = document.getElementById('branche-ou');
  const annule = document.getElementById('branche-annule');
  const formulaire = document.getElementById('branche-form');

  /* Poser le formulaire sur une pensée : pour la prolonger quand elle est à
     soi, pour y répondre quand elle est à un autre. */
  function viseParent(cible, reponse) {
    parentField.value = cible == null ? '' : String(cible);
    ou.textContent = cible == null
      ? (editable ? 'Une pensée de plus' : 'Ta réponse')
      : (reponse ? 'Ta réponse à cette pensée' : 'Une pensée qui prolonge celle-ci');
    annule.hidden = cible == null;
    formulaire.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const champ = document.getElementById(kind === 'video' && editable ? 'branche-url' : 'branche-body');
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

  /* Les autres arbres où puiser, chargés à la première liaison. On ne propose
     que ce que le serveur accepterait : dans un arbre de carré, ce carré ;
     dans un arbre public, les seuls univers — un arbre lu par tous ne peut
     pas porter l'extrait d'une pensée qui ne l'est pas. Partout, les univers
     de tous s'ajoutent : c'est ainsi qu'on en fabrique de nouveaux.       */
  let autresArbres = null;
  const groupe = (label, arbres) => arbres.length
    ? `<optgroup label="${esc(label)}">${arbres.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</optgroup>`
    : '';
  const universOptions = async (dejaVus) => {
    let g;
    try { g = await api(`/api/univers?kind=${kind}`); } catch { return []; }
    return (g.univers || [])
      .filter((u) => u.id !== id && !dejaVus.has(u.id))
      .map((u) => ({ id: u.id, title: u.carre_nom ? `${u.carre_nom} · Notre multivers` : `${u.username} · Son multivers` }));
  };
  const chargeAutres = async () => {
    if (autresArbres != null) return;
    try {
      let options = '';
      let total = 0;
      const vus = new Set([id]);
      if (arbre.publique) {
        const univers = await universOptions(vus);
        total = univers.length;
        options = groupe('Les multivers', univers);
      } else {
        const d = await api(`/api/arbres?kind=${kind}`);
        if (collectif) {
          const c = (d.carres || []).find((x) => x.carre_id === arbre.carre_id);
          const arbres = (c ? c.arbres : []).filter((a) => a.id !== id);
          for (const a of arbres) vus.add(a.id);
          total = arbres.length;
          options = groupe(c ? c.carre_nom : 'Le carré', arbres);
        } else {
          const mienne = [...(d.troncs || []), ...(d.arbres || [])].filter((a) => a.id !== id);
          for (const a of mienne) vus.add(a.id);
          total = mienne.length;
          options = groupe('Mes réflexions', mienne);
          for (const c of d.carres || []) {
            const arbres = c.arbres.filter((a) => a.id !== id);
            for (const a of arbres) vus.add(a.id);
            total += arbres.length;
            options += groupe(c.carre_nom, arbres);
          }
        }
        const univers = await universOptions(vus);
        total += univers.length;
        options += groupe('Les multivers', univers);
      }
      autresArbres = total;
      selArbre.innerHTML = '<option value="">ou depuis une autre réflexion…</option>' + options;
      selArbre.hidden = total === 0;
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
    } else if (pousse) {
      viseParent(+pousse.dataset.pousse, false);
    } else if (coupe && confirm('Retirer cette pensée et tout ce qui s’y rattache ?')) {
      await api(`/api/branches/${coupe.dataset.coupe}`, { method: 'DELETE' });
      pageArbre(id);
    }
  });
  annule.onclick = () => viseParent(null, false);

  // l'enregistreur du formulaire : il remplit le texte, et son audio part
  // avec la branche
  const barre = document.getElementById('vocal-barre');
  const enregistreur = barre ? faitEnregistreur(barre, (texte) => {
    const champ = document.getElementById('branche-body');
    champ.value = champ.value ? `${champ.value} ${texte}` : texte;
  }) : null;

  formulaire.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const champUrl = document.getElementById('branche-url');
      const typeReponse = app.querySelector('input[name="reponse-type"]:checked');
      const r = await api(`/api/arbres/${id}/branches`, {
        method: 'POST',
        body: {
          parent_id: parentField.value ? +parentField.value : null,
          body: document.getElementById('branche-body').value,
          url: champUrl ? champUrl.value : '',
          reponse: typeReponse ? typeReponse.value : '',
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
          /* La vidéo se fabrique d'elle-même : on ne la demande plus. Elle
             dure le temps de la pensée, en silence, pendant qu'on continue.
             On repeint la page d'abord, pour que la zone d'accueil existe. */
          await pageArbre(id);
          const zone = app.querySelector(`[data-video-zone="${r.id}"]`);
          videoAutomatique(r.id, vocal.mots || [], {
            titre: arbre.title,
            sous: arbre.carre_nom || (kind === 'video' ? 'Vidéographie' : 'Pense Mieux'),
            auteur: (state.user && state.user.username) || '',
          }, zone);
          return;
        } catch { /* la pensée est écrite, c'est l'essentiel */ }
      }
      pageArbre(id);
    } catch (err) { document.getElementById('branche-err').textContent = err.message; }
  };


  // un tronc n'a pas ce bouton : il ne s'abat pas
  const suppr = document.getElementById('arbre-suppr');
  if (suppr) suppr.onclick = async () => {
    if (!confirm('Supprimer cette réflexion et tout ce qu’elle contient ?')) return;
    await api(`/api/arbres/${id}`, { method: 'DELETE' });
    navigate(retour.chemin);
  };
}

/* --------------------------------------------- le carré d'as (échelon 5)
   Le réseau des carrés : mes carrés, le salon de recrutement, les missions.
   La page d'un carré porte ses cinq onglets, dont l'harmonie.            */

// L'état du carré, partagé par les vues qui en ont besoin.
async function chargeCarre() {
  return api('/api/carre');
}

/* ----------------------- mes carrés : le réseau des groupes de réflexion ---
   Un As peut vivre dans plusieurs carrés. Cette vue les liste, en fonde un,
   en rejoint un ; chaque carré a ensuite sa page, avec ses onglets.       */

async function vueMesCarres() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let d;
  try { d = await chargeCarre(); }
  catch { return navigate('/57', true); }
  if (stale(epoch)) return;

  let contenu;
  if (!state.user) {
    contenu = '<p class="empty-note">Connecte-toi pour fonder ou rejoindre un carré.</p>';
  } else {
    const cartes = d.carres.map((c) => {
      const places = 4 - c.membres.length;
      return `
        <a class="carre-carte" href="/carre-d-as/${c.id}" data-link>
          <h2>${esc(c.nom)}</h2>
          <p class="carre-carte-membres">${c.membres.map((m) => esc(m.username)).join(' · ')}
            ${places ? `<span class="carre-carte-places">${places} place${places > 1 ? 's' : ''}</span>` : ''}</p>
        </a>`;
    }).join('');
    contenu = `
      ${d.invitations ? `<p class="recrut-place"><a href="/carre-d-as/recrutement" data-link>
        ${d.invitations} invitation${d.invitations > 1 ? 's' : ''} au recrutement</a></p>` : ''}
      ${d.carres.length ? `<div class="carres-liste">${cartes}</div>`
        : '<p class="empty-note">Aucun carré encore : fonde le tien, ou passe par le <a href="/carre-d-as/recrutement" data-link>recrutement</a>.</p>'}
      <form id="carre-cree" class="carre-cree">
        <input id="carre-nom" maxlength="60" placeholder="Le nom d’un nouveau carré" required>
        <button type="submit" class="primary">Fonder</button>
        <p class="form-error" id="carre-err"></p>
      </form>
      ${d.ouverts.length ? `
      <h2>Carrés où il reste une place</h2>
      <ul class="carres-ouverts">
        ${d.ouverts.map((o) => `<li><a href="/carre-d-as/${o.id}" data-link>${esc(o.nom)}</a> <span>(${o.membres}/4)</span>
          <button type="button" data-rejoint="${o.id}">Rejoindre</button></li>`).join('')}
      </ul>` : ''}`;
  }

  docke('ca', 'carre', `<h1>Carré d’As</h1>${contenu}`);

  const cree = document.getElementById('carre-cree');
  if (cree) {
    cree.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/carre', { method: 'POST', body: { nom: document.getElementById('carre-nom').value } });
        navigate(`/carre-d-as/${r.id}`);
      } catch (err) { document.getElementById('carre-err').textContent = err.message; }
    };
    app.querySelectorAll('[data-rejoint]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api(`/api/carre/${b.dataset.rejoint}/rejoindre`, { method: 'POST', body: {} });
          navigate(`/carre-d-as/${b.dataset.rejoint}`);
        } catch (err) { document.getElementById('carre-err').textContent = err.message; }
      };
    });
  }
}

/* ------------------------------------- la page d'un carré : trois matières
   Un carré n'existe que pour trois choses : la philosophie, le multivers et
   la société harmonieuse. Chacune a son onglet, et chaque onglet montre ce
   que les quatre écrivent ensemble puis ce que chacun porte de son côté sur
   la même matière. Plus la conversation, pour tout le reste.

   Rien d'autre ne s'y voit : ni la psychologie ni le moi harmonieux d'un As,
   ni ses réflexions personnelles. Ils ne sortent pas de chez lui.        */

const MATIERES = [
  { cle: 'multivers', axe: 'univers', label: 'Multivers' },
  { cle: 'philosophie', axe: 'philo', label: 'Philosophie' },
  { cle: 'societe', axe: 'societe', label: 'Société harmonieuse' },
];

function carreTete(d, id, onglet) {
  const onglets = d.publique ? '' : `
    <nav class="carre-onglets">
      ${[...MATIERES.map((m) => [m.cle, m.label]), ['conversation', 'Conversation']]
        .map(([cle, label]) => `<a href="/carre-d-as/${id}/${cle}" data-link
          class="co-tab${onglet === cle ? ' actif' : ''}">${label}</a>`).join('')}
    </nav>`;
  const as = (d.membres || []).map((m) => authorLink(m.username)).join('<span class="carre-sep">·</span>');
  return `
    <p class="fil-retour"><a href="/carre-d-as" data-link>← Mes carrés</a></p>
    <h1>${esc(d.carre.nom)}</h1>
    <p class="carre-as">${as}${d.places > 0
      ? `<span class="carre-places">${d.places} place${d.places > 1 ? 's' : ''} libre${d.places > 1 ? 's' : ''}</span>` : ''}</p>
    ${onglets}`;
}

async function pageCarre(id, onglet) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let d;
  try { d = await api(`/api/carre/${id}`); }
  catch { return navigate('/carre-d-as', true); }
  if (stale(epoch)) return;

  if (d.publique) return carreFacade(id, d);
  if (onglet === 'conversation') return carreOngletConversation(id, d, epoch);
  const matiere = MATIERES.find((m) => m.cle === onglet) || MATIERES[0];
  return carreOngletMatiere(id, d, matiere, epoch);
}

// La façade d'un carré qui n'est pas le mien : son nom, ses As, ses places.
function carreFacade(id, d) {
  docke('ca', 'carre', `
    ${carreTete(d, id, '')}
    ${d.places > 0 && state.user ? `
      <button type="button" class="primary" id="carre-rejoint">Rejoindre ce carré</button>
      <p class="form-error" id="carre-err"></p>`
      : '<p class="empty-note">Ce carré est complet.</p>'}`);

  const b = document.getElementById('carre-rejoint');
  if (b) b.onclick = async () => {
    try {
      await api(`/api/carre/${id}/rejoindre`, { method: 'POST', body: {} });
      pageCarre(id, 'multivers');
    } catch (err) { document.getElementById('carre-err').textContent = err.message; }
  };
}

/* Une matière du carré : ce que les quatre en écrivent ensemble, puis ce que
   chacun en porte de son côté. On n'écrit pas ici : on entre. */
async function carreOngletMatiere(id, d, matiere, epoch) {
  let m;
  try { m = await api(`/api/carre/${id}/axe/${matiere.axe}`); }
  catch { return navigate('/carre-d-as', true); }
  if (stale(epoch)) return;

  const compte = (t) => `${t.pensees} pensée${t.pensees > 1 ? 's' : ''}${
    t.reponses ? ` · ${t.reponses} réponse${t.reponses > 1 ? 's' : ''}` : ''}`;

  docke('ca', 'carre', `
    ${carreTete(d, id, matiere.cle)}
    <section class="mat-commun">
      ${m.commun ? `
        <a class="mat-carte mat-carte--commun" href="/reflexion/${m.commun.id}" data-link>
          <h2>${esc(m.titre)}</h2>
          ${m.commun.trunk ? `<p class="mat-apercu">${esc(m.commun.trunk)}</p>` : ''}
          <span class="mat-meta">${m.commun.pensees} pensée${m.commun.pensees > 1 ? 's' : ''} · à quatre${
            m.publique ? ' · lu par tous les As' : ''}</span>
        </a>` : ''}
    </section>
    <section class="mat-chacun">
      <h2>Chacun de son côté</h2>
      <div class="mat-grille">
        ${m.membres.map((x) => (x.tree_id ? `
          <a class="mat-carte${x.moi ? ' mat-carte--moi' : ''}" href="/reflexion/${x.tree_id}" data-link>
            <h3>${esc(x.titre)}</h3>
            ${x.trunk ? `<p class="mat-apercu">${esc(x.trunk)}</p>` : ''}
            <span class="mat-meta">${compte(x)}</span>
          </a>` : `
          <span class="mat-carte mat-carte--vide">
            <h3>${esc(x.titre)}</h3>
            <span class="mat-meta">rien encore</span>
          </span>`)).join('')}
      </div>
      <p class="mat-note">Entre chez les autres pour leur donner des variables de plus :
        approfondis, élargis, ou oppose en proposant une issue.</p>
    </section>`);
}

async function carreOngletConversation(id, d, epoch) {
  let premier;
  try { premier = await api(`/api/carre/${id}/conversation`); }
  catch { return navigate('/carre-d-as', true); }
  if (stale(epoch)) return;

  docke('ca', 'carre', `
    ${carreTete(d, id, 'conversation')}
    <div class="conv-list conv-list--pleine" id="carre-conv-list"></div>
    <form id="carre-conv-form" class="conv-form">
      <textarea id="carre-conv-body" maxlength="2000" rows="2" placeholder="Dis-le à ton carré…"></textarea>
      <div class="conv-form-foot"><button type="submit" class="primary">Envoyer</button></div>
      <p class="form-error" id="carre-conv-err"></p>
    </form>
    <p class="carre-sortie">
      <label class="carre-salon">Salon Discord
        <input id="carre-discord" type="url" placeholder="https://discord.gg/…" value="${esc(d.carre.discord_url || '')}">
      </label>
      <button type="button" class="link-btn danger" id="carre-quitter">Quitter ce carré</button>
    </p>`);

  document.getElementById('carre-quitter').onclick = () => quitteCarre(id);
  const discord = document.getElementById('carre-discord');
  discord.onchange = async () => {
    try { await api(`/api/carre/${id}`, { method: 'PUT', body: { discord_url: discord.value } }); }
    catch (err) { document.getElementById('carre-conv-err').textContent = err.message; }
  };

  const liste = document.getElementById('carre-conv-list');
  let derniereCle = '';
  const peint = (messages) => {
    liste.innerHTML = messages.length
      ? messages.map((m) => `<article class="msg">
          <div class="msg-head">${authorLink(m.username)}<time>${esc(formatDate(m.created_at))}</time></div>
          <p class="msg-body">${esc(m.body)}</p></article>`).join('')
      : '<p class="empty-note">Le carré n’a encore rien dit.</p>';
  };
  peint(premier.messages);
  derniereCle = premier.messages.map((m) => m.id).join(',');
  liste.scrollTop = liste.scrollHeight;

  const recharge = async (force = false) => {
    let x;
    try { x = await api(`/api/carre/${id}/conversation`); } catch { return; }
    if (stale(epoch)) return;
    const cle = x.messages.map((m) => m.id).join(',');
    if (!force && cle === derniereCle) return;
    derniereCle = cle;
    const enBas = liste.scrollHeight - liste.scrollTop - liste.clientHeight < 60;
    peint(x.messages);
    if (enBas || force) liste.scrollTop = liste.scrollHeight;
  };
  pageTimer = setInterval(() => { if (!document.hidden) recharge(); }, 20000);

  document.getElementById('carre-conv-form').onsubmit = async (e) => {
    e.preventDefault();
    const champ = document.getElementById('carre-conv-body');
    if (!champ.value.trim()) return;
    try {
      await api(`/api/carre/${id}/conversation`, { method: 'POST', body: { body: champ.value } });
      champ.value = '';
      recharge(true);
    } catch (err) { document.getElementById('carre-conv-err').textContent = err.message; }
  };
}

/* Quitter un carré : le geste vit sous la conversation, là où l'on parle. */
async function quitteCarre(id) {
  if (!confirm('Quitter ce carré ?')) return;
  await api(`/api/carre/${id}/quitter`, { method: 'POST', body: {} });
  navigate('/carre-d-as');
}

/* ------------------ le recrutement : le salon où les carrés se composent ---
   Les As libres s'annoncent : ce qu'ils apporteraient, leur nature, leur
   connaissance. Les carrés incomplets les invitent. L'invité accepte ou
   décline : on n'entre dans un carré que voulu des deux côtés.            */

async function vueRecrutement() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let d;
  try { d = await api('/api/carre/recrutement'); }
  catch (err) {
    if (err.status === 401) { docke('ca', 'recrutement', '<h1>Recrutement</h1><p class="empty-note">Connecte-toi.</p>'); return; }
    return navigate('/57', true);
  }
  if (stale(epoch)) return;

  // les invitations que je reçois, et mon annonce au salon
  const a = d.monAnnonce;
  const maZone = `
    ${d.invitations.length ? `
    <div class="recrut-invitations">
      ${d.invitations.map((i) => `
        <div class="recrut-invitation">
          <div><strong>${esc(i.carre_nom)}</strong> t’invite${i.note ? ` : « ${esc(i.note)} »` : ''}
            <span class="vie-meta">par ${esc(i.de_username)}</span></div>
          <div class="recrut-choix">
            <button type="button" class="primary" data-accepte="${i.id}">Rejoindre</button>
            <button type="button" class="link-btn" data-refuse="${i.id}">Décliner</button>
          </div>
        </div>`).join('')}
    </div>` : ''}
    <form id="annonce-form" class="annonce-form">
      <textarea id="annonce-note" maxlength="500" rows="2"
        placeholder="Ce que tu cherches, ce que tu apporterais…">${esc(a?.note || '')}</textarea>
      <div class="annonce-ligne">
        <button type="submit" class="primary">${a ? 'Mettre à jour' : 'Me rendre disponible'}</button>
        ${a ? '<button type="button" class="link-btn danger" id="annonce-retire">Me retirer</button>' : ''}
      </div>
      <p class="form-error" id="annonce-err"></p>
    </form>`;

  // inviter : depuis lequel de mes carrés où il reste une place
  const avecPlaces = d.mesCarres.filter((c) => c.places > 0);
  const choixCarre = avecPlaces.length ? `
    <div class="recrut-depuis">
      <label>Inviter dans
        <select id="invite-carre">
          ${avecPlaces.map((c) => `<option value="${c.id}">${esc(c.nom)} (${c.places} place${c.places > 1 ? 's' : ''})</option>`).join('')}
        </select></label>
    </div>` : '';

  const envoyees = d.envoyees.length ? `
    <div class="recrut-envoyees">
      ${d.envoyees.map((i) => `<span class="recrut-attente">${esc(i.carre_nom)} : ${esc(i.username)} (invité)
        <button type="button" class="link-btn" data-retire="${i.id}">retirer</button></span>`).join('')}
    </div>` : '';

  const salon = d.annonces.length ? `
    <div class="recrut-salon">
      ${d.annonces.map((x) => `
        <div class="recrut-annonce${x.moi ? ' moi' : ''}">
          <div class="recrut-tete">
            ${authorLink(x.username)}
            ${x.carres ? `<span class="vie-meta">${x.carres} carré${x.carres > 1 ? 's' : ''}</span>` : ''}
          </div>
          ${x.note ? `<p class="recrut-note">${esc(x.note)}</p>` : ''}
          ${avecPlaces.length && !x.moi ? `<button type="button" data-invite="${esc(x.username)}">Inviter</button>` : ''}
        </div>`).join('')}
    </div>` : '<p class="empty-note">Personne au salon.</p>';

  docke('ca', 'recrutement', `
    <h1>Recrutement</h1>
    <p class="recrut-charte">${esc(d.charte)}</p>
    ${maZone}
    ${envoyees}
    ${choixCarre}
    ${salon}`);

  const zone = app;
  zone.querySelectorAll('[data-accepte]').forEach((b) => {
    b.onclick = async () => {
      try {
        const r = await api(`/api/carre/invitations/${b.dataset.accepte}/accepte`, { method: 'POST', body: {} });
        navigate(`/carre-d-as/${r.carre_id}`);
      } catch (err) { alert(err.message); }
    };
  });
  zone.querySelectorAll('[data-refuse],[data-retire]').forEach((b) => {
    b.onclick = async () => {
      await api(`/api/carre/invitations/${b.dataset.refuse || b.dataset.retire}/refuse`, { method: 'POST', body: {} });
      vueRecrutement();
    };
  });
  zone.querySelectorAll('[data-invite]').forEach((b) => {
    b.onclick = async () => {
      const carreId = +document.getElementById('invite-carre').value;
      const note = prompt(`Un mot pour ${b.dataset.invite} ? (facultatif)`) ?? '';
      try {
        await api('/api/carre/invitations', {
          method: 'POST',
          body: { carre_id: carreId, username: b.dataset.invite, note },
        });
        vueRecrutement();
      } catch (err) { alert(err.message); }
    };
  });
  const annonceForm = document.getElementById('annonce-form');
  if (annonceForm) {
    annonceForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/carre/annonce', {
          method: 'PUT',
          body: { note: document.getElementById('annonce-note').value },
        });
        vueRecrutement();
      } catch (err) { document.getElementById('annonce-err').textContent = err.message; }
    };
    const retire = document.getElementById('annonce-retire');
    if (retire) retire.onclick = async () => { await api('/api/carre/annonce', { method: 'DELETE' }); vueRecrutement(); };
  }
}


/* -------------------------------------- les missions : la charte des As --- */

async function vueMissions() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await chargeCarre(); }
  catch { return navigate('/57', true); }
  if (stale(epoch)) return;

  docke('ca', 'missions', `
    <h1>${esc(data.missions.titre)}</h1>
    <section class="missions">
      ${data.missions.blocs.map((b) => `
        <article class="mission-bloc">
          <h3>${esc(b.titre)}</h3>
          <p>${esc(b.texte)}</p>
        </article>`).join('')}
    </section>`);
}


/* ---------------------------------------------- le brainstorm (échelon 6)
   Les lives des carrés, et la salle qui réfléchit avec eux. Tout marche par
   relecture périodique : douze secondes quand un live est ouvert et que
   l'onglet est visible : pas de connexion tenue, pas de serveur en plus.  */

const PLATEFORME_LABELS = { youtube: 'YouTube', twitch: 'Twitch', tiktok: 'TikTok' };

// La carte d'un brainstorm, où qu'elle s'affiche.
function bsCarte(b) {
  return `
    <a class="bs-card bs-${esc(b.statut)}" href="/brainstorm/${b.id}" data-link>
      <div class="bs-statut">${b.statut === 'live' ? '● EN DIRECT' : b.statut === 'annonce' ? 'Annoncé' : 'Terminé'}</div>
      <h2>${esc(b.sujet)}</h2>
      <div class="bs-meta">${esc(b.carre_nom)} · ${esc(PLATEFORME_LABELS[b.plateforme] || b.plateforme)}
        · ${b.idees} réflexion${b.idees > 1 ? 's' : ''}${b.retenues ? ` · ★ ${b.retenues}` : ''}</div>
    </a>`;
}

// La scène : ce qui se passe maintenant, et ce qui s'annonce.
async function vueScene() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api('/api/brainstorms'); }
  catch { return navigate('/57', true); }
  if (stale(epoch)) return;

  const lives = data.brainstorms.filter((b) => b.statut === 'live');
  const annonces = data.brainstorms.filter((b) => b.statut === 'annonce');
  docke('bs', 'scene', `
    <h1>Brainstorm</h1>
    <h2>En direct maintenant</h2>
    <div class="bs-liste">${lives.length ? lives.map(bsCarte).join('')
      : '<p class="empty-note">Personne n’est en direct. Les brainstorms passés vivent dans les <a href="/brainstorm/archives" data-link>archives</a>.</p>'}</div>
    <h2>Annoncés</h2>
    <div class="bs-liste">${annonces.length ? annonces.map(bsCarte).join('')
      : '<p class="empty-note">Rien d’annoncé : un carré complet peut <a href="/brainstorm/annoncer" data-link>annoncer le sien</a>.</p>'}</div>`);
}

// Les archives : les brainstorms passés et leur récolte.
async function vueArchives() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  // les archives demandent les leurs : reléguées en fin de liste commune,
  // elles disparaissaient dès que le direct et l'annoncé remplissaient la page
  try { data = await api('/api/brainstorms?statut=termine'); }
  catch { return navigate('/57', true); }
  if (stale(epoch)) return;

  const finis = data.brainstorms;
  docke('bs', 'archives', `
    <h1>Les archives</h1>
    <div class="bs-liste">${finis.length ? finis.map(bsCarte).join('')
      : '<p class="empty-note">Aucune archive pour l’instant : le premier brainstorm terminé viendra ici.</p>'}</div>`);
}

// Annoncer : la parole d'un carré complet. On choisit lequel de ses carrés
// porte le live, et lequel de ses As tient l'antenne.
async function vueAnnoncer() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let d;
  try { d = await chargeCarre(); }
  catch { return navigate('/57', true); }
  if (stale(epoch)) return;

  const complets = (d.carres || []).filter((c) => c.membres.length === 4);
  if (!complets.length) {
    docke('bs', 'annoncer', `
      <h1>Annoncer un brainstorm</h1>
      <p class="empty-note">Un brainstorm est porté par un carré complet : quatre As.
        Tout se joue au <a href="/carre-d-as" data-link>Carré d’As</a>.</p>`);
    return;
  }

  const hotesDe = (carreId) => complets.find((c) => c.id === carreId).membres;
  docke('bs', 'annoncer', `
    <h1>Annoncer un brainstorm</h1>
    <form id="bs-form" class="bs-form">
      <input id="bs-sujet" maxlength="200" placeholder="Le sujet du brainstorming" required>
      <div class="bs-form-ligne">
        ${complets.length > 1 ? `
        <select id="bs-carre">
          ${complets.map((c) => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}
        </select>` : `<input type="hidden" id="bs-carre" value="${complets[0].id}">`}
        <select id="bs-hote"></select>
      </div>
      <div class="bs-form-ligne">
        <select id="bs-plateforme">
          <option value="youtube">YouTube</option><option value="twitch">Twitch</option><option value="tiktok">TikTok</option>
        </select>
        <input id="bs-url" type="url" placeholder="Le lien du live" required>
      </div>
      <button type="submit" class="primary">Annoncer</button>
      <p class="form-error" id="bs-err"></p>
    </form>`);

  const carreChamp = document.getElementById('bs-carre');
  const hoteChamp = document.getElementById('bs-hote');
  const peintHotes = () => {
    hoteChamp.innerHTML = hotesDe(+carreChamp.value)
      .map((m) => `<option value="${m.user_id}"${state.user && m.user_id === state.user.id ? ' selected' : ''}>Hôte : ${esc(m.username)}</option>`)
      .join('');
  };
  peintHotes();
  if (carreChamp.tagName === 'SELECT') carreChamp.onchange = peintHotes;

  document.getElementById('bs-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/brainstorms', {
        method: 'POST',
        body: {
          carre_id: +carreChamp.value,
          hote_user_id: +hoteChamp.value,
          sujet: document.getElementById('bs-sujet').value,
          plateforme: document.getElementById('bs-plateforme').value,
          url: document.getElementById('bs-url').value,
        },
      });
      navigate(`/brainstorm/${r.id}`);
    } catch (err) { document.getElementById('bs-err').textContent = err.message; }
  };
}


function ideeHtml(i, duCarre) {
  return `<article class="idee${i.retenue ? ' idee--retenue' : ''}">
    <button type="button" class="idee-vote${i.mon_vote ? ' votee' : ''}" data-vote="${i.id}"
      aria-label="Soutenir">▲ ${i.votes}</button>
    <div class="idee-corps">
      <p>${esc(i.body)}</p>
      <div class="idee-meta">${authorLink(i.username)} · ${esc(formatDate(i.created_at))}
        ${i.retenue ? '<span class="idee-badge">★ retenue</span>' : ''}
        ${duCarre ? `<button type="button" class="link-btn" data-retient="${i.id}">${i.retenue ? 'relâcher' : '★ retenir'}</button>` : ''}
      </div>
    </div>
  </article>`;
}

async function pageBrainstorm(id) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  const charge = () => api(`/api/brainstorms/${id}`);
  let data;
  try { data = await charge(); }
  catch { return navigate('/brainstorm', true); }
  if (stale(epoch)) return;

  const rendu = (d) => {
    const b = d.brainstorm;
    const pilote = d.duCarre ? `
      <div class="bs-pilote">
        ${b.statut !== 'live' ? `<button type="button" data-statut="live" class="primary">Passer en direct</button>` : ''}
        ${b.statut === 'live' ? `<button type="button" data-statut="termine">Terminer</button>` : ''}
        ${b.statut === 'termine' ? `<button type="button" data-statut="live">Rouvrir</button>` : ''}
      </div>` : '';
    return `
      <p class="fil-retour"><a href="/brainstorm" data-link>← Brainstorm</a></p>
      <div class="bs-tete bs-${esc(b.statut)}">
        <div class="bs-statut">${b.statut === 'live' ? '● EN DIRECT' : b.statut === 'annonce' ? 'Annoncé' : 'Terminé'}</div>
        <h1>${esc(b.sujet)}</h1>
        <div class="bs-meta">${esc(b.carre_nom)}${b.hote_username ? ` · ${esc(b.hote_username)} à l’antenne` : ''} ·
          <a href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener">rejoindre le live sur ${esc(PLATEFORME_LABELS[b.plateforme] || b.plateforme)} ↗</a>
          ${d.duCarre && b.discord_url ? ` · <a href="${esc(safeUrl(b.discord_url))}" target="_blank" rel="noopener">salon du carré ↗</a>` : ''}</div>
        ${pilote}
      </div>
      ${b.statut !== 'termine' && state.user ? `
      <form id="idee-form" class="idee-form">
        <textarea id="idee-body" maxlength="500" rows="2"
          placeholder="Ta réflexion sur ce qui se dit…"></textarea>
        <button type="submit" class="primary">Proposer</button>
        <p class="form-error" id="idee-err"></p>
      </form>` : ''}
      <div id="bs-salle">
        <section class="bs-retenues" id="bs-retenues" ${d.retenues.length ? '' : 'hidden'}>
          <h2>La récolte du carré</h2>
          <div id="bs-retenues-liste">${d.retenues.map((i) => ideeHtml(i, d.duCarre)).join('')}</div>
        </section>
        <div class="bs-colonnes">
          <section><h2>En avant</h2><div id="bs-avant">
            ${d.enAvant.length ? d.enAvant.map((i) => ideeHtml(i, d.duCarre)).join('') : '<p class="empty-note">Les premières réflexions montent ici.</p>'}
          </div></section>
          <section><h2>Récentes</h2><div id="bs-recentes">
            ${d.recentes.length ? d.recentes.map((i) => ideeHtml(i, d.duCarre)).join('') : '<p class="empty-note">Rien encore.</p>'}
          </div></section>
        </div>
      </div>`;
  };

  docke('bs', 'scene', rendu(data));

  const rebranche = () => {
    const form = document.getElementById('idee-form');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const champ = document.getElementById('idee-body');
        if (!champ.value.trim()) return;
        try {
          await api(`/api/brainstorms/${id}/idees`, { method: 'POST', body: { body: champ.value } });
          champ.value = '';
          await rafraichit();
        } catch (err) { document.getElementById('idee-err').textContent = err.message; }
      };
    }
    app.querySelectorAll('[data-statut]').forEach((b) => {
      b.onclick = async () => {
        await api(`/api/brainstorms/${id}`, { method: 'PUT', body: { statut: b.dataset.statut } });
        data = await charge();
        if (stale(epoch)) return;
        docke('bs', 'scene', rendu(data));
        rebranche();
      };
    });
    // voter ou retenir sans redessiner la page. L'écouteur vit sur la salle :
    // le rafraîchissement ne remplace que l'intérieur des listes, et un
    // nouveau rendu le remplace avec elle.
    const salle = document.getElementById('bs-salle');
    if (salle) salle.addEventListener('click', async (e) => {
      const vote = e.target.closest('[data-vote]');
      const retient = e.target.closest('[data-retient]');
      if (!state.user || (!vote && !retient)) return;
      try {
        if (vote) await api(`/api/brainstorms/${id}/votes`, { method: 'POST', body: { idee_id: +vote.dataset.vote } });
        else await api(`/api/brainstorms/${id}/retenues`, { method: 'POST', body: { idee_id: +retient.dataset.retient } });
        await rafraichit();
      } catch { /* le battement suivant remettra tout d'aplomb */ }
    });
  };
  rebranche();

  // pendant un direct la salle bouge : douze secondes, onglet visible
  async function rafraichit() {
    let d;
    try { d = await charge(); } catch { return; }
    if (stale(epoch)) return;
    data = d;
    const avant = document.getElementById('bs-avant');
    const recentes = document.getElementById('bs-recentes');
    const retenues = document.getElementById('bs-retenues');
    if (avant) avant.innerHTML = d.enAvant.length ? d.enAvant.map((i) => ideeHtml(i, d.duCarre)).join('') : '<p class="empty-note">Les premières réflexions montent ici.</p>';
    if (recentes) recentes.innerHTML = d.recentes.length ? d.recentes.map((i) => ideeHtml(i, d.duCarre)).join('') : '<p class="empty-note">Rien encore.</p>';
    if (retenues) {
      retenues.hidden = !d.retenues.length;
      document.getElementById('bs-retenues-liste').innerHTML = d.retenues.map((i) => ideeHtml(i, d.duCarre)).join('');
    }
  }
  pageTimer = setInterval(() => {
    if (document.hidden) return;
    if (data.brainstorm.statut === 'live') rafraichit();
  }, 12000);
}

/* ------------------------------------ Game Master Orange (échelon 7) --- */

async function pageGmo() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try { data = await api('/api/gmo'); }
  catch { return navigate('/57', true); }
  if (stale(epoch)) return;

  const m = data.mecanismes;
  app.innerHTML = `
    <h1>Game Master Orange</h1>
    <p class="page-invite">${esc(m.intro)}</p>
    <div class="gmo-liste">
      ${m.mecanismes.map((x) => `
        <article class="gmo-mecanisme">
          <div class="gmo-numero">${x.numero}</div>
          <div class="gmo-corps">
            <h2>${esc(x.titre)}</h2>
            <ol class="gmo-etapes">${x.etapes.map((e) => `<li>${esc(e)}</li>`).join('')}</ol>
            ${x.page ? `<a class="btn gmo-outil" href="${esc(x.page)}" data-link>${esc(x.pageLabel)} →</a>` : ''}
          </div>
        </article>`).join('')}
    </div>`;
}

/* -------------------------------------------------------- interprétations */

// L'API sert les albums du plus ancien au plus récent (colonne `position`).
// L'accueil et les reprises les présentent dans l'autre sens : la dernière
// sortie en premier. L'ordre des morceaux à l'intérieur d'un album ne change
// pas : il suit toujours le numéro de piste.
function newestFirst(albums) {
  return [...albums].reverse();
}

/* ------------------------------------------------------------------ fil ---
   Les interprétations des autres, de la plus récente à la plus ancienne :
   le passage visé, puis ce qu'on en dit.                                  */

// Le passage sur lequel porte une interprétation, reconstitué sans avoir à
// charger tout le morceau.
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

function feedCard(it) {
  return `<article class="feed-card" data-ann="${it.id}">
    <div class="feed-head">
      <a class="feed-song" href="/chanson/${encodeURIComponent(it.song_slug)}" data-link>${esc(it.song_title)}</a>
      <span class="feed-date">${esc(formatDate(it.created_at))}</span>
    </div>
    <div class="feed-quote">${esc(feedQuote(it))}</div>
    <div class="annotation-body">${esc(it.content)}</div>
    <div class="feed-foot">par ${authorLink(it.username)}</div>
    ${socialFooter('annotation', it)}
  </article>`;
}

async function pageFeed() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  const data = await api('/api/feed?limit=15');
  if (stale(epoch)) return;
  state.feed = { items: data.items, more: data.more };
  renderFeedPage();
}

function renderFeedPage() {
  const { items, more } = state.feed;
  app.innerHTML = `
    <div class="breadcrumb"><a href="/interpretations" data-link>Interprétations</a></div>
    <h1>Le fil</h1>
    <p class="subtitle">Toutes les interprétations publiées, de la plus récente à la plus ancienne.</p>
    <div class="feed-list" id="feed-list">${items.map(feedCard).join('')
      || '<p class="empty-note">Aucune interprétation publiée pour l’instant.</p>'}</div>
    ${more ? '<p class="feed-more"><button type="button" class="btn" id="feed-more">Voir les précédentes</button></p>' : ''}`;
  bindSocial(document.getElementById('feed-list'));
  const btn = document.getElementById('feed-more');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    const data = await api(`/api/feed?limit=15&offset=${state.feed.items.length}`);
    state.feed.items = state.feed.items.concat(data.items);
    state.feed.more = data.more;
    renderFeedPage();
  };
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

  let recent = { items: [], more: false };
  try { recent = await api('/api/feed?limit=3'); } catch { /* le fil n'est pas vital */ }
  if (stale(epoch)) return;

  const feedBlock = `<section class="feed-block">
    <div class="feed-block-head">
      <h2>Les dernières interprétations</h2>
      <a class="btn" href="/fil" data-link>Voir le fil →</a>
    </div>
    <div class="feed-list" id="recent-list">${recent.items.map(feedCard).join('')
      || '<p class="empty-note">Aucune interprétation publiée pour l’instant.</p>'}</div>
  </section>`;

  app.innerHTML = '<h1>Interprétations</h1>' + feedBlock +
    '<h2 class="albums-title">Les morceaux</h2>' +
    (albums || '<p class="empty-note">Aucun album pour le moment.</p>');
  bindSocial(document.getElementById('recent-list'));
}

/* ------------------------------------------------------- connexion/compte */

// La session porte le membre et ce que son échelon a ouvert : on la relit
// après chaque connexion, sans quoi le menu resterait celui d'avant.
async function refreshSession() {
  try {
    const data = await api('/api/me');
    state.user = data.user;
    state.access = data.access || { interpretations: true, reprises: true };
    state.echelon = data.echelon || 1;
    state.attenteMs = data.attenteMs || 0;
  } catch {
    // même injoignable, le serveur n'aurait pas refusé le sol
    state.user = null;
    state.access = { interpretations: true, reprises: true };
    state.echelon = 1;
    state.attenteMs = 0;
  }
}

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
      await refreshSession();
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
      await refreshSession();
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
      app.innerHTML = `<h1>Chanson introuvable</h1><p><a href="/interpretations" data-link>Retour aux interprétations</a></p>`;
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

// L'étendue d'une cible, quelle que soit sa nature : un mot, une phrase et un
// passage se mesurent sur la même règle. [null, null] si la cible ne vise pas
// le texte (le titre, le morceau entier).
function cibleRange(a) {
  if (a.target_type === 'passage') return passageRange(a);
  if (a.target_type === 'word') return [posKey(a.line_id, a.word_start), posKey(a.line_id, a.word_end)];
  if (a.target_type === 'line') return [posKey(a.line_id, 0), posKey(a.line_id, 999)];
  return [null, null];
}

// Le texte visé par une cible, pour le citer au-dessus de ce qu'on en dit.
function cibleTexte(a) {
  const ligne = state.song.lines.find((l) => l.id === a.line_id);
  if (a.target_type === 'passage') {
    return passageText(a.line_id, a.word_start || 0, a.end_line_id, a.word_end == null ? 0 : a.word_end);
  }
  if (a.target_type === 'word' && ligne) return tokens(ligne.text).slice(a.word_start, a.word_end + 1).join(' ');
  return ligne ? ligne.text : '';
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

// Mot sous le pointeur ; à défaut, le mot le plus proche : glisser dans une
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
  // Un mot, des mots, une phrase ou plusieurs : c'est toujours un passage.
  // Un seul bloc, toujours le même : il englobe tous les cas.
  state.sel = { type: 'passage', startLine: a.lineId, startIdx: a.idx, endLine: b.lineId, endIdx: b.idx };
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
    const lineId = Number(el.dataset.line);
    const mots = SEL.words.filter((w) => w.lineId === lineId);
    if (!mots.length) return;
    state.sel = {
      type: 'passage',
      startLine: lineId, startIdx: mots[0].idx,
      endLine: lineId, endIdx: mots[mots.length - 1].idx,
    };
    renderSongPage();
  });

  // Aucun menu système ne doit s'ouvrir sur le texte : ni la loupe de
  // recherche, ni « copier ». La sélection est entièrement à nous.
  lyrics.addEventListener('contextmenu', (e) => e.preventDefault());
  lyrics.addEventListener('selectstart', (e) => e.preventDefault());

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
  const label = 'Passage';
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
      </div>`
    : `<div class="no-lyrics">Les paroles de « ${esc(song.title)} » seront bientôt disponibles.</div>`;

  app.innerHTML = `
    <div class="breadcrumb"><a href="/interpretations" data-link>Interprétations</a> › ${esc(song.album_title || 'Sans album')}</div>
    <h1>${esc(song.title)}</h1>
    <div class="song-targets">
      <button class="target-chip target-chip-write ${sel && sel.type === 'title' ? 'active' : ''}" id="target-title">
        Interpréter le titre${countFor('title') ? ` · ${countFor('title')}` : ''}
      </button>
      ${song.youtube_url ? `<a class="target-chip" href="${esc(safeUrl(song.youtube_url))}" target="_blank" rel="noopener">▶ Écouter</a>` : ''}
      ${state.access.reprises ? `<a class="target-chip" href="/chanson/${encodeURIComponent(song.slug)}/reprises" data-link>
        Reprises${state.song.coverCount ? ` · ${state.song.coverCount}` : ''}
      </a>` : ''}
    </div>
    <div class="song-layout">
      <div>
        ${lyricsHtml}
        <div id="inbound"></div>
      </div>
      <aside class="side-panel" id="panel"></aside>
    </div>
`;

  bindLyricsSelection();

  // La pastille du titre ouvre tout ce qui concerne le morceau pris en entier :
  // son titre, son sens général, les lectures d'ensemble et les connexions.
  document.getElementById('target-title').onclick = openSongModal;

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
  resetComposers();
  const { song } = state.song;
  // Un seul bloc : le morceau lui-même. Les lectures écrites autrefois sur
  // « le titre » et sur « le sens général » s'y retrouvent ensemble, et le
  // composeur permet d'y relier d'autres morceaux par une référence.
  const anns = annotationsFor((a) => a.target_type === 'title' || a.target_type === 'song');

  modal.innerHTML = `
    <button type="button" class="link-btn modal-close" id="song-modal-close" aria-label="Fermer">✕</button>
    <h2>« ${esc(song.title)} »</h2>
    ${anns.map((a) => annotationCard(a)).join('')
      || '<p class="empty-note">Aucune interprétation de ce morceau pour l’instant.</p>'}
    ${refBlocks((r) => r.target_type === 'title' || r.target_type === 'song')}
    ${composerHtml(true)}`;

  backdrop.hidden = false;
  modal.hidden = false;
  document.getElementById('song-modal-close').onclick = closeSongModal;
  bindComposer(modal, 0, { song_id: song.id, target_type: 'title' },
    `Que raconte « ${song.title} » ?`, 'Interpréter ce morceau', nextGridFor(anns));
  bindRefDeletes(modal);
  bindAnnotationActions(modal);
  bindSocial(modal);
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
  const refs = state.song.inboundRefs || [];
  if (!inbound.length && !refs.length) { container.innerHTML = ''; return; }

  const refsHtml = refs.length ? `
    <h2>Ce morceau est cité ailleurs</h2>
    <p class="hint">Des passages d'autres chansons qui renvoient à celui-ci.</p>
    ${refs.map((r) => `
      <div class="inbound">
        <div class="inbound-from">
          ↩ depuis <a href="/chanson/${encodeURIComponent(r.source_slug)}" data-link>${esc(r.source_title)}</a>,
          à propos de ${esc(inboundSourceLabel(r))}
        </div>
        <div class="inbound-anchor">« ${esc(inboundAnchorText(r))} »</div>
        ${r.note ? `<p class="ref-item-note">${esc(r.note)}</p>` : ''}
        <div class="annotation-head">${authorLink(r.username)}<span>${esc(formatDate(r.created_at))}</span></div>
      </div>`).join('')}` : '';

  if (!inbound.length) { container.innerHTML = refsHtml; return; }

  container.innerHTML = `
    <h2>Grilles de lecture venues d’autres morceaux</h2>
    <p class="hint">Des interprétations écrites sur d’autres chansons qui renvoient à un passage de celle-ci.</p>
    ${inbound.map((r) => `
      <div class="inbound" data-ann="${r.id}">
        <div class="inbound-from">
          ↩ depuis <a href="/chanson/${encodeURIComponent(r.source_slug)}" data-link>${esc(r.source_title)}</a>,
          à propos de ${esc(inboundSourceLabel(r))}
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
      </div>`).join('')}
    ${refsHtml}`;

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
      ? 'Toute la phrase est sélectionnée. Cliquez sur un mot pour restreindre (Maj+clic pour étendre).'
      : `Mots ${b.ws + 1} à ${b.we + 1}. <button class="link-btn" data-eb-whole="${side}">Reprendre toute la phrase</button>`}</div>`;
  }
  return `<div class="eb-block">
    <h4>Bloc ${side}</h4>
    <select data-eb-song="${side}">
      <option value="">Choisir un morceau…</option>
      ${songs.map((s) => `<option value="${s.id}" ${s.id === b.song_id ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}
    </select>
    <select data-eb-line="${side}" ${b.song_id ? '' : 'disabled'}>
      <option value="">Choisir une phrase…</option>
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
        <div class="essay-links-title">Échos trouvés dans l’œuvre. Cliquez pour remplir le bloc B :</div>
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
   propre bouton : greffée à l'interprétation, mais écrite à part.
   En interne, la cible n'est pas une œuvre mais un passage d'un morceau : la
   référence apparaît alors des deux côtés, ici et sur la chanson visée.    */

function refTitle(r) {
  if (r.ref_song_slug) {
    return `<a href="/chanson/${encodeURIComponent(r.ref_song_slug)}" data-link>♪ ${esc(r.label)}</a>`;
  }
  return `<span class="ref-work">${esc(r.label)}</span>${r.artist ? ` <span class="ref-artist-name">· ${esc(r.artist)}</span>` : ''}`;
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
    <div class="ref-grip ref-grip-note" role="separator" aria-label="Redimensionner la zone d’écriture"
         title="Faire glisser pour agrandir ou réduire"><span></span></div>
    <div class="ref-editor-actions">
      <button type="button" class="primary ref-commit">Ajouter cette référence</button>
      <button type="button" class="link-btn ref-cancel">Annuler</button>
    </div>
    <div class="error-msg ref-error"></div>
  </div>`;
}

// L'éditeur d'une référence interne : on choisit un morceau, puis on
// sélectionne le passage dans son texte, exactement comme on sélectionne un
// passage à interpréter. La base ne stocke que des identifiants de vers
// (ref_line_id..ref_end_line_id) : la sélection se fait donc au vers.
function refEditorInternal() {
  const songs = state.corpus.songs.filter((s) => state.corpus.lines.some((l) => l.song_id === s.id));
  return `<div class="ref-editor ref-editor-internal" data-kind="internal">
    <label>Le morceau</label>
    <select class="ref-song"><option value="">Choisir un morceau…</option>
      ${songs.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}
    </select>
    <div class="ref-lines" hidden></div>
    <div class="ref-grip" hidden role="separator" aria-label="Redimensionner la zone de texte"
         title="Faire glisser pour agrandir ou réduire"><span></span></div>
    <p class="ref-hint" hidden></p>
    <p class="ref-picked" hidden></p>
    <input type="hidden" class="ref-start"><input type="hidden" class="ref-end">
    <label>En quoi est-ce une référence ?</label>
    <textarea class="ref-note" rows="5" maxlength="2000"
      placeholder="Ce qui relie ce passage à celui-là…"></textarea>
    <div class="ref-grip ref-grip-note" role="separator" aria-label="Redimensionner la zone d’écriture"
         title="Faire glisser pour agrandir ou réduire"><span></span></div>
    <div class="ref-editor-actions">
      <button type="button" class="primary ref-commit">Ajouter cette référence</button>
      <button type="button" class="link-btn ref-cancel">Annuler</button>
    </div>
    <div class="error-msg ref-error"></div>
  </div>`;
}

// La zone où l'on choisit le passage s'agrandit et se réduit à la demande :
// selon qu'on cherche dans un texte long ou qu'on veut de la place pour
// écrire, ce n'est pas la même fenêtre qu'on veut.
function bindRefGrip(box, grip) {
  if (!box || !grip) return;
  let depart = 0;
  let hauteur = 0;
  const bouge = (e) => {
    const h = Math.max(80, Math.min(600, hauteur + (e.clientY - depart)));
    // les trois, pour que la règle tienne aussi bien sur une boîte à
    // défilement que sur un textarea, qui porte déjà un min-height
    box.style.minHeight = `${h}px`;
    box.style.maxHeight = `${h}px`;
    box.style.height = `${h}px`;
  };
  const lache = (e) => {
    grip.classList.remove('ref-grip--actif');
    grip.releasePointerCapture?.(e.pointerId);
    grip.removeEventListener('pointermove', bouge);
  };
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    depart = e.clientY;
    hauteur = box.getBoundingClientRect().height;
    grip.classList.add('ref-grip--actif');
    try { grip.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    grip.addEventListener('pointermove', bouge);
  });
  grip.addEventListener('pointerup', lache);
  grip.addEventListener('pointercancel', lache);
}

// Affiche le texte du morceau choisi et y gère la sélection d'un passage :
// un vers, puis un second pour étendre. Un nouvel appui sur le premier annule.
function bindRefSongPicker(editor) {
  // La zone d'écriture s'agrandit dans les deux sortes de référence : on la
  // câble avant tout, même quand il n'y a pas de morceau à choisir.
  bindRefGrip(editor.querySelector('.ref-note'), editor.querySelector('.ref-grip-note'));

  const songSel = editor.querySelector('.ref-song');
  if (!songSel) return;
  const box = editor.querySelector('.ref-lines');
  const grip = editor.querySelector('.ref-grip:not(.ref-grip-note)');
  const picked = editor.querySelector('.ref-picked');
  const hint = editor.querySelector('.ref-hint');
  bindRefGrip(box, grip);
  const startField = editor.querySelector('.ref-start');
  const endField = editor.querySelector('.ref-end');
  let lines = [];

  const paint = () => {
    const a = Number(startField.value) || 0;
    const b = Number(endField.value) || a;
    const nums = lines.filter((l) => l.id === a || l.id === b).map((l) => l.line_number);
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    box.querySelectorAll('.ref-line').forEach((el) => {
      const no = Number(el.dataset.no);
      el.classList.toggle('picked', a > 0 && no >= lo && no <= hi);
    });
    hint.hidden = false;
    hint.textContent = !a
      ? 'Touchez le premier vers du passage.'
      : (b === a && !Number(endField.value)
        ? 'Touchez le dernier vers, ou publiez pour n’en garder qu’un. Un nouveau toucher recommence.'
        : 'Un nouveau toucher recommence la sélection.');
    if (!a) { picked.hidden = true; editor.dataset.label = ''; return; }
    const first = lines.find((l) => l.line_number === lo);
    const last = lines.find((l) => l.line_number === hi);
    const song = songSel.options[songSel.selectedIndex].textContent;
    const quote = lo === hi ? first.text : `${first.text} […] ${last.text}`;
    editor.dataset.label = `${song} : « ${quote} »`;
    picked.hidden = false;
    picked.innerHTML = `<span class="ref-picked-quote">« ${esc(quote)} »</span>
      <button type="button" class="link-btn ref-picked-clear">changer</button>`;
    picked.querySelector('.ref-picked-clear').onclick = () => {
      startField.value = ''; endField.value = ''; paint();
    };
  };

  // Trois temps : premier vers, dernier vers, puis un clic recommence depuis
  // le vers touché. Sans ce troisième temps, le début restait figé et on ne
  // pouvait que rogner la fin.
  const onLine = (el) => {
    const id = Number(el.dataset.id);
    const hasStart = !!startField.value;
    const hasEnd = !!endField.value;

    if (!hasStart || hasEnd) {
      startField.value = id;
      endField.value = '';
      paint();
      return;
    }
    if (Number(startField.value) === id) {
      startField.value = '';
      endField.value = '';
      paint();
      return;
    }
    const a = lines.find((l) => l.id === Number(startField.value));
    const b = lines.find((l) => l.id === id);
    if (b.line_number < a.line_number) { startField.value = b.id; endField.value = a.id; }
    else { endField.value = b.id; }
    paint();
  };

  songSel.onchange = () => {
    const songId = Number(songSel.value);
    lines = state.corpus.lines.filter((l) => l.song_id === songId);
    startField.value = '';
    endField.value = '';
    box.hidden = !lines.length;
    grip.hidden = !lines.length;
    hint.hidden = !lines.length;
    box.innerHTML = lines.map((l) =>
      `<button type="button" class="ref-line" data-id="${l.id}" data-no="${l.line_number}">${esc(l.text)}</button>`
    ).join('');
    box.querySelectorAll('.ref-line').forEach((el) => { el.onclick = () => onLine(el); });
    paint();
  };
}

// Une référence composée, en attente de publication avec l'interprétation.
function refStagedHtml(ref) {
  const title = ref.ref_line_id
    ? `♪ ${esc(ref._label || 'Passage d’un morceau')}`
    : `${esc(ref.label)}${ref.artist ? ` : ${esc(ref.artist)}` : ''}`;
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
    if (!start) { err.textContent = 'Sélectionnez le passage référencé dans le texte.'; return null; }
    const end = editor.querySelector('.ref-end').value || start;
    return {
      ref_line_id: Number(start), ref_end_line_id: Number(end), note,
      _label: editor.dataset.label || '',
    };
  }
  const label = editor.querySelector('.ref-label').value.trim();
  if (!label) { err.textContent = 'Nommez l’œuvre référencée.'; return null; }
  return { label, artist: editor.querySelector('.ref-artist').value.trim(), note };
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
    ${socialFooter('annotation', a)}
  </div>`;
}

// Le numéro de la prochaine grille de lecture que cet auteur écrirait sur
// cette cible : 1 pour une première lecture, sinon la suite de ses lectures
// déjà écrites ici (superposition simultanée : chacune s'ajoute, sans
// remplacer les précédentes).
function nextGridFor(anns) {
  const u = state.user;
  if (!u) return 1;
  const mine = anns.filter((a) => a.user_id === u.id);
  return mine.length ? Math.max(...mine.map((a) => a.grid_number)) + 1 : 1;
}

/* --------------------------------------------- écrire sur un passage ---
   Sur une même cible, trois choses indépendantes peuvent être dites, de la
   plus fréquente à la plus rare : une interprétation, une référence à un
   passage d'un autre morceau, une référence à une œuvre. On choisit d'abord
   laquelle : ce ne sont pas des annexes l'une de l'autre.               */

function passageRefsFor(pred) {
  return (state.song.passageRefs || []).filter(pred);
}

// Une référence autonome, affichée comme un bloc à part entière.
function refCard(r) {
  const u = state.user;
  const own = u && (u.id === r.user_id || u.is_admin);
  const title = r.kind === 'internal'
    ? `<a href="/chanson/${encodeURIComponent(r.ref_song_slug || '')}" data-link>♪ ${esc(r.label)}</a>`
    : `<span class="ref-work">${esc(r.label)}</span>${r.artist ? ` <span class="ref-artist-name">· ${esc(r.artist)}</span>` : ''}`;
  return `<div class="ref-block" data-pref="${r.id}">
    <div class="ref-item-head">
      ${title}
      ${own ? `<button type="button" class="link-btn" data-pref-del="${r.id}" title="Supprimer">✕</button>` : ''}
    </div>
    ${r.note ? `<p class="ref-item-note">${esc(r.note)}</p>` : ''}
    <div class="annotation-head">${authorLink(r.username)}<span>${esc(formatDate(r.created_at))}</span></div>
  </div>`;
}

// Les deux listes de références d'une cible, dans l'ordre de fréquence.
function refBlocks(pred) {
  const refs = passageRefsFor(pred);
  const internal = refs.filter((r) => r.kind === 'internal');
  const work = refs.filter((r) => r.kind !== 'internal');
  return (internal.length ? `<div class="ref-group"><h4>Références à un passage d'un autre morceau</h4>${internal.map(refCard).join('')}</div>` : '')
       + (work.length ? `<div class="ref-group"><h4>Références à une œuvre</h4>${work.map(refCard).join('')}</div>` : '');
}

let composerSeq = 0;
function resetComposers() { composerSeq = 0; }

// `seulInterp` : sur le morceau pris en entier, on n'écrit qu'une
// interprétation : pas de référence. Le choix n'a alors plus lieu d'être, et
// le formulaire s'ouvre directement.
function composerHtml(seulInterp) {
  if (!state.user) {
    return '<p class="empty-note"><a href="/connexion" data-link>Connectez-vous</a> pour contribuer.</p>';
  }
  return `<div class="composer" data-composer="${composerSeq++}"${seulInterp ? ' data-seul="1"' : ''}>
    <div class="write-picker"${seulInterp ? ' hidden' : ''}>
      <button type="button" class="btn write-pick" data-mode="interp">✍ Interprétation</button>
      <button type="button" class="btn write-pick" data-mode="internal">♪ Référence à un passage</button>
      <button type="button" class="btn write-pick" data-mode="work">◆ Référence à une œuvre</button>
    </div>
    <div class="write-slot"></div>
  </div>`;
}

function bindComposer(container, index, payload, placeholder, buttonLabel, nextGrid) {
  const comp = container.querySelector(`[data-composer="${index}"]`);
  if (!comp) return;
  const slot = comp.querySelector('.write-slot');
  const picker = comp.querySelector('.write-picker');
  const seul = comp.dataset.seul === '1';
  const close = () => { slot.innerHTML = ''; picker.hidden = seul; if (seul) ouvreInterp(); };

  // Sans choix à faire, le champ d'interprétation est là d'emblée.
  const ouvreInterp = () => {
    slot.innerHTML = annotationForm('panel-ann-form', placeholder, buttonLabel, nextGrid);
    bindAnnotationForm('panel-ann-form', payload);
    const annuler = slot.querySelector('.composer-cancel');
    if (annuler) annuler.hidden = seul;
    if (annuler && !seul) annuler.onclick = close;
  };
  if (seul) { ouvreInterp(); return; }

  comp.querySelectorAll('.write-pick').forEach((b) => {
    b.onclick = async () => {
      picker.hidden = true;
      if (b.dataset.mode === 'interp') {
        slot.innerHTML = annotationForm('panel-ann-form', placeholder, buttonLabel, nextGrid);
        bindAnnotationForm('panel-ann-form', payload);
        const cancel = slot.querySelector('.composer-cancel');
        if (cancel) cancel.onclick = close;
        return;
      }
      if (b.dataset.mode === 'internal') await loadCorpus();
      slot.innerHTML = b.dataset.mode === 'internal' ? refEditorInternal() : refEditorFree();
      const editor = slot.querySelector('.ref-editor');
      bindRefSongPicker(editor);
      editor.querySelector('.ref-cancel').onclick = close;
      const commit = editor.querySelector('.ref-commit');
      commit.textContent = 'Publier cette référence';
      commit.onclick = async () => {
        const ref = readRefEditor(editor);
        if (!ref) return;
        delete ref._label;
        if (!ref.note) {
          editor.querySelector('.ref-error').textContent = 'Expliquez en quoi c’est une référence.';
          return;
        }
        try {
          await api('/api/passage-references', { method: 'POST', body: { ...payload, ...ref } });
          await pageSong(state.song.song.slug, true);
        } catch (err) { editor.querySelector('.ref-error').textContent = err.message; }
      };
    };
  });
}

function bindRefDeletes(container) {
  container.querySelectorAll('[data-pref-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Supprimer cette référence ?')) return;
      try {
        await api(`/api/passage-references/${btn.dataset.prefDel}`, { method: 'DELETE' });
        await pageSong(state.song.song.slug, true);
      } catch (err) { alert(err.message); }
    };
  });
}

function annotationForm(id, placeholder, buttonLabel, nextGrid = 1) {
  if (!state.user) {
    return `<p class="empty-note"><a href="/connexion" data-link>Connectez-vous</a> pour proposer une interprétation.</p>`;
  }
  return `<form class="annotation-form" id="${id}">
    ${nextGrid > 1 ? `<div class="grid-label grid-label-next">Nouvelle grille de lecture n°${nextGrid}</div>` : ''}
    <textarea placeholder="${esc(placeholder)}" required maxlength="5000"></textarea>
    <div class="error-msg"></div>
    <div class="composer-actions">
      <button type="submit" class="primary">${esc(nextGrid > 1 ? `Publier la grille de lecture n°${nextGrid}` : buttonLabel)}</button>
      <button type="button" class="link-btn composer-cancel">Annuler</button>
    </div>
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
  resetComposers();
  const panel = document.getElementById('panel');
  const { song, lines } = state.song;
  const sel = state.sel;
  const duration = mmss(song.duration_seconds);
  let html = '';
  const forms = []; // [id, payload]

  if (sel && sel.type === 'passage') {
    const quote = passageText(sel.startLine, sel.startIdx, sel.endLine, sel.endIdx);
    const [s0, s1] = selPassageRange(sel);
    // Un seul bloc, qui ramasse tout ce qui touche au passage choisi : y
    // compris ce qui fut écrit du temps où un mot et une phrase avaient
    // chacun le leur.
    const touche = (x) => {
      const [a0, a1] = cibleRange(x);
      return a0 !== null && a0 <= s1 && s0 <= a1;
    };
    const passAnns = annotationsFor(touche);
    html += `<div class="panel-card">
      <h3>Le passage</h3>
      <div class="panel-target">« ${esc(quote)} »</div>
      ${passAnns.map((a) => annotationCard(a, `« ${esc(cibleTexte(a))} »`)).join('')
        || '<p class="empty-note">Aucune interprétation ici pour l’instant.</p>'}
      ${refBlocks(touche)}
      ${composerHtml()}
    </div>
    <button class="link-btn" id="clear-sel">← Revenir à la chanson</button>`;
    forms.push([{
      song_id: song.id, target_type: 'passage', line_id: sel.startLine, end_line_id: sel.endLine,
      word_start: sel.startIdx, word_end: sel.endIdx,
    }, 'Que raconte ce passage ?', 'Interpréter ce passage', nextGridFor(passAnns)]);
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
        ${refBlocks((r) => r.target_type === 'word' && r.line_id === sel.lineId &&
          r.word_start <= sel.end && r.word_end >= sel.start)}
        ${composerHtml()}
      </div>`;
      forms.push([{ song_id: song.id, target_type: 'word', line_id: sel.lineId, word_start: sel.start, word_end: sel.end },
        `Que signifie « ${quote} » ici ?`, 'Interpréter ces mots', nextGridFor(wordAnns)]);
    }

    const lineAnns = annotationsFor((a) => a.target_type === 'line' && a.line_id === sel.lineId);
    html += `<div class="panel-card">
      <h3>La phrase</h3>
      <div class="panel-target">« ${esc(line ? line.text : '')} »</div>
      ${lineAnns.map((a) => annotationCard(a)).join('') || '<p class="empty-note">Aucune interprétation pour l’instant.</p>'}
      ${refBlocks((r) => r.target_type === 'line' && r.line_id === sel.lineId)}
      ${composerHtml()}
    </div>
    <button class="link-btn" id="clear-sel">← Revenir à la chanson</button>`;
    forms.push([{ song_id: song.id, target_type: 'line', line_id: sel.lineId },
      'Que signifie cette phrase ?', 'Interpréter cette phrase', nextGridFor(lineAnns)]);
  } else if (sel && sel.type === 'title') {
    const titleAnns = annotationsFor((a) => a.target_type === 'title');
    html += `<div class="panel-card">
      <h3>Le titre « ${esc(song.title)} »</h3>
      ${titleAnns.map((a) => annotationCard(a)).join('') || '<p class="empty-note">Aucune interprétation du titre pour l’instant.</p>'}
      ${refBlocks((r) => r.target_type === 'title')}
      ${composerHtml()}
    </div>
    <button class="link-btn" id="clear-sel">← Revenir à la chanson</button>`;
    forms.push([{ song_id: song.id, target_type: 'title' },
      `Pourquoi ce titre, « ${song.title} » ?`, 'Interpréter le titre', nextGridFor(titleAnns)]);
  } else {
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
  forms.forEach(([payload, placeholder, label, grid], i) => {
    bindComposer(panel, i, payload, placeholder, label, grid);
  });
  bindRefDeletes(panel);
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
          <option value="">Choisir une chanson…</option>
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
// ou null si le lien ne pointe pas vers YouTube : dans ce cas la reprise
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

// `opts.solo` : la reprise est déjà présentée par ce qui l'entoure (le fil
// d'un profil, par exemple), qui porte l'auteur et la date : on ne les répète
// pas ici, mais le bouton de suppression reste à sa place.
function coverCard(c, opts = {}) {
  const u = state.user;
  const own = u && (u.id === c.user_id || u.is_admin);
  const ytId = youtubeEmbedId(c.url);
  return `<div class="cover-card" data-cover="${c.id}">
    ${ytId
      ? `<div class="cover-embed"><iframe src="https://www.youtube.com/embed/${esc(ytId)}"
          title="${esc(c.title)}" loading="lazy" allowfullscreen></iframe></div>`
      : `<a class="cover-link" href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer">▶ Voir la reprise</a>`}
    <div class="cover-head">
      <h4>${esc(c.title)}</h4>
      ${c.song_slug && !opts.solo ? `<a class="cover-song-tag" href="/chanson/${encodeURIComponent(c.song_slug)}/reprises" data-link>${esc(c.song_title)}</a>` : ''}
      <div class="annotation-head">
        ${opts.solo ? '' : `${authorLink(c.username)}<span>${esc(formatDate(c.created_at))}</span>`}
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

// Page dédiée aux reprises d'un morceau : distincte de la page
// d'interprétation (paroles, annotations, essais, connexions) : ici il n'y a
// que les réalisations de la communauté pour ce morceau, et rien d'autre.
async function pageSongCovers(slug) {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  let data;
  try {
    data = await api(`/api/songs/${encodeURIComponent(slug)}/covers`);
  } catch {
    if (!stale(epoch)) app.innerHTML = '<h1>Chanson introuvable</h1><p><a href="/interpretations" data-link>Retour aux interprétations</a></p>';
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
    <div class="breadcrumb"><a href="/interpretations" data-link>Interprétations</a> › ${esc(song.album_title || 'Sans album')} ›
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

/* ------------------------------------------------------ profil = timeline

   La page de profil EST le fil de ce qu'un membre a fait ici, du plus récent
   au plus ancien : interprétations, interprétations d'ensemble, références,
   connexions, reprises, et les publications qui ont rendu tout cela visible.
   Un seul fil, daté de bout en bout : ni sections, ni compteurs, ni
   présentation.                                                          */

const TIMELINE_KIND = {
  interpretation: 'Interprétation',
  ensemble: 'Interprétation d’ensemble',
  reference: 'Référence',
  connexion: 'Connexion',
  reprise: 'Reprise',
  publication: 'Publication',
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

const draftBadge = (it) => (it.is_published ? '' : '<span class="draft-badge">Brouillon</span>');

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
    if (!stale(epoch)) app.innerHTML = '<h1>Membre introuvable</h1><p><a href="/interpretations" data-link>Retour aux interprétations</a></p>';
    return;
  }
  if (stale(epoch)) return;

  const { user, jeu, stats, annotations, essays, passageRefs, connections, versions, covers } = data;
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
  // Les reprises n'entrent dans le fil qu'une fois leur page ouverte : tant
  // qu'on n'y a pas accès, le profil s'en tient aux interprétations.
  for (const c of (state.access.reprises ? covers : [])) {
    add(c.created_at, timelineEntry('reprise', c.created_at, {
      // depuis une reprise, on va vers les reprises du morceau
      where: c.song_slug
        ? `<a href="/chanson/${encodeURIComponent(c.song_slug)}/reprises" data-link>${esc(c.song_title)}</a>`
        : '',
      // l'auteur et la date sont déjà dans l'entête de l'entrée
      body: coverCard(c, { solo: true }),
    }));
  }
  for (const v of versions) {
    add(v.published_at, timelineEntry('publication', v.published_at, {
      badge: `<span class="tl-version">n°${v.number}</span>`,
      body: `<div class="tl-count">${v.item_count} bloc${v.item_count > 1 ? 's' : ''}</div>`,
    }));
  }
  entries.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  const pending = stats.draft_count;
  app.innerHTML = `
    <div class="profile-head">
      ${avatarImg(user.username, 'profile-avatar')}
      <h1>${esc(user.username)}${user.is_admin ? ' <span class="album-date">artiste</span>' : ''}</h1>
      ${isMe ? `<button type="button" class="icon-btn" id="settings-btn"
        title="Paramètres du compte" aria-label="Paramètres du compte">⚙</button>` : ''}
    </div>
    ${jeuHtml(jeu)}
    ${isMe ? `<div class="profile-publish">
      <button type="button" class="primary" id="publish-btn" ${pending ? '' : 'disabled'}>
        Publier la version actuelle${pending ? ` · ${pending}` : ''}
      </button>
      <div class="error-msg" id="publish-error"></div>
    </div>` : ''}
    ${data.restreint ? '' : `<div class="timeline">${entries.map((e) => e.html).join('')
      || '<p class="empty-note">Rien pour l’instant.</p>'}</div>`}`;

  if (isMe) {
    document.getElementById('settings-btn').onclick = () => openSettings();
    const publishBtn = document.getElementById('publish-btn');
    if (pending) publishBtn.onclick = async () => {
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
  if (covers.length && state.access.reprises) {
    bindSocial(app, { reload: () => pageProfile(username), render: () => pageProfile(username) });
    bindCoverDeletes(app, () => pageProfile(username));
  }
}

/* ------------------------------------------------------------------ reprises */

// Arborescence de toutes les reprises publiées : album (ordre de sortie) →
// morceau (ordre de piste) → reprises, de la plus récente à la plus ancienne.
// Même mise en page que l'accueil (albums → morceaux) : c'est en ouvrant un
// morceau qu'on retrouve toutes ses reprises, sur sa page dédiée.
// Le fil des reprises, sur le même modèle que celui des interprétations.
async function pageCoverFeed() {
  const epoch = newEpoch();
  app.innerHTML = '<div class="loading">Chargement…</div>';
  const data = await api('/api/covers/feed?limit=12');
  if (stale(epoch)) return;
  state.coverFeed = { items: data.items, more: data.more };
  renderCoverFeedPage();
}

function renderCoverFeedPage() {
  const { items, more } = state.coverFeed;
  app.innerHTML = `
    <div class="breadcrumb"><a href="/reprises" data-link>Reprises</a></div>
    <h1>Le fil des reprises</h1>
    <p class="subtitle">Toutes les reprises des membres, de la plus récente à la plus ancienne.</p>
    <div class="covers-grid" id="cover-feed">${items.map(coverCard).join('')
      || '<p class="empty-note">Aucune reprise pour l’instant.</p>'}</div>
    ${more ? '<p class="feed-more"><button type="button" class="btn" id="cover-more">Voir les précédentes</button></p>' : ''}`;
  const list = document.getElementById('cover-feed');
  bindSocial(list);
  bindCoverDeletes(list, pageCoverFeed);
  const btn = document.getElementById('cover-more');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    const data = await api(`/api/covers/feed?limit=12&offset=${state.coverFeed.items.length}`);
    state.coverFeed.items = state.coverFeed.items.concat(data.items);
    state.coverFeed.more = data.more;
    renderCoverFeedPage();
  };
}

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

  let recent = { items: [] };
  try { recent = await api('/api/covers/feed?limit=3'); } catch { /* le fil n'est pas vital */ }
  if (stale(epoch)) return;

  const feedBlock = `<section class="feed-block">
    <div class="feed-block-head">
      <h2>Les dernières reprises</h2>
      <a class="btn" href="/reprises/fil" data-link>Voir le fil →</a>
    </div>
    <div class="covers-grid" id="recent-covers">${recent.items.map(coverCard).join('')
      || '<p class="empty-note">Aucune reprise pour l’instant.</p>'}</div>
  </section>`;

  app.innerHTML = `<h1>Reprises</h1>${feedBlock}<h2 class="albums-title">Les morceaux</h2>${albums}`;
  const list = document.getElementById('recent-covers');
  bindSocial(list);
  bindCoverDeletes(list, pageCovers);
}

/* --------------------------------------------------- les énigmes (/57) */

/* Page 57 : un escape game. Aucun texte, aucune explication, aucun indice :
   un élément, un « = », un champ. Rien de ce qui est à trouver n'apparaît
   ici : ni réponse, ni nom de classe, ni identifiant. Le Worker ne renvoie
   une réponse qu'une fois trouvée. */

async function pageEnigmes() {
  const epoch = newEpoch();
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
  // Le bloc qui ne dit ni son nom ni son compte est d'une autre nature : il
  // occupe toute la largeur et se distingue à l'œil.
  const rang = n.total === null ? 'enigme enigme--graal' : 'enigme';
  if (n.locked) return `${rang} enigme--locked`;
  if (!n.open) return `${rang} enigme--solved`;
  if (n.found.length || (n.partiels && n.partiels.length)) return `${rang} enigme--partial`;
  return rang;
}

// Un seul champ par élément, même quand il porte plusieurs sens : les
// réponses s'empilent au-dessus au fur et à mesure, dans n'importe quel ordre.
//
// Un élément sans libellé n'a pas d'entête du tout, et le serveur ne dit pas
// combien de mots de passe il cache : ni titre, ni compte.
function nodeCardHtml(n) {
  const counter = n.total > 1
    ? `<span class="enigme-count">${n.found.length}<span>/${n.total}</span></span>` : '';
  const head = n.source || counter
    ? `<div class="enigme-head">
      <span class="enigme-source">${esc(n.source)}</span>${counter}
    </div>`
    : '';

  if (n.locked) {
    const missing = n.requires
      .map((r) => `<button type="button" class="link-btn enigme-goto" data-goto="${esc(r.node)}">${esc(r.label)}</button>`)
      .join('');
    return `${head}<div class="enigme-body">
      <p class="enigme-locked-note"><span class="enigme-lock" aria-label="verrouillé">🔒</span>${missing}</p>
    </div>`;
  }

  const found = n.found
    .map((a) => `<p class="enigme-line"><strong class="enigme-answer">${esc(a.label)}</strong></p>`)
    .join('');

  // Un signe tenu partiellement : ses parties trouvées en vert, à leur place,
  // un « ? » pour chaque trou. Le serveur n'envoie jamais le texte manquant.
  const partiels = (n.partiels || [])
    .map((p) => `<p class="enigme-line enigme-partiel">${p.jetons
      .map((j) => esc(j.sep) + (j.q ? '<span class="seg-q">?</span>' : `<strong class="seg-ok">${esc(j.t)}</strong>`))
      .join('')}</p>`)
    .join('');

  const form = !n.open ? '' : `
    <form class="enigme-form">
      <input class="enigme-input" type="text" placeholder="signe"
             autocomplete="off" autocapitalize="off" autocorrect="off"
             spellcheck="false" enterkeyhint="go" maxlength="200"
             aria-label="Signe${n.source ? ` pour ${esc(n.source)}` : ''}">
      <button type="submit" class="primary" aria-label="Valider">
        <span class="enigme-go">→</span><span class="enigme-go-text">Valider</span>
      </button>
    </form>
    <p class="enigme-msg" role="status" aria-live="polite"></p>`;

  return `${head}<div class="enigme-body">${found}${partiels}${form}</div>`;
}

// On ne dit jamais combien il y a de mots de passe en tout : la barre montre
// le chemin qu'il reste dans l'échelon en cours, et rien de plus.
function enigmesProgressHtml() {
  const d = state.enigmes;
  const pct = Math.round((d.step / d.perEchelon) * 100);
  return `
    <div class="progress-bar"><span style="width:${pct}%"></span></div>
    <p class="progress-text"><strong>Échelon ${d.echelon}</strong></p>`;
}

/* --------------------------------------------------------- l'attente ---
   Proposer un mot de passe ferme les champs pour une heure. Rien ne
   l'annonce et rien ne l'explique : le décompte prend simplement la place
   du bouton, et tout revient de soi-même quand il s'achève.             */

let attenteTimer = null;

// Jusqu'à l'heure on lit des minutes:secondes ; au-delà, « 720:00 » ne dit
// plus rien à personne : on écrit les heures en toutes lettres de chiffres.
function attenteLabel(ms) {
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) {
    return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function appliqueAttente() {
  const jusqua = state.enigmesAttenteFin || 0;
  const reste = Math.max(0, jusqua - Date.now());
  const grille = document.querySelector('.enigmes-grid');
  if (grille) grille.classList.toggle('enigmes-grid--attente', reste > 0);

  document.querySelectorAll('.enigme-form').forEach((f) => {
    const champ = f.querySelector('.enigme-input');
    const bouton = f.querySelector('button[type="submit"]');
    if (champ) champ.disabled = reste > 0;
    if (!bouton) return;
    bouton.disabled = reste > 0;
    const texte = reste > 0 ? attenteLabel(reste) : null;
    f.querySelector('.enigme-go').textContent = texte ?? '→';
    f.querySelector('.enigme-go-text').textContent = texte ?? 'Valider';
  });

  if (reste <= 0 && attenteTimer) { clearInterval(attenteTimer); attenteTimer = null; }
}

// `ms` vient du serveur : un rechargement de page ne raccourcit rien.
function armeAttente(ms) {
  state.enigmesAttenteFin = ms > 0 ? Date.now() + ms : 0;
  appliqueAttente();
  if (ms > 0 && !attenteTimer) attenteTimer = setInterval(appliqueAttente, 1000);
}

// L'attente appartient à une session. Se déconnecter sans recharger la page
// laissait le décompte battre sur le 57 redevenu anonyme : il y grisait le
// champ et remplaçait « Valider » par des minutes qui ne voulaient plus rien
// dire. On le coupe donc avec la session.
function oublieAttente() {
  if (attenteTimer) { clearInterval(attenteTimer); attenteTimer = null; }
  state.enigmesAttenteFin = 0;
  state.attenteMs = 0;
}

function renderEnigmesPage() {
  const d = state.enigmes;

  const nodes = d.nodes
    .map((n) => `<article class="${nodeClass(n)}" id="e-${esc(n.id)}">${nodeCardHtml(n)}</article>`)
    .join('');

  // Sans compte on lit la page entière, à pleine encre. Seul le bouton
  // Valider est éteint, et les deux boutons disent quoi faire, sans une
  // phrase.
  const invite = d.anonyme ? `
    <p class="enigmes-gate-actions">
      <a href="/connexion" data-link class="btn">Se connecter</a>
      <a href="/inscription" data-link class="btn">Créer un compte</a>
    </p>` : '';

  app.innerHTML = `
    <h1>57</h1>
    <div class="enigmes-progress" id="enigmes-progress">${enigmesProgressHtml()}</div>
    ${invite}
    <div class="enigmes-grid">${nodes}</div>`;

  d.nodes.forEach((n) => {
    const el = document.getElementById('e-' + n.id);
    if (!el) return;
    el.dataset.sig = JSON.stringify(n);
    // Les renvois d'une carte verrouillée vers ce qui lui manque ne sont pas
    // un geste de jeu : ils marchent aussi sans compte, sinon un lien de la
    // couleur de l'accent resterait mort sous le doigt.
    if (d.anonyme) bindEnigmeGoto(el);
    else bindEnigmeCard(el, n);
  });
  if (d.anonyme) { oublieAttente(); figeChamps(); }
  else armeAttente(d.attenteMs || 0);
}

// Sans compte, le bouton d'envoi est coupé mais la lecture reste ouverte. Le champ garde son encre
// et son « mot de passe » : seul le bouton s'éteint. La touche Entrée ne doit
// pas non plus emporter la page : sans compte, aucune carte n'est branchée,
// donc rien n'arrêterait l'envoi natif du formulaire.
function figeChamps() {
  document.querySelectorAll('.enigme-form').forEach((f) => {
    const bouton = f.querySelector('button[type="submit"]');
    if (bouton) bouton.disabled = true;
    f.addEventListener('submit', (e) => e.preventDefault());
  });
}

// Après chaque tentative, le serveur renvoie l'état complet : on ne réécrit
// que ce qui a changé, pour ne pas perdre le focus ni la position de
// défilement (essentiel sur mobile, clavier ouvert).
function applyEnigmesState(data, focusId) {
  const echelonAvant = state.enigmes ? state.enigmes.echelon : null;
  state.enigmes = data;

  const prog = document.getElementById('enigmes-progress');
  if (prog) prog.innerHTML = enigmesProgressHtml();

  // Un échelon franchi peut ouvrir une page : le menu doit suivre aussitôt.
  if (data.access && data.echelon !== echelonAvant) {
    state.access = data.access;
    renderNav();
  }

  data.nodes.forEach((n) => {
    const el = document.getElementById('e-' + n.id);
    if (!el) return;
    const sig = JSON.stringify(n);
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.className = nodeClass(n);
    el.innerHTML = nodeCardHtml(n);
    bindEnigmeCard(el, n);
  });

  armeAttente(data.attenteMs || 0);
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
  if (input && !input.disabled) input.select();
  if (navigator.vibrate) navigator.vibrate(40);
}

// L'essai qu'on vient de faire, rendu mot pour mot : en vert ce qui était
// juste, en rouge ce qui ne l'était pas. « 10 mains » garde donc son 10 en
// vert, et dit que « mains » ne vaut rien : la carte, elle, garde « 10 ? ».
// La carte a pu être redessinée entre-temps : on la retrouve par son
// identifiant.
function montreEssai(nodeId, echo) {
  if (!echo || !echo.length) return;
  const carte = document.getElementById('e-' + nodeId);
  const zone = carte && carte.querySelector('.enigme-msg');
  if (!zone) return;
  zone.innerHTML = echo
    .map((m) => `<span class="${m.ok ? 'essai-ok' : 'essai-faux'}">${esc(m.t)}</span>`)
    .join(' ');
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
      const msgAvant = el.querySelector('.enigme-msg');
      if (msgAvant) msgAvant.innerHTML = '';
      btn.disabled = true;
      try {
        const res = await api('/api/57/guess', { method: 'POST', body: { id: n.id, answer } });
        // Juste ou faux, l'essai est joué : le clavier se referme et tout se
        // fige jusqu'au bout de l'heure.
        input.blur();
        if (res.ok) {
          applyEnigmesState(res.state, n.id);
        } else {
          armeAttente(res.attenteMs || 0);
          enigmeWrong(el, input);
        }
        montreEssai(n.id, res.echo);
      } catch (err) {
        // Un essai trop tôt : le serveur dit combien de temps il reste.
        if (err.data && err.data.attenteMs) {
          input.blur();
          armeAttente(err.data.attenteMs);
          return;
        }
        btn.disabled = false;
        const msg = el.querySelector('.enigme-msg');
        if (msg) msg.textContent = err.message;
      }
    };
  }

  const field = el.querySelector('.enigme-input');
  if (field) field.oninput = () => el.classList.remove('enigme--wrong');

  bindEnigmeGoto(el);
}

// Le renvoi d'une carte verrouillée vers l'élément qui lui manque : il ne
// touche pas au jeu, il ne fait que déplacer le regard. À part, donc, pour
// servir aussi les visiteurs sans compte.
function bindEnigmeGoto(el) {
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
