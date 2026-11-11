import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,setEarnedLevel} from './community-fixture.mjs';
import worker from '../src/index.js';
import {withdrawOrphanedSharedPosts} from '../src/loge.js';

const event=(uploadId,extra={})=>({title:'Une réflexion',entryType:'creation',medium:'vidéo',videoBranch:'ideas',url:'',kind:'autre',impact:'à explorer',themes:[],revision:0,...(uploadId?{uploadId}:{}),...extra});
function setup(){
  const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');for(const id of [11,12])setEarnedLevel(f,id,33);
  const videos=new Map();let sequence=0;
  f.env.STREAM={
    async createDirectUpload(params){const id=(++sequence).toString(16).padStart(32,'0');videos.set(id,{id,creator:params.creator,meta:params.meta,requireSignedURLs:params.requireSignedURLs,status:{state:'pendingupload'},readyToStream:false,duration:-1,size:0,hlsPlaybackUrl:`https://customer-test.cloudflarestream.com/${id}/manifest/video.m3u8`,thumbnail:`https://customer-test.cloudflarestream.com/${id}/thumbnails/thumbnail.jpg`});return {id,uploadURL:`https://upload.cloudflarestream.com/${id}`};},
    video(id){return {async details(){if(!videos.has(id))throw Object.assign(new Error('missing'),{status:404});return structuredClone(videos.get(id));},async update(params){Object.assign(videos.get(id),params);},async delete(){videos.delete(id);},
      async generateToken(){return 'header.'+Buffer.from(JSON.stringify({sub:id,exp:String(Math.floor(Date.now()/1000)+3600)})).toString('base64url')+'.signature';}};}
  };
  // D1 refuses a statement whose bound values differ from its highest placeholder: check every query.
  const prepare=f.env.DB.prepare;f.env.DB.prepare=query=>{const statement=prepare(query),bind=statement.bind;statement.bind=(...args)=>{const highest=Math.max(0,...[...query.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])));if(highest&&args.length!==highest)throw Error(`binding mismatch ${args.length}/${highest}: ${query.slice(0,80)}`);if(args.length>100)throw Error(`too many parameters (${args.length}): ${query.slice(0,80)}`);return bind(...args);};return statement;};
  f.call=async(path,method='GET',body,user=11)=>{const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+(user-1),'X-WC-User':String(user),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env);return {status:r.status,data:await r.json()};};
  f.video=async(id,extra={},user=11,duration=40)=>{
    const u=await f.call('/api/life-tree/uploads','POST',{filename:'v.mp4',size:1000,requestId:crypto.randomUUID()},user);assert.equal(u.status,201,JSON.stringify(u.data));
    const row=f.sql.prepare('SELECT stream_id FROM loge_stream_uploads WHERE id=?').get(u.data.uploadId);Object.assign(videos.get(row.stream_id),{readyToStream:true,status:{state:'ready'},duration,size:1000});
    const saved=await f.call('/api/life-tree/events/'+id,'PUT',event(u.data.uploadId,extra),user);assert.equal(saved.status,200,JSON.stringify(saved.data));
  };
  f.series=async(id,items,title='Ma série',user=11)=>(await f.call('/api/life-tree/series/'+id,'PUT',{title,items,revision:0},user)).data.series;
  return f;
}

test('a sériographie whose videos share one loge category publishes as a single post that plays part by part',async()=>{
  const f=setup();try{
    await f.video('video-one01',{},11,30);await f.video('video-two02',{},11,45);await f.video('video-thr03',{},11,25);
    await f.series('serie-0001',['video-two02','video-one01','video-thr03'],'Trois pas');
    const choices=(await f.call('/api/loge/videos')).data.series;assert.deepEqual(choices,[{id:'serie-0001',title:'Trois pas',count:3,category:'ideas',reason:null}]);
    const created=await f.call('/api/loge/posts','POST',{seriesId:'serie-0001',requestId:crypto.randomUUID()});assert.equal(created.status,201,JSON.stringify(created.data));
    const post=created.data.post;assert.equal(post.title,'Trois pas');assert.equal(post.seriesParts,3);assert.equal(post.loge,'ideas');assert.equal(post.videoProvider,'stream');
    assert.deepEqual(f.sql.prepare('SELECT event_id FROM loge_shared_series ORDER BY position').all().map(r=>r.event_id),['video-two02','video-one01','video-thr03']);
    const first=await f.call(`/api/loge/posts/${post.id}/playback`);assert.equal(first.status,200);assert.equal(first.data.part,0);assert.deepEqual(first.data.parts.map(p=>p.duration),[45,30,25]);assert.match(first.data.hls,/manifest\/video\.m3u8$/);
    const third=await f.call(`/api/loge/posts/${post.id}/playback?part=2`);assert.equal(third.data.part,2);
    for(const part of ['3','-1','x'])assert.equal((await f.call(`/api/loge/posts/${post.id}/playback?part=${part}`)).status,404);
    assert.equal((await f.call('/api/loge?loge=ideas')).data.posts[0].id,post.id);assert.equal((await f.call('/api/loge?loge=society')).data.posts.length,0);
    // The same videos can return in another sériographie, as another post, the next week.
    f.sql.prepare('UPDATE loge_publication_limits SET next_publish_at=unixepoch()-1').run();
    await f.series('serie-0002',['video-one01','video-two02']);
    assert.equal((await f.call('/api/loge/posts','POST',{seriesId:'serie-0002',requestId:crypto.randomUUID()})).status,201);
    assert.equal((await f.call('/api/loge/posts','POST',{seriesId:'serie-0001',requestId:crypto.randomUUID()})).status,429,'one publication per week');
  }finally{f.sql.close();}
});

test('mixed, private or missing categories keep a sériographie out of the loges without spending the week',async()=>{
  const f=setup();try{
    await f.video('video-ide01',{videoBranch:'ideas'});await f.video('video-soc02',{videoBranch:'society'});await f.video('video-sel03',{videoBranch:'self'});
    await f.series('serie-mix01',['video-ide01','video-soc02']);await f.series('serie-pri02',['video-sel03']);
    const choices=(await f.call('/api/loge/videos')).data.series;
    assert.match(choices.find(s=>s.id==='serie-mix01').reason,/même catégorie/);assert.match(choices.find(s=>s.id==='serie-pri02').reason,/pas de loge/);
    for(const id of ['serie-mix01','serie-pri02','serie-none3'])assert.equal((await f.call('/api/loge/posts','POST',{seriesId:id,requestId:crypto.randomUUID()})).status,id==='serie-none3'?404:409);
    assert.equal((await f.call('/api/loge/posts','POST',{seriesId:'serie-mix01',eventId:'video-ide01',requestId:crypto.randomUUID()})).status,400);
    assert.equal((await f.call('/api/loge/posts','POST',{seriesId:'serie-mix01',requestId:crypto.randomUUID()},12)).status,404,'another member’s sériographie is not found');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_publication_limits WHERE next_publish_at>unixepoch()').get().n,0);
  }finally{f.sql.close();}
});

test('a published sériographie skips a deleted video and is withdrawn when none remains; its author can delete it',async()=>{
  const f=setup();try{
    await f.video('video-aaa01',{},11,20);await f.video('video-bbb02',{},11,35);await f.series('serie-0003',['video-aaa01','video-bbb02']);
    const post=(await f.call('/api/loge/posts','POST',{seriesId:'serie-0003',requestId:crypto.randomUUID()})).data.post;
    await f.call('/api/life-tree/events/video-aaa01','DELETE',{revision:1});
    const playback=await f.call(`/api/loge/posts/${post.id}/playback`);assert.equal(playback.status,200);assert.deepEqual(playback.data.parts.map(p=>p.duration),[35]);
    assert.equal((await f.call(`/api/loge/posts/${post.id}`)).data.post.seriesParts,1);
    await f.call('/api/life-tree/events/video-bbb02','DELETE',{revision:1});await withdrawOrphanedSharedPosts(f.env);
    assert.equal((await f.call(`/api/loge/posts/${post.id}`)).status,404);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_shared_series').get().n,0);
    f.sql.prepare('UPDATE loge_publication_limits SET next_publish_at=unixepoch()-1').run();
    await f.video('video-ccc03');await f.series('serie-0004',['video-ccc03']);
    const second=(await f.call('/api/loge/posts','POST',{seriesId:'serie-0004',requestId:crypto.randomUUID()})).data.post;
    assert.equal((await f.call(`/api/loge/posts/${second.id}`,'DELETE',{revision:second.revision})).status,200);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_shared_series').get().n,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM loge_stream_uploads WHERE state='published'").get().n,1,'the videography keeps its video');
  }finally{f.sql.close();}
});

import {readFileSync} from 'node:fs';
test('the Loge client offers « Une vidéo » or « Une sériographie », and a series reel shows its parts and « next »',()=>{
  const loge=readFileSync(new URL('../public/loge.js',import.meta.url),'utf8'),feed=readFileSync(new URL('../public/loge-video.js',import.meta.url),'utf8');
  assert.match(loge,/<button type="button" data-publish-kind="video" aria-pressed="\$\{kind==='video'\}">Une vidéo<\/button><button type="button" data-publish-kind="series" aria-pressed="\$\{kind==='series'\}">Une sériographie<\/button>/);
  assert.match(loge,/body:\{\.\.\.\(series\?\{seriesId:draft\.seriesId\}:\{eventId:draft\.eventId\}\)/);
  assert.match(loge,/post\.seriesParts>1\?`<button type="button" class="loge-reel-icon loge-reel-next" data-series-next=/);
  assert.match(loge,/<span class="loge-timeline-marks" data-timeline-marks aria-hidden="true"><\/span>/);
  assert.match(loge,/getPlayback:\(id,part\)=>request\('\/api\/loge\/posts\/'\+encodeURIComponent\(id\)\+'\/playback'\+\(Number\.isSafeInteger\(part\)\?'\?part='\+part:''\)/);
  assert.match(feed,/async next\(id\)\{/);assert.match(feed,/marks\.innerHTML=points\.map\(point=>`<i style="left:\$\{point\}%"><\/i>`\)/);
});
