# Loge virtuelle

## Périmètre approuvé

Une communauté commune aux Game Masters Blancs, ouverte au niveau réel 33. Le menu donne accès au fil à `/loge-virtuelle`. Les pages de publication et de membre restent elles aussi contrôlées par le serveur. Le calcul se fonde sur les signes enregistrés, sans exception de niveau pour les administrateurs. Les comptes existants à 33 obtiennent le même accès.

La Loge est indépendante de l’ancienne Vidéographie, de ses contenus et des carrés d’AS. Les comptes, les pseudos et les photos existants constituent le socle d’identité. Aucune vidéo n’est envoyée dans R2 ou D1 : seules les informations de publication et l’identifiant YouTube sont conservés.

## Parcours

- Fil récent : défilement vertical par vidéo avec arrêt sur le clip visible, auteur, date, titre, description et commentaires. Les commandes de gestion des vidéos se trouvent uniquement sur Mon profil, dans Réflexions.
- Publication : titre de 140 caractères maximum, description de 5 000 caractères et lien YouTube. Les vidéos non répertoriées se partagent par lien ; les vidéos privées exigent des invitations YouTube et ne conviennent pas au fil commun. Un lien non répertorié reste partageable hors du site.
- Une vidéo toutes les 168 heures à partir de sa publication dans la Loge. La suppression ne libère pas le droit de publier immédiatement. Le titre et la description sont modifiables ; l’identifiant vidéo est fixe après publication.
- Commentaires dans la Loge : panneau dédié, bulles de texte et menu discret pour modifier ou supprimer ses propres interventions. La limite hebdomadaire ne s’applique pas aux commentaires.
- Profil `/loge-virtuelle/membres/:id` : onglets Réflexions et Interventions. Le second rassemble les commentaires sous les publications d’autres membres et permet de retrouver leur contexte, y compris au-delà de la première page de commentaires.

## Texte exact de Game Master Blanc

**Loge virtuelle**

Partage dans la Loge virtuelle tes réflexions et tes avancées aux autres Game Masters Blancs.

Commente leurs vidéos pour leur apporter ton regard et des pistes d’amélioration. Aidez-vous mutuellement à faire grandir vos harmonies.

## Intégration

Le module serveur `src/loge.js` et le client `public/loge.js` utilisent les nouvelles tables `loge_posts`, `loge_comments` et `loge_publication_limits`. La migration additive `0047_loge_virtuelle.sql` est également initialisée à la demande par le serveur, sans toucher aux anciennes données. Les clés étrangères permettent le classement habituel des données de compte.

La réservation technique du droit de publication et l’insertion sont atomiques. Un identifiant de requête permet de reprendre une création après une coupure réseau. Une révision protège les modifications concurrentes. La suppression masque immédiatement les contenus, efface leur texte et conserve le minimum nécessaire pour que ni une ancienne requête ni une suppression ne contournent la limite.

Toutes les API sont privées et hors cache. Les écritures vérifient l’origine, le format JSON, le compte actif, le niveau et la propriété des éléments. Les liens vidéo sont normalisés avec le validateur YouTube existant ; aucun HTML de lecteur externe n’est accepté. Les listes sont paginées avec des curseurs stables.

Le contrôleur `public/loge-video.js` utilise l’API IFrame officielle de YouTube. Trois lecteurs au maximum sont préparés pour le clip courant et ses voisins. La lecture automatique ne démarre que lorsque plus de la moitié de l’iframe est visible ; le clip précédent est mis en pause. Le son est activé par défaut lors de la tentative de lecture. Aucun bouton Activer/Couper le son ni espace réservé à ce bouton ne sont ajoutés. Un blocage de lecture automatique ne déclenche ni repli muet ni nouvelle tentative en boucle : une interaction directe avec le lecteur peut alors être nécessaire. Le chargement du SDK est partagé et peut être repris après une erreur réseau.

Le paramètre officiel `controls=0` masque les commandes YouTube de réglages, de sous-titres et de volume. Le lecteur conserve une seule icône de plein écran, sans bouton texte sous la vidéo. Cette icône occupe une colonne noire de 36 pixels à droite de l’iframe : elle appartient au cadre du site et ne recouvre ni la vidéo ni les éléments de YouTube. Elle permet aussi de quitter le plein écran. Les commandes clavier de YouTube restent autorisées.

Le site utilise l’API plein écran du navigateur pour agrandir le même cadre et la même iframe, sans recharger la vidéo. Un mode agrandi dans la fenêtre prend le relais si le plein écran natif est indisponible ou refusé. Le bouton, la sortie native et Échap dans la page permettent de revenir au fil ; en mode agrandi de secours, les touches saisies dans l’iframe restent gérées par YouTube. Les sorties restaurent le focus et le défilement ; les changements de vue nettoient le lecteur agrandi. Seul le clip agrandi peut jouer, sans être tronqué par le calcul de visibilité du fil.

Le navigateur empêche les scripts du site d’accéder à l’interface interne de l’iframe YouTube pour y simuler un clic. L’API officielle ne propose pas de commande pour déclencher la disparition immédiate de cet habillage. Les éléments imposés par YouTube — notamment le titre, la chaîne, certains écrans de pause et le logo — peuvent encore apparaître au chargement ou à l’interaction : `showinfo`, `modestbranding` et `autohide` sont obsolètes. Aucun recadrage, masque ou calque ne tente de les dissimuler. Le site ne prend pas le focus et ne génère pas de clic au démarrage de la lecture. La lecture automatique sonore dépend des autorisations du navigateur.

La navigation interne conserve la session, les vues et leurs positions de défilement. Les onglets du profil sont conservés en mémoire pour éviter l’écran de chargement à chaque aller-retour. Les lecteurs de la vue quittée sont détruits pour garder une borne globale de trois. Les requêtes sont liées à leur vue et les réponses tardives ne remplacent pas une autre page. Au changement de compte, les données et brouillons en mémoire sont effacés. La reprise de la musique suspend les vidéos. Une fois la pause confirmée, la commande Lecture native de YouTube permet de reprendre la vidéo et suspend la musique ; le passage à un autre clip reste disponible. Les relances automatiques restent bloquées pendant cette suspension.

## Vérifications

Accès anonyme et niveaux 32/33, administrateurs, révocation, profils, propriété et conflits ; liens invalides, tailles et origine ; soumissions concurrentes, rejeu, suppression et fin des sept jours ; pagination et commentaire ciblé ; interface sur mobile et ordinateur, brouillons après erreur, navigation et changement de compte. Les suites existantes contrôlent aussi Playlist suspendue, les anciennes pages retirées et les paroles. Les tests client utilisent un DOM léger et les vrais handlers ; ils vérifient les formulaires, les erreurs, les lecteurs et les changements de compte, sans simuler la mise en page ni la lecture YouTube réelle. Aucun compte ou contenu de test n’est créé en production.

## Ajustements associés

Les découvertes de même échelon sont regroupées dans un seul bloc d’accueil : à 33, Game Master Blanc puis Loge virtuelle, chacun sur sa ligne. Les signes déjà résolus utilisent le libellé « Ce signe est déjà trouvé. ». Le bouton des membres d’un échelon utilise une icône SVG géométriquement centrée pour ses états plus et moins.

Références du lecteur : [API IFrame](https://developers.google.com/youtube/iframe_api_reference), [paramètres](https://developers.google.com/youtube/player_parameters), [lecture automatique et visibilité](https://developers.google.com/youtube/terms/required-minimum-functionality).
