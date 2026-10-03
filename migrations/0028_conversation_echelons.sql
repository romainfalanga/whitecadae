-- Existing messages retain their original access thresholds. New messages use version 2.
ALTER TABLE conversation_messages ADD COLUMN echelon_version INTEGER NOT NULL DEFAULT 1;
