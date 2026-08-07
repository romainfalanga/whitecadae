// WhiteCadae — les mots de passe de l'EP 57 (page /57)
//
// ATTENTION : ce fichier est du code Worker. Il n'est JAMAIS servi au
// navigateur — c'est toute la raison de son existence. Les réponses ne
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
// source      : ce qui est écrit à gauche du « = »
// lockedLabel : libellé de remplacement tant que le nœud est verrouillé,
//               quand la source est elle-même la réponse d'un autre nœud
// requires    : identifiants de réponses à trouver avant d'ouvrir ce nœud
// answers[]   : { id, label, match }  — plus note/quotes, non affichés
//
// Aucun identifiant ne doit contenir sa propre réponse : ils voyagent
// jusque dans le DOM.
export const NODES = [
  {
    id: 'n-a',
    source: '57',
    requires: [],
    answers: [
      {
        id: 'n-a-1',
        label: 'Ange',
        match: (n) => /^(les |des |le |la |l |un |une )?anges?$/.test(n),
        note: 'Les 57 sont les anges : ils font grandir la matrix, ils s’actualisent, ils forment le carré qui protège.',
        quotes: ['La matrix est vivante, elle grandit grâce aux anges. (13h20)',
                 'Mon carré d’anges est là pour me protéger. (Orange)'],
      },
      {
        id: 'n-a-2',
        label: 'Signe',
        match: (n) => /^(les |des |le |la |l |un |une )?signes?$/.test(n),
        note: '« Tu verras les 57 » : ce que l’on voit apparaître partout, ce sont les signes laissés là exprès.',
        quotes: ['Je vois des signes partout sur le chantier du paradis. (Orange)',
                 'Sans indices dans les dés, je laisse des signes cachés. (Sans indices dans les dés)'],
      },
    ],
  },
  {
    id: 'n-b',
    source: 'Trompette',
    requires: [],
    answers: [
      {
        id: 'n-b-1',
        label: 'Signe',
        match: (n) => /^(les |des |le |la |l |un |une )?signes?$/.test(n),
        note: 'Même vers, deux versions : « tu verras les 57 » (30 vins divins) et « t’entendras les trompettes » (Sans indices dans les dés). Les trompettes sont les 57, donc les signes.',
        quotes: ['30 vins divins, tu verras les 57. (30 vins divins)',
                 '30 vins divins, t’entendras les trompettes. (Sans indices dans les dés)'],
      },
    ],
  },

  {
    id: 'n-c',
    source: '5 vins divins',
    requires: [],
    answers: [
      {
        id: 'n-c-1',
        label: '25 décembre',
        match: (n) => isDecemberDay(n, 25) && !numbersIn(n).includes(2031),
        note: '5 vins = 5 + vingt = 25, et « divins » donne le mois de la naissance du divin.',
        quotes: ['5 vins divins, t’entendras les 57. (Sans indices dans les dés)'],
      },
    ],
  },
  {
    id: 'n-d',
    source: '30 vins divins',
    requires: [],
    answers: [
      {
        id: 'n-d-1',
        label: '30 décembre + 20 décembre',
        match: (n) => {
          const nums = numbersIn(n);
          const hasDec = /\bdec/.test(n) || nums.includes(12);
          return hasDec && nums.includes(30) && nums.includes(20);
        },
        note: '30 vins porte deux dates à la fois : le 30 et le vingt.',
        quotes: ['30 vins divins, tu verras les 57. (30 vins divins)'],
      },
      {
        id: 'n-d-2',
        label: '25 décembre',
        match: (n) => isDecemberDay(n, 25) && !numbersIn(n).includes(2031),
        note: '(30 + 20) / 2 = 25 : la moyenne des deux dates retombe sur celle de 5 vins divins.',
        quotes: ['5 vins divins, t’entendras les 57. (Sans indices dans les dés)'],
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
    source: '5 vins divins + 30 vins divins + 13h20',
    requires: ['n-c-1', 'n-d-2', 'n-e-1'],
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
    lockedLabel: 'Le mot de passe précédent',
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

  {
    id: 'n-k',
    source: 'White Cadae',
    requires: [],
    answers: [
      {
        id: 'n-k-1',
        label: 'Infini',
        match: (n) => /^(l |les |un |une |d )?infinis?$/.test(n),
        note: 'Cadae : C=3, A=1, D=4, A=1, E=5 — les décimales de pi, qui ne s’arrêtent jamais.',
        quotes: ['J’harmonise l’infini, l’infini devient fini. (Multivers)',
                 'Je ne suis qu’un fil qui relie deux infinis. (Un fil entre deux infinis)'],
      },
      {
        id: 'n-k-2',
        label: 'Blanc',
        match: (n) => /^(le |la |les |un |une |de |d )?blanc(he|s|hes)?$/.test(n),
        note: 'White.',
        quotes: [],
      },
    ],
  },
];

/* ----------------------------------------------------------------- API */

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

// L'état complet du jeu pour un membre. `rows` vient de riddle_progress ;
// les identifiants inconnus (anciennes parties) sont simplement ignorés.
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
      total: node.answers.length,
      found,
      // de quoi afficher un cadenas cliquable, sans rien révéler d'autre
      requires: node.requires.map((answerId) => {
        const dep = NODE_OF_ANSWER.get(answerId);
        return { node: dep.id, label: sourceOf(dep, isLocked(dep, solved)) };
      }),
    };
  });

  return { nodes, total: TOTAL_ANSWERS, solved: solved.size };
}
