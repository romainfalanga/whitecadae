import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOrange} from '../src/orange-access.js';
import {NODES} from '../src/echelon.js';
import worker from '../src/index.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const expected=[[1,'music-30-vins-divins'],[2,'conversation'],[3,'music-sans-indice-dans-les-des'],[4,'music-13h20'],[5,'music-orange'],[6,'music-la-matiere-dense'],[7,'music-les-probabilites'],[8,'music-fais-mieux'],[9,'music-wanheda'],[10,'music-quand-je-vois-je-pense'],[11,'music-un-fil-entre-deux-infinis'],[12,'conversation-topics'],[12,'conversation-project-1'],[12,'conversation-brainstorm'],[18,'conversation-topic-2'],[18,'conversation-project-2'],[23,'conversation-topic-3'],[23,'conversation-project-3']];
test('welcome shows earned discoveries in level order, without invented narrative or locked links',()=>{
  for(let level=1;level<=24;level++){
    const result=buildOrange(ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
    assert.deepEqual(result.openings.map(x=>[x.level,x.id]),expected.filter(([n])=>n<=level));
    assert.ok(result.openings.every(x=>x.open&&x.href));assert.equal(result.chapters,undefined);
  }
  assert.deepEqual(buildOrange().openings.map(x=>x.id),['music-30-vins-divins']);
  assert.deepEqual(buildOrange([],{is_admin:true}).openings.map(x=>[x.level,x.id]),expected.filter(([level])=>level<12));
});
test('public home API ignores forged level parameters',async()=>{
  const res=await worker.fetch(new Request('https://test.local/api/orange?level=26&admin=true'),{});
  assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.deepEqual((await res.json()).openings.map(x=>x.id),['music-30-vins-divins']);
});
