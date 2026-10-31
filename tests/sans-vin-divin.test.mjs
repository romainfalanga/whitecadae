import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {initialDraft,evaluate,formatBlock} from '../public/workshop-core.js';
import {restoreFlow,chooseBlock,chooseOperation,transform,placeBlock} from '../public/workshop-flow.js';
import {boardSpec,validateConstruction,restoreDraft} from '../src/echelon-workshop.js';
import {NODES,gameLevel,buildGameState,progress,isPlayable} from '../src/echelon.js';
import {SCORE_VERSION,ensureRoadmapLevels} from '../src/roadmap-levels.js';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';

const spec=boardSpec('noZero');
const src=ref=>({op:'src',ref}),clean=ref=>({op:'stripZeros',arg:src(ref)});
const join=(left,right)=>({op:'join',left,right});
const twelve=join(clean('a'),clean('b')),other=join(clean('c'),clean('d'));
const answer=[{op:'add',left:twelve,right:{op:'reuse',arg:twelve}},other];
const final=answer=>({version:2,items:[],selected:[],answer});
const rows=ids=>ids.map(riddle_id=>({riddle_id,solved_at:'now'}));

test('the full user flow removes every zero, assembles 12 twice, duplicates, adds and places day/month',()=>{
  let flow=restoreFlow(initialDraft(spec));
  assert.deepEqual(flow.draft.items.map(x=>evaluate(x,spec.sources).value),[100,20,10,20]);
  assert.deepEqual(spec.slots.map(s=>s.label),['Jour','Mois']);
  assert.throws(()=>transform(chooseBlock(flow,0),spec,'reuse'),/zéros/);
  assert.throws(()=>transform(chooseBlock(flow,0),spec,'split'),/zéros/);
  assert.throws(()=>transform(chooseBlock(chooseOperation(chooseBlock(flow,0),'add'),1),spec),/zéros/);
  for(let i=0;i<4;i++)flow=transform(chooseBlock(flow,0),spec,'stripZeros');
  assert.deepEqual(flow.draft.items.map(x=>evaluate(x,spec.sources).value),[1,2,1,2]);
  const combine=(left,right,operator)=>transform(chooseBlock(chooseOperation(chooseBlock(flow,left),operator),right),spec);
  flow=combine(0,1,'join');flow=combine(0,1,'join');
  assert.deepEqual(flow.draft.items.map(x=>evaluate(x,spec.sources).value),[12,12]);
  flow=transform(chooseBlock(flow,0),spec,'reuse');
  flow=combine(1,2,'add');
  flow=placeBlock(flow,spec,0);flow=placeBlock(chooseBlock(flow,0),spec,1);
  assert.deepEqual(flow.draft.answer.map(x=>formatBlock(evaluate(x,spec.sources))),['24','12']);
  assert.ok(validateConstruction('noZero',flow.draft));
  assert.deepEqual(restoreDraft(flow.draft,'noZero'),flow.draft);
});

test('the new date rejects missing zeros steps, raw-number tricks, loose blocks and swapped slots',()=>{
  assert.ok(validateConstruction('noZero',final(answer)));
  assert.ok(!validateConstruction('noZero',final(answer.toReversed())));
  assert.ok(!validateConstruction('noZero',{...final(answer),items:[src('a')]}));
  assert.ok(!validateConstruction('noZero',final([{op:'constant',value:24},{op:'constant',value:12}])));
  assert.throws(()=>evaluate({op:'stripZeros',arg:src('a')},boardSpec('first').sources));
  assert.throws(()=>evaluate(join(src('a'),src('b')),spec.sources),/zéros/);
  assert.ok(!validateConstruction('noZero',final([{op:'add',left:src('a'),right:src('b')},other])));
  assert.ok(!validateConstruction('noZero',final([{op:'add',left:twelve,right:{op:'reuse',arg:twelve}},twelve])));
  // Removing zeros is confined to the new board; existing Horloge blocks stay intact.
  assert.deepEqual(initialDraft(boardSpec('first')).items,[src('a'),src('b')]);
});

test('all active signs remain reachable, the date opens with 13h20 and July has exactly its two clocks at 30',()=>{
  const found=[];
  for(let round=0;round<20;round++)for(const n of NODES)if(isPlayable(n,progress(rows(found))))for(const a of n.answers)if(!found.includes(a.id))found.push(a.id);
  assert.equal(found.length,32);assert.equal(gameLevel(rows(found)),33);
  const at=level=>buildGameState(rows(found.slice(0,level-1)));
  assert.ok(!at(3).pages.some(n=>n.id==='eg-22'));
  const lyric=at(4).pages.find(n=>n.id==='eg-22');assert.equal(lyric.href,'/sans-vin-divin');assert.equal(lyric.locked,false);
  assert.ok(!at(29).pages.some(n=>['eg-19','eg-21'].includes(n.id)));
  const july=at(30).pages.filter(n=>n.music==='un-fil-entre-deux-infinis');
  assert.deepEqual(july.map(n=>[n.title,n.subtitle]),[['18 juillet 2019','Un fil entre deux infinis'],['3:18','Un fil entre deux infinis']]);
  assert.ok(!NODES.some(n=>n.id==='eg-20'||n.music==='wanheda'||n.music==='quand-je-vois-je-pense'));
});

test('lyrics preserve their exact words and link only the requested 13h20 phrase with HTML escaped',()=>{
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const helper=source.slice(source.indexOf('function lyricLineMarkup('),source.indexOf('async function pageSong('));
  const context={esc:text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')};
  vm.createContext(context);vm.runInContext(helper,context);
  const text=readFileSync(new URL('../lyrics/13h20.txt',import.meta.url),'utf8').split('\n').find(line=>line.startsWith('J’ai dit sans'));
  assert.equal(context.lyricLineMarkup('13h20',text),'J’ai dit <a href="/sans-vin-divin" data-link>sans vin divin</a>,');
  assert.equal(context.lyricLineMarkup('sans-indice-dans-les-des',text),text);
  assert.equal(context.lyricLineMarkup('13h20','Les jours sans vin'),'Les jours sans vin');
  assert.match(context.lyricLineMarkup('13h20',"J'ai dit sans vin divin<script>"),/divin<\/a>&lt;script&gt;/);
});

test('the singular lyric migration preserves line IDs and unrelated text, and cannot overwrite a later edit',()=>{
  const migration=readFileSync(new URL('../migrations/0044_13h20_sans_vin_divin.sql',import.meta.url),'utf8');
  const db=new DatabaseSync(':memory:');try{
    db.exec("CREATE TABLE songs(id INTEGER PRIMARY KEY,slug TEXT);CREATE TABLE lyric_lines(id INTEGER PRIMARY KEY,song_id INTEGER,line_number INTEGER,text TEXT);INSERT INTO songs VALUES(1,'13h20'),(2,'other')");
    const put=db.prepare('INSERT INTO lyric_lines VALUES(?,?,?,?)');
    put.run(1644,1,50,'J’ai dit sans vins divins,');put.run(1645,1,51,'Le diable prendra sa retraite.');put.run(90,2,50,'J’ai dit sans vins divins,');
    const lines=()=>db.prepare('SELECT * FROM lyric_lines ORDER BY id').all().map(line=>({...line}));
    const before=lines();
    db.exec(migration);
    const after=lines();
    assert.deepEqual(after,before.map(line=>line.id===1644?{...line,text:'J’ai dit sans vin divin,'}:line));
    db.exec(migration);assert.deepEqual(lines(),after);
    db.prepare('UPDATE lyric_lines SET text=? WHERE id=1644').run('Une édition ultérieure');db.exec(migration);
    assert.equal(db.prepare('SELECT text FROM lyric_lines WHERE id=1644').get().text,'Une édition ultérieure');
  }finally{db.close();}
});

test('API gates the lyric board at 4 without Horloge, preserves drafts, shares the timer and grants one rung',async()=>{
  const f=fixture();try{
    const insert=id=>f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(4,?,?)').run(id,'now');
    f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=4').run();
    const call=async(path,body)=>{
      const response=await worker.fetch(new Request('https://test.local/api/signes'+path,{method:body?'POST':'GET',headers:{Cookie:'wc_session=qa3','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
      return {status:response.status,...await response.json()};
    };
    for(const id of ['eg-02-1','eg-01-1'])insert(id);
    assert.equal((await call('/draft/eg-22')).status,404);
    assert.equal((await call('/guess',{id:'eg-22',draft:final(answer)})).status,404);
    insert('eg-16-1');
    const game=await call('');assert.equal(game.echelon,4);assert.ok(!game.pages.some(n=>n.kind==='clock'));
    assert.doesNotMatch(JSON.stringify(game.pages.find(n=>n.id==='eg-22')),/24 décembre|24 \/ 12/);
    const opened=await call('/draft/eg-22');assert.equal(opened.status,200);assert.deepEqual(opened.spec,spec);
    assert.equal((await call('/draft/eg-22',{revision:0,draft:final(answer)})).revision,1);
    assert.deepEqual((await call('/draft/eg-22')).draft,final(answer));
    const won=await call('/guess',{id:'eg-22',draft:final(answer)});assert.equal(won.gained,1);assert.equal(won.state.echelon,5);
    assert.equal((await call('/guess',{id:'eg-02',answer:'Dieu'})).status,429);
    f.sql.exec('UPDATE echelon_attempts SET next_at=0');
    assert.equal((await call('/guess',{id:'eg-22',draft:final(answer)})).gained,0);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM riddle_progress WHERE user_id=4 AND riddle_id='eg-22-1'").get().n,1);
    assert.equal((await call('/draft/eg-20')).status,404);
  }finally{f.sql.close();}
});

test('existing accounts recalculate retired clock credit and cached leaderboard scores without deleting their history',async()=>{
  const f=fixture();try{
    await ensureRoadmapLevels(f.env);
    f.sql.prepare("INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(1,'eg-20-1','old')").run();
    f.sql.prepare('UPDATE roadmap_levels SET level=2,score_version=? WHERE user_id=1').run(SCORE_VERSION-1);
    await ensureRoadmapLevels(f.env);
    assert.equal(f.sql.prepare('SELECT level FROM roadmap_levels WHERE user_id=1').get().level,1);
    assert.equal(f.sql.prepare("SELECT solved_at FROM riddle_progress WHERE user_id=1 AND riddle_id='eg-20-1'").get().solved_at,'old');
    assert.equal(gameLevel(rows(['eg-20-1','eg-20-1.p0'])),1);
    assert.equal(gameLevel(rows(['eg-20-1','eg-22-1'])),2);
  }finally{f.sql.close();}
});
