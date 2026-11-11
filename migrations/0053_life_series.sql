-- Sériographies: ordered selections of the member's own videos. Additive; the
-- Worker also creates this table on first use, so applying this file is optional.
CREATE TABLE IF NOT EXISTS life_series (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(owner_id,id)
);
