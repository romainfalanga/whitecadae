import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';
import {NODES,buildGameState,gameLevel,progress} from '../src/echelon.js';

test('the Instagram riddle is server-gated at echelon 8, independently of Horloge',async()=>{
  const f=fixture();
  try{
    const call=(level,path,body)=>worker.fetch(new Request('https://test.local/api/echelon'+path,{method:body?'POST':'GET',headers:{Cookie:'wc_session=qa'+level,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
    const before=await(await call(7,'')).json();
    assert.equal(before.echelon,7);assert.doesNotMatch(JSON.stringify(before),/Instagram|Devincix|Katikas|Katikias/);
    assert.equal((await call(7,'/guess',{id:'n-0',answer:'Devincix'})).status,404);
    const available=await(await call(8,'')).json();
    assert.equal(available.echelon,8);assert.ok(!available.pages.some(p=>p.kind==='clock'));
    const puzzle=available.nodes.find(n=>n.id==='n-0');
    assert.equal(puzzle.title,'En collant nos deux noms sur Instagram, tu en trouveras un troisième et celui d’un endroit.');
    assert.equal(puzzle.music,'wanheda');assert.equal(puzzle.locked,false);assert.equal(puzzle.total,2);
    assert.deepEqual(puzzle.found,[]);assert.doesNotMatch(JSON.stringify(puzzle),/Devincix|Katikas|Katikias/);
    const first=await(await call(8,'/guess',{id:'n-0',answer:'Devincix'})).json();
    assert.equal(first.gained,1);assert.equal(first.state.echelon,9);
    const duplicate=await(await call(8,'/guess',{id:'n-0',answer:'DEVINCIX'})).json();assert.equal(duplicate.gained,0);
    const second=await(await call(8,'/guess',{id:'n-0',answer:'katikias'})).json();
    assert.equal(second.gained,1);assert.equal(second.state.echelon,10);
    assert.deepEqual(second.state.nodes.find(n=>n.id==='n-0').found.map(a=>a.label),['Devincix','Katikas']);
    assert.equal((await(await call(8,'/guess',{id:'n-0',answer:'katikas'})).json()).gained,0);
  }finally{f.sql.close();}
});

test('old Instagram answers migrate to the visible riddle without counting twice or revealing it early',()=>{
  const rows=ids=>ids.map(riddle_id=>({riddle_id,solved_at:'now'}));
  const old=rows(['n-0-1','n-0-1.p0','n-0-3','n-0-3.p0']);
  assert.equal(gameLevel(old),3);
  assert.equal(progress(old).retired.size,0);
  assert.ok(!buildGameState(old).nodes.some(n=>n.id==='n-0'));
  const history=[...old,...rows(NODES.filter(n=>n.min===1).flatMap(n=>n.answers.map(a=>a.id)).slice(0,5))];
  const state=buildGameState(history),puzzle=state.nodes.find(n=>n.id==='n-0');
  assert.equal(state.echelon,8);assert.equal(puzzle.open,false);
  assert.deepEqual(puzzle.found.map(a=>a.label),['Devincix','Katikas']);
});
