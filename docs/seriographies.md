# Sériographies

Une sériographie rassemble plusieurs vidéos de sa propre vidéographie, dans un ordre choisi et sous un titre, comme une petite série.

## Interface

- « Mes sériographies », sous le titre de la Vidéographie, ouvre la liste. La première carte, « Nouvelle sériographie », en crée une ; les suivantes montrent une couverture (première vidéo), le titre et le nombre de vidéos.
- Création : un titre, puis les vidéos à toucher dans l’ordre voulu (leur rang s’affiche), et « Enregistrer ».
- Une sériographie s’ouvre sur ses vidéos numérotées, avec Lire, Modifier, Supprimer. La lecture suit l’ordre, avec Précédente et Suivante, et le titre de la sériographie au-dessus de la vidéo.
- Aucun texte d’explication n’est affiché.

## Données et API

- Table `life_series` (`migrations/0053_life_series.sql`, aussi créée par le Worker au premier usage) : `owner_id`, `id`, `payload` scellé (titre et liste ordonnée), `revision`.
- `GET /api/life-tree/series` : les sériographies du membre connecté ; une vidéo supprimée disparaît simplement des listes.
- `PUT /api/life-tree/series/:id` : `{title, items, revision}` (0 pour créer). Titre de 120 caractères au plus, 1 à 100 vidéos du membre lui-même, 60 sériographies au plus. Une révision périmée renvoie 409.
- `DELETE /api/life-tree/series/:id` : `{revision}`.
- Privées à leur auteur (pas d’accès par `?owner=`), même seuil que la vidéographie (échelon 15). Effacer sa vidéographie ou ses données personnelles efface aussi ses sériographies.

## Dans les Loges virtuelles

- « Publier » propose « Une vidéo » ou « Une sériographie ». Une sériographie se publie quand toutes ses vidéos sont envoyées depuis la vidéographie et classées dans une même catégorie de loge (Réflexions, Idées et projets ou Sociétés harmonieuses). Sinon, elle reste listée, grisée, avec la raison en une ligne.
- Elle devient une seule publication, au titre de la sériographie, dans la loge de sa catégorie, et compte comme la publication de la semaine. Une même vidéo peut revenir dans plusieurs sériographies publiées.
- Lecture : un seul lecteur enchaîne les vidéos. La barre de temps couvre la durée totale, avec un repère à chaque passage d’une vidéo à la suivante ; la déplacer peut changer de vidéo. Le bouton « suivante » (avec « 2/3 ») passe directement à la vidéo suivante, et continue la lecture si elle était en cours.
- Données : `loge_shared_series` (`migrations/0054_loge_shared_series.sql`, aussi créée par le Worker) relie la publication à chaque vidéo, dans l’ordre. `POST /api/loge/posts {seriesId, requestId}` publie ; `GET /api/loge/posts/:id/playback?part=i` signe la vidéo i et renvoie la durée de toutes les parties. Une vidéo supprimée est sautée ; la publication est retirée quand il n’en reste aucune.
