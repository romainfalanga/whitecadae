# Publication de whitecadae.fr

## État du raccordement au 24 octobre 2026

Le domaine `whitecadae.fr` est relié au Worker Cloudflare `whitecadae` du compte `834ee251038ce2f923cba9847f973c40`.

Workers Builds est connecté au dépôt `romainfalanga/whitecadae`, avec publication de la branche `claude/whitecadae-music-platform-qfsv19`. La connexion au dépôt et le déclencheur ont été activés le 24 octobre 2026 ; les aperçus des autres branches restent désactivés.

Le premier build (`81df846e-b62d-43a6-8406-994310f16461`) a publié le commit `6b87727a6bcf7e1077817406096600a2fa1b0276`, qui retire Mécanismes, Vidéographie et Carré d’AS de la navigation et des déblocages. Le contrôle de publication a confirmé ce SHA sur `https://whitecadae.fr/deploy-info.json`, comparé les fichiers HTML, app.js et service worker, puis vérifié les API publiques (six contrôles réussis).

## Configuration Cloudflare Workers Builds

Sur le Worker existant **whitecadae**, les réglages suivants sont maintenant actifs dans **Settings → Builds**.

| Réglage | Valeur |
| --- | --- |
| Branche de production | `claude/whitecadae-music-platform-qfsv19` |
| Répertoire racine | `/` |
| Build command | `pnpm install --frozen-lockfile` |
| Deploy command | `pnpm run deploy:ci` |
| NODE_VERSION | `24` (également déclaré dans `.node-version`) |
| PNPM_VERSION | `11.25.0` (également déclaré dans `package.json`) |
| Déclenchement | Chaque push sur la branche de production |
| Autres branches | Ne pas les publier sur le Worker de production |

Utiliser un jeton de build Cloudflare autorisé à publier ce Worker et à utiliser ses bindings existants. Garder les secrets dans Cloudflare, notamment `PRIVATE_DATA_KEYS` ; aucune valeur secrète ne doit être copiée dans GitHub ou dans les journaux.

## Contrôles exécutés

`pnpm run deploy:ci` réalise successivement :

1. Les tests du dépôt et la validation du bundle Wrangler sans publication.
2. La génération de `public/deploy-info.json` avec le SHA du commit et la date du build. Ce fichier généré est ignoré par Git.
3. Le déploiement avec les ressources déjà déclarées, sans provisionnement automatique et en conservant les variables Cloudflare.
4. La lecture du marqueur public sur `https://whitecadae.fr`, qui doit contenir le SHA attendu, la comparaison des fichiers principaux et le contrôle des API publiques.

Une erreur bloque la commande. Une réponse HTTP 200 de l'ancien site ne suffit donc pas à valider un nouveau déploiement. Si la publication réussit mais que le contrôle final échoue, le build est signalé en échec ; examiner les journaux et corriger, car le contrôle ne restaure pas automatiquement une version antérieure.

Pour chaque modification, contrôler le succès du build Cloudflare et le marqueur `https://whitecadae.fr/deploy-info.json`. Une réponse de l’ancien site ne valide jamais une nouvelle publication.

## Données conservées

Le déploiement réutilise D1 `whitecadae-db` (`94a4fab8-be1e-41be-8ef1-df5aa32835f3`), R2 `whitecadae-media`, Workers AI et le Durable Object historique `BRAINSTORM_LIVE`. Le secret `PRIVATE_DATA_KEYS` reste dans Cloudflare.

La commande de publication n'exécute ni `schema.sql`, ni `seed.sql`, ni les migrations D1 historiques. Les initialisations et migrations ciblées déjà prévues par l'application conservent leur fonctionnement.

Les branches de travail passent par la branche de production avant publication. Pour créer des aperçus à l'avenir, prévoir d'abord leurs ressources et secrets distincts afin de ne pas modifier les données de production.

## Correction des paroles des Probabilités

La migration ciblée `migrations/0042_probabilities_lyrics.sql` a été appliquée en un lot D1 le 27 octobre 2026. Elle remplace le début du couplet par les trois lignes fournies par l’artiste, préserve les identifiants des lignes conservées et ignore une seconde exécution. Le fichier `lyrics/les-probabilites.txt` contient la même correction. Cette migration ponctuelle ne fait pas partie de la commande de publication.
