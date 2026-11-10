import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture,setEarnedLevel} from './community-fixture.mjs';
import worker from '../src/index.js';
import {cleanupLogeStream,ensureLogeStreamTables,LOGE_STREAM_SCHEMA} from '../src/loge-stream.js';
const file=extra=>({filename:'reflexion.mp4',size:1000000,requestId:crypto.randomUUID(),...extra});
const event=(uploadId,extra={})=>({title:'Une réflexion privée',entryType:'creation',medium:'vidéo',videoBranch:'self',url:'',precision:'day',date:'2026-10-01',kind:'autre',impact:'à explorer',themes:['Parcours'],work:'Notes chiffrées',revision:0,...(uploadId?{uploadId}:{}),...extra});
function setup(){
  const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');
  for(const id of [11,12])setEarnedLevel(f,id,33);
  const videos=new Map(),creates=[],deleted=[];let sequence=0;
  const binding={
    async createDirectUpload(params){const id=(++sequence).toString(16).padStart(32,'0');creates.push(params);videos.set(id,{id,creator:params.creator,meta:params.meta,requireSignedURLs:params.requireSignedURLs,status:{state:'pendingupload'},readyToStream:false,duration:-1,size:0,hlsPlaybackUrl:`https://customer-test.cloudflarestream.com/${id}/manifest/video.m3u8`,thumbnail:`https://customer-test.cloudflarestream.com/${id}/thumbnails/thumbnail.jpg`});return {id,uploadURL:`https://upload.cloudflarestream.com/${id}`};},
    video(id){return {
      async details(){if(!videos.has(id))throw Object.assign(new Error('missing'),{status:404});return structuredClone(videos.get(id));},
      async update(params){Object.assign(videos.get(id),params);},
      async delete(){deleted.push(id);videos.delete(id);},
      async generateToken(){return 'header.'+Buffer.from(JSON.stringify({sub:id,exp:String(Math.floor(Date.now()/1000)+3600)})).toString('base64url')+'.signature';}
    };}
  };f.env.STREAM=binding;
  const call=async(path,method='GET',body,user=11,headers={})=>{
    const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+(user-1),'X-WC-User':String(user),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env);
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  const upload=(body=file(),user=11)=>call('/api/life-tree/uploads','POST',body,user);
  const put=(id,body,user=11)=>call('/api/life-tree/events/'+id,'PUT',body,user);
  const row=id=>f.sql.prepare('SELECT * FROM loge_stream_uploads WHERE id=?').get(id);
  const ready=id=>{const value=videos.get(row(id).stream_id);Object.assign(value,{readyToStream:true,status:{state:'ready'},duration:50,size:1000000});return value;};
  const attach=async(id='stream-event-0001',extra={})=>{const u=await upload();assert.equal(u.status,201,JSON.stringify(u.data));ready(u.data.uploadId);const body=event(u.data.uploadId,extra),saved=await put(id,body);assert.equal(saved.status,200,JSON.stringify(saved.data));return {id,uploadId:u.data.uploadId,body,event:saved.data.event};};
  return {...f,call,upload,put,row,ready,attach,videos,creates,deleted,binding};
}

test('Vidéographie upload routes enforce login, earned33, account identity, JSON and original ownership',async()=>{
  const f=setup();try{
    for(const user of [0,10,100])assert.equal((await f.upload(file(),user)).status,user===0?401:403);
    assert.equal((await f.call('/api/life-tree/uploads','POST',file(),11,{'X-WC-User':'12'})).status,409);
    assert.equal((await f.call('/api/life-tree/uploads','POST',file(),11,{'Content-Type':'text/plain'})).status,415);
    assert.equal((await f.call('/api/life-tree/uploads','POST',file(),11,{Origin:'https://evil.test'})).status,403);
    for(const extra of [{size:200000001},{filename:'bad.html'},{requestId:'bad'}])assert.equal((await f.upload(file(extra))).status,400);
    const uploaded=await f.upload();assert.equal(uploaded.status,201);const id=uploaded.data.uploadId;
    for(const method of ['GET','DELETE'])assert.equal((await f.call('/api/life-tree/uploads/'+id,method,method==='DELETE'?{}:undefined,12)).status,404);
    assert.equal((await f.put('other-event-0001',event(id),12)).status,404);
    assert.equal((await f.put('not-video-00001',event(id,{videoBranch:null}))).status,400);
    assert.equal(f.creates.length,1);assert.equal(f.creates[0].creator,'videography:user:11');assert.equal(f.creates[0].meta.source,'whitecadae-videography');
  }finally{f.sql.close();}
});
test('Loge and Vidéographie scopes isolate attachment and active slots while sharing the storage budget',async()=>{
  const f=setup();try{
    const body=file(),uploaded=await f.upload(body),id=uploaded.data.uploadId;f.ready(id);
    for(const method of ['GET','DELETE'])assert.equal((await f.call('/api/loge/uploads/'+id,method,method==='DELETE'?{}:undefined)).status,404);
    assert.equal((await f.call('/api/loge/uploads','POST',body)).status,409);
    assert.equal((await f.call('/api/loge/posts','POST',{title:'Le mauvais espace',uploadId:id,requestId:crypto.randomUUID()})).status,404);
    const loge=await f.call('/api/loge/uploads','POST',file());assert.equal(loge.status,201);f.ready(loge.data.uploadId);
    const blocked=await f.upload();assert.equal(blocked.status,409);assert.equal(blocked.data.uploadId,id);
    const logeBlocked=await f.call('/api/loge/uploads','POST',file());assert.equal(logeBlocked.status,409);assert.equal(logeBlocked.data.uploadId,loge.data.uploadId);
    assert.equal((await f.put('correct-event-01',event(id))).status,200);
    assert.equal((await f.put('wrong-purpose-01',event(loge.data.uploadId))).status,404);
    assert.equal((await f.call('/api/life-tree/uploads/'+loge.data.uploadId)).status,404);
    assert.equal(f.creates.length,2);
  }finally{f.sql.close();}
});
test('Vidéographie bypasses only the weekly Loge quota and keeps encrypted payload, lists, export and topics coherent',async()=>{
  const f=setup();try{
    const legacy=await f.call('/api/loge/posts','POST',{title:'La loge',url:'https://youtu.be/dQw4w9WgXcQ',requestId:crypto.randomUUID()});assert.equal(legacy.status,201);
    const saved=await f.attach();assert.equal(saved.event.creation.videoProvider,'stream');assert.equal(saved.event.creation.url,'');assert.equal(saved.event.creation.uploadId,saved.uploadId);
    const stored=f.sql.prepare('SELECT payload FROM life_events WHERE id=?').get(saved.id).payload;assert.doesNotMatch(stored,/Notes chiffrées|cloudflarestream|videoProvider/);
    for(const path of ['/api/life-tree?videos=1','/api/life-tree?branch=self','/api/life-tree/export']){
      const result=await f.call(path);assert.equal(result.status,200);assert.equal(result.data.events[0].creation.videoProvider,'stream');assert.equal(result.data.events[0].creation.url,'');
    }
    assert.equal((await f.call('/api/loge/uploads','POST',file())).status,429);
    const second=await f.attach('stream-event-0002');assert.equal(second.event.revision,1);
    f.sql.prepare("INSERT INTO loge_stream_uploads(id,user_id,request_id,filename,declared_size,state,duration_seconds,expires_at) VALUES(?,999,?,'seed.mp4',1,'published',60000,unixepoch()+3600)").run(crypto.randomUUID(),crypto.randomUUID());
    assert.equal((await f.upload(file(),12)).status,429);
  }finally{f.sql.close();}
});
test('ready attachment and retries are atomic; metadata edits preserve media and historical YouTube remains editable',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId,body=event(id);
    assert.equal((await f.put('retry-event-0001',body)).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM life_events').get().n,0);
    f.ready(id);const results=await Promise.all([f.put('retry-event-0001',body),f.put('retry-event-0001',body)]);assert.deepEqual(results.map(r=>r.status),[200,200]);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM life_events').get().n,1);
    assert.equal((await f.put('retry-event-0001',{...body,title:'Conflicting retry'})).status,409);
    const edit=await f.put('retry-event-0001',event(null,{title:'Métadonnées corrigées',revision:1}));assert.equal(edit.status,200);assert.equal(edit.data.event.creation.uploadId,id);assert.equal(edit.data.event.revision,2);
    const retry=await f.put('retry-event-0001',body);assert.equal(retry.status,200);assert.equal(retry.data.event.title,'Métadonnées corrigées');assert.equal(retry.data.event.revision,2);
    assert.equal(f.row(id).state,'published');
    const legacy=await f.put('youtube-event-01',event(null,{url:'https://youtu.be/dQw4w9WgXcQ'}));assert.equal(legacy.status,200);assert.equal(legacy.data.event.creation.videoProvider,'youtube');assert.match(legacy.data.event.creation.url,/youtube.com/);
    assert.equal((await f.put('youtube-event-01',event(null,{title:'Ancien clip corrigé',url:'https://youtu.be/dQw4w9WgXcQ',revision:1}))).status,200);
  }finally{f.sql.close();}
});
test('replacement preserves previous media on validation/CAS/provider failure and queues it only on committed attachment',async()=>{
  const f=setup();try{
    const saved=await f.attach(),next=(await f.upload()).data.uploadId;f.ready(next);
    assert.equal((await f.put(saved.id,event(next,{revision:0}))).status,409);assert.equal(f.row(saved.uploadId).state,'published');assert.equal(f.row(next).event_id,null);
    f.sql.exec("CREATE TRIGGER fail_video_update BEFORE UPDATE ON life_events BEGIN SELECT RAISE(ABORT,'test rollback'); END");
    const failed=await f.put(saved.id,event(next,{revision:1}));assert.equal(failed.status,500);assert.equal(f.row(saved.uploadId).state,'published');assert.equal(f.row(next).state,'ready');
    f.sql.exec('DROP TRIGGER fail_video_update');
    const changed=await f.put(saved.id,event(next,{title:'Nouveau film',revision:1}));assert.equal(changed.status,200);assert.equal(changed.data.event.creation.uploadId,next);
    assert.equal(f.row(saved.uploadId).state,'deleting');assert.equal(f.row(next).state,'published');assert.equal(f.deleted.length,0);
    f.sql.prepare('UPDATE loge_stream_uploads SET expires_at=0').run();assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:0});assert.equal(f.row(next).state,'published');
    assert.equal((await f.call('/api/life-tree/events/'+saved.id+'/playback')).status,200);
  }finally{f.sql.close();}
});
test('expiry inside attachment transaction and cancel during readiness cannot change the event or its previous media',async()=>{
  const f=setup();try{
    const saved=await f.attach(),id=(await f.upload()).data.uploadId;f.ready(id);
    f.sql.exec("CREATE TRIGGER expire_video_update AFTER UPDATE ON life_events BEGIN UPDATE loge_stream_uploads SET expires_at=0 WHERE state='ready'; END");
    assert.equal((await f.put(saved.id,event(id,{revision:1}))).status,409);assert.equal(f.row(saved.uploadId).state,'published');assert.equal(f.row(id).state,'ready');
    assert.equal((await f.call('/api/life-tree/events/'+saved.id)).data.event.revision,1);f.sql.exec('DROP TRIGGER expire_video_update');
    const original=f.binding.video;let once=false;f.binding.video=uid=>{const handle=original(uid),update=handle.update;handle.update=async params=>{await update(params);if(!once){once=true;await f.call('/api/life-tree/uploads/'+id,'DELETE',{});}};return handle;};
    assert.equal((await f.put(saved.id,event(id,{revision:1}))).status,409);assert.equal(f.row(saved.uploadId).state,'published');assert.equal(f.row(id).state,'deleted');
    assert.equal((await f.call('/api/life-tree/events/'+saved.id)).data.event.revision,1);
  }finally{f.sql.close();}
});
async function connectAS(f){
  for(const user of [11,12])assert.equal((await f.call('/api/private/consent','POST',{consent:true,version:'2026-10-01'},user)).status,200);
  assert.equal((await f.call('/api/ace-circles','POST',{})).status,200);
  const invitation=crypto.randomUUID();assert.equal((await f.call('/api/ace-circles/invitations','POST',{id:invitation,target:12,recipientNotice:true})).status,200);
  assert.equal((await f.call('/api/ace-circles/invitations/'+invitation,'PUT',{action:'accept'},12)).status,200);
  assert.equal((await f.call('/api/ace-circles/sharing','PUT',{enabled:true,consent:true,scope:'videography'})).status,200);
}
test('signed playback is owner/accepted-AS only, rechecks revocation and replacement, and never exposes provider ids in events',async()=>{
  const f=setup();try{
    const saved=await f.attach(),path='/api/life-tree/events/'+saved.id+'/playback';
    assert.equal((await f.call(path+'?owner=11','GET',undefined,12)).status,403);
    await connectAS(f);
    const response=await f.call(path+'?owner=11','GET',undefined,12);assert.equal(response.status,200);assert.match(response.data.hls,/header\./);assert.match(response.data.expiresAt,/Z$/);
    const events=await f.call('/api/life-tree?owner=11','GET',undefined,12);assert.equal(events.status,200);assert.doesNotMatch(JSON.stringify(events.data),/cloudflarestream\.com|stream_id|logeUploadId/);
    const original=f.binding.video;let once=false;f.binding.video=uid=>{const handle=original(uid),generate=handle.generateToken;handle.generateToken=async()=>{if(!once){once=true;await f.call('/api/ace-circles/sharing','PUT',{enabled:false});}return generate();};return handle;};
    assert.equal((await f.call(path+'?owner=11','GET',undefined,12)).status,403);
    assert.equal((await f.call(path)).status,200);
    setEarnedLevel(f,11,32);assert.equal((await f.call(path)).status,403);
  }finally{f.sql.close();}
});
test('event deletion, whole-tree erasure, private erasure and account deletion remove only attached owned media',async()=>{
  for(const mode of ['event','tree','private','account']){
    const f=setup();try{
      const saved=await f.attach();
      if(mode==='event')assert.equal((await f.call('/api/life-tree/events/'+saved.id,'DELETE',{revision:1})).status,200);
      if(mode==='tree')assert.equal((await f.call('/api/life-tree','DELETE',{confirm:'SUPPRIMER'})).status,200);
      if(mode==='private')assert.equal((await f.call('/api/private/data','DELETE',{confirm:'SUPPRIMER'})).status,200);
      if(mode==='account')f.sql.prepare('DELETE FROM users WHERE id=?').run(11);
      assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:0},mode);assert.equal(f.row(saved.uploadId).state,'deleted');assert.equal(f.deleted.length,1);
    }finally{f.sql.close();}
  }
});
test('0051 and runtime upgrade preserve historical ledger rows and match fresh schema without rebuilding legacy tables',async()=>{
  const f=setup();try{
    f.sql.exec('DROP TABLE loge_stream_uploads');f.sql.exec(readFileSync(new URL('../migrations/0050_loge_stream.sql',import.meta.url),'utf8'));
    const id=crypto.randomUUID();f.sql.prepare("INSERT INTO loge_stream_uploads(id,user_id,request_id,filename,declared_size,expires_at) VALUES(?,11,?,'old.mp4',100,9999999999)").run(id,crypto.randomUUID());
    const before=f.sql.prepare('SELECT * FROM loge_stream_uploads').get();
    f.sql.exec(readFileSync(new URL('../migrations/0051_videography_stream.sql',import.meta.url),'utf8'));
    await ensureLogeStreamTables(f.env);await ensureLogeStreamTables(f.env);
    const after=f.row(id);for(const [key,value] of Object.entries(before))assert.equal(after[key],value,key);assert.equal(after.purpose,'loge');assert.equal(after.event_id,null);
    const old=setup();try{
      old.sql.exec('DROP TABLE loge_stream_uploads');old.sql.exec(readFileSync(new URL('../migrations/0050_loge_stream.sql',import.meta.url),'utf8'));
      await ensureLogeStreamTables(old.env);
      assert.deepEqual(old.sql.prepare('PRAGMA table_info(loge_stream_uploads)').all().map(r=>[r.name,r.type,r.notnull,r.dflt_value]),f.sql.prepare('PRAGMA table_info(loge_stream_uploads)').all().map(r=>[r.name,r.type,r.notnull,r.dflt_value]));
    }finally{old.sql.close();}
    const fresh=new DatabaseSync(':memory:');try{for(const sql of LOGE_STREAM_SCHEMA)fresh.exec(sql);assert.deepEqual(new Set(fresh.prepare('PRAGMA table_info(loge_stream_uploads)').all().map(r=>r.name)),new Set(f.sql.prepare('PRAGMA table_info(loge_stream_uploads)').all().map(r=>r.name)));}finally{fresh.close();}
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.sql.close();}
});

test('bulk erasure queues multiple published videos and an active upload without touching Loge ownership',async()=>{
  const f=setup();try{
    const first=await f.attach('bulk-video-00001'),second=await f.attach('bulk-video-00002'),pending=(await f.upload()).data.uploadId;
    f.sql.prepare('UPDATE loge_stream_uploads SET created_at=unixepoch()-7200').run();
    const loge=await f.call('/api/loge/uploads','POST',file());assert.equal(loge.status,201);f.ready(loge.data.uploadId);
    assert.equal((await f.call('/api/loge/posts','POST',{title:'Loge préservée',uploadId:loge.data.uploadId,requestId:crypto.randomUUID()})).status,201);
    assert.equal((await f.call('/api/life-tree','DELETE',{confirm:'SUPPRIMER'})).status,200);
    for(const id of [first.uploadId,second.uploadId,pending])assert.equal(f.row(id).state,'deleting');
    assert.equal(f.row(loge.data.uploadId).state,'published');
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:3,failed:0});assert.equal(f.row(loge.data.uploadId).state,'published');
  }finally{f.sql.close();}
});
test('a failed cleanup does not block deletion of another orphan and still retains its storage reservation',async()=>{
  const f=setup();try{
    const first=await f.attach('orphan-video-001'),second=await f.attach('orphan-video-002'),bad=f.videos.get(f.row(first.uploadId).stream_id);bad.meta={source:'not-our-video'};
    f.sql.prepare('DELETE FROM users WHERE id=?').run(11);
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:1});assert.equal(f.row(first.uploadId).state,'deleting');assert.equal(f.row(second.uploadId).state,'deleted');
    assert.equal(f.row(first.uploadId).duration_seconds,50);
  }finally{f.sql.close();}
});
