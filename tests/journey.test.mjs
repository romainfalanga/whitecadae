import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildJourney} from '../src/journey.js';
import {NODES,buildGameState} from '../src/echelon.js';
const rows=(...ids)=>ids.map(riddle_id=>({riddle_id,solved_at:'2026-09-25'}));

test('map shows only the current territory, unknown answers and final ceiling stay secret',()=>{
  const start=buildJourney();
  assert.deepEqual(start.nodes.map(n=>n.id),buildGameState().pages.map(n=>n.id));
  assert.doesNotMatch(JSON.stringify(start),/Andromédien|apôtres|Galaxie|Horloge|eg-15|eg-13|eg-16|33|25|Devincix/);
  assert.equal(start.summary.horizon,start.summary.remaining);
  assert.equal(start.summary.uncounted,true);
  assert.equal(start.nodes[0].total,null);
  const two=buildJourney(rows('eg-02-1','eg-01-1'));
  assert.ok(two.summary.horizon>start.summary.horizon);
  const mixture=two.nodes.find(n=>n.id==='eg-05');assert.equal(mixture.status,'locked');
  assert.equal(two.nodes.find(n=>n.id==='eg-02').status,'partial');
  assert.equal(two.nodes.find(n=>n.id==='eg-01').status,'solved');
  assert.equal(two.nodes.find(n=>n.id==='eg-03').status,'available');
  assert.deepEqual(two.edges.find(e=>e.to==='eg-05'),{from:'eg-02',to:'eg-05',type:'required',needed:2,found:1});
  assert.doesNotMatch(JSON.stringify(two),/VALD|Expansion|harmonieuse|12 apôtres|Horloge/);
  const fragment=buildJourney(rows('eg-02-1','eg-02-2','eg-05-1.p0'));
  assert.equal(fragment.nodes.find(n=>n.id==='eg-05').status,'partial');
});

test('level gates, dependencies and laboratory form a connected map without future nodes',()=>{
  const four=['n-0-1','n-0-3','eg-02-1','eg-02-2'];
  assert.ok(!buildJourney(rows(...four)).nodes.some(n=>n.id==='eg-15'));
  const five=buildJourney(rows(...four,'eg-01-1'));
  assert.equal(five.nodes.find(n=>n.id==='eg-15').status,'available');
  assert.doesNotMatch(JSON.stringify(five),/Andromédien/);
  const clock=buildJourney(rows('eg-01-1','eg-03-1'));
  assert.equal(clock.nodes.find(n=>n.id==='eg-10').status,'passage');
  assert.ok(clock.edges.some(e=>e.from==='eg-03'&&e.to==='eg-10'&&e.found===1));
  for(const id of ['eg-11','eg-12'])assert.ok(clock.edges.some(e=>e.from==='eg-10'&&e.to===id&&e.found===1));
  assert.ok(!clock.nodes.some(n=>n.id==='eg-13'));
  const expanded=buildJourney(rows('eg-03-1','@eg/share'));
  assert.equal(expanded.nodes.find(n=>n.id==='eg-13').status,'locked');
  const full=buildJourney(rows(...NODES.flatMap(n=>n.answers.map(a=>a.id))));
  for(const graph of [five,clock,expanded,full]){
    const ids=new Set(graph.nodes.map(n=>n.id));
    assert.ok(graph.edges.every(e=>ids.has(e.from)&&ids.has(e.to)));
    assert.equal(graph.summary.horizon,graph.echelon+graph.summary.remaining);
  }
  assert.equal(full.summary.remaining,0);assert.equal(full.summary.uncounted,false);
  assert.ok(full.nodes.every(n=>['solved','passage'].includes(n.status)));
});
