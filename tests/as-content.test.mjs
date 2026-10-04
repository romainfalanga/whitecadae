import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';
import {gameLevel,progress} from '../src/echelon.js';

function setup(){
 const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');
 f.call=async(path,level=22,method='GET',body)=>{
  const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+level,'X-WC-User':String(level+1),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
  return {status:r.status,data:await r.json(),cache:r.headers.get('Cache-Control')};
 };
 f.ok=async(...args)=>{const r=await f.call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 f.invite=async(level=25)=>{const id=crypto.randomUUID();await f.ok('/api/ace-circles/invitations',22,'POST',{id,target:level+1,recipientNotice:true});return id;};
 f.join=async()=>{const id=await f.invite();await f.ok('/api/ace-circles/invitations/'+id,25,'PUT',{action:'accept'});return id;};
 return f;
}
const video={title:'Une vidéo',entryType:'creation',medium:'vidéo',videoBranch:'self',url:'https://youtu.be/M7lc1UVf-VE',precision:'day',date:'2026-10-01',kind:'autre',impact:'à explorer',themes:[],revision:0};

test('accepted AS read current chosen and innate mechanisms; pending, strangers, reverse relations, edits and exports stay blocked',async()=>{
 const f=setup();try{
  await f.ok('/api/private/consent',22,'POST',{consent:true,version:'2026-10-01'});
  await f.ok('/api/mechanisms/6',22,'PUT',{format:2,title:'Ma réaction',description:'Un fonctionnement',improvement:'Un ajustement',anchor:'Une pause',revision:0});
  const id=await f.invite();assert.equal((await f.call('/api/mechanisms?owner=23',25)).status,403);
  await f.ok('/api/ace-circles/invitations/'+id,25,'PUT',{action:'accept'});
  const read=await f.call('/api/mechanisms?owner=23',25);assert.equal(read.status,200);assert.match(read.cache,/no-store/);assert.equal(read.data.editable,false);assert.equal(read.data.mechanisms.length,10);
  assert.equal(read.data.mechanisms[0].title,'Toujours faire mieux');assert.equal(read.data.mechanisms[5].improvement,'Un ajustement');
  for(const level of [17,18,23])assert.equal((await f.call('/api/mechanisms?owner=23',level)).status,403);
  assert.equal((await f.call('/api/mechanisms?owner=26',22)).status,403);
  for(const path of ['/api/mechanisms/export?owner=23','/api/life-tree/drafts?owner=23'])assert.equal((await f.call(path,25)).status,403);
  assert.equal((await f.call('/api/mechanisms/6?owner=23',25,'PUT',{title:'Intrusion',revision:1})).status,403);
  await f.ok('/api/mechanisms/6',22,'PUT',{format:2,title:'Ma réaction',description:'Évolution',improvement:'Un nouvel essai',anchor:'Une pause',revision:1});
  assert.equal((await f.ok('/api/mechanisms/6?owner=23',25)).mechanism.improvement,'Un nouvel essai');
  await f.ok('/api/ace-circles/members/'+id,25,'DELETE',{});
  for(const path of ['/api/mechanisms?owner=23','/api/mechanisms/6?owner=23'])assert.equal((await f.call(path,25)).status,403);
 }finally{f.sql.close();}
});

test('video publication and replies need no separate video consent; membership and block checks still apply',async()=>{
 const f=setup();try{
  await f.ok('/api/life-tree/events/as-video-0001',22,'PUT',video);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM privacy_consents').get().n,0);
  assert.equal((await f.call('/api/life-tree/events/as-archive-0001',22,'PUT',{...video,videoBranch:null,entryType:'event'})).status,409);
  const id=await f.join(),topic=(await f.ok('/api/life-tree/events/as-video-0001')).event.topic_id;
  assert.equal((await f.ok('/api/life-tree?videos=1&owner=23',25)).events.length,1);
  await f.ok('/api/ace-circles/topics/'+topic+'/replies',25,'POST',{id:crypto.randomUUID(),text:'Un regard bienveillant.'});
  assert.equal((await f.ok('/api/ace-circles/topics/'+topic)).replies.length,1);
  await f.ok('/api/ace-circles/blocks',22,'POST',{target:26});
  assert.equal(f.sql.prepare('SELECT id FROM ace_memberships WHERE id=?').get(id),undefined);
  for(const path of ['/api/mechanisms?owner=23','/api/life-tree?owner=23','/api/ace-circles/topics/'+topic])assert.equal((await f.call(path,25)).status,403);
  assert.equal((await f.call('/api/ace-circles/topics/'+topic+'/replies',25,'POST',{id:crypto.randomUUID(),text:'Trop tard.'})).status,403);
 }finally{f.sql.close();}
});

test('revocation during mechanism decryption prevents the response from exposing content',async()=>{
 const f=setup();try{
  await f.join();const original=f.env.DB.prepare;let revoked=false;
  f.env.DB.prepare=(query,...args)=>{if(query.startsWith('SELECT * FROM user_mechanisms')&&!revoked){revoked=true;f.sql.exec('UPDATE ace_memberships SET content_access=0 WHERE owner_id=23');}return original(query,...args);};
  const response=await f.call('/api/mechanisms?owner=23',25);assert.equal(response.status,403);assert.equal(response.data.mechanisms,undefined);
 }finally{f.sql.close();}
});

test('AS migration preserves explicit revocations and ciphertext; a new relation never reopens a revoked relation',()=>{
 const sql=new DatabaseSync(':memory:');try{
  const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');sql.exec(schema.slice(0,schema.indexOf('-- An accepted AS relation')));
  for(let id=1;id<=5;id++)sql.prepare('INSERT INTO users(id,email,username,password_hash) VALUES(?,?,?,?)').run(id,'u'+id+'@local.test','U'+id,'unused');
  for(let owner=1;owner<=3;owner++){
   sql.prepare('INSERT INTO ace_circles(owner_id) VALUES(?)').run(owner);
   sql.prepare('INSERT INTO ace_memberships(id,owner_id,angel_id,owner_slot,angel_slot,joined_seq) VALUES(?,?,4,1,?,0)').run('member-'+owner,owner,owner);
  }
  sql.exec("INSERT INTO privacy_consents(user_id,purpose,version,granted) VALUES(1,'videography','2026-10-01',0),(2,'sharing','2026-10-01',0),(2,'videography','2026-10-01',1); INSERT INTO user_mechanisms(owner_id,slot,payload) VALUES(1,1,'ciphertext-unchanged')");
  sql.exec(readFileSync(new URL('../migrations/0041_as_content_access.sql',import.meta.url),'utf8'));
  assert.deepEqual(sql.prepare('SELECT content_access FROM ace_memberships ORDER BY owner_id').all().map(r=>r.content_access),[0,1,1]);
  assert.equal(sql.prepare('SELECT payload FROM user_mechanisms').get().payload,'ciphertext-unchanged');
  sql.exec("INSERT INTO ace_memberships(id,owner_id,angel_id,owner_slot,angel_slot,joined_seq) VALUES('new-member',1,5,2,1,0)");
  assert.equal(sql.prepare("SELECT content_access FROM ace_memberships WHERE id='new-member'").get().content_access,1);
  assert.equal(sql.prepare("SELECT content_access FROM ace_memberships WHERE id='member-1'").get().content_access,0);
  const before=sql.prepare('SELECT access_revision FROM ace_circles WHERE owner_id=1').get().access_revision;
  sql.exec("UPDATE ace_memberships SET content_access=0 WHERE id='new-member'");
  assert.equal(sql.prepare('SELECT access_revision FROM ace_circles WHERE owner_id=1').get().access_revision,before+1);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{sql.close();}
});

test('12 keeps a completed historical rung and numeric fragments, but an apostle fragment cannot solve it',()=>{
 const rows=(...ids)=>ids.map(riddle_id=>({riddle_id,solved_at:'2026-10-01'}));
 for(const id of ['eg-16-1','eg-16-1.p0','n-a-4','n-a-4.p0'])assert.equal(gameLevel(rows(id)),2,id);
 for(const id of ['eg-16-1.p1','n-a-4.p1','n-a-4.p2'])assert.equal(gameLevel(rows(id)),1,id);
 assert.equal(gameLevel(rows('eg-16-1','eg-16-1.p0','n-a-4')),2);
 assert.deepEqual([...progress(rows('eg-16-1')).solved],['eg-16-1']);
});
