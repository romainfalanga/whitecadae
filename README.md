# White Cadae — Escape Game Orange

Application JavaScript sans framework : Cloudflare Worker, assets statiques, D1 et lecteur audio natif persistant.

## Pages et progression

- `/` : présentation, musiques et pages déjà découvertes.
- `/musique` : albums 57, 114 et 18 juillet 2019, déblocage morceau par morceau.
- `/signes` : propositions de signes, anciennement `/echelon`.
- `/signes/horloge` : tableaux de construction, uniquement après la découverte de L’horloge.
- `/echelon` : parcours de 33 échelons, réglages du compte et membres jusqu’à l’échelon courant inclus.
- `/chanson/:slug` : paroles accessibles depuis le lecteur selon les droits du morceau.
- `/game-master-orange` : accompagnement mutuel des joueurs, à l’échelon 11.
- `/mecanisme` et `/mecanisme/:slot` : dix mécanismes modifiables, à l’échelon 12.
- `/matiere` : chronologie personnelle, vécu, créations et liens, à l’échelon 18. `/arbre-de-vie` redirige vers cette page.
- `/carre-d-as` : carré personnel et accompagnements privés, à l’échelon 20.

Ces quatre liens apparaissent progressivement dans le menu et sur l’accueil. Matière et Mécanismes restent privés jusqu’à l’activation explicite de leur partage commun. Chaque carré comprend son centre et jusqu’à quatre AS ; chacun peut accompagner jusqu’à quatre autres centres. L’ajout d’un AS se fait par recherche de pseudo exact, puis acceptation de l’invitation. Les AS peuvent répondre aux événements, créations, liens et mécanismes dans leur discussion dédiée (`/carre-d-as/fil/:id`). Les créations contiennent un texte et/ou un lien HTTPS externe, sans stockage de fichiers multimédias supplémentaire. Les sessions, contrôles d’accès, données chiffrées, migrations et vérifications sont détaillés dans [la documentation des espaces personnels](docs/private-spaces.md).

Le menu comprend Escape Game Orange, Musiques, Signes et Échelons ; Horloge s’ajoute immédiatement après la découverte de L’horloge dans Aiguille. `/api/me` utilise la progression canonique pour cette condition, sans déblocage par niveau ni exception administrateur. Les anciens liens d’énigmes et d’Horloge redirigent vers Signes. `/parcours` et les anciens profils redirigent vers Échelons, dont l’URL reste `/echelon`. Les API historiques `/api/echelon` et `/api/57` restent des alias du jeu pour les anciens clients ; le nouveau client utilise `/api/signes`.

Le départ est à 1. Les 32 réponses distinctes actives permettent d’atteindre 33. Les fragments, répétitions et réponses retirées n’ajoutent aucun point. Le catalogue serveur `src/echelon.js` définit la progression ; les réponses non trouvées ne sont pas transmises. À 33, le même composant « Échelon 33 / Rejoindre » apparaît sur l’accueil et Signes. Son adresse de destination reste côté serveur avant ce seuil.

Chaque tentative admise dans Signes ou Horloge déclenche une pause commune de 33 secondes, y compris les erreurs, découvertes partielles et répétitions. Une échéance par compte dans `echelon_attempts` est réclamée atomiquement côté serveur ; les alias d’API la partagent. Les requêtes bloquées renvoient 429 et le temps restant sans prolonger la pause. `public/attempt-timer.js` désactive les saisies et manipulations des tableaux, conserve les brouillons et affiche un compteur doré, centré au-dessus du lecteur. Les secondes ne réécrivent pas les formulaires. Navigation, rechargement et autres onglets conservent l’échéance ; retour au premier plan et focus relisent le serveur, sans interrogation périodique. Un succès affiche seulement « +1 échelon » dans une fenêtre centrale légère, refermable et temporaire, sans annoncer les contenus débloqués.

La validation normalise accents, casse, ponctuation et espaces, puis compare la proposition entière à une réponse ou un fragment autorisé. Les variantes de nombre grammatical sont explicites : « expansion harmonieuse » vaut ainsi « expansions harmonieuses ». Les mots parasites et listes de réponses ne révèlent aucun fragment. Les nombres séparés ne sont jamais fusionnés pour fabriquer une réponse. `tests/sign-validation.test.mjs` couvre les 25 réponses textuelles ; les sept constructions d’Horloge sont vérifiées séparément côté serveur.

Le signe `n-0-3` (Katikas) est retiré du score, sans suppression de son historique. L’énigme « En nous collant au bon endroit, un troisième apparaîtra. » n’attend que Devincix à partir de l’échelon 8. La nouvelle réponse `eg-16-4`, « Expansions harmonieuses », appartient à 57 et rapporte son propre échelon, indépendamment de « Mélange les… ». `SCORE_VERSION=2` recalcule les index de roadmap antérieurs. Aucun transfert automatique de point ni remise à zéro de compte.

| Échelon | Morceau |
| --- | --- |
| 1 | 30 vins divins |
| 2 | Sans indices dans les dés |
| 3 | 13h20 |
| 4 | Orange |
| 5 | La matière danse |
| 6 | Les probabilités |
| 7 | Fais Mieux |
| 8 | Wanheda |
| 9 | Quand je vois je pense |
| 10 | Un fil entre deux infinis |

L’ordre d’écoute de 57 est 13h20, 30 vins divins, Sans indices dans les dés, Orange. Les variantes audio continues ne contiennent que les pistes accessibles à leur seuil. Le lecteur passe de chapitre en chapitre dans le même fichier pour limiter les interruptions lorsque le téléphone est verrouillé. Le service worker ne met jamais en cache les médias protégés ni les API.

## Roadmap

`src/roadmap.js` filtre les compteurs, noms et photos côté serveur : les membres des échelons inférieurs et de l’échelon courant sont visibles, soi-même compris ; les échelons supérieurs restent masqués, même pour un administrateur. Seuls les nombres sont chargés initialement. Un clic sur le compteur ouvre les identités, 24 membres par page avec un curseur. Les boutons +/− ouvrent et réduisent chaque liste indépendamment en 220 ms ; son contenu reste en mémoire jusqu’à la navigation pour une réouverture immédiate. Le survol à la souris ou le focus clavier peut préparer la liste ; aucune prélecture globale. Les requêtes simultanées sont regroupées. Les listes réduites sont inertes et la préférence de mouvement réduit supprime la transition. Aucune adresse email, réponse ou information de session ne figure dans ces listes. L’adresse mail du propriétaire du compte est renvoyée uniquement dans `self`, pour son formulaire en lecture seule.

Les étoiles sont des astres sphériques de plasma. La couleur suit `t = (effectif − minimum) / (maximum − minimum)` parmi les échelons occupés visibles : rouge à 0, exactement orange à 0,5, jaune à 1. La teinte varie continûment sans arrondi ni catégories ; 29 reste proche d’un maximum de 30 et toute la gamme se recalcule si le maximum passe à 90. Une population uniforme reste orange. Les échelons vides sont atténués, la suite reste sombre. Aucun effectif caché n’entre dans le calcul.

La page Échelons réunit pseudo, photo et mot de passe. Le changement de mot de passe exige le mot de passe actuel et déconnecte les autres sessions ; l’adresse mail n’est pas modifiable. Signes et Échelons partagent le même composant de connexion anonyme.

`roadmap_levels` est un index dérivé, jamais une seconde source de progression. Des triggers invalident sa révision après les découvertes. Une écriture conditionnelle empêche qu’un calcul ancien remplace une progression plus récente ; les lignes périmées sont exclues des lectures. Incrémenter `SCORE_VERSION` dans `src/roadmap-levels.js` si le calcul des signes change. La migration `0033_roadmap.sql` est additive et appliquée automatiquement si nécessaire.

`public/stellar.js` projette une sphère 3D et sa texture volumique sur un seul canvas WebGL hors écran, à 192 pixels. Chaque astre visible est calculé une seule fois puis affiché comme petite image WebP ; les variantes identiques sont réutilisées. Le travail se fait par tâches différées près de la zone visible, sans boucle d’animation, interrogation périodique ou bibliothèque graphique. Les ressources sont libérées à la navigation. Un rendu CSS de sphère assure le repli si WebGL est indisponible. Les photos de profil sont recadrées à 256 pixels avant envoi ; l’API contrôle format, signature et taille, puis les sert sans cache public.

## Espaces retirés

Conversation, sujets, projets, Brainstorm, Vidéographie et anciennes contributions en écriture sont fermés. Leurs API renvoient 410. Aucune messagerie n’est ajoutée à la roadmap. Le binding historique Durable Object reste déclaré pour la compatibilité du déploiement ; sa classe refuse les connexions.

## Développement et publication

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec wrangler dev
pnpm exec wrangler deploy --dry-run --experimental-provision=false
pnpm exec wrangler deploy --experimental-provision=false
```

`schema.sql` et `seed.sql` servent à créer une base locale neuve. **Ne pas rejouer les seeds ni les anciennes migrations de renommage sur la production.** Le catalogue maintient ses données ciblées sans effacer les paroles. Les déploiements normaux ne suppriment aucun compte.

Comptes : PBKDF2-SHA256, cookies HttpOnly/Secure/SameSite et réservation atomique des tentatives d’authentification, y compris concurrentes. Aucune adresse déclarée à l’inscription ne confère de droits administrateur ; les rôles sont provisionnés en privé, les rôles existants sont conservés. Les administrateurs peuvent écouter les morceaux mais ne contournent pas la progression de la roadmap ni le seuil final. Les écritures refusent les origines étrangères et imposent JSON sur les API actives. Les en-têtes de sécurité des pages et des API sont alignés.

`pnpm-workspace.yaml` épingle les correctifs de sécurité des dépendances de Miniflare ; utiliser le verrou pnpm pour les reproduire. Voir `docs/ux-security-audit.md` pour les vérifications et limites, notamment la visibilité des solutions dans le dépôt GitHub public. Ne pas confondre leur absence des réponses API avec leur confidentialité dans un dépôt public.

## Suppression exceptionnelle des comptes

Cette opération est distincte de la publication et doit être explicitement autorisée. Exporter D1 avec une connexion disposant des droits D1, conserver la sauvegarde **hors du dépôt**, puis préparer et répéter la suppression sur cette copie :

```sh
npx wrangler d1 export whitecadae-db --remote --output=/private/backup.sql
node scripts/account-reset-plan.mjs /private/backup.sql /private/reset-plan
```

Ce script est exclusivement local : il ne contacte pas la production. Il refuse les tables non classées, contrôle les références, répète la suppression dans une transaction annulée, vérifie que le catalogue reste identique et conserve la séquence des identifiants. L’opérateur doit aussi inventorier et sauvegarder les éventuels médias personnels R2, puis vérifier les comptes, sessions, brouillons, historiques et tables retirées après exécution. Aucun reset ne doit être réalisé sans export vérifié. Ne jamais effacer les fichiers audio du site.

Voir `docs/roadmap-stars-audit.md` pour les règles et contrôles actuels, et `docs/roadmap-audit.md` pour l’évolution initiale et la remise à zéro précédente.
