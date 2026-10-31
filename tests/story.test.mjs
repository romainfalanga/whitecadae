import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOrange} from '../src/orange-access.js';
import {NODES} from '../src/echelon.js';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const expected=[[1,'music-30-vins-divins'],[2,'music-sans-indice-dans-les-des'],[4,'music-13h20'],[6,'music-orange'],[7,'page-gameMaster'],[12,'music-la-matiere-dense'],[18,'music-les-probabilites'],[25,'music-fais-mieux'],[30,'music-un-fil-entre-deux-infinis']];
test('welcome shows earned discoveries in level order, without invented narrative or locked links',()=>{
  for(let level=1;level<=33;level++){
    const result=buildOrange(ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
    assert.deepEqual(result.openings.map(x=>[x.level,x.id]),expected.filter(([n])=>n<=level));
    assert.ok(result.openings.every(x=>x.open&&x.href));assert.equal(result.chapters,undefined);
  }
  assert.deepEqual(buildOrange().openings.map(x=>x.id),['music-30-vins-divins']);
  assert.deepEqual(buildOrange([],{is_admin:true}).openings.map(x=>[x.level,x.id]),expected.filter(([,id])=>id.startsWith('music-')));
});
test('public home API ignores forged level parameters',async()=>{
  const res=await worker.fetch(new Request('https://test.local/api/orange?level=26&admin=true'),{});
  assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.deepEqual((await res.json()).openings.map(x=>x.id),['music-30-vins-divins']);
});

test('the AA story accompanies Un fil entre deux infinis only once it unlocks at echelon 30',()=>{
  const before=buildOrange(ids.slice(0,28).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
  const after=buildOrange(ids.slice(0,29).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
  assert.ok(before.openings.every(item=>!item.paragraph));
  const stories=after.openings.filter(item=>item.paragraph);
  assert.equal(stories.length,1);assert.equal(stories[0].id,'music-un-fil-entre-deux-infinis');assert.equal(stories[0].level,30);
  assert.match(stories[0].paragraph,/s’appelait AA/);
  assert.match(stories[0].paragraph,/18 juillet 2019/);
});

test('Game Master API and session access switch together between echelon 6 and 7',async()=>{
  const f=fixture();
  try{
    const call=(path,level)=>worker.fetch(new Request('https://test.local'+path,{headers:{Cookie:'wc_session=qa'+level}}),f.env);
    for(const level of [6,7]){
      const response=await call('/api/game-master-orange',level);
      assert.equal(response.status,level===6?403:200,'Game Master API at '+level);
      const session=await(await call('/api/me',level)).json();
      assert.equal(session.access.gameMaster,level>=7,'Navigation access at '+level);
    }
  }finally{f.sql.close();}
});
