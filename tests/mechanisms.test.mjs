import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';
import {NODES} from '../src/echelon.js';
import {composeDate,dateParts,dateFields} from '../public/life-dates.js';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

function setup(){
 const f=fixture(),signs=NODES.flatMap(n=>n.answers.map(a=>a.id));
 for(const [id,level] of [[500,15],[501,14],[502,20]]){
  f.sql.prepare('INSERT INTO users(id,email,username,password_hash) VALUES(?,?,?,?)').run(id,`mechanism${id}@local.test`,`Mechanism ${id}`,'unused');
  f.sql.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run('mechanism'+id,id,'2099-01-01');
  for(const sign of signs.slice(0,level-1))f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(id,sign,'2026-10-01');
 }
 f.call=async(path,id=500,method='GET',body,headers={})=>{const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=mechanism'+id,'X-WC-User':String(id),'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),f.env);return {status:r.status,data:await r.json()};};
 f.agree=()=>f.call('/api/private/consent',500,'POST',{consent:true,version:'2026-10-01'});return f;
}
test('mechanisms unlock at 15, contain exactly ten private slots and three editable proposals',async()=>{
 const f=setup();try{
  assert.equal((await f.call('/api/mechanisms',501)).status,403);
  const list=await f.call('/api/mechanisms');assert.equal(list.status,200);assert.equal(list.data.mechanisms.length,10);assert.equal(list.data.mechanisms.filter(m=>m.title).length,3);
  assert.equal((await f.call('/api/me',501)).data.access.mechanisms,false);assert.equal((await f.call('/api/me')).data.access.mechanisms,true);
  const proposed=list.data.mechanisms[0];assert.equal(proposed.title,'Toujours faire mieux');assert.equal(f.sql.prepare('SELECT count(*) AS n FROM user_mechanisms').get().n,0);
  assert.equal((await f.call('/api/mechanisms/1',500,'PUT',{...proposed,title:'Ma version'})).status,409);
  assert.equal((await f.agree()).status,200);
  const saved=await f.call('/api/mechanisms/1',500,'PUT',{...proposed,title:'Ma version'});assert.equal(saved.status,200);assert.equal(saved.data.mechanism.revision,1);
  assert.ok(!f.sql.prepare('SELECT payload FROM user_mechanisms').get().payload.includes('Ma version'));
  assert.equal((await f.call('/api/mechanisms/1',502)).data.mechanism.title,'Toujours faire mieux');
  assert.equal((await f.call('/api/mechanisms?owner=500',502)).status,403);
  assert.equal((await f.call('/api/mechanisms/11')).status,404);
 }finally{f.sql.close();}
});
test('mechanism concurrent edits, empty slots, export and consent withdrawal preserve account and progress',async()=>{
 const f=setup();try{
  await f.agree();const value={title:'Repère personnel',description:'Une réflexion intime',revision:0};
  const results=await Promise.all([f.call('/api/mechanisms/4',500,'PUT',value),f.call('/api/mechanisms/4',500,'PUT',{...value,title:'Autre fenêtre'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.call('/api/mechanisms/4',500,'PUT',{title:'',revision:1})).status,200);
  assert.equal((await f.call('/api/mechanisms/4')).data.mechanism.title,'');
  await f.call('/api/mechanisms/1',500,'PUT',{title:'',revision:0});assert.equal((await f.call('/api/mechanisms/1')).data.mechanism.title,'');
  const count=f.sql.prepare('SELECT count(*) AS n FROM riddle_progress WHERE user_id=500').get().n;
  assert.equal((await f.call('/api/mechanisms/export')).data.mechanisms.length,10);
  assert.equal((await f.call('/api/private/data',500,'DELETE',{confirm:'SUPPRIMER'})).status,200);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM user_mechanisms').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM riddle_progress WHERE user_id=500').get().n,count);
 }finally{f.sql.close();}
});
test('mechanism writes enforce origin, account context, lengths and request types',async()=>{
 const f=setup();try{
  await f.agree();assert.equal((await f.call('/api/mechanisms/4',500,'PUT',{title:'test',revision:0},{Origin:'https://other.local'})).status,403);
  assert.equal((await f.call('/api/mechanisms/4',500,'PUT',{title:'test',revision:0},{'X-WC-User':'502'})).status,409);
  assert.equal((await f.call('/api/mechanisms/4',500,'PUT',{title:'x'.repeat(141),revision:0})).status,400);
  assert.equal((await f.call('/api/mechanisms/4',500,'PUT',{title:{},revision:0})).status,400);
  assert.equal((await f.call('/api/mechanisms/4',500,'PUT',{title:'test',revision:0},{'Content-Type':'text/plain'})).status,415);
 }finally{f.sql.close();}
});
test('mobile date components preserve precision changes and validate real dates without native pickers',()=>{
 const p=dateParts('2019-07-18');assert.equal(composeDate(p,'day'),'2019-07-18');assert.equal(composeDate(p,'month'),'2019-07');assert.equal(composeDate(p,'year'),'2019');assert.equal(composeDate(p,'period'),'2019-07-18');assert.equal(composeDate(p,'unknown'),'');
 assert.equal(composeDate(dateParts('2020-02-29'),'day'),'2020-02-29');assert.throws(()=>composeDate(dateParts('2021-02-29'),'day'));assert.throws(()=>composeDate(dateParts('2019-04-31'),'day'));assert.throws(()=>composeDate(dateParts('2019-07'),'day'));
 assert.equal(composeDate(dateParts('2019'),'day',{draft:true}),'2019--');assert.equal(composeDate(dateParts(''),'day',{optional:true}),'');assert.throws(()=>composeDate(dateParts('2099-01-01'),'day'));
 const html=dateFields('start','2019-07-18');assert.match(html,/inputmode="numeric"/);assert.doesNotMatch(html,/type="(?:date|month)"/);assert.match(html,/value="07" selected/);assert.doesNotMatch(dateFields('start','<script>'),/<script>/);
});
test('private browser modules parse as ESM; AS interface has no obsolete labels or native date fields',()=>{
 for(const name of ['private-pages.js','life-dates.js']){const source=readFileSync(new URL('../public/'+name,import.meta.url),'utf8');const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 const ui=readFileSync(new URL('../public/private-pages.js',import.meta.url),'utf8');assert.doesNotMatch(ui,/\banges?\b/i);assert.doesNotMatch(ui,/private-kicker|type="(?:date|month)"/);
});
