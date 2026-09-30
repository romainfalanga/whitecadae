# Audit de l’expérience et de la sécurité — 30 septembre 2026

## Modifications visibles

- Horloge et Musiques : suppression du surlignage tactile bleu, focus clavier doré conservé. Les durées jumelées sont séparées par un tiret.
- Pause commune de 33 secondes : capsule dorée centrée au-dessus du lecteur, progression visuelle discrète, texte stable. Les champs restent bloqués après un succès, un échec, une réponse partielle ou répétée.
- Progression : fenêtre centrale « +1 échelon » avec nombre et libellé alignés, disparition après 4,2 secondes, fermeture au clic ou avec Échap. Aucun contenu débloqué n’est annoncé.
- Erreurs et lien Horloge : bordures et contrastes harmonisés, message bref ; lien identifié par un cadran décoratif.
- Paroles : retrait du lien de proposition de signe et réduction de la marge après le bouton d’écoute.
- Roadmap : ouverture et fermeture en 220 ms, +/− sans rotation, listes indépendantes conservées en mémoire, états accessibles et repli inerte. Préparation au survol souris ou focus, réservation de hauteur pendant le chargement, pagination à 24 membres.

## Fluidité

Le compteur ne rescane plus tous les formulaires à chaque tic. Les boutons des morceaux ne sont réécrits que lorsque leur état ou leur morceau change. Les pochettes sous la première sont chargées à la demande. Les flous permanents du header et du lecteur sont supprimés. Aucune nouvelle bibliothèque, image lourde ou animation permanente n’est ajoutée au navigateur. Le rendu différé des astres et son repli CSS sont conservés. Les transitions respectent `prefers-reduced-motion`.

Les contrôles visuels locaux couvrent les largeurs 320, 390 et 1440 pixels : listes ouvertes/repliées, musique, paroles, bouton Horloge, notification et compteur. Les contrôles à 320 pixels confirment l’absence de débordement et le centrage du compteur dans la largeur utile. Le lecteur conserve ses changements de piste et sa pause. Ce contrôle par navigateur ne remplace pas une mesure sur tous les téléphones physiques ni un test de charge.

## Politique des réponses

Le catalogue compte toujours 32 réponses : 25 textuelles et sept constructions Horloge, donc 33 échelons avec le départ à 1. Aucun compte ni historique n’est réinitialisé.

Chaque réponse textuelle a ses exemples acceptés et ses contre-exemples dans `tests/sign-validation.test.mjs`. Accents, casse, ponctuation, espaces manquants et variantes grammaticales explicitement prévues sont tolérés. Le singulier « expansion harmonieuse » est accepté pour 57 comme pour Mélange les. Les variantes ne sont pas produites par une distance de ressemblance générale : des noms différents et des concepts différents restent distincts.

L’ancien moteur pouvait reconnaître un fragment au milieu d’une proposition contenant un mot faux. Le moteur compare maintenant la proposition entière à une seule réponse ou à un fragment autorisé. Listes de solutions, mots parasites, négations et nombres artificiellement séparés ne rapportent rien. Les fragments déjà découverts peuvent toujours se compléter, sans point en double. Les opérations et résultats Horloge restent recalculés côté serveur à partir des éléments initiaux, sans faire confiance aux valeurs ou scores fournis par le client.

## Durcissement

- Réservation atomique des 33 secondes par compte, commune aux routes Signes, Horloge et anciens alias ; pas de contournement par requêtes simultanées, autre onglet ou rechargement.
- Corps JSON du jeu borné pendant sa lecture, avec refus des tableaux, valeurs non textuelles et charges trop longues. Aucune donnée fournie par le client ne peut imposer un score, une découverte ou un déblocage.
- Refus des écritures provenant d’une origine étrangère et des formulaires non JSON sur les API actives. Les limites serveur restent nécessaires : les en-têtes d’origine ne sont pas une authentification.
- Tentatives d’inscription et de connexion réservées atomiquement avant calcul ou écriture. Limites par adresse Cloudflare : six inscriptions/heure, vingt connexions/quinze minutes ; dix changements de mot de passe/quinze minutes et par compte/adresse. Les succès comptent aussi. L’absence d’adresse en test local ne simule pas la protection réseau de production.
- L’inscription ne peut plus créer un administrateur en déclarant simplement une adresse listée dans la configuration. Aucun rôle existant n’est modifié. L’attribution future d’un rôle reste une opération privée.
- Changement de mot de passe conditionné au hash vérifié, pour refuser une écriture concurrente périmée ; les autres sessions sont révoquées.
- CSP et Permissions-Policy des fichiers statiques alignées sur celles de l’API : cadres externes, micro et caméra fermés. Cookies HttpOnly/Secure/SameSite, cache privé, requêtes paramétrées et contrôles d’accès conservés.

## Dépendances et vérifications

L’audit pnpm initial signalait onze avis sur `sharp` et `undici`, dépendances de développement de Miniflare. Les correctifs `sharp@0.35.4` et `undici@7.29.1` sont épinglés dans `pnpm-workspace.yaml` et le verrou, sans changer Wrangler. L’audit pnpm après correction renvoie zéro avis connu. Aucune dépendance npm n’est embarquée par ces modifications dans le navigateur.

La suite de 138 tests couvre notamment tous les signes, les constructions, la progression canonique, les seuils audio, la confidentialité de la roadmap, les avatars, les sessions, les courses concurrentes, la pause interpages et le cycle de vie de la notification. Une compilation Worker à blanc complète ces contrôles. Les fichiers statiques publiés doivent être comparés par empreinte au dépôt et les API publiques/protégées contrôlées après déploiement.

## Limite de confidentialité à traiter séparément

Le dépôt GitHub est public et contient le catalogue des réponses côté serveur. Même si les solutions non découvertes ne sont jamais envoyées par l’API, une personne peut les lire dans GitHub ou son historique. Les contrôles de validation et de cadence ne rendent donc pas les solutions confidentielles. La visibilité du dépôt n’a pas été changée : cette décision relève du propriétaire. Un passage en privé limiterait les accès futurs sans effacer les copies déjà réalisées.

Le partage de solutions entre joueurs et les tentatives réparties sur plusieurs comptes/adresses IP ne peuvent pas être exclus par ces mesures. L’audit est une revue ciblée accompagnée de tests, pas une garantie d’absence absolue de faille ni un audit d’intrusion indépendant.
