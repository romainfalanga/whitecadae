-- Stream media ownership is additive. No legacy post/comment table is rebuilt.
-- Intentionally no foreign keys: cleanup survives deleted users and hard-deleted posts.
CREATE TABLE IF NOT EXISTS loge_stream_uploads (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    declared_size INTEGER NOT NULL,
    stream_id TEXT UNIQUE,
    upload_url TEXT,
    state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','waiting','processing','ready','published','deleting','deleted')),
    post_id INTEGER UNIQUE,
    duration_seconds REAL NOT NULL DEFAULT 1800,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    cleanup_after INTEGER NOT NULL DEFAULT 0,
    cleanup_attempts INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id,request_id)
  );
CREATE UNIQUE INDEX IF NOT EXISTS idx_loge_stream_outstanding ON loge_stream_uploads(user_id) WHERE state NOT IN ('published','deleted');
CREATE INDEX IF NOT EXISTS idx_loge_stream_cleanup ON loge_stream_uploads(state,cleanup_after,expires_at);
