const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');

const clone=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const catalogue=[
  {slug:'orange',title:'Orange',album:'57',duration:159},
  {slug:'13h20',title:'13h20',album:'57',duration:144},
  {slug:'un-fil-entre-deux-infinis',title:'Un fil entre deux infinis',album:'18 juillet 2019',duration:198}
];
function playlist(id,name,tracks,revision=1){
  return {id,name,tracks,revision,playback:tracks.length?{src:'/api/playlists/audio?tracks='+tracks.join(',')}:null};
}
function fixture(initial=[]){
  // Only HTML controls used by this page are modelled. Tests exercise bound UI
  // events and API/player boundaries rather than calling private page functions.
  const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  class Element {
    constructor(tag,attributes){
      this.tag=tag;this.attributes=attributes;this.dataset={};
      for(const [name,value]of Object.entries(attributes))if(name.startsWith('data-'))this.dataset[name.slice(5)]=value;
      this.value=attributes.value||'';this.disabled=Object.hasOwn(attributes,'disabled');this.textContent='';this.innerHTML='';
    }
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    focus(){}blur(){}
    querySelector(selector){if(selector==='svg')return {outerHTML:''};return null;}
  }
  let elements=[],html='',epoch=0,rows=clone(initial),nextId=Math.max(0,...initial.map(p=>p.id))+1;
  let nextError=null,held=false,pending=null;
  const nodes=new Map(),requests=[],playerCalls=[],window=new EventTarget();
  const app={
    get innerHTML(){return html;},
    set innerHTML(value){
      html=value;elements=[];nodes.clear();
      for(const match of value.matchAll(/<(button|input|select|form|p)\b([^>]*)>/g)){
        const attrs={};for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[attr[1]]=decode(attr[2]||'');
        const element=new Element(match[1],attrs);elements.push(element);if(attrs.id)nodes.set(attrs.id,element);
      }
    },
    querySelectorAll(selector){
      if(selector==='button,input,select')return elements.filter(el=>['button','input','select'].includes(el.tag));
      const attr=/^\[([\w-]+)\]$/.exec(selector)?.[1];return attr?elements.filter(el=>Object.hasOwn(el.attributes,attr)):[];
    }
  };
  let playback={playlistId:null,playlistSource:null,slug:null,playing:false};
  const player={
    snapshot:()=>({...playback}),
    playPlaylist(p,index){playerCalls.push(['play',clone(p),index]);playback={playlistId:p.id,playlistSource:p.playback.src,slug:p.tracks[index],playing:true};window.dispatchEvent(new Event('wc:music'));return true;},
    toggle(){playerCalls.push(['toggle']);playback.playing=!playback.playing;window.dispatchEvent(new Event('wc:music'));},
    updatePlaylistMetadata(p){playerCalls.push(['metadata',clone(p)]);},
    clearPlaylist(id){playerCalls.push(['clear',id]);if(playback.playlistId===id)playback={playlistId:null,playlistSource:null,slug:null,playing:false};}
  };
  async function api(url,options={}){
    requests.push({url,method:options.method||'GET',body:options.body&&clone(options.body),headers:options.headers,signal:options.signal});
    if(held){held=false;await new Promise(resolve=>pending=resolve);}
    if(nextError){const error=nextError;nextError=null;throw error;}
    const method=options.method||'GET';
    if(method==='GET')return {playlists:clone(rows),tracks:clone(catalogue)};
    if(method==='POST'){const p=playlist(nextId++,options.body.name.trim(),[...options.body.tracks]);rows.unshift(p);return {playlist:clone(p)};}
    const id=Number(url.split('/').at(-1)),index=rows.findIndex(p=>p.id===id);
    if(method==='DELETE'){rows.splice(index,1);return {ok:true};}
    const body=options.body;rows[index]=playlist(id,body.name.trim(),[...body.tracks],body.revision+1);return {playlist:clone(rows[index])};
  }
  const state={user:{id:11}},context=vm.createContext({window,app,state,document:{getElementById:id=>nodes.get(id)||null,title:''},api,WCPlayer:player,
    esc:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    WCIcon:name=>`<svg data-icon="${name}"></svg>`,mmss:seconds=>String(seconds),AbortController,
    newEpoch:()=>++epoch,stale:token=>token!==epoch,accountEntryMarkup:()=>'<a>Se connecter</a>',confirm:()=>f.confirm
  });
  vm.runInContext(readFileSync(path.join(__dirname,'../public/playlists.js'),'utf8'),context);
  const f={app,state,player,window,requests,playerCalls,confirm:true,ui:window.WCPlaylists,
    node(id){const node=nodes.get(id);assert(node,'Missing control '+id);return node;},
    click(id){const node=this.node(id);assert(!node.disabled,'Disabled control '+id);node.onclick();},
    submit(id){this.node(id).onsubmit({preventDefault(){}});},
    input(id,value){const node=this.node(id);node.value=value;node.oninput?.({target:node});},
    select(id,value){const node=this.node(id);node.value=value;node.onchange?.({target:node});},
    add(slug){this.select('pl-track',slug);this.click('pl-add');},
    control(attr,value,direction){return app.querySelectorAll('['+attr+']').find(el=>el.attributes[attr]===String(value)&&(direction===undefined||el.dataset.direction===String(direction)));},
    clickControl(attr,value,direction){const node=this.control(attr,value,direction);assert(node);assert(!node.disabled);node.onclick();},
    fail(error=new Error('Connexion interrompue')){nextError=error;},
    hold(){held=true;},release(){assert(pending);const resolve=pending;pending=null;resolve();},
    get rows(){return clone(rows);},get playback(){return {...playback};}
  };
  return f;
}

test('create, mix albums, reorder and save a playlist before synchronous playback and pause/resume',async()=>{
  const f=fixture();await f.ui.page();
  assert(f.app.innerHTML.includes('<h1>Playlist</h1>'));assert.equal(f.node('pl-new-name').value,'');
  f.input('pl-new-name','  Ma playlist  ');f.submit('pl-create');await flush();
  assert.equal(f.rows[0].name,'Ma playlist');assert.equal(f.node('pl-name').value,'Ma playlist');
  f.add('orange');f.add('un-fil-entre-deux-infinis');f.add('13h20');
  assert.equal(f.control('data-move',0,-1).disabled,true);
  f.clickControl('data-move',1,-1);f.submit('pl-editor');await flush();
  assert.deepEqual(f.rows[0].tracks,['un-fil-entre-deux-infinis','orange','13h20']);
  const save=f.requests.find(request=>request.method==='PUT');assert.equal(save.body.revision,1);
  assert.equal(save.headers['X-WC-User'],'11');assert(save.signal instanceof AbortSignal);
  assert.equal(f.playerCalls.at(-1)[0],'metadata');
  const before=f.playerCalls.length;f.click('pl-listen');
  assert.equal(f.playerCalls.length,before+1,'play occurs inside the click stack');
  assert.equal(f.playerCalls.at(-1)[0],'play');assert.equal(f.playback.slug,'un-fil-entre-deux-infinis');
  f.click('pl-listen');assert.equal(f.playback.playing,false);f.click('pl-listen');assert.equal(f.playback.playing,true);
  f.clickControl('data-play',1);assert.equal(f.playback.slug,'orange');
  f.clickControl('data-play',1);assert.equal(f.playback.playing,false);
  assert.equal(f.control('data-play',1).getAttribute('aria-pressed'),'false');
});

test('cancel discards name, order and removal edits, and adding a new playlist can be cancelled',async()=>{
  const original=playlist(4,'Initiale',['orange','13h20']);const f=fixture([original]);await f.ui.page();
  f.click('pl-edit');f.input('pl-name','Brouillon');f.clickControl('data-move',1,-1);f.clickControl('data-remove',0);f.click('pl-cancel');
  assert.deepEqual(f.rows,[original]);assert(f.app.innerHTML.includes('Initiale'));assert(!f.app.innerHTML.includes('Brouillon'));
  f.click('pl-new');f.input('pl-new-name','Autre');f.click('pl-create-cancel');
  assert.equal(f.requests.length,1);assert(!f.app.innerHTML.includes('id="pl-create"'));assert(f.app.innerHTML.includes('Initiale'));
});

test('failed saves preserve draft and revision, disable duplicate submissions, and can be retried',async()=>{
  const f=fixture([playlist(4,'Initiale',['orange','13h20'])]);await f.ui.page();
  f.click('pl-edit');f.input('pl-name','Après');f.clickControl('data-move',1,-1);
  f.hold();f.fail();f.submit('pl-editor');assert.equal(f.node('pl-name').disabled,true);
  f.submit('pl-editor');assert.equal(f.requests.filter(r=>r.method==='PUT').length,1);
  f.release();await flush();assert.equal(f.node('pl-name').value,'Après');assert.equal(f.node('pl-name').disabled,false);
  assert.equal(f.node('pl-status').textContent,'Connexion interrompue');assert.equal(f.rows[0].revision,1);
  f.submit('pl-editor');await flush();assert.equal(f.rows[0].name,'Après');assert.deepEqual(f.rows[0].tracks,['13h20','orange']);
  assert.equal(f.rows[0].revision,2);
});

test('a failed creation retains its entered name for a retry',async()=>{
  const f=fixture();await f.ui.page();f.input('pl-new-name','Mon nouvel ordre');f.fail(new Error('Limite atteinte'));
  f.submit('pl-create');await flush();
  assert.equal(f.node('pl-new-name').value,'Mon nouvel ordre');assert.equal(f.node('pl-status').textContent,'Limite atteinte');
  assert.equal(f.rows.length,0);f.submit('pl-create');await flush();
  assert.equal(f.rows[0].name,'Mon nouvel ordre');assert.equal(f.node('pl-name').value,'Mon nouvel ordre');
});

test('renaming the current playlist updates player metadata and editing its order starts the new source',async()=>{
  const f=fixture([playlist(4,'Initiale',['orange','13h20'])]);await f.ui.page();f.click('pl-listen');
  f.click('pl-edit');f.input('pl-name','Renommée');f.submit('pl-editor');await flush();
  assert.equal(f.playerCalls.at(-1)[0],'metadata');assert.equal(f.playerCalls.at(-1)[1].name,'Renommée');
  f.click('pl-listen');assert.equal(f.playerCalls.at(-1)[0],'toggle');
  f.click('pl-edit');f.clickControl('data-move',1,-1);f.submit('pl-editor');await flush();
  f.click('pl-listen');assert.equal(f.playerCalls.at(-1)[0],'play');assert.equal(f.playback.slug,'13h20');
});

test('deleting a selected playlist stops that queue and selects the next one, then returns to creation when empty',async()=>{
  const f=fixture([playlist(4,'Première',['orange']),playlist(8,'Deuxième',['13h20'])]);await f.ui.page();f.click('pl-listen');f.click('pl-edit');
  f.confirm=false;f.click('pl-delete');assert.equal(f.rows.length,2);
  f.confirm=true;f.click('pl-delete');await flush();assert.equal(f.rows.length,1);assert.equal(f.playback.playlistId,null);
  assert.deepEqual(f.playerCalls.at(-1),['clear',4]);assert(f.app.innerHTML.includes('Deuxième'));
  f.click('pl-edit');f.click('pl-delete');await flush();assert.equal(f.rows.length,0);assert(f.node('pl-new-name'));
});

test('pending responses cannot replace another SPA page or a new account context',async()=>{
  const f=fixture([playlist(4,'Compte A',['orange'])]);await f.ui.page();
  f.click('pl-edit');f.input('pl-name','Tardif');f.hold();f.submit('pl-editor');const request=f.requests.at(-1);
  f.ui.leave();f.app.innerHTML='Autre page';assert.equal(request.signal.aborted,true);
  f.release();await flush();assert.equal(f.app.innerHTML,'Autre page');assert.equal(f.playerCalls.length,0);
  f.hold();const opening=f.ui.page();const loading=f.requests.at(-1);
  f.ui.clear();f.state.user={id:12};f.app.innerHTML='Compte B';assert.equal(loading.signal.aborted,true);
  f.release();await opening;assert.equal(f.app.innerHTML,'Compte B');
});
