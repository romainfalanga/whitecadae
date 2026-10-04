# Vidéographie YouTube — 4 octobre 2026

## Parcours

L’auteur publie sa vidéo en non répertorié sur YouTube, autorise son intégration,
puis colle le lien dans « Ajouter une vidéo ». Les liens watch, youtu.be, shorts,
live et embed sont reconnus. Aucun code HTML fourni par l’utilisateur n’est inséré.
Le serveur conserve seulement une URL canonique dans le contenu chiffré existant.
Sans connexion OAuth à YouTube, le site ne peut pas vérifier la visibilité ni les
autorisations du propriétaire : une vidéo privée, retirée ou non intégrable reste
soumise au message d’indisponibilité du lecteur YouTube.

Quatre catégories : observations et améliorations de soi, idées et réflexions,
projets, bilan du mois. Un seul bilan par mois et par auteur. Aucun bouton de
brouillon ni d’archives sur Vidéographie. Les anciens contenus sans lien restent
lisibles et peuvent recevoir leur lien via Modifier. Les données des anciennes
archives et brouillons ne sont pas effacées.

Le lecteur est disponible dans la fiche et au-dessus des commentaires du Carré
d’AS. Aucune image ni requête YouTube n’est chargée avant le clic de lecture.
L’accès au contenu est revérifié avant de créer l’iframe. Les autorisations
existantes de partage et d’appartenance au carré restent contrôlées côté serveur.
Les onglets du Carré d’AS forment une navigation à soulignement, utilisable au
clavier. Les raccourcis « Vidéographie » et « Gérer le partage » ont été retirés.
L’accord explicite et sa révocation restent disponibles dans Invitations.

## Confidentialité et intégration

Une vidéo YouTube non répertoriée peut être lue et retransmise par toute personne
qui possède son lien. Les contrôles du site protègent les fiches et commentaires,
pas un lien YouTube déjà transmis. Cette limite est rappelée à l’ajout et dans
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

Appliquer 0039_video_categories.sql après sauvegarde D1. Les anciens contenus de
la catégorie society passent dans ideas ; leurs identifiants, textes chiffrés,
dates et commentaires sont conservés. Les révisions changent pour invalider les
vues et formulaires périmés. La migration est idempotente.

Les tests couvrent les formats de liens, les domaines trompeurs, les tentatives
d’injection, le chiffrement de l’URL, la visibilité des vidéos pour les AS, la
révocation, la conservation des commentaires après modification du lien, les
conflits mensuels et la migration sans perte. La recette visuelle utilise des
comptes fictifs dans une base en mémoire, sans modifier les comptes réels.
