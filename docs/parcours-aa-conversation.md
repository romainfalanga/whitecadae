# Parcours, ouvertures et conversations — septembre 2026

## Intention et déroulé

Le jeu invite à rapprocher plusieurs lectures, extérioriser une idée et observer sa propre manière de penser. Les textes de *Wanheda*, *Quand je vois je pense* et *Un fil entre deux infinis* donnent la place aux images mentales, aux mouvements, aux connexions et à leur expression. Ils sont découverts successivement, sans page narrative AA intermédiaire.

1. Corriger les réponses et préserver chaque découverte enregistrée.
2. Retirer la page narrative AA et son bouton ; conserver l’énigme et ses découvertes. Distribuer les trois morceaux et leurs paroles aux échelons 5, 6 et 7.
3. Construire la carte à partir des règles de visibilité et d’accès du jeu, sans second catalogue ni plafond annoncé. Ajouter une vue des ouvertures par échelon, calculée à partir des permissions réelles.
4. Croiser les conversations par intention et niveau d’accès, tout en préservant les anciens messages.
5. Vérifier les migrations, permissions et interactions avant de publier sur le Worker existant.

## Signes et ouvertures

- Une réponse complète vaut un échelon. Les fragments ne donnent pas de point.
- Départ : porte sans indice, Aigle, XEU, Sans indices dans les dés.
- Aigle ouvre Aiguille et fait apparaître Trompettes. Horloge dans Aiguille ouvre le laboratoire ; Détails seul ne le fait pas.
- Une réponse de XEU révèle Mélange-les… ; ses deux réponses permettent de la résoudre. Cette lecture mène à M = M, accessible dès quatre échelons.
- 5 vins divins apparaît dès un échelon, jouable à deux. White Cadae et 30 vins divins apparaissent à deux. Les deux dates révèlent 57 et le rendent jouable à six.
- 57 demande 12 apôtres et Signe. La première réponse révèle 7, jouable à huit, qui demande Galaxie et Signe. Sans indices dans les dés sépare toujours ces deux énigmes dans la liste, même pour une ancienne sauvegarde.
- AA apparaît et s’ouvre à cinq échelons. Sa réponse est Andromédien autiste.
- Les autres dépendances existantes, notamment 13h20, restent inchangées.
- Dans Horloge, la découverte du partage révèle le dernier tableau verrouillé ; résoudre les durées centrales permet de le jouer. Les tableaux restent dans une seule page.

Ces seuils conservent plusieurs pistes en parallèle et des énigmes grisées compréhensibles. Aucun nombre fixe ne prétend être la fin du jeu : l’horizon est le score actuel augmenté des réponses restantes dans les énigmes visibles et dénombrées. La porte garde un nombre inconnu.

## Carte personnelle

`buildJourney` consomme le même état filtré que la page Échelons. Les liens sont déduits des règles `requires` et `reveal`; Horloge représente le passage vers ses tableaux. Les conditions par échelon figurent sur chaque carte. La recherche ignore les accents ; les filtres éclairent les cartes concernées sans masquer leurs relations. Le panneau de détail montre uniquement les réponses déjà trouvées, le nombre de lectures incomplètes, les conditions connues et les chemins visibles reliés.

La carte est accessible uniquement pour son propre compte. Les profils publics conservent leur filtrage selon le territoire du visiteur. Aucune réponse future, condition secrète ou liste exhaustive des énigmes n’est envoyée au navigateur. Le réseau, les vues et les données de progression restent les mêmes sur ordinateur et mobile ; la carte défile dans son propre cadre et le détail passe sous elle sur petit écran.

## Ouvertures par échelon

Une seconde vue du parcours présente les espaces et les contenus sur une ligne de progression. Elle est accessible depuis le profil et par l’onglet Ouvertures. Les espaces du départ sont suivis de Conversation à 2, Wanheda à 5, Quand je vois je pense à 6, Un fil entre deux infinis à 7, puis Vidéographie à 9. Chaque morceau ouvre son audio et ses paroles en même temps. Le 9 correspond au rang historique 4 de Vidéographie pour un nouveau joueur ; les droits déjà acquis restent conservés et sont signalés.

Les joueurs voient leurs ouvertures acquises et le prochain palier, en gris, sans lien actif. Le compte auteur voit tous les paliers de contenu et les intervalles sans nouvelle ouverture pour repérer les possibilités d’amélioration. Aucun compteur de signes n’inclut ces contenus et aucun plafond final du jeu n’est annoncé. Horloge reste une ouverture par découverte, affichée uniquement lorsque ce chemin est connu.

Les seuils des morceaux sont définis une seule fois dans `music-catalogue.js`, puis partagés par le catalogue, les paroles, les fichiers audio, la pochette, le corpus et les archives du profil. Le lecteur reçoit seulement les pistes autorisées et garde une file dans leur ordre. La vue des espaces s’appuie sur `content-access.js`, également utilisé pour les permissions de Conversation et Vidéographie. Aucune migration de progression ni réinitialisation de données n’est nécessaire.

## Conservation des données

Les identifiants existants et les lignes de progression ne sont ni supprimés ni réécrits. Les réponses Signe de 57 et 7 retrouvent chacune leur crédit. Le crédit Aigle accordé dans la version précédente reste acquis. Les nouvelles réponses Signe restent indépendantes.

La correction 12 archanges → 12 apôtres conserve un ancien échelon complet. Une réponse historique incomplète transfère uniquement le fragment 12, jamais arc ou ange. Les fragments et la réponse complète ne se cumulent pas en plusieurs échelons.

## Conversation

Chaque message porte un thème : Général pour échanger librement, Indices pour laisser une piste sans révéler la solution, Interprétations pour argumenter une lecture, Idées pour développer et essayer une proposition. Le formulaire donne une courte invitation adaptée au thème. Aucune restriction automatique des propos ou promesse de détection des spoilers n’est ajoutée.

Le filtre Tout réunit les thèmes ; chaque thème se croise avec les niveaux exact, minimal, maximal ou les messages historiques. Le serveur applique d’abord les droits, le thème et le niveau, puis la pagination. Un thème ne permet jamais de contourner un seuil d’échelon. Les anciens messages conservent `echelon_version=1` et sont classés Général ; les nouveaux utilisent le score actuel et `echelon_version=2`.

La colonne `theme` est ajoutée de façon additive et idempotente au premier accès autorisé. Les réponses privées utilisent `Cache-Control: no-store`. Le service worker ne met en cache aucune API.

## Validation

Les tests couvrent les réponses indépendantes, le transfert historique, les accès aux seuils 4/5/6/7, les files de lecture partielles, les ouvertures par étape, la vue auteur, la progression complète possible, la carte partielle et ses liens, les thèmes croisés avec les niveaux, la pagination et la conservation des audiences historiques. Les essais dans le navigateur vérifient le profil, les deux vues du parcours, leurs liens et les déblocages sur ordinateur et mobile. Les messages et comptes d’essai restent dans la base locale.
