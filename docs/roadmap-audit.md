# Audit Signes / Échelon — 30 septembre 2026

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

83 tests Node/SQLite passent : progression 1–33, anciens signes retirés, réponses répétées, accès Horloge, constructions et brouillons concurrents, seuils musicaux, variantes continues, requêtes Range, lecteur et répétition, retrait des anciens espaces. Tests ajoutés : anonymes, membres strictement inférieurs, pagination, curseurs invalides, absence d’informations privées, invalidation de scores, photos protégées, profil, inscription concurrente et alias Signes. La préparation de reset est répétée sur une base locale avec contrôle du catalogue, des références et des séquences.

Navigateur local avec le véritable Worker : rendu à 1440, 390 et 320 pixels, modification/enregistrement/rechargement du pseudo et de la photo, déconnexion, liste des membres, 33 étapes, absence de débordement horizontal, transition éclairé/ombre à l’échelon 8, composant final et ancien lien Horloge. Le bloc final et l’accueil emploient exactement le même générateur HTML. Compilation Cloudflare contrôlée avec un dry-run.

## Publication et remise à zéro

Version Worker publiée : `8a0551cc-f1ee-4d25-8b35-60cffccbde21`. Les fichiers publics ont été comparés à leurs copies locales par SHA-256 ; les API publiques Signes et roadmap, les restrictions musicales et les anciens espaces fermés ont été contrôlés sur whitecadae.fr.

Après autorisation explicite de l’accès D1 et de la suppression, export SQL complet sauvegardé hors dépôt, restauré localement et vérifié. 33 comptes ont été supprimés avec leurs progressions, sessions, photos, brouillons, vocaux et anciennes contributions. Le bucket R2 `whitecadae-media` était vide ; les deux anciennes références vidéo étaient des dépôts en attente sans fichier. Le code des anciens Durable Objects n’enregistrait pas de contenu durable ; les WebSockets sont fermés par la classe retirée.

Un compte temporaire a vérifié en production l’inscription à 1, le contrôle musical, la découverte d’un signe, le passage de la roadmap à 2 et la déconnexion. Le compte a ensuite été supprimé par un nettoyage exécuté dans `finally`. Un nouvel export après ce nettoyage confirme zéro compte, zéro session et les 46 tables de données des comptes vides. L’empreinte du catalogue albums/chansons/paroles est identique avant et après. La séquence des comptes est conservée (34 après le test), donc les prochains identifiants ne réutiliseront pas ceux des anciens brouillons locaux.

## Limites

La visibilité est réévaluée à chaque requête ; elle n’efface pas une information qu’un membre avait déjà vue. La nouvelle page charge les données à son ouverture et les listes sur demande ; elle n’est pas un flux temps réel. Le score dérivé dépend d’une augmentation de SCORE_VERSION lors d’un futur changement de catalogue.

Les tests du lecteur vérifient le comportement logiciel, sans constituer une mesure sur tous les modèles de téléphones verrouillés. Aucun appareil iOS physique ni test de charge de grande ampleur n’a été utilisé pour cette évolution.

Les sauvegardes locales demandées restent disponibles hors du dépôt. Elles ne sont pas publiées avec le site.
