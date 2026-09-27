import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentAccess,buildOpenings,newlyOpened} from '../src/content-access.js';
import {buildJourney} from '../src/journey.js';
import {NODES} from '../src/echelon.js';
import {NODES as OLD} from '../src/enigmas57.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const rows=level=>ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'}));
test('content map opens each track at its own threshold and only previews the next stage',()=>{
  for(const [level,count,next]of [[1,1,2],[2,1,3],[3,2,4],[4,3,5],[5,4,6],[6,6,7],[7,8,8],[8,10,9],[9,10,null],[25,10,null]]){
    const result=buildOpenings(rows(level),{username:'Test'});
    assert.equal(result.nextLevel,next);
    assert.equal(result.items.filter(i=>i.id.startsWith('music-')&&i.open).length,count);
    assert.equal(result.items.find(i=>i.id==='conversation').open,level>=2);
    assert.ok(result.items.every(i=>i.open||i.level===next));
    assert.ok(result.items.filter(i=>!i.open).every(i=>!i.href&&!i.lyricsHref));
    if(level>=8)assert.equal(result.items.find(i=>i.id==='videographie').open,level>=9);
  }
  const five=buildOpenings(rows(5),{});
  assert.ok(five.items.some(i=>i.title==='Orange'&&i.open));
  assert.ok(five.items.some(i=>i.title==='La matière dense'&&!i.open));
  assert.ok(!five.items.some(i=>i.title==='Les probabilités'));
});
test('author sees all stages but not an artificially solved puzzle map',()=>{
  const author=buildJourney([],{username:'Auteur',is_admin:true});
  assert.equal(author.openings.author,true);
  assert.deepEqual([...new Set(author.openings.items.map(i=>i.level))],[0,1,2,3,4,5,6,7,8,9]);
  assert.ok(author.openings.items.every(i=>i.open));
  assert.deepEqual(author.nodes,buildJourney([]).nodes);
  assert.deepEqual(author.summary,buildJourney([]).summary);
});
test('each gained rung announces just the new contents and repeating an answer announces nothing',()=>{
  const expected={2:['conversation'],3:['music-sans-indice-dans-les-des'],4:['music-13h20'],5:['music-orange'],6:['music-la-matiere-dense','music-wanheda'],7:['music-les-probabilites','music-quand-je-vois-je-pense'],8:['music-fais-mieux','music-un-fil-entre-deux-infinis'],9:['videographie']};
  for(let level=2;level<=10;level++)assert.deepEqual(newlyOpened(rows(level-1),rows(level),{}).map(i=>i.id),expected[level]||[]);
  assert.deepEqual(newlyOpened(rows(3),rows(3),{}),[]);
  assert.deepEqual(newlyOpened(rows(3),rows(4),{is_admin:true}),[]);
});
test('community permissions use level 1 as the starting point and preserve historical progress',()=>{
  const historical=OLD.flatMap(n=>n.answers.map(a=>({riddle_id:a.id,solved_at:'now'})));
  assert.ok(contentAccess({},historical).videographie);
  assert.equal(contentAccess(null).conversation,false);
  assert.equal(contentAccess({},rows(1)).conversation,false);
  assert.equal(contentAccess({},rows(2)).conversation,true);
  assert.equal(contentAccess({},rows(8)).videographie,false);
  assert.equal(contentAccess({},rows(9)).videographie,true);
});
