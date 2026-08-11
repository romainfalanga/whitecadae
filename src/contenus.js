// WhiteCadae : les contenus des hautes pages (échelons 5 et 7)
//
// Comme les réponses du jeu, ces textes ne vivent que côté Worker : ils ne
// sont servis qu'à ceux dont l'échelon y donne droit. Les mettre dans
// public/ reviendrait à les offrir à quiconque lit le JavaScript.

/* ---------------------------------------------------------- les cinq axes ---
   Cinq espaces existent d'avance pour chacun dans Pense Mieux. Ils ne
   s'ouvrent pas, ne se referment pas : on les nourrit.

   Deux d'entre eux se répondent en miroir. La psychologie dit le présent :
   comment on fonctionne, ce qu'on constate de soi. Le moi harmonieux dit vers
   quoi l'on tend. L'un décrit, l'autre vise, et la distance entre les deux est
   le travail.

   `partage` dit qui les lit, et c'est la règle centrale de la plateforme :

     - `moi` : la psychologie et le moi harmonieux ne sortent jamais. Personne
       d'autre que soi ne les voit, carré compris. On ne travaille pas son
       rapport à soi sous le regard des autres.

     - `carre` : la philosophie, le multivers et la société harmonieuse sont
       lus par les As de ses carrés, qui peuvent y répondre. Ce sont les trois
       matières du travail commun — et un carré n'existe que pour elles.

   Tout le reste de Pense Mieux (les réflexions qu'on ouvre soi-même) est
   privé, sans exception.

   `commun` : ces trois mêmes axes existent aussi comme arbre DU carré, écrit
   par les quatre. `publique` : le multivers seul est lu par toute la
   plateforme — un modèle d'univers ne vaut que confronté aux autres.       */

export const AXES = {
  psy: {
    titre: 'Ma psychologie',
    court: 'Psychologie',
    sous: 'Le présent : comment tu fonctionnes, ce que tu constates de toi.',
    miroir: 'moi',
    partage: 'moi',
    commun: false,
  },
  moi: {
    titre: 'Le moi harmonieux',
    court: 'Moi harmonieux',
    sous: 'Ce vers quoi tu tends : ta version la plus harmonieuse.',
    miroir: 'psy',
    partage: 'moi',
    commun: false,
  },
  philo: {
    titre: 'Ma philosophie',
    court: 'Philosophie',
    titreCarre: () => 'Notre philosophie',
    sous: 'Tes questions, tes constats, et ce qu’ils font de ta façon de penser.',
    sousCarre: 'Vos questions, vos constats, et ce qu’ils font de votre façon de penser.',
    partage: 'carre',
    commun: true,
  },
  univers: {
    titre: 'Mon multivers',
    court: 'Multivers',
    titreCarre: () => 'Notre multivers',
    sous: 'Tes modèles d’univers. Ils sont lus par tous les As.',
    sousCarre: 'Les modèles d’univers que vous imaginez ensemble. Lus par tous les As.',
    partage: 'carre',
    commun: true,
    publique: true,
  },
  societe: {
    titre: 'Ma société harmonieuse',
    court: 'Société harmonieuse',
    titreCarre: () => 'Notre société harmonieuse',
    sous: 'La société la plus harmonieuse que tu imagines, et son chemin du réel.',
    sousCarre: 'La société la plus harmonieuse que vous imaginez ensemble, et son chemin du réel.',
    partage: 'carre',
    commun: true,
  },
};

// L'ordre de lecture : le miroir d'abord (le présent, puis ce vers quoi il
// tend), puis les trois matières que l'on porte devant son carré.
export const AXES_ORDRE = ['psy', 'moi', 'philo', 'univers', 'societe'];

/* --------------------------------------------- Carré d'As (échelon 5) --- */

export const MISSIONS_CARRE = {
  titre: 'Les missions des carrés',
  blocs: [
    {
      titre: 'Composer son carré',
      texte:
        'Un carré, c’est quatre personnes qui acceptent de penser sous le '
        + 'regard des trois autres. Cherchez des esprits qui ne voient pas '
        + 'comme vous : un carré où tout le monde pense pareil n’apprend rien '
        + 'à personne.',
    },
    {
      titre: 'Creuser votre philosophie',
      texte:
        'Chacun porte la sienne, et vous en écrivez une ensemble. Elle naît de '
        + 'vos questions et de vos constats, jamais d’une position qu’on '
        + 'défend. Quand l’un de vous avance, entrez chez lui : approfondissez '
        + 'ce qu’il dit, élargissez son champ, ou opposez-lui une issue — '
        + 'jamais une objection seule.',
    },
    {
      titre: 'Imaginer votre multivers',
      texte:
        'Chacun tient ses modèles d’univers, et le carré tient les siens. '
        + 'Confrontez-les : un modèle ne vaut que face aux autres, et c’est en '
        + 'les reliant qu’on en fabrique de nouveaux.',
    },
    {
      titre: 'Imaginer votre société harmonieuse',
      texte:
        'Imaginez ensemble la société la plus harmonieuse que vous puissiez '
        + 'concevoir, puis montrez-lui le chemin du réel. Trouvez les '
        + 'expansions harmonieuses qui y mènent, et faites-les exister sous '
        + 'plusieurs formes.',
    },
    {
      titre: 'S’élever ensemble',
      texte:
        'Ce que vous vous apportez n’a qu’un but : que chacun voie plus de '
        + 'variables qu’il n’en voyait seul. L’expansion harmonieuse d’un '
        + 'carré engendre celle de ses As, et réciproquement.',
    },
  ],
};

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
        'Ton carré d’as est né à l’échelon 5 : quatre esprits qui ne voient pas comme toi.',
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
      page: '/pense-mieux/multivers',
      pageLabel: 'Les multivers',
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

/* ------------------------------------------- les réponses du carré ------
   Ce qu'un As dépose dans la réflexion d'un autre. Il ne commente pas : il
   apporte des variables. Trois manières, et une seule règle — aider l'autre à
   penser plus juste, jamais avoir raison contre lui.                      */

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

export const REPONSES_CLES = REPONSES.map((r) => r.cle);
