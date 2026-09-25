# Parcours, AA et conversations — septembre 2026

## Intention et déroulé

Le jeu invite à rapprocher plusieurs lectures, extérioriser une idée et observer sa propre manière de penser. Les textes de *Wanheda*, *Quand je vois je pense* et *Un fil entre deux infinis* donnent la place aux images mentales, aux mouvements, aux connexions et à leur expression. Le récit AA reprend cette expérience subjective de l’artiste sans en faire une consigne thérapeutique ou une explication des réponses du jeu.

1. Corriger les réponses et préserver chaque découverte enregistrée.
2. Relier le récit AA, son énigme et l’EP 18 juillet 2019 au même seuil de cinq réponses complètes.
3. Construire la carte à partir des règles de visibilité et d’accès du jeu, sans second catalogue ni plafond annoncé.
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

## Conservation des données

Les identifiants existants et les lignes de progression ne sont ni supprimés ni réécrits. Les réponses Signe de 57 et 7 retrouvent chacune leur crédit. Le crédit Aigle accordé dans la version précédente reste acquis. Les nouvelles réponses Signe restent indépendantes.

La correction 12 archanges → 12 apôtres conserve un ancien échelon complet. Une réponse historique incomplète transfère uniquement le fragment 12, jamais arc ou ange. Les fragments et la réponse complète ne se cumulent pas en plusieurs échelons.

## Conversation

Chaque message porte un thème : Général pour échanger librement, Indices pour laisser une piste sans révéler la solution, Interprétations pour argumenter une lecture, Idées pour développer et essayer une proposition. Le formulaire donne une courte invitation adaptée au thème. Aucune restriction automatique des propos ou promesse de détection des spoilers n’est ajoutée.

Le filtre Tout réunit les thèmes ; chaque thème se croise avec les niveaux exact, minimal, maximal ou les messages historiques. Le serveur applique d’abord les droits, le thème et le niveau, puis la pagination. Un thème ne permet jamais de contourner un seuil d’échelon. Les anciens messages conservent `echelon_version=1` et sont classés Général ; les nouveaux utilisent le score actuel et `echelon_version=2`.

La colonne `theme` est ajoutée de façon additive et idempotente au premier accès autorisé. Les réponses privées utilisent `Cache-Control: no-store`. Le service worker ne met en cache aucune API.

## Validation

Les tests couvrent les réponses indépendantes, le transfert historique, les accès au seuil 4/5, la progression complète possible, la carte partielle et ses liens, les thèmes croisés avec les niveaux, la pagination et la conservation des audiences historiques. Les essais dans le navigateur vérifient le profil, les cartes, la recherche, les liens vers les champs, le récit AA et le formulaire de conversation sur ordinateur et mobile. Les messages d’essai restent dans la base locale.
