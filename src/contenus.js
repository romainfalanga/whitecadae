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

/* --------------------------------- Game Master Orange (échelon 7) ------- */

// Le mécanisme 6 est adapté à la plateforme : le carré d'as se fonde à
// l'échelon 5, sur sa propre page : arrivé ici, le joueur a déjà le sien. Le
// mécanisme parle donc de ce qu'on en fait, une fois qu'on l'a.

export const MECANISMES_GMO = {
  titre: 'Les 7 mécanismes orange',
  intro:
    'Tu es au sommet de l’échelle. Ce qui suit n’est plus une énigme : c’est '
    + 'ce qu’on attend de toi.',
  mecanismes: [
    {
      numero: 1,
      titre: 'Devenir Game Master Orange',
      etapes: [
        'Trouve les personnes les plus harmonieuses dans ton entourage.',
        'Montre-leur le début de l’Escape Game Orange.',
        'Deviens un Game Master Orange.',
      ],
    },
    {
      numero: 2,
      titre: 'Ta société harmonieuse',
      etapes: [
        'Imagine une société harmonieuse.',
        'Trouve les expansions harmonieuses qui permettront d’y arriver.',
        'Montre-leur le chemin du réel.',
      ],
      // le tronc qui porte ce mécanisme, dans les trois outils
      page: '/pense-mieux',
      pageLabel: 'Ma société harmonieuse',
    },
    {
      numero: 3,
      titre: 'Ta version harmonieuse',
      etapes: [
        'Imagine ta version harmonieuse.',
        'Trouve les expansions harmonieuses qui te permettront d’y arriver.',
        'Montre-leur le chemin du réel.',
      ],
      page: '/pense-mieux',
      pageLabel: 'Le moi harmonieux',
    },
    {
      numero: 4,
      titre: 'Extérioriser et organiser',
      etapes: [
        'Extériorise tes réflexions et idées en vidéo.',
        'Organise-les pour visualiser tes trajectoires et choisir celles que tu veux voir grandir.',
        'Partage tes expansions harmonieuses sur les réseaux sociaux et parles-en aux Game Masters Orange.',
      ],
      // le mécanisme a ses outils sur la plateforme même
      page: '/videographie',
      pageLabel: 'Ta vidéographie',
    },
    {
      numero: 5,
      titre: 'Propager l’esprit orange',
      etapes: [
        'Propage l’esprit orange en commentaires sur les réseaux sociaux.',
        'Crée les commentaires les plus courts possible qui engendrent le plus d’expansions harmonieuses.',
        'Termine tes commentaires avec un cœur orange 🧡.',
      ],
    },
    {
      numero: 6,
      titre: 'Tes carrés d’as',
      etapes: [
        'Un carré d’as, c’est quatre esprits qui imaginent ensemble des sociétés harmonieuses.',
        'Pour chacune, cherchez ce qui lui permet d’être, et comment les humains s’y comporteraient.',
        'Fais de vos modèles la preuve vivante de ce que le jeu promet.',
      ],
      page: '/carre-d-as',
      pageLabel: 'Tes carrés d’as',
    },
    {
      numero: 7,
      titre: 'Devenir créateur',
      etapes: [
        'Propage les symboles de l’Escape Game Orange de sorte à le faire grandir.',
        'Tu n’es plus un simple joueur : tu es un créateur de nouvelles grilles de lecture.',
        'Imagine des modèles de société avec tes carrés, et fais-en naître de nouveaux en les confrontant.',
        'Utilise les IA pour réduire le temps et les ressources nécessaires à la concrétisation de tes idées.',
      ],
      page: '/carre-d-as',
      pageLabel: 'Tes carrés d’as',
    },
  ],
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

