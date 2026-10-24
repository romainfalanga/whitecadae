import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {page} from '../public/private-pages.js';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const destinations=['/mecanisme','/mecanisme/1','/mecanisme/10','/mecanisme/comprendre','/videographie','/videographie/archives','/videographie/comprendre','/carre-d-as','/carre-d-as/fil/123','/carre-d-as/comprendre','/matiere','/arbre-de-vie'];
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

test('login return URLs reject retired pages and preserve the active game destinations',()=>{
  for(const path of [...destinations,'/signes','/signes/horloge','/echelon','/game-master-orange']){
    const result=runInNewContext(destinationSource+'\naccountDestination()',{URLSearchParams,location:{search:'?retour='+encodeURIComponent(path)}});
    assert.equal(result,destinations.includes(path)?'/':path,path);
  }
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
