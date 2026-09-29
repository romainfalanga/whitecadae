import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './community-fixture.mjs';
import {ensureGameTables} from '../src/echelon-api.js';
import {accountResetPlan} from '../scripts/account-reset-plan.mjs';
test('account reset preserves the catalogue and ID sequence, clears all account tables and allows re-registration',async()=>{
  const f=fixture();try{
    f.sql.exec(readFileSync(new URL('../seed.sql',import.meta.url),'utf8'));
    await ensureGameTables(f.env);
    f.sql.exec("INSERT INTO echelon_draft_history VALUES(1,'eg-12',1,'{}'); INSERT INTO auth_attempts(cle) VALUES('test:connexion')");
    const before=f.sql.prepare('SELECT count(*) AS n FROM users').get().n,lyrics=f.sql.prepare('SELECT count(*) AS n FROM lyric_lines').get().n;
    const plan=accountResetPlan(f.sql);
    assert.equal(plan.report.accounts,before);assert.ok(plan.report.verified);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM users').get().n,before,'preparation rolls back its offline rehearsal');
    f.sql.exec('BEGIN');f.sql.exec(plan.sql);f.sql.exec('COMMIT');
    for(const table of Object.keys(plan.report.tables))assert.equal(f.sql.prepare('SELECT count(*) AS n FROM "'+table+'"').get().n,0,table);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM lyric_lines').get().n,lyrics);
    const result=f.sql.prepare("INSERT INTO users(email,username,password_hash) VALUES('qa0@local.test','QA0','new')").run();
    assert.ok(Number(result.lastInsertRowid)>plan.report.userSequence);
    assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
    f.sql.exec('CREATE TABLE unexpected(id INTEGER)');
    assert.throws(()=>accountResetPlan(f.sql),/unclassified tables/);
  }finally{f.sql.close();}
});
