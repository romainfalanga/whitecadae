import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';
import {seal} from '../src/private-data.js';
import {youtubeId,youtubeLink,youtubeEmbed} from '../public/youtube-video.js';
const id='M7lc1UVf-VE',url='https://www.youtube.com/watch?v='+id;

test('YouTube links normalize supported formats and discard tracking, playlists and start parameters',()=>{
  for(const link of [url,url+'&list=private-list&t=60','https://youtu.be/'+id+'?si=tracking','https://m.youtube.com/watch?v='+id,'https://www.youtube.com/shorts/'+id,'https://youtube.com/live/'+id,'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=0','  '+url+'  ']){
    assert.equal(youtubeId(link),id);assert.equal(youtubeLink(link),url);
    assert.equal(youtubeEmbed(link),'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1&rel=0');
    assert.equal(youtubeEmbed(link,false),'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=0&playsinline=1&rel=0');
  }
});
test('YouTube links reject arbitrary hosts, credentials, HTML, ambiguous IDs and executable URLs',()=>{
  for(const link of [undefined,{},42,'',id,'http://youtu.be/'+id,'javascript:alert(1)','data:text/html,<script>alert(1)</script>','https://www.youtube.com.evil.test/watch?v='+id,'https://youtube.com@evil.test/watch?v='+id,'https://name@youtube.com/watch?v='+id,'https://youtube.com:8443/watch?v='+id,'https://youtube.com/redirect?q='+url,'https://youtube.com/playlist?list='+id,url+'&v=aaaaaaaaaaa','https://youtu.be/'+id+'/extra','https://youtube.com/watch?v=short','https://youtube.com/watch?v=%22%3E%3Cscript%3E',`<iframe src="https://youtube.com/embed/${id}"></iframe>`,'https://youtube-nocookie.com/watch?v='+id,'https://youtu.be/'+id+'?'+ 'x'.repeat(2048)]){
    assert.equal(youtubeId(link),null,String(link));assert.equal(youtubeLink(link),'');assert.equal(youtubeEmbed(link),'');
  }
});
test('YouTube URL stays encrypted, reaches only accepted AS and is revoked with membership',async()=>{
  const f=fixture();
  async function call(path,level=18,method='GET',body){const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+level,'X-WC-User':String(level+1),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);return {status:r.status,body:await r.json(),cache:r.headers.get('Cache-Control')};}
  async function ok(...args){const r=await call(...args);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
  try{
    for(const level of [18,19])await ok('/api/private/consent',level,'POST',{consent:true,version:'2026-10-01'});
    await ok('/api/ace-circles',18,'POST',{});
    const event={title:'Une vidéo personnelle',entryType:'creation',medium:'vidéo',videoBranch:'self',url:'https://youtu.be/'+id+'?si=tracking',precision:'day',date:'2026-10-01',kind:'autre',impact:'à explorer',themes:[],revision:0};
    await ok('/api/life-tree/events/youtube-private',18,'PUT',event);
    const ciphertext=f.sql.prepare('SELECT payload FROM life_events WHERE id=?').get('youtube-private').payload;assert.ok(!ciphertext.includes(id));
    const membership=crypto.randomUUID();await ok('/api/ace-circles/invitations',18,'POST',{id:membership,target:20,recipientNotice:true});await ok('/api/ace-circles/invitations/'+membership,19,'PUT',{action:'accept'});
    const topic=f.sql.prepare("SELECT id FROM circle_topics WHERE resource_key='event:youtube-private'").get().id,path='/api/ace-circles/topics/'+topic;
    assert.equal((await call(path,19)).status,200);
    const shared=await call(path,19);assert.equal(shared.body.topic.video.url,url);assert.match(shared.cache,/no-store/);
    assert.equal((await call(path,20)).status,403);
    assert.equal((await ok('/api/life-tree/events/youtube-private?owner=19',19)).event.creation.url,url);
    await ok(path+'/replies',19,'POST',{id:crypto.randomUUID(),text:'Un regard sur cette vidéo.'});
    await ok('/api/life-tree/events/youtube-private',18,'PUT',{...event,url:'https://www.youtube.com/shorts/aaaaaaaaaaa',revision:1});
    const updated=await ok(path,19);assert.equal(updated.topic.video.url,'https://www.youtube.com/watch?v=aaaaaaaaaaa');assert.equal(updated.replies.length,1);
    assert.equal((await call('/api/life-tree/events/youtube-private',18,'PUT',{...event,url:'https://evil.test/video.mp4',revision:2})).status,400);
    await ok('/api/ace-circles/members/'+membership,19,'DELETE',{});
    assert.equal((await call(path,19)).status,403);assert.equal((await call('/api/life-tree/events/youtube-private?owner=19',19)).status,403);
  }finally{f.sql.close();}
});
test('category migration preserves encrypted contents, dates, replies and updates feed revisions',async()=>{
  const f=fixture();try{
    const payload=await seal(f.env,'life:19:old-society',{title:'Une idée à conserver',creation:{medium:'vidéo',url:'',work:'Mon texte'}});
    f.sql.prepare('INSERT INTO ace_circles(owner_id) VALUES(19)').run();
    f.sql.prepare("INSERT INTO life_events(id,owner_id,sort_date,precision,kind,impact,entry_type,video_branch,payload) VALUES('old-society',19,'2026-09-01','day','autre','à explorer','creation','society',?)").run(payload);
    f.sql.prepare("INSERT INTO circle_topics(owner_id,resource_key,kind,event_id) VALUES(19,'event:old-society','creation','old-society')").run();
    const topic=f.sql.prepare('SELECT id,revision FROM circle_topics').get();
    f.sql.prepare("INSERT INTO ace_messages(owner_id,author_id,payload,request_id,event_id,topic_id) VALUES(19,19,'existing-reply','request-0001','old-society',?)").run(topic.id);
    const before=f.sql.prepare('SELECT content_revision FROM ace_circles WHERE owner_id=19').get();
    f.sql.exec(readFileSync(new URL('../migrations/0039_video_categories.sql',import.meta.url),'utf8'));
    const after=f.sql.prepare("SELECT * FROM life_events WHERE id='old-society'").get();
    assert.equal(after.payload,payload);assert.equal(after.sort_date,'2026-09-01');assert.equal(after.video_branch,'ideas');assert.equal(after.revision,2);
    assert.equal(f.sql.prepare('SELECT revision FROM circle_topics').get().revision,topic.revision+1);
    assert.equal(f.sql.prepare('SELECT payload FROM ace_messages').get().payload,'existing-reply');
    assert.equal(f.sql.prepare('SELECT content_revision FROM ace_circles WHERE owner_id=19').get().content_revision,before.content_revision+1);
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.sql.close();}
});
