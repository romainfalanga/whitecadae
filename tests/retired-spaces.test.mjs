import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {BrainstormLive} from '../src/brainstorm-live.js';
test('all community routes are closed for every method before any database or media access',async()=>{
  const env=new Proxy({},{get(){throw Error('Retired resources must stay untouched');}});
  for(const path of ['conversation','conversation/rooms/1','community','community/rooms/1','community/brainstorms/1/live','videographies','videographies/1','vg-media/1','vg-comments/1','arbres','branches/1/vocal','videographie/rythme','vocal/transcription','voix'])for(const method of ['GET','POST','PUT','PATCH','DELETE']){
    const res=await worker.fetch(new Request('https://test.local/api/'+path,{method,headers:{Cookie:'wc_session=admin'}}),env);
    assert.equal(res.status,410,method+' '+path);assert.match(res.headers.get('Cache-Control'),/no-store/);
  }
});
test('retired realtime connections close without deleting stored data',async()=>{
  let closed=0;const room=new BrainstormLive({getWebSockets:()=>[{close(){closed++;}}]});
  assert.equal(closed,1);assert.equal((await room.fetch()).status,410);
});
test('the three-link menu and header have no profile or account control',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const nav=js.slice(js.indexOf('function renderNav()'),js.indexOf('/* ---',js.indexOf('function renderNav()')));
  for(const old of ['chat.js','community.js','vocal.js','videographie.js','cooperation.css'])assert.ok(!html.includes(old));
  assert.doesNotMatch(nav,/Mon profil|Conversation|Tous les projets/);
  assert.doesNotMatch(html,/account-access|nav-settings/);
  assert.doesNotMatch(js,/account-access|pageProfile|openSettings|Mon profil/);
  assert.match(nav,/>Musiques</);assert.match(nav,/>Échelons</);
});

test('the removed profile API does not expose member information',async()=>{
  const env=new Proxy({},{get(){throw Error('Profile data must stay untouched');}});
  const res=await worker.fetch(new Request('https://test.local/api/users/member'),env);
  assert.equal(res.status,410);
  assert.match(res.headers.get('Cache-Control'),/no-store/);
});
