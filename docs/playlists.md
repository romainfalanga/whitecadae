# Playlist — plan et validation

## Objectif

Ouvrir une page personnelle à l’échelon 10, sobre et sans explication du jeu. Choisir des morceaux déjà découverts, mélanger leurs albums, les ordonner et écouter le résultat dans le lecteur persistant. Les deux lignes de l’introduction Game Master Blanc sont désormais du même blanc pur.

## Plan réalisé

1. Utiliser la progression canonique pour l’accès à Playlist, le menu et le calendrier. Les comptes existants obtiennent l’accès à 10 sans nouvelle réponse ni migration du score.
2. Sauvegarder les playlists dans D1 par propriétaire, avec noms, ordre et révision. Vérifier les droits au serveur pour toute consultation, modification et lecture audio. Créer la table de façon additive ; préserver les comptes, les réponses et le catalogue.
3. Proposer une interface sombre et dorée : sélection, écoute, puis édition du nom et de l’ordre. Ajouter, retirer, monter et descendre un morceau ; créer et supprimer plusieurs playlists. Les commandes d’édition apparaissent seulement pendant la modification.
4. Conserver un seul élément audio natif. Préparer huit MP3 homogènes, sans métadonnées entre les pistes, puis servir l’ordre choisi comme un seul flux continu avec plages d’octets. Aucun changement de source par JavaScript n’est nécessaire entre les morceaux.
5. Intégrer le lecteur existant : lecture initiée par le geste, pause, reprise, recherche, répétition, commandes système, navigation et métadonnées. Effacer la file privée au changement de compte et conserver les albums hors contexte Playlist.

## Choix de transport

Les fichiers originaux ne partagent pas tous le même débit ni la même fréquence ; les concaténer tels quels rendrait les durées et les recherches peu fiables. Les sources dédiées sont en MP3 stéréo 44,1 kHz à débit constant de 192 kbit/s, sans ID3 ni Xing. Le manifeste vérifie les trames et les empreintes de chaque fichier. Le générateur est reproductible avec FFmpeg et le workflow de préparation.

`/api/playlists/audio?tracks=…` décrit un ordre immuable : modifier ou supprimer une playlist ne change pas les octets d’une lecture déjà engagée. Les nouvelles écoutes utilisent l’ordre enregistré. La réponse vérifie le niveau courant et chacun des morceaux, fournit une longueur exacte, un ETag, les réponses 206/416 et le contrôle If-Range. Dans Workers, FixedLengthStream préserve la longueur connue sur le réseau. Les lectures sont privées, sans cache ; les sources internes ne sont jamais servies directement par leurs chemins publics.

La lecture traversant les chapitres et la répétition de la playlist sont natives. Le passage d’un chapitre ne nécessite donc ni événement `ended` ni nouvelle demande `play()` d’un JavaScript potentiellement suspendu. Les commandes Media Session restent disponibles lorsqu’elles sont prises en charge par le navigateur. Une modification du nom seul met les métadonnées à jour sans interrompre le son.

## Vérifications

- Seuils 9/10/33, accès anonyme et administrateur, quatre morceaux à 10 et huit à 33 ; menu et retour après connexion.
- CRUD privé, ordre entre albums, validation des morceaux verrouillés/retirés, doublons, taille, nom, limite atomique, conflits de révision, changement de compte et effacement en cascade.
- Protection des écritures contre les origines étrangères et les contenus non JSON ; absence d’accès direct aux sources normalisées.
- Empreintes et trames de tous les fichiers, plages au milieu d’un morceau ou traversant une frontière, préfixes, suffixes, HEAD, If-Range, annulation, backpressure et sources tronquées.
- Décodage FFmpeg d’un assemblage de quatre morceaux entre albums : 15 650 898 octets, 652,120816 secondes, sans erreur de décodage.
- Lecteur : initiation synchrone, pause/reprise, positions, chapitres, commandes système, répétition, navigation, renommage et régression des albums.

Les tests techniques simulent notamment l’absence d’exécution JavaScript entre chapitres. Aucun téléphone physique verrouillé n’était disponible pour vérifier le comportement matériel réel d’iOS et Android ; ce contrôle reste à réaliser sur appareil. La lecture demande une connexion réseau et une session valide, comme Musiques.

## Sources techniques

- [Cloudflare : Content-Length et FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/response/#set-the-content-length-header)
- [Apple : formats audio et vidéo HTML](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/AudioandVideoTagBasics.html)
- [Chrome : Media Session](https://developer.chrome.com/blog/media-session)
