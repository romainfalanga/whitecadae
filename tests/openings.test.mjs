import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentAccess,buildOpenings,newlyOpened} from '../src/content-access.js';
import {buildJourney} from '../src/journey.js';
import {NODES} from '../src/echelon.js';
import {NODES as OLD} from '../src/enigmas57.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const rows=n=>ids.slice(0,n).map(riddle_id=>({riddle_id,solved_at:'now'}));

test('content map progressively shows actual openings plus the next stage',()=>{
  const start=buildOpenings(rows(0),{username:'Test'});
  assert.equal(start.nextLevel,2);assert.equal(start.items.find(i=>i.id==='conversation').open,false);
  assert.doesNotMatch(JSON.stringify(start),/Wanheda|juillet|Vidéographie/);
  for(const [score,openMusic,next]of [[2,0,5],[4,0,5],[5,1,6],[6,2,7],[7,3,9],[8,3,9],[9,3,10],[10,4,12],[11,4,12],[12,5,14],[13,5,14],[14,6,null]]){
    const openings=buildOpenings(rows(score),{username:'Test'});
    assert.equal(openings.nextLevel,next);
    assert.equal(openings.items.filter(i=>i.id.startsWith('music-')&&i.id!=='music-57'&&i.open).length,openMusic);
    assert.equal(openings.items.find(i=>i.id==='conversation').open,true);
    assert.ok(openings.items.every(i=>i.open||i.level===next));
    assert.ok(openings.items.filter(i=>!i.open).every(i=>!i.href&&!i.lyricsHref));
    if(score>=7)assert.equal(openings.items.find(i=>i.id==='videographie').open,score>=9);
    assert.ok(openings.items.every(i=>i.href!=='/aa'));
  }
  const level5=buildOpenings(rows(5),{});
  assert.ok(level5.items.some(i=>i.title==='Wanheda'&&i.open));
  assert.ok(level5.items.some(i=>i.title==='Quand je vois je pense'&&!i.open));
  assert.ok(!level5.items.some(i=>i.title==='Un fil entre deux infinis'));
});

test('author sees all content stages; player puzzle horizon stays independent',()=>{
  const author=buildJourney([],{username:'Auteur',is_admin:true});
  assert.equal(author.openings.author,true);
  assert.deepEqual([...new Set(author.openings.items.map(i=>i.level))],[0,2,5,6,7,9,10,12,14]);
  assert.ok(author.openings.items.every(i=>i.open));
  assert.deepEqual(author.nodes.map(n=>n.id),buildJourney([]).nodes.map(n=>n.id));
  assert.deepEqual(author.summary,buildJourney([]).summary);
});

test('gaining rungs announces only newly accessible contents and never future or repeated ones',()=>{
  assert.deepEqual(newlyOpened([{riddle_id:'eg-01-1',solved_at:'now'}],[{riddle_id:'eg-01-1',solved_at:'now'},{riddle_id:'eg-02-1',solved_at:'now'}],{}).map(i=>i.id),['conversation']);
  assert.deepEqual(newlyOpened(rows(9),rows(10),{}).map(i=>i.id),['music-la-matiere-dense']);
  assert.deepEqual(newlyOpened(rows(10),rows(11),{}),[]);
  assert.deepEqual(newlyOpened(rows(11),rows(14),{}).map(i=>i.id),['music-les-probabilites','music-fais-mieux']);
  assert.deepEqual(newlyOpened(rows(12),rows(12),{}),[]);
  assert.deepEqual(newlyOpened(rows(9),rows(10),{is_admin:true}),[]);
});

test('historical and author permissions are reflected without inventing a new score',()=>{
  const historical=OLD.flatMap(n=>n.answers.map(a=>({riddle_id:a.id,solved_at:'now'})));
  const access=contentAccess({},historical);assert.ok(access.videographie);assert.ok(access.conversation);
  const openings=buildOpenings(historical,{});
  assert.equal(openings.items.find(i=>i.id==='videographie').open,access.videographie);
  assert.equal(contentAccess(null).conversation,false);
  assert.equal(contentAccess(null).videographie,false);
  assert.equal(contentAccess({},rows(8)).videographie,false);
  assert.equal(contentAccess({},rows(9)).videographie,true);
});
