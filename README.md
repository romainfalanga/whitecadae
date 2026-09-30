# White Cadae — Escape Game Orange

Application JavaScript sans framework : Cloudflare Worker, assets statiques, D1 et lecteur audio natif persistant.

## Pages et progression

- `/` : présentation et musiques déjà découvertes.
- `/musique` : albums 57, 114 et 18 juillet 2019, déblocage morceau par morceau.
- `/signes` : propositions de signes, anciennement `/echelon`.
- `/signes/horloge` : tableaux de construction, uniquement après la découverte de L’horloge.
- `/echelon` : parcours de 33 échelons, pseudo et photo modifiables, membres strictement en dessous du visiteur.
- `/chanson/:slug` : paroles accessibles depuis le lecteur selon les droits du morceau.

Le menu comprend Escape Game Orange, Musiques, Signes et Échelons. Les anciens liens d’énigmes et d’Horloge redirigent vers Signes. `/parcours` et les anciens profils redirigent vers Échelons, dont l’URL reste `/echelon`. Les API historiques `/api/echelon` et `/api/57` restent des alias du jeu pour les anciens clients ; le nouveau client utilise `/api/signes`.

Le départ est à 1. Les 32 réponses distinctes actives permettent d’atteindre 33. Les fragments, répétitions et réponses retirées n’ajoutent aucun point. Le catalogue serveur `src/echelon.js` définit la progression ; les réponses non trouvées ne sont pas transmises. À 33, le même composant « Échelon 33 / Rejoindre » apparaît sur l’accueil et Signes. Son adresse de destination reste côté serveur avant ce seuil.

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

`src/roadmap.js` filtre les compteurs, noms et photos côté serveur : les membres des échelons inférieurs et de l’échelon courant sont visibles, soi-même compris ; les échelons supérieurs restent masqués, même pour un administrateur. Seuls les nombres sont chargés initialement. Un clic ouvre les identités, 24 membres par page avec un curseur. Aucune adresse email, réponse ou information de session ne figure dans ces listes. L’adresse mail du propriétaire du compte est renvoyée uniquement dans `self`, pour son formulaire en lecture seule.

Les 33 étoiles sont des SVG fixes. Les échelons occupés visibles vont du rouge (population minimale) au jaune (maximale), en passant par l’orange ; les égalités ont la même teinte et une population uniforme reste orange. Les échelons vides ont une étoile évidée, la suite reste sombre. Aucun effectif caché n’entre dans le calcul, aucune animation continue ni interrogation périodique du serveur.

La page Échelons réunit pseudo, photo et mot de passe. Le changement de mot de passe exige le mot de passe actuel et déconnecte les autres sessions ; l’adresse mail n’est pas modifiable. Signes et Échelons partagent le même composant de connexion anonyme.

`roadmap_levels` est un index dérivé, jamais une seconde source de progression. Des triggers invalident sa révision après les découvertes. Une écriture conditionnelle empêche qu’un calcul ancien remplace une progression plus récente ; les lignes périmées sont exclues des lectures. Incrémenter `SCORE_VERSION` dans `src/roadmap-levels.js` si le calcul des signes change. La migration `0033_roadmap.sql` est additive et appliquée automatiquement si nécessaire.

L’interface utilise 33 étapes HTML et du CSS statique : pas de canvas, animation permanente, interrogation périodique ou bibliothèque graphique. Les photos sont recadrées à 256 pixels avant envoi ; l’API contrôle format, signature et taille, puis les sert sans cache public.

## Espaces retirés

Conversation, sujets, projets, Brainstorm, Vidéographie et anciennes contributions en écriture sont fermés. Leurs API renvoient 410. Aucune messagerie n’est ajoutée à la roadmap. Le binding historique Durable Object reste déclaré pour la compatibilité du déploiement ; sa classe refuse les connexions.

## Développement et publication

```sh
npm install
npm test
npx wrangler dev
npx wrangler deploy --dry-run --experimental-provision=false
npx wrangler deploy --experimental-provision=false
```

`schema.sql` et `seed.sql` servent à créer une base locale neuve. **Ne pas rejouer les seeds ni les anciennes migrations de renommage sur la production.** Le catalogue maintient ses données ciblées sans effacer les paroles. Les déploiements normaux ne suppriment aucun compte.

Comptes : PBKDF2-SHA256, cookies HttpOnly/Secure/SameSite et limitation des tentatives. Les emails de `ADMIN_EMAILS` reçoivent les droits d’administration lors de l’inscription. Les administrateurs peuvent écouter les morceaux mais ne contournent pas la progression de la roadmap ni le seuil final.

## Suppression exceptionnelle des comptes

Cette opération est distincte de la publication et doit être explicitement autorisée. Exporter D1 avec une connexion disposant des droits D1, conserver la sauvegarde **hors du dépôt**, puis préparer et répéter la suppression sur cette copie :

```sh
npx wrangler d1 export whitecadae-db --remote --output=/private/backup.sql
node scripts/account-reset-plan.mjs /private/backup.sql /private/reset-plan
```

Ce script est exclusivement local : il ne contacte pas la production. Il refuse les tables non classées, contrôle les références, répète la suppression dans une transaction annulée, vérifie que le catalogue reste identique et conserve la séquence des identifiants. L’opérateur doit aussi inventorier et sauvegarder les éventuels médias personnels R2, puis vérifier les comptes, sessions, brouillons, historiques et tables retirées après exécution. Aucun reset ne doit être réalisé sans export vérifié. Ne jamais effacer les fichiers audio du site.

Voir `docs/roadmap-stars-audit.md` pour les règles et contrôles actuels, et `docs/roadmap-audit.md` pour l’évolution initiale et la remise à zéro précédente.
