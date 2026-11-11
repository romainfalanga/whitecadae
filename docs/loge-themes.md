# Thèmes hebdomadaires de la Loge

La sous-page `/loge-virtuelle/theme` est réservée aux Game Masters Blancs au niveau réel 15, comme toutes les autres vues et API de la Loge. Elle garde le menu du site et la navigation Loge, Mes réflexions, Thème. Les favoris et interventions ne réapparaissent pas dans les menus.

## Semaine et vote

Les propositions visent la semaine suivante, du lundi à 00 h au lundi suivant à 00 h, en Europe/Paris. Les passages heure d’été/heure d’hiver sont pris en compte ; une semaine peut durer 167, 168 ou 169 heures. Une personne peut soutenir plusieurs propositions, avec un seul j’aime par proposition et la possibilité de retirer son soutien tant que le vote reste ouvert. Proposer n’ajoute aucun vote implicite.

À la clôture, la proposition qui a le plus de soutiens est choisie ; une égalité est départagée par l’ordre de dépôt. Une proposition sans vote peut donc gagner si toutes sont à zéro. Sans proposition, la nouvelle semaine n’a pas de thème imposé.

Les titres sont limités à 140 caractères. Casse, accents et espaces sont normalisés pour réutiliser un thème existant plutôt que créer une nouvelle identité. Un thème déjà sélectionné peut être reproposé par son identifiant depuis l’historique. Chaque édition dispose de nouvelles propositions et de nouveaux votes.

`loge_theme_weeks` fige le résultat et le nombre de soutiens dans une écriture atomique et idempotente. Les votes et propositions vérifient leur date limite dans la requête SQL. Les résultats restent immuables après la clôture. La sélection limite ses lots de rattrapage à 40 semaines par batch et traite les semaines manquées sans inventer d’éditions vides historiques.

Le Worker possède un handler `scheduled` et le déclencheur `0 22,23 * * SUN`. L’un des deux horaires UTC correspond au lundi minuit à Paris, selon la saison ; l’autre invocation est sans effet sur un résultat déjà fixé. Les lectures du site assurent aussi le rattrapage si une exécution a été retardée. Les votes restent clos à l’heure prévue, indépendamment de l’heure effective d’exécution.

## Réflexions et historique

Lors de la publication, la case « Cette réflexion concerne le thème de la semaine » est facultative. Le serveur résout le thème depuis sa propre édition courante : le client ne peut pas choisir librement un autre sujet pour sa publication. Un choix expiré renvoie 409 sans consommer la limite de publication ni créer une vidéo orpheline. Le rejeu d’un envoi déjà réussi conserve son association, même après changement de semaine.

L’association reste liée au thème et à son édition de publication. Le thème d’une publication ne peut pas être remplacé lors de l’édition de son titre. Les anciennes publications ne sont pas rattachées automatiquement. Les listes d’un thème rassemblent ses vidéos de toutes les éditions, avec pagination stable, en excluant les publications supprimées.

La page propose une recherche des anciens thèmes et leur remise au vote. Les vidéos conservent le lecteur, les commentaires et la barre de déplacement de la Loge ; elles démarrent uniquement après un appui. L’arrivée d’une nouvelle semaine actualise la page et la case de publication sans retaguer silencieusement un brouillon. Les réponses tardives ne remplacent pas une édition plus récente ou le compte actif.

## Données et API

La migration additive `0049_loge_themes.sql`, `schema.sql` et l’initialisation à la demande définissent les mêmes cinq tables : `loge_themes`, `loge_theme_candidates`, `loge_theme_votes`, `loge_theme_weeks`, `loge_post_themes`, avec leurs index. La migration a été appliquée en production le 1er novembre 2026 ; les cinq tables, six index et références de publication ont été vérifiés, sans contenu de test. Les textes, vidéos, commentaires et comptes existants ne sont pas réécrits. Les clés étrangères classent ces données dans la préparation de maintenance des comptes.

- `GET /api/loge/themes` : édition courante, prochaine semaine, propositions, premiers thèmes historiques, horloge serveur et prochaine publication autorisée.
- `GET /api/loge/themes/proposals?after=…` : suite des propositions en cours.
- `POST /api/loge/themes/proposals` : `{title, targetWeek}` ou `{themeId, targetWeek}`.
- `PUT /api/loge/themes/proposals/:id/like` : `{liked, targetWeek}`.
- `GET /api/loge/themes/history?q=…&after=…` : thèmes déjà sélectionnés, distincts et paginés.
- `GET /api/loge/themes/:id/posts?after=…` : vidéos de toutes les éditions du thème.
- `POST /api/loge/posts` : champ facultatif `themeWeek`, en plus du titre, lien et nonce existants.

Toutes les routes gardent l’authentification, le niveau réel, les réponses privées hors cache et la liaison du compte. Les écritures imposent l’origine et le JSON. Les listes ne transmettent pas d’adresse mail. La cadence de publication de 168 heures et les protections des commentaires restent indépendantes des votes.

## Vérification

Les tests SQLite couvrent les changements d’heure, les dates limites, les égalités, l’absence de proposition, les votes répétés, les résultats immuables, les semaines manquées, les anciens thèmes, les associations, les conflits et les quotas. Les vrais handlers Worker sont exercés avant/après minuit en été et en hiver, sans visiteur, puis une seconde fois pour vérifier l’idempotence. Les tests client couvrent propositions, soutiens, recherche, sélection historique, brouillons, changement de semaine et saisie de commentaires agrandie.

Les tests ne reproduisent pas un navigateur connecté sur un téléphone physique. Aucun contenu de test n’est créé dans la base de production.
