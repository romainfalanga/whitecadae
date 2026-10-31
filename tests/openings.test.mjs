import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentAccess,buildOpenings,newlyOpened} from '../src/content-access.js';
import {NODES,gameLevel} from '../src/echelon.js';
import {buildJourney} from '../src/journey.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const rows=level=>ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'}));
const schedule=[[1,'music-30-vins-divins'],[2,'music-sans-indice-dans-les-des'],[4,'music-13h20'],[6,'music-orange'],[7,'page-gameMaster'],[12,'music-la-matiere-dense'],[18,'music-les-probabilites'],[25,'music-fais-mieux'],[30,'music-un-fil-entre-deux-infinis']];
test('songs and Game Master follow the revised unlock schedule for every existing score',()=>{
  assert.ok(ids.length>=29,'The game must allow reaching the final music threshold.');
  for(let level=1;level<=ids.length+1;level++){
    const result=buildOpenings(rows(level),{});
    const next=schedule.find(([n])=>n>level)?.[0]||null;
    assert.equal(result.nextLevel,next,'next at '+level);
    assert.deepEqual(result.items.filter(i=>i.open).map(i=>i.id),schedule.filter(([n])=>n<=level).map(([,id])=>id),'open at '+level);
    assert.ok(result.items.filter(i=>!i.open).every(i=>i.level===next&&!i.href&&!i.lyricsHref));
    assert.deepEqual(newlyOpened(rows(level),rows(level+1),{}).map(i=>i.id),schedule.filter(([n])=>n===level+1).map(([,id])=>id));
    assert.deepEqual(newlyOpened(rows(level),rows(level),{}),[]);
  }
});
test('author access never forges solved puzzles; retired spaces are disabled at every level',()=>{
  const author=buildJourney([],{is_admin:true});assert.ok(author.openings.items.filter(i=>i.id.startsWith('music-')).every(i=>i.open));assert.ok(author.openings.items.filter(i=>i.id.startsWith('page-')).every(i=>!i.open));
  assert.deepEqual(author.nodes,buildJourney([]).nodes);
  for(const user of [null,{}, {is_admin:true}])for(const level of [1,2,12,18,23,30]){
    const access=contentAccess(user,rows(level));
    for(const key of ['conversation','topics','videographie','mechanisms','lifeTree','aceSquare'])assert.equal(access[key],false);
    assert.equal(access.level,gameLevel(rows(level)));
  }
});

test('Orange presents the AA story through the surviving song only',async()=>{
  const {buildOrange}=await import('../src/orange-access.js');
  assert.ok(!buildOrange(rows(29),{}).openings.some(item=>item.id==='music-un-fil-entre-deux-infinis'));
  const story=buildOrange(rows(30),{}).openings;
  assert.ok(!story.some(item=>/wanheda|quand-je-vois/.test(item.id)));
  const item=story.find(item=>item.id==='music-un-fil-entre-deux-infinis');
  assert.match(item.paragraph,/AA/);assert.match(item.paragraph,/Un fil entre deux infinis/);assert.match(item.paragraph,/18 juillet 2019/);assert.doesNotMatch(item.paragraph,/Wanheda/);
});
