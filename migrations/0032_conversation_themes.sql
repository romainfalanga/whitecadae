-- Applied lazily by the Worker with PRAGMA checks on an existing database.
-- Historical messages keep their access version and join the General theme.
ALTER TABLE conversation_messages ADD COLUMN theme TEXT NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS idx_conversation_theme_id ON conversation_messages(theme,id);
