// WhiteCadae — les signes de l'EP 57
//
// ATTENTION : ce fichier est du code Worker. Il n'est JAMAIS servi au
// navigateur — c'est toute la raison de son existence. Les réponses, les
// explications et les indices vivent ici et ne partent au client qu'une fois
// le signe trouvé (ou l'indice explicitement demandé). Ne recopiez rien de
// tout ceci dans public/, sinon le jeu se résout avec la console du
// navigateur.
//
// Pour ajouter un signe : ajoutez un objet dans RIDDLES (et sa branche dans
// BRANCHES si elle n'existe pas). Rien d'autre à toucher, ni côté API ni
// côté interface.

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

/* -------------------------------------------------------------- branches */

export const BRANCHES = [
  {
    id: 'les-57',
    title: 'Les 57',
    intro: 'Le nombre qui donne son nom à l’EP dit deux choses à la fois. Et un autre mot dit exactement la même chose, autrement.',
  },
  {
    id: 'vins-divins',
    title: 'Les vins divins',
    intro: 'Deux morceaux ouvrent sur le même vers, à un nombre près. Ce nombre est une date.',
  },
  {
    id: 'heure',
    title: 'L’heure',
    intro: 'Une heure revient quarante fois dans l’EP. Elle cache deux nombres, pas un.',
  },
  {
    id: 'la-date',
    title: 'La date',
    intro: 'Trois morceaux mis bout à bout n’écrivent qu’une seule chose.',
  },
  {
    id: 'la-bete',
    title: 'La bête',
    intro: 'Elle traverse l’EP sans jamais être nommée en entier.',
  },
  {
    id: 'equation',
    title: 'L’équation',
    intro: 'Deux lettres identiques, deux mots différents.',
  },
];

/* --------------------------------------------------------------- signes */

// source   : ce qui est écrit à gauche du « = »
// rank     : rang du sens quand une même source en a plusieurs
// requires : signes à trouver avant de pouvoir tenter celui-ci
// answer   : la réponse affichée une fois trouvée
// match    : le test appliqué à la réponse normalisée
// reveal   : l'explication, révélée en même temps que la réponse
// quotes   : les vers qui la prouvent, avec un lien vers le morceau
// hints    : les indices, délivrés un par un à la demande
export const RIDDLES = [
  /* ------------------------------------------------------------ les 57 */
  {
    id: 's57-a',
    branch: 'les-57',
    source: '57',
    rank: 1,
    requires: [],
    answer: 'Ange',
    match: (n) => /^(les |des |le |la |l |un |une )?anges?$/.test(n),
    reveal:
      'Les 57 sont les anges. Ils traversent tout l’EP : ce sont eux qui font grandir la matrix, eux qui s’actualisent, eux qui forment le carré qui protège.',
    quotes: [
      { text: 'La matrix est vivante, elle grandit grâce aux anges.', song: '13h20', slug: '13h20' },
      { text: 'Regarde la fin de Lucifer, les anges s’actualisent.', song: '30 vins divins', slug: '30-vins-divins' },
      { text: 'Mon carré d’anges est là pour me protéger.', song: 'Orange', slug: 'orange' },
    ],
    hints: [
      'Dans 13h20, qu’est-ce qui fait grandir la matrix ? Dans Orange, de quoi est fait le carré ?',
      '« La matrix est vivante, elle grandit grâce aux ______. »',
      'Un mot de quatre lettres, celui qui revient dans les trois morceaux. Singulier ou pluriel, peu importe.',
    ],
  },
  {
    id: 's57-b',
    branch: 'les-57',
    source: '57',
    rank: 2,
    requires: [],
    answer: 'Signe',
    match: (n) => /^(les |des |le |la |l |un |une )?signes?$/.test(n),
    reveal:
      'Les 57 sont aussi les signes. « Tu verras les 57 » : ce que l’on voit apparaître partout, sur le chantier du paradis, ce sont les signes laissés là exprès.',
    quotes: [
      { text: 'Je vois des signes partout sur le chantier du paradis.', song: 'Orange', slug: 'orange' },
      { text: 'Sans indices dans les dés, je laisse des signes cachés.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
      { text: '30 vins divins, tu verras les 57.', song: '30 vins divins', slug: '30-vins-divins' },
    ],
    hints: [
      'Orange : qu’est-ce que le narrateur voit « partout sur le chantier du paradis » ?',
      '« Je laisse des ______ cachés. »',
      'Cinq lettres. C’est précisément ce que tu es en train de chercher sur cette page : chaque « = » en est un.',
    ],
  },
  {
    id: 'trompette',
    branch: 'les-57',
    source: 'Trompette',
    rank: 1,
    requires: [],
    answer: 'Signe',
    match: (n) => /^(les |des |le |la |l |un |une )?signes?$/.test(n),
    reveal:
      'La preuve tient dans un seul mot déplacé. 30 vins divins chante « 30 vins divins, tu verras les 57 ». Sans indices dans les dés chante « 30 vins divins, t’entendras les trompettes ». Même vers, même place : les trompettes sont les 57, donc les signes. Le 57 se voit, la trompette s’entend — c’est la même chose dite autrement.',
    quotes: [
      { text: '30 vins divins, tu verras les 57.', song: '30 vins divins', slug: '30-vins-divins' },
      { text: '30 vins divins, t’entendras les trompettes.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
    ],
    hints: [
      'Compare le refrain de 30 vins divins et le dernier refrain de Sans indices dans les dés. Un seul mot change de place.',
      '« tu verras les 57 » d’un côté, « t’entendras les trompettes » de l’autre : les deux occupent exactement le même emplacement dans le vers.',
      'Donc la trompette vaut ce que vaut le 57 — et ce mot-là, tu l’as déjà trouvé juste au-dessus.',
    ],
  },

  /* ------------------------------------------------------ vins divins */
  {
    id: 'cinq-vins',
    branch: 'vins-divins',
    source: '5 vins divins',
    rank: 1,
    requires: [],
    answer: '25 décembre',
    match: (n) => isDecemberDay(n, 25) && !numbersIn(n).includes(2031),
    reveal:
      '5 vins : 5 et vingt. 5 + 20 = 25. Et « divins » fixe le mois — celui où naît le divin. 5 vins divins, c’est le 25 décembre.',
    quotes: [
      { text: '5 vins divins, t’entendras les 57.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
      { text: 'J’ai dit sans vins divins, le diable prendra sa retraite.', song: '13h20', slug: '13h20' },
    ],
    hints: [
      'Écoute « vins » autrement : le mot s’entend aussi comme un nombre.',
      '« vins » s’entend « vingt ». Il y a donc deux nombres dans « 5 vins » : 5 et 20.',
      '5 + 20 = 25. Reste le mois, et « divins » te le donne : celui de la naissance.',
    ],
  },
  {
    id: 'trente-vins-a',
    branch: 'vins-divins',
    source: '30 vins divins',
    rank: 1,
    requires: [],
    answer: '30 décembre + 20 décembre',
    match: (n) => {
      const nums = numbersIn(n);
      const hasDec = /\bdec/.test(n) || nums.filter((x) => x === 12).length > 0;
      return hasDec && nums.includes(30) && nums.includes(20);
    },
    reveal:
      '30 vins divins ne porte pas une date mais deux : le 30, et le vingt. 30 décembre et 20 décembre, ensemble.',
    quotes: [
      { text: '30 vins divins, tu verras les 57.', song: '30 vins divins', slug: '30-vins-divins' },
      { text: '30 vins divins, t’entendras les trompettes.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
    ],
    hints: [
      'Comme pour 5 vins divins, « vins » s’entend « vingt ». Mais cette fois, ne les additionne pas.',
      'Il y a deux nombres côte à côte : 30 et 20. Ce sont deux jours du même mois.',
      'Donne les deux dates de décembre, dans l’ordre que tu veux.',
    ],
  },
  {
    id: 'trente-vins-b',
    branch: 'vins-divins',
    source: '30 vins divins',
    rank: 2,
    requires: ['trente-vins-a'],
    answer: '25 décembre',
    match: (n) => isDecemberDay(n, 25) && !numbersIn(n).includes(2031),
    reveal:
      '(30 + 20) ÷ 2 = 25. La moyenne des deux dates de 30 vins divins retombe exactement sur le 25 décembre — la date de 5 vins divins. Les deux morceaux, l’un par l’addition, l’autre par le milieu, désignent le même jour.',
    quotes: [
      { text: '30 vins divins, tu verras les 57.', song: '30 vins divins', slug: '30-vins-divins' },
      { text: '5 vins divins, t’entendras les 57.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
    ],
    hints: [
      'Tu as deux dates. Que se passe-t-il si tu les ramènes à une seule ?',
      'Prends le milieu : additionne 30 et 20, divise par deux.',
      'Tu tombes sur le même jour que 5 vins divins.',
    ],
  },

  /* ------------------------------------------------------------ l'heure */
  {
    id: 'heure-a',
    branch: 'heure',
    source: '13h20',
    rank: 1,
    requires: [],
    answer: '2031',
    match: (n) => numbersIn(n).includes(2031),
    reveal:
      'Retourne le 13 : il devient 31. Pose-le derrière le 20 : 20|31. 13h20 écrit l’année 2031.',
    quotes: [
      { text: 'Jusqu’à la fin, et même si ça fait mal à 13h20, j’irai dans les étoiles.', song: '13h20', slug: '13h20' },
      { text: 'À 13 heures 20, j’ai plus peur d’être. Le mal devient le bien.', song: '30 vins divins', slug: '30-vins-divins' },
    ],
    hints: [
      'Sépare l’heure en deux nombres : 13 d’un côté, 20 de l’autre.',
      'Retourne le premier. 13 devient 31.',
      'Maintenant colle-le derrière le second.',
    ],
  },
  {
    id: 'heure-b',
    branch: 'heure',
    source: '13h20',
    rank: 2,
    requires: [],
    answer: '33 ans',
    match: (n) => numbersIn(n).includes(33),
    reveal: '13 + 20 = 33. L’âge du Christ.',
    quotes: [
      { text: 'Jusqu’à la fin, et même si ça fait mal à 13h20, j’irai dans les étoiles.', song: '13h20', slug: '13h20' },
    ],
    hints: [
      'Cette fois, n’inverse rien : additionne.',
      '13 + 20 = ?',
      'Ce n’est pas un nombre en l’air, c’est un âge — et pas n’importe lequel.',
    ],
  },

  /* ----------------------------------------------------------- la date */
  {
    id: 'date',
    branch: 'la-date',
    source: '5 vins divins + 30 vins divins + 13h20',
    rank: 1,
    requires: ['cinq-vins', 'trente-vins-b', 'heure-a'],
    answer: '25 décembre 2031',
    match: (n) => {
      const nums = numbersIn(n);
      return nums.includes(2031) && nums.includes(25) && (/\bdec/.test(n) || nums.includes(12));
    },
    reveal:
      'Les trois morceaux ne disent qu’une seule chose. 5 vins divins et 30 vins divins donnent le jour : 25 décembre. 13h20 donne l’année : 2031. Mis bout à bout, l’EP écrit une date — le 25 décembre 2031.',
    quotes: [
      { text: '5 vins divins, t’entendras les 57.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
      { text: '30 vins divins, tu verras les 57.', song: '30 vins divins', slug: '30-vins-divins' },
      { text: 'Jusqu’à la fin, et même si ça fait mal à 13h20, j’irai dans les étoiles.', song: '13h20', slug: '13h20' },
    ],
    hints: [
      'Tu as déjà tout : un jour d’un côté, une année de l’autre.',
      'Le jour vient des vins divins, l’année vient de l’heure.',
      'Écris la date complète, jour mois année.',
    ],
  },

  /* ----------------------------------------------------------- la bête */
  {
    id: 'des',
    branch: 'la-bete',
    source: 'Sans indices dans les dés',
    rank: 1,
    requires: [],
    answer: '666',
    match: (n) => numbersIn(n).includes(666) || /six cent soixante six/.test(n) || /^six six six$/.test(n),
    reveal:
      'Le titre s’entend deux fois : « sans indices », mais aussi « cent indices ». Le morceau prévient qu’il cache des choses dans les dés — et un dé a six faces. Ce qui s’y cache, c’est le nombre de la bête : 666.',
    quotes: [
      { text: 'Sans indices dans les dés, je laisse des signes cachés.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
      { text: 'Dieu et le diable se cachent dans les détails.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
      { text: 'Prends la bête à 8 mains, dans l’aiguille j’ai vu un aigle.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
    ],
    hints: [
      'Le titre s’entend de deux façons : « sans indices », mais aussi « cent indices ».',
      'Un dé a six faces. Il en faut trois.',
      'C’est le nombre de la bête — celle que l’EP prend justement à pleines mains.',
    ],
  },
  {
    id: 'bete-a',
    branch: 'la-bete',
    source: 'Prends la bête à …',
    rank: 1,
    requires: [],
    answer: '10 mains',
    match: (n) => numbersIn(n).includes(10) && !/corne/.test(n),
    reveal:
      'Le vers existe en deux versions. Sans indices dans les dés : « Prends la bête à 8 mains ». 30 vins divins : « Prends la bête à 2 mains ». 8 + 2 = 10. La bête se prend à 10 mains.',
    quotes: [
      { text: 'Prends la bête à 8 mains, dans l’aiguille j’ai vu un aigle.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
      { text: 'Prends la bête à 2 mains, dans les chiffres j’ai vu un aigle.', song: '30 vins divins', slug: '30-vins-divins' },
    ],
    hints: [
      'Le même vers revient dans deux morceaux de l’EP, avec un nombre différent à chaque fois.',
      '8 mains dans Sans indices dans les dés, 2 mains dans 30 vins divins.',
      'Additionne les deux.',
    ],
  },
  {
    id: 'bete-b',
    branch: 'la-bete',
    source: '10 mains',
    // Sa source EST la réponse du signe précédent : tant qu'il est
    // verrouillé, on affiche ce libellé neutre à la place.
    lockedLabel: 'Le mot de passe précédent',
    rank: 1,
    requires: ['bete-a'],
    answer: '10 cornes',
    match: (n) => /cornes?/.test(n),
    reveal:
      'Dix, parce que la bête de l’Apocalypse a dix cornes. Les mains du refrain ne comptent pas des mains : elles comptent les cornes de la bête. C’est pour ça que 8 + 2 devait tomber juste.',
    quotes: [
      { text: 'Prends la bête à 8 mains, dans l’aiguille j’ai vu un aigle.', song: 'Sans indices dans les dés', slug: 'sans-indice-dans-les-des' },
      { text: 'Prends la bête à 2 mains, dans les chiffres j’ai vu un aigle.', song: '30 vins divins', slug: '30-vins-divins' },
    ],
    hints: [
      'Pourquoi dix, précisément ? La réponse n’est pas dans les paroles.',
      'Cherche la bête de l’Apocalypse : on la décrit toujours par ce qu’elle porte sur la tête.',
      'Elle en a dix.',
    ],
  },

  /* --------------------------------------------------------- l'équation */
  {
    id: 'm-m',
    branch: 'equation',
    source: 'M = M',
    rank: 1,
    requires: [],
    answer: 'Mécanisme = Matière',
    match: (n) => /mecanism/.test(n) && /matiere/.test(n),
    reveal:
      'M égale M : mécanisme égale matière. Les deux mots reviennent partout, toujours ensemble, toujours équivalents — l’un devient l’autre et réciproquement.',
    quotes: [
      { text: 'Je sais que le QI change, M égale M à jamais.', song: '30 vins divins', slug: '30-vins-divins' },
      { text: 'Aujourd’hui je suis la matière, demain je serai les mécanismes.', song: '30 vins divins', slug: '30-vins-divins' },
      { text: 'La matière le résultat, M égale M infiniment.', song: 'Multivers', slug: 'multivers' },
      { text: 'Tout a une logique, matière et mécanisme.', song: 'Multivers', slug: 'multivers' },
    ],
    hints: [
      'Deux mots du vocabulaire de White Cadae commencent par M et ne se quittent jamais.',
      'Multivers : « Tout a une logique, ______ et ______. »',
      'Écris les deux mots séparés par un « = ».',
    ],
  },
];

/* --------------------------------------------------------- convergences */

// Deux signes différents qui aboutissent au même mot : c'est là que
// l'arborescence se referme. Le libellé n'est envoyé au client que lorsque
// tous les signes concernés ont été trouvés (sinon il vendrait la mèche).
export const CONVERGENCES = [
  {
    id: 'conv-les-57',
    branch: 'les-57',
    from: ['s57-b', 'trompette'],
    label: 'Signe',
    note: '57 et trompette ne disent qu’une seule chose. L’un se voit, l’autre s’entend.',
  },
  {
    id: 'conv-vins-divins',
    branch: 'vins-divins',
    from: ['cinq-vins', 'trente-vins-b'],
    label: '25 décembre',
    note: '5 vins divins par l’addition, 30 vins divins par le milieu : les deux morceaux tombent sur le même jour.',
  },
];

/* ----------------------------------------------------------------- API */

const BY_ID = new Map(RIDDLES.map((r) => [r.id, r]));

export function getRiddle(id) {
  return BY_ID.get(id) || null;
}

// Un signe n'est jouable que si tous ses prérequis sont déjà trouvés.
export function isLocked(riddle, solvedIds) {
  return riddle.requires.some((id) => !solvedIds.has(id));
}

export function checkAnswer(riddle, answer) {
  const n = normalize(answer);
  if (!n) return false;
  return riddle.match(n);
}

// La vue publique d'un signe : tout ce que le client a le droit de savoir.
// `progress` est la ligne riddle_progress du membre (ou undefined).
function publicRiddle(riddle, progress, solvedIds) {
  const hintsUsed = Math.min(progress?.hints_used || 0, riddle.hints.length);
  const solved = !!progress?.solved_at;
  const locked = !solved && isLocked(riddle, solvedIds);
  const view = {
    id: riddle.id,
    branch: riddle.branch,
    // La source d'un signe verrouillé peut être la réponse du signe qui le
    // précède : dans ce cas elle reste masquée jusqu'au déverrouillage.
    source: locked && riddle.lockedLabel ? riddle.lockedLabel : riddle.source,
    rank: riddle.rank,
    requires: riddle.requires,
    locked,
    hintCount: riddle.hints.length,
    hints: riddle.hints.slice(0, hintsUsed),
    solved,
    revealed: !!progress?.revealed,
  };
  if (solved) {
    view.answer = riddle.answer;
    view.reveal = riddle.reveal;
    view.quotes = riddle.quotes;
  }
  return view;
}

// L'état complet du jeu pour un membre donné.
export function buildState(rows) {
  const byId = new Map(rows.map((r) => [r.riddle_id, r]));
  const solvedIds = new Set(rows.filter((r) => r.solved_at).map((r) => r.riddle_id));

  const riddles = RIDDLES.map((r) => publicRiddle(r, byId.get(r.id), solvedIds));
  const convergences = CONVERGENCES.map((c) => {
    const open = c.from.every((id) => solvedIds.has(id));
    return open
      ? { id: c.id, branch: c.branch, from: c.from, open: true, label: c.label, note: c.note }
      : { id: c.id, branch: c.branch, from: c.from, open: false };
  });

  const found = RIDDLES.filter((r) => solvedIds.has(r.id) && !byId.get(r.id)?.revealed).length;
  return {
    branches: BRANCHES,
    riddles,
    convergences,
    total: RIDDLES.length,
    solved: solvedIds.size,
    found,
  };
}
