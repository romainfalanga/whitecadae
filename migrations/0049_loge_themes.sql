-- 0049: Paris weekly themes, immutable editions and optional publication tags.
CREATE TABLE IF NOT EXISTS loge_themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 140),
    normalized TEXT NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE TABLE IF NOT EXISTS loge_theme_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL REFERENCES loge_themes(id),
    target_week TEXT NOT NULL CHECK(length(target_week)=10),
    starts_at INTEGER NOT NULL,
    opens_at INTEGER NOT NULL CHECK(opens_at<starts_at),
    proposed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(target_week,theme_id)
  );
CREATE INDEX IF NOT EXISTS idx_loge_candidates_week ON loge_theme_candidates(target_week,id DESC);
CREATE INDEX IF NOT EXISTS idx_loge_candidates_deadline ON loge_theme_candidates(starts_at,target_week);
CREATE TABLE IF NOT EXISTS loge_theme_votes (
    candidate_id INTEGER NOT NULL REFERENCES loge_theme_candidates(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(candidate_id,user_id)
  );
CREATE INDEX IF NOT EXISTS idx_loge_theme_votes_user ON loge_theme_votes(user_id,candidate_id);
CREATE TABLE IF NOT EXISTS loge_theme_weeks (
    week_start TEXT PRIMARY KEY CHECK(length(week_start)=10),
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
    theme_id INTEGER REFERENCES loge_themes(id),
    candidate_id INTEGER REFERENCES loge_theme_candidates(id),
    likes INTEGER NOT NULL DEFAULT 0 CHECK(likes>=0),
    settled_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE INDEX IF NOT EXISTS idx_loge_theme_weeks_theme ON loge_theme_weeks(theme_id,week_start DESC);
CREATE TABLE IF NOT EXISTS loge_post_themes (
    post_id INTEGER PRIMARY KEY REFERENCES loge_posts(id) ON DELETE CASCADE,
    theme_id INTEGER NOT NULL REFERENCES loge_themes(id),
    week_start TEXT NOT NULL REFERENCES loge_theme_weeks(week_start)
  );
CREATE INDEX IF NOT EXISTS idx_loge_post_themes_theme ON loge_post_themes(theme_id,post_id DESC);
CREATE INDEX IF NOT EXISTS idx_loge_post_themes_week ON loge_post_themes(week_start,post_id DESC);
