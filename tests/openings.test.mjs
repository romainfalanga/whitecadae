import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentAccess,buildOpenings,newlyOpened} from '../src/content-access.js';
import {buildJourney} from '../src/journey.js';
import {NODES} from '../src/echelon.js';
import {NODES as OLD} from '../src/enigmas57.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const rows=level=>ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'}));
test('content map opens each track at its own threshold and only previews the next stage',()=>{
  for(const [level,count,next]of [[1,1,2],[2,1,3],[3,2,4],[4,3,5],[5,4,6],[6,5,7],[7,6,8],[8,7,9],[9,8,10],[10,9,11],[11,10,12],[12,10,18],[17,10,18],[18,10,23],[22,10,23],[23,10,null],[25,10,null]]){
    const result=buildOpenings(rows(level),{username:'Test'});
    assert.equal(result.nextLevel,next);
    assert.equal(result.items.filter(i=>i.id.startsWith('music-')&&i.open).length,count);
    assert.equal(result.items.find(i=>i.id==='conversation').open,level>=2);
    assert.ok(result.items.every(i=>i.open||i.level===next));
    assert.ok(result.items.filter(i=>!i.open).every(i=>!i.href&&!i.lyricsHref));
    assert.ok(!result.items.some(i=>i.id==='videographie'));
    if(level>=11)assert.equal(result.items.find(i=>i.id==='conversation-topics').open,level>=12);
  }
  const five=buildOpenings(rows(5),{});
  assert.ok(five.items.some(i=>i.title==='Orange'&&i.open));
  assert.ok(five.items.some(i=>i.title==='La matière danse'&&!i.open));
  assert.ok(!five.items.some(i=>i.title==='Les probabilités'));
});
test('author sees all stages but not an artificially solved puzzle map',()=>{
  const author=buildJourney([],{username:'Auteur',is_admin:true});
  assert.equal(author.openings.author,true);
  assert.deepEqual([...new Set(author.openings.items.map(i=>i.level))],[0,1,2,3,4,5,6,7,8,9,10,11,12,18,23]);
  assert.ok(author.openings.items.filter(i=>i.level<12).every(i=>i.open));
  assert.ok(author.openings.items.filter(i=>i.level>=12).every(i=>!i.open));
  assert.deepEqual(author.nodes,buildJourney([]).nodes);
  assert.deepEqual(author.summary,buildJourney([]).summary);
});
test('each gained rung announces just the new contents and repeating an answer announces nothing',()=>{
  const expected={2:['conversation'],3:['music-sans-indice-dans-les-des'],4:['music-13h20'],5:['music-orange'],6:['music-la-matiere-dense'],7:['music-les-probabilites'],8:['music-fais-mieux'],9:['music-wanheda'],10:['music-quand-je-vois-je-pense'],11:['music-un-fil-entre-deux-infinis'],12:['conversation-topics'],18:['conversation-topic-2'],23:['conversation-topic-3']};
  for(let level=2;level<=24;level++)assert.deepEqual(newlyOpened(rows(level-1),rows(level),{}).map(i=>i.id),expected[level]||[]);
  assert.deepEqual(newlyOpened(rows(3),rows(3),{}),[]);
  assert.deepEqual(newlyOpened(rows(3),rows(4),{is_admin:true}),[]);
});
test('community permissions use level 1 as the starting point and preserve historical progress',()=>{
  const historical=OLD.flatMap(n=>n.answers.map(a=>({riddle_id:a.id,solved_at:'now'})));
  assert.ok(contentAccess({},historical).videographie);
  assert.equal(contentAccess(null).conversation,false);
  assert.equal(contentAccess({},rows(1)).conversation,false);
  assert.equal(contentAccess({},rows(2)).conversation,true);
  assert.equal(contentAccess({},rows(11)).videographie,false);
  assert.equal(contentAccess({},rows(12)).videographie,true);
});
