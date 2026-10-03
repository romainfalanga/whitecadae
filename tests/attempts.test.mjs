import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';
import {NODES,gameLevel,progress} from '../src/echelon.js';
import {matchNode} from '../src/enigmas57.js';
import {ensureRoadmapLevels,SCORE_VERSION} from '../src/roadmap-levels.js';

function setup(t){
  const f=fixture();t.after(()=>f.sql.close());
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,8,30)});
  const call=async(path,body,token='qa0')=>{
    const res=await worker.fetch(new Request('https://test.local'+path,{method:body?'POST':'GET',headers:{Cookie:'wc_session='+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
    return {status:res.status,...await res.json()};
  };
  return {...f,call};
}

test('every admitted guess starts exactly 33 seconds, including mistakes, parts, successes and duplicates',async t=>{
  const {call,sql}=setup(t);
  assert.equal((await call('/api/signes/attempt')).attenteMs,0);
  const cases=[
    [{id:'eg-02',answer:'wrong'},false,0],
    [{id:'n-h',answer:'dix'},true,0],
    [{id:'n-h',answer:'cornes'},true,1],
    [{id:'eg-02',answer:'Dieu'},true,1],
    [{id:'eg-02',answer:'Dieu'},true,0],
  ];
  for(const [body,ok,gained] of cases){
    const result=await call('/api/signes/guess',body);
    assert.equal(result.status,200);assert.equal(result.ok,ok);assert.equal(result.gained,gained);
    assert.equal(result.state.attenteMs,33000);
    const deadline=sql.prepare('SELECT next_at FROM echelon_attempts WHERE user_id=1').get().next_at;
    assert.equal(deadline,Date.now()+33000);
    for(const path of ['/api/signes','/api/echelon','/api/57','/api/signes/attempt'])assert.equal((await call(path)).attenteMs,33000);
    t.mock.timers.tick(32999);
    for(const path of ['/api/signes/guess','/api/echelon/guess','/api/57/guess']){
      const blocked=await call(path,{id:'eg-01',answer:'signe'});
      assert.equal(blocked.status,429);assert.equal(blocked.attenteMs,1);
    }
    assert.equal(sql.prepare('SELECT next_at FROM echelon_attempts WHERE user_id=1').get().next_at,deadline);
    t.mock.timers.tick(1);
    assert.equal((await call('/api/signes/attempt')).attenteMs,0);
  }
});

test('atomic claims admit one of two simultaneous tabs and keep other accounts independent',async t=>{
  const {call}=setup(t);
  const results=await Promise.all([call('/api/signes/guess',{id:'eg-02',answer:'Dieu'}),call('/api/echelon/guess',{id:'eg-01',answer:'Signe'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
  assert.equal((await call('/api/signes')).echelon,2);
  assert.equal((await call('/api/signes/guess',{id:'eg-02',answer:'Dieu'},'qa2')).status,200);
});

test('Horloge and Signes share a deadline, without deleting the saved construction',async t=>{
  const {call,sql}=setup(t),token='qa8';
  sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(9,'eg-03-1','now');
  const draft={version:2,items:[],selected:[],answer:[{op:'add',left:{op:'src',ref:'a'},right:{op:'src',ref:'b'}}]};
  assert.equal((await call('/api/signes/draft/eg-20',{revision:0,draft},token)).status,200);
  const wrong=await call('/api/signes/guess',{id:'n-0',answer:'Katikas'},token);
  assert.equal(wrong.ok,false);assert.equal(wrong.state.attenteMs,33000);
  assert.equal((await call('/api/signes/guess',{id:'eg-20',draft},token)).status,429);
  assert.deepEqual((await call('/api/signes/draft/eg-20',null,token)).draft,draft);
  t.mock.timers.tick(33000);
  const correct=await call('/api/signes/guess',{id:'eg-20',draft},token);
  assert.equal(correct.gained,1);assert.equal(correct.state.attenteMs,33000);
  assert.equal((await call('/api/signes/guess',{id:'n-0',answer:'Devincix'},token)).status,429);
  t.mock.timers.tick(33000);
  assert.equal((await call('/api/signes/guess',{id:'n-0',answer:'Devincix'},token)).gained,1);
});

test('empty, anonymous and unavailable guesses do not start an attempt',async t=>{
  const {call}=setup(t);
  for(const [body,status] of [[{id:'eg-02',answer:''},400],[{id:'n-0',answer:'Devincix'},404]])assert.equal((await call('/api/signes/guess',body)).status,status);
  assert.equal((await call('/api/signes/guess',{id:'eg-02',answer:'Dieu'},'invalid')).status,401);
  assert.equal((await call('/api/signes/attempt')).attenteMs,0);
});

test('Expansions harmonieuses grants its own 57 credit; Katikas history stays retired, including in the roadmap',async t=>{
  const {sql,env}=setup(t),rows=ids=>ids.map(riddle_id=>({riddle_id,solved_at:'now'}));
  const fiftySeven=NODES.find(n=>n.id==='n-a');
  const previous=progress(rows(['eg-05-1','n-0-3','n-0-3.p0']));
  assert.equal(previous.solved.size,1);assert.equal(previous.retired.size,1);
  const result=matchNode(fiftySeven,'EXPANSIONS HARMONIEUSES',previous.solved,previous.parts);
  assert.ok(result.prises.some(a=>a.id==='eg-16-4'&&a.complet));
  assert.equal(gameLevel(rows(['eg-05-1','eg-16-4','n-0-3'])),3);
  sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(1,'n-0-3','now');
  await ensureRoadmapLevels(env);
  sql.prepare('UPDATE roadmap_levels SET level=2,score_version=? WHERE user_id=1').run(SCORE_VERSION-1);
  await ensureRoadmapLevels(env);
  assert.equal(sql.prepare('SELECT level FROM roadmap_levels WHERE user_id=1').get().level,1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM riddle_progress WHERE user_id=1 AND riddle_id='n-0-3'").get().n,1);
});
