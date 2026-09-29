import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,validDraft,restoreDraft,validateConstruction,boardSpec} from '../src/echelon-workshop.js';
import {initialDraft,formatBlock} from '../public/workshop-core.js';
import {gameLevel,NODES} from '../src/echelon.js';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';
const src=ref=>({op:'src',ref}),part=(ref,index)=>({op:'part',ref,index}),op=(op,left,right)=>({op,left,right}),dup=arg=>({op:'reuse',arg});
const final=answer=>({version:2,items:[],selected:[],answer});
const solutions={
  first:[src('b'),op('div',dup(src('b')),src('a'))],
  pair:[op('add',src('b'),op('add',src('a'),part('d',0))),op('add',dup(src('b')),op('add',src('c'),part('d',1)))],
  last:[op('join',op('add',src('a'),part('b',0)),op('sub',part('b',1),dup(src('a'))))],
  album:[op('div',src('a'),src('b')),dup(src('b'))],
  date:[op('add',op('add',src('a'),src('b')),src('c')),src('d')],
  wanheda:[op('add',src('a'),src('b'))],
  infinis:[op('group',src('b'),src('a'))],
};
for(const [board,answer]of Object.entries(solutions))test(board+': complete calculation requires explicit final placement and no loose blocks',()=>{
  assert.ok(validateConstruction(board,final(answer)));
  assert.ok(!validateConstruction(board,answer)); // Old roots-only clients cannot bypass placement.
  const loose=structuredClone(final(answer));loose.items.push(loose.answer[0]);loose.answer[0]=null;
  assert.ok(!validateConstruction(board,loose));
  assert.ok(!validateConstruction(board,{...final(answer),items:[src('a')]}));
  assert.ok(!validateConstruction(board,initialDraft(boardSpec(board))));
  const forged=structuredClone(final(answer));forged.answer[0]={op:'constant',value:57};
  assert.ok(!validateConstruction(board,forged));
});
test('dates distinguish day/month, either copy can be consumed, and surplus duplicates can be removed',()=>{
  assert.ok(validateConstruction('first',final([dup(src('b')),op('div',src('b'),src('a'))])));
  assert.ok(!validateConstruction('first',final(solutions.first.toReversed())));
  const bothCopies={version:2,items:[src('a'),dup(src('a')),src('b'),dup(src('b'))],answer:[null,null],selected:[]};
  validDraft(bothCopies,'first');bothCopies.items.shift();validDraft(bothCopies,'first');
  const missing={...bothCopies,items:[src('b'),dup(src('b'))]};assert.throws(()=>validDraft(missing,'first'),/départ/);
});
test('July is automatically placed and cannot enter a calculation, be changed, split, or reused',()=>{
  const initial=initialDraft(boardSpec('date'));assert.deepEqual(initial.answer,[null,src('d')]);
  assert.equal(formatBlock(evaluate(src('d'),'date')),'07');
  for(const expr of [dup(src('d')),op('add',src('d'),src('a')),part('d',0)])assert.throws(()=>evaluate(expr,'date'));
  assert.throws(()=>validDraft({...initial,answer:[null,src('a')]},'date'));
  assert.ok(validateConstruction('date',final([op('add',src('c'),op('add',src('b'),src('a'))),src('d')])));
});
test('grouping carries count and unit, not an arithmetic subtraction or ordinary division',()=>{
  const album=evaluate(op('group',src('a'),src('b')),'album'),infinis=evaluate(solutions.infinis[0],'infinis');
  assert.deepEqual(album.group,{count:2,unit:57});assert.equal(formatBlock(album,'album'),'57-2');
  assert.deepEqual(infinis.group,{count:3,unit:6});assert.equal(formatBlock(infinis),'666');
  assert.ok(!validateConstruction('album',final([op('div',src('a'),src('b'))])));
  assert.ok(!validateConstruction('infinis',final([op('div',src('b'),src('a'))])));
  assert.throws(()=>evaluate(op('group',src('a'),src('b')),'infinis'));
  assert.deepEqual(evaluate(op('group',src('b'),src('a')),'first').group,{count:2,unit:12});
  assert.ok(!validateConstruction('first',final([op('group',src('b'),src('a')),src('b')])));
});
test('resource counts and expression budgets reject duplicated, nested and invalid source forgeries',()=>{
  assert.throws(()=>validDraft(final([solutions.pair[0],solutions.pair[0]]),'pair'));
  assert.throws(()=>evaluate(dup(dup(src('a'))),'last'));
  assert.throws(()=>evaluate(src('unknown'),'last'));
  assert.throws(()=>evaluate(op('div',src('a'),op('sub',src('b'),src('b'))),'last'));
  let expr=src('a');for(let i=0;i<20;i++)expr=op('add',expr,src('a'));
  assert.throws(()=>evaluate(expr,'last'));
  assert.throws(()=>validDraft({...initialDraft(boardSpec('last')),selected:[99]},'last'));
});

test('114 rejects the old grouped result and migrates existing work without losing the construction',()=>{
  const grouped=op('group',src('a'),src('b')),old=final([grouped]);
  assert.ok(!validateConstruction('album',old));
  assert.ok(!validateConstruction('album',final([grouped,dup(src('b'))])));
  assert.ok(!validateConstruction('album',final([op('div',src('a'),src('b')),src('b')])));
  const migrated=restoreDraft(old,'album');
  assert.deepEqual(migrated,{...old,answer:[grouped,null]});
  assert.ok(!validateConstruction('album',migrated));
  const working={version:2,items:[src('b')],selected:[0],answer:[src('a')]};
  assert.deepEqual(restoreDraft(working,'album'),{...working,answer:[src('a'),null]});
  assert.equal(gameLevel([{riddle_id:'eg-18-1',solved_at:'now'}]),2);
});

test('two-slot draft migration archives the exact older saved draft before replacement',async()=>{
  const f=fixture(),user=26;
  f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(user,'eg-03-1','now');
  const call=body=>worker.fetch(new Request('https://test.local/api/echelon/draft/eg-18',{method:body?'POST':'GET',headers:{Cookie:'wc_session=qa25','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
  await call();
  const old=JSON.stringify(final([op('group',src('a'),src('b'))]));
  f.sql.prepare('INSERT INTO echelon_drafts(user_id,board_id,draft,revision) VALUES(?,?,?,?)').run(user,'eg-18',old,6);
  const fetched=await(await call()).json();
  assert.equal(fetched.revision,6);assert.equal(fetched.draft.answer.length,2);
  assert.equal(fetched.draft.answer[0].op,'group');assert.equal(fetched.draft.answer[1],null);
  const saved=await call({draft:fetched.draft,revision:6});assert.equal(saved.status,200);
  assert.equal(f.sql.prepare('SELECT draft FROM echelon_draft_history WHERE user_id=? AND board_id=? AND revision=6').get(user,'eg-18').draft,old);
  f.sql.close();
});
test('old drafts are migrated and old completed 2 Jesus keeps its rung without crediting a lone old fragment',()=>{
  const legacy={version:1,items:[src('a'),src('b')],selected:[]};
  assert.deepEqual(restoreDraft(legacy,'first'),{...legacy,version:2,answer:[null,null]});
  const rows=(...ids)=>ids.map(riddle_id=>({riddle_id,solved_at:'now'}));
  assert.equal(gameLevel(rows('eg-11-1')),2);
  assert.equal(gameLevel(rows('eg-11-1.p0','eg-11-1.p1')),2);
  assert.equal(gameLevel(rows('eg-11-1.p0')),1);
  assert.equal(gameLevel(rows('eg-14-1','eg-14-2','n-c-1','n-c-2')),5);
});
test('new workshop visibility follows exact song thresholds and always requires Horloge',async()=>{
  const f=fixture(),ids=NODES.filter(n=>n.kind==='riddle').flatMap(n=>n.answers.map(a=>a.id)).filter(id=>id!=='eg-03-1');
  for(const level of [2,3,5,6,7,8,9,10,11,12]){
    const user=level+1;f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=?').run(user);
    const insert=id=>f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(user,id,'now');
    for(const id of ids.slice(0,level-2))insert(id);
    const call=path=>worker.fetch(new Request('https://test.local'+path,{headers:{Cookie:'wc_session=qa'+level}}),f.env);
    for(const id of ['eg-18','eg-19','eg-20','eg-21'])assert.equal((await call('/api/echelon/draft/'+id)).status,404);
    insert('eg-03-1');
    for(const [id,min]of [['eg-18',5],['eg-19',8],['eg-20',8],['eg-21',10]]){
      const res=await call('/api/echelon/draft/'+id);assert.equal(res.status,level>=min?200:404,id+' '+level);
      if(res.status===200){const data=await res.json();assert.ok(data.spec.slots);assert.equal(data.draft.version,2);assert.ok(!('solutions' in data));assert.ok(!('prompt' in data.spec));}
    }
  }
  f.sql.close();
});
test('API saves final slots, archives legacy drafts, rejects stale saves, and grants each new solution only once',async()=>{
  const f=fixture(),user=26;
  f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(user,'eg-03-1','now');
  const call=async(path,body)=>{const res=await worker.fetch(new Request('https://test.local/api/echelon/'+path,{method:body?'POST':'GET',headers:{Cookie:'wc_session=qa25','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);return {status:res.status,...await res.json()};};
  await call('draft/eg-18');
  f.sql.exec(`INSERT INTO echelon_drafts(user_id,board_id,draft,revision) VALUES(26,'eg-18','{"version":1,"items":[{"op":"src","ref":"a"},{"op":"src","ref":"b"}],"selected":[]}',3)`);
  assert.equal((await call('draft/eg-18',{draft:final(solutions.album),revision:3})).revision,4);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM echelon_draft_history').get().n,1);
  assert.equal((await call('draft/eg-18',{draft:final(solutions.album),revision:3})).status,409);
  for(const [id,board]of [['eg-18','album'],['eg-19','date'],['eg-20','wanheda'],['eg-21','infinis']]){
    const solved=await call('guess',{id,draft:final(solutions[board])});assert.equal(solved.gained,1,id);
    assert.equal((await call('guess',{id,draft:final(solutions[board])})).gained,0);
  }
  f.sql.close();
});
