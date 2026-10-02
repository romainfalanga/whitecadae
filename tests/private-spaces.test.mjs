import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';
import {NODES} from '../src/echelon.js';
import {seal,unseal,tagHash} from '../src/private-data.js';

const event=(extra={})=>({title:'Un souvenir personnel',precision:'year',date:'2019',kind:'rencontre',impact:'ressource',story:'Texte intime confidentiel',feelings:'Joie',understanding:'Une lecture personnelle',resources:'Mes proches',themes:['Confiance'],revision:0,...extra});
function setup(){
  const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');
  const signs=NODES.flatMap(n=>n.answers.map(a=>a.id));
  for(let id=201;id<=214;id++){
    f.sql.prepare('INSERT INTO users(id,email,username,password_hash) VALUES(?,?,?,?)').run(id,`angel${id}@local.test`,`Ange ${id}`,'unused');
    f.sql.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run('angel'+id,id,'2099-01-01');
    for(const riddle of signs.slice(0,19))f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(id,riddle,'2026-09-26');
    f.sql.prepare("INSERT INTO privacy_consents(user_id,purpose,version,granted) VALUES(?,'storage','2026-10-01',1)").run(id);
  }
  f.call=async(path,id=201,method='GET',body,headers={})=>{
    const token=id>=201?'angel'+id:id===0?'invalid':'qa'+(id-1);
    const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session='+token,'X-WC-User':String(id),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),f.env);
    let data=null;try{data=await response.clone().json();}catch{}return {status:response.status,data,response};
  };
  f.ok=async(...args)=>{const r=await f.call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
  f.clearLimits=()=>f.sql.exec('DELETE FROM private_write_limits');
  return f;
}
async function preferences(f,id,listed=true){await f.ok('/api/ace-circles/preferences',id,'PUT',{listed,intro:'Je propose mon écoute.'});}
async function invite(f,owner,angel){await preferences(f,angel);const id=crypto.randomUUID();await f.ok('/api/ace-circles/invitations',owner,'POST',{id,target:angel,recipientNotice:true});return id;}
async function join(f,owner,angel){const id=await invite(f,owner,angel);await f.ok('/api/ace-circles/invitations/'+id,angel,'PUT',{action:'accept'});return id;}
async function sharing(f,owner=201,enabled=true){await f.ok('/api/ace-circles/sharing',owner,'PUT',{enabled,consent:enabled});}
async function save(f,owner=201,id=crypto.randomUUID(),extra={}){return (await f.ok('/api/life-tree/events/'+id,owner,'PUT',event(extra))).event;}
async function send(f,owner,author,extra={}){return f.ok(`/api/ace-circles/${owner}/messages`,author,'POST',{id:crypto.randomUUID(),text:'Un message privé.',...extra});}

test('exact canonical thresholds; no anonymous, legacy or administrator bypass; old routes remain retired',async()=>{
 const f=setup();try{
   for(const [path,below,above] of [['/api/game-master-orange',11,12],['/api/life-tree',18,19],['/api/ace-circles',19,201]]){
     assert.equal((await f.call(path,0)).status,401);assert.equal((await f.call(path,below)).status,403);assert.equal((await f.call(path,above)).status,200);assert.equal((await f.call(path,100)).status,403);
   }
   const caps=(await f.ok('/api/me',201)).access;assert.ok(caps.gameMaster&&caps.lifeTree&&caps.aceSquare);
   for(const path of ['/api/carre','/api/arbres','/api/conversation','/api/community'])assert.equal((await f.call(path,201)).status,410);
 }finally{f.sql.close();}
});
test('every new write requires same-origin JSON, account context and bounded objects',async()=>{
 const f=setup();try{
   assert.equal((await f.call('/api/ace-circles',201,'POST',{}, {'Origin':'https://evil.test'})).status,403);
   assert.equal((await f.call('/api/ace-circles',201,'POST',{}, {'Content-Type':'text/plain'})).status,415);
   assert.equal((await f.call('/api/ace-circles',201,'POST',{}, {'X-WC-User':'202'})).status,409);
   assert.equal((await f.call('/api/ace-circles',201,'POST',[])).status,400);
   assert.equal((await f.call('/api/ace-circles',201,'POST',{text:'x'.repeat(48001)})).status,413);
   const response=(await f.call('/api/life-tree')).response;assert.equal(response.headers.get('Cache-Control'),'no-store');
 }finally{f.sql.close();}
});
test('storage consent is separate from whole-tree sharing and never implicitly checked',async()=>{
 const f=setup();try{
   f.sql.exec('DELETE FROM privacy_consents WHERE user_id=201');
   assert.equal((await f.call('/api/life-tree/events/event-0001',201,'PUT',event())).status,409);
   assert.equal((await f.call('/api/private/consent',201,'POST',{consent:false,version:'2026-10-01'})).status,400);
   await f.ok('/api/private/consent',201,'POST',{consent:true,version:'2026-10-01'});await save(f);
   assert.equal((await f.call('/api/ace-circles/sharing',201,'PUT',{enabled:true})).status,400);
   assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_circles WHERE share_enabled=1').get().n,0);
 }finally{f.sql.close();}
});
test('events validate real dates, encrypt texts, isolate owners, preserve revisions and support filters/links/export',async()=>{
 const f=setup();try{
   for(const extra of [{precision:'day',date:'2023-02-29'},{precision:'month',date:'2023-13'},{precision:'period',date:'2020-01-01',endDate:'2019-01-01'},{themes:['a'.repeat(61)]},{title:{}},{kind:'<script>'}])assert.equal((await f.call('/api/life-tree/events/event-0001',201,'PUT',event(extra))).status,400);
   const a=await save(f,201,'event-0001'),b=await save(f,201,'event-0002',{precision:'unknown',date:'',title:'Sans date'});
   const stored=f.sql.prepare('SELECT payload FROM life_events WHERE id=?').get(a.id).payload;assert.ok(stored.startsWith('test.'));assert.ok(!stored.includes('confidentiel'));
   assert.equal((await f.call('/api/life-tree/events/'+a.id,202)).status,404);assert.equal((await f.call('/api/life-tree?owner=201',202)).status,403);
   const list=await f.ok('/api/life-tree?theme=confiance&kind=rencontre&impact=ressource&to=2020-12-31');assert.deepEqual(list.events.map(e=>e.id),[a.id]);
   await f.ok('/api/life-tree/links',201,'POST',{source:a.id,target:b.id,label:'Un même thème'});
   await save(f,202,'other-0001');assert.equal((await f.call('/api/life-tree/links',201,'POST',{source:a.id,target:'other-0001',label:'Intrusion'})).status,400);
   const updated=await save(f,201,a.id,{revision:1,title:'Nouvelle lecture'});assert.equal(updated.revision,2);
   assert.equal((await f.call('/api/life-tree/events/'+a.id,201,'PUT',event({revision:1,title:'Écrasement'}))).status,409);
   assert.equal((await f.ok('/api/life-tree/events/'+a.id)).event.title,'Nouvelle lecture');
   const exported=await f.ok('/api/life-tree/export');assert.equal(exported.events.length,2);assert.equal(exported.links.length,1);
   await f.ok('/api/life-tree/events/'+a.id,201,'DELETE',{revision:2});assert.equal(f.sql.prepare('SELECT count(*) AS n FROM life_links').get().n,0);
 }finally{f.sql.close();}
});
test('drafts accept incomplete dates, remain private under global sharing, and use compare-and-swap',async()=>{
 const f=setup();try{
   await join(f,201,202);await sharing(f);
   await f.ok('/api/life-tree/drafts/draft-0001',201,'PUT',{revision:0,event:event({title:'',date:''})});
   assert.equal((await f.call('/api/life-tree/drafts?owner=201',202)).status,403);
   assert.equal((await f.ok('/api/life-tree?owner=201',202)).events.length,0);
   assert.equal((await f.ok('/api/ace-circles/201/messages',202)).messages.length,0);
   assert.equal((await f.call('/api/life-tree/drafts/draft-0001',201,'PUT',{revision:0,event:event()})).status,409);
   assert.equal((await f.ok('/api/life-tree/drafts')).drafts[0].revision,1);
 }finally{f.sql.close();}
});
test('exact username search exposes only an identity, never trees, and contextual avatars remain protected',async()=>{
 const f=setup();try{
   assert.equal((await f.ok('/api/ace-circles/directory')).people.length,0);
   assert.equal((await f.ok('/api/ace-circles/directory?q=Ange')).people.length,0);
   let p=(await f.ok('/api/ace-circles/directory?q=Ange%20202')).people[0];assert.equal(p.id,202);assert.deepEqual(Object.keys(p).sort(),['id','username']);
   assert.equal((await f.call('/api/life-tree?owner=202')).status,403);
   await preferences(f,202);
   f.sql.prepare("UPDATE users SET avatar_data='aGVsbG8=',avatar_mime='image/png' WHERE id=202").run();assert.equal((await f.call('/api/ace-circles/avatar/202')).status,200);
   await preferences(f,202,false);assert.equal((await f.call('/api/ace-circles/avatar/202')).status,404);
   const code=(await f.ok('/api/ace-circles',202)).preferences.code;
   await f.ok('/api/ace-circles',202,'POST',{});
   const id=crypto.randomUUID();await f.ok('/api/ace-circles/invitations',201,'POST',{id,code,direction:'request'});
   assert.equal((await f.call('/api/ace-circles/invitations/'+id,202,'PUT',{action:'accept'})).status,400);
   await f.ok('/api/ace-circles/invitations/'+id,202,'PUT',{action:'accept',recipientNotice:true});
   assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_memberships WHERE owner_id=202 AND angel_id=201').get().n,1);
   await f.ok('/api/ace-circles/blocks',201,'POST',{target:202});assert.equal((await f.call('/api/ace-circles/avatar/202')).status,404);
 }finally{f.sql.close();}
});
test('simultaneous acceptance cannot exceed four angels or four accompanied circles',async()=>{
 const f=setup();try{
   const ids=[];for(let angel=202;angel<=206;angel++)ids.push([angel,await invite(f,201,angel)]);
   const accepted=await Promise.all(ids.map(([angel,id])=>f.call('/api/ace-circles/invitations/'+id,angel,'PUT',{action:'accept'})));
   assert.deepEqual(accepted.map(r=>r.status).sort(),[200,200,200,200,409]);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_memberships WHERE owner_id=201').get().n,4);
   f.clearLimits();
   const requests=[];for(let owner=207;owner<=211;owner++)requests.push(await invite(f,owner,212));
   const result=await Promise.all(requests.map(id=>f.call('/api/ace-circles/invitations/'+id,212,'PUT',{action:'accept'})));
   assert.deepEqual(result.map(r=>r.status).sort(),[200,200,200,200,409]);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_memberships WHERE angel_id=212').get().n,4);
   assert.ok(f.sql.prepare('SELECT max(owner_slot) AS n FROM ace_memberships').get().n<=4);
 }finally{f.sql.close();}
});
test('reciprocal circles are independent; self, expiry, cancellation, outsiders and changed levels are rejected',async()=>{
 const f=setup();try{
   await join(f,201,202);await join(f,202,201);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_memberships').get().n,2);
   assert.equal((await f.call('/api/ace-circles/invitations',201,'POST',{id:crypto.randomUUID(),target:201,recipientNotice:true})).status,404);
   const id=await invite(f,201,203);assert.equal((await f.call('/api/ace-circles/invitations/'+id,204,'PUT',{action:'accept'})).status,404);
   assert.equal((await f.call('/api/ace-circles/invitations/'+id,201,'PUT',{action:'accept'})).status,403);
   f.sql.prepare("UPDATE ace_invitations SET expires_at='2020-01-01' WHERE id=?").run(id);assert.equal((await f.call('/api/ace-circles/invitations/'+id,203,'PUT',{action:'accept'})).status,409);
   f.clearLimits();const another=await invite(f,201,204);f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=204').run();assert.equal((await f.call('/api/ace-circles/invitations/'+another,204,'PUT',{action:'accept'})).status,403);
 }finally{f.sql.close();}
});
test('whole-tree consent, per-membership history, revocation, event threads and deletion cover every access path',async()=>{
 const f=setup();try{
   await f.ok('/api/ace-circles',201,'POST',{});await send(f,201,201,{text:'Avant ton arrivée'});const e=await save(f);
   const membership=await join(f,201,202);
   assert.equal((await f.ok('/api/ace-circles/201/messages',202)).messages.length,0);assert.equal((await f.call('/api/life-tree?owner=201',202)).status,403);
   await sharing(f);assert.equal((await f.ok('/api/life-tree?owner=201',202)).events[0].id,e.id);
   assert.equal((await f.call('/api/life-tree/events/'+e.id+'?owner=201',202,'PUT',event({revision:1}))).status,403);
   await send(f,201,202,{eventId:e.id});await send(f,201,201,{text:'Conversation générale'});
   const before=await f.ok('/api/ace-circles/201/messages',202);assert.equal(before.messages.length,2);const related=before.messages.find(m=>m.eventId);
   await sharing(f,201,false);assert.equal((await f.call('/api/life-tree/events/'+e.id+'?owner=201',202)).status,403);assert.equal((await f.ok('/api/ace-circles/201/messages',202)).messages.length,1);
   assert.equal((await f.call('/api/ace-circles/201/messages',202,'POST',{id:crypto.randomUUID(),text:'Fuite',parentId:related.id})).status,404);
   await sharing(f);await f.ok('/api/life-tree/events/'+e.id,201,'DELETE',{revision:1});assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_messages WHERE event_id=?').get(e.id).n,0);
   await f.ok('/api/ace-circles/members/'+membership,202,'DELETE',{});
   assert.equal((await f.call('/api/ace-circles/201/messages',202)).status,403);assert.equal((await f.call('/api/ace-circles/201/read',202,'PUT',{lastId:999})).status,403);
   f.clearLimits();await join(f,201,202);assert.equal((await f.ok('/api/ace-circles/201/messages',202)).messages.length,0);
 }finally{f.sql.close();}
});
test('messages and event activity are idempotent; threaded replies cannot cross circle or history',async()=>{
 const f=setup();try{
   await join(f,201,202);await join(f,203,202);await sharing(f);const e=await save(f);
   await save(f,201,e.id,{revision:1});assert.equal(f.sql.prepare("SELECT count(*) AS n FROM ace_messages WHERE kind='event'").get().n,1);
   const id=crypto.randomUUID();await send(f,201,202,{id,text:'<img src=x onerror=alert(1)>'});await send(f,201,202,{id,text:'<img src=x onerror=alert(1)>'});
   const rows=(await f.ok('/api/ace-circles/201/messages',202)).messages;assert.equal(rows.length,2);const message=rows.find(m=>m.kind==='message');assert.equal(message.text,'<img src=x onerror=alert(1)>');
   assert.equal((await f.call('/api/ace-circles/203/messages',202,'POST',{id:crypto.randomUUID(),text:'Wrong circle',parentId:message.id})).status,404);
   await send(f,201,201,{parentId:message.id});assert.equal((await f.ok('/api/ace-circles/201/messages?parent='+message.id,202)).messages.length,1);
   await f.ok('/api/ace-circles/reports',201,'POST',{owner:201,messageId:message.id,reason:'Contenu choisi'});assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_reports').get().n,1);
   assert.equal((await f.call('/api/ace-circles/reports',204,'POST',{owner:201,messageId:message.id,reason:'Intrusion'})).status,403);
 }finally{f.sql.close();}
});

test('AS access is directed, never transitive between co-members, and pending invitations grant no tree access',async()=>{
 const f=setup();try{
  await join(f,201,202);await join(f,201,203);await sharing(f,202);const e=await save(f,202);
  for(const who of [201,203,204]){
   assert.equal((await f.call('/api/life-tree?owner=202',who)).status,403);
   assert.equal((await f.call('/api/life-tree/events/'+e.id+'?owner=202',who)).status,403);
  }
  const id=await invite(f,202,203);assert.equal((await f.call('/api/life-tree?owner=202',203)).status,403);
  await f.ok('/api/ace-circles/invitations/'+id,203,'PUT',{action:'accept'});
  assert.equal((await f.ok('/api/life-tree?owner=202',203)).events.length,1);
  await f.ok('/api/ace-circles/members/'+id,203,'DELETE',{});
  assert.equal((await f.call('/api/life-tree/events/'+e.id+'?owner=202',203)).status,403);
 }finally{f.sql.close();}
});
test('delayed message is rejected when a membership is removed during encryption / query preparation',async()=>{
 const f=setup();try{
   const membership=await join(f,201,202),original=f.env.DB.prepare;let removed=false;
   f.env.DB.prepare=(query,...args)=>{if(query.includes('INSERT OR IGNORE INTO ace_messages')&&!removed){removed=true;f.sql.prepare('DELETE FROM ace_memberships WHERE id=?').run(membership);}return original(query,...args);};
   const r=await f.call('/api/ace-circles/201/messages',202,'POST',{id:crypto.randomUUID(),text:'Too late'});assert.equal(r.status,403);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_messages').get().n,0);
 }finally{f.sql.close();}
});
test('account deletion cascades private data without deleting somebody else’s conversation; loss of level keeps export and erasure',async()=>{
 const f=setup();try{
   await join(f,201,202);await join(f,203,202);await save(f,202);await send(f,203,202);await send(f,203,203);await save(f,201);
   f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=201').run();assert.equal((await f.call('/api/life-tree',201)).status,403);assert.equal((await f.ok('/api/life-tree/export',201)).events.length,1);
   await f.ok('/api/life-tree',201,'DELETE',{confirm:'SUPPRIMER'});assert.equal((await f.ok('/api/life-tree/export',201)).events.length,0);
   f.sql.prepare('DELETE FROM users WHERE id=202').run();assert.equal(f.sql.prepare('SELECT count(*) AS n FROM life_events WHERE owner_id=202').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_messages WHERE owner_id=203').get().n,1);
 }finally{f.sql.close();}
});
test('AES-GCM rejects row swaps; key rotation keeps old ciphertext and stable private tag indexes',async()=>{
 const f=setup();try{
   const sealed=await seal(f.env,'life:201:event-0001',{secret:'private'});assert.deepEqual(await unseal(f.env,'life:201:event-0001',sealed),{secret:'private'});await assert.rejects(unseal(f.env,'life:202:event-0001',sealed));
   const keyring=JSON.parse(f.env.PRIVATE_DATA_KEYS),next={...f.env,PRIVATE_DATA_KEYS:JSON.stringify({...keyring,active:'next',keys:{...keyring.keys,next:Buffer.alloc(32,4).toString('base64')}})};
   assert.deepEqual(await unseal(next,'life:201:event-0001',sealed),{secret:'private'});assert.ok((await seal(next,'life:201:event-0001',{})).startsWith('next.'));
   assert.equal(await tagHash(next,201,'Confiance'),await tagHash(f.env,201,'confiance'));assert.notEqual(await tagHash(next,201,'Confiance'),await tagHash(next,202,'Confiance'));
 }finally{f.sql.close();}
});
test('withdrawing storage consent erases own private spaces and messages, preserving accounts and progression',async()=>{
 const f=setup();try{
   await join(f,201,202);await join(f,203,201);await save(f);await send(f,203,201);await send(f,203,203);
   const signs=f.sql.prepare('SELECT count(*) AS n FROM riddle_progress WHERE user_id=201').get().n;
   assert.equal((await f.call('/api/private/data',201,'DELETE',{confirm:'no'})).status,400);
   await f.ok('/api/private/data',201,'DELETE',{confirm:'SUPPRIMER'});
   for(const [table,column] of [['life_events','owner_id'],['ace_circles','owner_id'],['ace_memberships','angel_id'],['ace_messages','author_id']])assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column}=201`).get().n,0);
   assert.equal((await f.ok('/api/private/consent')).consented,false);
   assert.equal(f.sql.prepare('SELECT count(*) AS n FROM riddle_progress WHERE user_id=201').get().n,signs);
   assert.equal(f.sql.prepare('SELECT count(*) AS n FROM ace_messages WHERE owner_id=203').get().n,1);
 }finally{f.sql.close();}
});
test('moderation exposes only voluntarily reported messages, never any tree, and is administrator-only',async()=>{
 const f=setup();try{
   await join(f,201,202);await send(f,201,202,{text:'Texte choisi pour le signalement'});const message=(await f.ok('/api/ace-circles/201/messages')).messages[0];
   await save(f,201,'private-tree',{story:'Ne doit jamais apparaître en modération'});
   await f.ok('/api/ace-circles/reports',201,'POST',{owner:201,messageId:message.id,reason:'Motif volontaire'});
   assert.equal((await f.call('/api/private/reports',201)).status,403);
   const reports=await f.ok('/api/private/reports',100);assert.equal(reports.reports.length,1);assert.doesNotMatch(JSON.stringify(reports),/Ne doit jamais/);
   assert.equal((await f.call('/api/life-tree?owner=201',100)).status,403);
   await f.ok('/api/private/reports',100,'PUT',{id:reports.reports[0].id});assert.equal((await f.ok('/api/private/reports',100)).reports.length,0);
 }finally{f.sql.close();}
});
test('large synthetic trees and conversations remain bounded, indexed and cursor-paginated',async()=>{
 const f=setup();try{
   await f.ok('/api/ace-circles',201,'POST',{});
   const insert=f.sql.prepare("INSERT INTO life_events(id,owner_id,sort_date,precision,kind,impact,payload) VALUES(?,201,'2019-01-01','year','autre','ressource',?)");
   for(let i=0;i<1000;i++){const id='event-'+String(i).padStart(5,'0');insert.run(id,await seal(f.env,`life:201:${id}`,event()));}
   const msg=f.sql.prepare("INSERT INTO ace_messages(owner_id,author_id,payload,request_id) VALUES(201,201,?,?)");
   for(let i=0;i<10000;i++){const key='message-'+i;msg.run(await seal(f.env,`message:201:201:${key}`,{text:'Texte fictif '+i}),key);}
   const tree=await f.ok('/api/life-tree');assert.equal(tree.events.length,30);assert.ok(tree.next);
   assert.equal((await f.ok('/api/life-tree?after='+encodeURIComponent(tree.next))).events.length,30);
   const exported=await f.ok('/api/life-tree/export');assert.equal(exported.events.length,30);assert.ok(exported.next);
   const messages=await f.ok('/api/ace-circles/201/messages');assert.equal(messages.messages.length,40);assert.ok(messages.more);assert.equal(messages.messages.at(-1).text,'Texte fictif 9999');
   const previous=await f.ok('/api/ace-circles/201/messages?before='+messages.messages[0].id);assert.equal(previous.messages.length,40);assert.ok(previous.messages.at(-1).id<messages.messages[0].id);
   assert.equal(f.sql.prepare('SELECT message_count FROM ace_circles WHERE owner_id=201').get().message_count,10000);
   assert.match(f.sql.prepare('EXPLAIN QUERY PLAN SELECT id FROM ace_messages WHERE owner_id=201 AND id>9000 ORDER BY id LIMIT 41').all().map(r=>r.detail).join(' '),/idx_ace_messages/);
   assert.match(f.sql.prepare("EXPLAIN QUERY PLAN SELECT id FROM life_events WHERE owner_id=201 ORDER BY sort_date,id LIMIT 31").all().map(r=>r.detail).join(' '),/idx_life_order/);
 }finally{f.sql.close();}
});
