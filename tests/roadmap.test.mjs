import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {NODES} from '../src/echelon.js';
import {ensureRoadmapLevels,CURRENT_SCORES} from '../src/roadmap-levels.js';
import {fixture} from './community-fixture.mjs';
const request=(f,path,token='qa8',method='GET',body)=>worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session='+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);
const add=(f,id,user=1)=>f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(user,id,'now');

test('anonymous roadmap is an empty 33-step journey and reveals no members',async()=>{
  const res=await worker.fetch(new Request('https://test.local/api/roadmap'),{});
  assert.equal(res.status,200);assert.match(res.headers.get('Cache-Control'),/no-store/);
  assert.deepEqual(await res.json(),{echelon:1,total:33,self:null,steps:[]});
});

test('roadmap counts include the current level, expose only own email and load no member identities',async()=>{
  const f=fixture();try{
    const res=await request(f,'/api/roadmap?level=33');const data=await res.json();
    assert.equal(data.echelon,8);assert.equal(data.self.id,9);
    assert.ok(data.steps.every(s=>s.level<=8));
    assert.deepEqual(data.steps,[{level:1,count:2,members:[]},...[2,3,5,6,7,8].map(level=>({level,count:1,members:[]}))]);
    assert.equal(data.self.email,'qa8@local.test');
    assert.doesNotMatch(JSON.stringify(data.steps),/username|avatar|email|password|solved_at|eg-|@local/);
    for(const token of ['qa0','qa99'])assert.deepEqual((await(await request(f,'/api/roadmap',token)).json()).steps,[{level:1,count:2,members:[]}]);
    assert.equal((await request(f,'/api/roadmap','qa8','POST',{})).status,405);
  }finally{f.sql.close();}
});

test('members paginate without duplicates and forged levels or cursors cannot disclose future members',async()=>{
  const f=fixture();try{
    for(let i=101;i<=140;i++)f.sql.prepare('INSERT INTO users(id,email,username,password_hash) VALUES(?,?,?,?)').run(i,`m${i}@local.test`,`Member${i}`,'unused');
    const main=await(await request(f,'/api/roadmap')).json();assert.equal(main.steps[0].count,42);assert.deepEqual(main.steps[0].members,[]);
    const first=await(await request(f,'/api/roadmap/members?level=1')).json();assert.equal(first.members.length,24);assert.ok(first.next);
    const second=await(await request(f,'/api/roadmap/members?level=1&after='+first.next)).json();assert.equal(second.members.length,18);assert.equal(second.next,null);
    assert.equal(new Set([...first.members,...second.members].map(m=>m.id)).size,42);
    const current=await(await request(f,'/api/roadmap/members?level=8')).json();assert.deepEqual(current.members.map(m=>m.id),[9]);
    assert.doesNotMatch(JSON.stringify([...first.members,...current.members]),/email|password|solved_at|@local/);
    for(const value of ['9','33','-1','1.5','NaN'])assert.equal((await request(f,'/api/roadmap/members?level='+value)).status,403);
    assert.equal((await request(f,'/api/roadmap/members?level=1&after=-1')).status,400);
    assert.equal((await request(f,'/api/roadmap/members?level=1','invalid')).status,401);
  }finally{f.sql.close();}
});

test('derived scores track discoveries, retired signs, canonical duplicates and deletions',async()=>{
  const f=fixture();try{
    await ensureRoadmapLevels(f.env);
    assert.equal(f.sql.prepare('SELECT level FROM roadmap_levels WHERE user_id=1').get().level,1);
    for(const answer of NODES.flatMap(n=>n.answers))add(f,answer.id);
    add(f,'eg-02-2');add(f,'eg-03-3');add(f,'eg-16-3.p0');
    // Invalidated snapshots are never served, even before the next refresh.
    assert.equal(f.sql.prepare('SELECT count(*) AS n '+CURRENT_SCORES+' AND u.id=1').get().n,0);
    await ensureRoadmapLevels(f.env);
    assert.equal(f.sql.prepare('SELECT level FROM roadmap_levels WHERE user_id=1').get().level,33);
    f.sql.prepare("DELETE FROM riddle_progress WHERE user_id=1 AND riddle_id IN ('eg-16-3','eg-16-3.p0')").run();
    await ensureRoadmapLevels(f.env);
    assert.equal(f.sql.prepare('SELECT level FROM roadmap_levels WHERE user_id=1').get().level,32);
    f.sql.prepare('UPDATE riddle_progress SET solved_at=NULL WHERE user_id=1').run();
    await ensureRoadmapLevels(f.env);
    assert.equal(f.sql.prepare('SELECT level FROM roadmap_levels WHERE user_id=1').get().level,1);
    f.sql.exec('PRAGMA foreign_keys=ON; DELETE FROM users WHERE id=1');
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM roadmap_levels WHERE user_id=1').get().n,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM roadmap_revisions WHERE user_id=1').get().n,0);
  }finally{f.sql.close();}
});

test('photos require login and live access at or below the viewer, with no public caching',async()=>{
  const f=fixture();try{
    f.sql.prepare("UPDATE users SET avatar_data='aW1hZ2U=',avatar_mime='image/jpeg'").run();
    for(const answer of NODES.flatMap(n=>n.answers).slice(0,7))add(f,answer.id);
    for(const id of [1,9]){const res=await request(f,'/api/roadmap/avatar/'+id);assert.equal(res.status,200);assert.match(res.headers.get('Cache-Control'),/private, no-store/);}
    assert.deepEqual((await(await request(f,'/api/roadmap/members?level=8')).json()).members.map(m=>m.id),[1,9]);
    assert.equal((await request(f,'/api/roadmap/avatar/11')).status,404);
    assert.equal((await request(f,'/api/roadmap/avatar/9','invalid')).status,401);
    for(const answer of NODES.flatMap(n=>n.answers))add(f,answer.id);
    assert.equal((await request(f,'/api/roadmap/avatar/1')).status,404);
    assert.equal((await request(f,'/api/users/QA0/avatar')).status,410);
  }finally{f.sql.close();}
});

test('profile updates validate identity and images and appear immediately on the roadmap',async()=>{
  const f=fixture();try{
    assert.equal((await request(f,'/api/account/username','invalid','PUT',{username:'New name'})).status,401);
    assert.equal((await request(f,'/api/account/username','qa8','PUT',{username:'qa10'})).status,409);
    assert.equal((await request(f,'/api/account/username','qa8','PUT',{username:'<script>'})).status,400);
    assert.equal((await request(f,'/api/account/username','qa8','PUT',{username:'Nouvel Explorateur',email:'changed@local.test'})).status,200);
    assert.equal((await(await request(f,'/api/roadmap')).json()).self.username,'Nouvel Explorateur');
    assert.equal((await(await request(f,'/api/roadmap')).json()).self.email,'qa8@local.test');
    assert.equal((await request(f,'/api/account/avatar','qa8','POST',{data:'data:image/png;base64,PHN2Zz48L3N2Zz4='})).status,400);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nXsAAAAASUVORK5CYII=';
    assert.equal((await request(f,'/api/account/avatar','qa8','POST',{data:png})).status,200);
    assert.equal((await(await request(f,'/api/roadmap')).json()).self.avatar,'/api/roadmap/avatar/9');
    assert.equal((await request(f,'/api/roadmap/avatar/9')).headers.get('Content-Type'),'image/png');
  }finally{f.sql.close();}
});

test('new Signes API and legacy links share scores, guesses and Horloge restrictions',async()=>{
  const f=fixture();try{
    const old=await(await request(f,'/api/echelon','qa0')).json(),current=await(await request(f,'/api/signes','qa0')).json();
    assert.deepEqual(current,old);assert.ok(current.pages.every(p=>p.href.startsWith('/signes')));
    assert.equal((await request(f,'/api/signes/draft/eg-12','qa0')).status,404);
    const answer=await(await request(f,'/api/signes/guess','qa0','POST',{id:'eg-02',answer:'Dieu'})).json();
    assert.equal(answer.state.echelon,2);
    assert.equal((await(await request(f,'/api/roadmap','qa0')).json()).echelon,2);
    assert.equal((await(await request(f,'/api/echelon','qa0')).json()).echelon,2);
  }finally{f.sql.close();}
});

test('Horloge navigation appears only with its canonical sign, even for an administrator',async()=>{
  const f=fixture();try{
    for(const token of ['invalid','qa8','qa99'])assert.equal((await(await request(f,'/api/me',token)).json()).access.horloge,false);
    const answer=await(await request(f,'/api/signes/guess','qa8','POST',{id:'eg-03',answer:'horloge'})).json();
    assert.equal(answer.gained,1);
    assert.ok(answer.state.pages.some(p=>p.kind==='clock'));
    assert.equal((await(await request(f,'/api/me','qa8')).json()).access.horloge,true);
    f.sql.prepare("DELETE FROM riddle_progress WHERE user_id=9 AND riddle_id LIKE 'eg-03-1%'").run();
    assert.equal((await(await request(f,'/api/me','qa8')).json()).access.horloge,false);
  }finally{f.sql.close();}
});

test('concurrent registration cannot claim the same nickname with different case',async()=>{
  const f=fixture();try{
    const responses=await Promise.all(['Voyageur','voyageur'].map((username,i)=>request(f,'/api/register','invalid','POST',{email:`new${i}@local.test`,username,password:'local-fixture-only'})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const success=responses.find(r=>r.status===200),token=/wc_session=([^;]+)/.exec(success.headers.get('Set-Cookie'))[1];
    assert.equal((await(await request(f,'/api/roadmap',token)).json()).echelon,1);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM users WHERE username='voyageur' COLLATE NOCASE").get().n,1);
  }finally{f.sql.close();}
});

test('changing a password requires the current secret, preserves own session and revokes others',async()=>{
  const f=fixture();try{
    const registration=await request(f,'/api/register','invalid','POST',{email:'password@local.test',username:'Password Fixture',password:'before-fixture-only'});
    assert.equal(registration.status,200);
    const token=/wc_session=([^;]+)/.exec(registration.headers.get('Set-Cookie'))[1];
    const user=f.sql.prepare("SELECT * FROM users WHERE email='password@local.test'").get();
    f.sql.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run('second-session',user.id,'2099-01-01');
    const change=body=>request(f,'/api/account/password',token,'PUT',body);
    assert.equal((await change({current_password:'wrong-secret',new_password:'after-fixture-only'})).status,401);
    assert.equal((await change({current_password:'before-fixture-only',new_password:'short'})).status,400);
    assert.equal(f.sql.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash,user.password_hash);
    assert.equal((await request(f,'/api/account/password','invalid','PUT',{new_password:'after-fixture-only'})).status,401);
    assert.equal((await change({current_password:'before-fixture-only',new_password:'after-fixture-only',email:'forged@local.test'})).status,200);
    assert.equal((await(await request(f,'/api/roadmap',token)).json()).self.email,'password@local.test');
    assert.equal((await(await request(f,'/api/roadmap','second-session')).json()).self,null);
    assert.equal((await change({current_password:'before-fixture-only',new_password:'unused-fixture-only'})).status,401);
    const login=await request(f,'/api/login','invalid','POST',{email:'password@local.test',password:'after-fixture-only'});
    assert.equal(login.status,200);
    assert.equal((await(await request(f,'/api/roadmap','qa8')).json()).self.id,9);
  }finally{f.sql.close();}
});
