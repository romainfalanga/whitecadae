# Conversation générale et sujets

Règles en vigueur à partir du 27 septembre 2026. Cette évolution remplace les anciens thèmes de conversation et le choix manuel de l'audience.

- La conversation générale s'ouvre à l'échelon 2.
- Tous les salons sont visibles dès l'échelon 12, y compris ceux créés par des personnes aux échelons supérieurs. En dessous de 12, l'API ne transmet ni titres, ni auteurs, ni messages de salons.
- Chaque compte peut créer un sujet à 12, deux au total à 18, trois au total à 23. Ces emplacements ne se renouvellent pas. L'administrateur utilise aussi son échelon réel pour ces quotas.
- Chaque nouveau message, dans la discussion générale comme dans un salon, enregistre l'échelon réel de son auteur au moment de l'envoi. Les personnes à cet échelon ou au-dessus peuvent le lire. La progression ultérieure ne modifie pas ce seuil.
- Les droits de lecture administratifs existants sont conservés, sans augmenter artificiellement l'échelon enregistré à l'envoi.
- Les messages des anciennes catégories rejoignent la conversation générale. Leurs audiences sont conservées, et ne sont pas présentées comme l'échelon réel de leur auteur, qui n'était pas enregistré.
- Vidéographie est retirée du menu et des déblocages. Les données et les anciens liens restent conservés avec leurs contrôles d'accès existants.

## Implémentation

`src/content-access.js` centralise les seuils 12, 18 et 23 et les annonces de déblocage. `src/conversation.js` vérifie les permissions à chaque requête.

`GET /api/conversation` lit la discussion générale. Le paramètre `topic` choisit un salon. `POST` sur ces mêmes adresses publie un message ; seule la propriété `body` est utilisée, les anciens champs `theme` et `min_echelon` sont ignorés. Le filtre numérique de lecture demeure disponible, indépendamment de la publication.

`GET /api/conversation/topics` liste les salons avec recherche `q` et pagination `before`. `POST` crée un salon avec `title` (80 caractères), `description` facultative (500 caractères) et `client_id` unique. Une insertion SQL conditionnelle impose le quota atomiquement. La contrainte unique `(user_id, client_id)` évite de consommer un deuxième emplacement lors d'une relance après une interruption réseau.

La migration est additive et automatique au premier appel : création de `conversation_topics`, ajout nullable de `conversation_messages.topic_id`, puis index `(topic_id,id)`. Les messages existants ont `topic_id = NULL`. Aucun message ni contenu vidéo n'est supprimé. `schema.sql` décrit aussi une base neuve ; il n'est pas réappliqué à la production.

`echelon_version` conserve la signification des données : 1 = ancien rang d'accès ; 2 = ancien compteur dont le départ était zéro ; 3 = audience choisie manuellement ; 4 = échelon réel enregistré à l'envoi. Le seuil corrigé de la version 2 reste augmenté de 1 à la lecture. Les filtres et permissions sont appliqués avant la pagination.

`public/chat.js` propose la discussion générale, l'annuaire des sujets et une discussion par salon. Les brouillons sont isolés par compte et salon. Le formulaire de création conserve son identifiant de relance. Le clavier mobile réduit l'espace occupé par l'en-tête et masque visuellement le lecteur sans interrompre l'audio.

## Validation

Les tests couvrent les seuils 11/12, 17/18 et 22/23, les quotas, les créations simultanées, les relances, les audiences figées, les requêtes falsifiées, la migration de l'ancien schéma, la séparation entre salons, les recherches et les paginations. Les tests du catalogue, des énigmes, du lecteur et des fonctionnalités conservées sont exécutés avec eux.
