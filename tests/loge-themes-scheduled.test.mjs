import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {parisWeek,ensureThemeTables,THEME_SCHEMA} from '../src/loge-themes.js';
import {ensureLogeTables} from '../src/loge.js';
import {fixture} from './community-fixture.mjs';

for(const [name,before,deadline] of [
  ['winter','2026-11-01T21:00:00Z','2026-11-01T23:00:00Z'],
  ['summer','2026-07-05T21:00:00Z','2026-07-05T22:00:00Z']
])test('scheduled '+name+' rollover selects exactly the closed Paris week without visitors and is idempotent',async()=>{
  const f=fixture();let now=Date.parse(before);f.sql.function('unixepoch',()=>Math.floor(now/1000));
  try{
    await ensureLogeTables(f.env);await ensureThemeTables(f.env);const week=parisWeek(now);
    const id=Number(f.sql.prepare('INSERT INTO loge_themes(title,normalized,created_by) VALUES(?,?,?)').run('Progresser','progresser',11).lastInsertRowid);
    const candidate=Number(f.sql.prepare('INSERT INTO loge_theme_candidates(theme_id,target_week,starts_at,opens_at,proposed_by) VALUES(?,?,?,?,?)').run(id,week.nextKey,week.nextStart,week.start,11).lastInsertRowid);
    f.sql.prepare('INSERT INTO loge_theme_votes(candidate_id,user_id) VALUES(?,?)').run(candidate,12);
    const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8').replace(/^\s*\/\/.*$/gm,''));assert.deepEqual(config.triggers.crons,['0 22,23 * * SUN']);
    now=Date.parse(deadline)-1000;await worker.scheduled({scheduledTime:now,cron:config.triggers.crons[0]},f.env);
    assert.equal(f.sql.prepare('SELECT theme_id FROM loge_theme_weeks WHERE week_start=?').get(week.nextKey),undefined,'never freeze a future vote early');
    now=Date.parse(deadline);await worker.scheduled({scheduledTime:now,cron:config.triggers.crons[0]},f.env);
    const selected=f.sql.prepare('SELECT theme_id,likes,starts_at FROM loge_theme_weeks WHERE week_start=?').get(week.nextKey);
    assert.deepEqual({...selected},{theme_id:id,likes:1,starts_at:now/1000});
    now+=3600000;await worker.scheduled({scheduledTime:now,cron:config.triggers.crons[0]},f.env);
    assert.deepEqual({...f.sql.prepare('SELECT theme_id,likes,starts_at FROM loge_theme_weeks WHERE week_start=?').get(week.nextKey)},{...selected});
  }finally{f.sql.close();}
});


test('the additive production migration matches both runtime and fresh-install schemas and preserves old posts',()=>{
  const names=THEME_SCHEMA.map(sql=>/CREATE (?:TABLE|INDEX) IF NOT EXISTS (\w+)/.exec(sql)[1]),databases=[new DatabaseSync(':memory:'),new DatabaseSync(':memory:'),new DatabaseSync(':memory:')];
  try{
    for(const db of databases.slice(0,2))db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); CREATE TABLE loge_posts(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(11); INSERT INTO loge_posts VALUES(7);');
    databases[0].exec(THEME_SCHEMA.join(';'));databases[1].exec(readFileSync(new URL('../migrations/0049_loge_themes.sql',import.meta.url),'utf8'));databases[2].exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
    const signature=db=>names.map(name=>[name,db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(name).sql.replace(/\s+/g,' ').trim()]);
    assert.deepEqual(signature(databases[1]),signature(databases[0]));assert.deepEqual(signature(databases[2]),signature(databases[0]));
    assert.equal(databases[1].prepare('SELECT id FROM loge_posts').get().id,7);assert.equal(databases[1].prepare('SELECT id FROM users').get().id,11);
  }finally{databases.forEach(db=>db.close());}
});
