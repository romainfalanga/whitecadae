# Audit Signes / Échelon — 29 septembre 2026

## Périmètre

Revue des routes Worker et SPA, authentification et édition du compte, état canonique des signes, constructions Horloge, calendrier musical et contrôle des fichiers, cache/service worker, pages chargées, schéma et anciennes migrations. Les changements ciblent la nouvelle roadmap, les liens et l’édition du profil ; les moteurs musicaux et de construction éprouvés restent en place.

## Corrections et décisions

- Séparation explicite `/signes` et `/echelon`, conservation des identifiants de progression, brouillons et alias API historiques. Les URLs avec barre finale sont normalisées.
- Composant final partagé : Échelon 33 et Rejoindre, pas de texte annonçant la destination. Marge réduite avant le premier signe.
- Filtrage strict des membres et photos côté serveur, y compris pour un administrateur. Anciennes photos publiques retirées. Aucun email ni détail de découverte dans la roadmap.
- Index de score révisé à chaque changement de progression et recalculé depuis les signes canoniques. Les instantanés invalidés sont exclus ; la mise à jour conditionnelle protège des écritures concurrentes.
- Pagination par identifiant, 24 membres à la fois, 3 aperçus par échelon. Requêtes annulées à la navigation, réponses anciennes ignorées, pas de rafraîchissement périodique.
- Pseudo validé et attribution conditionnelle atomique pour éviter les collisions. Images limitées, signatures contrôlées, compression locale à 256 pixels, repli pour les navigateurs sans createImageBitmap.
- Anciennes API communautaires restent fermées. Les données privées ne sont pas mises en cache. Les anciens identifiants de compte ne seront pas réutilisés après suppression.
- README réécrit : il décrivait encore Conversation, l’ancien profil et d’anciens seuils incompatibles avec la version actuelle.

## Validation

Tests Node/SQLite : progression 1–33, anciens signes retirés, réponses répétées, accès Horloge, constructions et brouillons concurrents, seuils musicaux, variantes continues, requêtes Range, lecteur et répétition, retrait des anciens espaces. Tests ajoutés : anonymes, membres strictement inférieurs, pagination, curseurs invalides, absence d’informations privées, invalidation de scores, photos protégées, profil et alias Signes. La préparation de reset est répétée sur une base locale avec contrôle du catalogue, des références et des séquences.

Navigateur local avec le véritable Worker : rendu à 1440 et 390 pixels, modification/enregistrement/rechargement du pseudo et de la photo, liste des membres, 33 étapes, absence de débordement horizontal, composant final et ancien lien Horloge. Le bloc final et l’accueil emploient exactement le même générateur HTML. Compilation Cloudflare contrôlée avec un dry-run.

## Limites

La visibilité est réévaluée à chaque requête ; elle n’efface pas une information qu’un membre avait déjà vue. La nouvelle page charge les données à son ouverture et les listes sur demande ; elle n’est pas un flux temps réel. Le score dérivé dépend d’une augmentation de SCORE_VERSION lors d’un futur changement de catalogue.

Les tests du lecteur vérifient le comportement logiciel, sans constituer une mesure sur tous les modèles de téléphones verrouillés. Aucun appareil iOS physique ni test de charge de grande ampleur n’a été utilisé pour cette évolution.

La suppression de production est une opération séparée : son achèvement doit être prouvé par l’export, les compteurs après suppression et une vérification des sessions. Ce document ne prétend pas qu’elle a eu lieu.
