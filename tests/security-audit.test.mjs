import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';

const request=(path,body,headers={},method='POST')=>new Request('https://test.local'+path,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('an old-password login paused before verification cannot create a session after a password change',async()=>{
  const f=fixture();try{
    const created=await worker.fetch(request('/api/register',{email:'race@test.local',username:'RaceTest',password:'old-fixture-password'}),f.env);
    const token=/wc_session=([^;]+)/.exec(created.headers.get('Set-Cookie'))[1];
    const stored=f.sql.prepare("SELECT token FROM sessions WHERE user_id=(SELECT id FROM users WHERE email='race@test.local')").get().token;
    assert.notEqual(stored,token);assert.match(stored,/^sha256:/);
    let captured,release;const reached=new Promise(r=>captured=r),pause=new Promise(r=>release=r),original=f.env.DB.prepare;
    f.env.DB.prepare=(sql,args=[])=>{const statement=original(sql);const wrap=q=>({...q,bind(...a){return wrap(q.bind(...a));},async first(){const row=await q.first();if(sql.includes('SELECT id, email, username, password_hash, auth_version, is_admin FROM users WHERE email')){captured();await pause;}return row;}});return wrap(statement);};
    const pending=worker.fetch(request('/api/login',{email:'race@test.local',password:'old-fixture-password'}),f.env);await reached;
    const changed=await worker.fetch(request('/api/account/password',{current_password:'old-fixture-password',new_password:'new-fixture-password'},{Cookie:'wc_session='+token},'PUT'),f.env);assert.equal(changed.status,200);release();
    const stale=await pending;assert.equal(stale.status,401);assert.equal(stale.headers.get('Set-Cookie'),null);
    const replay=await worker.fetch(new Request('https://test.local/api/me',{headers:{Cookie:'wc_session='+stored}}),f.env);assert.equal((await replay.json()).user,null);
  }finally{f.sql.close();}
});
test('account inputs reject object passwords and avatars reject truncated or excessive containers',async()=>{
  const f=fixture();try{
    assert.equal((await worker.fetch(request('/api/register',{email:'object@test.local',username:'ObjectTest',password:{unexpected:true}}),f.env)).status,400);
    assert.equal((await worker.fetch(request('/api/login',{email:[],password:{}}),f.env)).status,400);
    const fake=Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0]);
    assert.equal((await worker.fetch(request('/api/account/avatar',{data:'data:image/jpeg;base64,'+fake.toString('base64')},{Cookie:'wc_session=qa0'}),f.env)).status,400);
  }finally{f.sql.close();}
});
test('foreign origins and non-JSON writes fail before database access',async()=>{
  const env={get DB(){throw Error('Must be rejected before database access');}};
  for(const path of ['/api/signes/guess','/api/echelon/guess','/api/57/guess','/api/account/username','/api/register','/api/login','/api/playlists','/api/playlists/1']){
    for(const headers of [{Origin:'https://hostile.local'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await worker.fetch(request(path,{},headers),env)).status,403,path);
    assert.equal((await worker.fetch(request(path,{}, {'Content-Type':'text/plain'}),env)).status,415,path);
  }
});
test('unverified registration never confers admin privileges; existing roles and session flags survive',async()=>{
  const f=fixture();
  try{
    f.env.ADMIN_EMAILS='reserved@example.test';
    const response=await worker.fetch(request('/api/register',{email:'reserved@example.test',username:'ReservedNew',password:'local-test-123',is_admin:true},{Origin:'https://test.local'}),f.env);
    assert.equal(response.status,200);assert.equal((await response.json()).user.is_admin,false);
    assert.match(response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
    assert.equal(f.sql.prepare('SELECT is_admin FROM users WHERE id=100').get().is_admin,1);
  }finally{f.sql.close();}
});
test('parallel registration requests atomically stop at six per address',async()=>{
  const f=fixture();
  try{
    const responses=await Promise.all(Array.from({length:20},()=>worker.fetch(request('/api/register',{}, {'CF-Connecting-IP':'192.0.2.1'}),f.env)));
    assert.equal(responses.filter(r=>r.status===400).length,6);assert.equal(responses.filter(r=>r.status===429).length,14);
    assert.ok(responses.filter(r=>r.status===429).every(r=>Number(r.headers.get('Retry-After'))>0));
    assert.equal(f.sql.prepare("SELECT compte FROM auth_attempts WHERE cle='inscription:192.0.2.1'").get().compte,6);
    assert.equal((await worker.fetch(request('/api/register',{}, {'CF-Connecting-IP':'192.0.2.2'}),f.env)).status,400);
  }finally{f.sql.close();}
});
test('parallel login attempts from one address stop at twenty before further password checks',async()=>{
  const f=fixture();
  try{
    const responses=await Promise.all(Array.from({length:25},(_,i)=>worker.fetch(request('/api/login',{email:`nobody${i}@example.test`,password:'nope'},{'CF-Connecting-IP':'192.0.2.3'}),f.env)));
    assert.equal(responses.filter(r=>r.status===401).length,20);assert.equal(responses.filter(r=>r.status===429).length,5);
    assert.equal(f.sql.prepare("SELECT compte FROM auth_attempts WHERE cle='connexion:192.0.2.3'").get().compte,20);
  }finally{f.sql.close();}
});
test('one network cannot lock a member out: ten tries per network, sixty per account, IPv6 counted by /64',async()=>{
  const f=fixture();
  try{
    const created=await worker.fetch(request('/api/register',{email:'victim@test.local',username:'VictimTest',password:'correct-fixture-password'}),f.env);assert.equal(created.status,200);
    const login=(password,ip)=>worker.fetch(request('/api/login',{email:'victim@test.local',password},{'CF-Connecting-IP':ip}),f.env);
    // The attacker rotates through one /64: still a single network.
    const attack=[];for(let i=0;i<14;i++)attack.push((await login('wrong','2001:db8:aa:bb::'+(i+1).toString(16))).status);
    assert.deepEqual(attack,[...Array(10).fill(401),...Array(4).fill(429)]);
    assert.equal((await login('correct-fixture-password','203.0.113.50')).status,200,'the member still signs in from elsewhere');
    assert.equal((await login('correct-fixture-password','2001:db8:aa:cc::1')).status,200,'another /64 is another network');
    // Spread over many networks, the account itself stops at sixty.
    const statuses=[];for(let i=0;i<60;i++)statuses.push((await login('wrong','198.51.100.'+i)).status);
    assert.equal(statuses.filter(status=>status===401).length,48);assert.equal(statuses.filter(status=>status===429).length,12);
  }finally{f.sql.close();}
});
test('IPv6 addresses are reduced to their /64 network and IPv4 is kept whole',async()=>{
  const {networkOf}=await import('../src/network.js');
  assert.equal(networkOf('2a01:cb00:1234:5678:aaaa:bbbb:cccc:dddd'),'2a01:cb00:1234:5678::/64');assert.equal(networkOf('2a01:cb00:1234:5678::1'),'2a01:cb00:1234:5678::/64');
  assert.equal(networkOf('2a01:db8::1'),'2a01:db8:0:0::/64');assert.equal(networkOf('203.0.113.7'),'203.0.113.7');assert.equal(networkOf(null),null);
});
test('forged types, oversized chunks, source values, user ids and scores cannot alter progression',async()=>{
  const f=fixture(),headers={Cookie:'wc_session=qa0'};
  try{
    for(const body of [null,[],{id:'eg-02',answer:['Dieu']},{id:'eg-02',answer:{value:'Dieu'}}])assert.equal((await worker.fetch(request('/api/signes/guess',body,headers),f.env)).status,400);
    assert.equal((await worker.fetch(request('/api/signes/guess',{id:'eg-02',answer:'x'.repeat(50000)},{...headers,'Content-Length':'1'}),f.env)).status,400);
    const result=await(await worker.fetch(request('/api/signes/guess',{id:'eg-02',answer:'Dieu',user_id:9,echelon:33,solved:['eg-03-1'],attenteMs:0},headers),f.env)).json();
    assert.equal(result.state.echelon,2);assert.equal(result.state.attenteMs>0,true);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM riddle_progress WHERE user_id=9 AND riddle_id='eg-02-1'").get().n,0);
    assert.ok(!result.state.pages.some(p=>p.kind==='clock'));
    assert.doesNotMatch(JSON.stringify(result.state),/moteur|formes|expansions harmonieuses|Devincix|solution/i);
  }finally{f.sql.close();}
});
test('static documents and API responses use the same restrictive security policy',async()=>{
  const staticHeaders=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
  const res=await worker.fetch(new Request('https://test.local/api/signes'),{});
  for(const name of ['Content-Security-Policy','Permissions-Policy','X-Content-Type-Options']){
    const line=staticHeaders.split('\n').find(line=>line.trim().startsWith(name+':'));
    assert.equal(res.headers.get(name),line.trim().slice(name.length+1).trim());
  }
  assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.match(res.headers.get('Content-Security-Policy'),/script-src 'self'/);
  assert.match(res.headers.get('Content-Security-Policy'),/frame-src https:\/\/www\.youtube-nocookie\.com;/);
});
test('a database failure is a 500 with a diagnostic line, never an empty success; cron steps fail alone',async()=>{
  const f=fixture(),logged=[],original=console.error;console.error=(...args)=>logged.push(args.join(' '));
  try{
    const prepare=f.env.DB.prepare;
    f.env.DB.prepare=(sql,...rest)=>{if(sql.includes('FROM sessions s'))throw new Error('D1_ERROR: simulated outage for user 42');return prepare(sql,...rest);};
    for(const [path,method] of [['/api/account/username','PUT'],['/api/account/password','PUT'],['/api/admin/albums','POST']]){
      const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa0','Content-Type':'application/json'},...(method==='GET'?{}:{body:'{}'})}),f.env);
      assert.equal(response.status,500,path);assert.deepEqual(await response.json(),{error:'Erreur interne du serveur.'});
    }
    assert.ok(logged.some(line=>/^api_failure PUT \/api\/account\/username Error D1_ERROR: simulated outage/.test(line)),logged.join('|'));
    f.env.DB.prepare=prepare;
    const bad=await worker.fetch(new Request('https://test.local/api/songs/%E0%A4%A'),f.env);assert.equal(bad.status,404);
    // A failing cleanup step is logged and the following steps still run.
    logged.length=0;const steps=[];
    f.env.STREAM={videos:{list(){steps.push('stream');throw new Error('provider down');}},video(){throw new Error('provider down');}};
    f.env.DB.prepare=(sql,...rest)=>{if(/FROM loge_stream_uploads\s+WHERE stream_id IS NULL/.test(sql))throw new Error('stream step failed');if(sql.includes('loge_shared_series v WHERE'))steps.push('shared-posts');return prepare(sql,...rest);};
    await worker.scheduled({cron:'*/15 * * * *',scheduledTime:Date.now()},f.env);
    assert.ok(logged.some(line=>/^scheduled_failure stream Error stream step failed/.test(line)),logged.join('|'));assert.ok(steps.includes('shared-posts'),'the step after the failure still ran');
  }finally{console.error=original;f.sql.close();}
});
