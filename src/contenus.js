// WhiteCadae — les contenus des hautes pages (échelons 5 et 7)
//
// Comme les réponses du jeu, ces textes ne vivent que côté Worker : ils ne
// sont servis qu'à ceux dont l'échelon y donne droit. Les mettre dans
// public/ reviendrait à les offrir à quiconque lit le JavaScript.

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
        + 'd’as : Psychologie, Univers, IA et Religions.',
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
        + 'du réel. Cultivez les idées de votre carré et faites-les grandir en '
        + 'leur permettant d’exister sous plusieurs formes.',
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
export const DOMAINES_CARRE = ['Psychologie', 'Univers', 'IA', 'Religions'];

/* --------------------------------- Game Master Orange (échelon 7) ------- */

// Le mécanisme 6 est adapté à la plateforme : le carré d'as se forme
// désormais à l'échelon 5, sur sa propre page — arrivé ici, le joueur a déjà
// le sien. Le mécanisme parle donc de ce qu'on en fait, pas de le trouver.

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
    },
    {
      numero: 3,
      titre: 'Ta version harmonieuse',
      etapes: [
        'Imagine ta version harmonieuse.',
        'Trouve les expansions harmonieuses qui te permettront d’y arriver.',
        'Montre-leur le chemin du réel.',
      ],
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
        'Utilise les IA pour réduire le temps et les ressources nécessaires à la concrétisation de tes idées.',
      ],
    },
  ],
};
