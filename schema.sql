-- WhiteCadae — schéma de la base D1

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Photo de profil : recadrée/compressée côté client, stockée en base et
  -- servie via /api/roadmap/avatar/:id.
  avatar_data TEXT,
  avatar_mime TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Un "album" peut aussi représenter un single (is_single = 1).
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  release_date TEXT,
  is_single INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  track_number INTEGER,
  youtube_url TEXT,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album_id);

-- Chaque ligne de texte d'une chanson. Les lignes vides matérialisent
-- les séparations de strophes.
CREATE TABLE IF NOT EXISTS lyric_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lines_song ON lyric_lines(song_id, line_number);

-- Une version regroupe, à un instant donné, l'ensemble des brouillons qu'un
-- membre choisit de rendre publics (annotations + interprétations d'ensemble).
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_versions_user ON versions(user_id, number);

-- Une annotation (interprétation) cible, selon target_type :
--   - 'song'     : la chanson entière (line_id NULL)
--   - 'title'    : le titre de la chanson (line_id NULL)
--   - 'duration' : la durée de la chanson (line_id NULL)
--   - 'line'     : une ligne (phrase) — line_id renseigné, word_start NULL
--   - 'word'     : un mot ou groupe de mots — line_id + word_start..word_end
--     (indices de mots dans la ligne, en commençant à 0)
--   - 'passage'  : de (line_id, word_start) à (end_line_id, word_end),
--     le début et la fin pouvant tomber au milieu d'une phrase
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'song',
  line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  word_start INTEGER,
  word_end INTEGER,
  end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  -- Système de versions : une nouvelle interprétation (ou une modification)
  -- est un brouillon privé (is_published = 0) jusqu'à ce que son auteur
  -- publie une nouvelle version depuis sa page profil.
  is_published INTEGER NOT NULL DEFAULT 0,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  -- Grille de lecture : rang (à partir de 1) de cette interprétation parmi
  -- celles que son auteur a écrites sur la même cible, dans l'ordre où il
  -- les a écrites. Fixé à la création, jamais recalculé (une suppression ne
  -- renumérote pas les grilles restantes).
  grid_number INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_annotations_song ON annotations(song_id);
CREATE INDEX IF NOT EXISTS idx_annotations_line ON annotations(line_id);

-- Références jointes à une interprétation : ce à quoi le passage fait
-- référence selon l'auteur — libre (label + lien optionnel) ou interne
-- (un passage d'un autre morceau : ref_song_id + ref_line_id..ref_end_line_id).
CREATE TABLE IF NOT EXISTS annotation_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  url TEXT,
  ref_song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
  ref_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  ref_end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  -- Référence libre : label = le nom de l'œuvre, artist = qui l'a faite.
  -- note = l'explication de ce qui en fait une référence, dans les deux cas.
  -- url n'est plus ni proposée ni affichée (conservée pour les liens déjà saisis).
  artist TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_refs_annotation ON annotation_references(annotation_id);

-- Connexion entre deux chansons, avec l'explication du lien.
CREATE TABLE IF NOT EXISTS song_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_a_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  song_b_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_connections_a ON song_connections(song_a_id);
CREATE INDEX IF NOT EXISTS idx_connections_b ON song_connections(song_b_id);

-- Interprétation d'ensemble d'un morceau : un texte global, justifié par
-- des connexions entre blocs (phrase entière ou groupe de mots), y compris
-- entre des morceaux différents.
CREATE TABLE IF NOT EXISTS essays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_essays_song ON essays(song_id);

CREATE TABLE IF NOT EXISTS essay_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  essay_id INTEGER NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  from_line_id INTEGER NOT NULL REFERENCES lyric_lines(id) ON DELETE CASCADE,
  from_word_start INTEGER,
  from_word_end INTEGER,
  to_line_id INTEGER NOT NULL REFERENCES lyric_lines(id) ON DELETE CASCADE,
  to_word_start INTEGER,
  to_word_end INTEGER,
  note TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_essay_links_essay ON essay_links(essay_id);

-- Progression d'un membre sur les signes de l'EP 57 (page /signes). Une ligne par
-- signe rencontré : elle existe dès le premier indice demandé, et solved_at se
-- remplit quand le signe est trouvé (ou révélé, auquel cas revealed = 1). Les
-- réponses ne sont pas en base : elles vivent dans src/echelon.js (historique : src/enigmas57.js).
CREATE TABLE IF NOT EXISTS riddle_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  riddle_id TEXT NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  revealed INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, riddle_id)
);

CREATE INDEX IF NOT EXISTS idx_riddle_progress_user ON riddle_progress(user_id);

--
-- Jusqu'ici une référence était accrochée à une interprétation
-- (annotation_references.annotation_id NOT NULL) : impossible d'en poser une
-- sans écrire d'abord une interprétation. Or sur un passage donné, on peut
-- vouloir dire trois choses différentes et indépendantes :
--   - une interprétation (le plus fréquent),
--   - une référence à un passage d'un autre morceau,
--   - une référence à une œuvre extérieure.
--
-- Cette table porte les deux dernières, avec la même cible qu'une annotation.
-- annotation_references reste en place pour les références déjà saisies.

CREATE TABLE IF NOT EXISTS passage_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  -- cible, identique à celle d'une annotation
  target_type TEXT NOT NULL DEFAULT 'passage',
  line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  word_start INTEGER,
  word_end INTEGER,
  end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  -- 'internal' : un passage d'un morceau ; 'work' : une œuvre extérieure
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  artist TEXT,
  note TEXT,
  ref_song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
  ref_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  ref_end_line_id INTEGER REFERENCES lyric_lines(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_passage_refs_song ON passage_references(song_id);
CREATE INDEX IF NOT EXISTS idx_passage_refs_target ON passage_references(ref_song_id);

-- Le barrage des tentatives : une ligne par (nature, adresse) et par fenêtre
-- glissante. Sert à empêcher qu'on essaie des mots de passe de membres à la
-- chaîne, et qu'on fabrique des comptes jetables pour contourner le minuteur
-- des signes du 57.
CREATE TABLE IF NOT EXISTS auth_attempts (
  cle TEXT PRIMARY KEY,
  compte INTEGER NOT NULL DEFAULT 0,
  fenetre TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Les pièces hautes (voir migrations/0013)
-- (Pense Mieux 3, Vidéographie 4), carrés d'as (5), brainstorms (6).
-- Toutes ces tables se créent aussi d'elles-mêmes au premier passage du
-- Worker (ensureHautesTables) : cette migration est le chemin propre.

CREATE TABLE IF NOT EXISTS conversation_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'topic',
  question TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  needs TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  resources TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  revision INTEGER NOT NULL DEFAULT 0,
  created_echelon INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, client_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  min_echelon INTEGER NOT NULL DEFAULT 2,
  echelon_version INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'general',
  topic_id INTEGER REFERENCES conversation_topics(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_created ON conversation_messages(created_at);

CREATE TABLE IF NOT EXISTS reflection_trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  trunk TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trees_user ON reflection_trees(user_id, kind);

CREATE TABLE IF NOT EXISTS reflection_branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL REFERENCES reflection_trees(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES reflection_branches(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_branches_tree ON reflection_branches(tree_id);

CREATE TABLE IF NOT EXISTS carres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carre_membres (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  role TEXT,
  domaine TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carre_membres ON carre_membres(carre_id);

CREATE TABLE IF NOT EXISTS brainstorms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sujet TEXT NOT NULL,
  plateforme TEXT NOT NULL,
  url TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'annonce',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  live_depuis TEXT
);
CREATE INDEX IF NOT EXISTS idx_brainstorms_statut ON brainstorms(statut, created_at);

CREATE TABLE IF NOT EXISTS brainstorm_idees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brainstorm_id INTEGER NOT NULL REFERENCES brainstorms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  retenue INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idees_brainstorm ON brainstorm_idees(brainstorm_id, created_at);

CREATE TABLE IF NOT EXISTS brainstorm_votes (
  idee_id INTEGER NOT NULL REFERENCES brainstorm_idees(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (idee_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_idee ON brainstorm_votes(idee_id, created_at);

-- Les réseaux des pièces hautes (voir migrations/0014)
CREATE TABLE IF NOT EXISTS reflection_branch_links (
  branch_id INTEGER NOT NULL REFERENCES reflection_branches(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES reflection_branches(id) ON DELETE CASCADE,
  PRIMARY KEY (branch_id, source_id)
);

CREATE TABLE IF NOT EXISTS carre_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carre_messages ON carre_messages(carre_id, id);
CREATE TABLE IF NOT EXISTS carre_annonces (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  role TEXT,
  domaine TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carre_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carre_id INTEGER NOT NULL REFERENCES carres(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  de_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (carre_id, user_id)
);

-- Additive only. Existing discoveries and historical access remain untouched.
CREATE TABLE IF NOT EXISTS echelon_drafts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL,
  draft TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, board_id)
);
CREATE TABLE IF NOT EXISTS echelon_attempts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  next_at INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0
);

-- Cooperative projects and live sessions (additive).
CREATE TABLE IF NOT EXISTS community_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES conversation_topics(id),
    user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo', assignee_id INTEGER REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 0,
    client_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(room_id,user_id,client_id));
CREATE TABLE IF NOT EXISTS community_brainstorms (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES conversation_topics(id),
    user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, agenda TEXT NOT NULL DEFAULT '',
    starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, ended_at INTEGER, min_echelon INTEGER NOT NULL,
    summary TEXT NOT NULL DEFAULT '', live_url TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0, client_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(room_id,user_id,client_id));
CREATE TABLE IF NOT EXISTS community_brainstorm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, brainstorm_id INTEGER NOT NULL REFERENCES community_brainstorms(id),
    user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, author_echelon INTEGER NOT NULL,
    client_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(brainstorm_id,user_id,client_id));
CREATE INDEX IF NOT EXISTS idx_community_sessions ON community_brainstorms(starts_at,id);
CREATE INDEX IF NOT EXISTS idx_community_actions_room ON community_actions(room_id,id);
CREATE INDEX IF NOT EXISTS idx_community_messages_room ON community_brainstorm_messages(brainstorm_id,id);

-- Index dérivé de progression : les signes restent la source de vérité.
CREATE TABLE IF NOT EXISTS roadmap_revisions(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS roadmap_levels(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 33),revision INTEGER NOT NULL,score_version INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS idx_roadmap_levels ON roadmap_levels(level,user_id);

CREATE TRIGGER IF NOT EXISTS roadmap_progress_insert AFTER INSERT ON riddle_progress
    WHEN NEW.solved_at IS NOT NULL
    BEGIN INSERT INTO roadmap_revisions(user_id,revision) SELECT NEW.user_id,1 WHERE EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id)
    ON CONFLICT(user_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS roadmap_progress_update AFTER UPDATE ON riddle_progress
    WHEN OLD.solved_at IS NOT NEW.solved_at
    BEGIN INSERT INTO roadmap_revisions(user_id,revision) SELECT NEW.user_id,1 WHERE EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id)
    ON CONFLICT(user_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS roadmap_progress_delete AFTER DELETE ON riddle_progress
    WHEN OLD.solved_at IS NOT NULL
    BEGIN INSERT INTO roadmap_revisions(user_id,revision) SELECT OLD.user_id,1 WHERE EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id)
    ON CONFLICT(user_id) DO UPDATE SET revision=revision+1; END;
CREATE TABLE life_events (
 id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sort_date TEXT NOT NULL, end_date TEXT, precision TEXT NOT NULL,
 kind TEXT NOT NULL, impact TEXT NOT NULL, payload TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(owner_id,id)
);
CREATE INDEX idx_life_order ON life_events(owner_id,sort_date,id);
CREATE TABLE life_tags (
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, tag_hash TEXT NOT NULL,
 PRIMARY KEY(owner_id,event_id,tag_hash),
 FOREIGN KEY(owner_id,event_id) REFERENCES life_events(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX idx_life_tags ON life_tags(owner_id,tag_hash,event_id);
CREATE TABLE life_links (
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL, target_id TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(owner_id,source_id,target_id), CHECK(source_id<>target_id),
 FOREIGN KEY(owner_id,source_id) REFERENCES life_events(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,target_id) REFERENCES life_events(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE life_drafts (
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(owner_id,id)
);
CREATE TABLE ace_circles (
 owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 share_enabled INTEGER NOT NULL DEFAULT 0 CHECK(share_enabled IN(0,1)),
 access_revision INTEGER NOT NULL DEFAULT 0, content_revision INTEGER NOT NULL DEFAULT 0, message_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE ace_memberships (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES ace_circles(owner_id) ON DELETE CASCADE,
 angel_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 owner_slot INTEGER NOT NULL CHECK(owner_slot BETWEEN 1 AND 4),
 angel_slot INTEGER NOT NULL CHECK(angel_slot BETWEEN 1 AND 4),
 joined_seq INTEGER NOT NULL, joined_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(owner_id<>angel_id), UNIQUE(owner_id,angel_id), UNIQUE(owner_id,owner_slot), UNIQUE(angel_id,angel_slot)
);
CREATE TABLE ace_preferences (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 listed INTEGER NOT NULL DEFAULT 0, intro TEXT NOT NULL,
 private_code TEXT UNIQUE NOT NULL
);
CREATE TABLE ace_invitations (
 id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES ace_circles(owner_id) ON DELETE CASCADE,
 angel_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 direction TEXT NOT NULL CHECK(direction IN('invite','request')),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','declined','cancelled')),
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 recipient_notice INTEGER NOT NULL DEFAULT 0, CHECK(owner_id<>angel_id)
);
CREATE INDEX idx_ace_invite_owner ON ace_invitations(owner_id,state,expires_at);
CREATE INDEX idx_ace_invite_angel ON ace_invitations(angel_id,state,expires_at);
CREATE TABLE ace_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 owner_id INTEGER NOT NULL REFERENCES ace_circles(owner_id) ON DELETE CASCADE,
 author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
 event_id TEXT, parent_id INTEGER REFERENCES ace_messages(id) ON DELETE CASCADE,
 kind TEXT NOT NULL DEFAULT 'message' CHECK(kind IN('message','event')),
 payload TEXT NOT NULL, request_id TEXT NOT NULL, event_revision INTEGER,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(owner_id,author_id,request_id),
 FOREIGN KEY(owner_id,event_id) REFERENCES life_events(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX idx_ace_messages ON ace_messages(owner_id,id);
CREATE INDEX idx_ace_event_messages ON ace_messages(owner_id,event_id,id);
CREATE INDEX idx_ace_threads ON ace_messages(parent_id,id);
CREATE TABLE ace_read_markers (
 owner_id INTEGER NOT NULL REFERENCES ace_circles(owner_id) ON DELETE CASCADE,
 reader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id,reader_id)
);
CREATE TABLE ace_blocks (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,blocked_id), CHECK(user_id<>blocked_id)
);
CREATE TABLE ace_reports (
 id TEXT PRIMARY KEY, reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subject_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 payload TEXT NOT NULL, resolved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE privacy_consents (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL, version TEXT NOT NULL, granted INTEGER NOT NULL CHECK(granted IN(0,1)),
 recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_privacy_consents ON privacy_consents(user_id,purpose,id);
CREATE TABLE private_write_limits (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
);
CREATE TRIGGER ace_member_added AFTER INSERT ON ace_memberships BEGIN UPDATE ace_circles SET access_revision=access_revision+1 WHERE owner_id=NEW.owner_id; END;
CREATE TRIGGER ace_member_removed AFTER DELETE ON ace_memberships BEGIN UPDATE ace_circles SET access_revision=access_revision+1 WHERE owner_id=OLD.owner_id; END;
CREATE INDEX idx_ace_blocks_reverse ON ace_blocks(blocked_id,user_id);
CREATE INDEX idx_ace_message_author ON ace_messages(author_id);
CREATE TRIGGER ace_message_removed AFTER DELETE ON ace_messages BEGIN UPDATE ace_circles SET content_revision=content_revision+1 WHERE owner_id=OLD.owner_id; END;
CREATE INDEX idx_ace_reports_pending ON ace_reports(resolved_at,created_at);
CREATE TRIGGER ace_message_count_added AFTER INSERT ON ace_messages BEGIN UPDATE ace_circles SET message_count=message_count+1 WHERE owner_id=NEW.owner_id; END;
CREATE TRIGGER ace_message_count_removed AFTER DELETE ON ace_messages BEGIN UPDATE ace_circles SET message_count=MAX(0,message_count-1) WHERE owner_id=OLD.owner_id; END;

CREATE TABLE user_mechanisms (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 10),
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(owner_id,slot)
);

ALTER TABLE life_events ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'event' CHECK(entry_type IN('event','creation'));
ALTER TABLE ace_circles ADD COLUMN combined_sharing INTEGER NOT NULL DEFAULT 0 CHECK(combined_sharing IN(0,1));

CREATE TABLE circle_topics (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 resource_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('event','creation','link','mechanism')),
 event_id TEXT, target_id TEXT, mechanism_slot INTEGER,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')),
 UNIQUE(owner_id,resource_key),
 FOREIGN KEY(owner_id,event_id) REFERENCES life_events(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,target_id) REFERENCES life_events(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,event_id,target_id) REFERENCES life_links(owner_id,source_id,target_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,mechanism_slot) REFERENCES user_mechanisms(owner_id,slot) ON DELETE CASCADE,
 CHECK((kind='mechanism' AND mechanism_slot BETWEEN 1 AND 10 AND event_id IS NULL AND target_id IS NULL)
   OR (kind IN('event','creation') AND event_id IS NOT NULL AND mechanism_slot IS NULL AND target_id IS NULL)
   OR (kind='link' AND event_id IS NOT NULL AND target_id IS NOT NULL AND mechanism_slot IS NULL))
);
CREATE INDEX idx_circle_topics_feed ON circle_topics(owner_id,updated_at DESC,id DESC);
ALTER TABLE ace_messages ADD COLUMN topic_id INTEGER REFERENCES circle_topics(id) ON DELETE CASCADE;
CREATE INDEX idx_ace_topic_messages ON ace_messages(owner_id,topic_id,id);
CREATE TABLE circle_topic_reads (
 topic_id INTEGER NOT NULL REFERENCES circle_topics(id) ON DELETE CASCADE,
 reader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(topic_id,reader_id)
);

-- Existing events keep their data and acquire a discussion without copying it.
INSERT INTO circle_topics(owner_id,resource_key,kind,event_id,updated_at)
 SELECT owner_id,'event:'||id,'event',id,updated_at FROM life_events;
UPDATE ace_messages SET topic_id=(SELECT id FROM circle_topics t WHERE t.owner_id=ace_messages.owner_id AND t.event_id=ace_messages.event_id AND t.kind='event') WHERE event_id IS NOT NULL;
INSERT INTO circle_topics(owner_id,resource_key,kind,mechanism_slot,updated_at)
 SELECT owner_id,'mechanism:'||slot,'mechanism',slot,updated_at FROM user_mechanisms;
INSERT INTO circle_topics(owner_id,resource_key,kind,event_id,target_id)
 SELECT owner_id,'link:'||source_id||':'||target_id,'link',source_id,target_id FROM life_links;

CREATE TRIGGER circle_topic_added AFTER INSERT ON circle_topics BEGIN UPDATE ace_circles SET content_revision=content_revision+1 WHERE owner_id=NEW.owner_id; END;
CREATE TRIGGER circle_topic_changed AFTER UPDATE ON circle_topics BEGIN UPDATE ace_circles SET content_revision=content_revision+1 WHERE owner_id=NEW.owner_id; END;
CREATE TRIGGER circle_topic_removed AFTER DELETE ON circle_topics BEGIN UPDATE ace_circles SET content_revision=content_revision+1 WHERE owner_id=OLD.owner_id; END;
CREATE TRIGGER ace_topic_reply_added AFTER INSERT ON ace_messages WHEN NEW.topic_id IS NOT NULL BEGIN UPDATE ace_circles SET content_revision=content_revision+1 WHERE owner_id=NEW.owner_id; END;

-- Existing narratives remain private archives; no automatic video conversion.
ALTER TABLE life_events ADD COLUMN video_branch TEXT CHECK(video_branch IS NULL OR video_branch IN('self','ideas','projects','society','monthly'));
ALTER TABLE life_events ADD COLUMN video_month TEXT CHECK(video_month IS NULL OR (length(video_month)=7 AND video_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'));
CREATE INDEX idx_video_journal ON life_events(owner_id,video_branch,sort_date DESC,id DESC);
CREATE UNIQUE INDEX idx_video_monthly ON life_events(owner_id,video_month) WHERE video_branch='monthly';

-- 0039: Retire the society category without deleting users' content.
UPDATE circle_topics SET revision=revision+1 WHERE kind='creation' AND event_id IN (SELECT id FROM life_events WHERE video_branch='society');
UPDATE life_events SET video_branch='ideas', revision=revision+1 WHERE video_branch='society';

-- Retire monthly recaps without deleting their videos, dates or comments.
UPDATE circle_topics SET revision=revision+1
WHERE kind='creation' AND event_id IN (SELECT id FROM life_events WHERE video_branch='monthly');
UPDATE life_events SET video_branch='ideas',video_month=NULL,revision=revision+1 WHERE video_branch='monthly';
