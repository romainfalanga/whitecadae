import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './community-fixture.mjs';
import {THEME_SCHEMA,ensureThemeTables,parisWeek,settleThemeWeeks,getCurrentTheme,postThemeAssignment,handleThemes} from '../src/loge-themes.js';

function setup(date='2026-10-28T12:00:00Z'){
  const f=fixture();let clock=Math.floor(Date.parse(date)/1000);
  f.sql.function('unixepoch',()=>clock);
  async function call(path='/api/loge/themes',{method='GET',body,raw,user=11,headers={}}={}){
    const request=new Request('https://test.local'+path,{method,headers:{...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined||raw!==undefined?{body:raw??JSON.stringify(body)}:{})});
    let response;try{response=await handleThemes(request,f.env,new URL(request.url),{id:user},(data,status=200)=>Response.json(data,{status}));}catch(error){if(!(error instanceof Response))throw error;response=error;}
    return {status:response.status,data:await response.json()};
  }
  const next=()=>parisWeek(clock*1000).nextKey;
  const propose=(title,options={})=>call('/api/loge/themes/proposals',{method:'POST',body:{title,targetWeek:next()},...options});
  const like=(id,liked=true,options={})=>call(`/api/loge/themes/proposals/${id}/like`,{method:'PUT',body:{liked,targetWeek:next()},...options});
  return {...f,call,propose,like,next,get now(){return clock*1000;},setTime(date){clock=typeof date==='number'?date:Math.floor(Date.parse(date)/1000);}};
}
const rejectsStatus=async(promise,status)=>assert.equal((await promise.catch(error=>error)).status,status);

test('Paris weeks change at local Monday midnight and include the exact spring and autumn DST durations',()=>{
  const spring=parisWeek(Date.parse('2026-03-25T12:00:00Z'));
  assert.deepEqual(spring,{key:'2026-03-23',start:1774220400,end:1774821600,nextKey:'2026-03-30',nextStart:1774821600,nextEnd:1775426400});
  assert.equal(spring.end-spring.start,167*3600);
  const autumn=parisWeek(Date.parse('2026-10-23T12:00:00Z'));
  assert.equal(autumn.key,'2026-10-19');assert.equal(autumn.end-autumn.start,169*3600);
  assert.equal(parisWeek((autumn.end-1)*1000).key,'2026-10-19');assert.equal(parisWeek(autumn.end*1000).key,'2026-10-26');
  assert.equal(new Date(autumn.end*1000).toISOString(),'2026-10-25T23:00:00.000Z');
  assert.equal(parisWeek(Date.parse('2026-12-31T12:00:00Z')).nextKey,'2027-01-04');
});

test('proposals deduplicate canonical titles, do not implicitly vote, and expose only public member fields',async()=>{
  const f=setup();try{
    const first=await f.propose('  Les   émotions  ');assert.equal(first.status,201);const proposal=first.data.proposal;
    assert.equal(proposal.title,'Les émotions');assert.equal(proposal.likes,0);assert.equal(proposal.liked,false);assert.deepEqual(proposal.proposedBy,{id:11,username:'QA10'});
    const again=await f.propose('LES EMOTIONS',{user:12});assert.equal(again.status,200);assert.equal(again.data.proposal.id,proposal.id);assert.equal(again.data.proposal.themeId,proposal.themeId);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_themes').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_votes').get().n,0);
    const page=await f.call();assert.equal(page.data.current.themeId,null);assert.equal(page.data.nextWeek.week,'2026-11-02');assert.equal(page.data.proposals.length,1);assert.deepEqual(page.data.history,[]);
    assert.doesNotMatch(JSON.stringify(page.data),/email|password|created_by|proposed_by|normalized|@local|avatar_data/);
    assert.equal(await postThemeAssignment(f.env,null,f.now),null);assert.equal(await postThemeAssignment(f.env,undefined,f.now),null);
    await rejectsStatus(postThemeAssignment(f.env,'2026-10-26',f.now),409);
  }finally{f.sql.close();}
});

test('the theme overview reports the viewer publication quota even without a current theme',async()=>{
  const f=setup();try{
    assert.equal((await f.call()).data.nextPublicationAt,null);
    const next=Math.floor(f.now/1000)+3600;
    f.sql.prepare('INSERT INTO loge_publication_limits(user_id,next_publish_at) VALUES(11,?)').run(next);
    const overview=(await f.call()).data;
    assert.equal(overview.current.themeId,null);
    assert.equal(overview.nextPublicationAt,new Date(next*1000).toISOString());
    assert.equal((await f.call('/api/loge/themes',{user:12})).data.nextPublicationAt,null);
    assert.equal(Object.hasOwn((await f.call('/api/loge/themes/proposals')).data,'nextPublicationAt'),false);
    f.setTime(next);
    assert.equal((await f.call()).data.nextPublicationAt,null);
  }finally{f.sql.close();}
});

test('one desired-state vote per member and proposal allows multiple choices; ties select the oldest proposal and snapshots stay immutable',async()=>{
  const f=setup();try{
    const a=(await f.propose('Premier')).data.proposal,b=(await f.propose('Second')).data.proposal;
    const concurrent=await Promise.all(Array.from({length:8},()=>f.like(a.id)));
    assert.ok(concurrent.every(result=>result.status===200&&result.data.proposal.likes===1));
    assert.equal((await f.like(b.id)).data.proposal.likes,1);
    assert.equal((await f.like(a.id,false)).data.proposal.likes,0);assert.equal((await f.like(a.id,false)).data.proposal.likes,0);
    await f.like(a.id);await f.like(b.id,true,{user:12});await f.like(a.id,true,{user:12});
    f.setTime('2026-11-01T23:00:00Z');
    await Promise.all(Array.from({length:5},()=>settleThemeWeeks(f.env,f.now)));
    const current=await getCurrentTheme(f.env,f.now);assert.equal(current.themeId,a.themeId);assert.equal(current.likes,2);assert.equal(current.week,'2026-11-02');
    assert.deepEqual(await postThemeAssignment(f.env,current.week,f.now),{week:current.week,themeId:a.themeId});
    await rejectsStatus(postThemeAssignment(f.env,'2026-10-26',f.now),409);
    for(const liked of [true,false])assert.equal((await f.like(b.id,liked,{body:{liked,targetWeek:'2026-11-02'}})).status,409);
    const frozen=f.sql.prepare("SELECT * FROM loge_theme_weeks WHERE week_start='2026-11-02'").get();
    f.sql.prepare('DELETE FROM loge_theme_votes WHERE candidate_id=?').run(a.id);
    await settleThemeWeeks(f.env,f.now);assert.deepEqual(f.sql.prepare("SELECT * FROM loge_theme_weeks WHERE week_start='2026-11-02'").get(),frozen);
    const reused=await f.call('/api/loge/themes/proposals',{method:'POST',body:{themeId:a.themeId,targetWeek:f.next()}});assert.equal(reused.status,201);assert.equal(reused.data.proposal.themeId,a.themeId);
    const byTitle=await f.propose('PREMIER');assert.equal(byTitle.data.proposal.id,reused.data.proposal.id);
    assert.equal((await f.call('/api/loge/themes/proposals',{method:'POST',body:{themeId:b.themeId,targetWeek:f.next()}})).status,404);
  }finally{f.sql.close();}
});

test('zero-vote candidates still select the oldest; no candidates yield no theme and missed weeks settle on reads',async()=>{
  const f=setup();try{
    const first=(await f.propose('Sans vote')).data.proposal;await f.propose('Aussi sans vote');
    f.setTime('2026-11-09T01:00:00Z');
    const response=await f.call();assert.equal(response.data.current.week,'2026-11-09');assert.equal(response.data.current.themeId,null);
    const missed=f.sql.prepare("SELECT * FROM loge_theme_weeks WHERE week_start='2026-11-02'").get();assert.equal(missed.theme_id,first.themeId);assert.equal(missed.likes,0);
    assert.equal(response.data.history[0].id,first.themeId);assert.equal(response.data.history[0].lastWeek,'2026-11-02');assert.equal(response.data.history[0].editions,1);
  }finally{f.sql.close();}
});

test('database-time cutoffs close both like and unlike races even when settlement has not run',async()=>{
  for(const liked of [true,false]){
    const f=setup();try{
      const proposal=(await f.propose('Course')).data.proposal;if(!liked)await f.like(proposal.id);
      const prepare=f.env.DB.prepare;let armed=true;
      f.env.DB.prepare=query=>{
        const wrap=statement=>({...statement,bind(...args){return wrap(statement.bind(...args));},async run(){if(armed&&/^(INSERT INTO loge_theme_votes|DELETE FROM loge_theme_votes)/.test(query)){armed=false;f.setTime('2026-11-01T23:00:00Z');}return statement.run();}});
        return wrap(prepare(query));
      };
      assert.equal((await f.like(proposal.id,liked)).status,409);
      assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_votes').get().n,liked?0:1);
      assert.equal(f.sql.prepare("SELECT count(*) n FROM loge_theme_weeks WHERE week_start='2026-11-02'").get().n,0);
      await settleThemeWeeks(f.env,f.now);assert.equal((await getCurrentTheme(f.env,f.now)).likes,liked?0:1);
    }finally{f.sql.close();}
  }
  const f=setup();try{
    const prepare=f.env.DB.prepare;let armed=true;
    f.env.DB.prepare=query=>{
      const wrap=statement=>({...statement,bind(...args){return wrap(statement.bind(...args));},sync(){if(armed&&query.startsWith('INSERT INTO loge_theme_candidates')){armed=false;f.setTime('2026-11-01T23:00:00Z');}return statement.sync();}});
      return wrap(prepare(query));
    };
    assert.equal((await f.propose('Trop tard')).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_candidates').get().n,0);
  }finally{f.sql.close();}
});

test('malformed requests, stale target weeks, prototype fields and unsafe IDs never write votes or proposals',async()=>{
  const f=setup();try{
    for(const body of [{title:'',targetWeek:f.next()},{title:'a'.repeat(141),targetWeek:f.next()},{title:'Ligne\nbrisée',targetWeek:f.next()},{title:[],targetWeek:f.next()},{themeId:'1',targetWeek:f.next()},{title:'x',themeId:1,targetWeek:f.next()},{title:'x',targetWeek:'2026-11-03'},{title:'x',targetWeek:'2026-02-30'},{title:'x',targetWeek:[]},{title:'x',targetWeek:f.next(),constructor:{}}])assert.equal((await f.call('/api/loge/themes/proposals',{method:'POST',body})).status,400);
    assert.equal((await f.call('/api/loge/themes/proposals',{method:'POST',raw:'{"title":"x","targetWeek":"2026-11-02","__proto__":{}}'})).status,400);
    for(const raw of ['{','null','[]'])assert.equal((await f.call('/api/loge/themes/proposals',{method:'POST',raw})).status,400);
    assert.equal((await f.propose('x',{headers:{'Content-Type':'text/plain'}})).status,415);
    assert.equal((await f.call('/api/loge/themes/proposals',{method:'POST',raw:' '.repeat(4200)})).status,413);
    assert.equal((await f.propose('x',{body:{title:'x',targetWeek:'2026-10-26'}})).status,409);
    for(const path of ['/api/loge/themes/proposals?after=0','/api/loge/themes/proposals?after=1%20OR%201=1','/api/loge/themes/history?after=-1','/api/loge/themes/history?after=9007199254740992'])assert.equal((await f.call(path)).status,400);
    for(const id of ['0','1%20OR%201=1','9007199254740992'])assert.equal((await f.like(id)).status,404);
    const a=(await f.propose("Robert'); DROP TABLE users;--")).data.proposal;
    for(const value of [1,0,'true',null,{},[]])assert.equal((await f.like(a.id,value)).status,400);
    assert.equal((await f.like(99999)).status,404);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_votes').get().n,0);assert.ok(f.sql.prepare('SELECT count(*) n FROM users').get().n>0);
    for(const value of ['2026-11-03','2026-02-30',{},'2026-11-02 OR 1=1'])await rejectsStatus(postThemeAssignment(f.env,value,f.now),400);
  }finally{f.sql.close();}
});

test('a member proposes at most three themes per week; replaying one of them stays accepted',async()=>{
  const f=setup();try{
    for(const title of ['Un','Deux','Trois'])assert.equal((await f.propose(title)).status,201);
    const refused=await f.propose('Quatre');assert.equal(refused.status,429);assert.match(refused.data.error,/3 thèmes/);
    assert.equal((await f.propose('Deux')).status,200,'an existing proposal is a replay, not a fourth');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_candidates').get().n,3);assert.equal(f.sql.prepare("SELECT count(*) n FROM loge_themes WHERE title='Quatre'").get().n,0);
  }finally{f.sql.close();}
});
test('proposal and history cursors use stable IDs, search is accent insensitive and archive metadata counts live tagged videos',async()=>{
  const f=setup();try{
    // A member proposes three themes a week: this long list is credited to another account as it grows.
    const spread=()=>f.sql.prepare('UPDATE loge_theme_candidates SET proposed_by=26').run();
    const order=[];for(let i=0;i<43;i++){order.push((await f.propose('Réflexion '+i)).data.proposal);spread();}
    const first=(await f.call('/api/loge/themes/proposals')).data;assert.equal(first.proposals.length,20);
    await f.propose('Nouveau');const second=(await f.call('/api/loge/themes/proposals?after='+first.next)).data,third=(await f.call('/api/loge/themes/proposals?after='+second.next)).data;
    assert.deepEqual([...first.proposals,...second.proposals,...third.proposals].map(p=>p.id),order.map(p=>p.id).reverse());assert.equal(third.next,null);
    // Seed selected editions for each title, allowing the archive to span pages.
    for(const p of order){const offset=p.id*7,date=new Date(Date.UTC(2025,0,6+offset));const w=parisWeek(date.getTime());f.sql.prepare('INSERT INTO loge_theme_weeks(week_start,starts_at,ends_at,theme_id,candidate_id,likes) VALUES(?,?,?,?,?,?)').run(w.key,w.start,w.end,p.themeId,p.id,0);}
    const selected=order[0],week=f.sql.prepare('SELECT week_start FROM loge_theme_weeks WHERE theme_id=?').get(selected.themeId).week_start;
    for(let i=0;i<3;i++){const post=Number(f.sql.prepare('INSERT INTO loge_posts(author_id,request_id,request_fingerprint,youtube_id,title,description,deleted_at) VALUES(11,?,?,?,?,?,?)').run(crypto.randomUUID(),'test','dQw4w9WgXcQ','Vidéo','Texte',i===2?123:null).lastInsertRowid);f.sql.prepare('INSERT INTO loge_post_themes(post_id,theme_id,week_start) VALUES(?,?,?)').run(post,selected.themeId,week);}
    const h1=(await f.call('/api/loge/themes/history?q=REFLEXION')).data,h2=(await f.call('/api/loge/themes/history?q=reflexion&after='+h1.next)).data,h3=(await f.call('/api/loge/themes/history?q=reflexion&after='+h2.next)).data;
    const archive=[...h1.themes,...h2.themes,...h3.themes];assert.deepEqual(archive.map(p=>p.id),order.map(p=>p.themeId).reverse());assert.equal(h3.next,null);assert.equal(archive.at(-1).videoCount,2);
    assert.deepEqual((await f.call('/api/loge/themes/history?q=%25%27%20OR%201%3D1')).data.themes,[]);
  }finally{f.sql.close();}
});

test('settlement drains missed editions in bounded batches and excludes votes recorded at or after the deadline',async()=>{
  const f=setup();try{
    await ensureThemeTables(f.env);
    const theme=Number(f.sql.prepare("INSERT INTO loge_themes(title,normalized,created_by) VALUES('Archive','archive',11)").run().lastInsertRowid);
    for(let i=0;i<47;i++){
      const date=new Date('2025-01-06T12:00:00Z');date.setUTCDate(date.getUTCDate()+i*7);
      const week=parisWeek(date.getTime()),previous=parisWeek((week.start-1)*1000);
      const candidate=Number(f.sql.prepare('INSERT INTO loge_theme_candidates(theme_id,target_week,starts_at,opens_at,proposed_by,created_at) VALUES(?,?,?,?,11,?)').run(theme,week.key,week.start,previous.start,previous.start+100).lastInsertRowid);
      f.sql.prepare('INSERT INTO loge_theme_votes(candidate_id,user_id,created_at) VALUES(?,11,?)').run(candidate,week.start-1);
      f.sql.prepare('INSERT INTO loge_theme_votes(candidate_id,user_id,created_at) VALUES(?,12,?)').run(candidate,week.start);
      f.sql.prepare('INSERT INTO loge_theme_votes(candidate_id,user_id,created_at) VALUES(?,26,?)').run(candidate,week.start+1);
    }
    const batch=f.env.DB.batch,batchSizes=[];f.env.DB.batch=async statements=>{batchSizes.push(statements.length);return batch(statements);};
    await settleThemeWeeks(f.env,f.now);
    assert.deepEqual(batchSizes,[40,7]);assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_weeks WHERE theme_id=?').get(theme).n,47);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_weeks WHERE theme_id=? AND likes=1').get(theme).n,47);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM loge_theme_weeks').get().n,48);
    await settleThemeWeeks(f.env,f.now);assert.deepEqual(batchSizes,[40,7]);
  }finally{f.sql.close();}
});

test('the additive migration and lazy schema agree, preserve publications, and keep associations linked by foreign keys',async()=>{
  const f=setup();try{
    const post=Number(f.sql.prepare("INSERT INTO loge_posts(author_id,request_id,request_fingerprint,youtube_id,title,description) VALUES(11,'migration','fixture','dQw4w9WgXcQ','Texte existant','Description existante')").run().lastInsertRowid);
    const before=f.sql.prepare('SELECT * FROM loge_posts WHERE id=?').get(post);
    const migration=readFileSync(new URL('../migrations/0049_loge_themes.sql',import.meta.url),'utf8');
    f.sql.exec(migration);f.sql.exec(migration);for(const query of THEME_SCHEMA)f.sql.exec(query);await ensureThemeTables(f.env);
    for(const table of ['loge_themes','loge_theme_candidates','loge_theme_votes','loge_theme_weeks','loge_post_themes'])assert.ok(f.sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
    assert.deepEqual(f.sql.prepare('SELECT * FROM loge_posts WHERE id=?').get(post),before);
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.sql.close();}
});
