-- Preserve existing sessions while making credential changes atomic.
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
