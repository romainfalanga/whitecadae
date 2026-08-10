-- Migration 0009 : les signes de l'EP 57 (page /57)
--
-- Progression d'un membre sur la chasse aux signes. Une ligne par signe
-- rencontré : elle existe dès le premier indice demandé, et solved_at se
-- remplit quand le signe est trouvé (ou révélé, auquel cas revealed = 1).
-- Les réponses elles-mêmes ne sont pas en base : elles vivent dans
-- src/enigmas57.js, côté Worker uniquement.

CREATE TABLE IF NOT EXISTS riddle_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  riddle_id TEXT NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  revealed INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, riddle_id)
);

CREATE INDEX IF NOT EXISTS idx_riddle_progress_user ON riddle_progress(user_id);
