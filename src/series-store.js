// Sériographies: ordered selections of the member's own videos, under a title.
// Title and order are sealed like the videos themselves.
export const SERIES_SCHEMA=`CREATE TABLE IF NOT EXISTS life_series (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(owner_id,id)
)`;
export const SERIES_LIMIT=60,SERIES_ITEMS=100;
const seriesReady=new WeakSet();
export async function ensureSeries(env){if(seriesReady.has(env.DB))return;await env.DB.prepare(SERIES_SCHEMA).run();seriesReady.add(env.DB);}
export const seriesContext=(owner,id)=>`series:${owner}:${id}`;
