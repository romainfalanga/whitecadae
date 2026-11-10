# Vidéographie Stream et page Publier

La vidéographie, accessible à l’échelon réel 33, reçoit désormais des fichiers
vidéo par le même envoi direct Cloudflare Stream que la Loge. Les anciennes
vidéos YouTube et leurs métadonnées sont conservées. Un changement de titre,
de catégorie ou de date sans fichier conserve la vidéo existante.

Les catégories sont Métacognition (sélection initiale), Réflexions, Idées et
projets et Ta société Harmonieuse. Le filtre Toutes disparaît. Aucune migration
ne redistribue les fiches existantes entre catégories.

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
conservent le brouillon dans la session. Un succès ouvre Mes réflexions sur la
publication. L’ancienne URL `?publier` est redirigée vers cette destination.

Les tests couvrent droits, isolation des espaces, limites globales, conservation
des anciennes vidéos, remplacement atomique, concurrence, nettoyage, navigation,
brouillons, réponses tardives, catégorie initiale et cycle de vie du lecteur.
