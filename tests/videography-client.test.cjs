const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../public/private-pages.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Element extends EventTarget{
  constructor(){super();this.isConnected=true;this.dataset={};this.children=[];this.style={};this.value='';this.innerHTML='';this.classList={toggle(){}};}
  append(...items){this.children.push(...items);}
  setAttribute(key,value){this[key]=value;}
  querySelectorAll(){return [];}
  querySelector(){return this.submit;}
  contains(node){return this.children.includes(node);}
  replaceChildren(){this.children=[];this.innerHTML='';}
  insertAdjacentHTML(_where,html){this.innerHTML+=html;}
  remove(){this.isConnected=false;}
}
function fixture({upload,request}={}){
  const nodes=new Map(),calls=[],players=[],branches=['self','ideas','projects','version','society'].map(key=>Object.assign(new Element(),{dataset:{videoBranch:key}}));
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const form=get('video-form');form.elements={title:{value:'Titre modifié'},video:{files:[],value:''},videoBranch:{value:'self'}};form.submit=new Element();
  const document={hidden:false,querySelector:()=>({}),querySelectorAll:selector=>selector==='[data-video-branch]'?branches:[],createElement:()=>new Element(),getElementById:get,addEventListener(){},removeEventListener(){}};
  const ctx={state:{user:{id:19},access:{}},app:new Element(),isCurrent:()=>true,esc:value=>String(value??''),navigate:()=>{},api:async(path,options={})=>{calls.push({path,...options});return request?request(path,options):{events:[],next:null};}};
  const sandbox=vm.createContext({document,window:{addEventListener(){},removeEventListener(){}},DOMException,AbortController,URLSearchParams,URL,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,confirm:()=>true,VIDEO_BRANCHES:[['self','Métacognition'],['ideas','Réflexions'],['projects','Idées et projets'],['version','Ta version Harmonieuse'],['society','Ta société Harmonieuse']],videoLabel:key=>key==='self'?'Métacognition':key,PRIVATE_HELP:{},youtubeId:url=>url?.includes('youtube')?'M7lc1UVf-VE':null,youtubeEmbed:()=>'',dateFields:()=>'',configureDate(){},readDate:()=> '2026-11-10',validateLogeFile:file=>{if(!file?.size)throw Error('Choisis une vidéo.');},ensureLogeUpload:upload||(async()=>{throw Error('Unexpected upload');}),createStreamPlayer:options=>{
    const video=new Element(),element=new Element();let position=0,pauses=0,destroys=0;const player={video,element,getDuration:()=>120,getCurrentTime:()=>position,seekTo:value=>position=value,pauseVideo:()=>pauses++,destroy:()=>destroys++};players.push({options,player,get pauses(){return pauses;},get destroys(){return destroys;}});options.container.append(element);return player;
  }});
  vm.runInContext(source+`;globalThis.client={page,leave,videoPage,loadVideos,videoForm,eventVideoPlayer,wireStreamPlayers,pauseVideoPlayers,destroyVideoPlayers,getSession:()=>session,setSession:value=>session=value};`,sandbox);
  const session={ctx,user:19,controller:new AbortController(),dirty:false,dialog:null};sandbox.client.setSession(session);
  // A form-only DOM keeps these tests focused on real submit and upload handlers.
  sandbox.formDialog=()=>{const dialog=new Element();dialog.close=()=>{session.dialogCleanup?.();session.dialog=null;};session.dialog=dialog;return dialog;};
  vm.runInContext(`modal=(title,html)=>{globalThis.markup=html;return formDialog();};`,sandbox);
  return {sandbox,client:sandbox.client,session,ctx,document,get,form,calls,players,branches};
}
const event=(extra={})=>({id:'existing',title:'Ancien titre',video_branch:'self',revision:2,sort_date:'2026-10-01',precision:'day',creation:{videoProvider:'stream',url:'',work:'Notes à préserver'},...extra});

test('the initial Videography fetch is filtered to Métacognition and there is no All tab',async()=>{
  const h=fixture();await h.client.page('/videographie',h.ctx);
  assert.deepEqual(h.calls.map(c=>c.path),['/api/private/consent','/api/life-tree?videos=1&branch=self']);
  assert.match(h.ctx.app.innerHTML,/data-video-branch="self" aria-pressed="true"/);assert.doesNotMatch(h.ctx.app.innerHTML,/Toutes|data-video-branch=""/);
  assert.equal(h.client.getSession().videos.branch,'self');h.client.leave();
});

test('Videography lists five categories and places Add under the current category title',async()=>{
  const h=fixture();await h.client.page('/videographie',h.ctx);const html=h.ctx.app.innerHTML;
  assert.deepEqual([...html.matchAll(/data-video-branch="(\w+)"/g)].map(m=>m[1]),['self','ideas','projects','version','society']);
  assert.match(html,/data-video-branch="version"[^>]*>Ta version Harmonieuse</);
  const nav=html.indexOf('</nav>'),title=html.indexOf('id="video-section-title"'),add=html.indexOf('id="video-add"'),list=html.indexOf('id="video-list"');
  assert.ok(nav>0&&nav<title&&title<add&&add<list,'categories, title, add button, then videos');
  h.client.videoForm(null,null,'version');assert.match(h.sandbox.markup,/<option value="version" selected>Ta version Harmonieuse</);h.client.leave();
});

test('existing Stream and legacy videos save metadata without requesting another upload',async()=>{
  for(const creation of [{videoProvider:'stream',url:'',work:'Notes à préserver'},{url:'https://www.youtube.com/watch?v=M7lc1UVf-VE',work:'Notes à préserver'}]){
    const h=fixture();h.client.videoForm(event({creation}));
    assert.doesNotMatch(h.sandbox.markup,/name="url"|Lien YouTube/);assert.match(h.sandbox.markup,/Remplacer la vidéo \(facultatif\)/);
    h.form.onsubmit({preventDefault(){}});await tick();
    const save=h.calls.find(c=>c.method==='PUT');assert.equal(save.body.url,creation.url);assert.equal(save.body.work,creation.work);assert.equal(save.body.revision,2);assert.equal(Object.hasOwn(save.body,'uploadId'),false);
  }
});

test('new files use the Videography upload endpoint and publish the ready upload id',async()=>{
  let uploadOptions;const h=fixture({upload:async(draft,options)=>{uploadOptions=options;h.form.elements.title.value='Titre pendant l’envoi';options.onState('uploading',40);assert.equal(h.get('video-upload-progress').value,40);return 'ready-upload';}});
  h.client.videoForm(null,null,'society');assert.match(h.sandbox.markup,/<option value="society" selected>/);assert.match(h.sandbox.markup,/type="file"[^>]*required/);assert.doesNotMatch(h.sandbox.markup,/YouTube/);
  h.form.elements.video.files=[{name:'réflexion.mp4',type:'video/mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();
  const save=h.calls.find(c=>c.method==='PUT');assert.equal(uploadOptions.basePath,'/api/life-tree/uploads');assert.equal(save.body.uploadId,'ready-upload');assert.equal(save.body.title,'Titre pendant l’envoi');assert.equal(save.body.url,'');assert.equal(save.headers['X-WC-User'],'19');
});

test('a failed save retries the same ready upload and leaves the editor open',async()=>{
  const drafts=[];let writes=0;const h=fixture({upload:async draft=>{draft.uploadId='ready-upload';drafts.push(draft);return draft.uploadId;},request:async(_path,options)=>{if(options.method==='PUT'&&++writes===1)throw Error('Connexion interrompue');return {};}});
  h.client.videoForm(event());h.form.elements.video.files=[{name:'a.mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();assert.ok(h.session.dialog);assert.equal(h.form.submit.textContent,'Réessayer');
  h.form.onsubmit({preventDefault(){}});await tick();assert.equal(writes,2);assert.equal(drafts[0],drafts[1]);assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);
});

test('closing during preparation aborts the upload and a late success never publishes',async()=>{
  let release,signal;const h=fixture({upload:(_draft,options)=>{signal=options.signal;return new Promise(resolve=>release=resolve);}});
  h.client.videoForm();h.form.elements.video.files=[{name:'a.mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();h.session.dialog.close();assert.equal(signal.aborted,true);release('stale-upload');await tick();assert.equal(h.calls.some(c=>c.method==='PUT'),false);
});

test('Stream controls seek, pause peers and survive additional cards until their scope is destroyed',async()=>{
  const h=fixture(),first=Object.assign(new Element(),{dataset:{streamEvent:'one',streamOwner:'19',streamTitle:'One'}}),second=Object.assign(new Element(),{dataset:{streamEvent:'two',streamOwner:'20',streamTitle:'Two'}}),root=new Element();let cards=[first];root.querySelectorAll=()=>cards;root.contains=node=>cards.includes(node);
  h.client.wireStreamPlayers(root);h.client.wireStreamPlayers(root);assert.equal(h.players.length,1);
  cards.push(second);h.client.wireStreamPlayers(root);assert.equal(h.players.length,2);
  await h.players[0].options.getPlayback('one');await h.players[1].options.getPlayback('two');assert.deepEqual(h.calls.map(c=>c.path),['/api/life-tree/events/one/playback','/api/life-tree/events/two/playback?owner=20']);
  const controls=h.players[0].player.element.children[0],seek=controls.children[0];seek.value='30';seek.oninput();assert.equal(h.players[0].player.getCurrentTime(),30);assert.equal(controls.children[1].textContent,'0:30 / 2:00');
  h.players[0].options.onState(1);assert.equal(h.players[0].pauses,0);assert.equal(h.players[1].pauses,1);
  h.document.hidden=true;assert.equal(h.players[0].options.isEligible(),false);h.client.pauseVideoPlayers();assert.equal(h.players[0].pauses,1);
  h.client.destroyVideoPlayers(root);assert.equal(h.players[0].destroys,1);assert.equal(h.players[1].destroys,1);assert.equal(h.session.videoPlayers.size,0);
});

test('navigation or account replacement during upload cannot publish under a new identity',async()=>{
  let release,options;const h=fixture({upload:(_draft,config)=>{options=config;return new Promise(resolve=>release=resolve);}});
  h.client.videoForm();h.form.elements.video.files=[{name:'a.mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();
  h.ctx.state.user={id:20};h.ctx.isCurrent=()=>false;
  await options.request('/api/life-tree/uploads',{method:'POST',body:{}});assert.equal(h.calls.at(-1).headers['X-WC-User'],'19');
  release('stale');await tick();assert.equal(h.calls.some(c=>c.method==='PUT'),false);h.session.dialogCleanup();
});

test('closing during final publication waits for its result before cancelling a reservation',async()=>{
  let release;const h=fixture({upload:async draft=>{draft.uploadId='ready';return 'ready';},request:async(_path,options)=>options.method==='PUT'?new Promise(resolve=>release=resolve):{}});
  h.client.videoForm();h.form.elements.video.files=[{name:'a.mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();
  h.session.dialog.close();assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);release({ok:true});await tick();assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);
});

test('an outstanding upload can be explicitly cancelled before retrying in the same scope',async()=>{
  let attempts=0;const h=fixture({upload:async()=>{if(++attempts===1)throw Object.assign(Error('Envoi précédent'),{status:409,data:{uploadId:'old-upload'}});return 'new-upload';}});
  h.client.videoForm();h.form.elements.video.files=[{name:'a.mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();assert.equal(h.get('video-upload-restart').hidden,false);
  h.get('video-upload-restart').onclick();await tick();assert.equal(attempts,2);assert.equal(h.calls[0].path,'/api/life-tree/uploads/old-upload');assert.equal(h.calls[0].method,'DELETE');assert.equal(h.calls.find(c=>c.method==='PUT').body.uploadId,'new-upload');
});

test('upload access loss clears private content and prevents saving under another account',async()=>{
  for(const status of [401,403,409]){
    const h=fixture({upload:async(_draft,options)=>{await options.request('/api/life-tree/uploads',{method:'POST',body:{}});},request:async()=>{throw Object.assign(Error(status===409?'Le compte connecté a changé. Recharge la page.':'Accès refusé'),{status});}});
    h.ctx.app.innerHTML='Données privées';h.client.videoForm();h.form.elements.video.files=[{name:'a.mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();
    assert.equal(h.client.getSession(),null);assert.doesNotMatch(h.ctx.app.innerHTML,/Données privées/);assert.match(h.ctx.app.innerHTML,/Vérifier mon compte/);assert.equal(h.calls.some(c=>c.method==='PUT'),false);
  }
});
