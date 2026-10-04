import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';
import {seal} from '../src/private-data.js';
import {normalizeMechanism} from '../public/mechanism-model.js';
const video=(extra={})=>({title:'Une réflexion',entryType:'creation',medium:'vidéo',url:'https://www.youtube.com/watch?v=M7lc1UVf-VE',videoBranch:'self',precision:'day',date:'2026-09-29',kind:'autre',impact:'à explorer',themes:[],work:'Notes privées',revision:0,...extra});
function setup(){
 const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');
 f.call=async(path,level=18,method='GET',body)=>{const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+level,'X-WC-User':String(level+1),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);return {status:r.status,data:await r.json()};};
 f.ok=async(...args)=>{const r=await f.call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 f.agree=level=>f.ok('/api/private/consent',level,'POST',{consent:true,version:'2026-10-01'});
 return f;
}
test('video and AS access use canonical levels 15 and 18, including invitation acceptance at 18',async()=>{
 const f=setup();try{
  assert.equal((await f.call('/api/life-tree?videos=1',14)).status,403);assert.equal((await f.call('/api/life-tree?videos=1',15)).status,200);
  assert.equal((await f.call('/api/ace-circles',17)).status,403);assert.equal((await f.call('/api/ace-circles',18)).status,200);
  await f.agree(18);await f.agree(19);const id=crypto.randomUUID();await f.ok('/api/ace-circles/invitations',19,'POST',{id,target:19,recipientNotice:true});await f.ok('/api/ace-circles/invitations/'+id,18,'PUT',{action:'accept'});
  const access=(await f.ok('/api/me',15)).access;assert.equal(access.lifeTree,true);assert.equal(access.aceSquare,false);
 }finally{f.sql.close();}
});
test('three categories, concurrent edits, real dates and validated YouTube hosting',async()=>{
 const f=setup();try{
  await f.agree(15);
  for(const branch of ['self','ideas','projects'])await f.ok('/api/life-tree/events/video-'+branch,15,'PUT',video({videoBranch:branch}));
  const all=await f.ok('/api/life-tree?videos=1',15);assert.equal(all.events.length,3);assert.ok(all.events.every(e=>e.topic_id));assert.equal((await f.ok('/api/life-tree?branch=ideas&videos=1',15)).events.length,1);
  for(const extra of [{videoBranch:'other'},{videoBranch:'society'},{videoBranch:'monthly'},{url:''},{url:'https://youtube.com/watch?v=secret'},{precision:'unknown'},{date:'2026-02-30'},{date:'2099-01-01'}])assert.equal((await f.call('/api/life-tree/events/video-invalid',15,'PUT',video(extra))).status,400);
  assert.equal((await f.call('/api/life-tree?branch=monthly&videos=1',15)).status,400);
  assert.equal((await f.call('/api/life-tree/events/video-self',15,'PUT',video({videoBranch:null,revision:1}))).status,400);
  const race=await Promise.all(['one','two'].map(title=>f.call('/api/life-tree/events/video-self',15,'PUT',video({revision:1,title}))));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  await f.ok('/api/life-tree/events/video-month-date',15,'PUT',video({videoBranch:'ideas',precision:'month',date:'2026-09'}));
  assert.equal((await f.ok('/api/life-tree/events/video-month-date',15)).event.precision,'month');
  assert.ok(f.sql.prepare('SELECT payload FROM life_events').all().every(r=>!r.payload.includes('Notes privées')));
 }finally{f.sql.close();}
});

test('video filters and cursor pagination stay newest first without gaps or duplicates',async()=>{
 const f=setup();try{
  await f.agree(15);const expected=[];
  for(let n=1;n<=34;n++){
   const id='order-video-'+String(n).padStart(2,'0'),date='2026-09-'+String(Math.ceil(n/2)).padStart(2,'0');expected.push(id);
   await f.ok('/api/life-tree/events/'+id,15,'PUT',video({date,videoBranch:n%2?'ideas':'self'}));
  }
  const first=await f.ok('/api/life-tree?videos=1',15);assert.equal(first.events.length,30);assert.ok(first.next);
  const next=await f.ok('/api/life-tree?videos=1&after='+encodeURIComponent(first.next),15);
  assert.deepEqual([...first.events,...next.events].map(e=>e.id),expected.reverse());assert.equal(next.next,null);
  const filtered=await f.ok('/api/life-tree?videos=1&branch=ideas',15);
  assert.deepEqual(filtered.events.map(e=>e.id),expected.filter(id=>Number(id.slice(-2))%2));
 }finally{f.sql.close();}
});

test('retired monthly videos retain encrypted content, dates, revisions and comments',async()=>{
 const f=setup();try{
  await f.agree(18);await f.ok('/api/ace-circles',18,'POST',{});
  await f.ok('/api/life-tree/events/old-monthly-video',18,'PUT',video({precision:'month',date:'2026-09',understanding:'Un détail à conserver'}));
  f.sql.prepare("UPDATE life_events SET video_branch='monthly',video_month='2026-09' WHERE id='old-monthly-video'").run();
  const before=f.sql.prepare("SELECT * FROM life_events WHERE id='old-monthly-video'").get();
  const topic=(await f.ok('/api/life-tree/events/old-monthly-video')).event.topic_id;
  await f.ok('/api/ace-circles/topics/'+topic+'/replies',18,'POST',{id:crypto.randomUUID(),text:'Une réponse préservée'});
  const migration=readFileSync(new URL('../migrations/0040_video_reflections.sql',import.meta.url),'utf8');f.sql.exec(migration);
  const after=f.sql.prepare("SELECT * FROM life_events WHERE id='old-monthly-video'").get();
  assert.equal(after.payload,before.payload);assert.equal(after.sort_date,before.sort_date);assert.equal(after.precision,'month');assert.equal(after.video_month,null);assert.equal(after.video_branch,'ideas');assert.equal(after.revision,before.revision+1);
  f.sql.exec(migration);assert.equal(f.sql.prepare("SELECT revision FROM life_events WHERE id='old-monthly-video'").get().revision,after.revision);
  const event=(await f.ok('/api/life-tree/events/old-monthly-video')).event;
  await f.ok('/api/life-tree/events/old-monthly-video',18,'PUT',video({title:'Titre modifié',videoBranch:'ideas',precision:event.precision,date:event.sort_date.slice(0,7),work:event.creation.work,understanding:event.understanding,revision:event.revision}));
  const updated=(await f.ok('/api/life-tree/events/old-monthly-video')).event;assert.equal(updated.understanding,'Un détail à conserver');assert.equal(updated.creation.work,'Notes privées');
  assert.equal((await f.ok('/api/ace-circles/topics/'+topic)).replies[0].text,'Une réponse préservée');assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.sql.close();}
});

test('accepted AS see videos and mechanisms but never archives or their previous comments',async()=>{
 const f=setup();try{
  await f.agree(18);await f.agree(19);await f.ok('/api/ace-circles',18,'POST',{});
  await f.ok('/api/life-tree/events/archive-0001',18,'PUT',video({entryType:'event',videoBranch:null}));
  await f.ok('/api/life-tree/events/video-000001',18,'PUT',video());
  const videoEvent=(await f.ok('/api/life-tree/events/video-000001')).event,archive=(await f.ok('/api/life-tree/events/archive-0001')).event;
  await f.ok('/api/mechanisms/6',18,'PUT',{format:2,revision:0,title:'Mon fonctionnement',description:'Privé',improvement:'Mes essais',anchor:'Mon mantra'});
  const id=crypto.randomUUID();await f.ok('/api/ace-circles/invitations',18,'POST',{id,target:20,recipientNotice:true});await f.ok('/api/ace-circles/invitations/'+id,19,'PUT',{action:'accept'});
  await f.ok('/api/ace-circles/sharing',18,'PUT',{enabled:true,consent:true,scope:'videography'});
  assert.deepEqual((await f.ok('/api/life-tree?owner=19',19)).events.map(e=>e.id),['video-000001']);
  for(const path of ['/api/life-tree/events/archive-0001?owner=19','/api/life-tree?owner=19&archive=1','/api/ace-circles/topics/'+archive.topic_id])assert.ok([403,404].includes((await f.call(path,19)).status));
  assert.equal((await f.ok('/api/mechanisms?owner=19',19)).mechanisms[5].title,'Mon fonctionnement');
  const feed=await f.ok('/api/ace-circles/19/topics',19);assert.equal(feed.topics.length,1);
  assert.equal((await f.call('/api/ace-circles/19/topics?archive=1&revision='+encodeURIComponent(feed.revision),19)).status,403);
  const reply={id:crypto.randomUUID(),text:'Un point de vue aidant'};await f.ok('/api/ace-circles/topics/'+videoEvent.topic_id+'/replies',19,'POST',reply);
  assert.equal((await f.ok('/api/ace-circles/topics/'+videoEvent.topic_id)).replies.length,1);
  await f.ok('/api/ace-circles/sharing',18,'PUT',{enabled:false});assert.equal((await f.call('/api/ace-circles/topics/'+videoEvent.topic_id,19)).status,403);
  assert.equal((await f.call('/api/life-tree/events/video-000001?owner=19',19)).status,403);
 }finally{f.sql.close();}
});
test('five chosen and five innate mechanisms keep all legacy text and persist separate modern fields',async()=>{
 const f=setup();try{
  const old={title:'Titre conservé',description:'Description initiale',notice:'Mon observation',practice:'Ma pratique',anchor:'Mon repère'};
  for(const slot of [4,6])f.sql.prepare('INSERT INTO user_mechanisms(owner_id,slot,payload) VALUES(19,?,?)').run(slot,await seal(f.env,'mechanism:19:'+slot,old));
  const list=(await f.ok('/api/mechanisms')).mechanisms;assert.equal(list.filter(m=>m.kind==='chosen').length,5);assert.equal(list.filter(m=>m.kind==='innate').length,5);
  assert.equal(list[3].title,old.title);assert.match(list[3].description,/Mon observation/);assert.match(list[3].description,/Ma pratique/);assert.equal(list[5].improvement,'Ma pratique');assert.equal(list[5].anchor,'Mon repère');
  assert.deepEqual(normalizeMechanism(6,list[5]),normalizeMechanism(6,normalizeMechanism(6,list[5])));
  await f.agree(18);await f.ok('/api/mechanisms/6',18,'PUT',{...list[5],anchor:'Une amélioration consciente',improvement:'De nouveaux essais',revision:1});
  const saved=(await f.ok('/api/mechanisms/6')).mechanism;assert.equal(saved.improvement,'De nouveaux essais');assert.equal(saved.anchor,'Une amélioration consciente');assert.match(saved.description,/Description initiale/);
  assert.equal((await f.call('/api/mechanisms/6',18,'PUT',{...saved,improvement:'x'.repeat(8001)})).status,400);
 }finally{f.sql.close();}
});
test('0038 adds nullable video metadata and indexes without altering encrypted records or previous sharing',()=>{
 const sql=new DatabaseSync(':memory:');try{
  const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');sql.exec(schema.slice(0,schema.indexOf('ALTER TABLE life_events ADD COLUMN video_branch')));
  sql.exec("INSERT INTO users(id,email,username,password_hash) VALUES(1,'old@local.test','Old','unused'); INSERT INTO life_events(id,owner_id,sort_date,precision,kind,impact,payload) VALUES('legacy-0001',1,'2020-01-01','year','autre','ressource','ciphertext-unchanged'); INSERT INTO ace_circles(owner_id,share_enabled,combined_sharing) VALUES(1,1,1)");
  sql.exec(readFileSync(new URL('../migrations/0038_videography.sql',import.meta.url),'utf8'));
  const r=sql.prepare('SELECT payload,video_branch,video_month FROM life_events').get();assert.equal(r.payload,'ciphertext-unchanged');assert.equal(r.video_branch,null);assert.equal(r.video_month,null);assert.equal(sql.prepare('SELECT combined_sharing FROM ace_circles').get().combined_sharing,1);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.match(sql.prepare("EXPLAIN QUERY PLAN SELECT id FROM life_events WHERE owner_id=1 AND video_branch='self' ORDER BY sort_date DESC,id DESC LIMIT 31").all().map(r=>r.detail).join(),/idx_video_journal/);
 }finally{sql.close();}
});
test('session response reads canonical progression once and does not expose private content',async()=>{
 const f=setup();try{
  await f.ok('/api/me');const prepare=f.env.DB.prepare;let canonicalReads=0;
  f.env.DB.prepare=(query,...args)=>{if(/SELECT[\s\S]*FROM riddle_progress/i.test(query))canonicalReads++;return prepare(query,...args);};
  const me=await f.ok('/api/me');assert.equal(me.gameEchelon,18);assert.equal(canonicalReads,1);assert.doesNotMatch(JSON.stringify(me),/Notes privées|payload|password_hash/);
 }finally{f.sql.close();}
});
