import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentAccess,buildOpenings,newlyOpened} from '../src/content-access.js';
import {NODES,gameLevel} from '../src/echelon.js';
import {buildJourney} from '../src/journey.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const rows=level=>ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'}));
const slugs=['30-vins-divins','sans-indice-dans-les-des','13h20','orange','la-matiere-dense','les-probabilites','fais-mieux','wanheda','quand-je-vois-je-pense','un-fil-entre-deux-infinis'];
test('each rung from 1 to 10 opens one song and only previews the next song',()=>{
  for(let level=1;level<=26;level++){
    const result=buildOpenings(rows(level),{});
    assert.equal(result.nextLevel,level<10?level+1:null);
    assert.deepEqual(result.items.filter(i=>i.open).map(i=>i.id),slugs.slice(0,level).map(s=>'music-'+s));
    assert.ok(result.items.every(i=>i.id.startsWith('music-')));
    assert.ok(result.items.filter(i=>!i.open).every(i=>i.level===level+1&&!i.href&&!i.lyricsHref));
    assert.deepEqual(newlyOpened(rows(level),rows(level+1),{}).map(i=>i.id),level<10?['music-'+slugs[level]]:[]);
    assert.deepEqual(newlyOpened(rows(level),rows(level),{}),[]);
  }
});
test('author access never forges solved puzzles; retired spaces are disabled at every level',()=>{
  const author=buildJourney([],{is_admin:true});assert.ok(author.openings.items.every(i=>i.open));
  assert.deepEqual(author.nodes,buildJourney([]).nodes);
  for(const user of [null,{}, {is_admin:true}])for(const level of [1,2,12,18,23,30]){
    const access=contentAccess(user,rows(level));
    for(const key of ['conversation','topics','videographie'])assert.equal(access[key],false);
    assert.equal(access.level,gameLevel(rows(level)));
  }
});
