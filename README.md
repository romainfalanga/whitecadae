# White Cadae — Escape Game Orange

Le site s’ouvre sur **Escape Game Orange** (`/`) : l’histoire de Vulpis, l’album **57** et les signes à retrouver dans ses quatre morceaux.

- **57** (`/57`, ancien `/musique` redirigé) : 13h20, 30 vins divins, Sans indices dans les dés, Orange. Les MP3 et la pochette fournis sont servis depuis `public/music/57/`, sans conversion des originaux.
- **Paroles** (`/paroles`) : toute la discographie en lecture seule. Les liens `/chanson/:slug` sont conservés ; `/interpretations` et `/fil` redirigent vers les paroles.
- **Échelon** (`/echelon`) : une carte progressive, des pages d’énigmes et de lectures, et un atelier de durées. Chaque réponse complète distincte rapporte un échelon. La connexion conserve la page demandée.

Le lecteur natif est placé hors du contenu remplacé par la navigation. Il apparaît à la première lecture, propose lecture/pause, précédent/suivant, déplacement dans le morceau, volume sur ordinateur et répétition de l’album. Il enchaîne les quatre titres dans l’ordre et s’arrête après Orange, sauf si la répétition est activée. La position est conservée localement ; un rechargement ne relance jamais la musique automatiquement.

Media Session fournit titres, pochette et commandes système. L’audio reste actif quand la page devient invisible et utilise la session `playback` quand elle est disponible. **Le verrouillage réel d’un iPhone/Android doit être testé sur ces appareils** : un navigateur ou un système qui ferme/suspend l’onglet ne peut pas être contraint par le site. Aucun mode hors ligne de l’album n’est annoncé. Le service worker ignore les fichiers audio et les requêtes Range, et ne stocke jamais les réponses partielles 206.

Les nouveaux POST/PUT/PATCH d’interprétations, références, connexions et essais renvoient 410. Les anciennes contributions restent en base et dans les archives privées de leur auteur. Les anciens identifiants de progression sont conservés. Deux tables additives enregistrent les brouillons et les tentatives du nouveau jeu ; aucune ligne historique n’est supprimée. **Ne pas réimporter les paroles ni réinitialiser D1 lors du déploiement.**

## Vérifications de cette évolution

`npm test` couvre le lecteur (ordre, fin, répétition, reprise, commandes système, médias concurrents), la fermeture des anciennes écritures, l’API de paroles et les exclusions du service worker. Les essais de navigation, de rendu responsive et de lecture réelle se font dans le navigateur avec une base D1 locale.

Avant la publication : `npx wrangler deploy --dry-run`. Pour publier sur le Worker existant : `npx wrangler deploy`, avec une session Cloudflare autorisée. La migration additive `0027_echelon.sql` est également appliquée à la volée, sans réimport de données. Publier avec `--keep-vars` sur le Worker existant.

## Échelon

Le catalogue et les réponses vivent exclusivement dans `src/echelon.js`. `src/echelon-api.js` ne transmet que les pages déjà découvertes ; visibilité et permission de répondre sont vérifiées séparément côté serveur. Un ancien lien API `/api/57` utilise le même état filtré. L’ancien endpoint de remise à zéro est retiré pour préserver les droits historiques.

Chaque réponse complète distincte vaut un échelon, y compris lorsqu’une même page contient plusieurs réponses. Le départ est à zéro. Les fragments, les pages d’observation et les étapes intermédiaires ne rapportent aucun point. Aucun plafond ni inventaire des pages futures n’est transmis au navigateur. Les trois anciennes découvertes redondantes « signe » sont réunies ; les réponses retirées restent dans l’historique mais ne comptent plus dans le nouveau jeu.

Horloge ouvre immédiatement l’atelier. Les constructions utilisent des arbres d’opérations et l’origine de chaque chiffre, validés côté serveur dans `src/echelon-workshop.js`. Former deux sept distincts révèle le partage d’un nombre ; aucun échelon n’est gagné à cette étape. Les résultats numériques seuls ne suffisent pas à valider une construction. La lecture symbolique du premier tableau reste une clé propre à l’œuvre.

Les tableaux sont manipulables au toucher et au clavier, avec annulation, rétablissement et reprise des durées. Les brouillons sont conservés sur l’appareil et sur le compte. Un numéro de révision empêche un appareil d’écraser silencieusement l’autre. Le serveur réserve atomiquement les tentatives et ralentit les erreurs répétées.

`src/enigmas57.js` conserve le catalogue historique uniquement pour traduire les anciennes découvertes, préserver les droits aux espaces privés et partager le moteur de reconnaissance. Le rang d’accès historique reste distinct du nombre d’échelons affiché dans le nouveau jeu. Les profils filtrent leurs découvertes selon ce que leur visiteur peut déjà connaître.

Les tests couvrent la migration des découvertes, les permissions, les constructions, le score, la concurrence des brouillons, le lecteur et les fonctions conservées. Aucune base de production n’est réinitialisée.

### Les pièces hautes

Pense Mieux, la Vidéographie et le Carré d'As sont chacun **UNE page**, sans
sous-menu : la cartographie, les trois branches et la recherche pour Pense
Mieux ; le rythme et son historique pour la Vidéographie ; mes carrés, le
salon de recrutement, les carrés à compléter et la fondation pour le Carré
d'As. Les vues ne s'expliquent pas : on est dans un escape game, l'interface
se comprend en la touchant. Seul le **Brainstorm** garde un dock (fixé en
bas, au pouce sur mobile) : **La scène** (le direct et l'annoncé),
**Archives** (les brainstorms passés et leur récolte : rien ne s'évapore),
**Annoncer** — trois moments réellement distincts.

Les nourritures d'une branche peuvent venir d'un **autre arbre de la même
forêt** : la chip porte alors le nom de l'arbre source et y navigue, branche
illuminée à l'arrivée. On circule ainsi d'arbre en arbre par les connexions :
chaque présent est le futur de plusieurs passés, y compris à travers les
arbres.

Le **Recrutement** est le salon où les carrés se composent : un As libre
**s'annonce** d'un mot — ce qu'il cherche, ce qu'il apporterait, et rien
d'autre : un carré ne classe pas ses As. Un carré incomplet l'**invite** avec
un mot, et l'invité **accepte ou décline** : on n'entre dans un carré que
voulu des deux côtés. L'annonce reste au salon, car un As peut vouloir
d'autres carrés encore. La charte du bon carré ouvre le salon — une phrase,
et c'est tout ce qui reste des anciennes missions.

La **Conversation** (échelon 2) est unique et commune, mais chaque message
porte l'**échelon minimal pour le lire**, choisi par son auteur entre 2 et son
propre échelon : plus on monte, plus on entend de ce qui se dit. Un **filtre**
permet de regarder la conversation autrement : tout ce qui m'est ouvert,
seulement l'échelon N, à partir de N, ou **jusqu'à N : c'est voir la
conversation exactement comme la voit un membre de l'échelon N**. Le filtre est
client : le serveur a déjà envoyé tout ce qui est lisible, filtrer ne coûte
aucune requête. La page se relit toutes les 20 secondes quand l'onglet est
visible, et ne se redessine que si quelque chose a changé.

**Pense Mieux** (échelon 3) est l'outil de la pensée : un sujet devient un
**arbre** (un tronc, des branches emboîtées qui se font grandir) et
l'ensemble de ses arbres, une forêt. Et parce que **chaque présent est le
futur de plusieurs passés**, une branche peut être **nourrie** par d'autres
branches du même arbre : des liens qui traversent l'arborescence sans la
déformer, affichés en chips « ⇠ » qui mènent à leur source
(`reflection_branch_links`).

Le vocabulaire de la page est celui de la pensée, pas celui de l'arbre : on
**ouvre une réflexion**, on y **dépose des pensées**, on les **prolonge**. Le
chemin d'une réflexion est `/reflexion/:id` (l'ancien `/arbre/:id` y mène
encore : rien de ce qui a été partagé ne casse).

**Le vocal est LE geste de Pense Mieux.** Une pensée s'y dit, elle ne s'y
tape pas : **Dire ma pensée** enregistre, la transcription revient par
**Workers AI** (Whisper, en français, silences filtrés), le champ s'ouvre
alors **pour être corrigé**, et le dépôt n'apparaît qu'à ce moment. Le
clavier ne revient en premier que si le navigateur ne sait pas enregistrer
(ou si la transcription manque : le champ s'ouvre vide, la pensée s'écrit).

Le micro est pris **brut** : la suppression de bruit et le gain automatique
du navigateur — la voix « sous l'eau » de tous les enregistrements web —
sont coupés (l'isolation de voix du système, `voiceIsolation`, est demandée
quand l'appareil la sait faire), et c'est notre **chaîne de voix** qui fait
le travail avant l'encodage : passe-haut sous la fondamentale, creux dans le
bas-médium, cloche de présence, souffle d'air, compresseur large, gain,
limiteur. Ce qui est gardé, ce qui part à la transcription et ce qui devient
une vidéo sont le même son, déjà propre. La chaîne s'**accorde au timbre de
chacun, toute seule** : chaque enregistrement est mesuré en silence
(fondamentale par autocorrélation, niveau), coupure, présence et gain s'en
déduisent et le réglage vit sur le compte (`users.voix`) — le vocal suivant
s'y accorde. Aucun bouton : rien à savoir, rien à régler.

L'audio reste attaché à sa pensée avec son **minutage mot à mot**
(`branch_vocaux`, en base64 dans D1 comme les avatars, borné à trois
minutes). Et la **vidéo se fabrique d'elle-même**, sans qu'on la demande :
dès qu'une pensée dite est déposée, le texte est dessiné sur une toile au
rythme de la voix et enregistré avec le son par le navigateur, en silence et
sans rien bloquer. **La vidéo EST le contenu final de la pensée** : elle se
regarde en place, dans la pensée même — un lecteur, pas un téléchargement.
L'arborescence se parcourt **de vidéo en vidéo** : quand une vidéo se
termine, la pensée dite suivante (dans l'ordre de l'arbre) se propose d'un
bouton. Et sous chaque vidéo, repliée, son **émergence** : l'audio d'origine
(le texte s'y écrit au moment où on le dit) et le **texte de la vidéo,
modifiable** — corriger ce texte réaligne le minutage (même nombre de mots :
chacun garde le sien ; sinon au prorata de la longueur, sur la même durée),
oublie la vidéo d'avant et la refabrique. Le fichier vit dans le navigateur
(IndexedDB) — il ne pèse rien sur la base — et les vidéos manquantes (autre
navigateur, cache vidé) **se refont d'elles-mêmes** à l'ouverture de la page,
une à la fois ; si le navigateur exige un geste avant de jouer un son, la
fabrication repart au premier toucher. Sans le binding AI, la transcription
répond 503 et le clavier reste : rien ne casse.

**La cartographie.** La page d'accueil de Pense Mieux dessine **toutes les
réflexions de la personne sur une seule carte** : un disque par réflexion,
gros comme ce qu'elle porte, un trait par nourriture qui passe de l'une à
l'autre, le miroir société ↔ société harmonieuse en pointillé. La **couleur
dit la quête** : ce qui creuse le pourquoi, ce qui cherche à faire mieux — et
une légende sous la carte ne montre que ce qui y est réellement dessiné. On
s'y voit penser — ce qui grossit, ce qui se relie, ce qui reste seul — et
chaque disque s'ouvre d'un toucher. La disposition est déterministe (spirale
d'angle d'or puis détente de ressorts, puis un étirement jusqu'aux bords) : la
carte est la même à chaque visite.

Sur un écran large la carte est **couchée** ; **sur un téléphone elle se
dresse debout** (seuil : 700 px, le même que la feuille de style) et se lit en
descendant. Un téléphone est haut, pas large : couchée, la carte s'y écrasait
jusqu'à ne plus rien montrer. Elle se redessine seule quand la place change —
rotation, fenêtre redimensionnée — sans relire le serveur.

**La Vidéographie** (échelon 4) ne porte que des **récaps de période** — une
vidéo par semaine, par mois, par an, où l'on raconte ce qu'on a vécu du point
de vue de ce qu'on a ajouté dans Pense Mieux et vécu avec ses carrés. Chaque
carte pose la matière (compteurs de la période) et un récap ne se dépose que
**le jour dit**, calculé sur le calendrier de Paris : la semaine **le
dimanche** (elle clôt la semaine ISO qui s'achève), le mois **le premier
dimanche du mois** (il raconte le mois écoulé), l'année **du 1er au 3
janvier** (elle raconte l'année écoulée). Hors fenêtre, pas de formulaire :
la carte dit la date, et le serveur refuse en 403 ce que l'interface ne
propose pas. Le reste du temps, on vit ; le jour venu, on raconte.

## Les trois branches, à soi seul

Chacun porte trois branches de réflexion dans Pense Mieux. Elles existent
d'avance, ne s'ouvrent pas, ne se referment pas : on les nourrit.

| axe | branche |
|---|---|
| `fonctionnement` | Mon fonctionnement |
| `societe_actuelle` | La société |
| `societe_harmonieuse` | Société harmonieuse |

La première regarde vers l'intérieur : comment je marche, et ce qui me ferait
marcher mieux. Les deux autres **se répondent en miroir** : la société dit ce
qui est là, tel que c'est ; la société harmonieuse dit vers quoi cela pourrait
tendre. Chacune des deux porte une ligne « En regard » qui mène à l'autre.

Les quatre branches d'avant sont devenues ces trois-là sans rien perdre :
« Ma psychologie » est « Mon fonctionnement » (le même regard, mieux nommé),
« Ma société harmonieuse » est « Société harmonieuse », et « La société »
naît vide. « Le moi harmonieux » et « Ma philosophie » ne sont plus des
branches : vides, elles s'effacent (des coquilles créées d'avance) ; pleines,
elles deviennent des **catégories de « Mon fonctionnement »** — tout ce qui y
a été écrit reste lisible, un cran plus bas. Ce que le moi harmonieux portait
— ce vers quoi l'on tend — se dit désormais dans la quête « Comment faire
mieux ? », dans n'importe quelle branche.

### Deux quêtes : « Pourquoi ? » et « Comment faire mieux ? »

Une réflexion ne creuse pas dans tous les sens : elle creuse dans **un** sens,
et le dire au moment de l'ouvrir change ce qu'on y dépose. Ou bien elle
descend vers la **cause** (`pourquoi`), ou bien elle monte vers le **remède**
(`mieux`) — `reflection_trees.quete`. Le choix est **demandé à l'ouverture**
(sans lui, rien ne part) et se **corrige d'un toucher** en tête de la
réflexion : on peut l'avoir ouverte du mauvais côté. Un second toucher sur la
quête allumée la retire.

Une **catégorie n'a pas de quête** : elle range, elle ne creuse pas. Une
branche non plus. Les réflexions d'avant les quêtes n'en portent pas : on ne
leur en invente pas une, elles attendent qu'on le dise. La quête se voit
partout où une réflexion se montre — sa pastille sur les cartes et dans la
recherche, sa couleur sur la cartographie, ses comptes sur la carte de chaque
branche.

**Tout Pense Mieux est à soi, et à personne d'autre.** Le carré n'y entre
plus : il imagine des sociétés de son côté (voir plus bas). Ni un autre
membre, ni un visiteur, ni les As de ses carrés ne lisent quoi que ce soit —
`droitsArbre` dit propriétaire seul, partout. Les **réponses** que des As
avaient déposées du temps où un carré lisait les branches restent chez leur
destinataire, avec leur libellé (approfondir, élargir, opposer et résoudre) ;
il ne s'en dépose plus.

Le multivers a quitté Pense Mieux : le tronc « Mon multivers » vide s'est
effacé (une coquille créée d'avance), celui qui portait quelque chose est
devenu une **catégorie sans attache** — rien de ce qui y a été écrit n'est
perdu.

**Tout se range dans une branche.** Une réflexion ne naît pas hors-sol : elle
s'ouvre DANS une des trois branches, ou dans une **catégorie** qu'on y a
créée (`reflection_trees.parent_id`, `genre`). Chaque branche a en outre **sa
propre cartographie** : ses catégories, ses réflexions et les nourritures qui
les relient, pour voir la trajectoire de ses pensées dans cette branche-là.

**Ouvrir une réflexion et créer une catégorie ne sont pas le même geste**, et
l'interface ne laisse plus le doute : deux onglets qui s'allument (celui qui
est choisi reste allumé, en doré), et sous eux un panneau qui redit où l'on
est — « Dans <la branche> », le nom du geste, ce qu'il fait, et un bouton qui
porte ce nom (« Ouvrir la réflexion », « Créer la catégorie »). Toucher
l'onglet allumé referme : on n'est alors plus nulle part, et cela se voit
aussi.

Techniquement, une branche **est une réflexion** : `reflection_trees` porte
`axe` (`fonctionnement` | `societe_actuelle` | `societe_harmonieuse`), et des
index uniques partiels
garantissent l'unicité de chacune. Elles héritent donc, sans une ligne de
moteur nouveau, des pensées emboîtées, des liens de nourriture, du vocal, du
rendu et de la recherche. Une réflexion se lit par un chemin unique,
`/reflexion/<id>`, et c'est le serveur qui dit ce que le lecteur a le droit
d'y faire.

## Le carré d'As : quatre As qui imaginent des sociétés harmonieuses

**Un carré est un atelier.** Quatre As y imaginent **ensemble** des
**sociétés harmonieuses** : le carré ne regarde plus l'intérieur des
personnes, il construit des modèles. On **fonde autant de carrés qu'on
veut**, on entre dans autant qu'on veut : chaque carré est un atelier de
plus, avec d'autres esprits. Le fondateur n'a aucun privilège : il peut
partir comme les autres, l'atelier continue — et un carré vidé de son dernier
As s'efface avec tout ce qui était à lui.

Chaque **société** a un **nom** (`carre_societes`) — un carré peut en porter
plusieurs — et se pense sur **deux volets** (`societe_idees.volet`) :

- **Ce qui lui permet d'être** (`etre`) — ses fondations : ce qui rend cette
  société possible, et ce qui la fait tenir ;
- **Comment on y vit** (`vivre`) — les comportements des individus : ce
  qu'ils feraient, mécaniquement, en vivant dedans.

Chacun des quatre dépose dans l'un ou l'autre volet ; chacun retire ce qu'il
a déposé, et rien d'autre. Le nom se retravaille par n'importe quel As ; une
société **vide** se referme, une société **pensée** reste : elle appartient
au carré. Membres seulement, lecture comme écriture : la façade d'un carré
n'en montre que le compte.

La page principale du Carré d'As centralise **mes carrés**, la **fondation**,
le **salon de recrutement** (les As s'annoncent d'un mot ; un membre d'un
carré incomplet invite ; on n'entre que voulu des deux côtés), et les
**carrés à compléter** (cherchables au clavier). La page d'un carré montre
ses As et ses sociétés ; la page d'une société, ses deux volets côte à côte.

Le **Brainstorm** (échelon 6) a le même objectif que les carrés : imaginer.
**N'importe quel As d'un carré complet** annonce un brainstorming sur
YouTube, Twitch ou TikTok, et le live porte sur une **société du carré** —
une déjà en chantier, ou une **qui naît à l'annonce** (on la nomme, elle est
créée). L'annonceur tient l'antenne. Les As du carré voient sur la page du
live le lien de leur **salon Discord** ; les autres ne le voient pas. La
salle propose des **réflexions** et **vote** ; le carré voit monter les plus
soutenues du moment. Le classement pondère chaque vote par son âge (dernière
minute ×8, cinq dernières ×4, dix dernières ×2, sinon ×1) et se recalcule à
la lecture : une seule requête SQL, rien qui tourne en fond. Pendant le live,
le carré peut **retenir** des réflexions : c'est la **récolte** du
brainstorming, affichée en tête, conservée après le direct, et comptée dans la
vie du carré. Le direct fonctionne par **relecture périodique** (12 s, onglet
visible) : pas de serveur temps réel, pas de connexion tenue ouverte, un
brainstorm à mille personnes coûte des requêtes ordinaires.

Le **114** (échelon 7) est la **suite du 57**. Elle n'est pas encore écrite,
et la page reste aussi muette que le 57 : son titre, un bloc qui dit que la
suite arrive, un champ éteint. Elle reprend les habits du sommet — le grand
bloc doré, son champ, son bouton — mais tous éteints. Le texte vit dans
`src/contenus.js` (`PAGE_114`), côté Worker, servi au seul échelon 7 : le lire
dans le code source du navigateur est impossible. Le jour où la seconde partie
s'écrira, c'est à `/api/114` que son état viendra se brancher, comme `/api/57`
pour la première.

Le **minuteur est commun** à tous les signes du site, et le barrage d'échelon
est appliqué dans le routeur du Worker, pas seulement dans l'interface :
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
n'apparaît dans `public/`, que ce soit en texte, en nom de classe ou en
identifiant. Les champs `note` et `quotes` du fichier ne sont pas
affichés : ils documentent, sur place, pourquoi telle réponse est la bonne.
Pour ajouter un signe, il suffit d'ajouter une entrée dans
`answers` : ni l'API ni l'interface n'ont à changer.

## Sécurité

Ce qui protège les signes, et ce qui protège le reste.

**Les réponses ne sortent pas du Worker.** `src/enigmas57.js` n'est jamais
servi ; aucun fichier de `public/` ne contient de réponse, ni en texte, ni en
nom de classe, ni en identifiant. L'API n'envoie le libellé d'une réponse
qu'une fois celle-ci trouvée, et le libellé d'un élément qui *est* la réponse
d'un autre reste masqué : y compris sur le profil public d'un membre plus
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
scripts : `script-src 'self'`, aucun script en ligne nulle part : c'est
pourquoi le repli d'avatar, jadis dans un attribut `onerror`, est aujourd'hui
un écouteur d'`error` posé à la capture. Les styles gardent `'unsafe-inline'`
(trois barres de progression posent leur largeur en attribut). Seule origine
extérieure autorisée : le lecteur YouTube des vidéos, en `frame-src`.
S'y ajoutent `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`,
`Permissions-Policy` et un `Strict-Transport-Security` de deux ans qui garde le
site en HTTPS. Les liens externes fournis par un membre (YouTube, Twitch,
TikTok) passent par un `safeUrl` qui n'autorise que `http(s)` avant d'entrer
dans un `href`.

Ces en-têtes vivent à **deux endroits qu'il faut garder identiques** : la
constante `CSP` de `src/index.js` pour l'API et les routes de l'application, et
`public/_headers` pour les fichiers qui existent vraiment sur disque : ceux-là
sont servis par le réseau sans passer par le Worker.

**Le reste** : mots de passe de compte en PBKDF2‑SHA256 (100 000 itérations,
sel aléatoire, comparaison à temps constant) ; session par cookie
`HttpOnly`/`Secure`/`SameSite=Lax` ; toutes les requêtes SQL paramétrées (les
rares noms de table interpolés viennent d'une liste fermée, jamais d'une
saisie) ; avatar contraint à `image/jpeg|png|webp` par expression régulière ;
échappement systématique côté client, la CSP servant de seconde barrière.
Changer de mot de passe coupe toutes les autres sessions du compte : un cookie
qui aurait fuité ne vaut plus rien après ce geste.

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
