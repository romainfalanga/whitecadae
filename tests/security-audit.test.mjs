import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';

const request=(path,body,headers={},method='POST')=>new Request('https://test.local'+path,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('foreign origins and non-JSON writes fail before database access',async()=>{
  const env={get DB(){throw Error('Must be rejected before database access');}};
  for(const path of ['/api/signes/guess','/api/echelon/guess','/api/57/guess','/api/account/username','/api/register','/api/login']){
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
test('parallel login attempts stop at twenty before further password checks',async()=>{
  const f=fixture();
  try{
    const responses=await Promise.all(Array.from({length:25},()=>worker.fetch(request('/api/login',{email:'nobody@example.test',password:'nope'},{'CF-Connecting-IP':'192.0.2.3'}),f.env)));
    assert.equal(responses.filter(r=>r.status===401).length,20);assert.equal(responses.filter(r=>r.status===429).length,5);
    assert.equal(f.sql.prepare("SELECT compte FROM auth_attempts WHERE cle='connexion:192.0.2.3'").get().compte,20);
  }finally{f.sql.close();}
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
  assert.match(res.headers.get('Content-Security-Policy'),/frame-src 'none'/);
});
