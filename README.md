# WhiteCadae

Plateforme communautaire d'explications des textes de **White Cadae**
([chaîne YouTube](https://www.youtube.com/@WhiteCadae)).

**On arrive par le 57.** La racine `/` ouvre l'escape game (voir plus bas) :
c'est lui qui commande l'accès au reste, échelon par échelon. Il se lit sans
compte, à pleine encre — seul le bouton Valider y est éteint. Dès le sol
(échelon 1, compte ou pas), les **Interprétations** et les **Reprises** sont
ouvertes ; chaque cran gravi découvre ensuite une pièce de plus, jusqu'au
sommet (échelon 7).

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

| Échelon | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Attente | 33 s | 57 s | 12 min | 33 min | 57 min | 12 h | 33 h |

Le sommet du jeu étant l'échelon 7, l'attente la plus longue réellement
atteignable est 33 h.

Le délai est relu à chaque vérification : monter d'un cran allonge donc
l'attente en cours. C'est une propriété de là où l'on est, pas du moment où
l'on a tenté.

### Les échelons

`echelon = ⌊signes / 3⌋ + 1`, où chaque signe titré vaut 1 et chaque signe du
**bloc muet vaut 3** — un cran entier, donc un échelon gagné mécaniquement.

On est à l'échelon **1** dès l'arrivée : c'est le sol, pas une récompense.
Treize signes titrés font quatre crans pleins (il en reste un de libre), les
deux signes muets en ajoutent deux : le sommet est l'échelon **7**. La barre
de progression montre le chemin restant dans le cran en cours, jamais la
progression dans le jeu entier.

L'échelon **commande l'accès au site**, et pas seulement l'affichage des liens
(`accessOf`) — chaque page a sa constante (`ECHELON_*`) :

| Échelon | Ce qui s'ouvre |
| --- | --- |
| 1 | le 57, les Interprétations et les Reprises — même sans compte |
| 2 | la **Conversation** |
| 3 | **Pense Mieux** |
| 4 | la **Vidéographie** |
| 5 | le **Carré d'As** |
| 6 | le **Brainstorm** |
| 7 | **Game Master Orange** |

Le tout premier bloc **occupe toute la largeur** et s'entoure d'un halo doré
(`.enigme--graal`, posé sur les blocs dont le serveur ne donne pas le total) :
on doit voir au premier regard qu'il n'est pas de la même espèce, sans qu'une
ligne de texte ait à le dire. **White Cadae** vient juste en dessous, premier
bloc titré.

### Les pièces hautes

Pense Mieux, la Vidéographie, le Carré d'As et le Brainstorm ne sont pas des
pages mais des **applications** : chacune a son propre menu — un **dock fixé
en bas de l'écran**, au pouce sur mobile, sous les yeux sur ordinateur — qui
suit l'utilisateur dans toutes ses vues. Le dock est purement typographique
(pas d'icônes) et les vues ne s'expliquent pas : on est dans un escape game,
l'interface se comprend en la touchant. Pense Mieux : **Forêt** (filtre, tri,
statistiques), **Nouvel arbre** (la création est un geste du menu) et
**Recherche** (plein texte dans sujets, troncs et branches). Vidéographie :
**Forêt**, **Nouvel arbre**, **Carré** (les forêts vidéo de ses As). Carré
d'As : **Mon carré**, **Conversation**, **Recrutement**, **Missions**.
Brainstorm : **La scène** (le direct et l'annoncé), **Archives** (les
brainstorms passés et leur récolte — rien ne s'évapore), **Annoncer**.

Les nourritures d'une branche peuvent venir d'un **autre arbre de la même
forêt** : la chip porte alors le nom de l'arbre source et y navigue, branche
illuminée à l'arrivée. On circule ainsi d'arbre en arbre par les connexions —
chaque présent est le futur de plusieurs passés, y compris à travers les
arbres.

Le **Recrutement** est le salon où les carrés se composent : un As libre
**s'annonce** (ce qu'il apporterait, sa nature, sa connaissance), un carré
incomplet l'**invite** avec un mot, et l'invité **accepte ou décline** — on
n'entre dans un carré que voulu des deux côtés. À l'acceptation, la nature et
la connaissance de l'annonce suivent dans le carré, l'annonce quitte le salon
et les autres invitations tombent. La charte du bon carré (l'équilibre
infinisseurs/harmonisateurs et les quatre connaissances) ouvre la page —
c'est le premier bloc des missions.

La **Conversation** (échelon 2) est unique et commune, mais chaque message
porte l'**échelon minimal pour le lire**, choisi par son auteur entre 2 et son
propre échelon : plus on monte, plus on entend de ce qui se dit. Un **filtre**
permet de regarder la conversation autrement : tout ce qui m'est ouvert,
seulement l'échelon N, à partir de N, ou **jusqu'à N — c'est voir la
conversation exactement comme la voit un membre de l'échelon N**. Le filtre est
client : le serveur a déjà envoyé tout ce qui est lisible, filtrer ne coûte
aucune requête. La page se relit toutes les 20 secondes quand l'onglet est
visible, et ne se redessine que si quelque chose a changé.

**Pense Mieux** (échelon 3) est l'outil de réflexion : un sujet devient un
**arbre** — un tronc, des branches emboîtées qui se font grandir — et
l'ensemble de ses arbres, une forêt. Et parce que **chaque présent est le
futur de plusieurs passés**, une branche peut être **nourrie** par d'autres
branches du même arbre : des liens qui traversent l'arborescence sans la
déformer, affichés en chips « ⇠ » qui mènent à leur source
(`reflection_branch_links`). La **Vidéographie** (échelon 4) est le même
moteur, liens compris, mais chaque branche est une **vidéo YouTube** (publique
ou privée) : on y organise ce qu'on a extériorisé en vidéo. Les arbres de
pensée restent à leur auteur ; les vidéographies se partagent **en lecture au
sein de son carré**, puisque les As doivent les analyser mutuellement.

Le **Carré d'As** (échelon 5) porte les missions des carrés et les outils pour
les accomplir : fonder un carré ou rejoindre un carré incomplet, choisir sa
nature (**infinisseur** ou **harmonisateur**) et sa connaissance fondamentale
(**Psychologie, Univers, IA, Religions**), et voir d'un regard l'équilibre du
carré — natures comptées, connaissances couvertes ou manquantes. S'y ajoutent
**l'annuaire des As** (tous ceux qui ont atteint l'échelon, leur carré ou
« libre », cherchables — c'est là qu'on se trouve pour se composer), la
**conversation privée du carré** (réservée à ses As, c'est son histoire :
tout ce qui s'y est dit reste) et la **vie du carré** (les arrivées, les
brainstorms portés et leur récolte).

Le **Brainstorm** (échelon 6) est la place des lives : un **carré complet**
(quatre As) annonce un brainstorming sur YouTube, Twitch ou TikTok ; la salle
propose des **réflexions** et **vote** ; le carré voit monter les plus
soutenues du moment. Le classement pondère chaque vote par son âge (dernière
minute ×8, cinq dernières ×4, dix dernières ×2, sinon ×1) et se recalcule à
la lecture — une seule requête SQL, rien qui tourne en fond. Pendant le live,
le carré peut **retenir** des réflexions : c'est la **récolte** du
brainstorming, affichée en tête, conservée après le direct, et comptée dans la
vie du carré. Le direct fonctionne par **relecture périodique** (12 s, onglet
visible) : pas de serveur temps réel, pas de connexion tenue ouverte, un
brainstorm à mille personnes coûte des requêtes ordinaires.

**Game Master Orange** (échelon 7) expose les **7 mécanismes orange** — ce
qu'on attend d'un joueur arrivé au sommet — avec, quand un mécanisme a son
outil sur la plateforme (la vidéographie, le carré), le lien qui y mène. Les
textes des missions et des mécanismes vivent dans `src/contenus.js`, côté
Worker, servis uniquement à l'échelon requis : les lire dans le code source
du navigateur est impossible.

Le **minuteur est commun** à tous les signes du site, et le barrage d'échelon
est appliqué dans le routeur du Worker, pas seulement dans l'interface —
masquer un lien n'a jamais fermé une porte. Le compte et son avatar y
échappent, sans quoi on ne pourrait plus se déconnecter, et **l'artiste
(`is_admin`) en est exempté** : il ne peut pas se retrouver enfermé dehors par
un jeu dont il connaît les réponses.

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
