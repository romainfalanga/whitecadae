import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {page} from '../public/private-pages.js';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const destinations=['/mecanisme','/mecanisme/1','/mecanisme/10','/mecanisme/comprendre','/carre-d-as','/carre-d-as/fil/123','/carre-d-as/comprendre','/matiere','/arbre-de-vie'];
const routeSource=source.slice(source.indexOf('async function route()'),source.indexOf('\nfunction renderNav()'));
const destinationSource=source.slice(source.indexOf('function accountDestination()'),source.indexOf('\nfunction pageLogin()'));
const navSource=source.slice(source.indexOf('function renderNav()'),source.indexOf('/* ---',source.indexOf('function renderNav()')));

test('old personal URLs and nested pages return home before loading a module or asking to log in',async()=>{
  for(const path of destinations){
    const calls=[];
    const context={window:{scrollTo(){}},document:{body:{classList:{remove(){}}}},location:{pathname:path,hash:'#old'},closeNav(){},coupePageTimer(){},newEpoch(){},renderNav(){},navigate:(...args)=>calls.push(args)};
    await runInNewContext(routeSource+'\nroute()',context);
    assert.deepEqual(calls,[['/',true]],path);
    const direct=[];
    await page(path,{navigate:(...args)=>direct.push(args)});
    assert.deepEqual(direct,[['/',true]],path);
  }
});

test('the removed videography explanation returns to the videography without an info button',async()=>{
  const calls=[],context={window:{scrollTo(){}},document:{body:{classList:{remove(){}}}},location:{pathname:'/videographie/comprendre',hash:''},closeNav(){},coupePageTimer(){},newEpoch(){},renderNav(){},navigate:(...args)=>calls.push(args)};
  await runInNewContext(routeSource+'\nroute()',context);assert.deepEqual(calls,[['/videographie',true]]);
  const direct=[];await page('/videographie/comprendre',{navigate:(...args)=>direct.push(args)});assert.deepEqual(direct,[['/videographie',true]]);
  const client=readFileSync(new URL('../public/private-pages.js',import.meta.url),'utf8'),help=readFileSync(new URL('../public/private-help.js',import.meta.url),'utf8');
  assert.doesNotMatch(client,/heading\('Vidéographie'[^)]*videographie/);assert.doesNotMatch(help,/videographie|métacognition/i);
});

test('login return URLs reject retired pages and preserve the active game destinations',()=>{
  for(const path of [...destinations,'/signes','/signes/horloge','/echelon','/game-master-orange','/game-master-blanc','/loge-virtuelle/publier','/videographie','/videographie/archives','/videographie/comprendre','/playlist']){
    const result=runInNewContext(destinationSource+'\naccountDestination()',{URLSearchParams,location:{search:'?retour='+encodeURIComponent(path)}});
    assert.equal(result,destinations.includes(path)||path==='/playlist'?'/':path==='/videographie/comprendre'?'/videographie':path,path);
  }
});

test('Playlist stays absent despite stale access flags and private queues stay disabled across accounts',async()=>{
  for(const playlist of [false,true]){
    const nav={querySelectorAll:()=>[]};
    runInNewContext(navSource+'\nrenderNav()',{nav,document:{getElementById:()=>null},state:{user:{id:1},access:{playlist}},location:{pathname:'/'}});
    assert.equal(nav.innerHTML.includes('href="/playlist"'),false);
  }
  const refresh=source.slice(source.indexOf('async function refreshSession('),source.indexOf('\nfunction accountDestination()'));
  const calls=[],state={};
  const context={state,observedAccount:1,window:{WCPlaylists:{clear:()=>calls.push('clear')}},accountChannel:{postMessage:()=>calls.push('broadcast')},WCPlayer:{setPlaylistAccess:value=>calls.push(value),setAlbums:()=>calls.push('albums')},api:async path=>path==='/api/me'?{user:{id:2},access:{playlist:true}}:{albums:[]}};
  await runInNewContext(refresh+'\nrefreshSession()',context);
  assert.deepEqual(calls,[false,'clear','broadcast',false,'albums']);
  calls.length=0;
  await runInNewContext(refresh+'\nrefreshSession()',context);
  assert.deepEqual(calls,[false,'albums']);
});

test('menu ignores former page access flags even with a stale signed-in session',()=>{
  for(const user of [null,{id:1,is_admin:true}]){
    const nav={querySelectorAll:()=>[]};
    runInNewContext(navSource+'\nrenderNav()',{nav,document:{getElementById:()=>null},state:{user,gameEchelon:33,access:{horloge:true,gameMaster:true,mechanisms:true,lifeTree:true,aceSquare:true}},location:{pathname:'/'}});
    assert.doesNotMatch(nav.innerHTML,/mecanisme|videographie|carre-d-as|Mécanismes|Vidéographie|Carré d/);
    if(user)assert.match(nav.innerHTML,/game-master-orange/);
    assert.match(nav.innerHTML,/href="\/musique"/);
  }
});

test('restored videography menu follows authenticated canonical access, independent of old lifeTree flags',()=>{
 for(const user of [null,{id:1}])for(const videographie of [false,true]){
  const nav={querySelectorAll:()=>[]};
  runInNewContext(navSource+'\nrenderNav()',{nav,document:{getElementById:()=>null},state:{user,access:{videographie,lifeTree:true}},location:{pathname:'/videographie'}});
  assert.equal(nav.innerHTML.includes('href="/videographie"'),!!user&&videographie);
  assert.doesNotMatch(nav.innerHTML,/href="\/(mecanisme|carre-d-as)/);
 }
});
