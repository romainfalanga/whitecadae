# Vidéographie YouTube — 4 octobre 2026

## Parcours

L’auteur publie sa vidéo en non répertorié sur YouTube, autorise son intégration,
puis colle le lien dans « Ajouter une vidéo ». Les liens watch, youtu.be, shorts,
live et embed sont reconnus. Aucun code HTML fourni par l’utilisateur n’est inséré.
Le serveur conserve seulement une URL canonique dans le contenu chiffré existant.
Sans connexion OAuth à YouTube, le site ne peut pas vérifier la visibilité ni les
autorisations du propriétaire : une vidéo privée, retirée ou non intégrable reste
soumise au message d’indisponibilité du lecteur YouTube.

Trois catégories : observations et améliorations de soi, Réflexions,
Idées et projets. Un bouton Toutes permet de rétablir la vue complète. Aucun bouton de
brouillon ni d’archives sur Vidéographie. Les anciens contenus sans lien restent
lisibles et peuvent recevoir leur lien via Modifier. Les données des anciennes
archives et brouillons ne sont pas effacées.

Le lecteur est disponible directement dans chaque carte de la liste, sans lecture
automatique. Le premier lecteur charge immédiatement ; les suivants utilisent le
chargement différé du navigateur. La pagination ajoute des cartes sans recréer les
lecteurs déjà présents. La liste suit la date de la vidéo, du plus récent au plus
ancien, avec un curseur stable pour départager les dates identiques.
Dans les fiches et commentaires du Carré d’AS, l’accès est revérifié au clic de lecture.
Les autorisations
existantes de partage et d’appartenance au carré restent contrôlées côté serveur.
Les onglets du Carré d’AS forment une navigation à soulignement, utilisable au
clavier. Les raccourcis « Vidéographie » et « Gérer le partage » ont été retirés.
L’accord explicite et sa révocation restent disponibles dans Invitations.
Mon carré n’affiche que les quatre places, l’ajout et le retrait des AS. Les
commentaires restent accessibles depuis les vidéos de l’auteur et, pour ses AS,
depuis J’accompagne. Les anciennes discussions restent conservées en base.

Le formulaire comporte seulement titre, lien, catégorie et date. Les anciennes
notes sont conservées lors d’une modification même si leur champ n’est plus affiché.
Le bouton d’ajout est centré sur mobile.

## Confidentialité et intégration

Une vidéo YouTube non répertoriée peut être lue et retransmise par toute personne
qui possède son lien. Les contrôles du site protègent les fiches et commentaires,
pas un lien YouTube déjà transmis. Cette limite est rappelée dans
l’accord de partage. Aucun lien n’est rendu public par nos API ou conservé dans
le cache du service worker.

Le lecteur officiel utilise youtube-nocookie.com, avec un Referer limité à
l’origine. Les en-têtes CSP du Worker et des fichiers statiques autorisent
uniquement ce domaine pour les cadres ; les scripts et connexions de la page
parente restent limités à notre origine. Les contrôles YouTube ne sont ni masqués
ni recouverts. Aucune API YouTube, clé ni accès au compte Google n’est nécessaire.

Références : [intégration](https://support.google.com/youtube/answer/171780?hl=fr),
[paramètres du lecteur](https://developers.google.com/youtube/player_parameters),
[visibilité](https://support.google.com/youtube/answer/157177?hl=fr).

## Migration et vérifications

Appliquer 0039_video_categories.sql puis 0040_video_reflections.sql après sauvegarde
D1. Les anciens contenus society et monthly passent dans ideas ; leurs identifiants, textes chiffrés,
dates et commentaires sont conservés. Les révisions changent pour invalider les
vues et formulaires périmés. Les migrations sont idempotentes. Les anciens bilans
gardent leur date au mois près et peuvent être modifiés avec cette précision.

Les tests couvrent les formats de liens, les domaines trompeurs, les tentatives
d’injection, le chiffrement de l’URL, la visibilité des vidéos pour les AS, la
révocation, la conservation des commentaires après modification du lien, les
conflits de versions, le tri paginé et les migrations sans perte. La recette visuelle utilise des
comptes fictifs dans une base en mémoire, sans modifier les comptes réels.
