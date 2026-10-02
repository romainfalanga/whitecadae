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
