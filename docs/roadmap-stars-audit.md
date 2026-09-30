# Échelons : étoiles et compte — 30 septembre 2026

Cette évolution remplace les règles d’affichage décrites dans l’audit initial de la roadmap. Elle ne change ni les signes, ni le calcul des 33 échelons, ni les accès musicaux. Aucune remise à zéro des comptes n’est effectuée.

## Affichage et accès

- Page et menu nommés Échelons, URL `/echelon` conservée. Textes introductifs et raccourcis supprimés selon la demande. Dernière phrase de l’accueil retirée.
- Un astre sphérique par échelon : photosphère texturée en coordonnées 3D, assombrissement du limbe et couronne lumineuse. Un seul canvas WebGL hors écran prépare à la demande des images fixes de 192 pixels (environ 13 Ko dans le navigateur de test). Aucun calcul permanent ; observateur de visibilité, file de travail différée, réutilisation des images et destruction du contexte à la navigation. Repli CSS sans WebGL, aucune bibliothèque ajoutée.
- Couleur relative aux effectifs positifs des seuls échelons visibles : rouge pour le minimum, jaune pour le maximum, orange exactement au milieu. Interpolation continue sans arrondi ni paliers. Population uniforme : orange. Échelon vide : astre atténué ; futur : sphère sombre sans effectif.
- Les compteurs incluent le propriétaire du compte et ses pairs au même échelon. Toutes les requêtes de listes et de photos imposent la même limite côté serveur, sans exception administrateur.
- Chargement initial sans identité de membres. L’ancien champ `members` reste un tableau vide pour éviter de casser les onglets déjà ouverts. Les listes au clic chargent 24 personnes, avec accès à la suite, gestion des erreurs et annulation à la navigation.
- Adresse mail uniquement dans `self`, pour son propriétaire connecté ; jamais dans les listes. Réponses privées non mises en cache.
- Horloge apparaît dans le menu après la découverte du signe canonique `eg-03-1`, via `/api/me`. Le menu est relu immédiatement après une bonne réponse. Un niveau élevé ou le statut administrateur ne suffisent pas ; les gardes de l’API Horloge restent inchangées.

## Réglages

Le pseudo et la photo utilisent les endpoints existants, leurs validations et la compression locale des images à 256 pixels. Le formulaire ajoute l’adresse mail en lecture seule et un volet pour modifier le mot de passe : mot de passe actuel, nouveau mot de passe et confirmation. Les mots de passe ne sont ni chargés depuis le serveur ni conservés dans le stockage navigateur. Le serveur exige le mot de passe actuel et révoque les autres sessions après modification. Les contrôles sont désactivés pendant les enregistrements ; les formulaires et images préparées sont effacés à la fermeture.

Le composant de connexion anonyme est partagé avec Signes, avec seulement les liens Se connecter et Créer un compte et le retour vers la page d’origine.

## Vérifications

91 tests Node/SQLite passent, dont les accès anonymes, les compteurs et listes jusqu’au niveau courant, les refus des niveaux supérieurs, la pagination de 42 membres, les photos réévaluées sur progression réelle, l’absence d’emails tiers et la stabilité du calcul de progression. Les tests du mot de passe couvrent l’ancien secret incorrect, la longueur minimale, la nouvelle connexion, le maintien de la session courante et la révocation des autres, sans modifier l’email ni un autre compte. La couleur est vérifiée pour populations inégales, uniformes, vides et masquées, ainsi que pour 2/16/29/30 puis un maximum de 90. Les tests du rendu vérifient le démarrage à la visibilité, le cache, l’arrêt à la navigation, les images tardives et le repli sans WebGL. L’accès au menu Horloge est testé avant et après la bonne réponse, et sans passe-droit administrateur.

Navigateur local avec le véritable Worker et des comptes fictifs : vues de 1440, 390 et 320 pixels, pas de débordement horizontal, ouverture et fermeture des listes, membres du niveau courant, modification du pseudo et import d’une photo conservés après rechargement, déconnexion, email en lecture seule, présence des champs de mot de passe, composant anonyme et texte d’accueil. Le changement de mot de passe est testé par l’API sur une base locale ; aucun mot de passe d’un utilisateur réel n’est changé. Compilation Cloudflare contrôlée par dry-run.

Les effectifs se rafraîchissent à l’ouverture de la page et les listes à leur première ouverture sur cette visite : ce n’est pas un flux temps réel. Les essais de dimensions couvrent les petits écrans, sans prétendre avoir testé tous les appareils physiques.

Vérification supplémentaire dans le navigateur : astres texturés sans erreur WebGL, déblocage de Horloge depuis Aiguille et apparition immédiate du lien dans le menu mobile ; navigation fonctionnelle et un seul élément actif dans le menu. La 3D est un rendu fixe calculé à l’apparition, pas une simulation astronomique animée.
