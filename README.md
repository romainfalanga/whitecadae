# WhiteCadae

Plateforme communautaire d'explications des textes de **White Cadae**
([chaîne YouTube](https://www.youtube.com/@WhiteCadae)).

**On arrive par le 57.** La racine `/` ouvre l'escape game (voir plus bas) :
c'est lui qui commande l'accès au reste, échelon par échelon. Il se lit sans
compte, à pleine encre — seul le bouton Valider y est éteint. Tant qu'aucun
signe n'a été trouvé, il n'y a que lui — ni interprétations, ni reprises, ni
profil.

La page **Interprétations** (`/interpretations`) ouvre sur les dernières
lectures publiées par les membres — le passage visé, puis ce qu’on en dit —
avec un lien vers le **fil** (`/fil`), qui les déroule toutes de la plus
récente à la plus ancienne.

La page **Reprises** fonctionne pareil : les dernières reprises des membres
en tête, et le fil complet sur `/reprises/fil`.

Les utilisateurs créent un compte, lisent les paroles et interprètent ce
qu'ils veulent du texte. **Une sélection est toujours un passage** : un mot,
deux mots, une phrase entière ou plusieurs — c'est la même chose, un seul bloc
qui les englobe tous. Le panneau y rassemble tout ce qui touche à l'étendue
choisie, y compris les lectures écrites du temps où un mot et une phrase
avaient chacun la leur.

Aucun menu système ne s'ouvre sur les paroles : la sélection est entièrement
peinte à la main (`user-select: none` sur le texte comme sur chaque mot,
`contextmenu` et `selectstart` neutralisés), sans quoi un appui prolongé
rouvrirait le « copier / rechercher sur le Web » du navigateur.

Chaque interprétation peut porter des **références** : une œuvre extérieure
(son nom, son artiste, et en quoi c'en est une) ou un **passage d'un autre
morceau**, choisi en le sélectionnant directement dans son texte. **Deux
poignées** y règlent la place : l'une sous la zone où l'on choisit le passage,
l'autre sous le champ où l'on écrit. Une référence interne apparaît des deux côtés — sur
l'interprétation qui la pose, et sur la page du morceau visé. Chacune se
compose dans son propre éditeur et se publie avec son propre bouton, y
compris après coup sur une interprétation déjà en ligne.

Le morceau pris en entier s'interprète dans une **fenêtre ouverte par la
pastille « Interpréter le titre »**, en haut de chaque page. Un seul bloc, et
une seule chose à y écrire : l'interprétation. Pas de référence ici — le champ
s'ouvre donc directement, sans choix préalable. Les interprétations d'ensemble
et les connexions ne sont plus proposées à l'écriture ; celles qui existent
restent en base et s'affichent dans le fil des profils.

La pastille **Reprises** n'apparaît sur une page de chanson qu'une fois cette
page-là ouverte par l'échelon.

La **page de profil est publique** : n'importe qui, même sans compte, y lit
l'échelon d'un membre et les énigmes qu'il a percées — le nom de l'élément et
le nombre de signes trouvés, **jamais les réponses**. Un élément dont
le libellé est lui-même la réponse d'un autre y reste masqué tant que *celui
qui regarde* ne l'a pas ouvert de son côté, sans quoi un profil deviendrait
une antisèche.

En dessous, un **fil** : tout ce que ce membre a fait ici, du plus récent au
plus ancien, daté entrée par entrée —
interprétations (jusqu'au passage), interprétations d'ensemble, références,
connexions, reprises, et les publications qui ont rendu tout cela visible.
Ni compteurs, ni présentation, ni sections. Ce fil-là suit l'accès de celui
qui regarde : sans les interprétations ouvertes, on ne voit que l'échelon et
les énigmes. Le membre y trouve le bouton qui publie l'état actuel de ses
interprétations : tant qu'il ne l'a pas pressé, ce qu'il écrit reste en
brouillon, visible de lui seul.

Dimension sociale : tout est public en lecture, et chaque interprétation
ou connexion peut recevoir des **favoris (♥)** et des **commentaires**
des autres membres.

## La page « 57 »

`/57` est un escape game : reconstituer l'arborescence des signes
cachés dans l'EP **57**. Aucun texte, aucune explication, aucun indice :
un élément, un champ, et ce qu'il veut dire.

Ce ne sont pas des mots de passe mais des **signes** : c'est le mot qu'attend
chaque champ, et le mot par lequel on en parle ici. Un mot de passe garde, un
signe se lit.

**Elle se lit sans compte**, et sans le moindre voile : rien n'y est grisé, ni
les éléments, ni le champ, ni son invite. Le seul signe de fermeture est le
bouton Valider, éteint — c'est le geste qui est clos, pas la lecture — et deux
boutons, se connecter ou créer un compte, tiennent lieu de toute explication.
Le serveur renvoie alors un état vide (`anonyme: true`), et refuse toute
tentative.

La page est une liste plate : ni titres, ni sections, ni sommaire. Un
même élément peut porter plusieurs sens ; dans ce cas il n'a qu'un seul
champ, et les réponses s'y ajoutent une à une, dans n'importe quel ordre
(un compteur `1/2` indique combien il en reste). Certains éléments se
**verrouillent** tant que leurs prérequis ne sont pas trouvés, en masquant
même leur libellé quand celui-ci est la réponse du précédent. Un refus ne
dit rien : la carte tressaille, rougit et vibre.

Le tout premier bloc est **muet** (`silent`) : pas de libellé, et le serveur
ne dit pas non plus combien de signes il cache — il envoie seulement
`open`, qui suffit à savoir s'il faut encore afficher le champ. Le nombre
total de signes du jeu ne quitte jamais le Worker.

**Un essai à la fois.** Proposer un signe, juste ou faux, ferme tous
les champs du site : il faut donc choisir ce qu'on tente. Le délai est tenu
par le serveur (une ligne réservée de `riddle_progress`, dont le `riddle_id`
ne correspond à aucune réponse), donc un rechargement ne le fait pas sauter.
Rien ne l'annonce et rien ne l'explique : le décompte prend simplement la
place du bouton, et tout revient de soi-même.

Il grandit avec l'échelon (`delaiEssaiMs`), sur les trois nombres du disque —
**12, 33, 57** — repris d'une unité à l'autre :

| Échelon | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 et au-delà |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Attente | 33 s | 57 s | 12 min | 33 min | 57 min | 12 h | 33 h | 57 h |

La suite s'arrête sur son dernier palier plutôt que de passer aux jours : les
multiplicateurs font bondir l'échelon (jusqu'à 37) et un seul essai malheureux
ne doit pas fermer la porte des semaines.

Le délai est relu à chaque vérification : monter d'un cran allonge donc
l'attente en cours. C'est une propriété de là où l'on est, pas du moment où
l'on a tenté.

### Les échelons

`echelon = ⌊ordinaires / 3⌋ × 3^multiplicateurs + 1`

On est à l'échelon **1** dès l'arrivée : c'est le sol, pas une récompense. Ce
qu'on gravit ensuite, ce sont les **crans** — trois signes ordinaires
chacun — et ce sont eux que les mots du bloc muet **triplent**. Deux d'entre
eux multiplient donc par neuf. Multiplier zéro cran ne fait pas décoller : il
faut d'abord en gravir un. La barre de progression montre le chemin restant
dans le cran en cours, jamais la progression dans le jeu entier.

L'échelon **commande l'accès au site**, et pas seulement l'affichage des liens
(`accessOf`) :

| Échelon | Ce qui s'ouvre |
| --- | --- |
| 1 | la page 57, et rien d'autre |
| 2 | la page Interprétations apparaît — mais vide, voir les portes |
| 3 | les Reprises |

Le maximum atteignable est 37 (douze ordinaires, deux multiplicateurs).

Le tout premier bloc **occupe toute la largeur** et s'entoure d'un halo doré
(`.enigme--graal`, posé sur les blocs dont le serveur ne donne pas le total) :
on doit voir au premier regard qu'il n'est pas de la même espèce, sans qu'une
ligne de texte ait à le dire.

### Les portes

Certains signes n'ouvrent pas un échelon mais une **fonctionnalité**.
Ils vivent dans `PORTES`, hors de `NODES` : ni `buildState` ni `echelonOf` ne
les connaissent, donc ils ne comptent pas dans le calcul, et ils ne
s'affichent pas sur la page 57 — ils vivent sur la page qu'ils gardent.

L'échelon donne la clé, la porte donne la pièce. **White Cadae** garde les
Interprétations : à l'échelon 1 la page apparaît dans le menu, mais elle ne
montre que ce signe, dans la même carte que celles du 57. Tant qu'il
n'est pas trouvé, tout le reste est refusé — les albums, le fil, les chansons,
le profil — et le menu n'affiche pas encore « Mon profil ».

Le **minuteur est commun** à tous les signes du site : un essai sur une
porte ferme aussi ceux du 57, et réciproquement. Une porte déjà franchie ne
consomme pas d'essai.

Le barrage est appliqué dans le routeur du Worker, pas
seulement dans l'interface — masquer un lien n'a jamais fermé une porte. Le
compte et son avatar y échappent, sans quoi on ne pourrait plus se
déconnecter, et **l'artiste (`is_admin`) en est exempté** : il ne peut pas se
retrouver enfermé dehors par un jeu dont il connaît les réponses.

Jouer demande un compte : la progression est enregistrée dessus
(`riddle_progress`, une ligne par signe trouvé), donc conservée d'un
appareil à l'autre. Il n'y a pas de bouton de remise à
zéro dans l'interface ; la route `DELETE /api/57/progress` existe toujours.

**Tout le contenu du jeu vit dans `src/enigmas57.js`, côté Worker.**
Ce fichier n'est jamais servi au navigateur : une réponse ne part au client
qu'une fois trouvée. C'est aussi pour ça que rien de ce qui est à trouver
n'apparaît dans `public/` — ni dans un texte, ni dans un nom de classe, ni
dans un identifiant. Les champs `note` et `quotes` du fichier ne sont pas
affichés : ils documentent, sur place, pourquoi telle réponse est la bonne.
Pour ajouter un signe, il suffit d'ajouter une entrée dans
`answers` : ni l'API ni l'interface n'ont à changer.

## Sécurité

Ce qui protège les signes, et ce qui protège le reste.

**Les réponses ne sortent pas du Worker.** `src/enigmas57.js` n'est jamais
servi ; aucun fichier de `public/` ne contient de réponse, ni en texte, ni en
nom de classe, ni en identifiant. L'API n'envoie le libellé d'une réponse
qu'une fois celle-ci trouvée, et le libellé d'un élément qui *est* la réponse
d'un autre reste masqué — y compris sur le profil public d'un membre plus
avancé, où le masque suit **celui qui regarde**.

**Le barrage des tentatives** (`auth_attempts`). Le minuteur du jeu ne tient
que par compte : sans garde-fou, il suffirait de fabriquer des comptes jetables
pour essayer les signes en rafale. Deux compteurs par adresse, en fenêtre
glissante, ferment cette porte sans gêner personne :

| | Seuil | Fenêtre |
| --- | --- | --- |
| Connexions **échouées** | 20 | 15 minutes |
| Inscriptions | 6 | 1 heure |

L'adresse vient de `CF-Connecting-IP`, que le réseau pose lui-même ;
`X-Forwarded-For`, qui se forge à volonté, n'est jamais lu.

**Les en-têtes.** Une politique de sécurité du contenu (CSP) stricte sur les
scripts : `script-src 'self'`, aucun script en ligne nulle part — c'est
pourquoi le repli d'avatar, jadis dans un attribut `onerror`, est aujourd'hui
un écouteur d'`error` posé à la capture. Les styles gardent `'unsafe-inline'`
(trois barres de progression posent leur largeur en attribut). Seule origine
extérieure autorisée : le lecteur YouTube des reprises, en `frame-src`.
S'y ajoutent `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy` et
`Permissions-Policy`.

Ces en-têtes vivent à **deux endroits qu'il faut garder identiques** : la
constante `CSP` de `src/index.js` pour l'API et les routes de l'application, et
`public/_headers` pour les fichiers qui existent vraiment sur disque — ceux-là
sont servis par le réseau sans passer par le Worker.

**Le reste** : mots de passe de compte en PBKDF2‑SHA256 (100 000 itérations,
sel aléatoire, comparaison à temps constant) ; session par cookie
`HttpOnly`/`Secure`/`SameSite=Lax` ; toutes les requêtes SQL paramétrées (les
rares noms de table interpolés viennent d'une liste fermée, jamais d'une
saisie) ; avatar contraint à `image/jpeg|png|webp` par expression régulière ;
échappement systématique côté client, la CSP servant de seconde barrière.

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
