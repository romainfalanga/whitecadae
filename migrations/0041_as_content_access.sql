-- An accepted AS relation grants read access to videos and mechanisms.
-- Retain explicit past revocations for existing relations.
ALTER TABLE ace_memberships ADD COLUMN content_access INTEGER NOT NULL DEFAULT 1 CHECK(content_access IN (0,1));
UPDATE ace_memberships SET content_access=0 WHERE owner_id IN (
 SELECT user_id FROM privacy_consents p WHERE purpose IN ('videography','sharing') AND granted=0
 AND id=(SELECT MAX(id) FROM privacy_consents q WHERE q.user_id=p.user_id AND q.purpose IN ('videography','sharing'))
);
UPDATE ace_circles SET access_revision=access_revision+1;
CREATE TRIGGER ace_member_access_changed AFTER UPDATE OF content_access ON ace_memberships
WHEN OLD.content_access<>NEW.content_access BEGIN
 UPDATE ace_circles SET access_revision=access_revision+1 WHERE owner_id=NEW.owner_id;
END;
