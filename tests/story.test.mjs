import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOrange} from '../src/orange-access.js';
import {NODES} from '../src/echelon.js';
import worker from '../src/index.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const expected=['30-vins-divins','sans-indice-dans-les-des','13h20','orange','la-matiere-dense','les-probabilites','fais-mieux','wanheda','quand-je-vois-je-pense','un-fil-entre-deux-infinis'].map((slug,i)=>[i+1,'music-'+slug]);
test('welcome shows earned discoveries in level order, without invented narrative or locked links',()=>{
  for(let level=1;level<=24;level++){
    const result=buildOrange(ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
    assert.deepEqual(result.openings.map(x=>[x.level,x.id]),[...expected,[11,'page-gameMaster'],[12,'page-mechanisms'],[15,'page-lifeTree'],[18,'page-aceSquare']].filter(([n])=>n<=level));
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

test('the AA story accompanies Wanheda only once it unlocks at echelon 8',()=>{
  const before=buildOrange(ids.slice(0,6).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
  const after=buildOrange(ids.slice(0,7).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
  assert.ok(before.openings.every(item=>!item.paragraph));
  const stories=after.openings.filter(item=>item.paragraph);
  assert.equal(stories.length,1);assert.equal(stories[0].id,'music-wanheda');assert.equal(stories[0].level,8);
  assert.match(stories[0].paragraph,/Vulpis s’appelait AA/);
  assert.match(stories[0].paragraph,/18 juillet 2019/);
});
