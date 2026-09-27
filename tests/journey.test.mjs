import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildJourney} from '../src/journey.js';
import {NODES,buildGameState} from '../src/echelon.js';
const rows=(...ids)=>ids.map(riddle_id=>({riddle_id,solved_at:'now'}));
test('map shows current song signs without exposing their answers',()=>{
  const start=buildJourney();
  assert.deepEqual(start.nodes.map(n=>n.id),buildGameState().pages.map(n=>n.id));
  assert.doesNotMatch(JSON.stringify(start),/Andromédien|apôtres|Galaxie|Horloge|Devincix|Katikas/);
  assert.equal(start.summary.horizon,1+start.summary.remaining);
  const third=buildJourney(rows('eg-02-1','eg-01-1'));
  assert.equal(third.nodes.find(n=>n.id==='eg-02').status,'partial');
  assert.equal(third.nodes.find(n=>n.id==='eg-01').status,'solved');
  assert.equal(third.nodes.find(n=>n.id==='eg-03').status,'available');
  assert.ok(!third.nodes.some(n=>n.id==='eg-05'));
  assert.doesNotMatch(JSON.stringify(third),/VALD|Horloge|12 apôtres/);
  const fragment=buildJourney(rows('eg-06-1.p0'));
  assert.equal(fragment.nodes.find(n=>n.id==='eg-06').status,'partial');
});
test('workshop dependencies connect only available songs and the discovered clock',()=>{
  const base=['eg-02-1','eg-02-2','eg-01-1'];
  assert.ok(!buildJourney(rows(...base)).nodes.some(n=>n.id==='eg-15'));
  const fifth=buildJourney(rows(...base,'n-h-2'));
  assert.equal(fifth.nodes.find(n=>n.id==='eg-15').status,'available');
  const clock=buildJourney(rows(...base,'eg-03-1'));
  assert.equal(clock.nodes.find(n=>n.id==='eg-10').status,'passage');
  assert.ok(clock.edges.some(e=>e.from==='eg-03'&&e.to==='eg-10'&&e.found===1));
  for(const id of ['eg-11','eg-12'])assert.ok(clock.edges.some(e=>e.from==='eg-10'&&e.to===id&&e.found===1));
  const expanded=buildJourney(rows(...base,'eg-03-1','@eg/share'));
  assert.equal(expanded.nodes.find(n=>n.id==='eg-13').status,'locked');
  const full=buildJourney(rows(...NODES.flatMap(n=>n.answers.map(a=>a.id))));
  for(const graph of [fifth,clock,expanded,full]){
    const visible=new Set(graph.nodes.map(n=>n.id));
    assert.ok(graph.edges.every(e=>visible.has(e.from)&&visible.has(e.to)));
    assert.equal(graph.summary.horizon,graph.echelon+graph.summary.remaining);
  }
  assert.equal(full.summary.remaining,0);
  assert.ok(full.nodes.every(n=>['solved','passage'].includes(n.status)));
});
