# Vidéographie et mécanismes — 3 octobre 2026

Historique de la première livraison. L’intégration YouTube, les quatre catégories
et la simplification du 4 octobre sont décrites dans [youtube-videography.md](youtube-videography.md).

## Périmètre livré

Les dix mécanismes restent accessibles à l’échelon 12. Les emplacements 1 à 5
sont choisis : titre, mantra, description. Les emplacements 6 à 10 sont innés :
titre, mantra d’amélioration, description du mécanisme, moyens de l’améliorer.
Les trois propositions existantes gardent leurs titres. Les anciens champs
`notice` et `practice` sont conservés dans les blocs adaptés lors de la lecture,
sans réécriture des données avant une sauvegarde explicite. Le format 2 empêche
de réintégrer ces textes plusieurs fois.

Vidéographie remplace Matière à l’échelon 15. Elle prépare cinq rubriques :
observations et améliorations de soi, idées et réflexions, projets, ma société
harmonieuse, bilan du mois. Cette livraison permet de préparer des **fiches**
(titre, date, notes, points à approfondir) et leurs commentaires. Elle ne comprend
ni dépôt de fichier vidéo, ni lecteur, ni fournisseur d’hébergement.
Un bilan par auteur et par mois est imposé par un index unique, y compris lors
de deux enregistrements simultanés. Un brouillon incomplet reste privé.

Carré d’AS s’ouvre à l’échelon 18, y compris pour accepter une invitation.
Il présente uniquement les discussions liées aux fiches vidéo. Le propriétaire
autorise explicitement le partage, puis chaque AS doit avoir accepté son
invitation. Retrait, blocage et révocation empêchent les lectures et écritures
suivantes. Les réponses peuvent cibler une autre réponse du même fil.

Les anciens événements, créations et discussions sont conservés dans les archives
de leur auteur. Ils ne sont pas transformés en vidéos. Les mécanismes sont
personnels dans ce nouveau périmètre. Un ancien accord de partage étendu peut
couvrir les fiches vidéo, qui sont un sous-ensemble des créations précédemment
autorisées ; un ancien accord limité à l’arbre ne suffit pas. Aucun accord
existant n’est élargi.

## Architecture et migration

- Appliquer `0038_videography.sql` avant le déploiement du nouveau Worker.
  Ses colonnes sont nullables : l’ancien Worker reste compatible pendant la
  transition. Aucune donnée, aucun compte, aucune progression n’est supprimé.
- Les routes `/matiere` et `/arbre-de-vie` redirigent vers `/videographie`.
  Le module utilise toujours `/api/life-tree` et la capacité interne `lifeTree`
  pour préserver les enregistrements et les contrôles existants. L’ancienne API
  publique de vidéos, retirée du produit, reste fermée.
- `video_branch` et `video_month` sont des métadonnées non publiques en D1.
  Les notes et réflexions restent chiffrées avec les contextes AES-GCM existants.
  Ce n’est pas du chiffrement de bout en bout.
- La liste, la fiche, le fil, les réponses, les marqueurs de lecture et les
  anciennes API de messages appliquent la restriction de visibilité. Les filtres
  d’archive sont réservés à l’auteur, même lors d’un sondage de révision inchangée.
- La limite de quatre AS et quatre carrés accompagnés est maintenue.
  Les gardes SQL et les contrôles de révision évitent les écritures après un
  retrait d’accès et les écrasements entre deux fenêtres.
- Les listes restent paginées. Les textes privés ne vont jamais dans le cache du
  service worker. Les nouvelles ressources utilisent les protections d’origine,
  de contexte de compte et les limites de requêtes existantes.

## Chargement et interface

`/api/me` ne relit plus deux fois la progression canonique. Les pages privées
chargent leur première ressource et l’accord de conservation en parallèle ;
elles ne refont plus un appel à `/api/me` avant ces deux requêtes. Chaque route
serveur continue de vérifier elle-même les droits. L’identité est revérifiée au
retour sur un onglet, et les changements de compte ferment les vues privées.
Cette optimisation retire des étapes réseau ; elle ne permet pas d’attribuer à
elle seule une lenteur observée sur un appareil ou une connexion particulière.

Le header regroupe l’échelon et le bouton de menu à droite à toutes les largeurs.
Les titres Game Master sont du texte et du CSS, sans moteur graphique ni
animation continue. Les formulaires de date utilisent les composants accessibles
jour/mois/année existants. Les commentaires conservent un seul défilement de page.

## Hébergement à choisir, non implémenté

Masquer les boutons ou le nom d’une chaîne ne rend pas une vidéo YouTube secrète.
Une vidéo non répertoriée reste visible par toute personne disposant du lien.
Les vidéos privées nécessitent des autorisations YouTube/Google distinctes des
AS du site. [Confidentialité YouTube](https://support.google.com/youtube/answer/157177?hl=fr).

Pour un petit pilote, la piste économique serait un **bucket R2 privé**, séparé
des médias publics, servi par un Worker qui vérifie la session, le partage et
l’appartenance au carré à chaque requête de lecture, y compris les plages
d’octets. Le navigateur connaîtrait une adresse du site ; la copier ne donnerait
pas de droits à une autre personne. C’est une proposition d’architecture, pas une
garantie offerte automatiquement par R2.
[Accès R2 et autorisation par Worker](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/).

Le palier gratuit R2 Standard comprend 10 Go-mois, un million d’opérations A et
dix millions d’opérations B par mois. Le trafic sortant n’est pas facturé ; les
quotas Workers et l’utilisation du reste du compte restent à compter. Au-delà,
le stockage Standard est annoncé à 0,015 $/Go-mois. Ce n’est donc pas un stockage
gratuit illimité. R2 seul ne fournit pas le transcodage : il faudrait imposer un
format lisible sur les appareils visés, puis choisir comment convertir les
vidéos incompatibles sans imposer un traitement lourd au téléphone.
[Tarifs R2](https://developers.cloudflare.com/r2/pricing/).

Cloudflare Stream simplifierait le traitement des formats et la diffusion :
5 $ par tranche de 1 000 minutes stockées et 1 $ par 1 000 minutes livrées.
Les liens doivent être protégés par des jetons temporaires délivrés après
contrôle des AS ; il ne faut pas laisser les identifiants vidéo publics par
défaut. [Tarifs Stream](https://developers.cloudflare.com/stream/pricing/),
[accès signé](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/).

Avant d’activer le stockage : fixer le nombre d’utilisateurs, la durée/taille
maximale, le volume mensuel, la conservation et le budget. Prévoir les reprises
d’envoi, les fichiers orphelins, la validation réelle du média, les quotas et
l’effacement complet. Quelle que soit la solution, un AS autorisé peut filmer ou
enregistrer ce qu’il voit ; aucun masquage d’URL ne supprime cette limite.

## Vérification

Les tests couvrent les seuils, les cinq catégories, les dates, l’unicité mensuelle,
les conflits d’édition, la conservation des anciens mécanismes, l’isolation des
archives, la révocation des AS et les réponses entre membres. Une restauration
locale de la sauvegarde de production vérifie la migration sans modifier les
valeurs des colonnes préexistantes. La recette distante utilise un Worker et
une base D1 temporaires, des identités fictives et un accès de recette dédié.
