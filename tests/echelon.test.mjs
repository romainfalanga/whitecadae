import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {NODES,SHARE,progress,buildGameState,gameLevel,accessLevel,gameProfile,isPlayable} from '../src/echelon.js';
import {NODES as OLD,echelonOf,progresOf,matchNode} from '../src/enigmas57.js';
import {evaluate,validDraft,hasTwoSevens,validateConstruction} from '../src/echelon-workshop.js';
import {handleEchelon,ensureGameTables} from '../src/echelon-api.js';
import worker from '../src/index.js';
const rows=(...ids)=>ids.map(riddle_id=>({riddle_id,solved_at:'2026-09-24'}));
const src=ref=>({op:'src',ref});
const part=(ref,index)=>({op:'part',ref,index});
const op=(op,left,right)=>({op,left,right});
const share=arg=>({op:'reuse',arg});
const sevens=[op('add',src('a'),part('d',0)),op('add',part('d',1),src('c'))];
const pair=[op('add',sevens[0],src('b')),op('add',share(src('b')),sevens[1])];
const orange=[op('join',op('add',src('a'),part('b',0)),op('sub',part('b',1),share(src('a'))))];
const draft=items=>({version:1,items,selected:[]});

test('one completed answer is one rung; old duplicates merge, retired history preserves access',()=>{
  assert.equal(gameLevel(rows()),0);
  assert.equal(gameLevel(rows('eg-02-1','eg-02-2','eg-02-1.p0')),2);
  assert.equal(gameLevel(rows('eg-06-1.p0')),0);
  assert.equal(gameLevel(rows('eg-06-1.p0','eg-06-1.p1')),1);
  assert.equal(gameLevel(rows('n-a-2','n-k-2','n-b-1','eg-01-1')),2);
  assert.equal(gameLevel(rows('eg-07-1')),1);
  assert.ok(!progress(rows('eg-07-1')).solved.has('eg-01-1'));
  assert.ok(progress(rows('n-b-1')).solved.has('eg-07-1'));
  assert.equal(gameLevel(rows('n-e-1','n-f-1',SHARE)),0);
  const history=rows(...OLD.flatMap(n=>n.answers.map(a=>a.id)));
  assert.ok(accessLevel(history)>=echelonOf(progresOf(history.map(r=>r.riddle_id)).solved));
  assert.equal(progress(rows('n-a-2.p0')).solved.has('eg-01-1'),true);
});

test('initial territory omits future pages and answers; visibility differs from playability',()=>{
  const start=buildGameState([]);
  assert.deepEqual(start.nodes.map(n=>n.id),['n-0','eg-01','eg-02','n-g']);
  assert.equal(start.nodes[0].title,'');
  assert.equal(start.nodes[0].locked,false);
  assert.equal(start.nodes[0].total,null);
  assert.equal(start.nodes[0].visual,null);
  assert.doesNotMatch(JSON.stringify(start),/Devincix|Katikas|Katikias|La porte/);
  assert.doesNotMatch(JSON.stringify(start),/Horloge|2031|Jésus|Dieu|VALD|33|eg-13|eg-10/);
  const after=buildGameState(rows('eg-02-1'));
  assert.equal(after.nodes.find(n=>n.id==='eg-05').locked,true);
  assert.equal(after.nodes.find(n=>n.id==='n-c').locked,true);
  assert.equal(buildGameState(rows('eg-02-1','eg-02-2')).nodes.find(n=>n.id==='eg-05').locked,false);
  const seen=buildGameState(rows('@eg/seen/eg-05'));
  assert.equal(seen.nodes.find(n=>n.id==='eg-05').locked,true);
  assert.equal(gameProfile(rows('eg-13-1','eg-02-2'),[]).enigmes.length,1);
});

test('Horloge alone opens the workshop; details alone does not; Orange has two stages',()=>{
  const horloge=buildGameState(rows('eg-01-1','eg-03-1'));
  assert.ok(horloge.pages.some(n=>n.id==='eg-10'));
  assert.equal(horloge.nodes.find(n=>n.id==='eg-11').locked,false);
  assert.equal(horloge.nodes.find(n=>n.id==='eg-12').locked,false);
  assert.ok(!horloge.pages.some(n=>n.id==='eg-13'));
  assert.ok(!buildGameState(rows('eg-01-1','eg-03-2')).pages.some(n=>n.id==='eg-10'));
  assert.equal(buildGameState(rows('eg-03-1',SHARE)).nodes.find(n=>n.id==='eg-13').locked,true);
  assert.equal(buildGameState(rows('eg-03-1','eg-12-1')).nodes.find(n=>n.id==='eg-13').locked,false);
});

test('every authored answer is reachable without relying on removed puzzles',()=>{
  const found=[];
  for(let round=0;round<20;round++)for(const n of NODES){
    if(isPlayable(n,progress(rows(...found))))for(const a of n.answers)if(!found.includes(a.id))found.push(a.id);
  }
  assert.equal(found.length,22);
  const state=buildGameState(rows(...found));
  assert.deepEqual([...new Set(state.pages.map(p=>p.href.split('#')[0]))].sort(),['/echelon','/echelon/horloge']);
  assert.ok(state.pages.every(p=>['riddle','workshop','clock'].includes(p.kind)));
  assert.ok(state.pages.every(p=>!('group' in p)&&!('quotes' in p)&&!('related' in p)));
  assert.deepEqual(state.nodes.filter(p=>p.visual).map(p=>p.id),['eg-06']);
  assert.doesNotMatch(JSON.stringify(state),/fourmilière|Goutte|Fini \/ infini|Angles \/ anges|Enfer \/ paradis|Observer|Transformer/);
  assert.ok(!state.pages.some(p=>p.id==='n-f'));
});

test('M=M and named answers accept accents, equal signs and partial discovery',()=>{
  const n=NODES.find(n=>n.id==='eg-06');
  assert.ok(matchNode(n,'mécanisme = matière',new Set()).prises.some(p=>p.id==='eg-06-1'&&p.complet));
  assert.ok(matchNode(n,'méta-moi = moi',new Set()).prises.some(p=>p.id==='eg-06-2'&&p.complet));
  assert.ok(matchNode(n,'mecanisme',new Set()).prises.some(p=>!p.complet));
  assert.ok(matchNode(NODES.find(n=>n.id==='eg-05'),'expansion harmonieuse',new Set()).prises[0].complet);
  const needle=NODES.find(n=>n.id==='eg-03');
  assert.equal(needle.answers[1].label,'Détails');
  assert.ok(matchNode(needle,'details',new Set()).prises[0].complet);
  assert.equal(buildGameState(rows('eg-03-2')).nodes.find(n=>n.id==='eg-03').found[0].label,'Détails');
  const door=NODES.find(n=>n.id==='n-0');
  for(const word of ['devincix','Katikas'])assert.ok(matchNode(door,word,new Set()).prises[0].complet);
});

test('the two numeric formulas independently accept the same date and preserve earned rungs',()=>{
  for(const id of ['n-c','eg-14']){
    const n=NODES.find(n=>n.id===id);assert.equal(n.answers.length,1);
    for(const text of ['25 décembre','25/12'])assert.ok(matchNode(n,text,new Set()).prises[0].complet);
    assert.ok(!matchNode(n,'Jésus',new Set())?.prises?.length);
  }
  assert.equal(gameLevel(rows('n-c-1')),1);
  assert.equal(gameLevel(rows('n-c-1','eg-14-1')),2);
  assert.equal(gameLevel(rows('n-c-1','eg-04-1')),2);
  assert.equal(gameLevel(rows('eg-04-1.p0','eg-04-1','eg-14-1')),1);
  assert.ok(!progress(rows('n-c-1')).solved.has('eg-14-1'));
});

test('duration construction validates origin, operations and controlled sharing',()=>{
  assert.ok(validateConstruction('first',[src('b'),src('a')],false));
  assert.ok(hasTwoSevens([...sevens,src('b')]));
  assert.ok(!hasTwoSevens([sevens[0],sevens[0]]));
  assert.ok(validateConstruction('pair',pair,true));
  assert.ok(!validateConstruction('pair',pair,false));
  const swapped=[op('add',src('b'),op('add',part('d',1),src('a'))),op('add',op('add',src('c'),part('d',0)),share(src('b')))];
  assert.ok(validateConstruction('pair',swapped,true));
  assert.ok(!validateConstruction('pair',[pair[0],pair[0]],true));
  assert.ok(!validateConstruction('pair',[...pair,share(src('b'))],true));
  assert.ok(!validateConstruction('pair',[{op:'constant',value:57},{op:'constant',value:57}],true));
  assert.ok(validateConstruction('last',orange,true));
  assert.ok(!validateConstruction('last',[op('add',orange[0].left,orange[0].right)],true));
  assert.ok(!validateConstruction('last',[op('join',orange[0].right,orange[0].left)],true));
  assert.throws(()=>evaluate(share(share(src('a'))),'last',{share:true}));
  assert.throws(()=>validDraft({...draft([src('a')]),selected:[8]},'last',true));
  assert.throws(()=>validDraft(draft([src('b'),share(src('b')),share(src('b'))]),'pair',true));
  assert.deepEqual(validDraft(draft(pair),'pair',true).items,pair);
  let nested=src('a');for(let i=0;i<20;i++)nested=op('add',nested,src('a'));
  assert.throws(()=>evaluate(nested,'last'));
});

// Real SQLite semantics exercise D1 CAS/upserts, through the same API handler.
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users(id) VALUES(1),(2);');
function prepared(text,args=[]){const q=sql.prepare(text);const parameters=()=>Object.fromEntries(args.map((v,i)=>[String(i+1),v]));return {
  bind(...values){return prepared(text,values);},
  async all(){return {results:q.all(parameters())};},
  async first(){return q.get(parameters())||null;},
  async run(){return {meta:q.run(parameters())};}
};}
const env={DB:{prepare:prepared,async batch(statements){sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
const deps={getUser:async(_req,passedEnv)=>{assert.equal(passedEnv,env);return {id:1};},json:(body,status=200)=>Response.json(body,{status})};
async function call(path,body,method=body?'POST':'GET'){
  const res=await handleEchelon(new Request('https://test.local'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),env,path,deps);
  return {status:res.status,...await res.json()};
}
test('API handles permission boundaries, points, migrations and draft conflicts',async()=>{
  await ensureGameTables(env);
  assert.equal((await call('/api/echelon/guess',{id:'eg-13',roots:orange})).status,404);
  assert.equal((await call('/api/echelon/guess',{id:'eg-02',answer:'Dieu'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-05',answer:'Expansion harmonieuse'})).status,403);
  assert.equal((await call('/api/echelon/guess',{id:'eg-02',answer:'Dieu'})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'eg-02',answer:'VALD'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-05',answer:'expansion'})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'eg-05',answer:'harmonieuse'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-01',answer:'Signe'})).gained,1);
  const clock=await call('/api/echelon/guess',{id:'eg-03',answer:'horloge'});
  assert.equal(clock.gained,1);
  assert.ok(clock.state.pages.some(p=>p.id==='eg-10'));
  assert.equal((await call('/api/echelon/draft/eg-13')).status,404);
  // Discovery and duplication can occur before the first autosave completes.
  const firstSave=await call('/api/echelon/draft/eg-12',{revision:0,draft:draft([...sevens,src('b'),share(src('b'))])});
  assert.equal(firstSave.status,200);assert.equal(firstSave.revision,1);
  assert.equal(firstSave.state.echelon,5);assert.equal(firstSave.state.capabilities.share,true);
  assert.equal((await call('/api/echelon/draft/eg-13')).status,403);
  assert.equal((await call('/api/echelon/draft/eg-12',{revision:0,draft:draft(pair)})).status,409);
  assert.equal((await call('/api/echelon/draft/eg-12',{revision:1,draft:draft(pair)})).revision,2);
  assert.equal((await call('/api/echelon/draft/eg-12')).revision,2);
  assert.equal((await call('/api/echelon/guess',{id:'eg-12',roots:pair})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-13',roots:orange})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-13',roots:orange})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'eg-11',roots:[src('a'),src('b')],answer:'2 Jésus'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'n-b',answer:'signes'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'n-b',answer:'signe'})).gained,0);
  const wrong=await call('/api/echelon/guess',{id:'eg-03',answer:'wrong'});
  assert.equal(wrong.ok,false);
  assert.equal((await call('/api/echelon/guess',{id:'eg-03',answer:'details'})).status,429);
  assert.equal((await call('/api/57')).state,undefined);
});

test('retired reset cannot erase progress; public Worker exposes only starting territory',async()=>{
  const res=await worker.fetch(new Request('https://test.local/api/57/progress',{method:'DELETE'}),{});
  assert.equal(res.status,410);
  const anon=await worker.fetch(new Request('https://test.local/api/echelon'),{});
  assert.equal(anon.status,200);assert.equal((await anon.json()).nodes.length,4);
});
