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
