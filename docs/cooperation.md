# Sujets, projets, Brainstorm et lecture continue

Les sujets et projets ont chacun leur répertoire et leurs fiches. Leurs quotas
sont indépendants : un emplacement à 12, deux à 18, trois à 23. Les fiches et
leurs actions sont visibles dès 12 ; les messages conservent l’échelon effectif
de l’auteur à l’envoi. La fiche du projet contient objectif, besoins et actions
à prendre en charge ; celle du sujet contient question et synthèse.

Les nouvelles colonnes et tables sont ajoutées automatiquement par
`ensureConversation` / `ensureCommunity`. Aucune ancienne conversation ni
progression n’est supprimée. `schema.sql` inclut le schéma pour une base neuve.
Les modifications de fiches/actions utilisent une révision et les créations
une clé d’idempotence. Les quotas sont vérifiés dans la requête d’insertion.

## Séances

Le créateur d’une fiche organise une séance de 15 à 180 minutes, immédiate ou
programmée. Son échelon à la création fixe l’accès minimal. Chaque message
possède en plus son propre seuil. Les discussions écrites et les synthèses
restent dans D1 ; les données vocales ne sont pas enregistrées.

`BRAINSTORM_LIVE` lie le Durable Object `BrainstormLive`, SQLite via la migration
`v1-brainstorm-live`. L’upgrade WebSocket réauthentifie la session, contrôle
l’origine, la séance et le niveau puis construit ses propres claims. Le DO
ne fait transiter que présence, notifications et signalisation. Les messages
persistants passent par l’API authentifiée. Les connexions ont une durée de
validité courte, renouvelée par la lecture HTTP authentifiée ; elles conservent
leurs métadonnées lors de l’hibernation.

La voix utilise un maillage WebRTC limité à 8 personnes. Le microphone s’ouvre
uniquement après clic et entre coupé. Quitter la page arrête pistes et connexions.
Une reconnexion brève réutilise le microphone déjà autorisé, sans en ouvrir un
nouveau. Après 15 secondes d’interruption, le microphone est fermé.

### Activation du relais vocal

L’écrit fonctionne indépendamment de TURN. Pour activer le vocal en production :

1. Activer Cloudflare Realtime/TURN après validation de son abonnement à l’usage.
2. Créer une clé TURN dédiée à White Cadae.
3. Enregistrer son identifiant et son jeton **uniquement comme secrets du Worker** :
   `wrangler secret put CF_TURN_KEY_ID` puis `wrangler secret put CF_TURN_TOKEN`.
4. Tester une séance sur deux réseaux distincts ; ne jamais commiter ces secrets.

L’API génère les identifiants ICE temporaires côté serveur. La clé permanente
n’est jamais transmise au navigateur. Sans les deux secrets, le bouton vocal
reste désactivé et la discussion écrite demeure disponible. Référence :
https://developers.cloudflare.com/realtime/turn/generate-credentials/

## Musique

L’ordre de 57 est 13h20, 30 vins divins, Sans indices dans les dés, Orange.
L’ordre de déblocage reste 30 à 1, Sans à 3, 13h20 à 4, Orange à 5.
114 ouvre La matière danse à 6, Les probabilités à 7 et Fais Mieux à 8.
18 juillet 2019 ouvre Wanheda à 9, Quand je vois je pense à 10 et Un fil entre
deux infinis à 11. Le signe 7 appartient à Sans, donc à l’échelon 3.

Sept fichiers AAC continus couvrent toutes les combinaisons de plusieurs
morceaux débloqués. Ils sont générés avec FFmpeg par
`node scripts/build-continuous-audio.mjs <ffmpeg> <dossier-temporaire>`.
Le manifeste `src/music-continuous.js` contient les tailles et repères exacts
calculés depuis le PCM décodé. Il doit être livré avec les fichiers générés.
Changer le contenu d’un morceau impose de régénérer les variantes correspondantes.

Le lecteur conserve un élément audio et utilise la boucle native. Les commandes
et paroles suivent le chapitre courant. Le mode répétition « 1 » revient au
fichier individuel avec boucle native. Le serveur filtre les variantes et leurs
requêtes Range ; une variante accessible ne contient jamais de titre verrouillé.
Le service worker ne cache pas les fichiers audio. Une baisse des droits vide
également les chapitres déjà chargés devenus inaccessibles.

Les tests automatisés couvrent droits, quotas, conflits, messages, signalisation,
repères, répétition et accès directs aux fichiers. Les essais navigateur locaux
doivent vérifier aussi la réception WebRTC, les petits écrans, la navigation,
et la lecture pendant un blocage du thread JavaScript. Ils ne remplacent pas
un essai physique iOS/Android avec écran verrouillé.
