import {gameLevel} from './echelon.js';

// Derived index only. The saved signs remain the source of truth.
export const SCORE_VERSION=1;
export const ROADMAP_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS roadmap_revisions(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS roadmap_levels(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 33),revision INTEGER NOT NULL,score_version INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_roadmap_levels ON roadmap_levels(level,user_id)`,
  ...['INSERT','UPDATE','DELETE'].map(event=>`CREATE TRIGGER IF NOT EXISTS roadmap_progress_${event.toLowerCase()} AFTER ${event} ON riddle_progress
    ${event==='UPDATE'?'WHEN OLD.solved_at IS NOT NEW.solved_at':event==='INSERT'?'WHEN NEW.solved_at IS NOT NULL':'WHEN OLD.solved_at IS NOT NULL'}
    BEGIN INSERT INTO roadmap_revisions(user_id,revision) SELECT ${event==='DELETE'?'OLD':'NEW'}.user_id,1 WHERE EXISTS(SELECT 1 FROM users WHERE id=${event==='DELETE'?'OLD':'NEW'}.user_id)
    ON CONFLICT(user_id) DO UPDATE SET revision=revision+1; END`),
];
const ready=new WeakMap();
export async function ensureRoadmapLevels(env){
  if(!ready.has(env.DB)){
    const job=env.DB.batch(ROADMAP_SCHEMA.map(sql=>env.DB.prepare(sql))).catch(error=>{ready.delete(env.DB);throw error;});
    ready.set(env.DB,job);
  }
  await ready.get(env.DB);
  // Fetch only missing/stale scores, in bounded batches. Revision checks prevent
  // a concurrent answer from being overwritten with an older computed score.
  for(;;){
    const {results=[]}=await env.DB.prepare(`SELECT u.id,COALESCE(r.revision,0) AS revision,
      COALESCE((SELECT json_group_array(json_object('riddle_id',p.riddle_id,'solved_at',p.solved_at)) FROM riddle_progress p WHERE p.user_id=u.id AND p.solved_at IS NOT NULL),'[]') AS progress
      FROM users u LEFT JOIN roadmap_revisions r ON r.user_id=u.id LEFT JOIN roadmap_levels l ON l.user_id=u.id
      WHERE l.user_id IS NULL OR l.revision<>COALESCE(r.revision,0) OR l.score_version<>?1 LIMIT 64`).bind(SCORE_VERSION).all();
    if(!results.length)break;
    await env.DB.batch(results.map(row=>env.DB.prepare(`INSERT INTO roadmap_levels(user_id,level,revision,score_version)
      SELECT ?1,?2,?3,?4 WHERE EXISTS(SELECT 1 FROM users WHERE id=?1) AND ?3=COALESCE((SELECT revision FROM roadmap_revisions WHERE user_id=?1),0)
      ON CONFLICT(user_id) DO UPDATE SET level=excluded.level,revision=excluded.revision,score_version=excluded.score_version`).bind(row.id,gameLevel(JSON.parse(row.progress)),row.revision,SCORE_VERSION)));
    if(results.length<64)break;
  }
}

// A row invalidated by a simultaneous discovery is excluded until recomputed.
export const CURRENT_SCORES=`FROM roadmap_levels l JOIN users u ON u.id=l.user_id LEFT JOIN roadmap_revisions r ON r.user_id=u.id
 WHERE l.score_version=${SCORE_VERSION} AND l.revision=COALESCE(r.revision,0)`;
