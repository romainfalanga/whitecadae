# WhiteCadae

Plateforme communautaire d'explications des textes de **White Cadae**
([chaîne YouTube](https://www.youtube.com/@WhiteCadae)).

Les utilisateurs créent un compte, lisent les paroles et proposent des
interprétations à cinq niveaux :

- **la chanson entière** (sens général),
- **le titre** de la chanson,
- **la durée** de la chanson (les chiffres en minutes et secondes),
- **une phrase** (une ligne du texte),
- **un mot ou un groupe de mots** dans une phrase — un mot peut avoir sa
  propre interprétation *en plus* de celle de sa phrase.

Chaque chanson peut aussi être **connectée à une autre chanson**, avec une
explication du lien entre les deux.

Dimension sociale : tout est public en lecture, et chaque interprétation
ou connexion peut recevoir des **favoris (♥)** et des **commentaires**
des autres membres.

## La page « 57 »

`/57` est un jeu : reconstituer l'arborescence des mots de passe cachés
dans l'EP **57**. Partout où il y a un « = », il y a une réponse à trouver
— `57 = ange`, `13h20 = 2031`, `M = M`… Certaines branches se **rejoignent**
(57 et trompette disent la même chose), d'autres se **verrouillent** tant
que leur prérequis n'est pas trouvé (`10 mains` n'apparaît qu'après
`Prends la bête à …`). Chaque réponse trouvée déroule son explication et
les vers qui la prouvent, avec un lien vers le morceau.

La page est réservée aux membres : la progression est enregistrée sur le
compte (`riddle_progress`), donc conservée d'un appareil à l'autre. Trois
indices par énigme sont délivrés à la demande, puis la réponse peut être
révélée en dernier recours — elle est alors comptée comme « révélée » et
non « trouvée ».

**Tout le contenu du jeu vit dans `src/enigmas57.js`, côté Worker.**
Ce fichier n'est jamais servi au navigateur : réponses, explications et
indices ne partent au client qu'une fois l'énigme résolue ou l'indice
demandé. C'est aussi pour ça que rien de ce qui est à trouver n'apparaît
dans `public/` — ni dans un texte, ni dans un nom de classe, ni dans un
identifiant. Pour ajouter un mot de passe, il suffit d'ajouter un objet
dans `RIDDLES` : ni l'API ni l'interface n'ont à changer.

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
