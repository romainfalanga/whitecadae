import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';
import {NODES} from '../src/echelon.js';

const ids=NODES.flatMap(node=>node.answers.map(answer=>answer.id));
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const navSource=source.slice(source.indexOf('function renderNav()'),source.indexOf('/* ---',source.indexOf('function renderNav()')));
const destination=source.slice(source.indexOf('function accountDestination()'),source.indexOf('\nfunction pageLogin()'));
const routeSource=source.slice(source.indexOf('async function route()'),source.indexOf('\nfunction renderNav()'));
function menu(state){
  const nav={querySelectorAll:()=>[]};
  runInNewContext(navSource+'\nrenderNav()',{nav,state,document:{getElementById:()=>null},location:{pathname:'/loge-virtuelle'}});
  return nav.innerHTML;
}

test('Loge joins Game Master Blanc only at 33 real levels and existing accounts gain access immediately',async()=>{
  const f=fixture();
  const call=(path,token='qa0')=>worker.fetch(new Request('https://test.local'+path,{headers:{Cookie:'wc_session='+token}}),f.env);
  try{
    for(const id of ids.slice(0,-1))f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(1,id,'now');
    const before=await(await call('/api/me')).json();
    assert.equal(before.gameEchelon,32);assert.equal(before.access.loge,false);
    assert.doesNotMatch(menu(before),/href="\/loge-virtuelle"/);
    assert.equal((await call('/api/loge')).status,403);
    assert.equal((await call('/api/loge','qa99')).status,403,'admin access is earned too');
    assert.equal((await call('/api/loge','invalid')).status,401);
    f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(1,ids.at(-1),'now');
    const after=await(await call('/api/me')).json();
    assert.equal(after.access.loge,true);assert.equal(after.access.gameMasterBlanc,true);
    assert.match(menu(after),/href="\/loge-virtuelle"/);assert.match(menu(after),/href="\/game-master-blanc"/);
    assert.equal((await call('/api/loge')).status,200);
    const text=await(await call('/api/game-master-blanc')).json();
    assert.deepEqual(text.page.sections.at(-1),{title:'Loge virtuelle',paragraphs:[
      'Partage dans la Loge virtuelle tes réflexions et tes avancées aux autres Game Masters Blancs.',
      'Commente leurs vidéos pour leur apporter ton regard et des pistes d’amélioration. Aidez-vous mutuellement à faire grandir vos harmonies.'
    ]});
    f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=1 AND riddle_id=?').run(ids.at(-1));
    assert.equal((await call('/api/loge')).status,403);
    assert.equal((await(await call('/api/me')).json()).access.loge,false);
  }finally{f.sql.close();}
});

test('Loge write routes reject cross-site or non-JSON traffic before accessing any account or database',async()=>{
  const env={get DB(){throw Error('Must reject before DB');}};
  for(const path of ['/api/loge/posts','/api/loge/posts/1','/api/loge/posts/1/comments','/api/loge/comments/1']){
    for(const headers of [{Origin:'https://hostile.local'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}]){
      const response=await worker.fetch(new Request('https://test.local'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'}),env);
      assert.equal(response.status,403,path);
    }
    assert.equal((await worker.fetch(new Request('https://test.local'+path,{method:'PUT',headers:{'Content-Type':'text/plain'},body:'{}'}),env)).status,415,path);
  }
});

test('login returns preserve Loge posts, profiles and focused comments without accepting arbitrary destinations',()=>{
  const valid=['/loge-virtuelle','/loge-virtuelle/publications/1','/loge-virtuelle/publications/45?comment=128','/loge-virtuelle/membres/3?onglet=interventions','/loge-virtuelle/membres/3?onglet=reflexions'];
  const invalid=['//hostile.local/loge-virtuelle','https://hostile.local/loge-virtuelle','/loge-virtuelle?retour=https://hostile.local','/loge-virtuelle/membres/0','/loge-virtuelle/membres/3?onglet=secrets','/loge-virtuelle/publications/1?comment=not-a-number'];
  for(const value of [...valid,...invalid]){
    const result=runInNewContext(destination+'\naccountDestination()',{URLSearchParams,location:{search:'?retour='+encodeURIComponent(value)}});
    assert.equal(result,valid.includes(value)?value:'/',value);
  }
});

test('internal Loge navigation retains its session and scroll instead of resetting the SPA route',async()=>{
  const calls=[];
  const context={location:{pathname:'/loge-virtuelle/membres/11',search:'?onglet=interventions',hash:''},
    window:{WCLoge:{canNavigate:path=>{calls.push(['check',path]);return true;},navigate:async path=>calls.push(['navigate',path]),leave(){throw Error('Should retain the Loge session');}},scrollTo(){throw Error('Should retain scroll');}},
    closeNav:()=>calls.push('close-menu'),renderNav:()=>calls.push('nav')};
  await runInNewContext(routeSource+'\nroute()',context);
  assert.deepEqual(calls,[['check','/loge-virtuelle/membres/11?onglet=interventions'],'close-menu','nav',['navigate','/loge-virtuelle/membres/11?onglet=interventions']]);
});
