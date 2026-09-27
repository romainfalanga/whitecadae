import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';
import {NODES} from '../src/echelon.js';
const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
function setup(){const f=fixture();const call=async(level,path,method='GET',body,headers={})=>{const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+level,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),f.env);return {status:response.status,data:await response.json()};};const create=(level,kind='projects')=>call(level,'/api/conversation/'+kind,'POST',{title:'Ensemble '+kind,description:'Une réflexion collective',client_id:crypto.randomUUID()});return {...f,call,create};}
test('projects have independent atomic quotas at 12, 18 and 23 and inaccessible directories do not leak rooms',async()=>{
  const f=setup();for(const level of [0,11,99])assert.equal((await f.create(level)).status,403);
  for(const [level,count] of [[12,1],[17,1],[18,2],[22,2],[23,3]]){
    assert.equal((await f.create(level,'topics')).status,201);
    const results=await Promise.all(Array.from({length:5},()=>f.create(level)));
    assert.equal(results.filter(r=>r.status===201).length,count);
    const list=await f.call(level,'/api/conversation/projects');assert.equal(list.data.allowance.used,count);assert.ok(list.data.topics.every(t=>t.kind==='project'));
  }
  assert.equal((await f.call(11,'/api/community/rooms/1')).status,403);f.sql.close();
});
test('room editing preserves distinct fields, requires ownership, checks links and refuses lost updates',async()=>{
  const f=setup(),{data:{id}}=await f.create(12);const path='/api/community/rooms/'+id;
  assert.equal((await f.call(13,path,'PATCH',{revision:0,title:'Hijack'})).status,403);
  assert.equal((await f.call(12,path,'PATCH',{revision:0,goal:'Réaliser un atelier',needs:'Un lieu',question:'Ignored for project',resources:[{label:'X',url:'javascript:alert(1)'}]})).status,400);
  assert.equal((await f.call(12,path,'PATCH',{revision:0,goal:'Réaliser un atelier',needs:'Un lieu',question:'Ignored for project',resources:[{label:'Lecture',url:'https://example.org'}]})).status,200);
  const room=(await f.call(13,path)).data.room;assert.equal(room.goal,'Réaliser un atelier');assert.equal(room.question,'');assert.equal(room.can_edit,false);assert.equal(room.revision,1);
  assert.equal((await f.call(12,path,'PATCH',{revision:0,title:'Old'})).status,409);
  assert.equal((await f.call(12,path,'PATCH',{revision:1,title:'Cross origin'},{Origin:'https://evil.test'})).status,403);f.sql.close();
});
test('any eligible collaborator can propose and claim an action, with idempotency and exclusive responsibility',async()=>{
  const f=setup(),{data:{id}}=await f.create(12);const path='/api/community/rooms/'+id,body={title:'Trouver un lieu',client_id:crypto.randomUUID()};
  const first=await f.call(13,path+'/actions','POST',body),retry=await f.call(13,path+'/actions','POST',body);assert.equal(first.status,201);assert.equal(first.data.id,retry.data.id);
  const action='/api/community/actions/'+first.data.id;
  const claims=await Promise.all([13,18].map(level=>f.call(level,action,'PATCH',{action:'claim',revision:0})));assert.equal(claims.filter(x=>x.status===200).length,1);
  const winner=claims[0].status===200?13:18,loser=winner===13?18:13;
  assert.equal((await f.call(loser,action,'PATCH',{action:'done',revision:1})).status,403);
  assert.equal((await f.call(winner,action,'PATCH',{action:'done',revision:1})).status,200);
  assert.equal((await f.call(12,path)).data.actions[0].status,'done');
  assert.equal((await f.call(12,action,'PATCH',{action:'reopen',revision:2})).status,200);
  const topic=(await f.create(12,'topics')).data.id;assert.equal((await f.call(12,'/api/community/rooms/'+topic+'/actions','POST',body)).status,400);f.sql.close();
});
test('brainstorms link to rooms, respect dates, freeze message audiences, and preserve archives',async()=>{
  const f=setup(),{data:{id}}=await f.create(12);const create={title:'Préparer un atelier',starts_at:new Date(Date.now()+3600000).toISOString(),duration_minutes:60,client_id:crypto.randomUUID(),min_echelon:1};
  assert.equal((await f.call(13,'/api/community/rooms/'+id+'/brainstorms','POST',create)).status,403);
  const meeting=(await f.call(12,'/api/community/rooms/'+id+'/brainstorms','POST',create)).data.id,path='/api/community/brainstorms/'+meeting;
  let data=(await f.call(12,path)).data;assert.equal(data.brainstorm.min_echelon,12);assert.equal(data.brainstorm.state,'planned');assert.equal(data.brainstorm.live,null);
  const body={body:'Une idée',client_id:crypto.randomUUID(),author_echelon:1};assert.equal((await f.call(12,path+'/messages','POST',body)).status,409);
  assert.equal((await f.call(12,path,'PATCH',{revision:0,action:'start'})).status,200);
  const sent=await f.call(18,path+'/messages','POST',body);assert.equal(sent.status,201);assert.equal(sent.data.message.author_echelon,18);
  assert.equal((await f.call(12,path)).data.messages.length,0);assert.equal((await f.call(18,path)).data.messages.length,1);
  f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(19,ids[17],'now');
  assert.equal((await f.call(18,path+'/messages','POST',body)).data.message.author_echelon,18);
  assert.equal((await f.call(12,path+'/voice','POST',{})).status,410);
  assert.equal((await f.call(12,path+'/live','GET',undefined,{Origin:'https://evil.test',Upgrade:'websocket'})).status,403);
  assert.equal((await f.call(12,path,'PATCH',{revision:1,action:'end',summary:'Décision commune'})).status,200);
  assert.equal((await f.call(18,path+'/messages','POST',{...body,client_id:crypto.randomUUID()})).status,409);
  assert.equal((await f.call(18,path)).data.brainstorm.summary,'Décision commune');assert.equal((await f.call(12,'/api/community/brainstorms?scope=past')).data.brainstorms.length,1);f.sql.close();
});
test('higher-level sessions are hidden even from lower-level room owners and retain server-created websocket claims',async()=>{
  const f=setup(),{data:{id}}=await f.create(18);const m=(await f.call(18,'/api/community/rooms/'+id+'/brainstorms','POST',{title:'Séance avancée',client_id:crypto.randomUUID()})).data.id;
  assert.equal((await f.call(12,'/api/community/brainstorms/'+m)).status,404);assert.equal((await f.call(12,'/api/community/rooms/'+id)).data.brainstorms.length,0);
  let request;f.env.BRAINSTORM_LIVE={idFromName:x=>x,get:()=>({fetch:r=>{request=r;return new Response(JSON.stringify({ok:true}));}})};
  await f.call(18,'/api/community/brainstorms/'+m+'/live','GET',undefined,{Origin:'https://test.local',Upgrade:'websocket','X-WC-Identity':'forged'});
  const claims=JSON.parse(decodeURIComponent(request.headers.get('X-WC-Identity')));assert.equal(claims.userId,19);assert.equal(claims.echelon,18);assert.equal(claims.voiceAllowed,undefined);f.sql.close();
});
test('external live links are validated, owner-editable, level-gated and preserve optimistic revisions',async()=>{
  const f=setup(),{data:{id}}=await f.create(18);const endpoint='/api/community/rooms/'+id+'/brainstorms';
  const request={title:'Parlons ensemble',client_id:crypto.randomUUID(),live_url:'https://www.twitch.tv/Example_Channel?ref=tracking'};
  const created=await f.call(18,endpoint,'POST',request);assert.equal(created.status,201);const path='/api/community/brainstorms/'+created.data.id;
  let meeting=(await f.call(18,path)).data.brainstorm;assert.equal(meeting.live.provider,'twitch');assert.equal(meeting.live_url,'https://www.twitch.tv/example_channel');
  assert.equal((await f.call(12,path)).status,404);assert.equal((await f.call(23,path,'PATCH',{revision:0,live_url:'https://discord.gg/testing'})).status,403);
  assert.equal((await f.call(18,path,'PATCH',{revision:0,live_url:'https://youtube.com.evil.test/watch?v=abcdefghijk'})).status,400);
  assert.equal((await f.call(18,path,'PATCH',{revision:0,live_url:'https://youtu.be/abcdefghijk'})).status,200);
  meeting=(await f.call(18,path)).data.brainstorm;assert.equal(meeting.live.id,'abcdefghijk');assert.equal(meeting.live.provider,'youtube');
  assert.equal((await f.call(18,path,'PATCH',{revision:0,live_url:''})).status,409);
  assert.equal((await f.call(18,path,'PATCH',{revision:1,live_url:''})).status,200);assert.equal((await f.call(18,path)).data.brainstorm.live,null);f.sql.close();
});
test('adding external links migrates existing brainstorms without changing their access or contents',async()=>{
  const f=setup(),{data:{id}}=await f.create(12);f.sql.exec('ALTER TABLE community_brainstorms DROP COLUMN live_url');
  f.sql.prepare('INSERT INTO community_brainstorms(room_id,user_id,title,starts_at,ends_at,min_echelon,summary,client_id) VALUES(?,?,?,?,?,?,?,?)').run(id,13,'Séance conservée',Date.now()-1000,Date.now()+60000,12,'Synthèse conservée','historical-client-id');
  const result=await f.call(12,'/api/community/brainstorms/1');assert.equal(result.status,200);assert.equal(result.data.brainstorm.summary,'Synthèse conservée');assert.equal(result.data.brainstorm.live,null);assert.equal(result.data.brainstorm.min_echelon,12);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM community_brainstorms').get().n,1);f.sql.close();
});
