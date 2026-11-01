import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleLoge,LOGE_SCHEMA,LOGE_WEEK_SECONDS,LOGE_COMMENT_WRITES_PER_MINUTE} from '../src/loge.js';
import {NODES} from '../src/echelon.js';
import {fixture} from './community-fixture.mjs';
import {accountResetPlan} from '../scripts/account-reset-plan.mjs';
import worker from '../src/index.js';

const signs=NODES.flatMap(node=>node.answers.map(answer=>answer.id));
const makePost=(extra={})=>({title:'Ma réflexion',description:'Un chemin vers une Harmonie.',url:'https://youtu.be/dQw4w9WgXcQ?si=discard',requestId:crypto.randomUUID(),...extra});
function setup(){
  const f=fixture();
  function level(userId,number){
    f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=?').run(userId);
    for(const sign of signs.slice(0,number-1))f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(userId,sign,'now');
  }
  level(10,32);for(const id of [11,12,26])level(id,33);
  const deps={getUser:async request=>{
    const token=/wc_session=([^;]+)/.exec(request.headers.get('Cookie')||'')?.[1];
    return f.sql.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=?').get(token||'')||null;
  },json:(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}})};
  async function call(path='/api/loge',{token='qa10',method='GET',body,raw,headers={},accountHeader=true}={}){
    const account=f.sql.prepare('SELECT user_id FROM sessions WHERE token=?').get(token)?.user_id;
    const writing=!['GET','HEAD','OPTIONS'].includes(method);
    const request=new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session='+token,...(writing&&accountHeader?{'X-WC-User':String(account)}:{}),...((body!==undefined||raw!==undefined)?{'Content-Type':'application/json'}:{}),...headers},...((body!==undefined||raw!==undefined)?{body:raw??JSON.stringify(body)}:{})});
    let response;try{response=await handleLoge(request,f.env,new URL(request.url),deps);}catch(error){if(!(error instanceof Response))throw error;response=error;}
    return {status:response.status,data:await response.json(),headers:response.headers};
  }
  const post=(body=makePost(),options={})=>call('/api/loge/posts',{method:'POST',body,...options});
  const comment=(postId,body='Une piste pour avancer.',options={})=>call('/api/loge/posts/'+postId+'/comments',{method:'POST',body:{body,requestId:crypto.randomUUID()},...options});
  function seedPost(author=11,title='Réflexion'){
    return Number(f.sql.prepare('INSERT INTO loge_posts(author_id,request_id,request_fingerprint,youtube_id,title,description) VALUES(?,?,?,?,?,?)').run(author,crypto.randomUUID(),'fixture','dQw4w9WgXcQ',title,'Description').lastInsertRowid);
  }
  function seedComment(postId,author=12,body='Une intervention'){
    return Number(f.sql.prepare('INSERT INTO loge_comments(post_id,author_id,request_id,request_fingerprint,body) VALUES(?,?,?,?,?)').run(postId,author,crypto.randomUUID(),'fixture',body).lastInsertRowid);
  }
  return {...f,call,post,comment,level,seedPost,seedComment};
}
const path=id=>'/api/loge/posts/'+id;

test('the Loge checks the real level on every endpoint, including administrators and existing accounts',async()=>{
  const f=setup();try{
    for(const [token,status]of [['invalid',401],['qa9',403],['qa99',403],['qa10',200]]){
      const response=await f.call('/api/loge?level=33&admin=true',{token});assert.equal(response.status,status,token);assert.match(response.headers.get('Cache-Control'),/no-store/);
    }
    const created=await f.post();assert.equal(created.status,201);const id=created.data.post.id;
    for(const endpoint of ['/api/loge',path(id),path(id)+'/comments','/api/loge/membres/11']){
      assert.equal((await f.call(endpoint,{token:'qa9'})).status,403);
      assert.equal((await f.call(endpoint,{token:'invalid'})).status,401);
    }
    f.level(100,33);assert.equal((await f.call('/api/loge',{token:'qa99'})).status,200);
    f.level(11,32);assert.equal((await f.call()).status,403);assert.equal((await f.post()).status,403);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,1);
  }finally{f.sql.close();}
});

test('posts use normalized YouTube URLs, stable member identities and server UTC dates without exposing account data',async()=>{
  const f=setup();try{
    const empty=await f.call();assert.equal(empty.data.nextPublicationAt,null);assert.deepEqual(empty.data.posts,[]);
    f.sql.prepare("UPDATE users SET avatar_data='cHJpdmF0ZQ==',avatar_mime='image/png' WHERE id=11").run();
    const response=await f.post(makePost({author_id:12,user_id:12}));assert.equal(response.status,201);
    const post=response.data.post;assert.equal(post.author.id,11);assert.equal(post.author.avatar,'/api/roadmap/avatar/11');
    assert.equal(post.youtubeUrl,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');assert.equal(post.revision,1);assert.equal(post.commentCount,0);
    assert.match(post.createdAt,/Z$/);assert.equal(post.updatedAt,post.createdAt);
    assert.equal((Date.parse(response.data.nextPublicationAt)-Date.parse(post.createdAt))/1000,LOGE_WEEK_SECONDS);
    const detailed=(await f.call(path(post.id))).data;
    assert.deepEqual(detailed.post,post);assert.deepEqual(detailed.self,{id:11,username:'QA10',avatar:'/api/roadmap/avatar/11'});
    for(const data of [response.data,(await f.call()).data,detailed,(await f.call('/api/loge/membres/11')).data])assert.doesNotMatch(JSON.stringify(data),/password|email|auth_version|request_id|request_fingerprint|claim_token|avatar_data|cHJpdmF0ZQ|@local/);
  }finally{f.sql.close();}
});

test('invalid bodies, non-YouTube sources, incorrect account headers and malformed routes never consume the weekly quota',async()=>{
  const f=setup();try{
    for(const url of ['https://evil.test/watch?v=dQw4w9WgXcQ','javascript:alert(1)','<iframe src="youtube"></iframe>','http://youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com/watch?v=dQw4w9WgXcQ&v=jNQXAC9IVRw'])assert.equal((await f.post(makePost({url}))).status,400,url);
    for(const body of [makePost({title:''}),makePost({title:'x'.repeat(141)}),makePost({title:'Line\nbreak'}),makePost({description:''}),makePost({description:'x'.repeat(5001)}),makePost({requestId:'not-a-uuid'}),makePost({title:{invalid:true}})])assert.equal((await f.post(body)).status,400);
    for(const raw of ['{','[]','null'])assert.equal((await f.call('/api/loge/posts',{method:'POST',raw})).status,400);
    assert.equal((await f.post(makePost(),{headers:{'Content-Type':'text/plain'}})).status,415);
    assert.equal((await f.call('/api/loge/posts',{method:'POST',raw:' '.repeat(40000),headers:{'Content-Length':'1'}})).status,413);
    assert.equal((await f.post(makePost(),{accountHeader:false})).status,409);
    assert.equal((await f.post(makePost(),{headers:{'X-WC-User':'12'}})).status,409);
    assert.equal((await f.call('/api/loge',{headers:{'X-WC-User':'12'}})).status,409);
    for(const route of ['/api/loge/posts/0','/api/loge/posts/999999999999999999999','/api/loge/membres/404404'])assert.equal((await f.call(route)).status,404);
    assert.equal((await f.call('/api/loge?after=-1')).status,400);
    assert.equal((await f.call('/api/loge/membres/11?tab=unexpected')).status,400);
    assert.equal((await f.call('/api/loge/posts',{method:'GET'})).status,405);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,0);assert.equal((await f.call()).data.nextPublicationAt,null);
  }finally{f.sql.close();}
});

test('simultaneous different publications claim exactly one weekly slot; a deleted post never reopens that slot',async()=>{
  const f=setup();try{
    const attempts=await Promise.all(Array.from({length:8},(_,i)=>f.post(makePost({title:'Concurrent '+i}))));
    assert.deepEqual(attempts.map(response=>response.status).sort(),[201,429,429,429,429,429,429,429]);
    const winner=attempts.find(response=>response.status===201),id=winner.data.post.id,deadline=winner.data.nextPublicationAt;
    const blocked=attempts.find(response=>response.status===429);
    assert.equal(blocked.data.nextPublicationAt,deadline);assert.ok(Number(blocked.headers.get('Retry-After'))>0);assert.match(blocked.data.serverNow,/Z$/);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,1);
    const removed=await f.call(path(id),{method:'DELETE',body:{revision:1}});assert.equal(removed.status,200);assert.equal(removed.data.nextPublicationAt,deadline);
    assert.equal((await f.post()).status,429);assert.deepEqual((await f.call()).data.posts,[]);
    f.sql.prepare('UPDATE loge_publication_limits SET next_publish_at=unixepoch()-1 WHERE user_id=11').run();
    const next=await f.post();assert.equal(next.status,201);assert.notEqual(next.data.post.id,id);
    assert.equal((await f.post()).status,429);
  }finally{f.sql.close();}
});

test('the full 168-hour delay and publication date share one server instant even across clock boundaries',async()=>{
  const f=setup();try{
    let clock=Math.floor(Date.now()/1000);
    f.sql.function('unixepoch',()=>clock++);
    const result=await f.post();assert.equal(result.status,201);
    assert.equal(Date.parse(result.data.nextPublicationAt)-Date.parse(result.data.post.createdAt),LOGE_WEEK_SECONDS*1000);
    assert.equal(result.data.post.createdAt,result.data.post.updatedAt);
  }finally{f.sql.close();}
});

test('post request IDs survive retries, later edits and deletion without duplication or resurrection',async()=>{
  const f=setup();try{
    const body=makePost(),simultaneous=await Promise.all([f.post(body),f.post(body)]);
    assert.deepEqual(simultaneous.map(response=>response.status).sort(),[200,201]);
    assert.equal(simultaneous[0].data.post.id,simultaneous[1].data.post.id);const id=simultaneous[0].data.post.id,deadline=simultaneous[0].data.nextPublicationAt;
    assert.equal((await f.post({...body,title:'Different payload'})).status,409);
    const edited=await f.call(path(id),{method:'PUT',body:{title:'Edited title',description:'Edited description',revision:1}});assert.equal(edited.status,200);
    const retried=await f.post(body);assert.equal(retried.status,200);assert.equal(retried.data.post.title,'Edited title');assert.equal(retried.data.nextPublicationAt,deadline);
    assert.equal((await f.call(path(id),{method:'DELETE',body:{revision:2}})).status,200);
    f.sql.prepare('UPDATE loge_publication_limits SET next_publish_at=0 WHERE user_id=11').run();
    assert.equal((await f.post(body)).status,404);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,1);
    const tombstone=f.sql.prepare('SELECT * FROM loge_posts WHERE id=?').get(id);assert.equal(tombstone.title,'');assert.equal(tombstone.description,'');assert.equal(tombstone.youtube_id,'');
  }finally{f.sql.close();}
});

test('a failed publication insert rolls back its quota reservation',async()=>{
  const f=setup();try{
    f.sql.exec("CREATE TRIGGER fail_loge_post BEFORE INSERT ON loge_posts BEGIN SELECT RAISE(ABORT,'fixture insertion failure'); END");
    await assert.rejects(()=>f.post(),/fixture insertion failure/);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_publication_limits WHERE user_id=11').get().n,0);
    f.sql.exec('DROP TRIGGER fail_loge_post');assert.equal((await f.post()).status,201);
  }finally{f.sql.close();}
});

test('only the author may edit or delete a post; revisions reject concurrent edits and video replacement',async()=>{
  const f=setup();try{
    const created=await f.post(),id=created.data.post.id;
    for(const method of ['PUT','DELETE'])assert.equal((await f.call(path(id),{method,token:'qa11',body:{title:'Stolen',description:'Stolen',revision:1}})).status,404);
    f.level(100,33);assert.equal((await f.call(path(id),{method:'DELETE',token:'qa99',body:{revision:1}})).status,404);
    for(const key of ['url','youtubeUrl','youtubeId','youtube_id','videoId'])assert.equal((await f.call(path(id),{method:'PUT',body:{title:'Title',description:'Description',revision:1,[key]:'jNQXAC9IVRw'}})).status,400,key);
    const edits=await Promise.all([0,1].map(i=>f.call(path(id),{method:'PUT',body:{title:'Version '+i,description:'Description '+i,revision:1}})));
    assert.deepEqual(edits.map(response=>response.status).sort(),[200,409]);assert.equal(edits.find(response=>response.status===409).data.conflict,true);
    const current=(await f.call(path(id))).data.post;assert.equal(current.revision,2);assert.equal(current.youtubeUrl,created.data.post.youtubeUrl);
    assert.equal((await f.call(path(id),{method:'DELETE',body:{revision:1}})).status,409);assert.equal((await f.call(path(id),{method:'DELETE',body:{revision:2}})).status,200);
    assert.equal((await f.call(path(id))).status,404);
  }finally{f.sql.close();}
});

test('the global feed and member publications paginate by stable descending IDs without duplicates',async()=>{
  const f=setup();try{
    const all=[];for(let i=0;i<47;i++)all.push(f.seedPost(i%2?12:11,'Post '+i));
    const first=await f.call(),second=await f.call('/api/loge?after='+first.data.next),third=await f.call('/api/loge?after='+second.data.next);
    assert.deepEqual([first.data.posts.length,second.data.posts.length,third.data.posts.length],[20,20,7]);assert.equal(third.data.next,null);
    assert.deepEqual([...first.data.posts,...second.data.posts,...third.data.posts].map(post=>post.id),all.toReversed());
    const member=await f.call('/api/loge/membres/11?tab=reflexions'),more=await f.call('/api/loge/membres/11?after='+member.data.next);
    assert.equal(member.data.member.id,11);assert.equal(member.data.self.id,11);
    assert.deepEqual([...member.data.posts,...more.data.posts].map(post=>post.id),all.filter((_,i)=>i%2===0).toReversed());
    assert.equal(more.data.next,null);
  }finally{f.sql.close();}
});

test('comments are idempotent, owner scoped and revision protected while their counts remain current',async()=>{
  const f=setup();try{
    const id=(await f.post()).data.post.id,body={body:'Une aide précise.',requestId:crypto.randomUUID()};
    const attempts=await Promise.all([0,1].map(()=>f.call(path(id)+'/comments',{method:'POST',token:'qa11',body})));
    assert.deepEqual(attempts.map(response=>response.status).sort(),[200,201]);const comment=attempts[0].data.comment;
    assert.equal(comment.author.id,12);assert.equal(comment.postId,id);assert.match(comment.createdAt,/Z$/);
    assert.equal((await f.call(path(id))).data.post.commentCount,1);
    assert.equal(f.sql.prepare('SELECT write_count FROM loge_publication_limits WHERE user_id=12').get().write_count,1);
    assert.equal((await f.call(path(id)+'/comments',{method:'POST',token:'qa11',body:{...body,body:'Other content'}})).status,409);
    for(const method of ['PUT','DELETE'])assert.equal((await f.call('/api/loge/comments/'+comment.id,{method,body:{body:'Stolen',revision:1}})).status,404);
    const updated=await f.call('/api/loge/comments/'+comment.id,{method:'PUT',token:'qa11',body:{body:'Une autre piste.',revision:1}});assert.equal(updated.status,200);assert.equal(updated.data.comment.revision,2);
    assert.equal((await f.call('/api/loge/comments/'+comment.id,{method:'PUT',token:'qa11',body:{body:'Stale',revision:1}})).status,409);
    const retried=await f.call(path(id)+'/comments',{method:'POST',token:'qa11',body});assert.equal(retried.status,200);assert.equal(retried.data.comment.body,'Une autre piste.');
    assert.equal((await f.call('/api/loge/comments/'+comment.id,{method:'DELETE',token:'qa11',body:{revision:2}})).status,200);
    assert.equal((await f.call(path(id))).data.post.commentCount,0);
    assert.equal((await f.call(path(id)+'/comments',{method:'POST',token:'qa11',body})).status,404);
    assert.equal(f.sql.prepare('SELECT body FROM loge_comments WHERE id=?').get(comment.id).body,'');
  }finally{f.sql.close();}
});

test('comments paginate ascending and a distant focus includes its real comment and nearby context',async()=>{
  const f=setup();try{
    const id=f.seedPost(),other=f.seedPost(12),ids=[];
    for(let i=0;i<55;i++){ids.push(f.seedComment(id,12,'Comment '+i));if(i%5===0)f.seedComment(other,11,'Different thread');}
    const one=(await f.call(path(id)+'/comments')).data,two=(await f.call(path(id)+'/comments?after='+one.next)).data,three=(await f.call(path(id)+'/comments?after='+two.next)).data;
    assert.deepEqual([...one.comments,...two.comments,...three.comments].map(comment=>comment.id),ids);assert.deepEqual([one.comments.length,two.comments.length,three.comments.length],[20,20,15]);assert.equal(three.next,null);
    const focus=ids[43],focused=(await f.call(path(id)+'/comments?focus='+focus)).data;
    assert.ok(focused.comments.some(comment=>comment.id===focus));assert.deepEqual(focused.comments.slice(0,10).map(comment=>comment.id),ids.slice(33,43));
    assert.equal((await f.call(path(other)+'/comments?focus='+focus)).status,404);
    assert.equal((await f.call(path(id)+'/comments?focus=0')).status,400);
    assert.equal((await f.call(path(id)+'/comments?after=-1')).status,400);
  }finally{f.sql.close();}
});

test('profiles list interventions on other members posts only and removed posts erase their visible history and text',async()=>{
  const f=setup();try{
    const a=f.seedPost(11,'By A'),b=f.seedPost(12,'By B'),c=f.seedPost(26,'By C');
    const underA=f.seedComment(a,12,'B helps A'),underB=f.seedComment(b,12,'B under own post'),underC=f.seedComment(c,12,'B helps C');
    f.seedComment(b,11,'A helps B');
    const profile=(await f.call('/api/loge/membres/12?tab=interventions')).data;
    assert.equal(profile.member.id,12);assert.equal(profile.self.id,11);
    assert.deepEqual(profile.interventions.map(comment=>comment.id),[underC,underA]);assert.ok(profile.interventions.every(comment=>comment.post.author.id!==12));
    assert.equal(profile.interventions[1].post.title,'By A');assert.equal(profile.interventions[1].postId,a);
    assert.equal((await f.call(path(a),{method:'DELETE',body:{revision:1}})).status,200);
    assert.deepEqual((await f.call('/api/loge/membres/12?tab=interventions')).data.interventions.map(comment=>comment.id),[underC]);
    assert.equal((await f.call(path(a)+'/comments')).status,404);assert.equal((await f.call('/api/loge/comments/'+underA,{method:'PUT',token:'qa11',body:{body:'Cannot restore',revision:1}})).status,404);
    assert.equal(f.sql.prepare('SELECT body FROM loge_comments WHERE id=?').get(underA).body,'');assert.notEqual(f.sql.prepare('SELECT body FROM loge_comments WHERE id=?').get(underB).body,'');
  }finally{f.sql.close();}
});

test('intervention history paginates descending without including self-replies or deleted comments',async()=>{
  const f=setup();try{
    const other=f.seedPost(11),own=f.seedPost(12),expected=[];
    for(let i=0;i<47;i++){expected.push(f.seedComment(other,12,'Intervention '+i));if(i%4===0)f.seedComment(own,12,'Self reply');}
    f.sql.prepare("UPDATE loge_comments SET deleted_at=unixepoch(),body='' WHERE id=?").run(expected[23]);expected.splice(23,1);
    const first=(await f.call('/api/loge/membres/12?tab=interventions')).data;
    const second=(await f.call('/api/loge/membres/12?tab=interventions&after='+first.next)).data;
    const third=(await f.call('/api/loge/membres/12?tab=interventions&after='+second.next)).data;
    assert.deepEqual([...first.interventions,...second.interventions,...third.interventions].map(comment=>comment.id),expected.toReversed());
    assert.deepEqual([first.interventions.length,second.interventions.length,third.interventions.length],[20,20,6]);assert.equal(third.next,null);
  }finally{f.sql.close();}
});

test('short comment-write limits are atomic, do not spend publication quota and exempt successful retries',async()=>{
  const f=setup();try{
    const id=f.seedPost(),bodies=Array.from({length:LOGE_COMMENT_WRITES_PER_MINUTE+3},(_,i)=>({body:'Help '+i,requestId:crypto.randomUUID()}));
    const responses=await Promise.all(bodies.map(body=>f.call(path(id)+'/comments',{method:'POST',token:'qa11',body})));
    assert.equal(responses.filter(response=>response.status===201).length,LOGE_COMMENT_WRITES_PER_MINUTE);assert.equal(responses.filter(response=>response.status===429).length,3);
    assert.ok(responses.filter(response=>response.status===429).every(response=>Number(response.headers.get('Retry-After'))>0));
    const successful=responses.findIndex(response=>response.status===201);
    assert.equal((await f.call(path(id)+'/comments',{method:'POST',token:'qa11',body:bodies[successful]})).status,200);
    assert.equal(f.sql.prepare('SELECT write_count FROM loge_publication_limits WHERE user_id=12').get().write_count,LOGE_COMMENT_WRITES_PER_MINUTE);
    assert.equal((await f.call('/api/loge/comments/'+responses[successful].data.comment.id,{method:'PUT',token:'qa11',body:{body:'Edit during the same minute',revision:1}})).status,429);
    const post=await f.post(makePost(),{token:'qa11'});assert.equal(post.status,201);
    assert.equal((await f.comment(id,'Other member',{token:'qa25'})).status,201);
    f.sql.prepare('UPDATE loge_publication_limits SET write_window_at=unixepoch()-61 WHERE user_id=12').run();
    assert.equal((await f.comment(id,'After the minute',{token:'qa11'})).status,201);
    assert.equal((await f.post(makePost(),{token:'qa11'})).status,429);
  }finally{f.sql.close();}
});

test('the wired Worker rejects foreign origins and non-JSON Loge writes before accessing any database',async()=>{
  const env={get DB(){throw Error('Origin and content type must be rejected first');}};
  for(const [endpoint,method]of [['/api/loge/posts','POST'],['/api/loge/posts/1','PUT'],['/api/loge/posts/1','DELETE'],['/api/loge/posts/1/comments','POST'],['/api/loge/comments/1','PUT']]){
    for(const extra of [{Origin:'https://foreign.test'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'},{'Content-Type':'text/plain'}]){
      const response=await worker.fetch(new Request('https://test.local'+endpoint,{method,headers:{'Content-Type':'application/json',...extra},body:'{}'}),env);
      assert.equal(response.status,extra['Content-Type']?415:403,method+' '+endpoint);assert.match(response.headers.get('Cache-Control'),/no-store/);
    }
  }
});

test('a deletion between comment validation and insertion cannot publish into a removed thread',async()=>{
  const f=setup();try{
    const id=f.seedPost(),batch=f.env.DB.batch;
    let armed=true;
    f.env.DB.batch=async statements=>{if(armed&&statements.length===2){armed=false;f.sql.prepare("UPDATE loge_posts SET deleted_at=unixepoch(),title='',description='',youtube_id='' WHERE id=?").run(id);}return batch(statements);};
    assert.equal((await f.comment(id)).status,404);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_comments').get().n,0);
  }finally{f.sql.close();}
});

test('additive schema and lazy initialization preserve old data; foreign keys include Loge in reset planning and user cleanup',async()=>{
  const f=setup();try{
    f.sql.prepare('INSERT INTO playlists(user_id,name,tracks) VALUES(11,?,?)').run('Untouched playlist','["orange"]');
    const before={users:f.sql.prepare('SELECT * FROM users ORDER BY id').all(),progress:f.sql.prepare('SELECT * FROM riddle_progress ORDER BY user_id,riddle_id').all(),playlists:f.sql.prepare('SELECT * FROM playlists').all()};
    f.sql.exec('DROP TABLE loge_comments;DROP TABLE loge_publication_limits;DROP TABLE loge_posts');
    assert.equal((await f.call()).status,200);
    const migration=readFileSync(new URL('../migrations/0047_loge_virtuelle.sql',import.meta.url),'utf8');
    f.sql.exec(migration);f.sql.exec(migration);for(const sql of LOGE_SCHEMA)f.sql.exec(sql);
    assert.deepEqual(f.sql.prepare('SELECT * FROM users ORDER BY id').all(),before.users);assert.deepEqual(f.sql.prepare('SELECT * FROM riddle_progress ORDER BY user_id,riddle_id').all(),before.progress);assert.deepEqual(f.sql.prepare('SELECT * FROM playlists').all(),before.playlists);
    const id=(await f.post()).data.post.id;await f.comment(id,'Cross-member comment',{token:'qa11'});
    const report=accountResetPlan(f.sql).report;assert.equal(report.tables.loge_posts,1);assert.equal(report.tables.loge_comments,1);assert.equal(report.tables.loge_publication_limits,2);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,1);
    f.sql.exec('PRAGMA foreign_keys=ON;DELETE FROM users WHERE id=11');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_posts').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_comments').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_publication_limits WHERE user_id=11').get().n,0);assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.sql.close();}
});
