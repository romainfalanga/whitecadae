-- 0047: Loge virtuelle. Additive; unrelated spaces and saved data stay untouched.
-- UTC seconds; publication quota is independent of post deletion.
CREATE TABLE IF NOT EXISTS loge_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    UNIQUE(author_id,request_id),
    CHECK(deleted_at IS NOT NULL OR (length(youtube_id)=11 AND length(title) BETWEEN 1 AND 140 AND length(description) BETWEEN 1 AND 5000))
  );
CREATE INDEX IF NOT EXISTS idx_loge_posts_author ON loge_posts(author_id,id DESC);
CREATE TABLE IF NOT EXISTS loge_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES loge_posts(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    body TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    UNIQUE(author_id,request_id),
    CHECK(deleted_at IS NOT NULL OR length(body) BETWEEN 1 AND 2000)
  );
CREATE INDEX IF NOT EXISTS idx_loge_comments_post ON loge_comments(post_id,id);
CREATE INDEX IF NOT EXISTS idx_loge_comments_author ON loge_comments(author_id,id DESC);
CREATE TABLE IF NOT EXISTS loge_publication_limits (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    next_publish_at INTEGER NOT NULL DEFAULT 0,
    claim_token TEXT NOT NULL DEFAULT '',
    write_window_at INTEGER NOT NULL DEFAULT 0,
    write_count INTEGER NOT NULL DEFAULT 0,
    write_claim_token TEXT NOT NULL DEFAULT ''
  );
