import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {NODES} from '../src/echelon.js';
import {gameContinuation} from '../src/game-continuation.js';
import {fixture} from './community-fixture.mjs';

test('the Discord continuation begins at exactly 33 and remains available thereafter',()=>{
  for(let level=1;level<33;level++)assert.equal(gameContinuation(level),null);
  for(const level of [undefined,null,NaN,Infinity,'33',32.5])assert.equal(gameContinuation(level),null);
  const expected={level:33,label:'Rejoindre',href:'https://discord.gg/y83ewhS49'};
  assert.deepEqual(gameContinuation(33),expected);
  assert.deepEqual(gameContinuation(34),expected);
});

test('old and new accounts reach 33 through Anges, exactly once, without retired credits or early Discord access',async()=>{
  const f=fixture();
  try{
    const insert=f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)');
    const active=NODES.flatMap(n=>n.answers.map(a=>a.id)).filter(id=>id!=='eg-16-3');
    for(const id of active)insert.run(1,id,'now');
    for(const id of [...active,'eg-02-2','eg-02-2.p0','eg-03-3','eg-03-3.p0'])insert.run(3,id,'now');
    const request=(token,path,body)=>worker.fetch(new Request('https://test.local'+path,{method:body?'POST':'GET',headers:{Cookie:'wc_session='+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
    for(const token of ['qa0','qa2']){
      const state=await(await request(token,'/api/echelon?level=33')).json();
      assert.equal(state.echelon,32);assert.equal(state.continuation,null);
      assert.deepEqual(state.nodes.filter(n=>n.open).map(n=>n.id),['n-a']);
      const fiftySeven=state.nodes.find(n=>n.id==='n-a');
      assert.equal(fiftySeven.total,4);assert.deepEqual(fiftySeven.found.map(a=>a.label),['12','Signes','Expansions harmonieuses']);
      const home=await(await request(token,'/api/orange?level=33')).json();
      assert.equal(home.continuation,null);
      assert.doesNotMatch(JSON.stringify({state,home}),/discord|y83ewhS49|La suite t’attend/i);
      const me=await(await request(token,'/api/me')).json();
      assert.equal(me.gameEchelon,32);
      const win=await(await request(token,'/api/echelon/guess',{id:'n-a',answer:'anges'})).json();
      assert.equal(win.gained,1);assert.equal(win.state.echelon,33);
      assert.ok(win.state.nodes.every(n=>!n.open));
      assert.deepEqual(win.state.continuation,gameContinuation(33));
      f.sql.exec('UPDATE echelon_attempts SET next_at=0');
      const duplicate=await(await request(token,'/api/echelon/guess',{id:'n-a',answer:'ange'})).json();
      assert.equal(duplicate.gained,0);assert.equal(duplicate.state.echelon,33);
      for(const path of ['/api/echelon','/api/orange']){
        const reloaded=await(await request(token,path)).json();
        assert.deepEqual(reloaded.continuation,gameContinuation(33));
      }
    }
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM riddle_progress WHERE user_id=3 AND riddle_id IN ('eg-02-2','eg-02-2.p0','eg-03-3','eg-03-3.p0')").get().n,4);
    const admin=await(await request('qa99','/api/orange?admin=true&level=33')).json();
    assert.equal(admin.continuation,null);
    assert.equal((await(await request('invalid','/api/echelon?level=33')).json()).continuation,null);
  }finally{f.sql.close();}
});
