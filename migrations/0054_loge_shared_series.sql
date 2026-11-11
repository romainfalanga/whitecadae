-- A sériographie published in the Loges as one post: its videos, in order.
-- Additive; the Worker also creates these objects on first use.
CREATE TABLE IF NOT EXISTS loge_shared_series (
  post_id INTEGER NOT NULL REFERENCES loge_posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  PRIMARY KEY(post_id,position)
);
CREATE INDEX IF NOT EXISTS idx_loge_series_user ON loge_shared_series(user_id,event_id);
