import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleLoge} from '../src/loge.js';
import {cleanupLogeStream,LOGE_STREAM_SCHEMA,LOGE_UPLOAD_MAX_BYTES} from '../src/loge-stream.js';
import {NODES} from '../src/echelon.js';
import {fixture} from './community-fixture.mjs';
const file=extra=>({filename:'réflexion.mp4',size:1000000,requestId:crypto.randomUUID(),...extra});
const post=uploadId=>({title:'Une réflexion filmée',uploadId,requestId:crypto.randomUUID()});
const signs=NODES.flatMap(n=>n.answers.map(a=>a.id));
function setup(){
  const f=fixture(),videos=new Map(),deleted=[],created=[],updates=[];
  let sequence=0;
  for(const user of [11,12]){
    f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=?').run(user);
    for(const id of signs.slice(0,32))f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(user,id,'now');
  }
  f.env.STREAM={
    async createDirectUpload(params){
      created.push(params);const id=(++sequence).toString(16).padStart(32,'0');
      videos.set(id,{id,creator:params.creator,meta:params.meta,status:{state:'pendingupload'},readyToStream:false,requireSignedURLs:params.requireSignedURLs,size:0,duration:-1,
        thumbnail:`https://customer-example.cloudflarestream.com/${id}/thumbnails/thumbnail.jpg`,hlsPlaybackUrl:`https://customer-example.cloudflarestream.com/${id}/manifest/video.m3u8`});
      return {id,uploadURL:`https://upload.cloudflarestream.com/${id}`};
    },
    video(id){return {
      async details(){if(!videos.has(id))throw Object.assign(new Error('missing'),{status:404});return structuredClone(videos.get(id));},
      async update(params){updates.push({id,params});Object.assign(videos.get(id),params);},
      async delete(){deleted.push(id);videos.delete(id);},
      async generateToken(){return 'header.'+Buffer.from(JSON.stringify({sub:id,exp:String(Math.floor(Date.now()/1000)+3600)})).toString('base64url')+'.signature';}
    };}
  };
  const deps={getUser:async request=>f.sql.prepare('SELECT * FROM users WHERE id=?').get(Number(request.headers.get('Test-User')))||null,json:(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}})};
  async function call(path='/api/loge/uploads',{method='GET',body,user=11,headers={}}={}){
    const request=new Request('https://whitecadae.fr'+path,{method,headers:{'Test-User':String(user),'X-WC-User':String(user),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let response;try{response=await handleLoge(request,f.env,new URL(request.url),deps);}catch(e){if(!(e instanceof Response))throw e;response=e;}
    return {status:response.status,data:await response.json(),headers:response.headers};
  }
  const upload=(body=file(),options={})=>call('/api/loge/uploads',{method:'POST',body,...options});
  const publish=(body,options={})=>call('/api/loge/posts',{method:'POST',body,...options});
  const row=id=>f.sql.prepare('SELECT * FROM loge_stream_uploads WHERE id=?').get(id);
  const ready=id=>{const value=videos.get(row(id).stream_id);Object.assign(value,{readyToStream:true,status:{state:'ready'},duration:120,size:1000000});return value;};
  return {...f,videos,created,deleted,updates,call,upload,publish,row,ready};
}

test('upload and playback routes enforce the real earned level, login, JSON and account identity',async()=>{
  const f=setup();try{
    for(const [user,status] of [[0,401],[10,403],[100,403]]){
      assert.equal((await f.upload(file(),{user})).status,status);
      assert.equal((await f.call('/api/loge/uploads/'+crypto.randomUUID(),{user})).status,status);
      assert.equal((await f.call('/api/loge/posts/1/playback',{user})).status,status);
    }
    assert.equal((await f.upload(file(),{headers:{'X-WC-User':'12'}})).status,409);
    assert.equal((await f.upload(file(),{headers:{'Content-Type':'text/plain'}})).status,415);
    assert.equal(f.created.length,0);
  }finally{f.sql.close();}
});
test('file validation precedes provider provisioning and reservation does not spend publication quota',async()=>{
  const f=setup();try{
    for(const extra of [{size:0},{size:-1},{size:LOGE_UPLOAD_MAX_BYTES+1},{size:1.2},{filename:'image.jpg'},{filename:'../video.mp4'},{filename:'bad\n.mp4'},{requestId:'arbitrary'}])assert.equal((await f.upload(file(extra))).status,400);
    assert.equal(f.created.length,0);
    const result=await f.upload(file({size:LOGE_UPLOAD_MAX_BYTES}));assert.equal(result.status,201);
    assert.equal(result.data.maxBytes,200000000);assert.equal(result.data.maxDurationSeconds,1800);
    assert.equal((await f.call('/api/loge')).data.nextPublicationAt,null);
    assert.deepEqual(f.created[0].allowedOrigins,['whitecadae.fr']);assert.equal(f.created[0].requireSignedURLs,true);
    assert.equal(f.created[0].creator,'loge:user:11');assert.ok(Date.parse(f.created[0].scheduledDeletion)-Date.now()>30*86400000);
    assert.doesNotMatch(JSON.stringify(result.data),/apiKey|secret|creator|stream_id/);
  }finally{f.sql.close();}
});
test('concurrent upload reservations and retries allocate only one paid upload and remain owner scoped',async()=>{
  const f=setup();try{
    const body=file(),results=await Promise.all([f.upload(body),f.upload(body),...Array.from({length:8},()=>f.upload())]);
    assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(f.created.length,1);
    const won=results.find(r=>r.status===201),id=won.data.uploadId;
    const retry=await f.upload(body);assert.equal(retry.status,200);assert.equal(retry.data.uploadURL,won.data.uploadURL);
    assert.equal((await f.upload({...body,size:200})).status,409);
    for(const method of ['GET','DELETE'])assert.equal((await f.call('/api/loge/uploads/'+id,{method,user:12,...(method==='DELETE'?{body:{}}:{})})).status,404);
    assert.equal((await f.publish(post(id),{user:12})).status,404);
    assert.equal(f.created.length,1);assert.equal(f.deleted.length,0);
  }finally{f.sql.close();}
});
test('status reflects processing and errors, and publish rechecks ready metadata without trusting client size',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId,path='/api/loge/uploads/'+id;
    assert.equal((await f.call(path)).data.status,'waiting');
    assert.equal((await f.publish(post(id))).status,409);
    f.videos.get(f.row(id).stream_id).status={state:'inprogress'};
    assert.equal((await f.call(path)).data.status,'processing');
    const video=f.ready(id);assert.equal((await f.call(path)).data.status,'ready');
    video.size=200000001;assert.equal((await f.publish(post(id))).status,409);
    assert.equal((await f.call(path)).data.status,'error');
    assert.equal((await f.call('/api/loge')).data.nextPublicationAt,null);
    assert.equal((await cleanupLogeStream(f.env)).deleted,1);
  }finally{f.sql.close();}
});
test('Stream publication is atomic, idempotent and retains comments, profile, favorites, themes and legacy YouTube representations',async()=>{
  const f=setup();try{
    const legacy=await f.publish({title:'Ancien lien',url:'https://youtu.be/dQw4w9WgXcQ',requestId:crypto.randomUUID()},{user:12});
    assert.equal(legacy.data.post.videoProvider,'youtube');assert.match(legacy.data.post.youtubeUrl,/youtube/);
    const id=(await f.upload()).data.uploadId;f.ready(id);const body=post(id);
    const results=await Promise.all([f.publish(body),f.publish(body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
    const item=results[0].data.post;assert.equal(item.videoProvider,'stream');assert.equal(item.youtubeUrl,null);
    assert.equal(f.row(id).post_id,item.id);assert.equal(f.row(id).state,'published');
    assert.equal((await f.publish({...body,title:'other'})).status,409);
    assert.equal((await f.publish(post(id))).status,409);
    assert.equal((await f.upload()).status,429);
    assert.equal((await f.publish({title:'Again',url:'https://youtu.be/dQw4w9WgXcQ',requestId:crypto.randomUUID()})).status,429);
    await f.call('/api/loge/posts/'+item.id+'/comments',{method:'POST',user:12,body:{body:'Réponse',requestId:crypto.randomUUID()}});
    await f.call('/api/loge/posts/'+item.id+'/favorite',{method:'PUT',body:{favorite:true}});
    for(const path of ['/api/loge','/api/loge/membres/11','/api/loge/membres/11?tab=favoris']){
      const row=(await f.call(path)).data.posts.find(p=>p.id===item.id);assert.equal(row.videoProvider,'stream');assert.equal(row.youtubeUrl,null);assert.equal(row.commentCount,1);
    }
    const intervention=(await f.call('/api/loge/membres/12?tab=interventions')).data.interventions[0];assert.equal(intervention.post.videoProvider,'stream');assert.equal(intervention.post.youtubeUrl,null);
    assert.equal((await f.call('/api/loge/posts/'+legacy.data.post.id+'/playback')).status,404);
    assert.equal(f.updates[0].params.scheduledDeletion,null);
  }finally{f.sql.close();}
});
test('weekly quota blocks provisioning before allocation and a failing post transaction leaves both media and quota unspent',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId;f.ready(id);
    f.sql.exec("CREATE TRIGGER fail_stream_post BEFORE INSERT ON loge_posts BEGIN SELECT RAISE(ABORT,'fixture insertion failure'); END");
    await assert.rejects(()=>f.publish(post(id)),/fixture insertion failure/);
    assert.equal(f.row(id).post_id,null);assert.equal(f.row(id).state,'ready');assert.equal((await f.call('/api/loge')).data.nextPublicationAt,null);
    f.sql.exec('DROP TRIGGER fail_stream_post');assert.equal((await f.publish(post(id))).status,201);
    const count=f.created.length;assert.equal((await f.upload()).status,429);assert.equal(f.created.length,count);
  }finally{f.sql.close();}
});
test('playback signs provider URLs only, uses token expiry, and rejects ownership mismatch, unsafe hosts and unsigned media',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId,video=f.ready(id),published=await f.publish(post(id)),path='/api/loge/posts/'+published.data.post.id+'/playback';
    const response=await f.call(path,{user:12});assert.equal(response.status,200);
    assert.match(response.data.hls,/\/header\.[^/]+\/manifest\/video.m3u8$/);assert.match(response.data.poster,/\/header\./);assert.match(response.data.expiresAt,/Z$/);
    assert.doesNotMatch(response.data.hls,new RegExp(video.id));
    const original=video.hlsPlaybackUrl;
    for(const value of [`https://evil.test/${video.id}/manifest/video.m3u8`,`https://customer-example.cloudflarestream.com.evil.test/${video.id}/manifest/video.m3u8`,`http://videodelivery.net/${video.id}/manifest/video.m3u8`,`https://videodelivery.net/wrong/manifest/video.m3u8`]){
      video.hlsPlaybackUrl=value;assert.equal((await f.call(path)).status,503);
    }
    video.hlsPlaybackUrl=original;video.meta={source:'other'};assert.equal((await f.call(path)).status,503);
    video.meta=f.created[0].meta;video.requireSignedURLs=false;assert.equal((await f.call(path)).status,503);
  }finally{f.sql.close();}
});
test('delete queues owned media atomically, cleanup retries failures and never deletes unrelated videos',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId;f.ready(id);const result=await f.publish(post(id)),path='/api/loge/posts/'+result.data.post.id;
    assert.equal((await f.call('/api/loge/uploads/'+id,{method:'DELETE',body:{}})).status,409);
    assert.equal((await f.call(path,{method:'DELETE',user:12,body:{revision:1}})).status,404);
    assert.equal((await f.call(path,{method:'DELETE',body:{revision:1}})).status,200);
    assert.equal(f.row(id).state,'deleting');assert.equal(f.deleted.length,0);assert.equal((await f.call(path+'/playback')).status,404);
    const video=f.videos.get(f.row(id).stream_id),saved=video.meta;video.meta={source:'unrelated'};
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:0,failed:1});assert.equal(f.deleted.length,0);
    video.meta=saved;f.sql.prepare('UPDATE loge_stream_uploads SET cleanup_after=0 WHERE id=?').run(id);
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:0});assert.equal(f.deleted.length,1);
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:0,failed:0});assert.equal((await f.upload()).status,429);
  }finally{f.sql.close();}
});
test('cancellation is idempotent, cannot reuse an upload request, and expired uploads are swept without spending quota',async()=>{
  const f=setup();try{
    const body=file(),id=(await f.upload(body)).data.uploadId,path='/api/loge/uploads/'+id;
    for(let i=0;i<2;i++)assert.equal((await f.call(path,{method:'DELETE',body:{}})).status,200);
    assert.equal(f.deleted.length,1);assert.equal((await f.upload(body)).status,410);assert.equal((await f.publish(post(id))).status,409);
    const next=(await f.upload()).data.uploadId;
    f.sql.prepare('UPDATE loge_stream_uploads SET expires_at=unixepoch()-1 WHERE id=?').run(next);
    assert.equal((await f.call('/api/loge/uploads/'+next)).data.status,'error');
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:0});
    assert.equal((await f.call('/api/loge')).data.nextPublicationAt,null);
  }finally{f.sql.close();}
});
test('storage reservations and per-user creation frequency are bounded across cancellations',async()=>{
  const f=setup();try{
    for(let i=0;i<3;i++){const result=await f.upload();assert.equal(result.status,201);await f.call('/api/loge/uploads/'+result.data.uploadId,{method:'DELETE',body:{}});}
    assert.equal((await f.upload()).status,429);assert.equal(f.created.length,3);
    f.sql.prepare("INSERT INTO loge_stream_uploads(id,user_id,request_id,filename,declared_size,state,duration_seconds,expires_at) VALUES(?,999,?,'seed.mp4',1,'published',60000,unixepoch()+3600)").run(crypto.randomUUID(),crypto.randomUUID());
    assert.equal((await f.upload(file(),{user:12})).status,429);assert.equal(f.created.length,3);
  }finally{f.sql.close();}
});
test('migration and runtime schema are additive, repeatable and retain orphan ownership for safe cleanup',async()=>{
  const f=setup();try{
    const legacy=await f.publish({title:'Legacy',description:'Original text',url:'https://youtu.be/dQw4w9WgXcQ',requestId:crypto.randomUUID()},{user:12});
    const before=f.sql.prepare('SELECT * FROM loge_posts WHERE id=?').get(legacy.data.post.id);
    const migration=readFileSync(new URL('../migrations/0050_loge_stream.sql',import.meta.url),'utf8');
    for(let i=0;i<2;i++){f.sql.exec(migration);for(const statement of LOGE_STREAM_SCHEMA)f.sql.exec(statement);}
    assert.deepEqual(f.sql.prepare('SELECT * FROM loge_posts WHERE id=?').get(before.id),before);
    const id=(await f.upload()).data.uploadId;f.ready(id);await f.publish(post(id));
    f.sql.prepare('DELETE FROM users WHERE id=?').run(11);assert.ok(f.row(id));
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:0});assert.equal(f.row(id).state,'deleted');
  }finally{f.sql.close();}
});

test('expiry during a publication transaction rolls back post, link and weekly quota together',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId;f.ready(id);
    f.sql.exec("CREATE TRIGGER expire_stream_post BEFORE INSERT ON loge_posts BEGIN UPDATE loge_stream_uploads SET expires_at=0; END");
    assert.equal((await f.publish(post(id))).status,409);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,0);assert.equal(f.row(id).post_id,null);
    assert.equal((await f.call('/api/loge')).data.nextPublicationAt,null);
    f.sql.exec('DROP TRIGGER expire_stream_post');assert.equal((await f.publish(post(id))).status,201);
  }finally{f.sql.close();}
});
test('a cancel racing provider readiness cannot link deleted media or spend a quota',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId;f.ready(id);const video=f.env.STREAM.video.bind(f.env.STREAM);let cancelled=false;
    f.env.STREAM.video=uid=>{const handle=video(uid),update=handle.update;handle.update=async params=>{await update(params);if(!cancelled){cancelled=true;await f.call('/api/loge/uploads/'+id,{method:'DELETE',body:{}});}};return handle;};
    assert.equal((await f.publish(post(id))).status,409);assert.equal(f.row(id).state,'deleted');
    assert.equal((await f.call('/api/loge')).data.nextPublicationAt,null);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,0);
  }finally{f.sql.close();}
});
test('ambiguous provisioning failures retain budget, reconcile exact ownership and never adopt unrelated media',async()=>{
  const f=setup();try{
    const create=f.env.STREAM.createDirectUpload;
    f.env.STREAM.createDirectUpload=async params=>{await create(params);throw new Error('sensitive provider diagnostic');};
    const result=await f.upload();assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.data),/sensitive/);
    const row=f.sql.prepare('SELECT * FROM loge_stream_uploads').get();assert.equal(row.state,'deleting');assert.equal(row.stream_id,null);
    assert.equal((await f.upload()).status,409);assert.equal(f.created.length,1);
    f.env.STREAM.videos={async list(){return [...f.videos.values(),{id:'f'.repeat(32),creator:'someone',meta:{source:'other'}}];}};
    f.sql.prepare('UPDATE loge_stream_uploads SET created_at=unixepoch()-600,updated_at=unixepoch()-600 WHERE id=?').run(row.id);
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:0});assert.equal(f.deleted.length,1);assert.equal(f.row(row.id).state,'deleted');
  }finally{f.sql.close();}
});
test('explicit provider rejection releases the slot and delete during provisioning cannot orphan the returned video',async()=>{
  const f=setup();try{
    const create=f.env.STREAM.createDirectUpload;
    f.env.STREAM.createDirectUpload=async()=>{throw Object.assign(new Error('quota'),{name:'QuotaReachedError'});};
    assert.equal((await f.upload()).status,503);assert.equal(f.sql.prepare('SELECT state FROM loge_stream_uploads').get().state,'deleted');
    f.env.STREAM.createDirectUpload=async params=>{
      await f.call('/api/loge/uploads/'+params.meta.logeUploadId,{method:'DELETE',body:{}});
      assert.deepEqual(await cleanupLogeStream(f.env),{deleted:0,failed:0});
      return create(params);
    };
    assert.equal((await f.upload()).status,410);
    assert.deepEqual(await cleanupLogeStream(f.env),{deleted:1,failed:0});assert.equal(f.deleted.length,1);
  }finally{f.sql.close();}
});

test('direct uploads accept the real Stream host and legacy host, but reject lookalikes and credentials',async()=>{
  for(const [url,accepted] of [
    ['https://upload.cloudflarestream.com/upload-id?direct_user=true',true],
    ['https://upload.videodelivery.net/upload-id',true],
    ['https://region.upload.videodelivery.net/upload-id',true],
    ['https://upload.cloudflarestream.com.evil.test/upload-id',false],
    ['https://evil.cloudflarestream.com/upload-id',false],
    ['https://user:secret@upload.cloudflarestream.com/upload-id',false],
    ['http://upload.cloudflarestream.com/upload-id',false],
    ['https://upload.cloudflarestream.com:8443/upload-id',false]
  ]){
    const f=setup();try{
      const create=f.env.STREAM.createDirectUpload;
      f.env.STREAM.createDirectUpload=async params=>({...await create(params),uploadURL:url});
      const result=await f.upload();assert.equal(result.status,accepted?201:503,url);
      const row=f.sql.prepare('SELECT * FROM loge_stream_uploads').get();
      assert.equal(row.state,accepted?'waiting':'deleting');
      assert.equal(row.upload_url,accepted?url:null);
      if(accepted){assert.equal(result.data.uploadURL,url);assert.equal((await f.call('/api/loge')).data.nextPublicationAt,null);}
    }finally{f.sql.close();}
  }
});

test('playback accepts native string and numeric expiries, rejecting malformed, expired and unsafe claims',async()=>{
  const f=setup();try{
    const id=(await f.upload()).data.uploadId;f.ready(id);const published=await f.publish(post(id));
    const path='/api/loge/posts/'+published.data.post.id+'/playback',video=f.env.STREAM.video.bind(f.env.STREAM),future=Math.floor(Date.now()/1000)+3600;
    for(const [exp,ok] of [[String(future),true],[future,true],[null,false],[true,false],[[future],false],['',false],['tomorrow',false],['1e20',false],['123.5',false],[future+.5,false],[String(Number.MAX_SAFE_INTEGER+1),false],[String(Math.floor(Date.now()/1000)-1),false]]){
      f.env.STREAM.video=uid=>({...video(uid),async generateToken(){return 'header.'+Buffer.from(JSON.stringify({sub:uid,exp})).toString('base64url')+'.signature';}});
      const response=await f.call(path);assert.equal(response.status,ok?200:503,JSON.stringify(exp));
      if(ok)assert.equal(response.data.expiresAt,new Date(future*1000).toISOString());
    }
  }finally{f.sql.close();}
});
