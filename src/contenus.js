// WhiteCadae : les contenus des hautes pages (échelons 5 et 7)
//
// Comme les réponses du jeu, ces textes ne vivent que côté Worker : ils ne
// sont servis qu'à ceux dont l'échelon y donne droit. Les mettre dans
// public/ reviendrait à les offrir à quiconque lit le JavaScript.

/* -------------------------------------------------------- les trois axes ---
   Trois espaces existent d'avance pour chacun dans Pense Mieux. Ils ne
   s'ouvrent pas, ne se referment pas : on les nourrit.

   Mon fonctionnement regarde vers l'intérieur : comment je marche, et ce qui
   me ferait marcher mieux. La société regarde ce qui est là, dehors, tel que
   c'est. La société harmonieuse regarde ce vers quoi cela pourrait tendre.
   Ces deux-là se répondent en miroir : l'une constate, l'autre vise, et la
   distance entre les deux est le travail.

   Les trois sont à soi, et à personne d'autre : Pense Mieux est le lieu où
   l'on se regarde penser, pas celui où l'on est regardé. Ce qu'on imagine à
   plusieurs vit ailleurs — dans les sociétés harmonieuses des carrés.     */

export const AXES = {
  fonctionnement: {
    titre: 'Mon fonctionnement',
    court: 'Mon fonctionnement',
    sous: 'Comment tu fonctionnes : ce que tu constates de toi, et ce qui te ferait fonctionner mieux.',
  },
  societe_actuelle: {
    titre: 'La société',
    court: 'La société',
    sous: 'La société telle qu’elle est : ce que tu y observes, et pourquoi elle marche ainsi.',
    miroir: 'societe_harmonieuse',
  },
  societe_harmonieuse: {
    titre: 'Société harmonieuse',
    court: 'Société harmonieuse',
    sous: 'La société la plus harmonieuse que tu imagines, et son chemin du réel.',
    miroir: 'societe_actuelle',
  },
};

// L'ordre de lecture : soi d'abord, puis ce qui est là, puis ce vers quoi
// cela pourrait tendre.
export const AXES_ORDRE = ['fonctionnement', 'societe_actuelle', 'societe_harmonieuse'];

/* --------------------------------------------------------- les deux quêtes ---
   Une réflexion ne creuse pas dans tous les sens : elle creuse dans UN sens,
   et le dire au moment de l'ouvrir change ce qu'on y dépose. Ou bien elle
   descend vers la cause — pourquoi c'est ainsi — ou bien elle monte vers le
   remède — comment faire mieux. Les deux se répondent, mais elles ne se
   mènent pas de la même façon : mélangées dans une même réflexion, elles
   s'annulent.

   Une catégorie n'a pas de quête : elle range, elle ne creuse pas.        */

export const QUETES = {
  pourquoi: {
    titre: 'Pourquoi ?',
    court: 'Pourquoi',
    sous: 'Descendre vers la cause : pourquoi c’est ainsi, et d’où ça vient.',
  },
  mieux: {
    titre: 'Comment faire mieux ?',
    court: 'Faire mieux',
    sous: 'Monter vers le remède : ce qui ferait mieux, et par quel chemin.',
  },
};

export const QUETES_ORDRE = ['pourquoi', 'mieux'];

// Ce que le navigateur reçoit : les deux quêtes dans l'ordre, libellés
// compris. L'interface ne réécrit jamais ces mots de son côté.
export const QUETES_LISTE = QUETES_ORDRE.map((cle) => ({ cle, ...QUETES[cle] }));

// Une quête reçue du navigateur : 'pourquoi', 'mieux', ou rien du tout — une
// réflexion d'avant les quêtes n'en porte pas, et ne s'en invente pas une.
export function queteDe(valeur) {
  return QUETES[valeur] ? valeur : null;
}

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

   Le 57 a une suite : le 114. Elle n'est pas encore écrite. La page reste
   donc aussi muette que le 57 : un titre, un bloc qui dit que la suite
   arrive, un champ éteint. Rien à chercher pour l'instant, et rien qui
   l'explique. Le texte vit ici, côté Worker, servi au seul échelon 7 :
   le lire dans le code source du navigateur est impossible.            */

export const PAGE_114 = {
  titre: '114',
  // la seule phrase de la page : comme le 57, elle n'explique rien
  attente: 'La suite arrive',
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

