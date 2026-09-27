import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/index.js';
import {youtubeId,validateTimings} from '../src/videographie.js';
import {fixture} from './community-fixture.mjs';

test('community video enforces thresholds, ownership, media access and reply audiences',async()=>{
  const f=fixture();
  async function call(path,{level=16,method='GET',body,bytes,headers={}}={}){
    const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{...(level!==null?{Cookie:'wc_session=qa'+level}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(['GET','HEAD'].includes(method)?{}:{body:bytes||JSON.stringify(body||{})})}),f.env);
    const buffer=await response.arrayBuffer();let data;try{data=JSON.parse(new TextDecoder().decode(buffer));}catch{data={};}return {status:response.status,headers:response.headers,bytes:new Uint8Array(buffer),...data};
  }
  const post=(extra={})=>({title:'Ma réflexion',description:'Pour en discuter.',category:'univers',min_echelon:16,url:'https://youtu.be/abcdefghijk',client_id:crypto.randomUUID(),...extra});
  async function media(kind='audio',level=16){
    const mime=kind==='audio'?'audio/wav':'video/mp4',bytes=new Uint8Array([0,1,2,3,4,5,6,7]);
    const ticket=await call('/api/vg-media',{level,method:'POST',body:{kind,mime,size:bytes.length,duration:1}});assert.equal(ticket.status,201);
    const path='/api/vg-media/'+ticket.id;
    assert.equal((await call(path+'/upload',{level,method:'PUT',bytes,headers:{'Content-Type':mime,'Content-Length':String(bytes.length)}})).status,200);
    return ticket.id;
  }
  assert.equal((await call('/api/videographies',{level:null})).status,401);
  for(const level of [8,9,10,11]){
    for(const path of ['/api/videographies','/api/videographies/1','/api/videographies/1/comments','/api/vg-media/unknown','/api/videographie/rythme','/api/arbres?kind=video'])assert.equal((await call(path,{level})).status,403);
    assert.equal((await call('/api/vg-media',{level,method:'POST',body:{}})).status,403);
  }
  assert.equal((await call('/api/videographies',{level:12})).minimum_echelon,12);
  assert.equal((await call('/api/videographies',{level:12})).categories.length,5);
  for(const min_echelon of [11,17,'12',12.5])assert.equal((await call('/api/videographies',{method:'POST',body:post({min_echelon})})).status,400);
  assert.equal((await call('/api/videographies',{method:'POST',body:post(),headers:{Origin:'https://evil.test'}})).status,403);
  const publication=post(),created=await call('/api/videographies',{method:'POST',body:publication});assert.equal(created.status,201);assert.ok(created.id);
  assert.equal((await call('/api/videographies',{method:'POST',body:publication})).id,created.id);
  const path='/api/videographies/'+created.id;
  for(const url of [path,path+'/comments'])assert.equal((await call(url,{level:12})).status,404);
  assert.equal((await call('/api/videographies',{level:12})).posts.length,0);
  assert.equal((await call(path,{level:25,method:'DELETE'})).status,404);
  assert.equal((await call(path,{level:99})).status,200);
  const vid=await media('video');const filePost=await call('/api/videographies',{method:'POST',body:post({url:null,media_id:vid})});assert.equal(filePost.status,201);
  assert.equal((await call('/api/vg-media/'+vid,{level:12})).status,404);
  assert.equal((await call('/api/vg-media/'+vid,{method:'DELETE'})).status,409);
  assert.equal((await call('/api/vg-media/'+vid,{level:null})).status,401);
  const range=await call('/api/vg-media/'+vid,{headers:{Range:'bytes=2-4'}});assert.equal(range.status,206);assert.deepEqual([...range.bytes],[2,3,4]);assert.match(range.headers.get('Cache-Control'),/no-store/);
  assert.deepEqual([...(await call('/api/vg-media/'+vid,{headers:{Range:'bytes=-2'}})).bytes],[6,7]);
  assert.equal((await call('/api/vg-media/'+vid,{headers:{Range:'bytes=8-'}})).status,416);
  const vocal=await media();
  assert.equal((await call('/api/vg-media/'+vocal,{level:25})).status,404);
  assert.equal((await call('/api/vg-media/'+vocal+'/transcribe',{level:25,method:'POST'})).status,404);
  const transcription=await call('/api/vg-media/'+vocal+'/transcribe',{method:'POST'});assert.equal(transcription.text,'Bonjour à tous.');
  await call('/api/vg-media/'+vocal+'/transcribe',{method:'POST'});assert.equal(f.aiCalls,1);
  const comment={body:transcription.text,words:transcription.words,media_id:vocal,client_id:crypto.randomUUID()};
  assert.equal((await call(path+'/comments',{method:'POST',body:{...comment,words:[]}})).status,400);
  const first=await call(path+'/comments',{method:'POST',body:comment});assert.equal(first.status,201);assert.ok(first.id);
  assert.equal((await call(path+'/comments',{method:'POST',body:comment})).id,first.id);
  assert.equal((await call('/api/vg-media/'+vocal,{level:12})).status,404);
  assert.equal((await call('/api/vg-media/'+vocal,{level:25})).status,200);
  const secondMedia=await media('audio',25),child={body:'Merci.',words:[{m:'Merci.',d:0,f:1}],media_id:secondMedia,parent_id:first.id,client_id:crypto.randomUUID()};
  assert.equal((await call('/api/videographies/'+filePost.id+'/comments',{level:25,method:'POST',body:child})).status,400);
  const second=await call(path+'/comments',{level:25,method:'POST',body:child});assert.equal(second.status,201);
  assert.equal((await call(path,{method:'PATCH',body:post({min_echelon:12})})).status,400);
  assert.equal((await call('/api/vg-comments/'+first.id,{level:25,method:'PATCH',body:{body:'Piraté',words:[]}})).status,404);
  assert.equal((await call('/api/vg-comments/'+first.id,{method:'PATCH',body:{body:'Bonsoir à tous.',words:[{m:'Bonsoir',d:0,f:.33},{m:'à',d:.33,f:.67},{m:'tous.',d:.67,f:1}]}})).status,200);
  assert.equal((await call('/api/vg-comments/'+first.id,{method:'DELETE'})).status,200);
  const discussion=await call(path+'/comments');assert.equal(discussion.comments[0].deleted,true);assert.equal(discussion.comments[0].audio_url,null);assert.equal(discussion.comments[1].parent_id,first.id);
  assert.equal((await call('/api/vg-media/'+vocal)).status,404);
  assert.equal((await call(path,{method:'DELETE'})).status,200);
  assert.equal((await call('/api/vg-media/'+secondMedia,{level:25})).status,404);
  const discarded=await media();assert.equal((await call('/api/vg-media/'+discarded,{level:25,method:'DELETE'})).status,404);assert.equal((await call('/api/vg-media/'+discarded,{method:'DELETE'})).status,200);
  assert.equal((await call('/api/vg-media/'+discarded)).status,405);
  assert.equal((await call('/api/vg-media',{method:'POST',body:{kind:'video',mime:'text/html',duration:1,size:100}})).status,400);
  assert.equal((await call('/api/vg-media',{method:'POST',body:{kind:'video',mime:'video/mp4',duration:601,size:100}})).status,400);
  f.sql.close();
});

test('edited speech keeps unchanged timing anchors and yields valid monotonic captions',()=>{
  const context=vm.createContext({window:{},Uint16Array});vm.runInContext(readFileSync(new URL('../public/vocal.js',import.meta.url),'utf8'),context);
  const align=context.window.WCVocal.alignWords,source=[{m:'Bonjour',d:.2,f:.6},{m:'à',d:.7,f:.8},{m:'tous.',d:.9,f:1.5}];
  for(const text of ['Bonjour à tous.','Bonjour vraiment à tous.','Bonsoir à tous.','Bonjour tous.','Un tout nouveau texte','']){
    const words=JSON.parse(JSON.stringify(align(text,source,2)));assert.ok(validateTimings(words,text,2));
    if(text.includes('tous.'))assert.equal(words.at(-1).d,.9);
  }
  assert.equal(validateTimings([{m:'test',d:1,f:4}],'test',2),null);
  assert.equal(youtubeId('https://youtube.com.evil.test/watch?v=abcdefghijk'),null);
  assert.equal(youtubeId('javascript:alert(1)'),null);
  assert.equal(youtubeId('https://www.youtube.com/shorts/abcdefghijk'),'abcdefghijk');
});

test('failed transcription retains audio, allows bounded retries, and pagination retains parents',async()=>{
  const f=fixture();let failures=0;f.env.AI.run=async()=>{failures++;throw new Error('AI unavailable');};
  const call=async(path,method='GET',body)=>{
    const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa12','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
    return {status:r.status,...await r.json()};
  };
  await call('/api/videographies');
  f.sql.prepare("INSERT INTO vg_media(id,user_id,kind,mime,size,duration,object_key,state) VALUES('sample',13,'audio','audio/wav',4,1,'sample','ready')").run();
  await f.env.MEDIA.put('sample',new Uint8Array([1,2,3,4]));
  for(let i=0;i<3;i++)assert.equal((await call('/api/vg-media/sample/transcribe','POST',{})).status,503);
  assert.equal((await call('/api/vg-media/sample/transcribe','POST',{})).status,429);assert.equal(failures,3);assert.ok(await f.env.MEDIA.head('sample'));
  f.sql.prepare("INSERT INTO vg_posts(id,user_id,title,category,min_echelon,youtube_id,client_id,echelon_version) VALUES(1,13,'Thread','idees',12,'abcdefghijk','pagination-thread',3)").run();
  const insert=f.sql.prepare("INSERT INTO vg_comments(id,post_id,parent_id,user_id,body,words,client_id) VALUES(?,1,?,13,'Transcript','[]',?)");
  for(let i=1;i<=205;i++)insert.run(i,i===1?null:i-1,'comment-'+i);
  const first=await call('/api/videographies/1/comments');assert.equal(first.comments.length,100);assert.equal(first.nextAfter,100);
  const second=await call('/api/videographies/1/comments?after=100');assert.equal(second.comments[0].parent_id,100);assert.equal(second.nextAfter,200);
  const last=await call('/api/videographies/1/comments?after=200');assert.equal(last.comments.length,5);assert.equal(last.nextAfter,null);
  const all=[...first.comments,...second.comments,...last.comments];assert.equal(new Set(all.map(c=>c.id)).size,205);
  f.sql.close();
});

test('removed conversation themes migrate without broadening historical or current audiences',async()=>{
  const f=fixture();
  f.sql.exec("INSERT INTO conversation_messages(user_id,body,min_echelon,echelon_version,theme) VALUES(13,'Old private',6,1,'interpretations'),(13,'Current private',12,2,'idees'),(13,'Common',2,2,'idees')");
  const call=async level=>{const r=await worker.fetch(new Request('https://test.local/api/conversation',{headers:{Cookie:'wc_session=qa'+level}}),f.env);return r.json();};
  const low=await call(2);assert.deepEqual(low.messages,[]);
  const third=await call(3);assert.deepEqual(third.messages.map(m=>m.body),['Common']);assert.equal(third.messages[0].theme,'general');assert.equal(third.messages[0].min_echelon,3);
  const high=await call(12);assert.ok(!high.messages.some(m=>m.body==='Current private'));assert.ok(!high.messages.some(m=>m.body==='Old private'));
  assert.ok((await call(16)).messages.some(m=>m.body==='Current private'&&m.min_echelon===13));
  const old=f.sql.prepare("SELECT min_echelon,echelon_version,theme FROM conversation_messages WHERE body='Old private'").get();assert.equal(old.min_echelon,6);assert.equal(old.echelon_version,1);assert.equal(old.theme,'general');
  f.sql.close();
});

test('upload streams without a Content-Length are checked, recover after failure and retain exact bytes',async()=>{
  const f=fixture();
  const call=(path,method,body,headers={})=>worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa12',...headers},body}),f.env);
  const ticket=await(await call('/api/vg-media','POST',JSON.stringify({kind:'video',mime:'video/webm',size:8,duration:1}),{'Content-Type':'application/json'})).json();
  const upload=bytes=>call(ticket.upload_url,'PUT',new Uint8Array(bytes),{'Content-Type':'video/webm'});
  assert.equal((await upload([1,2,3,4])).status,503);
  assert.equal(f.sql.prepare('SELECT state FROM vg_media WHERE id=?').get(ticket.id).state,'pending');
  assert.equal((await upload([0,1,2,3,4,5,6,7,8])).status,503);
  assert.equal(f.objects.size,0);
  assert.equal((await upload([0,1,2,3,4,5,6,7])).status,200);
  const published=await call('/api/videographies','POST',JSON.stringify({title:'Uploaded',category:'univers',min_echelon:12,media_id:ticket.id,client_id:crypto.randomUUID()}),{'Content-Type':'application/json'});
  assert.equal(published.status,201);
  const replay=await worker.fetch(new Request('https://test.local/api/vg-media/'+ticket.id,{headers:{Cookie:'wc_session=qa12'}}),f.env);
  assert.deepEqual([...new Uint8Array(await replay.arrayBuffer())],[0,1,2,3,4,5,6,7]);
  f.sql.close();
});

test('existing video audiences stay protected and no video is accessible before level 12',async()=>{
  const f=fixture();
  const call=async(level,path='/api/videographies')=>worker.fetch(new Request('https://test.local'+path,{headers:{Cookie:'wc_session=qa'+level}}),f.env);
  await call(12);
  f.sql.prepare("INSERT INTO vg_posts(id,user_id,title,category,min_echelon,youtube_id,client_id) VALUES(1,13,'Existing private video','univers',12,'abcdefghijk','existing-version-two')").run();
  assert.deepEqual((await(await call(12)).json()).posts,[]);
  assert.equal((await call(12,'/api/videographies/1')).status,404);
  const thirteenth=await(await call(13)).json();assert.equal(thirteenth.posts.length,1);assert.equal(thirteenth.posts[0].min_echelon,13);
  assert.equal((await call(13,'/api/videographies/1')).status,200);
  f.sql.prepare("INSERT INTO vg_posts(id,user_id,title,category,min_echelon,youtube_id,client_id,echelon_version) VALUES(2,13,'Previously open at 9','univers',9,'abcdefghijk','existing-version-three',3)").run();
  assert.equal((await call(11,'/api/videographies/2')).status,403);
  const older=await(await call(12,'/api/videographies/2')).json();assert.equal(older.post.min_echelon,12);assert.equal(older.minimum_echelon,12);
  f.sql.close();
});
