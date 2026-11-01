-- Private saved publications; additive and safe to apply to existing accounts.
CREATE TABLE IF NOT EXISTS loge_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES loge_posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id,post_id)
);
CREATE INDEX IF NOT EXISTS idx_loge_favorites_user ON loge_favorites(user_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_loge_favorites_post ON loge_favorites(post_id);
