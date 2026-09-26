# Récit Orange et arborescence — 26 septembre 2026

## Plan et choix éditoriaux

1. Accueillir sous le titre Échelon 1, puis ajouter un chapitre par échelon atteint.
2. Relier les textes de 18 juillet 2019 au récit de Vulpis début 2023 (chronologie fournie par l’auteur).
3. À l’échelon 6, révéler que Vulpis est un personnage de White Cadae dans le contexte de son trouble schizoaffectif, et expliciter l’objectif de découverte de l’auteur et de compréhension de soi.
4. Conserver les apocalypses 16 et 26 sous la mention « Révélation à définir », conformément à la demande de l’auteur. Les autres textes accompagnent une lecture des chansons ; ils n’ajoutent pas de nouveaux événements biographiques.
5. Déplacer les paliers et accès vers l’accueil. Conserver une arborescence des énigmes sur une page large, avec défilement normal et liens explicites entre pistes.

Les chapitres 1–4 accompagnent 57 ; 5–8 contextualisent les trois morceaux de 2019 et la révélation ; 9–15 accompagnent l’expression, Fais Mieux et la relecture ; 17–25 proposent des rapprochements avec Meta moi et le reste du corpus. Aucun nouveau fait médical n’est inféré des paroles.

## Règles techniques

- `src/orange-story.js` est le catalogue éditorial côté serveur. `GET /api/orange` utilise uniquement la session et la progression enregistrées. Aucun paramètre de niveau fourni par le navigateur ne donne un accès.
- Le chapitre 1 est l’accueil dès zéro réponse ; le score du jeu reste zéro. Le chapitre 2 est débloqué au score 2. Aucun score ou seuil existant n’est renuméroté.
- Les comptes auteur voient les 26 chapitres avec une mention explicite de prévisualisation. Les visiteurs et membres ne reçoivent pas les textes futurs, même dans les sources JavaScript publiques.
- Le jeu possède actuellement 25 réponses possibles. Le chapitre 26 est préparé mais reste inaccessible aux joueurs tant que le jeu n’est pas étendu. Aucun point artificiel n’est ajouté.
- Les accès proviennent de `buildOpenings`, la source existante des permissions, et figurent sous le chapitre correspondant. Les accès historiques restent conservés. Horloge demeure une ouverture par découverte.
- Chaque chapitre peut recevoir un tableau `videos: [{title, url}]`. Il est filtré avec le chapitre, puis rendu comme liens de visionnage. Aucune vidéo fictive ni lecteur vide n’est affiché ; les vidéos seront à fournir.
- Les API restent `no-store` ; le service worker ne les enregistre pas. Sa version change pour actualiser la nouvelle feuille de style.
- `/parcours?view=ouvertures` redirige vers `/#mon-palier`. Les liens de Conversation et Échelons suivent cette nouvelle destination. Le lien « Mes paliers » est retiré du profil.
- L’arborescence organise les cartes selon leurs dépendances visibles. Sur grand écran, trois colonnes ; sur tablette, deux ; sur mobile, une. Aucun cadre interne à hauteur fixe ni panoramique horizontal. Les détails sont dépliables sur place et les liens entre pistes réinitialisent les filtres avant de placer le focus sur la cible.

## Validation

- Tests existants et tests du récit : 38 réussis, couvrant les seuils, le masquage des révélations, les mentions à définir, les contenus et la route publique.
- Essais navigateur sur une base SQLite locale isolée : visiteurs, niveaux 5, 6, 16, 25, auteur ; largeurs 390 et 1440 pixels ; absence de débordement horizontal, ouverture des détails, navigation entre pistes, recherche sans résultat, redirection de l’ancienne vue.
- Aucune migration de la base de production nécessaire.
