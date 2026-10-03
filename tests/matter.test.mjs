import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const event=(extra={})=>({title:'Repère fictif',precision:'month',date:'2020-07',kind:'autre',impact:'ressource',themes:['Création'],revision:0,...extra});
function setup(){
 const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');
 f.call=async(path,level=22,method='GET',body)=>{const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+level,'X-WC-User':String(level+1),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})}),f.env);return {status:response.status,data:await response.json()};};
 f.ok=async(...args)=>{const result=await f.call(...args);assert.equal(result.status,200,JSON.stringify(result.data));return result.data;};
 f.clear=()=>f.sql.exec('DELETE FROM private_write_limits');
 f.init=async()=>{for(const level of [22,23,25])await f.ok('/api/private/consent',level,'POST',{consent:true,version:'2026-10-01'});await f.ok('/api/ace-circles',22,'POST',{});};
 f.join=async(level=25)=>{const id=crypto.randomUUID();await f.ok('/api/ace-circles/invitations',22,'POST',{id,target:level+1,recipientNotice:true});await f.ok('/api/ace-circles/invitations/'+id,level,'PUT',{action:'accept'});return id;};
 f.share=(enabled=true)=>f.ok('/api/ace-circles/sharing',22,'PUT',{enabled,consent:enabled,scope:'matter-and-mechanisms'});
 f.save=async(id='event-matter',extra={})=>(await f.ok('/api/life-tree/events/'+id,22,'PUT',event({...(!f.archive?{entryType:'creation',medium:'vidéo',videoBranch:'self',precision:'day',date:'2020-07-01',work:'Notes pour la vidéo'}:{}),...extra}))).event;
 f.topic=id=>f.sql.prepare('SELECT id FROM circle_topics WHERE owner_id=23 AND event_id=? AND target_id IS NULL').get(id).id;
 f.reply=(id,level=25,extra={})=>f.ok('/api/ace-circles/topics/'+id+'/replies',level,'POST',{id:crypto.randomUUID(),text:'Un regard attentif.',...extra});
 return f;
}
test('Matière preserves lived events and supports encrypted creations, filters, drafts and safe external links',async()=>{
 const f=setup();try{
  f.archive=true;await f.init();await f.save();
  for(const medium of ['musique','vidéo','texte','image','autre'])await f.save('creation-'+medium.normalize('NFD').replace(/\p{Diacritic}/gu,''),{entryType:'creation',medium,url:'https://example.com/oeuvre',work:'Mon œuvre intime'});
  const all=await f.ok('/api/life-tree');assert.equal(all.events.length,6);
  assert.equal((await f.ok('/api/life-tree?entryType=creation')).events.length,5);assert.equal((await f.ok('/api/life-tree?entryType=event')).events.length,1);
  for(const row of f.sql.prepare('SELECT payload FROM life_events').all()){assert.ok(!row.payload.includes('œuvre'));assert.ok(!row.payload.includes('example.com'));}
  for(const url of ['javascript:alert(1)','http://example.com','https://user:secret@example.com'])assert.equal((await f.call('/api/life-tree/events/invalid-create',22,'PUT',event({entryType:'creation',medium:'texte',url}))).status,400);
  assert.equal((await f.call('/api/life-tree/events/invalid-create',22,'PUT',event({entryType:'creation',medium:'texte'}))).status,400);
  assert.equal((await f.call('/api/life-tree/events/event-matter',22,'PUT',event({entryType:'creation',medium:'texte',work:'x',revision:1}))).status,400);
  const draft={...event({entryType:'creation',medium:'texte',work:'x'.repeat(10000),date:'2020--'})};await f.ok('/api/life-tree/drafts/draft-creation',22,'PUT',{revision:0,event:draft});assert.equal((await f.ok('/api/life-tree/drafts')).drafts[0].payload.event.work.length,10000);
 }finally{f.sql.close();}
});
test('legacy tree sharing never silently exposes creations, links, mechanisms or new discussions',async()=>{
 const f=setup();try{
  f.archive=true;await f.init();await f.join();await f.save();await f.save('creation-private',{entryType:'creation',medium:'texte',work:'Privé'});
  await f.ok('/api/life-tree/links',22,'POST',{source:'event-matter',target:'creation-private',label:'Lien intime'});
  await f.ok('/api/mechanisms/1',22,'PUT',{title:'Repère privé',description:'Ma réflexion',revision:0});
  f.sql.exec('UPDATE ace_circles SET share_enabled=1,combined_sharing=0 WHERE owner_id=23');
  assert.equal((await f.call('/api/life-tree?owner=23',25)).status,403);assert.equal((await f.call('/api/life-tree/events/event-matter?owner=23',25)).status,404);
  for(const path of ['/api/life-tree/events/creation-private?owner=23','/api/mechanisms?owner=23','/api/ace-circles/23/topics'])assert.ok([403,404].includes((await f.call(path,25)).status));
  assert.equal((await f.call('/api/ace-circles/sharing',22,'PUT',{enabled:true,consent:true})).status,400);
  await f.share();assert.equal((await f.ok('/api/life-tree?owner=23',25)).events.length,0);assert.equal((await f.call('/api/mechanisms?owner=23',25)).status,403);
  assert.equal((await f.ok('/api/ace-circles/23/topics',25)).topics.length,0);assert.equal((await f.ok('/api/ace-circles/23/topics?archive=1')).topics.length,4);
  for(const path of ['/api/mechanisms/export?owner=23','/api/life-tree/drafts?owner=23'])assert.equal((await f.call(path,25)).status,403);
  assert.equal((await f.call('/api/mechanisms/1?owner=23',25,'PUT',{title:'Faux',revision:1})).status,403);
  await f.share(false);for(const path of ['/api/life-tree?owner=23','/api/mechanisms?owner=23','/api/ace-circles/23/topics'])assert.equal((await f.call(path,25)).status,403);
 }finally{f.sql.close();}
});
test('each saved resource owns one lasting thread; changes preserve replies and conflicts never emit activity',async()=>{
 const f=setup();try{
  await f.init();await f.join();await f.share();await f.save();const topic=f.topic('event-matter');await f.reply(topic);
  await f.save('event-matter',{title:'Une autre lecture',revision:1});assert.equal(f.topic('event-matter'),topic);
  assert.equal((await f.call('/api/life-tree/events/event-matter',22,'PUT',event({entryType:'creation',medium:'vidéo',videoBranch:'self',precision:'day',date:'2020-07-01',revision:1}))).status,409);
  const data=await f.ok('/api/ace-circles/topics/'+topic,25);assert.equal(data.topic.revision,2);assert.equal(data.topic.title,'Une autre lecture');assert.equal(data.replies.length,1);
  await f.ok('/api/mechanisms/2',22,'PUT',{title:'Prendre du recul',revision:0});const mechanism=f.sql.prepare("SELECT id FROM circle_topics WHERE mechanism_slot=2").get().id;
  assert.equal((await f.call('/api/ace-circles/topics/'+mechanism,25)).status,403);assert.equal((await f.call('/api/ace-circles/topics/'+mechanism+'/replies',22,'POST',{id:crypto.randomUUID(),text:'Archivé'})).status,410);await f.ok('/api/mechanisms/2',22,'PUT',{title:'',revision:1});assert.equal((await f.call('/api/ace-circles/topics/'+mechanism,25)).status,404);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_messages WHERE topic_id=?').get(mechanism).n,0);
 }finally{f.sql.close();}
});
test('reply trees are idempotent, encrypted, scoped to one resource and limited to accepted members',async()=>{
 const f=setup();try{
  await f.init();await f.save();const topic=f.topic('event-matter');await f.reply(topic,22,{text:'Avant ton arrivée'});await f.join();await f.share();
  assert.equal((await f.ok('/api/ace-circles/topics/'+topic,25)).replies.length,0);
  const first=f.sql.prepare('SELECT id FROM ace_messages').get().id;assert.equal((await f.call('/api/ace-circles/topics/'+topic+'/replies',25,'POST',{id:crypto.randomUUID(),text:'Fuite',parentId:first})).status,404);
  const key=crypto.randomUUID();await f.reply(topic,25,{id:key,text:'<img src=x onerror=alert(1)>'});await f.reply(topic,25,{id:key,text:'<img src=x onerror=alert(1)>'});
  const rows=(await f.ok('/api/ace-circles/topics/'+topic,25)).replies;assert.equal(rows.length,1);assert.equal(rows[0].text,'<img src=x onerror=alert(1)>');
  await f.reply(topic,22,{parentId:rows[0].id});assert.equal((await f.ok('/api/ace-circles/topics/'+topic,25)).replies.at(-1).parentId,rows[0].id);
  await f.save('other-resource');const other=f.topic('other-resource');assert.equal((await f.call('/api/ace-circles/topics/'+other+'/replies',25,'POST',{id:crypto.randomUUID(),text:'Mauvais fil',parentId:rows[0].id})).status,404);
  assert.equal((await f.call('/api/ace-circles/topics/'+topic,23)).status,403);
  assert.equal((await f.call('/api/ace-circles/23/messages',25,'POST',{id:crypto.randomUUID(),text:'Libre'})).status,410);
  assert.equal((await f.call('/api/ace-circles/23/topics',25,'POST',{title:'Faux sujet'})).status,404);
 }finally{f.sql.close();}
});
test('read markers belong to each thread and removal blocks every reply and shared-content path',async()=>{
 const f=setup();try{
  await f.init();const member=await f.join();await f.share();await f.save();await f.save('other-resource');const a=f.topic('event-matter'),b=f.topic('other-resource');await f.reply(a);await f.reply(b);
  const reply=(await f.ok('/api/ace-circles/topics/'+a)).replies[0];await f.ok('/api/ace-circles/topics/'+a+'/read',22,'PUT',{lastId:reply.id});
  const feed=await f.ok('/api/ace-circles/23/topics');assert.equal(feed.topics.find(t=>t.id===a).unread,0);assert.equal(feed.topics.find(t=>t.id===b).unread,1);
  await f.ok('/api/ace-circles/members/'+member,25,'DELETE',{});
  for(const path of ['/api/ace-circles/23/topics','/api/ace-circles/topics/'+a,'/api/mechanisms?owner=23','/api/life-tree?owner=23'])assert.equal((await f.call(path,25)).status,403);
  assert.equal((await f.call('/api/ace-circles/topics/'+a+'/replies',25,'POST',{id:crypto.randomUUID(),text:'Trop tard'})).status,403);
 }finally{f.sql.close();}
});
test('deleted links and events retract their discussions and replies; private drafts emit no topic',async()=>{
 const f=setup();try{
  await f.init();await f.join();await f.share();await f.save();await f.save('creation-linked',{entryType:'creation',medium:'texte',videoBranch:null,work:'Texte'});
  await f.ok('/api/life-tree/links',22,'POST',{source:'event-matter',target:'creation-linked',label:'Ce vécu a nourri ma création'});
  const link=f.sql.prepare("SELECT id FROM circle_topics WHERE kind='link'").get().id;const archived=(await f.ok('/api/ace-circles/topics/'+link)).topic;assert.match(archived.link,/nourri/);assert.equal(archived.archived,true);assert.equal(archived.videoBranch,null);assert.equal((await f.call('/api/ace-circles/topics/'+link,25)).status,403);
  await f.ok('/api/life-tree/links',22,'DELETE',{source:'event-matter',target:'creation-linked'});assert.equal((await f.call('/api/ace-circles/topics/'+link,25)).status,404);
  const before=f.sql.prepare('SELECT count(*) AS n FROM circle_topics').get().n;await f.ok('/api/life-tree/drafts/draft-secret',22,'PUT',{revision:0,event:event({date:''})});assert.equal(f.sql.prepare('SELECT count(*) AS n FROM circle_topics').get().n,before);
  const topic=f.topic('event-matter');await f.reply(topic);await f.ok('/api/life-tree/events/event-matter',22,'DELETE',{revision:1});assert.equal((await f.call('/api/ace-circles/topics/'+topic,25)).status,404);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_messages WHERE topic_id=?').get(topic).n,0);
  assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.sql.close();}
});
test('topic feeds are paginated with bounded queries and conditional polling avoids decrypting unchanged data',async()=>{
 const f=setup();try{
  await f.init();for(let i=0;i<25;i++)await f.save('resource-'+String(i).padStart(4,'0'));f.clear();let queries=0;const original=f.env.DB.prepare;f.env.DB.prepare=(...args)=>{queries++;return original(...args);};
  const first=await f.ok('/api/ace-circles/23/topics');assert.equal(first.topics.length,20);assert.ok(first.next);assert.ok(queries<15,'bounded query count: '+queries);
  queries=0;const same=await f.ok('/api/ace-circles/23/topics?revision='+encodeURIComponent(first.revision));assert.equal(same.unchanged,true);assert.ok(queries<10);
  const second=await f.ok('/api/ace-circles/23/topics?after='+encodeURIComponent(first.next));assert.equal(second.topics.length,5);assert.ok(second.topics.every(t=>!first.topics.some(a=>a.id===t.id)));
 }finally{f.sql.close();}
});
test('additive migration keeps historical content and does not widen previously granted sharing',()=>{
 const db=new DatabaseSync(':memory:');try{
  const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8'),migration=readFileSync(new URL('../migrations/0037_matter_topics.sql',import.meta.url),'utf8');db.exec(schema.slice(0,schema.indexOf("ALTER TABLE life_events ADD COLUMN entry_type")));
  db.exec("INSERT INTO users(id,email,username,password_hash) VALUES(1,'a@local.test','A','unused'); INSERT INTO ace_circles(owner_id,share_enabled) VALUES(1,1); INSERT INTO life_events(id,owner_id,sort_date,precision,kind,impact,payload) VALUES('event-history',1,'2020-01-01','year','autre','ressource','ciphertext'); INSERT INTO ace_messages(owner_id,author_id,event_id,kind,payload,request_id) VALUES(1,1,'event-history','event','','historical-event');");
  db.exec(migration);assert.equal(db.prepare('SELECT payload FROM life_events').get().payload,'ciphertext');assert.equal(db.prepare('SELECT combined_sharing FROM ace_circles').get().combined_sharing,0);assert.ok(db.prepare('SELECT topic_id FROM ace_messages').get().topic_id);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();}
});

test('reply synchronization removes deleted messages even when new replies arrive simultaneously',async()=>{
 const f=setup();try{
  await f.init();await f.join();await f.share();await f.save();const topic=f.topic('event-matter'),path='/api/ace-circles/topics/'+topic;
  await f.reply(topic);const first=(await f.ok(path)).replies[0].id;
  await f.ok('/api/ace-circles/messages/'+first,25,'DELETE',{});await f.reply(topic,22);
  const next=await f.ok(path+'?after='+first+'&known='+first);assert.deepEqual(next.removed,[first]);assert.equal(next.replies.length,1);
  assert.equal((await f.call(path+'?known=1,invalid')).status,400);
  assert.equal((await f.call(path+'?known='+Array(401).fill(1).join(','))).status,400);
 }finally{f.sql.close();}
});

test('revoking sharing while a reply is prepared prevents the delayed write',async()=>{
 const f=setup();try{
  await f.init();await f.join();await f.share();await f.save();const topic=f.topic('event-matter');let revoked=false;const original=f.env.DB.prepare;
  f.env.DB.prepare=(query,...args)=>{if(query.includes('INSERT OR IGNORE INTO ace_messages')&&!revoked){revoked=true;f.sql.exec('UPDATE ace_circles SET combined_sharing=0,share_enabled=0,access_revision=access_revision+1 WHERE owner_id=23');}return original(query,...args);};
  assert.equal((await f.call('/api/ace-circles/topics/'+topic+'/replies',25,'POST',{id:crypto.randomUUID(),text:'Trop tard'})).status,403);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_messages').get().n,0);
 }finally{f.sql.close();}
});

test('withdrawing storage consent also removes read metadata in other people’s circles',async()=>{
 const f=setup();try{
  await f.init();await f.join();await f.share();await f.save();const topic=f.topic('event-matter');await f.reply(topic,22);const reply=(await f.ok('/api/ace-circles/topics/'+topic,25)).replies[0].id;
  await f.ok('/api/ace-circles/topics/'+topic+'/read',25,'PUT',{lastId:reply});
  f.sql.prepare('INSERT INTO ace_read_markers(owner_id,reader_id,last_id) VALUES(23,26,?)').run(reply);
  await f.ok('/api/private/data',25,'DELETE',{confirm:'SUPPRIMER'});
  for(const table of ['circle_topic_reads','ace_read_markers'])assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM ${table} WHERE reader_id=26`).get().n,0);
  assert.equal((await f.call('/api/ace-circles/topics/'+topic,25)).status,403);
 }finally{f.sql.close();}
});
