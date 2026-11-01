# Loge virtuelle

## Périmètre approuvé

Une communauté commune aux Game Masters Blancs, ouverte au niveau réel 33. Le menu donne accès au fil à `/loge-virtuelle`. Les pages de publication et de membre restent elles aussi contrôlées par le serveur. Le calcul se fonde sur les signes enregistrés, sans exception de niveau pour les administrateurs. Les comptes existants à 33 obtiennent le même accès.

La Loge est indépendante de l’ancienne Vidéographie, de ses contenus et des carrés d’AS. Les comptes, les pseudos et les photos existants constituent le socle d’identité. Aucune vidéo n’est envoyée dans R2 ou D1 : seules les informations de publication et l’identifiant YouTube sont conservés.

## Parcours

- Fil récent : auteur, photo, date, titre, description, lecture YouTube et accès aux commentaires.
- Publication : titre de 140 caractères maximum, description de 5 000 caractères et lien YouTube. Les vidéos non répertoriées se partagent par lien ; les vidéos privées exigent des invitations YouTube et ne conviennent pas au fil commun. Un lien non répertorié reste partageable hors du site.
- Une vidéo toutes les 168 heures à partir de sa publication dans la Loge. La suppression ne libère pas le droit de publier immédiatement. Le titre et la description sont modifiables ; l’identifiant vidéo est fixe après publication.
- Commentaires dans la Loge : créer, modifier et supprimer ses propres interventions. La limite hebdomadaire ne s’applique pas aux commentaires.
- Profil `/loge-virtuelle/membres/:id` : onglets Réflexions et Interventions. Le second rassemble les commentaires sous les publications d’autres membres et permet de retrouver leur contexte, y compris au-delà de la première page de commentaires.

## Texte exact de Game Master Blanc

**Loge virtuelle**

Partage dans la Loge virtuelle tes réflexions et tes avancées aux autres Game Masters Blancs.

Commente leurs vidéos pour leur apporter ton regard et des pistes d’amélioration. Aidez-vous mutuellement à faire grandir vos harmonies.

## Intégration

Le module serveur `src/loge.js` et le client `public/loge.js` utilisent les nouvelles tables `loge_posts`, `loge_comments` et `loge_publication_limits`. La migration additive `0047_loge_virtuelle.sql` est également initialisée à la demande par le serveur, sans toucher aux anciennes données. Les clés étrangères permettent le classement habituel des données de compte.

La réservation technique du droit de publication et l’insertion sont atomiques. Un identifiant de requête permet de reprendre une création après une coupure réseau. Une révision protège les modifications concurrentes. La suppression masque immédiatement les contenus, efface leur texte et conserve le minimum nécessaire pour que ni une ancienne requête ni une suppression ne contournent la limite.

Toutes les API sont privées et hors cache. Les écritures vérifient l’origine, le format JSON, le compte actif, le niveau et la propriété des éléments. Les liens vidéo sont normalisés avec le validateur YouTube existant ; aucun HTML de lecteur externe n’est accepté. Les listes sont paginées avec des curseurs stables.

Le client charge le lecteur YouTube après un clic, sans miniature distante ni lecture automatique. L’ouverture d’une vidéo suspend la musique ; une reprise de la musique ou l’ouverture d’une autre vidéo ferme le lecteur précédent. Les requêtes et lecteurs sont arrêtés à la navigation ou au changement de compte.

## Vérifications

Accès anonyme et niveaux 32/33, administrateurs, révocation, profils, propriété et conflits ; liens invalides, tailles et origine ; soumissions concurrentes, rejeu, suppression et fin des sept jours ; pagination et commentaire ciblé ; interface sur mobile et ordinateur, brouillons après erreur, navigation et changement de compte. Les suites existantes contrôlent aussi Playlist suspendue, les anciennes pages retirées et les paroles. Les tests client utilisent un DOM léger et les vrais handlers ; ils vérifient les formulaires, les erreurs, les lecteurs et les changements de compte, sans simuler la mise en page ni la lecture YouTube réelle. Aucun compte ou contenu de test n’est créé en production.
