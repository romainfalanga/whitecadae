import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareDeployment,resolveCommitSha,validateCommitSha} from '../scripts/prepare-deployment.mjs';
import {verifyDeployment} from '../scripts/verify-deployment.mjs';

const sha='0123456789abcdef0123456789abcdef01234567';
const previousSha='abcdef0123456789abcdef0123456789abcdef01';
const info={commitSha:sha,builtAt:'2026-10-19T11:00:00.000Z'};
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json; charset=utf-8'}});
const options={expectedSha:sha,assets:[],timeoutMs:100,requestTimeoutMs:30,retryDelayMs:1};

test('deployment preparation validates CI provenance and writes the precise commit with a timestamp',async()=>{
  const root=await mkdtemp(join(tmpdir(),'whitecadae-deploy-'));
  try{
    const result=await prepareDeployment({root,env:{WORKERS_CI_COMMIT_SHA:sha.toUpperCase()},now:new Date(info.builtAt)});
    assert.deepEqual(result,info);
    assert.deepEqual(JSON.parse(await readFile(join(root,'public','deploy-info.json'),'utf8')),info);
    for(const invalid of ['',sha.slice(0,7),`${sha}\n`,'z'.repeat(40)]){
      assert.throws(()=>resolveCommitSha({root,env:{WORKERS_CI_COMMIT_SHA:invalid}}),/40 hexadecimal/);
    }
    assert.equal(validateCommitSha(sha.toUpperCase()),sha);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('verification waits for its exact commit and cache-busts each marker request before checking APIs',async()=>{
  const calls=[];
  let markers=0;
  const result=await verifyDeployment({...options,timeoutMs:1000,fetchImpl:async(url,init)=>{
    calls.push({url,init});
    if(url.pathname==='/deploy-info.json')return response({...info,commitSha:++markers===1?previousSha:sha});
    return response(url.pathname==='/api/me'?{user:null}:{albums:[]});
  }});
  assert.equal(result.commitSha,sha);
  assert.equal(result.attempts,2);
  assert.deepEqual(calls.map(call=>call.url.pathname),['/deploy-info.json','/deploy-info.json','/api/me','/api/albums']);
  assert.notEqual(calls[0].url.search,calls[1].url.search);
  assert.ok(calls.every(({url,init})=>url.origin==='https://whitecadae.fr'&&url.searchParams.has('__deploy_check')&&init.cache==='no-store'&&init.redirect==='error'));
  assert.ok(calls.every(({init})=>init.headers['User-Agent'].startsWith('Mozilla/5.0')&&init.headers.Accept==='application/json'));
});

test('a missing marker or an older commit can never become a successful deployment',async()=>{
  for(const marker of [()=>new Response('<html>SPA fallback</html>',{headers:{'Content-Type':'text/html'}}),()=>response({...info,commitSha:previousSha})]){
    const calls=[];
    await assert.rejects(verifyDeployment({...options,timeoutMs:25,fetchImpl:async url=>{
      calls.push(url.pathname);return marker();
    }}),/verification failed/);
    assert.ok(calls.length>0);
    assert.ok(calls.every(path=>path==='/deploy-info.json'));
  }
});

test('a matching marker does not hide failed or malformed API responses',async()=>{
  for(const api of [()=>new Response('database unavailable',{status:503}),()=>new Response('<html>fallback</html>',{headers:{'Content-Type':'text/html'}}),()=>new Response('{broken',{headers:{'Content-Type':'application/json'}})]){
    await assert.rejects(verifyDeployment({...options,timeoutMs:25,fetchImpl:async url=>{
      if(url.pathname==='/deploy-info.json')return response(info);
      return url.pathname==='/api/me'?response({user:null}):api();
    }}),/verification failed/);
  }
});

test('asset comparison accepts CRLF normalization and refuses a partially published revision',async()=>{
  const root=await mkdtemp(join(tmpdir(),'whitecadae-assets-'));
  const contents={'index.html':'<html>Current</html>\r\n','app.js':'const version=2;\r\n','sw.js':'const CACHE="current";\r\n'};
  await mkdir(join(root,'public'));
  await Promise.all(Object.entries(contents).map(([file,text])=>writeFile(join(root,'public',file),text)));
  let stale=false;
  const fetchImpl=async url=>{
    if(url.pathname==='/deploy-info.json')return response(info);
    if(url.pathname.startsWith('/api/'))return response({ok:true});
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    return new Response(stale&&file==='app.js'?'const version=1;\n':contents[file].replace(/\r\n/g,'\n'));
  };
  try{
    const result=await verifyDeployment({...options,root,assets:undefined,fetchImpl,timeoutMs:1000});
    assert.equal(result.checked.length,6);
    stale=true;
    await assert.rejects(verifyDeployment({...options,root,assets:undefined,fetchImpl,timeoutMs:25}),/app\.js: deployed content differs/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('hanging requests are aborted and cannot exceed the verification deadline',async()=>{
  const started=Date.now();
  const signals=[];
  await assert.rejects(verifyDeployment({...options,timeoutMs:35,requestTimeoutMs:10,fetchImpl:async(url,{signal})=>{
    signals.push(signal);return new Promise(()=>{});
  }}),/request timed out/);
  assert.ok(signals.length>0);
  assert.ok(signals.every(signal=>signal.aborted));
  assert.ok(Date.now()-started<1000);
});
