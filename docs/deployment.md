# Publication de whitecadae.fr

## État du raccordement au 19 octobre 2026

Le domaine `whitecadae.fr` est relié au Worker Cloudflare `whitecadae` du compte `834ee251038ce2f923cba9847f973c40`.
La version publiée le 4 octobre 2026 correspond aux fichiers de la branche `codex/escape-game-orange`, commit `9bfc8a9abb2b46bfee43ec591edcd2370ebe7b30` (comparaison des fichiers HTML, app.js et service worker, fins de ligne normalisées).

La branche par défaut `claude/whitecadae-music-platform-qfsv19` était restée sur une ancienne version. Elle est remise à niveau depuis ce commit, dont elle est un ancêtre, pour que les futures modifications partent de la version réellement publiée.

**L'automatisation reste à activer dans Cloudflare.** L'audit ne trouve ni connexion Workers Builds ni déclencheur pour ce Worker ; la connexion Cloudflare disponible refuse la création du lien avec GitHub (« Authentication error »). La préparation du dépôt ne constitue pas une activation de ce service.

## Configuration Cloudflare Workers Builds

Sur le Worker existant **whitecadae**, ouvrir **Settings → Builds → Connect**, choisir GitHub et le dépôt **romainfalanga/whitecadae**. Autoriser l'application GitHub Cloudflare à accéder à ce dépôt si elle le demande.

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

Après activation, valider un push réel, le succès du build Cloudflare et le marqueur `https://whitecadae.fr/deploy-info.json`. Tant que cette chaîne complète n'a pas réussi, considérer l'automatisation comme non vérifiée. Actualiser cette section d'état seulement après ce contrôle.

## Données conservées

Le déploiement réutilise D1 `whitecadae-db` (`94a4fab8-be1e-41be-8ef1-df5aa32835f3`), R2 `whitecadae-media`, Workers AI et le Durable Object historique `BRAINSTORM_LIVE`. Le secret `PRIVATE_DATA_KEYS` reste dans Cloudflare.

La commande de publication n'exécute ni `schema.sql`, ni `seed.sql`, ni les migrations D1 historiques. Les initialisations et migrations ciblées déjà prévues par l'application conservent leur fonctionnement.

Les branches de travail passent par la branche de production avant publication. Pour créer des aperçus à l'avenir, prévoir d'abord leurs ressources et secrets distincts afin de ne pas modifier les données de production.
