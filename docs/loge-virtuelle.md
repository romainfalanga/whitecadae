# Loge virtuelle

## Parcours

La Loge est une communauté réservée au niveau réel 33. Son menu, ses publications, ses profils et toutes ses API appliquent cette même progression, sans exception pour les administrateurs. Elle reste indépendante de l’ancienne Vidéographie et des carrés d’AS.

Les vues vidéo occupent l’espace disponible sous l’en-tête du site dès leur ouverture. Le fil défile verticalement, une publication par écran. La vidéo verticale reste centrée, sans colonne de commande qui réduirait sa largeur ou la décalerait. Le cadre YouTube entier est conservé, sans recadrage de la vidéo. Les anciens contenus horizontaux restent lisibles.

L’interface de publication se limite au pseudo de l’auteur, au titre placé dessous et à la commande Commentaires à droite. Ces informations occupent une zone compacte extérieure à l’iframe ; elles ne recouvrent pas le lecteur YouTube. L’en-tête original du site et son menu restent visibles sur toutes les vues de la Loge. La hauteur disponible est calculée à partir de cet en-tête et suit ses changements de taille. Le lecteur musical est mis en pause et son dock est masqué pendant la consultation. Ouvrir le menu du site masque et met en pause la vidéo ; le refermer retrouve la même vue, avec le lecteur en pause jusqu’à un nouvel appui. Les commentaires restent compatibles avec cette navigation.

La navigation commune réunit uniquement Loge et Mes réflexions dans une barre à boutons de même largeur, avec un repère actif doré. Elle reste identique dans le fil et dans son propre historique ; le titre et le bouton Publier ne changent pas de position. Mes réflexions renvoie toujours aux publications du compte connecté. Consulter un autre membre affiche directement ses réflexions, sans second menu d’historique.

Les onglets Interventions et Favoris et les boutons d’ajout aux favoris sont retirés de l’interface. Leur préchargement est arrêté. Les commentaires, les profils, le lecteur vertical et la gestion de ses propres réflexions restent disponibles. Les anciennes routes et données sont conservées pour compatibilité, sans liens de navigation vers ces vues.

La commande Commentaires reste à droite du pseudo et du titre, en dehors de l’iframe. Son compteur garde sa place même à zéro.

Les publications se créent avec un titre de 140 caractères maximum et un lien YouTube. Les liens Shorts, watch et youtu.be valides utilisent le même identifiant vidéo normalisé. Le format vertical est la présentation prévue ; le seul lien ne suffit pas à certifier l’orientation de sa vidéo. Les vidéos restent hébergées chez YouTube, sans envoi dans R2 ou D1. Les vidéos non répertoriées se partagent par lien ; les vidéos privées exigeant des invitations YouTube ne conviennent pas à ce fil commun.

La limite reste une publication toutes les 168 heures. Supprimer une publication ne remet pas ce délai à zéro. La modification et la suppression d’une vidéo se font uniquement depuis son propre profil, dans Réflexions. Le titre reste modifiable et l’identifiant vidéo est fixe après publication.

Le bouton Commentaires ouvre les échanges et leur formulaire sans mettre le lecteur en pause, sans le détruire et sans relancer la lecture à la fermeture. Sur ordinateur, les échanges restent à côté de la vidéo ; sur mobile, la vidéo reste en haut et les échanges défilent en dessous. La rédaction utilise une rangée compacte pour laisser de la place aux commentaires. Les écrans bas en paysage utilisent deux colonnes ; lorsque la hauteur manque, la carte peut défiler au lieu de masquer son formulaire. Un écran étroit et très bas garde la vidéo au-dessus de la discussion et permet aussi ce défilement. La règle de pause quand le lecteur sort du champ reste active. Les formulaires de publication/modification, le menu du site, la navigation et le passage en arrière-plan gardent leurs propres pauses. Les commentaires gardent leurs bulles et le menu discret de gestion de ses propres réponses. La limite hebdomadaire ne s’applique pas aux commentaires ni aux favoris.

## Favoris — compatibilité historique

`PUT /api/loge/posts/:id/favorite` reçoit `{favorite: true}` ou `{favorite: false}` et renvoie `{postId, isFavorite}`. Cette écriture exprime un état souhaité, sans basculement implicite ni duplication. Elle vérifie le compte actif, le niveau réel et l’existence de la publication. Aucun compteur public de favoris n’est ajouté.

Les représentations de publication incluent `isFavorite`, calculé pour le membre qui les consulte. La liste `GET /api/loge/membres/:id?tab=favoris` est privée : seul le propriétaire du profil peut la lire. Son curseur entier suit l’identifiant de sauvegarde et son ordre décroissant, indépendamment des identifiants des publications. Les vidéos supprimées disparaissent des favoris ; leur suppression nettoie également les références associées.

La table `loge_favorites` référence les comptes et les publications. La migration additive `0048_loge_favorites.sql`, la définition initiale et l’initialisation à la demande contiennent les mêmes table et index. Les anciennes données restent en place. Le classement des données de compte pour les opérations de maintenance suit automatiquement ces clés étrangères.

La migration `0048_loge_favorites.sql` a été appliquée à D1 le 1er novembre 2026. La table, ses deux index et ses clés étrangères ont été vérifiés ; cette création additive ne modifie pas les publications, les commentaires ou les comptes existants.

## Données et compatibilité

Les tables `loge_posts`, `loge_comments` et `loge_publication_limits` conservent leur fonctionnement. Les écritures sont atomiques lorsqu’elles réservent un droit de publication ; un identifiant de requête protège les reprises après coupure et une révision protège les éditions concurrentes. Les suppressions masquent les contenus et effacent leur texte, tout en gardant le minimum nécessaire pour empêcher un rejeu.

Le champ historique description reste en base pour préserver les publications existantes et la compatibilité des anciens clients. Il n’apparaît plus dans les vues ni les formulaires actuels. Une nouvelle publication sans description utilise son titre dans cette ancienne colonne pour respecter la contrainte des bases déjà installées. Une modification avec seulement le titre conserve l’ancienne description. Aucune reconstruction de table ni migration destructive n’est nécessaire.

Toutes les API restent privées et hors cache. Les écritures contrôlent l’origine, le format JSON, le compte et les droits. Les listes ont des curseurs stables. Les réponses ne livrent ni email d’autres membres, ni texte de session, ni HTML de lecteur fourni par un membre.

## Lecture et navigation

Le contrôleur `public/loge-video.js` utilise l’API IFrame officielle. Trois lecteurs au maximum sont préparés pour le clip courant et ses voisins. Une seule vidéo joue, seulement lorsque plus de la moitié de son iframe est visible. Le passage à une autre vidéo, la navigation ou l’écoute de musique met les autres lecteurs en pause. Chaque vidéo est initialement arrêtée et attend un appui sur le lecteur YouTube. Le chargement, le défilement, le redimensionnement, le retour au premier plan ou sur une vue conservée ne déclenchent aucune commande de lecture. Le son reste activé par défaut. Après une pause liée au menu, à un formulaire ou à la navigation, un nouvel appui est nécessaire pour reprendre.

L’ancien rail du bouton plein écran est retiré. La vue occupe déjà tout l’espace disponible sous l’en-tête du site, sans action supplémentaire pour y accéder. Les paramètres `controls=0`, `fs=1` et `disablekb=0` gardent le lecteur épuré et les commandes clavier disponibles. Si YouTube ouvre un plein écran natif, sa visibilité est évaluée sur l’écran entier.

Une barre de déplacement propre au site est reliée aux méthodes officielles `getCurrentTime`, `getDuration` et `seekTo`. Elle se situe hors de l’iframe, affiche le temps courant et la durée, et permet un déplacement sans ajouter les boutons natifs. Elle est réservée à la vidéo active avec une durée connue ; une pause manuelle reste une pause après déplacement. Un seul compteur léger suit la lecture active et est arrêté lors des pauses, changements de page, erreurs ou suppressions. Les contrôles et leurs écouteurs sont retirés à la destruction.

YouTube ne permet pas d’activer uniquement sa barre native : `controls` réactive ou masque l’ensemble des commandes. Le navigateur empêche le site de simuler un clic dans l’interface interne de YouTube. Le titre, la chaîne, les écrans de pause et les éléments de marque peuvent donc encore apparaître. Les anciens paramètres `showinfo`, `modestbranding` et `autohide` sont obsolètes ; aucun masque, recadrage ou calque n’essaie de les dissimuler.

La navigation interne conserve les vues et leurs positions de défilement. Les réponses tardives ne remplacent pas une autre vue ; les mutations reconnues après navigation invalident les caches concernés. Les lecteurs quittés sont détruits pour conserver une borne globale de trois. Les données et brouillons en mémoire sont effacés au changement de compte. Les styles d’immersion sont retirés sur les sorties, refus d’accès et changements de session. Les observateurs de taille de l’en-tête et d’ouverture du menu sont déconnectés à la sortie ; une fermeture de menu tardive ne reprend pas un ancien lecteur.

## Texte de Game Master Blanc

**Loge virtuelle**

Partage dans la Loge virtuelle tes réflexions et tes avancées aux autres Game Masters Blancs.

Commente leurs vidéos pour leur apporter ton regard et des pistes d’amélioration. Aidez-vous mutuellement à faire grandir vos harmonies.

## Vérifications

Les tests utilisent les vrais handlers serveur, SQLite et un DOM client léger. Ils couvrent les niveaux 32/33 et les administrateurs, les profils privés, la propriété et les conflits, les quotas et rejeux, la pagination, les liens YouTube, les favoris privés et leur suppression, les publications avec titre seul, les réponses tardives, les changements de compte, les transitions entre Loge et Mes réflexions, l’absence des commandes et préchargements retirés, les anciennes routes d’historique et leurs positions de défilement et le cycle de pause/reprise du menu du site. Les tests du lecteur contrôlent les événements de l’API, le son, la visibilité, la limite de trois lecteurs, le plein écran natif, l’absence de démarrage automatique, la lecture manuelle, le déplacement dans la lecture, les durées inconnues et le nettoyage du compteur. Les tests client vérifient que les commentaires conservent le lecteur et sa barre sans appeler pause/reprise.

Le DOM de test ne reproduit ni la mise en page réelle du navigateur ni la lecture YouTube physique sur téléphone. Aucun compte, publication ou commentaire de test n’est créé en production. Le contrôle du rendu réel exige une session authentifiée au niveau 33 et un appareil capable de lire YouTube.

Références : [API IFrame](https://developers.google.com/youtube/iframe_api_reference), [paramètres](https://developers.google.com/youtube/player_parameters), [visibilité et éléments du lecteur](https://developers.google.com/youtube/terms/required-minimum-functionality).
