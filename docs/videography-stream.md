# Vidéographie Stream et page Publier

La vidéographie, accessible à l’échelon réel 33, reçoit désormais des fichiers
vidéo par le même envoi direct Cloudflare Stream que la Loge. Les anciennes
vidéos YouTube et leurs métadonnées sont conservées. Un changement de titre,
de catégorie ou de date sans fichier conserve la vidéo existante.

Les catégories sont Métacognition (sélection initiale), Réflexions, Idées et
projets, Ta version Harmonieuse et Ta société Harmonieuse. Le filtre Toutes
disparaît. Aucune migration ne redistribue les fiches existantes entre catégories.

Sur mobile, Métacognition occupe toute la largeur, puis Réflexions et Idées et
projets, puis Ta version Harmonieuse à gauche et Ta société Harmonieuse à
droite. Le bouton Ajouter une vidéo se trouve sous le titre de la catégorie
ouverte.

Ta version Harmonieuse porte la clé publique `version`. La contrainte `CHECK`
de `life_events.video_branch` n’accepte que ses cinq valeurs d’origine et la
table ne peut pas être reconstruite sans déclencher ses suppressions en cascade :
cette catégorie est donc enregistrée sous l’ancienne valeur `monthly`, vidée par
la migration 0040. `public/video-model.js` fait la correspondance ; l’API et le
client ne voient que `version`, et `monthly` reste refusé en entrée. Aucune
migration n’est nécessaire.

## Contrats et protection des médias

- `POST /api/life-tree/uploads` réserve un envoi ; GET et DELETE sur
  `/api/life-tree/uploads/:id` permettent de le suivre et de l’annuler.
- `PUT /api/life-tree/events/:id` reçoit `uploadId` pour attacher ou remplacer
  une vidéo. L’absence de ce champ conserve la vidéo lors d’une modification.
- `GET /api/life-tree/events/:id/playback` émet des liens HLS et poster signés
  après contrôle du propriétaire ou des droits AS historiques et de l’échelon.
  Les droits et l’attachement sont revérifiés après génération du jeton.
- Les informations de la fiche restent dans le payload chiffré existant.
  Le fichier est hébergé chez Stream ; ce n’est pas du chiffrement de bout en bout.
- Le lecteur natif partagé démarre en pause, propose lecture, plein écran et
  déplacement dans le temps. Navigation et onglet masqué arrêtent la lecture.
- La vidéographie n’a pas la limite de publication hebdomadaire de la Loge.
  Les limites communes restent 200 Mo, 30 minutes, trois allocations par heure
  et par compte et un budget local conservateur de 1 000 minutes stockées.
  Chaque espace dispose de son propre envoi actif par compte. Les médias en
  cours de suppression continuent à compter dans le budget de stockage.
- Remplacement, suppression de fiche et effacement des données privées mettent
  les anciens médias en file de suppression. Le registre reste présent jusqu’à
  confirmation du fournisseur ; la maintenance existante traite cette file.

## Mise à jour de la base

Appliquer `0051_videography_stream.sql` **avant** le nouveau Worker, après
inspection des colonnes de `loge_stream_uploads` et de ses index. Les migrations
de cette installation sont appliquées manuellement : ne pas rejouer les anciens
fichiers de migration. Cette extension ajoute `purpose`, `event_id` et
`link_fingerprint`, ainsi que l’index d’attachement et l’index des envois actifs.
Les anciens médias reçoivent le périmètre `loge`, sans réécriture des vidéos,
des publications ou des fiches chiffrées.

L’initialisation serveur sait aussi compléter une installation antérieure. Si
elle a déjà ajouté les colonnes, ne pas rejouer les `ALTER TABLE` aveuglément :
inspecter le schéma et n’appliquer que les éléments manquants.

## Navigation Loge

`/loge-virtuelle/publier` est une destination normale avec le menu Loge Virtuelle,
Mes réflexions et Publier. Seul le formulaire défile ; aucun popup de publication
ni bouton Fermer n’est monté. Les onglets permettent de quitter la page et
conservent le brouillon dans la session. Un encadré « Prochaine publication »
indique la date et le temps restant, actualisé chaque minute ; il affiche
« Disponible » lorsque la publication est ouverte. Un succès ouvre Mes réflexions
sur la publication. L’ancienne URL `?publier` est redirigée vers cette destination.

Les tests couvrent droits, isolation des espaces, limites globales, conservation
des anciennes vidéos, remplacement atomique, concurrence, nettoyage, navigation,
brouillons, réponses tardives, catégorie initiale et cycle de vie du lecteur.

## Publier dans la Loge depuis la vidéographie

Depuis le 10 novembre 2026, la page Publier ne reçoit plus de fichier : elle
propose les vidéos Stream déjà présentes dans la vidéographie du membre, avec
leur catégorie et leur date. Le titre de la vidéo est proposé et reste
modifiable. Une vidéo déjà publiée reste listée, désactivée. Sans vidéo, la page
renvoie vers la vidéographie. La limite de sept jours est inchangée.

- `GET /api/loge/videos` liste jusqu’à 100 vidéos récentes du membre (titre
  déchiffré côté serveur, catégorie, date, publication en cours).
- `POST /api/loge/posts` reçoit `eventId`. La publication ne copie rien : la
  table additive `loge_shared_videos` relie la publication au média de la
  vidéographie, créée automatiquement au premier accès (`0052` est facultative).
- Les envois directs et les liens YouTube sont refusés pour les nouvelles
  publications (`LOGE_LEGACY_SOURCES=false` dans `src/features.js`). Les
  publications existantes restent lisibles ; les tests historiques activent ces
  sources par une dépendance interne explicite.
- La catégorie est affichée dans la Loge et suit la fiche de la vidéographie.
- Supprimer la publication conserve la vidéo dans la vidéographie. Supprimer la
  fiche, tout l’arbre ou les données privées retire aussi la publication, ses
  commentaires et ses favoris dans le même lot ; la tâche planifiée répare un
  lien resté orphelin. Remplacer le fichier d’une vidéo publiée est refusé tant
  que sa publication existe.

Dans le formulaire de la vidéographie, le choix du fichier est une zone unique
à toucher : elle affiche ensuite le nom et le poids du fichier et permet de le
changer. La page d’explication et son bouton « i » sont retirés ;
`/videographie/comprendre` ramène à la vidéographie.

## Trois loges

La Loge virtuelle se divise en trois loges, une par catégorie partageable :
Réflexions (`/loge-virtuelle`), Idées et projets (`?loge=idees-et-projets`) et
Ta société Harmonieuse (`?loge=societe-harmonieuse`). Un second menu, sous les
onglets, passe de l’une à l’autre ; l’onglet Loge Virtuelle revient à la dernière
loge visitée et une loge déjà ouverte est restaurée sans nouvelle requête.

- `GET /api/loge?loge=ideas|projects|society` filtre le fil ; sans paramètre,
  Réflexions. Une autre valeur répond 404. Chaque publication expose `loge`.
- La loge d’une publication suit la catégorie de sa fiche. Les publications
  antérieures, sans catégorie, restent dans Réflexions.
- Métacognition et Ta version Harmonieuse n’ont pas de loge : leurs vidéos ne
  sont ni proposées ni acceptées à la publication, et une vidéo publiée ne peut
  pas être reclassée dans l’une d’elles tant que sa publication existe.
- La page Game Master Blanc décrit l’état d’esprit attendu dans chaque loge.

L’en-tête « Loge virtuelle » reste présent pour les lecteurs d’écran mais n’est
plus affiché sur ses propres pages : la vidéo commence plus haut. La catégorie
n’est affichée sur une vidéo qu’en dehors des loges (Mes réflexions, détail).

