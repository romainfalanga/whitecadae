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

## Séances et lives externes

Le créateur d’une fiche organise une séance de 15 à 180 minutes, immédiate ou
programmée. Son échelon à la création fixe l’accès minimal. Chaque message
possède en plus son propre seuil. Discussions écrites et synthèses restent dans D1.

L’organisateur colle un lien public YouTube (watch, youtu.be ou /live/), une chaîne
Twitch, une invitation Discord ou un lien direct vers un salon Discord. Le lien
peut être modifié après création, avec contrôle de propriétaire et de révision.
Les paramètres de suivi sont retirés et les domaines validés côté serveur.
Aucun HTML arbitraire, clé de diffusion privée ou proxy vidéo n’est accepté.

YouTube et Twitch utilisent leur iframe officielle, chargée uniquement après
clic, sans lecture automatique. Le player Twitch reçoit le véritable hostname
dans son paramètre parent. Un bouton permet toujours d’ouvrir la plateforme,
notamment si l’intégration est interdite par l’organisateur ou le navigateur.
Sur un écran trop étroit pour le lecteur Twitch (400 pixels), le lien externe
est privilégié. Discord s’ouvre dans un nouvel onglet ; il n’est pas intégré.

La musique est mise en pause lorsqu’on ouvre le live. Reprendre la musique
ferme le lecteur intégré. Le rafraîchissement de la discussion ne recharge pas
une iframe inchangée. Quitter la séance détruit l’iframe.

L’organisateur démarre sa diffusion sur YouTube/Twitch ou crée son salon Discord.
White Cadae organise la séance et sa discussion ; il ne crée pas le live chez
ces fournisseurs, ne diffuse ni n’enregistre son audio/vidéo. L’accès au lien sur
White Cadae est limité par l’échelon ; la confidentialité du live lui-même dépend
des réglages de la plateforme externe. La date de la séance n’indique pas si le
diffuseur externe a effectivement démarré sa diffusion.

`BRAINSTORM_LIVE` lie le Durable Object `BrainstormLive`, SQLite via la migration
`v1-brainstorm-live`, uniquement pour la présence et les notifications écrites.
L’upgrade WebSocket réauthentifie la session, contrôle l’origine, la séance et le
niveau puis construit ses propres claims. Les messages persistants passent par
l’API authentifiée. Les connexions sont renouvelées par lecture HTTP authentifiée.

Aucun abonnement Cloudflare Realtime/TURN, clé TURN ou serveur de diffusion
audio/vidéo n’est nécessaire. Le code de capture micro et de signalisation WebRTC
a été retiré de Brainstorm. L’ancien endpoint vocal renvoie 410.

Références officielles :
- https://developers.google.com/youtube/player_parameters
- https://dev.twitch.tv/docs/embed/video-and-clips/

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

Les tests automatisés couvrent droits, quotas, conflits, messages, liens de diffusion,
repères, répétition et accès directs aux fichiers. Les essais navigateur locaux
doivent vérifier aussi les intégrations externes, les petits écrans, la navigation,
et la lecture pendant un blocage du thread JavaScript. Ils ne remplacent pas
un essai physique iOS/Android avec écran verrouillé.
