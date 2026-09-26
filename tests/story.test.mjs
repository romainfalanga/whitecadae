import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHAPTERS,buildStory} from '../src/orange-story.js';
import {NODES} from '../src/echelon.js';
import worker from '../src/index.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const rows=n=>ids.slice(0,n).map(riddle_id=>({riddle_id,solved_at:'2026-09-26'}));

test('story begins at chapter 1 without changing scores; later revelations are server-filtered',()=>{
  for(let n=0;n<=ids.length;n++){
    const story=buildStory(rows(n),n?{username:'Player'}:null);
    assert.equal(story.score,n);assert.equal(story.level,Math.max(1,n));
    assert.deepEqual(story.chapters.map(c=>c.level),Array.from({length:Math.max(1,n)},(_,i)=>i+1));
    assert.ok(story.chapters.every(c=>c.access.every(i=>i.open&&i.href)));
    if(n<6)assert.doesNotMatch(JSON.stringify(story.chapters),/schizoaffectif|personnage créé par White Cadae|Apocalypse/i);
    if(n>=6)assert.match(story.chapters[5].text,/schizoaffectif/);
    if(n<16)assert.ok(!story.chapters.some(c=>c.level===16));
    assert.ok(!story.chapters.some(c=>c.level===26));
  }
});
test('chapters 16 and 26 remain explicitly undefined; author preview cannot change player progress',()=>{
  assert.deepEqual(CHAPTERS.filter(c=>c.apocalypse).map(c=>c.level),[6,16,26]);
  for(const level of [16,26]){const c=CHAPTERS.find(c=>c.level===level);assert.equal(c.title,'Révélation à définir');assert.equal(c.pending,true);}
  const author=buildStory([],{is_admin:true});assert.equal(author.chapters.length,26);assert.equal(author.score,0);assert.equal(author.author,true);
  assert.ok(CHAPTERS.every(c=>c.text&&c.title));
});
test('available music stays beside its true threshold; discovery access remains separate',()=>{
  for(const [level,slug]of [[5,'wanheda'],[6,'quand-je-vois-je-pense'],[7,'un-fil-entre-deux-infinis'],[10,'la-matiere-dense'],[12,'les-probabilites'],[14,'fais-mieux']]){
    assert.ok(buildStory(rows(level),{}).chapters.find(c=>c.level===level).access.some(i=>i.lyricsHref==='/chanson/'+slug));
    assert.ok(!buildStory(rows(level-1),{}).chapters.flatMap(c=>c.access).some(i=>i.lyricsHref==='/chanson/'+slug));
  }
  assert.equal(buildStory().discovery,null);
  assert.equal(buildStory([{riddle_id:'eg-03-1',solved_at:'now'}]).discovery.title,'Horloge');
});
test('public story route never needs database access or sends future chapter text',async()=>{
  const response=await worker.fetch(new Request('https://test.local/api/orange?level=26&admin=true'),{});
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const body=await response.json();assert.equal(body.chapters.length,1);assert.equal(body.author,false);
  assert.doesNotMatch(JSON.stringify(body),/schizoaffectif|deuxième apocalypse|troisième apocalypse/);
});
