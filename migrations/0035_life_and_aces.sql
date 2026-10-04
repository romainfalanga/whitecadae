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
