-- Additive extension: existing media remain Loge-owned; no posts, events,
-- encrypted payloads or discussions are rewritten. Apply once via D1 migrations.
ALTER TABLE loge_stream_uploads ADD COLUMN purpose TEXT NOT NULL DEFAULT 'loge' CHECK(purpose IN ('loge','videography'));
ALTER TABLE loge_stream_uploads ADD COLUMN event_id TEXT;
ALTER TABLE loge_stream_uploads ADD COLUMN link_fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_video_event ON loge_stream_uploads(user_id,event_id) WHERE purpose='videography' AND state='published';

-- Cleanup queue entries retain their budget, but must not occupy the active slot
-- while a replacement becomes published or several records are erased.
DROP INDEX IF EXISTS idx_loge_stream_outstanding;
CREATE UNIQUE INDEX idx_loge_stream_outstanding ON loge_stream_uploads(user_id,purpose) WHERE state IN ('reserved','waiting','processing','ready');
