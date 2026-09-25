# White Cadae — Escape Game Orange

Le site s’ouvre sur **Escape Game Orange** (`/`) : l’histoire de Vulpis, l’album **57** et les signes à retrouver dans ses quatre morceaux.

- **Musiques** (`/musique`, ancien `/57` redirigé vers l’album 57) : 13h20, 30 vins divins, Sans indices dans les dés, Orange. Dès cinq réponses complètes, l’EP **18 juillet 2019** apparaît : Wanheda, Quand je vois je pense, Un fil entre deux infinis. Les MP3 et la pochette originale fournis sont conservés sans conversion. La pochette s’affiche sur la page, dans le lecteur et dans les commandes système ; elle suit le même accès à l’échelon 5.
- **Paroles** (`/paroles`) : les sorties les plus récentes en premier, avec **Meta moi** en tête. Les paroles de 18 juillet 2019 suivent le même seuil de cinq réponses. Ma folie et Rendors-toi sont retirés du catalogue public, sans effacer les données historiques. Les liens `/chanson/:slug` sont conservés ; `/interpretations` et `/fil` redirigent vers les paroles.
- **Échelons** (`/echelon`) : toutes les énigmes et leurs champs sur une page, sans catégories ; seul le laboratoire Horloge possède une page distincte. Chaque réponse complète distincte rapporte un échelon. La connexion conserve la page demandée.

Le lecteur natif est placé hors du contenu remplacé par la navigation. Il apparaît à la première lecture, propose lecture/pause, précédent/suivant, déplacement dans le morceau, volume sur ordinateur et répétition de l’album. Il enchaîne les titres de l’EP sélectionné dans l’ordre puis s’arrête, sauf si la répétition est activée. La position est conservée localement ; un rechargement ne relance jamais la musique automatiquement. Les métadonnées système suivent l’EP actif.

Le seuil de **18 juillet 2019** est contrôlé côté serveur pour le catalogue musical, les paroles, le corpus historique et chaque requête audio, y compris les plages d’octets. Les réponses protégées ne sont pas mises en cache ; le service worker ne conserve aucun audio ni aucune API. La déconnexion retire l’EP du lecteur et décharge son audio. L’administrateur conserve son accès de gestion.

Les signes **5 vins divins** et **30 vins divins** possèdent chacun leur champ et une seule réponse complète : « 25 décembre », également acceptée sous la forme « 25/12 ». Chacun rapporte un échelon. L’ancien crédit de la seconde réponse numérique est transféré à la seconde formule pour préserver le score et les accès existants ; les nouvelles propositions « Jésus » ne sont plus acceptées ici.

Media Session fournit titres, pochette et commandes système. L’audio reste actif quand la page devient invisible et utilise la session `playback` quand elle est disponible. **Le verrouillage réel d’un iPhone/Android doit être testé sur ces appareils** : un navigateur ou un système qui ferme/suspend l’onglet ne peut pas être contraint par le site. Aucun mode hors ligne de l’album n’est annoncé. Le service worker ignore les fichiers audio et les requêtes Range, et ne stocke jamais les réponses partielles 206.

Les nouveaux POST/PUT/PATCH d’interprétations, références, connexions et essais renvoient 410. Les anciennes contributions restent en base et dans les archives privées de leur auteur. Les anciens identifiants de progression sont conservés. Deux tables additives enregistrent les brouillons et les tentatives du nouveau jeu ; aucune ligne historique n’est supprimée. **Ne pas réimporter les paroles ni réinitialiser D1 lors du déploiement.**

## Vérifications de cette évolution

`npm test` couvre le lecteur (ordre, fin, répétition, reprise, commandes système, médias concurrents), la fermeture des anciennes écritures, l’API de paroles et les exclusions du service worker. Les essais de navigation, de rendu responsive et de lecture réelle se font dans le navigateur avec une base D1 locale.

Avant la publication : `npx wrangler deploy --dry-run`. Pour publier sur le Worker existant : `npx wrangler deploy`, avec une session Cloudflare autorisée. Les migrations additives `0027_echelon.sql` et `0028_conversation_echelons.sql` sont également appliquées à la volée, sans réimport de données. Ne pas rejouer un `ALTER TABLE` manuel après son application automatique. Publier avec `--keep-vars` sur le Worker existant.

## Échelons

Le champ sans indice est disponible dès le départ, en première position, sans titre ni compteur de réponses. Seul M = M (infini avec deux M) possède un visuel, lisible sur ordinateur et mobile. XEU est présenté sans image. « Détails » conserve le même identifiant de découverte qu’auparavant.

Le catalogue et les réponses vivent exclusivement dans `src/echelon.js`. `src/echelon-api.js` ne transmet que les pages déjà découvertes ; visibilité et permission de répondre sont vérifiées séparément côté serveur. Un ancien lien API `/api/57` utilise le même état filtré. L’ancien endpoint de remise à zéro est retiré pour préserver les droits historiques.

Chaque réponse complète distincte vaut un échelon, y compris lorsqu’une même page contient plusieurs réponses. Le départ est à zéro. Les fragments et les étapes intermédiaires ne rapportent aucun point. Aucun plafond ni inventaire des pages futures n’est transmis au navigateur. **57** accepte « 12 apôtres » et « Signe » ; **7** accepte « Galaxie » et « Signe ». Ces réponses sont indépendantes d’Aigle et de Trompettes. Les découvertes historiques retrouvent leurs signes et conservent le crédit Aigle déjà accordé. Une ancienne réponse complète « 12 archanges » conserve son échelon sous la lecture corrigée ; seul le fragment numérique 12 est transféré lorsqu’elle était incomplète. Les énigmes aux réponses communes sont espacées, y compris au fil des déblocages. Les catégories et pages d’observation ajoutées sont retirées ; les réponses retirées restent dans l’historique mais ne comptent plus dans le nouveau jeu.

### AA, arborescence et conversation

À partir de cinq réponses complètes, **AA** apparaît dans Échelons et accepte « Andromédien autiste ». Le bouton **AA** sous le récit d’accueil ouvre `/aa`, le récit de l’artiste avant Vulpis. Le texte est servi par une API protégée au même seuil que l’EP 18 juillet 2019, sans contenu caché dans les fichiers publics.

Le profil personnel ouvre **Mon arborescence** (`/parcours`). La carte représente les dépendances réelles et les états résolu, partiel, disponible et verrouillé. Les filtres et la recherche mettent en lumière les pistes ; chaque carte explique ses conditions d’accès et mène à son champ dans Échelons ou au laboratoire Horloge. Le nombre d’échelons envisageables est calculé sur le territoire actuellement visible ; la porte reste non dénombrée. La carte et son API ne donnent jamais l’inventaire futur ni les réponses non trouvées. Le plan détaillé et les règles de conservation sont documentés dans `docs/parcours-aa-conversation.md`.

Les thèmes **Général**, **Indices**, **Interprétations** et **Idées** se croisent avec les filtres d’échelon. Le thème est choisi pour chaque nouveau message ; les messages historiques appartiennent à Général et conservent leur audience. Les filtres et la pagination sont appliqués sur le serveur avant la limite de 100 messages. La migration additive `0032_conversation_themes.sql` est appliquée automatiquement après contrôle des colonnes existantes. Ne pas la rejouer manuellement sur une base déjà migrée.

La réponse Horloge ouvre immédiatement le laboratoire unique `/echelon/horloge`. Tous les tableaux de durées y sont réunis, avec des brouillons indépendants. Les anciennes URLs d’énigmes, de lectures et de galeries ramènent à `/echelon` ; les anciennes URLs de tableaux ramènent à Horloge. Aucun texte d’indice ni bouton de superposition n’est affiché. Les constructions utilisent des arbres d’opérations et l’origine de chaque chiffre, validés côté serveur dans `src/echelon-workshop.js`. Former deux sept distincts active immédiatement « Dupliquer », même avant la fin de la sauvegarde ; aucun échelon n’est gagné à cette étape. Le bouton cible le dernier nombre sélectionné, même si un autre est encore sélectionné. Le 50 puis le 2 peuvent servir chacun deux fois, avec contrôle de leur provenance côté serveur. Les résultats numériques seuls ne suffisent pas à valider une construction. La lecture symbolique du premier tableau reste une clé propre à l’œuvre.

Les tableaux sont manipulables au toucher et au clavier, avec annulation, rétablissement et reprise des durées. Les brouillons sont conservés sur l’appareil et sur le compte. Un numéro de révision empêche un appareil d’écraser silencieusement l’autre. Le serveur réserve atomiquement les tentatives et ralentit les erreurs répétées.

`src/enigmas57.js` conserve le catalogue historique uniquement pour traduire les anciennes découvertes, préserver les droits aux espaces privés et partager le moteur de reconnaissance. Les autres espaces privés conservent leur rang d’accès historique. La conversation utilise directement le nombre de réponses complètes du nouveau jeu, sans plafond fixé à sept. Les profils filtrent leurs découvertes selon ce que leur visiteur peut déjà connaître.

Les tests couvrent la migration des découvertes, les permissions, les constructions, le score, la concurrence des brouillons, le lecteur et les fonctions conservées. Aucune base de production n’est réinitialisée.

### Pages conservées et espaces retirés

La page porte le nom **Échelons** dans le menu, les titres et les liens. Son adresse `/echelon` reste stable pour conserver les liens et les brouillons existants. Le compteur individuel reste « Échelon N ».

L’album anciennement nommé « 114 » est renommé **Fais mieux**, comme son morceau. La migration ciblée `0029_album_fais_mieux.sql` modifie uniquement le titre de l’album existant (id 4), en conservant ses trois morceaux et leurs paroles. Elle est appliquée automatiquement à la première lecture du catalogue par le Worker, via sa connexion D1 existante ; elle est idempotente et ne nécessite aucune extension des droits de l’outil de déploiement.

Pense Mieux, Carré d’As, Brainstorm et la page 114 sont retirés du menu et du routage. Leurs anciens liens affichent une page supprimée ; leurs endpoints dédiés renvoient 410. Le moteur partagé des réflexions refuse les contenus de type `pensee`, tout en conservant ceux de Vidéographie. Les données historiques ne sont pas effacées. Vidéographie et ses récapitulatifs restent accessibles selon les droits existants, en attendant leur évolution.

La **Conversation** s’ouvre dès deux réponses complètes. Chaque nouveau message porte l’échelon minimal réel de lecture, choisi de 2 à l’échelon atteint par son auteur. Les filtres utilisent les mêmes valeurs et suivent le score renvoyé par le serveur. L’administrateur peut choisir tous les échelons actuellement définis dans le catalogue ; ce plafond évolue automatiquement.

La colonne `echelon_version` distingue les messages historiques (1) des nouveaux messages (2). Les anciens seuils ne sont jamais réinterprétés comme des scores : leur audience reste protégée par les droits historiques. Ils sont identifiés « Accès historique » et disposent d’un filtre distinct. Les filtres numériques portent sur les nouveaux messages. L’API vérifie les permissions à chaque lecture et écriture, refuse les seuils supérieurs au score et n’envoie jamais les messages inaccessibles. Les tests SQLite couvrent les niveaux au-delà de sept, les accès historiques, la migration additive et les valeurs invalides.

## Architecture

- **Cloudflare Workers** : une seule application qui sert l'API (`/api/*`)
  et le site statique (`public/`), sans framework ni étape de build.
- **Cloudflare D1** (SQLite serverless) : comptes, sessions, albums,
  chansons, paroles, annotations, connexions, progression du jeu de la
  page 57. Schéma dans `schema.sql`, migrations dans `migrations/`.
- **Authentification** : mots de passe hachés (PBKDF2‑SHA256, 100 000
  itérations), sessions par cookie `HttpOnly`/`Secure` valables 30 jours.

Le compte créé avec l'email listé dans `ADMIN_EMAILS` (`wrangler.jsonc`)
devient automatiquement **administrateur** : il accède à la page
`/admin` pour créer les albums/singles, les chansons, et coller les textes.

## Déploiement

Prérequis : un compte Cloudflare et Node.js.

```bash
npm install

# 1. Créer la base D1 (si elle n'existe pas déjà)
npx wrangler d1 create whitecadae-db
#    → reporter le database_id retourné dans wrangler.jsonc

# 2. Appliquer le schéma et les données initiales (album « 18 juillet 2019 »)
npm run db:schema
npm run db:seed

# 3. Déployer
npx wrangler deploy
```

Sur une base **déjà en service**, `npm run db:schema` suffit à créer les
tables ajoutées depuis (tout est en `CREATE TABLE IF NOT EXISTS`, les
tables existantes ne sont pas touchées). On peut aussi n'appliquer que la
dernière migration :

```bash
npx wrangler d1 execute whitecadae-db --remote --file=./migrations/0009_signes57.sql
```

Pour le développement local :

```bash
npm run db:local   # crée la base locale
npm run dev        # http://localhost:8787
```

## Contenu initial

L'album **18 juillet 2019** est pré-rempli avec cinq titres :
*Wanheda*, *Quand je vois je pense*, *Ma folie*,
*Un fil entre deux infinis*, *Rendors-toi*.
Les paroles s'ajoutent depuis la page **Administration** (une ligne par
vers, une ligne vide entre les strophes).

**Meta moi** figure en tête de la page Paroles, sous son propre titre.
La migration additive `0031-meta-moi-single` le rattache à une sortie simple
en dernière position du catalogue chronologique, sans toucher aux paroles.
Son texte fourni par l’artiste est conservé dans
`src/meta-moi.js`. Le Worker ajoute ce morceau et ses paroles une seule
fois via sa connexion D1 existante, à la première ouverture du catalogue
ou du morceau. Une transaction et un marqueur durable empêchent les
doublons et préservent les modifications ultérieures faites en administration.

> ⚠ Remplacer les paroles d'une chanson supprime les explications déjà
> attachées à ses anciennes phrases et mots (les explications portant sur
> la chanson entière sont conservées).
