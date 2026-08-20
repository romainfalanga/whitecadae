// WhiteCadae : les signes de l'EP 57 (page /57)
//
// ATTENTION : ce fichier est du code Worker. Il n'est JAMAIS servi au
// navigateur : c'est toute la raison de son existence. Les réponses ne
// partent au client qu'une fois trouvées. Ne recopiez rien de tout ceci
// dans public/, sinon le jeu se résout avec la console du navigateur.
//
// La page est un escape game : aucun texte, aucune explication, aucun
// indice. Un élément, un « = », un champ. Les champs `note` et `quotes`
// ci-dessous ne sont PAS envoyés au client ni affichés : ils ne servent
// qu'à documenter, ici, pourquoi telle réponse est la bonne.

/* ------------------------------------------------------- normalisation */

// Une réponse tapée au clavier sur un téléphone ne sera jamais exacte au
// caractère près : on ramène tout à des minuscules sans accent ni ponctuation
// avant de comparer.
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/* ----------------------------------------------------------------- nœuds */

// Un nœud = un élément de l'arborescence, avec un seul champ de saisie même
// quand il porte plusieurs sens. Les réponses se révèlent au fur et à mesure,
// dans n'importe quel ordre.
//
// source      : ce qui est écrit à gauche du « = ». Vide : le bloc n'a pas
//               de libellé du tout : on ne dit même pas de quoi il parle
// silent      : le nombre de signes à trouver n'est pas annoncé (le client
//               ne reçoit alors aucun total pour ce bloc)
// requires    : identifiants de réponses à trouver avant d'ouvrir ce nœud
// answers[]   : { id, label, parties, seps?, extra? } : plus note/quotes,
//               non affichés
//
// Un signe s'écrit d'UNE manière : celle de `label`. Chaque réponse est
// découpée en parties ordonnées ; `formes` liste les seules écritures
// admises d'une partie (chiffres ou lettres, singulier ou pluriel quand les
// deux se disent). Proposer une partie seule la fait apparaître en vert à sa
// place, le reste en « ? » : on peut tenir un signe partiellement.
//
// seps  : séparateurs affichés entre les parties (espace par défaut)
// extra : écritures qui couvrent plusieurs parties d'un coup (idx), comme
//         « archanges » qui vaut arc + anges
//
// Aucun identifiant ne doit contenir sa propre réponse : ils voyagent
// jusque dans le DOM.

export const NODES = [
  {
    // Le bloc d'entrée : ni titre, ni compte. On ne sait pas ce qu'on
    // cherche, ni combien il y en a. Ses signes ne comptent pas comme les
    // autres : chacun vaut un cran entier : trois signes d'un coup, donc un
    // échelon gagné mécaniquement.
    id: 'n-0',
    source: '',
    silent: true,
    bonus: true,
    requires: [],
    answers: [
      {
        id: 'n-0-1',
        label: 'Devincix',
        parties: [{ t: 'Devincix', formes: ['devincix'] }],
        note: '',
        quotes: [],
      },
      {
        id: 'n-0-3',
        label: 'Katikas',
        parties: [{ t: 'Katikas', formes: ['katikas', 'katikias'] }],
        note: 'Les deux orthographes valent.',
        quotes: [],
      },
    ],
  },
  {
    // Le nom de l'artiste, en tête des blocs titrés. Il a d'abord gardé la
    // page Interprétations (une « porte ») avant de rejoindre le 57 : son
    // ancien identifiant est migré dans RENAMED.
    id: 'n-w',
    source: 'White Cadae',
    requires: [],
    answers: [
      {
        id: 'n-w-1',
        label: 'Infini blanc',
        parties: [
          { t: 'Infini', formes: ['infini'] },
          { t: 'blanc', formes: ['blanc'] },
        ],
        note: 'White : blanc. Cadae : C=3, A=1, D=4, A=1, E=5 : les décimales de pi, qui ne s’arrêtent jamais.',
        quotes: ['J’harmonise l’infini, l’infini devient fini. (Multivers)',
                 'Je ne suis qu’un fil qui relie deux infinis. (Un fil entre deux infinis)'],
      },
    ],
  },
  {
    id: 'n-a',
    source: '57',
    requires: [],
    // Deux signes : les signes eux-mêmes, et les 12 arc-anges. « Anges » et
    // « 12 », trouvés séparément du temps où ils étaient deux réponses,
    // restent acquis en tant que parties (RENAMED).
    answers: [
      {
        id: 'n-a-2',
        label: 'Signes',
        parties: [{ t: 'Signes', formes: ['signes', 'signe'] }],
        note: '« Tu verras les 57 » : ce que l’on voit apparaître partout, ce sont les signes laissés là exprès.',
        quotes: ['Je vois des signes partout sur le chantier du paradis. (Orange)',
                 'Sans indices dans les dés, je laisse des signes cachés. (Sans indices dans les dés)'],
      },
      {
        id: 'n-a-4',
        label: '12 arc-anges',
        parties: [
          { t: '12', formes: ['12', 'douze'] },
          { t: 'arc', formes: ['arc'] },
          { t: 'anges', formes: ['anges', 'ange'] },
        ],
        seps: [' ', '-'],
        extra: [
          { idx: [1, 2], formes: ['archanges', 'archange', 'arcanges', 'arcange'] },
          { idx: [0, 1, 2], formes: ['12 archanges', '12 archange', '12 arcanges', 'douze archanges', 'douze arcanges'] },
        ],
        note: '5 + 7 = 12. Les 57 sont les anges : ils font grandir la matrix, ils forment le carré qui protège. L’arc relie l’ange à l’arc-ange.',
        quotes: ['La matrix est vivante, elle grandit grâce aux anges. (13h20)',
                 'Mon carré d’anges est là pour me protéger. (Orange)'],
      },
    ],
  },
  {
    // Le chiffre 7, repris de musique en musique.
    id: 'n-k',
    source: '7',
    requires: [],
    answers: [
      {
        id: 'n-k-1',
        label: 'Galaxie',
        parties: [{ t: 'Galaxie', formes: ['galaxie'] }],
        note: 'Le premier signe du 7.',
        quotes: [],
      },
      {
        id: 'n-k-2',
        label: 'Signe',
        parties: [{ t: 'Signe', formes: ['signe', 'signes'] }],
        note: 'Le second signe du 7 : le 7 est lui-même un signe.',
        quotes: [],
      },
    ],
  },
  {
    id: 'n-b',
    source: 'Trompettes',
    requires: [],
    answers: [
      {
        id: 'n-b-1',
        label: 'Signes',
        parties: [{ t: 'Signes', formes: ['signes', 'signe'] }],
        note: 'Même vers, deux versions : « tu verras les 57 » (30 vins divins) et « t’entendras les trompettes » (Sans indices dans les dés). Les trompettes sont les 57, donc les signes.',
        quotes: ['30 vins divins, tu verras les 57. (30 vins divins)',
                 '30 vins divins, t’entendras les trompettes. (Sans indices dans les dés)'],
      },
    ],
  },

  {
    // Les deux formules tombent sur la même date : un seul élément, un seul
    // champ, plutôt que deux nœuds à la réponse identique.
    id: 'n-c',
    source: '5 vins divins & 30 vins divins',
    requires: [],
    answers: [
      {
        id: 'n-c-1',
        label: '25 décembre',
        parties: [
          { t: '25', formes: ['25', 'vingt cinq'] },
          { t: 'décembre', formes: ['decembre', 'dec'] },
        ],
        extra: [{ idx: [0, 1], formes: ['25 12', '25 douze'] }],
        note: '5 vins = 5 + vingt = 25 ; 30 vins = (30 + 20) / 2 = 25. « Divins » donne le mois de la naissance du divin.',
        quotes: ['5 vins divins, t’entendras les 57. (Sans indices dans les dés)',
                 '30 vins divins, tu verras les 57. (30 vins divins)'],
      },
    ],
  },

  {
    id: 'n-e',
    source: '13h20',
    requires: [],
    answers: [
      {
        id: 'n-e-1',
        label: '2031',
        parties: [{ t: '2031', formes: ['2031'] }],
        extra: [{ idx: [0], formes: ['20 31'] }],
        note: '13 retourné donne 31, posé derrière le 20 : 2031.',
        quotes: ['Jusqu’à la fin, et même si ça fait mal à 13h20. (13h20)'],
      },
      {
        id: 'n-e-2',
        label: '33 ans',
        parties: [
          { t: '33', formes: ['33', 'trente trois'] },
          { t: 'ans', formes: ['ans', 'an'] },
        ],
        note: '13 + 20 = 33, l’âge du Christ.',
        quotes: ['À 13 heures 20, j’ai plus peur d’être. (30 vins divins)'],
      },
    ],
  },

  {
    id: 'n-f',
    source: '5 vins divins & 30 vins divins + 13h20',
    requires: ['n-c-1', 'n-e-1'],
    answers: [
      {
        id: 'n-f-1',
        label: '25 décembre 2031',
        parties: [
          { t: '25', formes: ['25', 'vingt cinq'] },
          { t: 'décembre', formes: ['decembre', 'dec'] },
          { t: '2031', formes: ['2031'] },
        ],
        extra: [{ idx: [0, 1, 2], formes: ['25 12 2031'] }],
        note: 'Les vins divins donnent le jour, l’heure donne l’année.',
        quotes: [],
      },
    ],
  },

  {
    id: 'n-g',
    source: 'Sans indices dans les dés',
    requires: [],
    answers: [
      {
        id: 'n-g-1',
        label: '666',
        parties: [{ t: '666', formes: ['666', 'six six six', 'six cent soixante six'] }],
        note: 'Le titre s’entend aussi « cent indices ». Un dé a six faces ; ce qui s’y cache est le nombre de la bête.',
        quotes: ['Sans indices dans les dés, je laisse des signes cachés. (Sans indices dans les dés)'],
      },
    ],
  },
  {
    // Un seul signe désormais : plus d'étape « 10 mains » entre la bête et
    // ses cornes. Qui avait trouvé les mains garde le 10 (RENAMED).
    id: 'n-h',
    source: 'Prends la bête à …',
    requires: [],
    answers: [
      {
        id: 'n-h-2',
        label: '10 cornes',
        parties: [
          { t: '10', formes: ['10', 'dix'] },
          { t: 'cornes', formes: ['cornes', 'corne'] },
        ],
        note: '« Prends la bête à 8 mains » + « à 2 mains » : dix. La bête de l’Apocalypse a dix cornes : les mains du refrain les comptent.',
        quotes: ['Prends la bête à 8 mains, dans l’aiguille j’ai vu un aigle. (Sans indices dans les dés)',
                 'Prends la bête à 2 mains, dans les chiffres j’ai vu un aigle. (30 vins divins)'],
      },
    ],
  },

];

/* --------------------------------------------------- moteur des parties ---
   Chaque réponse est compilée une fois au chargement : toutes les écritures
   admises de chaque sous-ensemble ordonné de parties, jointes par espace,
   plus les écritures `extra`. La proposition d'un joueur se compare à ces
   tables (avec puis sans espaces) : le masque obtenu dit quelles parties
   viennent d'être trouvées.                                              */

const bits = (m) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };

function compileAnswer(a) {
  const k = a.parties.length;
  const garde = (map, s, masque) => {
    const cle = s.trim().replace(/\s+/g, ' ');
    if (!cle) return;
    const avant = map.get(cle) || 0;
    if (bits(masque) > bits(avant)) map.set(cle, masque);
  };
  const exactes = new Map();
  for (let masque = 1; masque < (1 << k); masque++) {
    let combos = [''];
    for (let i = 0; i < k; i++) {
      if (!(masque & (1 << i))) continue;
      const suite = [];
      for (const c of combos) for (const f of a.parties[i].formes) suite.push(c ? `${c} ${f}` : f);
      combos = suite;
    }
    for (const c of combos) garde(exactes, c, masque);
  }
  for (const e of a.extra || []) {
    const masque = e.idx.reduce((acc, i) => acc | (1 << i), 0);
    for (const f of e.formes) garde(exactes, f, masque);
  }
  const collees = new Map();
  for (const [s, m] of exactes) garde(collees, s.replace(/ /g, ''), m);
  return { exactes, collees, plein: (1 << k) - 1 };
}

for (const node of NODES) for (const a of node.answers) a.moteur = compileAnswer(a);

/* ----------------------------------------------------------------- API */

// Des nœuds ont été réunis ou refondus depuis les premières trouvailles : ce
// qui avait été trouvé vaut toujours, on ne réinitialise personne. Un ancien
// identifiant peut valoir une réponse entière, ou seulement une partie de la
// réponse qui l'a absorbée (suffixe .pN). Les réponses supprimées sont
// ignorées.
const RENAMED = {
  'n-d-2': 'n-c-1',
  'porte-interp-1': 'n-w-1',
  // « Anges » et « 12 » vivent désormais dans « 12 arc-anges »
  'n-a-1': 'n-a-4.p2',
  'n-a-3': 'n-a-4.p0',
  // la bête n'a plus qu'un signe ; « 10 mains » laisse son 10
  'n-i-1': 'n-h-2',
  'n-h-1': 'n-h-2.p0',
};
export function currentAnswerId(id) {
  return RENAMED[id] || id;
}

const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
const NODE_OF_ANSWER = new Map();
const ANSWER_BY_ID = new Map();
for (const node of NODES) {
  for (const a of node.answers) {
    NODE_OF_ANSWER.set(a.id, node);
    ANSWER_BY_ID.set(a.id, a);
  }
}


export function getNode(id) {
  return NODE_BY_ID.get(id) || null;
}

// Sépare des identifiants (déjà passés par currentAnswerId) les réponses
// entières et les parties. Une réponse dont toutes les parties sont là est
// entière. Tout le monde lit la progression par cette porte : le jeu, le
// profil, l'annuaire.
export function progresOf(ids) {
  const solved = new Set();
  const parties = new Map();
  for (const id of ids) {
    const m = /^(.+)\.p(\d+)$/.exec(id);
    if (m && ANSWER_BY_ID.has(m[1])) {
      const idx = Number(m[2]);
      if (idx >= ANSWER_BY_ID.get(m[1]).parties.length) continue;
      if (!parties.has(m[1])) parties.set(m[1], new Set());
      parties.get(m[1]).add(idx);
    } else if (ANSWER_BY_ID.has(id)) {
      solved.add(id);
    }
  }
  for (const [id, set] of parties) {
    if (set.size >= ANSWER_BY_ID.get(id).parties.length) solved.add(id);
  }
  return { solved, parties };
}

// Un nœud n'est jouable que si toutes les réponses dont il dépend sont
// trouvées.
export function isLocked(node, solved) {
  return node.requires.some((id) => !solved.has(id));
}

/* Confronte une proposition aux réponses du nœud, mot à mot. Ce qui est juste
   est gardé même si le reste est faux : « 10 mains » garde le 10 et rend
   « mains ». Renvoie { prises, echo } :

   prises : [{ id, masque (les parties gagnées), complet }]
   echo   : la proposition rendue mot pour mot, chacun marqué juste ou faux.

   L'ordre des parties compte : « anges 12 » ne rend pas le 12.

   Un seul mot de bruit est toléré à côté de ce qui est reconnu. C'est ce qui
   empêche de pêcher : jeter dix mots pour voir lesquels verdissent ne rend
   rien du tout, ni terrain gagné ni réponse. Quand RIEN n'est reconnu, la
   proposition entière repart en rouge : elle n'apprend rien à personne.   */

const MAX_BRUIT = 1;
const MAX_MOTS = 12;
const MAX_FENETRE = 4;

const basBit = (m) => 31 - Math.clz32(m & -m);
const hautBit = (m) => 31 - Math.clz32(m);

// Les mots de la proposition, deux fois : nettoyés pour comparer, tels qu'ils
// ont été tapés pour les rendre à l'écran.
function motsDe(value) {
  const nets = normalize(value).split(' ').filter(Boolean);
  const bruts = String(value ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return { nets, bruts: bruts.length === nets.length ? bruts : nets };
}

export function matchNode(node, answer, solved, parties = new Map()) {
  const { nets, bruts } = motsDe(answer);
  if (!nets.length || nets.length > MAX_MOTS) return null;

  // l'état de chaque réponse du nœud : ce qui est déjà tenu, ce qui vient
  // d'être gagné, et la première partie encore recevable (l'ordre compte)
  const etats = node.answers.map((a) => ({
    a,
    deja: solved.has(a.id)
      ? a.moteur.plein
      : [...(parties.get(a.id) || [])].reduce((m, i) => m | (1 << i), 0),
    gagne: 0,
    suivante: 0,
  }));

  const echo = [];
  let bruit = 0;
  let reconnus = 0;
  let i = 0;
  while (i < nets.length) {
    let pris = 0;
    // la plus longue lecture d'abord : « 12 arc anges » avant « 12 »
    for (let len = Math.min(MAX_FENETRE, nets.length - i); len >= 1 && !pris; len--) {
      const avecEspaces = nets.slice(i, i + len).join(' ');
      const collee = avecEspaces.replace(/ /g, '');
      // d'abord ce qui fait gagner du terrain, ensuite ce qui est déjà vert
      for (const passe of [0, 1]) {
        for (const e of etats) {
          const masque = e.a.moteur.exactes.get(avecEspaces) ?? e.a.moteur.collees.get(collee) ?? 0;
          if (!masque || basBit(masque) < e.suivante) continue;
          const neuf = masque & ~(e.deja | e.gagne);
          if (passe === 0 ? !neuf : neuf) continue;
          if (passe === 0) e.gagne |= neuf;
          e.suivante = hautBit(masque) + 1;
          pris = len;
          break;
        }
        if (pris) break;
      }
    }
    if (pris) {
      for (let k = 0; k < pris; k++) echo.push({ t: bruts[i + k], ok: true });
      reconnus += pris;
      i += pris;
    } else {
      echo.push({ t: bruts[i], ok: false });
      bruit += 1;
      i += 1;
    }
  }

  if (!reconnus) return { prises: [], echo };
  if (bruit > MAX_BRUIT) return null;

  const prises = etats.filter((e) => e.gagne).map((e) => ({
    id: e.a.id,
    masque: e.gagne,
    complet: (e.deja | e.gagne) === e.a.moteur.plein,
  }));
  return { prises, echo };
}

// Le libellé d'un nœud tel qu'on a le droit de l'afficher.
function sourceOf(node, locked) {
  return locked && node.lockedLabel ? node.lockedLabel : node.source;
}

/* Ce qu'une réponse tenue partiellement a le droit de montrer : les parties
   trouvées, à leur place, et un seul « ? » par trou : jamais le texte d'une
   partie manquante, jamais leur nombre, jamais le séparateur d'un trou.   */
function jetonsPartiels(a, trouvees) {
  const jetons = [];
  for (let i = 0; i < a.parties.length; i++) {
    if (trouvees.has(i)) {
      const sep = jetons.length === 0 ? ''
        : (trouvees.has(i - 1) ? (a.seps?.[i - 1] ?? ' ') : ' ');
      jetons.push({ t: a.parties[i].t, sep });
    } else if (!jetons.length || !jetons[jetons.length - 1].q) {
      jetons.push({ q: true, sep: jetons.length ? ' ' : '' });
    }
  }
  return jetons;
}

/* ------------------------------------------------------------- échelons */

// Trois signes titrés font un cran ; un signe du bloc muet vaut un cran à
// lui seul.
export const PAR_ECHELON = 3;

const BONUS_ANSWERS = new Set();
const ORDINARY_ANSWERS = new Set();
for (const node of NODES) {
  for (const a of node.answers) (node.bonus ? BONUS_ANSWERS : ORDINARY_ANSWERS).add(a.id);
}

// On est à l'échelon 1 dès l'arrivée : c'est le point de départ que l'on
// gravit ensuite. Ce qu'on gravit ensuite, ce sont les crans : trois signes
// titrés chacun. Un signe du bloc muet apporte l'équivalent de trois signes
// d'un coup : il fait donc gagner un échelon entier, quel que soit le moment
// où on le trouve. Avec treize signes titrés et deux signes muets, le sommet
// est l'échelon 7. Une réponse tenue partiellement ne compte pas encore.
export function echelonOf(solved) {
  let signes = 0;
  for (const id of solved) {
    if (ORDINARY_ANSWERS.has(id)) signes += 1;
    else if (BONUS_ANSWERS.has(id)) signes += PAR_ECHELON;
  }
  return Math.floor(signes / PAR_ECHELON) + 1;
}

// Ce que chaque échelon ouvre. La page 57 est toujours là : c'est par elle
// qu'on entre. Les interprétations sont ouvertes dès le sol, même sans
// compte, et chaque cran suivant découvre une pièce de plus.
export const ECHELON_INTERPRETATIONS = 1;
export const ECHELON_CONVERSATION = 2;
export const ECHELON_PENSE_MIEUX = 3;
export const ECHELON_VIDEOGRAPHIE = 4;
export const ECHELON_CARRE = 5;
export const ECHELON_BRAINSTORM = 6;
// L'échelon 7 ouvre le 114 : la suite du 57, encore fermée.
export const ECHELON_114 = 7;

/* Ce qu'un membre a trouvé, tel qu'un autre a le droit de le voir : le nom de
   l'élément, jamais la réponse. Un nœud dont le libellé est lui-même la
   réponse d'un autre reste masqué tant que CELUI QUI REGARDE ne l'a pas
   ouvert de son côté : sans quoi un profil deviendrait une antisèche.     */
export function enigmesTrouvees(solvedCible, solvedVisiteur = new Set()) {
  return NODES.map((node) => {
    const trouves = node.answers.filter((a) => solvedCible.has(a.id)).length;
    if (!trouves) return null;
    return {
      id: node.id,
      source: sourceOf(node, isLocked(node, solvedVisiteur)),
      found: trouves,
      total: node.silent ? null : node.answers.length,
    };
  }).filter(Boolean);
}

/* -------------------------------------------------------- l'attente ---
   Plus on est haut, plus un essai coûte cher. En bas de l'échelle on peut
   tâtonner ; en haut, chaque proposition engage la journée.              */

// 12, 33, 57 : les trois nombres du disque, repris d'une unité à l'autre :
// secondes, puis minutes, puis heures. L'échelon 1 démarre au deuxième cran
// de la suite (33 s), l'échelon 2 au troisième (57 s), et ainsi de suite.
const SUITE = [12, 33, 57];
const UNITES = [1000, 60 * 1000, 60 * 60 * 1000];

// La suite complète : 12 s, 33 s, 57 s, 12 min, 33 min, 57 min, 12 h, 33 h,
// 57 h. Le sommet du jeu étant l'échelon 7, l'attente la plus longue
// réellement atteignable est 33 h.
export const PALIERS = UNITES.flatMap((u) => SUITE.map((n) => n * u));

export function delaiEssaiMs(echelon) {
  const i = Math.max(0, Math.min(echelon, PALIERS.length - 1));
  return PALIERS[i];
}

export function accessOf(echelon) {
  return {
    interpretations: echelon >= ECHELON_INTERPRETATIONS,
    conversation: echelon >= ECHELON_CONVERSATION,
    penseMieux: echelon >= ECHELON_PENSE_MIEUX,
    videographie: echelon >= ECHELON_VIDEOGRAPHIE,
    carre: echelon >= ECHELON_CARRE,
    brainstorm: echelon >= ECHELON_BRAINSTORM,
    cent14: echelon >= ECHELON_114,
  };
}

// L'état complet du jeu pour un membre. `rows` vient de riddle_progress ;
// les identifiants inconnus (anciennes parties du jeu) sont ignorés.
//
// Ce qui part au client est volontairement pauvre : jamais le nombre total de
// signes du jeu, pas même celui d'un bloc silencieux, jamais une partie non
// trouvée. Un bloc encore ouvert se signale par `open`, ce qui suffit à
// afficher le champ sans dire combien il reste à trouver.
export function buildState(rows) {
  const { solved, parties } = progresOf(
    rows.filter((r) => r.solved_at).map((r) => r.riddle_id)
  );

  const nodes = NODES.map((node) => {
    const locked = isLocked(node, solved);
    const found = node.answers.filter((a) => solved.has(a.id)).map((a) => ({ id: a.id, label: a.label }));
    const partiels = node.answers
      .filter((a) => !solved.has(a.id) && parties.get(a.id)?.size)
      .map((a) => ({ id: a.id, jetons: jetonsPartiels(a, parties.get(a.id)) }));
    return {
      id: node.id,
      source: sourceOf(node, locked),
      locked: locked && found.length === 0 && partiels.length === 0,
      total: node.silent ? null : node.answers.length,
      open: found.length < node.answers.length,
      found,
      partiels,
      // de quoi afficher un cadenas cliquable, sans rien révéler d'autre
      requires: node.requires.map((answerId) => {
        const dep = NODE_OF_ANSWER.get(answerId);
        return { node: dep.id, label: sourceOf(dep, isLocked(dep, solved)) };
      }),
    };
  });

  const ordinaires = [...solved].filter((id) => ORDINARY_ANSWERS.has(id)).length;
  const echelon = echelonOf(solved);

  return {
    nodes,
    solved: solved.size,
    echelon,
    // le chemin qu'il reste dans le cran en cours, jamais dans le jeu entier.
    // Les signes du bloc muet valent des crans entiers : ils ne laissent pas
    // de reste, seuls les signes titrés en laissent un.
    step: ordinaires % PAR_ECHELON,
    perEchelon: PAR_ECHELON,
    access: accessOf(echelon),
  };
}
