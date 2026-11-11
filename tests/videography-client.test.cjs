const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../public/private-pages.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
// The background upload module runs for real, in its own scope like an ES module.
const uploads=readFileSync(require('node:path').join(__dirname,'../public/video-uploads.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const uploadExports='startVideoJob,currentVideoJob,onVideoJob,setVideoJobOpener,takePendingJobOpen,retryVideoJob,cancelVideoJob,dismissVideoJob,jobActive,jobSummary,jobCategory';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Element extends EventTarget{
  constructor(){super();this.isConnected=true;this.dataset={};this.children=[];const styles={};this.style={setProperty:(key,value)=>{styles[key]=value;},getPropertyValue:key=>styles[key]};this.value='';this.innerHTML='';this.classList={toggle(){},add(){},remove(){},contains(){return false;}};}
  insertBefore(child){this.children.unshift(child);}
  setAttribute(key,value){this[key]=value;}
  append(...items){this.children.push(...items);}
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
  const form=get('video-form');form.elements={title:{value:'Titre modifié'},video:{files:[],value:''},videoBranch:{value:'self'}};form.submit=new Element();form.reportValidity=()=>true;const header=new Element();
  const document={hidden:false,querySelector:selector=>selector==='.header-controls'?header:({}),querySelectorAll:selector=>selector==='[data-video-branch]'?branches:[],createElement:()=>new Element(),getElementById:get,addEventListener(){},removeEventListener(){}};
  const ctx={state:{user:{id:19},access:{}},app:new Element(),isCurrent:()=>true,esc:value=>String(value??''),navigate:()=>{},api:async(path,options={})=>{calls.push({path,...options});return request?request(path,options):{events:[],next:null};}};
  const sandbox=vm.createContext({document,window:{addEventListener(){},removeEventListener(){}},DOMException,AbortController,URLSearchParams,URL,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,confirm:()=>true,VIDEO_BRANCHES:[['self','Métacognition'],['ideas','Réflexions'],['projects','Idées et projets'],['version','Ma version harmonieuse'],['society','Ma société harmonieuse']],videoLabel:key=>key==='self'?'Métacognition':key,PRIVATE_HELP:{},youtubeId:url=>url?.includes('youtube')?'M7lc1UVf-VE':null,youtubeEmbed:()=>'',dateFields:()=>'',configureDate(){},readDate:()=> '2026-11-10',validateLogeFile:file=>{if(!file?.size)throw Error('Choisis une vidéo.');},probeLogeFile:async()=>{},ensureLogeUpload:upload||(async()=>{throw Error('Unexpected upload');}),createStreamPlayer:options=>{
    const video=new Element(),element=new Element();let position=0,pauses=0,destroys=0;const player={video,element,getDuration:()=>120,getCurrentTime:()=>position,seekTo:value=>position=value,pauseVideo:()=>pauses++,destroy:()=>destroys++};players.push({options,player,get pauses(){return pauses;},get destroys(){return destroys;}});options.container.append(element);return player;
  }});
  vm.runInContext(`Object.assign(globalThis,(()=>{${uploads};return {${uploadExports}};})());`,sandbox);
  vm.runInContext(source+`;globalThis.client={page,leave,videoPage,loadVideos,videoForm,videoTile,openVideoViewer,eventVideoPlayer,wireStreamPlayers,pauseVideoPlayers,destroyVideoPlayers,getSession:()=>session,setSession:value=>session=value};`,sandbox);
  const session={ctx,user:19,controller:new AbortController(),dirty:false,dialog:null};sandbox.client.setSession(session);
  // A form-only DOM keeps these tests focused on real submit and upload handlers.
  sandbox.formDialog=()=>{const dialog=new Element();dialog.close=()=>{session.dialogCleanup?.();session.dialog=null;};session.dialog=dialog;return dialog;};
  vm.runInContext(`modal=(title,html)=>{globalThis.markup=html;return formDialog();};`,sandbox);
  return {sandbox,client:sandbox.client,session,ctx,document,get,form,calls,players,branches,header,job:()=>sandbox.currentVideoJob()};
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
  assert.match(html,/data-video-branch="version"[^>]*>Ma version harmonieuse</);
  const nav=html.indexOf('</nav>'),title=html.indexOf('id="video-section-title"'),add=html.indexOf('id="video-add"'),list=html.indexOf('id="video-list"');
  assert.ok(nav>0&&nav<title&&title<add&&add<list,'categories, title, add button, then videos');
  h.client.videoForm(null,null,'version');assert.match(h.sandbox.markup,/<option value="version" selected>Ma version harmonieuse</);h.client.leave();
});

test('existing Stream and legacy videos save metadata without requesting another upload',async()=>{
  for(const creation of [{videoProvider:'stream',url:'',work:'Notes à préserver'},{url:'https://www.youtube.com/watch?v=M7lc1UVf-VE',work:'Notes à préserver'}]){
    const h=fixture();h.client.videoForm(event({creation}));
    assert.doesNotMatch(h.sandbox.markup,/name="url"|Lien YouTube/);assert.match(h.sandbox.markup,/Remplacer la vidéo \(facultatif\)/);
    h.form.onsubmit({preventDefault(){}});await tick();
    const save=h.calls.find(c=>c.method==='PUT');assert.equal(save.body.url,creation.url);assert.equal(save.body.work,creation.work);assert.equal(save.body.revision,2);assert.equal(Object.hasOwn(save.body,'uploadId'),false);
  }
});

test('editing offers the title and the category only: a file is never chosen nor sent',async()=>{
  const uploads=[];const h=fixture({upload:async draft=>{uploads.push(draft);return 'never';}});
  h.client.videoForm(event());
  assert.match(h.sandbox.markup,/<div class="video-file-field" hidden>/);assert.match(h.sandbox.markup,/<input type="file" name="video"[^>]*disabled>/);
  assert.match(h.sandbox.markup,/<label>Titre<input name="title"/);assert.match(h.sandbox.markup,/<label>Catégorie<select name="videoBranch">/);
  h.form.elements.video.files=[{name:'a.mp4',size:1000}];h.form.elements.video.onchange();h.form.onsubmit({preventDefault(){}});await tick();
  const save=h.calls.find(c=>c.method==='PUT');assert.ok(save);assert.equal(Object.hasOwn(save.body,'uploadId'),false);assert.equal(uploads.length,0);
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

test('the file picker is one tappable zone that shows the chosen file and how to change it',async()=>{
  const h=fixture();h.client.videoForm(null,null,'self');
  assert.match(h.sandbox.markup,/<label class="video-file" id="video-file-zone"><input type="file" name="video" accept="video\/\*"[^>]*required/);
  assert.match(h.sandbox.markup,/<strong id="video-file-name">Choisir une vidéo<\/strong><small id="video-file-help">200 Mo et 30 minutes maximum<\/small>/);
  assert.match(h.sandbox.markup,/id="video-file-action" hidden>Changer</);assert.doesNotMatch(h.sandbox.markup,/Loge/);
  let toggled;h.get('video-file-zone').classList={toggle:(name,on)=>{toggled=[name,on];}};
  h.form.elements.video.files=[{name:'ma-réflexion.mp4',type:'video/mp4',size:42500000}];h.form.elements.video.onchange();
  assert.equal(h.get('video-file-name').textContent,'ma-réflexion.mp4');assert.equal(h.get('video-file-help').textContent,'42,5\u00a0Mo');assert.equal(h.get('video-file-action').hidden,false);assert.deepEqual(toggled,['has-file',true]);
  h.get('video-upload-cancel').onclick();await tick();
  assert.equal(h.get('video-file-name').textContent,'Choisir une vidéo');assert.equal(h.get('video-file-help').textContent,'200 Mo et 30 minutes maximum');assert.equal(h.get('video-file-action').hidden,true);assert.deepEqual(toggled,['has-file',false]);
});

test('a video published in the Loge locks its file and warns before deletion',async()=>{
  const h=fixture(),prompts=[];h.sandbox.confirm=message=>{prompts.push(message);return false;};
  h.client.videoForm(event({loge_post_id:5}));
  assert.match(h.sandbox.markup,/<label class="video-file is-locked"[^>]*><input type="file"[^>]*disabled>/);assert.match(h.sandbox.markup,/Vidéo publiée dans les Loges virtuelles<\/strong><small id="video-file-help">Supprime sa publication dans les Loges virtuelles pour remplacer le fichier\./);
  h.get('video-delete').onclick();await tick();assert.match(prompts[0],/retirée des Loges virtuelles/);assert.equal(h.calls.some(call=>call.method==='DELETE'),false);
  const plain=fixture(),asked=[];plain.sandbox.confirm=message=>{asked.push(message);return false;};plain.client.videoForm(event());
  assert.match(plain.sandbox.markup,/Choisir une autre vidéo<\/strong><small id="video-file-help">200 Mo et 30 minutes maximum · sans nouveau fichier, la vidéo actuelle est conservée/);
  plain.get('video-delete').onclick();await tick();assert.doesNotMatch(asked[0],/Loge/);
});

const choose=(h,file={name:'réflexion.mp4',type:'video/mp4',size:1000})=>{h.form.elements.video.files=[file];h.form.elements.video.onchange();};
test('a new video is dated by the server, uploads in the background and the window can close at once',async()=>{
  let uploadOptions,release;const h=fixture({upload:(draft,options)=>{uploadOptions=options;options.onState('uploading',40);return new Promise(resolve=>release=()=>{draft.uploadId='ready-upload';resolve('ready-upload');});}});
  h.client.videoForm(null,null,'society');assert.match(h.sandbox.markup,/<option value="society" selected>/);assert.match(h.sandbox.markup,/type="file"[^>]*required/);assert.doesNotMatch(h.sandbox.markup,/YouTube|videoDate|Date/);
  choose(h);h.form.onsubmit({preventDefault(){}});await tick();
  assert.match(h.sandbox.markup,/class="video-job"/,'the window turns into the follow-up');assert.equal(h.job().phase,'uploading');assert.equal(h.job().progress,40);assert.equal(h.session.dirty,false);
  assert.equal(uploadOptions.basePath,'/api/life-tree/uploads');assert.equal(h.get('video-upload-indicator').dataset.phase,'uploading');assert.equal(h.get('video-upload-indicator').style.getPropertyValue('--ring'),'40');
  h.session.dialog.close();assert.equal(uploadOptions.signal.aborted,false,'closing the window never stops the upload');
  release();await tick();await tick();
  const save=h.calls.find(c=>c.method==='PUT');assert.equal(save.path,'/api/life-tree/events/'+save.path.split('/').pop());assert.equal(save.body.uploadId,'ready-upload');assert.equal(save.body.title,'Titre modifié');assert.equal(save.body.videoBranch,'self');
  assert.equal(Object.hasOwn(save.body,'date'),false,'the server dates a new video');assert.equal(Object.hasOwn(save.body,'precision'),false);assert.equal(save.headers['X-WC-User'],'19');
  assert.equal(h.job().phase,'done');assert.equal(h.get('video-upload-indicator').dataset.phase,'done');
});

test('editing keeps the saved date without showing a date field',async()=>{
  const h=fixture({request:async()=>({event:event()})});h.client.videoForm(event({sort_date:'2026-10-01',precision:'day'}));assert.doesNotMatch(h.sandbox.markup,/videoDate/);
  h.form.onsubmit({preventDefault(){}});await tick();const save=h.calls.find(c=>c.method==='PUT');assert.equal(save.body.date,'2026-10-01');assert.equal(save.body.precision,'day');
  const month=fixture({request:async()=>({event:event()})});month.client.videoForm(event({sort_date:'2026-09-01',precision:'month'}));month.form.onsubmit({preventDefault(){}});await tick();
  const saved=month.calls.find(c=>c.method==='PUT');assert.equal(saved.body.date,'2026-09');assert.equal(saved.body.precision,'month');
});

test('cancelling stops the upload, frees its reservation and a late success never publishes',async()=>{
  let release,signal;const h=fixture({upload:(draft,options)=>{signal=options.signal;draft.uploadId='reserved';return new Promise(resolve=>release=resolve);}});
  h.client.videoForm();choose(h);h.form.onsubmit({preventDefault(){}});await tick();
  await h.sandbox.cancelVideoJob();assert.equal(signal.aborted,true);assert.equal(h.job(),null);assert.deepEqual(h.calls.filter(c=>c.method==='DELETE').map(c=>c.path),['/api/life-tree/uploads/reserved']);
  release('late');await tick();assert.equal(h.calls.some(c=>c.method==='PUT'),false);
});

test('an account change during the upload cannot publish under the new identity',async()=>{
  let release,options;const h=fixture({upload:(_draft,config)=>{options=config;return new Promise(resolve=>release=resolve);}});
  h.client.videoForm();choose(h);h.form.onsubmit({preventDefault(){}});await tick();
  h.ctx.state.user={id:20};
  await assert.rejects(options.request('/api/life-tree/uploads',{method:'POST',body:{}}),{name:'AbortError'});assert.equal(h.job(),null,'the old account’s job is no longer shown');
  release('stale');await tick();assert.equal(h.calls.some(c=>c.method==='PUT'||c.method==='POST'),false);
  // Back on the first account, nothing stays frozen: a new video can be sent.
  h.ctx.state.user={id:19};assert.equal(h.job(),null,'the abandoned job does not come back');
});

test('cancelling during the final write never frees a reservation that may already be attached',async()=>{
  let release;const h=fixture({upload:async draft=>{draft.uploadId='ready';return 'ready';},request:async(_path,options)=>options.method==='PUT'?new Promise(resolve=>release=resolve):{}});
  h.client.videoForm();choose(h);h.form.onsubmit({preventDefault(){}});await tick();await tick();assert.equal(h.job().phase,'saving');
  await h.sandbox.cancelVideoJob();assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);release({ok:true});await tick();assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);
});

test('a reservation left by a reloaded page is released and the upload starts again by itself, once',async()=>{
  let attempts=0;const blocked=()=>Object.assign(Error('Termine ou annule ton envoi précédent.'),{status:409,data:{uploadId:'old-upload'}});
  const h=fixture({upload:async()=>{if(++attempts===1)throw blocked();return 'new-upload';}});
  h.client.videoForm();choose(h);h.form.onsubmit({preventDefault(){}});await tick();await tick();
  assert.equal(attempts,2);assert.deepEqual([h.calls[0].method,h.calls[0].path],['DELETE','/api/life-tree/uploads/old-upload']);
  assert.equal(h.calls.find(c=>c.method==='PUT').body.uploadId,'new-upload');assert.equal(h.job().phase,'done');
  // A second refusal in the same job is not looped on: the member decides.
  let again=0;const stuck=fixture({upload:async()=>{again++;throw blocked();}});
  stuck.client.videoForm();choose(stuck);stuck.form.onsubmit({preventDefault(){}});await tick();await tick();
  assert.equal(again,2);assert.equal(stuck.job().phase,'error');assert.equal(stuck.job().blockedUploadId,'old-upload');assert.equal(stuck.get('video-upload-indicator').dataset.phase,'error');
});

test('lost access stops the upload with a clear message and saves nothing',async()=>{
  for(const status of [401,403]){
    const h=fixture({upload:async(_draft,options)=>{await options.request('/api/life-tree/uploads',{method:'POST',body:{}});},request:async()=>{throw Object.assign(Error('Accès refusé'),{status});}});
    h.client.videoForm();choose(h);h.form.onsubmit({preventDefault(){}});await tick();
    assert.equal(h.job().phase,'error');assert.equal(h.job().error,'Reconnecte-toi pour terminer l’envoi.');assert.equal(h.calls.some(c=>c.method==='PUT'),false);
  }
});

test('Ajouter reopens the follow-up while a video is on its way, and one upload runs at a time',async()=>{
  const h=fixture({upload:()=>new Promise(()=>{})});await h.client.page('/videographie',h.ctx);
  h.client.videoForm();choose(h);h.form.onsubmit({preventDefault(){}});await tick();h.session.dialog?.close?.();
  h.sandbox.markup='';h.get('video-add').onclick();await tick();assert.match(h.sandbox.markup,/class="video-job"/);
  assert.throws(()=>h.sandbox.startVideoJob({api:h.ctx.api,state:h.ctx.state,navigate(){},eventId:'other',body:{title:'Autre'},file:{name:'b.mp4',size:1}}),/déjà en cours/);h.client.leave();
});

test('the videography shows covers in a grid and opens one video at a time in a viewer',async()=>{
  const events=[{id:'evt-a',title:'Première',video_branch:'self',sort_date:'2026-11-09',precision:'day',revision:1,creation:{videoProvider:'stream',url:''},loge_post_id:4},{id:'evt-b',title:'Seconde',video_branch:'self',sort_date:'2026-11-08',precision:'day',revision:1,creation:{videoProvider:'stream',url:''}}];
  const h=fixture({request:async path=>path.startsWith('/api/life-tree?')?{events,next:null}:{consented:true,notice:{}}});await h.client.page('/videographie',h.ctx);
  const grid=h.get('video-list').innerHTML;
  assert.match(grid,/data-video-open="0"/);assert.match(grid,/data-video-open="1"/);
  assert.match(grid,/data-poster="evt-a"/);assert.match(grid,/Dans les loges/);assert.doesNotMatch(grid,/data-stream-event/,'no player is created until a video is opened');
  assert.equal(h.get('video-section-count').textContent,'2 vidéos');
  h.client.openVideoViewer(1);const viewer=h.sandbox.markup;
  assert.match(viewer,/data-stream-event="evt-b"/);assert.match(viewer,/2 \/ 2/);assert.match(viewer,/id="video-viewer-next"[^>]*disabled/);assert.doesNotMatch(viewer,/id="video-viewer-prev"[^>]*disabled/);assert.match(viewer,/Modifier/);
  h.client.openVideoViewer(0);assert.match(h.sandbox.markup,/id="video-viewer-prev"[^>]*disabled/);assert.match(h.sandbox.markup,/Dans les loges/);h.client.leave();
});

