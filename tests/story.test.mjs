import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOrange} from '../src/orange-access.js';
import {NODES} from '../src/echelon.js';
import worker from '../src/index.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const expected=['conversation','music-la-matiere-dense','music-les-probabilites','music-fais-mieux','music-wanheda','music-quand-je-vois-je-pense','music-un-fil-entre-deux-infinis','videographie'];
test('home reveals only earned links in the requested order, with no invented narrative',()=>{
  for(let n=0;n<=ids.length;n++){
    const result=buildOrange(ids.slice(0,n).map(riddle_id=>({riddle_id,solved_at:'now'})),{id:1});
    assert.deepEqual(result.openings.map(x=>x.id),expected.slice(0,Math.max(0,n-1)));
    assert.ok(result.openings.every(x=>x.level<=n&&x.open&&x.href));assert.equal(result.chapters,undefined);
  }
  assert.deepEqual(buildOrange().openings,[]);
  assert.deepEqual(buildOrange([],{is_admin:true}).openings.map(x=>x.id),expected);
});
test('public home API ignores forged level parameters without needing a database',async()=>{
  const res=await worker.fetch(new Request('https://test.local/api/orange?level=26&admin=true'),{});
  assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');assert.deepEqual(await res.json(),{openings:[]});
});
