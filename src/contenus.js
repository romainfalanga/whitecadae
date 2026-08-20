// WhiteCadae : les contenus des hautes pages (échelons 5 et 7)
//
// Comme les réponses du jeu, ces textes ne vivent que côté Worker : ils ne
// sont servis qu'à ceux dont l'échelon y donne droit. Les mettre dans
// public/ reviendrait à les offrir à quiconque lit le JavaScript.

/* -------------------------------------------------------- les quatre axes ---
   Quatre espaces existent d'avance pour chacun dans Pense Mieux. Ils ne
   s'ouvrent pas, ne se referment pas : on les nourrit.

   Deux d'entre eux se répondent en miroir. La psychologie dit le présent :
   comment on fonctionne, ce qu'on constate de soi. Le moi harmonieux dit vers
   quoi l'on tend. L'un décrit, l'autre vise, et la distance entre les deux est
   le travail.

   Les quatre sont à soi, et à personne d'autre : Pense Mieux est le lieu où
   l'on se regarde penser, pas celui où l'on est regardé. Ce qu'on imagine à
   plusieurs vit ailleurs — dans les sociétés harmonieuses des carrés.      */

export const AXES = {
  psy: {
    titre: 'Ma psychologie',
    court: 'Psychologie',
    sous: 'Le présent : comment tu fonctionnes, ce que tu constates de toi.',
    miroir: 'moi',
  },
  moi: {
    titre: 'Le moi harmonieux',
    court: 'Moi harmonieux',
    sous: 'Ce vers quoi tu tends : ta version la plus harmonieuse.',
    miroir: 'psy',
  },
  philo: {
    titre: 'Ma philosophie',
    court: 'Philosophie',
    sous: 'Tes questions, tes constats, et ce qu’ils font de ta façon de penser.',
  },
  societe: {
    titre: 'Ma société harmonieuse',
    court: 'Société harmonieuse',
    sous: 'La société la plus harmonieuse que tu imagines, et son chemin du réel.',
  },
};

// L'ordre de lecture : le miroir d'abord (le présent, puis ce vers quoi il
// tend), puis la philosophie et la société harmonieuse.
export const AXES_ORDRE = ['psy', 'moi', 'philo', 'societe'];

/* --------------------------------------------- Carré d'As (échelon 5) ---
   Un carré, c'est quatre As qui imaginent ENSEMBLE des sociétés
   harmonieuses. Chaque société qu'ils conçoivent a un nom, et se pense sur
   deux volets : ce qui lui permet d'être, et comment les humains s'y
   comporteraient. Le carré ne regarde pas l'intérieur des personnes : il
   construit des modèles, à quatre.

   On fonde autant de carrés qu'on veut, on entre dans autant qu'on veut :
   chaque carré est un atelier de plus.                                    */

export const CHARTE_CARRE =
  'Un carré, c’est quatre As qui imaginent ensemble des sociétés '
  + 'harmonieuses : ce qui permet à chacune d’être, et comment on y vivrait. '
  + 'Cherche des esprits qui ne voient pas comme toi : un carré où tout le '
  + 'monde pense pareil n’imagine qu’une seule société.';

/* Les deux volets d'une société harmonieuse. `etre` : ses fondations, ce qui
   la rend possible et la fait tenir. `vivre` : les comportements des
   individus qui l'habitent — ce qu'ils feraient, mécaniquement, en y vivant. */
export const VOLETS_SOCIETE = [
  {
    cle: 'etre',
    titre: 'Ce qui lui permet d’être',
    aide: 'Ses fondations : ce qui rend cette société possible, et ce qui la fait tenir.',
  },
  {
    cle: 'vivre',
    titre: 'Comment on y vit',
    aide: 'Les comportements des individus : ce qu’ils feraient, mécaniquement, en vivant dedans.',
  },
];

export const VOLETS_CLES = VOLETS_SOCIETE.map((v) => v.cle);

/* ------------------------------------------------ le 114 (échelon 7) ----

   Le 57 a une suite : le 114. Elle n'est pas encore écrite. Ce que voit
   celui qui arrive au sommet, c'est donc la fin de la première partie et
   la promesse de la seconde : rien d'autre, et surtout aucun signe à
   chercher pour l'instant. Le texte vit ici, côté Worker, servi au seul
   échelon 7 : le lire dans le code source du navigateur est impossible. */

export const PAGE_114 = {
  titre: '114',
  // ce qui s'affiche sous le titre, quand la page s'ouvre enfin
  intro: 'Tu es arrivé au bout de la première partie de l’escape game.',
  attente: {
    titre: 'La suite arrive',
    lignes: [
      'Le 114 est la suite du 57 : d’autres signes, d’autres cadenas.',
      'Elle n’est pas encore ouverte.',
      'Reviens : la seconde partie de l’escape game arrivera prochainement.',
    ],
  },
};

/* ------------------------------------- la Vidéographie : le rythme (4) ---
   Pense Mieux et la Vidéographie ne poursuivent plus la même chose. Pense
   Mieux est l'outil de la pensée : on y parle, ses pensées deviennent des
   vidéos, on les range en branches. La Vidéographie est le témoignage de ce
   qu'on a vécu, et elle a un rythme : une vidéo par semaine, une par mois,
   une par an.

   Chaque vidéo est un récap : ce qu'on a vécu sur la période, du point de vue
   de ce qu'on a ajouté dans Pense Mieux et de ce qu'on a vécu avec ses carrés
   d'as. La plateforme prépare la matière — elle sait ce qui a été écrit, dit
   et décidé pendant la période — et c'est à la personne de la raconter.   */

export const CADENCES = [
  {
    cle: 'semaine',
    titre: 'La vidéo de la semaine',
    invite:
      'Raconte ta semaine : ce que tu as ajouté dans Pense Mieux, ce que tu as '
      + 'vécu avec tes carrés, et ce que la semaine a changé pour toi.',
  },
  {
    cle: 'mois',
    titre: 'La vidéo du mois',
    invite:
      'Prends de la hauteur sur le mois : les trajectoires qui se dessinent, '
      + 'ce qui revient, ce que tes carrés t’ont fait voir.',
  },
  {
    cle: 'annee',
    titre: 'La vidéo de l’année',
    invite:
      'L’année entière : d’où tu es parti, où tu en es, ce que ta psychologie '
      + 'et ton moi harmonieux se sont dit pendant douze mois.',
  },
];

export const CADENCES_ORDRE = CADENCES.map((c) => c.cle);

/* ------------------------------------------- les réponses d'autrefois ---
   Du temps où un carré lisait les branches de son porteur, un As pouvait y
   déposer une réponse : approfondir, élargir, opposer en résolvant. Le carré
   ne lit plus l'intérieur de personne — mais les réponses déjà déposées
   restent chez leur destinataire, et ces libellés servent encore à les
   afficher.                                                               */

export const REPONSES = [
  {
    cle: 'approfondir',
    label: 'Approfondir',
    aide: 'Creuse ce qui est dit : ce qu’il y a dessous, et qui n’a pas encore été nommé.',
  },
  {
    cle: 'elargir',
    label: 'Élargir',
    aide: 'Ouvre le champ des possibles : ce que cette réflexion ne voit pas encore.',
  },
  {
    cle: 'opposer',
    label: 'Opposer et résoudre',
    aide: 'Dis ce qui s’y oppose, puis la solution qui prend en compte plus de variables. '
      + 'Une opposition sans issue n’aide personne.',
  },
];

