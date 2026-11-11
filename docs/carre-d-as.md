# Carré d’AS

Le Carré d’AS (`/carre-d-as`) s’ouvre à l’échelon réel 20, dans le menu, sur la page Escape Game Orange et dans toutes ses API, sans exception pour les administrateurs.

## Liens réciproques

- Chaque membre choisit jusqu’à quatre AS. Son carré lui est propre : il contient les personnes qu’il aide et qui l’aident.
- Une invitation acceptée crée un lien dans les deux sens : deux lignes miroir dans `ace_memberships`, écrites dans la même transaction. Chacun peut regarder la vidéographie de l’autre (toutes les rubriques) et répondre sous ses vidéos.
- Le lien occupe une place chez les deux membres. Le créneau choisi est le plus petit libre des deux côtés ; les contraintes uniques sur les créneaux gardent la limite de quatre même en cas d’acceptations simultanées.
- Une invitation est refusée si les deux membres sont déjà liés, si une invitation est en attente dans un sens ou dans l’autre, ou si l’un des deux a déjà quatre AS.
- Retirer un AS, ou bloquer une personne, supprime les deux lignes : les deux vidéographies se ferment aussitôt.
- Les AS d’un AS restent privés : la réponse de `/api/ace-circles` ne liste que les AS du membre connecté.
- L’accès n’est jamais transitif : deux AS d’un même membre ne voient pas la vidéographie l’un de l’autre.

## Page AS

`/as` est le grade qui suit Game Master Orange et Game Master Blanc, dans le même cadre graphique. Son contenu (`src/as-grade.js`) n’est transmis par `/api/as` qu’à partir de l’échelon réel 20. Il explique le rôle d’un AS : être le point de vue dont l’autre a besoin pour s’améliorer selon ce qu’il veut devenir, dans les deux sens, et choisir ses AS avec soin puisqu’ils découvrent toute la vidéographie, métacognition et version harmonieuse comprises. Dans le menu, AS puis Carré d’AS ferment la liste.

## Page Carré d’AS

La page et la fenêtre « Choisir un AS » ne portent plus de texte d’explication : il se trouve dans la page AS.


Les quatre places s’affichent en carte (avatar, pseudo, réponses non lues). Une place libre ouvre la recherche par pseudo exact. Choisir un AS affiche sa vidéographie dans la même grille de couvertures que la sienne, avec les rubriques, le chargement progressif et le lecteur Stream signé (`/api/life-tree/events/:id/playback?owner=`). Le lecteur propose le bouton AS pour les échanges sous la vidéo ; seul l’auteur peut modifier une vidéo. Les invitations reçues et envoyées apparaissent sous le carré. L’ancienne page explicative `/carre-d-as/comprendre` ramène au carré.

Les mécanismes ne sont plus présentés dans le carré. L’ancien réglage de partage (`/api/ace-circles/sharing`) reste disponible pour compatibilité, mais la page ne le propose pas : chaque nouveau lien ouvre les deux vidéographies.

## Données existantes

Aucune migration. En production, le seul lien existant était déjà réciproque (deux lignes miroir, accès aux contenus actif).
