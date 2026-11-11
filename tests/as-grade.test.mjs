import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fixture} from './community-fixture.mjs';
import worker from '../src/index.js';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const navSource=source.slice(source.indexOf('function renderNav()'),source.indexOf('/* ---',source.indexOf('function renderNav()')));
const client=readFileSync(new URL('../public/private-pages.js',import.meta.url),'utf8');
const request=(f,path,token,extra={})=>worker.fetch(new Request('https://test.local'+path,{...extra,headers:{Cookie:'wc_session='+token,...extra.headers}}),f.env);

test('the AS grade page is served only from the real échelon 20, administrators included',async()=>{
  const f=fixture();try{
    for(const [token,status] of [['invalid',401],['qa19',403],['qa99',403],['qa20',200],['qa25',200]]){
      const res=await request(f,'/api/as?level=33&admin=true',token);assert.equal(res.status,status,token);assert.match(res.headers.get('cache-control'),/no-store/);
      const body=await res.text();
      if(status===200){const {page}=JSON.parse(body);assert.equal(page.title,'AS');assert.deepEqual(page.opening,[]);assert.deepEqual(page.sections.map(s=>s.title),['Être un AS','Dans les deux sens','Ton Carré d’AS']);const text=JSON.stringify(page);assert.match(text,/point de vue dont tu penses qu’elle a besoin/);assert.match(text,/Aide-la à mieux se comprendre et à avancer vers le chemin qu’elle a choisi\./);assert.doesNotMatch(text,/Tirez-vous|Choisir ses AS|l’autre et chacun découvre la vidéographie de l’autre/);assert.match(text,/tu découvres sa vidéographie et elle découvre la tienne/);}
      else assert.doesNotMatch(body,/point de vue|Carré d’AS/);
    }
    assert.equal((await request(f,'/api/as','qa20',{method:'POST'})).status,405);
    const me=await(await request(f,'/api/me','qa20')).json();assert.equal(me.access.as,true);assert.equal(me.access.aceSquare,true);
    assert.equal((await(await request(f,'/api/me','qa19')).json()).access.as,false);
  }finally{f.sql.close();}
});

test('the Carré d’AS closes the menu; the AS page is reached from the « i » beside its title, not from the menu',()=>{
  const nav={querySelectorAll:()=>[]};
  runInNewContext(navSource+'\nrenderNav()',{nav,document:{getElementById:()=>null},state:{user:{id:1},access:{horloge:true,gameMaster:true,gameMasterBlanc:true,videographie:true,loge:true,as:true,aceSquare:true}},location:{pathname:'/'}});
  const links=[...nav.innerHTML.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(links.slice(-3),['/videographie','/loge-virtuelle','/carre-d-as']);assert.ok(!links.includes('/as'));
  const square=client.slice(client.indexOf('async function circlePage()'),client.indexOf('async function squareView('));
  assert.match(square,/<h1>Carré d’<a class="square-as-link" href="\/as" data-link title="Le rôle d’un AS">AS<\/a><\/h1>/);assert.doesNotMatch(client,/square-info|square-count|\/ 4 AS/);
});

test('the square and its invitation window carry no explanation; the AS page holds it in the Game Master frame',()=>{
  const square=client.slice(client.indexOf('async function circlePage()'),client.indexOf('async function squareView('));
  const directory=client.slice(client.indexOf('async function directoryView()'),client.indexOf('async function reportsPage()'));
  assert.doesNotMatch(square,/réciproque|square-lead/);assert.doesNotMatch(directory,/Si elle accepte|l’un de l’autre/);
  assert.match(client,/<div class="gm-layout gm-as">.*class="gm-letter"/);
});

test('an open menu that scrolls starts at its first entry',()=>{
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.match(css.slice(css.lastIndexOf('body.nav-open .site-nav{justify-content:')),/^body\.nav-open \.site-nav\{justify-content:flex-start\}/);
});
