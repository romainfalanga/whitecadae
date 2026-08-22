# WhiteCadae

Plateforme communautaire d'explications des textes de **White Cadae**
([chaîne YouTube](https://www.youtube.com/@WhiteCadae)).

**On arrive par le 57.** La racine `/` ouvre l'escape game (voir plus bas) :
c'est lui qui commande l'accès au reste, échelon par échelon. Il se lit sans
compte, à pleine encre : seul le bouton Valider y est éteint. Dès le sol
(échelon 1, compte ou pas), les **Interprétations** sont ouvertes ; chaque
cran gravi découvre ensuite une pièce de plus, jusqu'au sommet (échelon 7).

La page **Interprétations** (`/interpretations`) ouvre sur les dernières
lectures publiées par les membres : le passage visé, puis ce qu’on en dit :
avec un lien vers le **fil** (`/fil`), qui les déroule toutes de la plus
récente à la plus ancienne.

Les utilisateurs créent un compte, lisent les paroles et interprètent ce
qu'ils veulent du texte. **Une sélection est toujours un passage** : un mot,
deux mots, une phrase entière ou plusieurs : c'est la même chose, un seul bloc
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
l'autre sous le champ où l'on écrit. Une référence interne apparaît des deux côtés : sur
l'interprétation qui la pose, et sur la page du morceau visé. Chacune se
compose dans son propre éditeur et se publie avec son propre bouton, y
compris après coup sur une interprétation déjà en ligne.

Le morceau pris en entier s'interprète dans une **fenêtre ouverte par la
pastille « Interpréter le titre »**, en haut de chaque page. Un seul bloc, et
une seule chose à y écrire : l'interprétation. Il n'y a pas de référence ici, donc le champ
s'ouvre directement, sans choix préalable. Les interprétations d'ensemble
et les connexions ne sont plus proposées à l'écriture ; celles qui existent
restent en base et s'affichent dans le fil des profils.

La **page de profil est publique** pour ce qui est du jeu : n'importe qui,
même sans compte, y lit l'échelon d'un membre et les énigmes qu'il a percées : le nom de l'élément et
le nombre de signes trouvés, **jamais les réponses**. Un élément dont
le libellé est lui-même la réponse d'un autre y reste masqué tant que *celui
qui regarde* ne l'a pas ouvert de son côté, sans quoi un profil deviendrait
une antisèche.

En dessous, un **fil** que **seul son propriétaire voit** : tout ce qu'il a
fait ici, du plus récent au plus ancien, daté entrée par entrée :
interprétations (jusqu'au passage), interprétations d'ensemble, références,
connexions, et les publications qui ont rendu tout cela visible.
Ni compteurs, ni présentation, ni sections. Ce fil-là suit l'accès de celui
qui regarde : sans les interprétations ouvertes, on ne voit que l'échelon et
les énigmes. Il n'y a plus rien à publier : ce qu'il écrit est à lui dès la première
frappe.

**Les interprétations sont la mémoire de leur auteur.** Ce qu'on écrit sur un
morceau n'est lu que par soi : ni un visiteur, ni un autre membre n'y a
accès. Il n'y a donc ni fil public, ni favoris, ni commentaires, ni étape de
publication — ce qu'on écrit est à soi, tout de suite. Les compteurs de la
page des morceaux disent ce que **j'ai** écrit, et la densité d'un passage
compte **mes** lectures.

## La page « 57 »

`/57` est un escape game : reconstituer l'arborescence des signes
cachés dans l'EP **57**. Aucun texte ni indice :
un élément, un champ, et ce qu'il veut dire.

Ce ne sont pas des mots de passe mais des **signes** : c'est le mot qu'attend
chaque champ, et le mot par lequel on en parle ici. Un mot de passe garde, un
signe, lui, se lit.

**Elle se lit sans compte**, et sans le moindre voile : rien n'y est grisé, ni
les éléments, ni le champ, ni son invite. Le seul signe de fermeture est le
bouton Valider, éteint (c'est le geste qui est clos, pas la lecture) et deux
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

**Un signe peut se tenir partiellement.** Chaque réponse est découpée en
**parties** ordonnées (`33 ans` : « 33 » puis « ans » ; `12 arc-anges` :
« 12 », « arc », « anges »). Proposer une partie seule la fait apparaître
**en vert, à sa place**, avec un « ? » pour chaque trou : `33 ?`, `? ans`,
`12 ? anges`. Le serveur n'envoie jamais le texte d'une partie manquante, ni
leur nombre : un trou contigu ne vaut qu'un seul « ? ». Chaque partie vit
sur sa propre ligne de `riddle_progress` (`n-e-2.p0`) ; la réponse entière
garde la sienne, et l'échelon ne compte que les réponses entières.

**Ce qui est juste est gardé même quand le reste est faux.** La proposition
est lue **mot à mot** : « 10 mains » garde le 10 et rend « mains ». L'essai
est alors rendu sous le champ, chaque mot marqué : **vert** ce qui était
juste, **rouge barré** ce qui ne l'était pas, et la carte garde `10 ?`. Les
écritures admises restent strictes (la bonne façon d'écrire le signe, ses
chiffres en lettres, son singulier ou son pluriel quand les deux se disent) :
un article ou un mot en trop n'est pas accepté, il est **rendu en rouge** à
côté de ce qui a été gardé. L'ordre des parties compte : « anges 12 » ne
garde que les anges. Une partie déjà verte re-proposée ne gagne rien, mais
n'est pas appelée fausse pour autant.

**On ne pêche pas.** Un seul mot de bruit est toléré à côté de ce qui est
reconnu : jeter dix mots pour voir lesquels verdissent ne rend rien du tout,
ni terrain gagné ni écho, et coûte l'essai comme les autres. Quand **rien**
n'est reconnu, la proposition entière repart en rouge : elle n'apprend rien
à personne.

Le tout premier bloc est **muet** (`silent`) : pas de libellé, et le serveur
ne dit pas non plus combien de signes il cache : il envoie seulement
`open`, qui suffit à savoir s'il faut encore afficher le champ. Le nombre
total de signes du jeu ne quitte jamais le Worker.

**Un essai à la fois.** Proposer un signe, juste ou faux, ferme tous
les champs du site : il faut donc choisir ce qu'on tente. Le délai est tenu
par le serveur (une ligne réservée de `riddle_progress`, dont le `riddle_id`
ne correspond à aucune réponse), donc un rechargement ne le fait pas sauter.
Rien ne l'annonce et rien ne l'explique : le décompte prend simplement la
place du bouton, et tout revient de soi-même.

Il grandit avec l'échelon (`delaiEssaiMs`), sur les trois nombres du disque :
**12, 33, 57** : repris d'une unité à l'autre :

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
**bloc muet vaut 3** : un cran entier, donc un échelon gagné mécaniquement.

On est à l'échelon **1** dès l'arrivée : c'est le point de départ que l'on
gravit ensuite. Treize signes titrés font quatre crans pleins (il en reste un de libre), les
deux signes muets en ajoutent deux : le sommet est l'échelon **7**. La barre
de progression montre le chemin restant dans le cran en cours, jamais la
progression dans le jeu entier.

L'échelon **commande l'accès au site**, et pas seulement l'affichage des liens
(`accessOf`) : chaque page a sa constante (`ECHELON_*`) :

| Échelon | Ce qui s'ouvre |
| --- | --- |
| 1 | le 57 et les Interprétations : même sans compte |
| 2 | la **Conversation** |
| 3 | **Pense Mieux** |
| 4 | la **Vidéographie** |
| 5 | le **Carré d'As** |
| 6 | le **Brainstorm** |
| 7 | le **114** : la suite du 57 |

Le tout premier bloc **occupe toute la largeur** et s'entoure d'un halo doré
(`.enigme--graal`, posé sur les blocs dont le serveur ne donne pas le total) :
on doit voir au premier regard qu'il n'est pas de la même espèce, sans qu'une
ligne de texte ait à le dire. **White Cadae** vient juste en dessous, premier
bloc titré.

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
