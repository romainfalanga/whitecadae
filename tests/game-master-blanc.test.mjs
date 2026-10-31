import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';
import {NODES} from '../src/echelon.js';
import {page,leave} from '../public/private-pages.js';

const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const navSource=source.slice(source.indexOf('function renderNav()'),source.indexOf('/* ---',source.indexOf('function renderNav()')));
const request=(f,path,token='qa0',extra={})=>worker.fetch(new Request('https://test.local'+path,{...extra,headers:{Cookie:'wc_session='+token,...extra.headers}}),f.env);
const add=(f,user,keys)=>{for(const key of keys)f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(user,key,'now');};
function navigation(session){
  const nav={querySelectorAll:()=>[]};
  runInNewContext(navSource+'\nrenderNav()',{nav,document:{getElementById:()=>null},state:session,location:{pathname:'/'}});
  return nav.innerHTML;
}

test('the final page requires 33 real earned levels, including for admins; forged parameters disclose no content',async()=>{
  const f=fixture();try{
    assert.equal(ids.length,32);
    for(const token of ['invalid','qa99','qa7']){
      const res=await request(f,'/api/game-master-blanc?level=33&admin=true',token);
      assert.equal(res.status,token==='invalid'?401:403);
      assert.match(res.headers.get('cache-control'),/no-store/);
      assert.doesNotMatch(await res.text(),/Extériorise|Loge sociale|discord|y83ewhS49/);
    }
    add(f,1,ids.slice(0,-1));
    assert.equal((await request(f,'/api/game-master-blanc')).status,403);
    const below=await(await request(f,'/api/me')).json();
    assert.equal(below.gameEchelon,32);assert.equal(below.access.gameMasterBlanc,false);
    assert.doesNotMatch(navigation(below),/href="\/game-master-blanc"/);
    add(f,1,ids.slice(-1));
    const res=await request(f,'/api/game-master-blanc');assert.equal(res.status,200);
    const content=await res.json();assert.equal(content.page.title,'Game Master Blanc');
    assert.deepEqual(content.page.sections.map(s=>s.title),['Vidéographie','Ta version harmonieuse','Ta société harmonieuse','Ta version harmonieuse IA','Ta société harmonieuse IA','Loge sociale']);
    assert.ok(content.page.sections.every(s=>s.paragraphs.length&&s.paragraphs.every(p=>typeof p==='string'&&p.length>20)));
    const ready=await(await request(f,'/api/me')).json();
    assert.equal(ready.access.gameMasterBlanc,true);assert.equal(ready.access.gameMaster,true);
    assert.match(navigation(ready),/href="\/game-master-blanc"/);
    assert.equal((await request(f,'/api/game-master-blanc','qa0',{headers:{'X-WC-User':'100'}})).status,409);
    assert.equal((await request(f,'/api/game-master-blanc','qa0',{method:'POST'})).status,405);
    // A historical account keeps canonical signs and gains the same final access.
    add(f,3,[...ids,'eg-20-1','eg-20-1.p0','eg-02-2','eg-03-3']);
    assert.equal((await request(f,'/api/game-master-blanc','qa2')).status,200);
    f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=1 AND riddle_id=?').run(ids.at(-1));
    assert.equal((await request(f,'/api/game-master-blanc')).status,403);
    assert.equal((await(await request(f,'/api/me')).json()).access.gameMasterBlanc,false);
    const seven=await(await request(f,'/api/me','qa7')).json();
    assert.equal(seven.access.gameMaster,true);assert.equal(seven.access.gameMasterBlanc,false);
    assert.match(navigation(seven),/game-master-orange/);assert.doesNotMatch(navigation(seven),/game-master-blanc/);
  }finally{f.sql.close();}
});

test('the private page uses the final API and renders no final text on refusal or anonymous entry',async()=>{
  const f=fixture(),previous={document:globalThis.document,window:globalThis.window};
  const app={innerHTML:'',style:{}},calls=[];
  globalThis.document={querySelector:()=>({}),title:'',addEventListener(){},removeEventListener(){}};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  const ctx={app,state:{user:{id:1}},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),isCurrent:()=>true,accountEntryMarkup:()=>'<a href="/connexion">Se connecter</a>',navigate(){throw Error('Unexpected redirect')},api:async path=>{
    calls.push(path);const response=await request(f,path);const result=await response.json();
    if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result;
  }};
  try{
    await page('/game-master-blanc',ctx);
    assert.match(app.innerHTML,/Game Master Blanc/);assert.doesNotMatch(app.innerHTML,/Extériorise|gm-section|discord/);
    add(f,1,ids);await page('/game-master-blanc',ctx);
    assert.equal(document.title,'Game Master Blanc · White Cadae');
    assert.match(app.innerHTML,/gm-layout gm-white/);assert.match(app.innerHTML,/gm-letter/);
    assert.equal((app.innerHTML.match(/class="gm-section"/g)||[]).length,6);
    assert.match(app.innerHTML,/Rejoindre les Game Masters/);assert.doesNotMatch(app.innerHTML,/href="\/videographie|[→↗]/);
    assert.ok(calls.every(path=>path==='/api/game-master-blanc'));
    await page('/game-master-blanc',{...ctx,state:{user:null}});
    assert.match(app.innerHTML,/Se connecter/);assert.doesNotMatch(app.innerHTML,/gm-section|Extériorise|discord/);
  }finally{
    leave();f.sql.close();
    for(const key of ['document','window'])if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];
  }
});

test('final continuation opens the internal page without a new tab, and its copy stays out of the browser bundle',()=>{
  const helper=source.slice(source.indexOf('function continuationMarkup('),source.indexOf('function accountEntryMarkup('));
  const html=runInNewContext(helper+'\ncontinuationMarkup({level:33,label:"Game Master Blanc",href:"/game-master-blanc"})',{esc:s=>String(s)});
  assert.match(html,/href="\/game-master-blanc" data-link/);assert.doesNotMatch(html,/target=|nouvel onglet|[→↗]/);
  const client=readFileSync(new URL('../public/private-pages.js',import.meta.url),'utf8');
  assert.doesNotMatch(client,/Extériorise tes réflexions|Loge sociale|y83ewhS49/);
});
