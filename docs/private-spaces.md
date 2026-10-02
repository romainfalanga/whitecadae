# Espaces personnels — déploiement et confidentialité

## Accès

Les capacités `gameMaster`, `mechanisms`, `lifeTree` et `aceSquare` sont calculées depuis `gameLevel()` aux seuils 11, 15, 18 et 20. Le rôle administrateur ne contourne jamais les contrôles d’un arbre ou d’un carré. L’ancienne communauté reste fermée. Les interactions de ces espaces ne modifient pas la progression du jeu.

Chaque relation est orientée : un centre choisit jusqu’à quatre AS ; chaque AS accompagne jusqu’à quatre centres. Les deux quotas reposent sur des emplacements SQL uniques de 1 à 4. Les invitations expirent après sept jours ; au plus seize invitations impliquant le même compte peuvent être créées par jour. Les écritures privées ont un plafond commun de 45 requêtes par minute.

## Conservation et partage

- Consentement de conservation distinct du consentement de partage. L’information présentée est versionnée dans `privacy_consents`.
- Arbre privé par défaut. Après accord explicite, tous ses événements enregistrés et leurs évolutions sont visibles aux AS. Les brouillons restent privés.
- À son arrivée, un AS voit l’arbre actuel si le partage est actif, et les messages postérieurs à son entrée. Une réadmission commence une nouvelle période.
- Un retrait ou un blocage invalide les prochains accès. La conversation visible vérifie les droits environ toutes les cinq secondes. L’application masque les contenus lorsque l’onglet passe en arrière-plan, puis contrôle l’identité avant de les réafficher.
- Arrêter le partage retire les événements, activités et fils associés des vues des AS ; les messages généraux restent accessibles aux membres actifs.
- Supprimer un événement supprime ses liens et les échAS qui lui sont rattachés. L’export est paginé, réservé à l’auteur et n’inclut pas les messages des autres.
- La commande de retrait du consentement efface les espaces personnels de l’auteur et ses messages, et révoque ses participations. Elle conserve son compte et ses signes.
- Les signalements transmettent uniquement le message choisi et le motif volontaire. Leur consultation par le gestionnaire se fait dans `/signalements`, depuis `/admin`, sans accès à l’arbre.

Limites : 2 000 événements et 20 brouillons par compte, 12 thèmes par événement, 40 liens autour de deux événements, 20 000 échAS par carré, messages de 4 000 caractères. Pagination : 30 événements, 40 messages, 20 profils. Aucun texte intime dans les API publiques, le cache du service worker ou localStorage.

## Chiffrement

Les récits, titres, thèmes, liens, brouillons, présentations, messages et signalements sont chiffrés en AES-GCM avant D1. Le contexte authentifié comprend le propriétaire et l’identifiant de la ressource, ce qui empêche de déplacer un chiffré dans une autre ligne. Les thèmes sont indexés par HMAC propre au propriétaire. Les dates, catégories fermées, identifiants et relations nécessaires aux requêtes restent des métadonnées accessibles à l’infrastructure autorisée.

Ce n’est **pas** du chiffrement de bout en bout : le Worker déchiffre les contenus autorisés. Les exploitants de l’infrastructure peuvent techniquement accéder aux clés. Ne pas présenter cette architecture comme une certification juridique, médicale ou HDS.

Secret Worker obligatoire `PRIVATE_DATA_KEYS` :

```json
{"active":"v1","keys":{"v1":"BASE64_DE_32_OCTETS_ALEATOIRES"},"index":"AUTRE_CLE_BASE64_DE_32_OCTETS_ALEATOIRES"}
```

Générer les clés avec un générateur cryptographique et les conserver séparément de la base. Ne jamais écrire la vraie valeur dans le dépôt, le terminal partagé ou un compte rendu. Le chiffrement n’a aucun repli en clair. Pour une rotation, ajouter la nouvelle clé dans `keys`, changer `active`, conserver les anciennes clés de lecture et conserver `index` à l’identique. Tester la restauration de lignes anciennes et récentes avant toute suppression d’une ancienne clé. La perte des clés rend les contenus irrécupérables.

## Publication

1. Exporter D1 dans un dossier privé hors du dépôt et vérifier sa restauration locale.
2. Appliquer **une seule fois**, dans cet ordre, `0034_session_versions.sql`, puis `0035_life_and_aces.sql`. Ce sont des migrations additives ; elles ne suppriment ni compte ni progression. Ne pas réexécuter `schema.sql` sur la production.
3. Provisionner `PRIVATE_DATA_KEYS` avec `wrangler secret put`, puis activer `PRIVATE_SPACES_ENABLED=true` dans la version livrée. Les anciens déploiements continuent de fonctionner après ces ajouts de schéma.
4. Déployer la version testée, vérifier les refus anonymes, les assets et la navigation, puis contrôler l’identifiant de version actif.
5. Conserver la sauvegarde chiffrée/protégée et les clés séparément selon la politique de rétention de l’exploitant ; purger les environnements et comptes fictifs de recette.

Les sessions nouvelles stockent un condensat du jeton ; les anciennes sessions expirent normalement. Un changement de mot de passe incrémente la version des identifiants et conserve seulement la session qui effectue ce changement, dans une transaction. Une connexion entamée avec l’ancien mot de passe ne peut pas recréer une session après ce changement. Les tentatives de connexion sont limitées par IP et par identifiant de compte condensé.

Le backfill de roadmap traite au plus 64 historiques par appel et écrit leurs scores dans une requête groupée. Les comptes sans découverte sont indexés en une commande. Si d’autres historiques restent à reprendre, l’API refuse temporairement de publier des compteurs incomplets (`503`, `Retry-After`). Pour un import massif d’anciens comptes, terminer ce rattrapage avant de rouvrir le parcours.

## Vérifications

`node --test tests/*.test.cjs tests/*.test.mjs` couvre les seuils, l’isolation, les consentements, les capacités concurrentes, les conflits de versions, les invitations, les départs, les doublons, le chiffrement, la rotation, l’effacement, la modération, les grands jeux de données et la continuité musique/signes/horloge.

Les tests de recette Cloudflare ont été effectués sur un Worker protégé et une base séparée contenant uniquement des comptes fictifs. Le moteur workerd local Windows n’a pas pu démarrer ; aucune réussite de ce moteur local n’est revendiquée. La validation distante couvre le comportement du service D1 réel.

La possibilité de recopier une information déjà reçue ne peut pas être supprimée techniquement. La vérification d’adresse email, la récupération autonome de mot de passe et une authentification multifacteur restent des chantiers distincts. Le projet conserve son mécanisme PBKDF2 existant ; les corrections de ce lot ne valent pas un audit de sécurité indépendant ni une garantie d’absence de vulnérabilités.

Références : [D1 et transactions batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [restauration D1](https://developers.cloudflare.com/d1/reference/time-travel/), [autorisations OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [données de santé selon la CNIL](https://www.cnil.fr/fr/quest-ce-ce-quune-donnee-de-sante).

## Mise à jour du 2 octobre 2026

Après les migrations 0034 et 0035 déjà appliquées, sauvegarder et vérifier la restauration avant d’appliquer uniquement `0036_mechanisms.sql`. Elle ajoute une table, sans modifier les comptes, arbres, relations ou signes.

Mécanisme contient dix emplacements fixes et privés. Les trois propositions sont servies sans écriture initiale ; une modification consentie est chiffrée avec le propriétaire et le numéro d’emplacement comme contexte. Une sauvegarde concurrente est refusée par version. Vider un emplacement conserve un remplacement vide pour ne pas réintroduire la proposition. L’export et le retrait du consentement couvrent ces données. Elles ne sont jamais incluses dans le partage de l’arbre.

Le Carré d’AS recherche désormais un pseudo exact, sans annuaire ouvert. La réponse expose uniquement un identifiant et un pseudo éligibles, jamais un arbre, une adresse email ou une présentation. La recherche est limitée par compte ; les invitations, blocages et plafonds restent vérifiés côté serveur. Les anciennes préférences et codes sont conservés en base pour la compatibilité, sans interface d’annuaire.

La saisie des repères utilise des champs jour et année au clavier numérique et une liste de mois, sans calendrier natif. Changer de précision conserve les composantes déjà saisies. Les dates sont contrôlées avant l’envoi et de nouveau côté serveur.
