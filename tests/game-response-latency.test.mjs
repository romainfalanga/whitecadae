import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './community-fixture.mjs';
import {ensureGameTables,handleEchelon} from '../src/echelon-api.js';

test('confirmed guess reuses its canonical snapshot and reads the cooldown while discovery persistence is pending',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,8,30)});
  const f=fixture();t.after(()=>f.sql.close());await ensureGameTables(f.env);
  let releaseSeen,seenStarted,attemptRead,progressReads=0;
  const seenGate=new Promise(resolve=>releaseSeen=resolve),seenReady=new Promise(resolve=>seenStarted=resolve),attemptReady=new Promise(resolve=>attemptRead=resolve);
  const prepare=f.env.DB.prepare,batch=f.env.DB.batch;
  function wrap(statement,query,args=[]){return {...statement,query,args,
    bind(...values){return wrap(statement.bind(...values),query,values);},
    async all(){if(query.startsWith('SELECT riddle_id, solved_at'))progressReads++;return statement.all();},
    async first(){if(query.startsWith('SELECT next_at'))attemptRead();return statement.first();}
  };}
  f.env.DB.prepare=query=>wrap(prepare(query),query);
  f.env.DB.batch=async statements=>{
    if(statements.some(s=>s.args?.some(value=>typeof value==='string'&&value.startsWith('@eg/seen/')))){seenStarted();await seenGate;}
    return batch(statements);
  };
  let responded=false;
  const pending=handleEchelon(new Request('https://test.local/api/echelon/guess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'eg-02',answer:'Dieu'})}),f.env,'/api/echelon/guess',{
    getUser:async()=>({id:1}),json:data=>data
  }).then(result=>{responded=true;return result;});
  await seenReady;
  // Give the independent status read an opportunity to start. An old serial
  // implementation fails here instead of hanging until the test times out.
  await Promise.race([attemptReady,new Promise(resolve=>setImmediate(resolve))]);
  assert.equal(responded,false,'response still waits for durable discovery persistence');
  let read=false;attemptReady.then(()=>read=true);await Promise.resolve();
  try{assert.equal(read,true,'cooldown read overlaps the deferred seen write');}finally{t.mock.timers.tick(5000);releaseSeen();}
  const result=await pending;
  assert.equal(result.ok,true);assert.equal(result.gained,1);assert.equal(result.state.echelon,2);
  assert.equal(result.state.attenteMs,28000,'parallel reads retain the absolute server deadline despite a slow write');
  assert.equal(progressReads,2,'one initial authorization snapshot and one fresh post-write snapshot');
  assert.equal(f.sql.prepare("SELECT count(*) AS count FROM riddle_progress WHERE user_id=1 AND riddle_id='eg-02-1'").get().count,1);
  assert.ok(f.sql.prepare("SELECT count(*) AS count FROM riddle_progress WHERE user_id=1 AND riddle_id LIKE '@eg/seen/%'").get().count>0);
});
