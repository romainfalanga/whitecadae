import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentAccess,buildOpenings,newlyOpened} from '../src/content-access.js';
import {NODES,gameLevel} from '../src/echelon.js';
import {buildJourney} from '../src/journey.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const rows=level=>ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'}));
const slugs=['30-vins-divins','sans-indice-dans-les-des','13h20','orange','la-matiere-dense','les-probabilites','fais-mieux','wanheda','quand-je-vois-je-pense','un-fil-entre-deux-infinis'];
test('songs and personal pages follow a single ordered unlock schedule',()=>{
  const pages=[[11,'page-gameMaster'],[12,'page-mechanisms'],[15,'page-lifeTree'],[18,'page-aceSquare']];
  for(let level=1;level<=26;level++){
    const result=buildOpenings(rows(level),{});
    const next=level<10?level+1:pages.find(([n])=>n>level)?.[0]||null;
    assert.equal(result.nextLevel,next);
    assert.deepEqual(result.items.filter(i=>i.open).map(i=>i.id),[...slugs.slice(0,level).map(s=>'music-'+s),...pages.filter(([n])=>n<=level).map(([,id])=>id)]);
    assert.ok(result.items.filter(i=>!i.open).every(i=>i.level===next&&!i.href&&!i.lyricsHref));
    assert.deepEqual(newlyOpened(rows(level),rows(level+1),{}).map(i=>i.id),level<10?['music-'+slugs[level]]:pages.filter(([n])=>n===level+1).map(([,id])=>id));
    assert.deepEqual(newlyOpened(rows(level),rows(level),{}),[]);
  }
});
test('author access never forges solved puzzles; retired spaces are disabled at every level',()=>{
  const author=buildJourney([],{is_admin:true});assert.ok(author.openings.items.filter(i=>i.id.startsWith('music-')).every(i=>i.open));assert.ok(author.openings.items.filter(i=>i.id.startsWith('page-')).every(i=>!i.open));
  assert.deepEqual(author.nodes,buildJourney([]).nodes);
  for(const user of [null,{}, {is_admin:true}])for(const level of [1,2,12,18,23,30]){
    const access=contentAccess(user,rows(level));
    for(const key of ['conversation','topics','videographie'])assert.equal(access[key],false);
    assert.equal(access.level,gameLevel(rows(level)));
  }
});
