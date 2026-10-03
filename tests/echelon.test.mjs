import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {NODES,SHARE,MAX_GAME_LEVEL,progress,buildGameState,gameLevel,accessLevel,gameProfile,isPlayable} from '../src/echelon.js';
import {NODES as OLD,echelonOf,progresOf,matchNode} from '../src/enigmas57.js';
import {evaluate,validDraft,validateConstruction} from '../src/echelon-workshop.js';
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
const draft=(items,answer=[null,null])=>({version:2,items,answer,selected:[]});
const final=answer=>draft([],answer);
const date=[src('b'),op('div',share(src('b')),src('a'))];

test('one completed answer is one rung; old duplicates merge, retired history preserves access',()=>{
  assert.equal(gameLevel(rows()),1);
  assert.equal(gameLevel(rows('eg-02-1','eg-02-2','eg-02-1.p0')),2);
  assert.equal(gameLevel(rows('eg-06-1.p0')),1);
  assert.equal(gameLevel(rows('eg-06-1.p0','eg-06-1.p1')),2);
  assert.equal(gameLevel(rows('n-a-2','n-k-2','n-b-1','eg-01-1')),5);
  assert.equal(gameLevel(rows('eg-07-1')),2);
  assert.ok(!progress(rows('eg-07-1')).solved.has('eg-01-1'));
  assert.ok(progress(rows('n-b-1')).solved.has('eg-07-1'));
  assert.equal(gameLevel(rows('n-e-1','n-f-1',SHARE)),1);
  const history=rows(...OLD.flatMap(n=>n.answers.map(a=>a.id)));
  assert.ok(accessLevel(history)>=echelonOf(progresOf(history.map(r=>r.riddle_id)).solved));
  assert.equal(progress(rows('n-a-2.p0')).solved.has('eg-01-1'),true);
});

test('all accounts share the same current ceiling; retired records cannot add levels or a completion bonus',()=>{
  const active=NODES.flatMap(n=>n.answers.map(a=>a.id));
  assert.equal(NODES.length,23);
  assert.equal(active.length,32);
  assert.equal(new Set(active).size,32);
  assert.equal(gameLevel(rows(...active)),33);
  for(const retired of ['eg-02-2','eg-03-3','n-0-3']){
    const history=rows(...active,retired,retired+'.p0',retired);
    assert.equal(gameLevel(history),33);
    assert.equal(progress(history).solved.size,32);
    assert.equal(progress(history).retired.size,1);
  }
  const fullHistory=rows(...active,'eg-02-2','eg-02-2.p0','eg-03-3','eg-03-3.p0');
  assert.equal(gameLevel(fullHistory),33);
  assert.equal(MAX_GAME_LEVEL,33);
  assert.equal(gameLevel(rows(...active.slice(0,-1),'eg-02-2','eg-03-3')),32);
  assert.deepEqual(buildGameState(fullHistory),buildGameState(rows(...active)));
  assert.equal(buildGameState(fullHistory).continuation.level,33);
});

test('signs appear only with their song, even if an old client marked them seen',()=>{
  const start=buildGameState([]);
  assert.equal(start.echelon,1);
  assert.deepEqual(start.nodes.map(n=>n.id),['eg-14','n-a','n-h','eg-02','eg-01','n-w','eg-05','eg-06']);
  assert.ok(start.nodes.every(n=>n.music==='30-vins-divins'&&!n.locked));
  assert.doesNotMatch(JSON.stringify(start),/Devincix|Katikas|Horloge|Jésus|Dieu|VALD|apôtres|eg-13|eg-10/);
  assert.deepEqual(buildGameState(rows('@eg/seen/n-g')).nodes.map(n=>n.id),start.nodes.map(n=>n.id));
  const third=buildGameState(rows('eg-02-1'));
  assert.deepEqual(third.nodes.filter(n=>n.music==='sans-indice-dans-les-des').map(n=>n.id),['n-g','n-c','n-b','eg-03','n-k']);
  assert.ok(!third.nodes.some(n=>n.id==='n-e'||n.id==='eg-15'));
  assert.ok(buildGameState(rows('eg-02-1','eg-02-2','eg-01-1')).nodes.some(n=>n.id==='n-e'));
  assert.ok(buildGameState(rows('eg-02-1','eg-02-2','eg-01-1','n-h-2')).nodes.some(n=>n.id==='eg-15'));
  assert.equal(gameProfile(rows('eg-13-1','eg-02-2'),[]).enigmes.length,0);
});

test('Horloge requires its password, while workshops also require their songs',()=>{
  const base=['eg-02-1'];
  for(const extra of [[],['eg-03-2'],['eg-03-3'],['@eg/seen/eg-10']])assert.ok(!buildGameState(rows(...base,...extra)).pages.some(n=>n.id==='eg-10'));
  const clock=buildGameState(rows(...base,'eg-03-1'));
  assert.ok(clock.pages.some(n=>n.id==='eg-10'));
  for(const id of ['eg-11','eg-12'])assert.equal(clock.nodes.find(n=>n.id===id).locked,false);
  assert.ok(!clock.pages.some(n=>n.id==='eg-13'));
  assert.ok(!buildGameState(rows('eg-03-1',SHARE)).pages.some(n=>n.id==='eg-13'));
  assert.equal(buildGameState(rows(...base,'eg-03-1','eg-01-1',SHARE)).nodes.find(n=>n.id==='eg-13').locked,false);
  assert.equal(buildGameState(rows(...base,'eg-03-1','eg-12-1')).nodes.find(n=>n.id==='eg-13').locked,false);
});

test('every authored answer is reachable without relying on removed puzzles',()=>{
  const found=[];
  for(let round=0;round<20;round++)for(const n of NODES){
    if(isPlayable(n,progress(rows(...found))))for(const a of n.answers)if(!found.includes(a.id))found.push(a.id);
  }
  assert.equal(found.length,NODES.reduce((n,node)=>n+node.answers.length,0));
  const state=buildGameState(rows(...found));
  assert.deepEqual([...new Set(state.pages.map(p=>p.href.split('#')[0]))].sort(),['/signes','/signes/horloge']);
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
  const needle=NODES.find(n=>n.id==='eg-03');
  assert.equal(needle.answers[1].label,'le détail');
  assert.ok(matchNode(needle,'details',new Set()).prises[0].complet);
  assert.equal(buildGameState(rows('eg-02-1','eg-03-2')).nodes.find(n=>n.id==='eg-03').found[0].label,'le détail');
  assert.equal(NODES.find(n=>n.id==='n-0').min,8);
  assert.equal(gameLevel(rows('n-0-1','n-0-3')),2);
  const beast=NODES.find(n=>n.id==='n-h');
  assert.equal(beast.source,'Prends la bête à…');
  for(const [text,id]of [['dix cornes','n-h-2'],['deux cornes','n-h-3'],['Prends la bête à 2 cornes','n-h-3'],['Prends la bête à dix cornes','n-h-2']]){
    const result=matchNode(beast,text,new Set());
    assert.ok(result.prises.some(p=>p.id===id&&p.complet),text);
    assert.ok(!result.prises.some(p=>p.id!==id&&p.complet),text);
  }
});

test('XEU only accepts Dieu; former VALD records do not grant a rung',()=>{
  const xeu=NODES.find(n=>n.id==='eg-02');
  assert.deepEqual(xeu.answers.map(a=>a.label),['Dieu']);
  assert.ok(matchNode(xeu,'dieu',new Set()).prises.some(p=>p.id==='eg-02-1'&&p.complet));
  for(const text of ['VALD','V-A-L-D'])assert.ok(!matchNode(xeu,text,new Set())?.prises?.length);
  const history=rows('eg-02-2','eg-02-2.p0'),state=buildGameState(history);
  assert.equal(state.echelon,1);
  assert.deepEqual(state.nodes.find(n=>n.id==='eg-02').found,[]);
  assert.equal(state.nodes.find(n=>n.id==='eg-02').total,1);
  assert.equal(gameLevel(rows('eg-02-2.p0')),1);
});

test('Aiguille only accepts Horloge and details; its retired Signe grants no rung',()=>{
  const needle=NODES.find(n=>n.id==='eg-03');
  assert.deepEqual(needle.answers.map(a=>a.label),['L’horloge','le détail']);
  for(const text of ['horloge','Horloge',"l'horloge",'L’horloge'])assert.ok(matchNode(needle,text,new Set()).prises.some(p=>p.id==='eg-03-1'&&p.complet),text);
  for(const text of ['signe','Signe','signes'])assert.ok(!matchNode(needle,text,new Set())?.prises?.length);
  for(const text of ['le(s) détail(s)','le(s) detail(s)','le détail','les détails','détail','details']){
    assert.ok(matchNode(needle,text,new Set()).prises.some(p=>p.id==='eg-03-2'&&p.complet),text);
  }
  const state=buildGameState(rows('eg-02-1','eg-03-2','eg-03-3'));
  assert.equal(state.echelon,3);
  assert.deepEqual(state.nodes.find(n=>n.id==='eg-03').found.map(a=>a.label),['le détail']);
  assert.equal(state.nodes.find(n=>n.id==='eg-03').total,2);
  assert.equal(gameLevel(rows('eg-03-3','eg-03-3.p0')),1);
  assert.ok(!state.pages.some(p=>p.kind==='clock'));
});

test('Mélange les is available at echelon 1, accepts the complete phrase, and restores old discoveries exactly once',()=>{
  const puzzle=NODES.find(n=>n.id==='eg-05'),start=buildGameState().nodes.find(n=>n.id==='eg-05');
  assert.equal(start.title,'Mélange les…');assert.equal(start.total,1);assert.equal(start.locked,false);assert.equal(start.open,true);
  assert.equal(start.music,'30-vins-divins');assert.deepEqual(start.found,[]);
  assert.doesNotMatch(JSON.stringify(start),/Expansion|harmonieuse/i);
  for(const text of ['Expansion harmonieuse','expansions harmonieuses','Mélange les expansions harmonieuses','melange-les expansion harmonieuse']){
    assert.ok(matchNode(puzzle,text,new Set()).prises.some(p=>p.id==='eg-05-1'&&p.complet),text);
  }
  assert.ok(matchNode(puzzle,'expansion',new Set()).prises.every(p=>!p.complet));
  for(const history of [rows('eg-05-1'),rows('eg-05-1.p0','eg-05-1.p1'),rows('eg-05-1','eg-05-1.p0','eg-05-1.p1')]){
    const state=buildGameState(history),restored=state.nodes.find(n=>n.id==='eg-05');
    assert.equal(state.echelon,2);assert.equal(restored.open,false);
    assert.deepEqual(restored.found,[{id:'eg-05-1',label:'Expansions harmonieuses'}]);
  }
  assert.equal(gameLevel(rows('eg-05-1.p0')),1);
  assert.equal(buildGameState(rows('eg-05-1.p0')).nodes.find(n=>n.id==='eg-05').partiels.length,1);
});

test('the two numeric formulas independently accept the same date and preserve earned rungs',()=>{
  for(const id of ['n-c','eg-14']){
    const n=NODES.find(n=>n.id===id);assert.equal(n.answers.length,2);
    for(const text of ['25 décembre','25/12'])assert.ok(matchNode(n,text,new Set()).prises[0].complet);
    assert.ok(matchNode(n,'Jésus',new Set()).prises.some(p=>p.complet&&p.id.endsWith('-2')));
  }
  assert.equal(gameLevel(rows('n-c-1')),2);
  assert.equal(gameLevel(rows('n-c-1','eg-14-1')),3);
  assert.equal(gameLevel(rows('n-c-1','eg-04-1')),3);
  assert.equal(gameLevel(rows('eg-04-1.p0','eg-04-1','eg-14-1')),2);
  assert.ok(!progress(rows('n-c-1')).solved.has('eg-14-1'));
});

test('AA, apostles and repeated signs remain independent; corrected history keeps earned rungs',()=>{
  const aa=NODES.find(n=>n.id==='eg-15'),fiftySeven=NODES.find(n=>n.id==='n-a'),seven=NODES.find(n=>n.id==='n-k');
  assert.equal(aa.answers[0].label,'Andromédien Autiste');
  for(const text of ['Andromédien autiste','andromedien autiste'])assert.ok(matchNode(aa,text,new Set()).prises[0].complet);
  assert.deepEqual(fiftySeven.answers.map(a=>a.label),['12 apôtres','Signes','Anges','Expansions harmonieuses']);
  assert.deepEqual(seven.answers.map(a=>a.label),['Galaxies','Signes']);
  for(const text of ['12 apôtres','douze apotres'])assert.ok(matchNode(fiftySeven,text,new Set()).prises[0].complet);
  for(const text of ['anges','Anges','ange'])assert.ok(matchNode(fiftySeven,text,new Set()).prises.some(p=>p.id==='eg-16-3'&&p.complet));
  assert.ok(!matchNode(fiftySeven,'archanges',new Set())?.prises?.length);
  assert.equal(gameLevel(rows('n-a-4')),2);
  assert.equal(gameLevel(rows('n-a-4.p0','n-a-4.p1','n-a-4.p2')),2);
  assert.equal(gameLevel(rows('n-a-4.p0','n-a-4.p1')),1);
  assert.deepEqual([...progress(rows('n-a-4.p0','n-a-4.p1')).parts.get('eg-16-1')],[0]);
  assert.equal(gameLevel(rows('n-a-4','eg-16-1')),2);
  const signs=progress(rows('eg-16-2','eg-17-1'));
  assert.equal(signs.solved.size,2);assert.ok(!signs.solved.has('eg-01-1'));
  const full=NODES.flatMap(n=>n.answers.map(a=>a.id));
  for(const records of [rows(...full),rows('n-a-2','n-k-2'),rows('n-c-1','eg-14-1')]){
    const ids=buildGameState(records).nodes.filter(n=>n.kind==='riddle').map(n=>n.id);
    for(const [a,b]of [['n-a','n-k'],['n-c','eg-14']])if(ids.includes(a)&&ids.includes(b))assert.ok(Math.abs(ids.indexOf(a)-ids.indexOf(b))>1);
  }
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
async function call(path,body,method=body?'POST':'GET',wait=true){
  // Simulate elapsed time between separate puzzle scenarios. Dedicated tests cover the deadline.
  if(wait&&path.endsWith('/guess'))sql.exec('UPDATE echelon_attempts SET next_at=0');
  const res=await handleEchelon(new Request('https://test.local'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),env,path,deps);
  return {status:res.status,...await res.json()};
}
test('API handles permission boundaries, points, migrations and draft conflicts',async()=>{
  await ensureGameTables(env);
  assert.equal((await call('/api/echelon/guess',{id:'eg-13',draft:final(orange)})).status,404);
  assert.equal((await call('/api/echelon/guess',{id:'eg-02',answer:'Dieu'})).gained,1);
  assert.ok((await call('/api/echelon')).nodes.some(n=>n.id==='n-g'));
  assert.equal((await call('/api/echelon/guess',{id:'n-0',answer:'Devincix'})).status,404);
  assert.equal((await call('/api/echelon/guess',{id:'eg-02',answer:'Dieu'})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'eg-02',answer:'VALD'})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'eg-05',answer:'Expansion harmonieuse'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-05',answer:'Mélange les expansions harmonieuses'})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'n-h',answer:'dix'})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'n-h',answer:'cornes'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-01',answer:'Signe'})).gained,1);
  const clock=await call('/api/echelon/guess',{id:'eg-03',answer:'horloge'});
  assert.equal(clock.gained,1);
  assert.deepEqual(clock.opened.map(item=>item.id),['music-les-probabilites']);
  assert.ok(clock.state.pages.some(p=>p.id==='eg-10'));
  assert.equal((await call('/api/echelon/draft/eg-13')).status,200);
  // Discovery and duplication can occur before the first autosave completes.
  const firstSave=await call('/api/echelon/draft/eg-12',{revision:0,draft:draft([...sevens,src('b'),share(src('b'))])});
  assert.equal(firstSave.status,200);assert.equal(firstSave.revision,1);
  assert.equal(firstSave.state.echelon,6);assert.equal(firstSave.state.capabilities.share,true);
  assert.equal((await call('/api/echelon/draft/eg-13')).status,200);
  assert.equal((await call('/api/echelon/draft/eg-12',{revision:0,draft:draft(pair)})).status,409);
  assert.equal((await call('/api/echelon/draft/eg-12',{revision:1,draft:draft(pair)})).revision,2);
  assert.equal((await call('/api/echelon/draft/eg-12')).revision,2);
  assert.equal((await call('/api/echelon/guess',{id:'eg-12',draft:final(pair)})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-13',draft:final(orange)})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'eg-13',draft:final(orange)})).gained,0);
  assert.equal((await call('/api/echelon/guess',{id:'eg-11',draft:final(date)})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'n-b',answer:'signes'})).gained,1);
  assert.equal((await call('/api/echelon/guess',{id:'n-b',answer:'signe'})).gained,0);
  const wrong=await call('/api/echelon/guess',{id:'eg-03',answer:'wrong'});
  assert.equal(wrong.ok,false);
  assert.equal((await call('/api/echelon/guess',{id:'eg-03',answer:'details'},'POST',false)).status,429);
  assert.equal((await call('/api/57')).state,undefined);
});

test('retired reset cannot erase progress; public Worker exposes only starting territory',async()=>{
  const res=await worker.fetch(new Request('https://test.local/api/57/progress',{method:'DELETE'}),{});
  assert.equal(res.status,410);
  const anon=await worker.fetch(new Request('https://test.local/api/echelon'),{});
  assert.equal(anon.status,200);assert.equal((await anon.json()).nodes.length,8);
  assert.equal((await worker.fetch(new Request('https://test.local/api/echelon/map'),{})).status,401);
});
