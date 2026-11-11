# Sériographies

Une sériographie rassemble plusieurs vidéos de sa propre vidéographie, dans un ordre choisi et sous un titre, comme une petite série.

## Interface

- « Mes sériographies », sous le titre de la Vidéographie, ouvre la liste : une couverture (première vidéo), le titre et le nombre de vidéos.
- « Nouvelle sériographie » : un titre, puis les vidéos à toucher dans l’ordre voulu (leur rang s’affiche), et « Enregistrer ».
- Une sériographie s’ouvre sur ses vidéos numérotées, avec Lire, Modifier, Supprimer. La lecture suit l’ordre, avec Précédente et Suivante, et le titre de la sériographie au-dessus de la vidéo.
- Aucun texte d’explication n’est affiché.

## Données et API

- Table `life_series` (`migrations/0053_life_series.sql`, aussi créée par le Worker au premier usage) : `owner_id`, `id`, `payload` scellé (titre et liste ordonnée), `revision`.
- `GET /api/life-tree/series` : les sériographies du membre connecté ; une vidéo supprimée disparaît simplement des listes.
- `PUT /api/life-tree/series/:id` : `{title, items, revision}` (0 pour créer). Titre de 120 caractères au plus, 1 à 100 vidéos du membre lui-même, 60 sériographies au plus. Une révision périmée renvoie 409.
- `DELETE /api/life-tree/series/:id` : `{revision}`.
- Privées à leur auteur (pas d’accès par `?owner=`), même seuil que la vidéographie (échelon 15). Effacer sa vidéographie ou ses données personnelles efface aussi ses sériographies.
