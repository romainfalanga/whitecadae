-- Migration 0003 : références jointes aux interprétations
-- (appliquée le 2026-08-05 ; le schéma complet à jour reste schema.sql)

CREATE TABLE IF NOT EXISTS annotation_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  url TEXT
);
CREATE INDEX IF NOT EXISTS idx_refs_annotation ON annotation_references(annotation_id);
