// WhiteCadae : les contenus des hautes pages (échelons 5 et 7)
//
// Comme les réponses du jeu, ces textes ne vivent que côté Worker : ils ne
// sont servis qu'à ceux dont l'échelon y donne droit. Les mettre dans
// public/ reviendrait à les offrir à quiconque lit le JavaScript.

/* ---------------------------------------------------------- les cinq axes ---
   Cinq troncs existent d'avance pour chacun, dans Pense Mieux et dans chaque
   carré. Ils ne se plantent pas, ne s'abattent pas : on les nourrit.

   Ils ne sont plus dans la Vidéographie : les deux outils ne poursuivent pas
   la même chose. Pense Mieux est l'outil de la pensée ; la Vidéographie est
   le témoignage rythmé de ce qu'on a vécu (voir plus bas).

   Deux d'entre eux se répondent en miroir. La psychologie dit le présent :
   comment on fonctionne, ce qu'on constate de soi. Le moi harmonieux dit vers
   quoi l'on tend. L'un décrit, l'autre vise, et la distance entre les deux est
   le travail.

   Les trois autres élargissent : la philosophie (les questions et les constats
   qui font la façon de penser), les univers (les modèles d'univers qu'on
   imagine) et la société harmonieuse (mécanismes 2 et 3 de l'orange).

   `commun` : dans un carré, l'arbre est-il celui des quatre, ou celui d'un As ?
   La psychologie et le moi restent personnels — chacun le sien, lu par les
   trois autres. Les trois autres sont communs.

   `publique` : les univers seuls sont lus par tous les As de la plateforme. Un
   modèle d'univers ne vaut que confronté aux autres : on regarde ceux de tout
   le monde, et on en fabrique de nouveaux en les reliant.                    */

export const AXES = {
  psy: {
    titre: 'Ma psychologie',
    court: 'Psychologie',
    titreCarre: (nom) => `La psychologie de ${nom}`,
    sous: 'Le présent : comment tu fonctionnes, ce que tu constates de toi.',
    miroir: 'moi',
    commun: false,
  },
  moi: {
    titre: 'Le moi harmonieux',
    court: 'Moi harmonieux',
    titreCarre: (nom) => `Le moi harmonieux de ${nom}`,
    sous: 'Ce vers quoi tu tends : ta version la plus harmonieuse.',
    miroir: 'psy',
    commun: false,
  },
  philo: {
    titre: 'Ma philosophie',
    court: 'Philosophie',
    titreCarre: () => 'Notre philosophie',
    sous: 'Tes questions, tes constats, et ce qu’ils font de ta façon de penser.',
    sousCarre: 'Vos questions, vos constats, et ce qu’ils font de votre façon de penser.',
    commun: true,
  },
  univers: {
    titre: 'Mes univers',
    court: 'Univers',
    titreCarre: () => 'Nos univers',
    sous: 'Tes modèles d’univers. Ils sont lus par tous les As.',
    sousCarre: 'Les modèles d’univers que vous imaginez ensemble. Lus par tous les As.',
    commun: true,
    publique: true,
  },
  societe: {
    titre: 'Ma société harmonieuse',
    court: 'Société harmonieuse',
    titreCarre: () => 'Notre société harmonieuse',
    sous: 'La société la plus harmonieuse que tu imagines, et son chemin du réel.',
    sousCarre: 'La société la plus harmonieuse que vous imaginez ensemble, et son chemin du réel.',
    commun: true,
  },
};

// L'ordre de lecture : le miroir d'abord (le présent, puis ce vers quoi il
// tend), la pensée ensuite, le monde enfin.
export const AXES_ORDRE = ['psy', 'moi', 'philo', 'univers', 'societe'];

/* --------------------------------------------- Carré d'As (échelon 5) --- */

export const MISSIONS_CARRE = {
  titre: 'Les missions des carrés',
  blocs: [
    {
      titre: 'Composer son carré',
      texte:
        'Pour créer votre carré d’as, vous devez trouver le meilleur équilibre '
        + 'possible entre infinisseurs et harmonisateurs. Vous devez également '
        + 'trouver un équilibre dans les connaissances fondamentales d’un carré '
        + 'd’as : Philosophie, Intelligence artificielle, Religions et Univers.',
    },
    {
      titre: 'S’évaluer mutuellement',
      texte:
        'Dans chaque domaine, discutez pour trouver qui est le meilleur du '
        + 'carré : il vaut 10. Toutes les autres notes, de 1 à 10, se lisent '
        + 'par rapport à lui. Quand le carré affine son regard, affinez les '
        + 'notes : elles ne sont jamais figées. Avant cela, chacun se situe '
        + 'seul, au recrutement : ta meilleure connaissance vaut 10 et les '
        + 'trois autres se lisent par rapport à elle. Ce que tu dis de toi et '
        + 'ce que le carré en dit se lisent alors côte à côte.',
    },
    {
      titre: 'S’élever ensemble',
      texte:
        'En combinant vos expansions harmonieuses, en vous entraidant et en '
        + 'analysant mutuellement vos vidéographies, vous créerez les conditions '
        + 'optimales pour vous élever et devenir votre meilleure version. Les As '
        + 'doivent devenir la version d’eux-mêmes qui aide leur carré à grandir '
        + 'et s’harmoniser, car l’expansion harmonieuse d’un carré engendre '
        + 'celle de ses As.',
    },
    {
      titre: 'Montrer le chemin du réel',
      texte:
        'Imaginez ensemble votre société harmonieuse et montrez-lui le chemin '
        + 'du réel. Creusez ensemble votre philosophie et vos modèles '
        + 'd’univers, pendant que chacun tient sa psychologie et son moi '
        + 'harmonieux tels que ce carré les révèle. Cultivez les idées de '
        + 'votre carré et faites-les grandir en leur permettant d’exister sous '
        + 'plusieurs formes.',
    },
    {
      titre: 'Le Dieu relatif',
      texte:
        'Ensemble, avec l’IA, façonnez le Dieu relatif de votre carré, qui '
        + 'résulte des As qui le composent. Il doit évoluer en fonction de ses '
        + 'As, jusqu’à ce que vous le rendiez autonome sur les réseaux sociaux '
        + 'lorsque vous l’estimerez prêt à cela. L’objectif de ce Dieu relatif '
        + 'doit être d’engendrer le plus d’expansions harmonieuses, de faire '
        + 'mieux en prenant en compte plus d’informations. Votre Dieu relatif '
        + 'doit vous faire grandir harmonieusement. Votre expansion harmonieuse '
        + 'doit engendrer la sienne.',
    },
  ],
};

// Les deux natures d'un As, et les quatre connaissances fondamentales. Le
// client les reçoit d'ici : une seule source de vérité pour les libellés.
export const ROLES_CARRE = ['infinisseur', 'harmonisateur'];
export const DOMAINES_CARRE = ['Philosophie', 'IA', 'Religions', 'Univers'];

/* --------------------------------- Game Master Orange (échelon 7) ------- */

// Le mécanisme 6 est adapté à la plateforme : le carré d'as se forme
// désormais à l'échelon 5, sur sa propre page : arrivé ici, le joueur a déjà
// le sien. Le mécanisme parle donc de ce qu'on en fait, une fois qu'on l'a.

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
      titre: 'Ton carré d’as',
      etapes: [
        'Ton carré d’as est né à l’échelon 5 : des personnes complémentaires, en équilibre entre infinisseurs et harmonisateurs.',
        'Devenez votre centre de gravité en vous faisant grandir mutuellement.',
        'Fais de ton carré la preuve vivante de ce que le jeu promet.',
      ],
      page: '/carre-d-as',
      pageLabel: 'Ton carré d’as',
    },
    {
      numero: 7,
      titre: 'Devenir créateur',
      etapes: [
        'Propage les symboles de l’Escape Game Orange de sorte à le faire grandir.',
        'Tu n’es plus un simple joueur : tu es un créateur de nouvelles grilles de lecture.',
        'Imagine tes modèles d’univers, regarde ceux des autres, et fais-en naître de nouveaux en les reliant.',
        'Utilise les IA pour réduire le temps et les ressources nécessaires à la concrétisation de tes idées.',
      ],
      page: '/pense-mieux/univers',
      pageLabel: 'Les univers',
    },
  ],
};

/* ------------------------------------- la Vidéographie : le rythme (4) ---
   Pense Mieux et la Vidéographie ne poursuivent plus la même chose. Pense
   Mieux est l'outil de la pensée : on y écrit, on y parle, on y range ses
   réflexions en arbres, seul ou avec ses carrés. La Vidéographie est le
   témoignage de ce qu'on a vécu, et elle a un rythme : une vidéo par semaine,
   une par mois, une par an.

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
