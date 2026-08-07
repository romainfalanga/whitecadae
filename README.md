# WhiteCadae

Plateforme communautaire d'explications des textes de **White Cadae**
([chaîne YouTube](https://www.youtube.com/@WhiteCadae)).

**On arrive par le 57.** La racine `/` ouvre l'escape game (voir plus bas) :
c'est lui qui commande l'accès au reste, échelon par échelon.

La page **Interprétations** (`/interpretations`) ouvre sur les dernières
lectures publiées par les membres — le passage visé, puis ce qu’on en dit —
avec un lien vers le **fil** (`/fil`), qui les déroule toutes de la plus
récente à la plus ancienne.

La page **Reprises** fonctionne pareil : les dernières reprises des membres
en tête, et le fil complet sur `/reprises/fil`.

Les utilisateurs créent un compte, lisent les paroles et proposent des
interprétations à quatre niveaux :

- **la chanson entière** (sens général),
- **le titre** de la chanson,
- **une phrase** (une ligne du texte),
- **un mot ou un groupe de mots** dans une phrase — un mot peut avoir sa
  propre interprétation *en plus* de celle de sa phrase.

Chaque interprétation peut porter des **références** : une œuvre extérieure
(son nom, son artiste, et en quoi c'en est une) ou un **passage d'un autre
morceau**, choisi en le sélectionnant directement dans son texte. Une référence interne apparaît des deux côtés — sur
l'interprétation qui la pose, et sur la page du morceau visé. Chacune se
compose dans son propre éditeur et se publie avec son propre bouton, y
compris après coup sur une interprétation déjà en ligne.

Le titre, le sens général du morceau, les interprétations d'ensemble et les
connexions entre chansons vivent dans une **fenêtre ouverte par la pastille
« Interpréter le titre »**, en haut de chaque page de chanson : un seul point
d'entrée pour tout ce qui concerne le morceau pris en entier.

La **page de profil est un fil**, et rien d'autre : tout ce qu'un membre a
fait ici, du plus récent au plus ancien, daté entrée par entrée —
interprétations (jusqu'au passage), interprétations d'ensemble, références,
connexions, reprises, et les publications qui ont rendu tout cela visible.
Ni compteurs, ni présentation, ni sections. Le membre y trouve le bouton qui
publie l'état actuel de ses interprétations : tant qu'il ne l'a pas pressé,
ce qu'il écrit reste en brouillon, visible de lui seul.

Dimension sociale : tout est public en lecture, et chaque interprétation
ou connexion peut recevoir des **favoris (♥)** et des **commentaires**
des autres membres.

## La page « 57 »

`/57` est un escape game : reconstituer l'arborescence des mots de passe
cachés dans l'EP **57**. Aucun texte, aucune explication, aucun indice :
un élément, un champ, et ce qu'il veut dire.

La page est une liste plate : ni titres, ni sections, ni sommaire. Un
même élément peut porter plusieurs sens ; dans ce cas il n'a qu'un seul
champ, et les réponses s'y ajoutent une à une, dans n'importe quel ordre
(un compteur `1/2` indique combien il en reste). Certains éléments se
**verrouillent** tant que leurs prérequis ne sont pas trouvés, en masquant
même leur libellé quand celui-ci est la réponse du précédent. Un refus ne
dit rien : la carte tressaille, rougit et vibre.

Le tout premier bloc est **muet** (`silent`) : pas de libellé, et le serveur
ne dit pas non plus combien de mots de passe il cache — il envoie seulement
`open`, qui suffit à savoir s'il faut encore afficher le champ. Le nombre
total de mots de passe du jeu ne quitte jamais le Worker.

On monte d'un **échelon** tous les trois mots de passe trouvés : on commence
au 1, le troisième fait passer au 2. La barre de progression montre le chemin
restant dans l'échelon en cours — jamais la progression dans le jeu entier.
C'est cet échelon qui, à terme, ouvrira les fonctionnalités de la plateforme.

La page est réservée aux membres : la progression est enregistrée sur le
compte (`riddle_progress`, une ligne par mot de passe trouvé), donc
conservée d'un appareil à l'autre. Il n'y a pas de bouton de remise à
zéro dans l'interface ; la route `DELETE /api/57/progress` existe toujours.

**Tout le contenu du jeu vit dans `src/enigmas57.js`, côté Worker.**
Ce fichier n'est jamais servi au navigateur : une réponse ne part au client
qu'une fois trouvée. C'est aussi pour ça que rien de ce qui est à trouver
n'apparaît dans `public/` — ni dans un texte, ni dans un nom de classe, ni
dans un identifiant. Les champs `note` et `quotes` du fichier ne sont pas
affichés : ils documentent, sur place, pourquoi telle réponse est la bonne.
Pour ajouter un mot de passe, il suffit d'ajouter une entrée dans
`answers` : ni l'API ni l'interface n'ont à changer.

## Architecture

- **Cloudflare Workers** : une seule application qui sert l'API (`/api/*`)
  et le site statique (`public/`), sans framework ni étape de build.
- **Cloudflare D1** (SQLite serverless) : comptes, sessions, albums,
  chansons, paroles, annotations, connexions, progression du jeu de la
  page 57. Schéma dans `schema.sql`, migrations dans `migrations/`.
- **Authentification** : mots de passe hachés (PBKDF2‑SHA256, 100 000
  itérations), sessions par cookie `HttpOnly`/`Secure` valables 30 jours.

Le compte créé avec l'email listé dans `ADMIN_EMAILS` (`wrangler.jsonc`)
devient automatiquement **administrateur** : il accède à la page
`/admin` pour créer les albums/singles, les chansons, et coller les textes.

## Déploiement

Prérequis : un compte Cloudflare et Node.js.

```bash
npm install

# 1. Créer la base D1 (si elle n'existe pas déjà)
npx wrangler d1 create whitecadae-db
#    → reporter le database_id retourné dans wrangler.jsonc

# 2. Appliquer le schéma et les données initiales (album « 18 juillet 2019 »)
npm run db:schema
npm run db:seed

# 3. Déployer
npx wrangler deploy
```

Sur une base **déjà en service**, `npm run db:schema` suffit à créer les
tables ajoutées depuis (tout est en `CREATE TABLE IF NOT EXISTS`, les
tables existantes ne sont pas touchées). On peut aussi n'appliquer que la
dernière migration :

```bash
npx wrangler d1 execute whitecadae-db --remote --file=./migrations/0009_signes57.sql
```

Pour le développement local :

```bash
npm run db:local   # crée la base locale
npm run dev        # http://localhost:8787
```

## Contenu initial

L'album **18 juillet 2019** est pré-rempli avec cinq titres :
*Wanheda*, *Quand je vois je pense*, *Ma folie*,
*Un fil entre deux infinis*, *Rendors-toi*.
Les paroles s'ajoutent depuis la page **Administration** (une ligne par
vers, une ligne vide entre les strophes).

> ⚠ Remplacer les paroles d'une chanson supprime les explications déjà
> attachées à ses anciennes phrases et mots (les explications portant sur
> la chanson entière sont conservées).
