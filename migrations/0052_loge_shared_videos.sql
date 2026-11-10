-- Loge posts shared from the member's videography. Additive; the Worker also
-- creates these objects on first use, so applying this file is optional.
CREATE TABLE IF NOT EXISTS loge_shared_videos (
    post_id INTEGER PRIMARY KEY REFERENCES loge_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    upload_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loge_shared_upload ON loge_shared_videos(upload_id);
CREATE INDEX IF NOT EXISTS idx_loge_shared_user ON loge_shared_videos(user_id,event_id);
