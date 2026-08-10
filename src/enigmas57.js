// WhiteCadae : les mots de passe de l'EP 57 (page /57)
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
//
// Pour ajouter un mot de passe : ajoutez une entrée dans `answers` du nœud
// concerné, ou un nœud entier dans NODES. Rien d'autre à toucher, ni côté
// API ni côté interface.

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

// Les nombres écrits en toutes lettres que le jeu peut rencontrer.
const WORD_NUMBERS = {
  deux: 2, cinq: 5, huit: 8, dix: 10, treize: 13, vingt: 20,
  'vingt cinq': 25, trente: 30, 'trente trois': 33,
  'six cent soixante six': 666,
};

// Tous les nombres d'une réponse, chiffres et lettres confondus.
function numbersIn(n) {
  const found = (n.match(/\d+/g) || []).map(Number);
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (n.includes(word)) found.push(value);
  }
  return found;
}

// « 25 décembre », « 25 dec », « 25/12 », « 25 12 » : même chose.
function isDecemberDay(n, day) {
  const nums = numbersIn(n);
  if (!nums.includes(day)) return false;
  return /\bdec/.test(n) || nums.includes(12);
}

/* ----------------------------------------------------------------- nœuds */

// Un nœud = un élément de l'arborescence, avec un seul champ de saisie même
// quand il porte plusieurs sens. Les réponses se révèlent au fur et à mesure,
// dans n'importe quel ordre.
//
// source      : ce qui est écrit à gauche du « = ». Vide : le bloc n'a pas
//               de libellé du tout : on ne dit même pas de quoi il parle
// silent      : le nombre de mots de passe à trouver n'est pas annoncé (le
//               client ne reçoit alors aucun total pour ce bloc)
// lockedLabel : libellé de remplacement tant que le nœud est verrouillé,
//               quand la source est elle-même la réponse d'un autre nœud
// requires    : identifiants de réponses à trouver avant d'ouvrir ce nœud
// answers[]   : { id, label, match }  : plus note/quotes, non affichés
//
// Aucun identifiant ne doit contenir sa propre réponse : ils voyagent
// jusque dans le DOM.

// Les mots de passe écrits d'un seul tenant : on tolère les espaces, pas
// autre chose.
const oneWord = (...formes) => (n) => formes.includes(n.replace(/ /g, ''));

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
        match: oneWord('devincix'),
        note: '',
        quotes: [],
      },
      {
        id: 'n-0-3',
        label: 'Katikas',
        match: oneWord('katikas', 'katikias'),
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
        // les deux mots, dans l'ordre qu'on veut
        match: (n) => /infini/.test(n) && /blanc/.test(n),
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
    // Trois mots de passe, dans cet ordre. Les identifiants ne suivent pas
    // l'ordre d'affichage : ils restent collés à leur sens pour ne pas
    // effacer les parties déjà en cours.
    answers: [
      {
        id: 'n-a-2',
        label: 'Signes',
        match: (n) => /^(les |des |le |la |l |un |une )?signes?$/.test(n),
        note: '« Tu verras les 57 » : ce que l’on voit apparaître partout, ce sont les signes laissés là exprès.',
        quotes: ['Je vois des signes partout sur le chantier du paradis. (Orange)',
                 'Sans indices dans les dés, je laisse des signes cachés. (Sans indices dans les dés)'],
      },
      {
        id: 'n-a-1',
        label: 'Anges',
        // « anges » et « archanges » ouvrent le même mot de passe.
        match: (n) => /^(les |des |le |la |l |un |une )?(arch)?anges?$/.test(n),
        note: 'Les 57 sont les anges : ils font grandir la matrix, ils s’actualisent, ils forment le carré qui protège. Archanges vaut anges.',
        quotes: ['La matrix est vivante, elle grandit grâce aux anges. (13h20)',
                 'Mon carré d’anges est là pour me protéger. (Orange)'],
      },
      {
        id: 'n-a-3',
        label: '12',
        match: (n) => numbersIn(n).includes(12) || /\bdouze\b/.test(n),
        note: '5 + 7 = 12. Relié aux anges, cela donne les 12 archanges : 7 ou 12 selon les prismes.',
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
        match: (n) => /^(les |des |le |la |l |un |une )?signes?$/.test(n),
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
        match: (n) => isDecemberDay(n, 25) && !numbersIn(n).includes(2031),
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
        match: (n) => numbersIn(n).includes(2031),
        note: '13 retourné donne 31, posé derrière le 20 : 2031.',
        quotes: ['Jusqu’à la fin, et même si ça fait mal à 13h20. (13h20)'],
      },
      {
        id: 'n-e-2',
        label: '33 ans',
        match: (n) => numbersIn(n).includes(33),
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
        match: (n) => {
          const nums = numbersIn(n);
          return nums.includes(2031) && nums.includes(25) && (/\bdec/.test(n) || nums.includes(12));
        },
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
        match: (n) => numbersIn(n).includes(666) || /^six six six$/.test(n),
        note: 'Le titre s’entend aussi « cent indices ». Un dé a six faces ; ce qui s’y cache est le nombre de la bête.',
        quotes: ['Sans indices dans les dés, je laisse des signes cachés. (Sans indices dans les dés)'],
      },
    ],
  },
  {
    id: 'n-h',
    source: 'Prends la bête à …',
    requires: [],
    answers: [
      {
        id: 'n-h-1',
        label: '10 mains',
        match: (n) => numbersIn(n).includes(10) && !/corne/.test(n),
        note: '« Prends la bête à 8 mains » (Sans indices dans les dés) + « Prends la bête à 2 mains » (30 vins divins).',
        quotes: ['Prends la bête à 8 mains, dans l’aiguille j’ai vu un aigle. (Sans indices dans les dés)',
                 'Prends la bête à 2 mains, dans les chiffres j’ai vu un aigle. (30 vins divins)'],
      },
    ],
  },
  {
    id: 'n-i',
    source: '10 mains',
    // Sa source EST la réponse du nœud précédent : masquée tant qu'il est
    // verrouillé.
    lockedLabel: 'Le signe précédent',
    requires: ['n-h-1'],
    answers: [
      {
        id: 'n-i-1',
        label: '10 cornes',
        match: (n) => /cornes?/.test(n),
        note: 'La bête de l’Apocalypse a dix cornes : les mains du refrain les comptent.',
        quotes: [],
      },
    ],
  },

  {
    id: 'n-j',
    source: 'M = M',
    requires: [],
    answers: [
      {
        id: 'n-j-1',
        label: 'Mécanisme = Matière',
        match: (n) => /mecanism/.test(n) && /matiere/.test(n),
        note: 'Les deux mots reviennent toujours ensemble, toujours équivalents.',
        quotes: ['Je sais que le QI change, M égale M à jamais. (30 vins divins)',
                 'Tout a une logique, matière et mécanisme. (Multivers)'],
      },
    ],
  },

];

/* ----------------------------------------------------------------- API */

// « 30 vins divins » a eu son propre nœud avant d'être réuni à « 5 vins
// divins », et « White Cadae » a gardé la page Interprétations avant de
// rejoindre le 57 : ce qui avait été trouvé vaut toujours, on ne
// réinitialise personne. Les réponses supprimées, elles, sont ignorées.
const RENAMED = { 'n-d-2': 'n-c-1', 'porte-interp-1': 'n-w-1' };
export function currentAnswerId(id) {
  return RENAMED[id] || id;
}

const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
const NODE_OF_ANSWER = new Map();
for (const node of NODES) for (const a of node.answers) NODE_OF_ANSWER.set(a.id, node);

export const TOTAL_ANSWERS = NODES.reduce((sum, n) => sum + n.answers.length, 0);

export function getNode(id) {
  return NODE_BY_ID.get(id) || null;
}

// Un nœud n'est jouable que si toutes les réponses dont il dépend sont
// trouvées.
export function isLocked(node, solved) {
  return node.requires.some((id) => !solved.has(id));
}

// Cherche, parmi les réponses encore à trouver de ce nœud, celle qui
// correspond. Retourne son identifiant, ou null.
export function matchAnswer(node, answer, solved) {
  const n = normalize(answer);
  if (!n) return null;
  const hit = node.answers.find((a) => !solved.has(a.id) && a.match(n));
  return hit ? hit.id : null;
}

// Le libellé d'un nœud tel qu'on a le droit de l'afficher.
function sourceOf(node, locked) {
  return locked && node.lockedLabel ? node.lockedLabel : node.source;
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

// On est à l'échelon 1 dès l'arrivée : c'est le point de départ que l'on gravit ensuite. Ce
// qu'on gravit ensuite, ce sont les crans : trois signes titrés chacun. Un
// signe du bloc muet apporte l'équivalent de trois signes d'un coup : il fait
// donc gagner un échelon entier, quel que soit le moment où on le trouve.
// Avec treize signes titrés (quatre crans pleins) et deux signes muets, le
// sommet est l'échelon 7.
export function echelonOf(solved) {
  let signes = 0;
  for (const id of solved) {
    if (ORDINARY_ANSWERS.has(id)) signes += 1;
    else if (BONUS_ANSWERS.has(id)) signes += PAR_ECHELON;
  }
  return Math.floor(signes / PAR_ECHELON) + 1;
}

// Ce que chaque échelon ouvre. La page 57 est toujours là : c'est par elle
// qu'on entre. Les interprétations et les reprises sont ouvertes dès le sol :
// même sans compte : et chaque cran suivant découvre une pièce de plus.
export const ECHELON_INTERPRETATIONS = 1;
export const ECHELON_REPRISES = 1;
export const ECHELON_CONVERSATION = 2;
export const ECHELON_PENSE_MIEUX = 3;
export const ECHELON_VIDEOGRAPHIE = 4;
export const ECHELON_CARRE = 5;
export const ECHELON_BRAINSTORM = 6;
export const ECHELON_GMO = 7;

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
    reprises: echelon >= ECHELON_REPRISES,
    conversation: echelon >= ECHELON_CONVERSATION,
    penseMieux: echelon >= ECHELON_PENSE_MIEUX,
    videographie: echelon >= ECHELON_VIDEOGRAPHIE,
    carre: echelon >= ECHELON_CARRE,
    brainstorm: echelon >= ECHELON_BRAINSTORM,
    gmo: echelon >= ECHELON_GMO,
  };
}

// L'état complet du jeu pour un membre. `rows` vient de riddle_progress ;
// les identifiants inconnus (anciennes parties) sont simplement ignorés.
//
// Ce qui part au client est volontairement pauvre : jamais le nombre total de
// mots de passe du jeu, et pas même celui d'un bloc silencieux. Un bloc
// encore ouvert se signale par `open`, ce qui suffit à afficher le champ sans
// dire combien il reste à trouver.
export function buildState(rows) {
  const solved = new Set(
    rows.filter((r) => r.solved_at && NODE_OF_ANSWER.has(r.riddle_id)).map((r) => r.riddle_id)
  );

  const nodes = NODES.map((node) => {
    const locked = isLocked(node, solved);
    const found = node.answers.filter((a) => solved.has(a.id)).map((a) => ({ id: a.id, label: a.label }));
    return {
      id: node.id,
      source: sourceOf(node, locked),
      locked: locked && found.length === 0,
      total: node.silent ? null : node.answers.length,
      open: found.length < node.answers.length,
      found,
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
