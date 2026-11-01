const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');

const copy=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const self={id:11,username:'Alice',avatar:null};
const post=(id=7,author=self)=>({id,author,title:'Une réflexion',description:'Un chemin possible.',youtubeUrl:'https://youtu.be/dQw4w9WgXcQ',revision:1,commentCount:0,isFavorite:false,createdAt:'2026-11-01T12:00:00Z'});
const comment=(id=8,author=self)=>({id,postId:7,author,body:'Une réponse',revision:1,createdAt:'2026-11-01T12:00:00Z'});
const error=(status,message,data={})=>Object.assign(new Error(message),{status,data});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

function fixture({posts=[post()],comments=[],user=self,search='',observeUI=false}={}){
  // A small tree of ordinary HTML elements: enough for real form handlers,
  // dynamically inserted cards and frame removal; no layout/browser simulation.
  let document,focused=null;
  class Element extends EventTarget{
    constructor(tag='div',attrs={}){
      super();this.tag=tag;this.attrs=attrs;this.children=[];this.parent=null;this.dataset={};this.disabled=Object.hasOwn(attrs,'disabled');this.hidden=Object.hasOwn(attrs,'hidden');this.value=attrs.value||'';
      for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
      const styles=new Map();this.style={setProperty:(key,value)=>{styles.set(key,value);this.attrs.style=[...styles].map(([name,value])=>name+':'+value+';').join('');},getPropertyValue:key=>styles.get(key)||'',removeProperty:key=>{styles.delete(key);this.attrs.style=[...styles].map(([name,value])=>name+':'+value+';').join('');}};this.scrollTop=0;
      this.classList={add:name=>this.attrs.class=(this.attrs.class||'')+' '+name,remove:name=>this.attrs.class=(this.attrs.class||'').split(/\s+/).filter(item=>item!==name).join(' '),toggle:(name,on)=>{const set=new Set((this.attrs.class||'').split(/\s+/));if(on)set.add(name);else set.delete(name);this.attrs.class=[...set].join(' ');},contains:name=>(this.attrs.class||'').split(/\s+/).includes(name)};
    }
    get isConnected(){return this===document||!!this.parent?.isConnected;}
    append(child){if(child.parent)child.remove();child.parent=this;this.children.push(child);}
    insertBefore(child,before){if(child===before)return;if(child.parent)child.remove();child.parent=this;const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,child);}
    replaceChildren(...children){for(const child of this.children)if(typeof child!=='string')child.parent=null;this.children=[];for(const child of children)this.append(child);}
    get className(){return this.attrs.class||'';}
    set className(value){this.attrs.class=value;}
    get innerHTML(){return this.children.map(child=>typeof child==='string'?child:child.outerHTML).join('');}
    set innerHTML(html){for(const child of this.children)if(typeof child!=='string')child.parent=null;this.children=[];parse(html,this);}
    get outerHTML(){return `<${this.tag}${Object.entries(this.attrs).map(([key,value])=>` ${key}="${escape(value)}"`).join('')}>${this.innerHTML}</${this.tag}>`;}
    set outerHTML(html){const root=new Element();parse(html,root);this.replaceWith(root.children);}
    replaceWith(children){if(!this.parent)return;const parent=this.parent,index=parent.children.indexOf(this);parent.children.splice(index,1,...children);for(const child of children)if(typeof child!=='string')child.parent=parent;this.parent=null;}
    get textContent(){return this.children.map(child=>typeof child==='string'?decode(child):child.textContent).join('');}
    set textContent(value){this.innerHTML=escape(value);}
    setAttribute(key,value){this.attrs[key]=String(value);}
    getAttribute(key){return this.attrs[key]??null;}
    removeAttribute(key){delete this.attrs[key];}
    remove(){this.replaceWith([]);}
    insertAdjacentHTML(where,html){if(where==='afterbegin'){const root=new Element();parse(html,root);this.children.unshift(...root.children);for(const child of root.children)if(typeof child!=='string')child.parent=this;return;}if(where==='beforeend'){parse(html,this);return;}assert.equal(where,'beforebegin');const root=new Element();parse(html,root);const parent=this.parent,index=parent.children.indexOf(this);parent.children.splice(index,0,...root.children);for(const child of root.children)if(typeof child!=='string')child.parent=parent;}
    matches(selector){
      if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));
      const match=/^(\w+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(selector);
      return !!match&&(!match[1]||this.tag===match[1])&&(!match[2]||Object.hasOwn(this.attrs,match[2])&&(match[3]===undefined||this.attrs[match[2]]===match[3]));
    }
    querySelectorAll(selector){const selectors=selector.split(',').map(s=>s.trim()),result=[];for(const child of this.children)if(typeof child!=='string'){if(selectors.some(s=>child.matches(s)))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
    get elements(){return {namedItem:name=>this.querySelectorAll('input,textarea,button').find(el=>el.attrs.name===name)||null};}
    reportValidity(){return true;}
    focus(){focused=this;}
    scrollIntoView(){this.scrolled=true;}
  }
  function parse(html,root){
    const stack=[root];for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){
      if(token.startsWith('</')){stack.pop();continue;}
      if(token.startsWith('<')){const match=/^<([\w-]+)([\s\S]*?)\/?\s*>$/.exec(token);if(!match)continue;const attrs={};for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[attr[1]]=decode(attr[2]||'');const node=new Element(match[1],attrs);stack.at(-1).append(node);if(!['input','img','link','br','hr','path'].includes(node.tag)&&!token.endsWith('/>'))stack.push(node);}
      else stack.at(-1).children.push(token);
    }
    for(const textarea of root.querySelectorAll('textarea'))textarea.value=textarea.textContent;
  }
  document=new Element('document');document.head=new Element('head');document.append(document.head);document.body=new Element('body');document.append(document.body);const app=new Element('main');document.body.append(app);
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  document.getElementById=id=>document.querySelectorAll('[id]').find(node=>node.attrs.id===id)||null;document.createElement=tag=>new Element(tag);
  const window=new EventTarget(),requests=[],queued=[],timers=new Map(),navigations=[],music=[],controllers=[],scrolls=[];let timerId=0,current=true;
  window.WCPlayer={pause:()=>music.push('pause')};window.scrollY=0;window.innerHeight=900;window.innerWidth=1200;window.scrollTo=(x,y)=>{window.scrollY=y;scrolls.push(y);};
  const location={pathname:'/loge-virtuelle',search,hash:'',origin:'https://whitecadae.fr'};const state={user:user&&{...user},access:{loge:true},gameEchelon:33};
  let savedPosts=copy(posts),savedComments=copy(comments);
  function normal(url,options){
    const method=options.method||'GET';
    if(url==='/api/loge')return {self,posts:savedPosts,next:null,nextPublicationAt:null};
    if(url.startsWith('/api/loge/membres/')){const target=new URL(url,'https://whitecadae.fr'),id=Number(target.pathname.split('/').at(-1));return {self,member:id===self.id?self:{id,username:'Bob'},posts:target.searchParams.get('tab')==='favoris'?savedPosts.filter(post=>post.isFavorite):savedPosts.filter(post=>post.author.id===id),interventions:[],next:null};}
    if(url.endsWith('/favorite')){const id=Number(url.split('/').at(-2)),item=savedPosts.find(post=>post.id===id);item.isFavorite=options.body.favorite;return {postId:id,isFavorite:item.isFavorite};}
    if(url.match(/\/comments(?:\?|$)/)){
      if(method==='POST'){const item={...comment(18),body:options.body.body};savedComments.push(item);return {comment:item};}
      return {comments:savedComments,next:null};
    }
    if(url.startsWith('/api/loge/comments/')){
      const id=Number(url.split('/').at(-1)),index=savedComments.findIndex(c=>c.id===id);
      if(method==='DELETE'){savedComments.splice(index,1);return {ok:true};}
      savedComments[index]={...savedComments[index],body:options.body.body,revision:options.body.revision+1};return {comment:savedComments[index]};
    }
    if(url==='/api/loge/posts'){
      const item={...post(20),title:options.body.title,youtubeUrl:options.body.url};savedPosts.unshift(item);
      return {post:item,nextPublicationAt:new Date(Date.now()+604800000).toISOString()};
    }
    const id=Number(url.split('/').at(-1)),index=savedPosts.findIndex(p=>p.id===id);
    if(method==='DELETE'){savedPosts.splice(index,1);return {ok:true};}
    if(method==='PUT')savedPosts[index]={...savedPosts[index],...options.body,revision:options.body.revision+1};
    return {self,post:savedPosts[index],nextPublicationAt:null};
  }
  async function api(url,options={}){requests.push({url,...options,body:options.body&&copy(options.body)});const answer=queued.length?queued.shift():()=>normal(url,options);const result=typeof answer==='function'?await answer(url,options):await answer;if(result instanceof Error)throw result;return copy(result);}
  const ctx={app,api,esc:escape,state,navigate:(...args)=>{navigations.push(args);const url=new URL(args[0],location.origin);location.pathname=url.pathname;location.search=url.search;location.hash=url.hash;},isCurrent:()=>current};
  const observers={resize:[],menu:[]};
  const observerType=kind=>class{constructor(callback){this.callback=callback;this.closed=false;observers[kind].push(this);}observe(target){this.target=target;}disconnect(){this.closed=true;}emit(){if(!this.closed)this.callback([]);}};
  const sandbox=vm.createContext({window,document,location,URL,URLSearchParams,AbortController,DOMException,crypto:webcrypto,console,
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),confirm:()=>f.confirm,...(observeUI?{ResizeObserver:observerType('resize'),MutationObserver:observerType('menu')}:{})});
  const youtube=readFileSync(path.join(__dirname,'../public/youtube-video.js'),'utf8').replace(/export /g,'');
  const source=readFileSync(path.join(__dirname,'../public/loge.js'),'utf8').replace(/^import .*\n/gm,'').replace(/export /g,'');
  sandbox.createLogeVideoFeed=options=>{const items=new Map(),controller={options,items,destroyed:false,paused:false,add:(post,container)=>items.set(String(post.id),{post,container}),remove:id=>items.delete(String(id)),refresh(){},pause(){this.paused=true;},resume(){this.paused=false;},destroy(){this.destroyed=true;for(const item of items.values())item.container.querySelector('iframe')?.remove();items.clear();}};controllers.push(controller);return controller;};
  vm.runInContext(youtube+'\n'+source+'\nwindow.client={page,leave,clear,navigate,canNavigate};',sandbox);
  const f={app,document,window,state,location,ctx,requests,navigations,music,timers,controllers,scrolls,observers,confirm:true,client:window.client,
    async page(path='/loge-virtuelle',query=search){location.pathname=path;location.search=query;await this.client.page(path,ctx);},
    async navigate(destination){const target=new URL(destination,location.origin);location.pathname=target.pathname;location.search=target.search;location.hash=target.hash;await this.client.navigate(destination);},
    node(id){const node=document.getElementById(id);assert(node,'Missing element '+id);return node;},
    find(selector,root=app){const node=root.querySelector(selector);assert(node,'Missing selector '+selector);return node;},
    click(node){if(typeof node==='string')node=this.node(node);assert(!node.disabled,'Disabled control');node.dispatchEvent(new Event('click'));node.onclick?.();},
    submit(form){if(typeof form==='string')form=this.node(form);form.onsubmit({preventDefault(){}});},
    fill(form,name,value,{input=true}={}){const field=form.elements.namedItem(name);assert(field,'Missing field '+name);field.value=value;if(input)field.dispatchEvent(new Event('input'));},
    queue(value){queued.push(value);},
    defer(){let resolve;const promise=new Promise(r=>resolve=r);queued.push(promise);return resolve;},
    stopCurrent(){current=false;},get focused(){return focused;}
  };
  return f;
}

test('feed delegates videos to the shared controller and exposes no extra player or publication-management controls',async()=>{
  const item={...post(),title:'<script>bad()</script>',description:'<img src=x onerror=bad()>',author:{id:12,username:'<b>Bob</b>',avatar:'https://evil.test/avatar'}};
  const f=fixture({posts:[item]});await f.page();
  assert.match(f.app.innerHTML,/&lt;script&gt;bad/);assert.doesNotMatch(f.app.innerHTML,/img src=x|onerror=bad/);assert.equal(f.app.querySelector('script'),null);
  assert.equal(f.requests[0].headers['X-WC-User'],'11');assert(f.requests[0].signal instanceof AbortSignal);
  assert.equal(f.app.querySelector('[data-post-edit]'),null);assert.equal(f.find('a[href="/loge-virtuelle/membres/12"]').textContent.includes('<b>Bob</b>'),true);
  const controller=f.controllers.at(-1);assert.equal(controller.items.size,1);assert.equal(controller.options.root,f.node('loge-feed'));assert.equal(controller.options.isCurrent(),true);
  assert.equal(f.app.querySelector('[data-video-open]'),null);assert.doesNotMatch(f.app.textContent,/Fermer le lecteur|ouvre-la sur YouTube|Voir la vidéo/);
  f.click(f.find('[data-comments-open]'));await flush();assert(f.node('loge-comments-list'));assert.equal(controller.paused,true);
  f.click(f.find('[data-discussion-close]'));assert.equal(controller.paused,false);
  f.client.clear();assert.equal(controller.destroyed,true);assert.equal(controller.options.isCurrent(),false);
});

test('publication reads the title and YouTube URL, retains an idempotent draft on errors and applies the weekly quota',async()=>{
  const f=fixture({posts:[]});await f.page();f.click('loge-open-compose');const form=f.node('loge-new-form');
  f.fill(form,'title','  Ma réflexion  ',{input:false});f.fill(form,'url','https://youtu.be/dQw4w9WgXcQ',{input:false});
  f.queue(error(503,'Réessaie'));f.submit(form);await flush();const first=f.requests.at(-1);
  assert.equal(first.body.title,'Ma réflexion');assert.equal(Object.hasOwn(first.body,'description'),false);assert.equal(form.elements.namedItem('description'),null);assert.equal(first.body.url,'https://youtu.be/dQw4w9WgXcQ');assert.match(first.body.requestId,/^[\da-f-]{36}$/i);
  assert.equal(form.elements.namedItem('title').value,'  Ma réflexion  ');assert.equal(f.node('loge-new-status').textContent,'Réessaie');
  f.submit(form);await flush();assert.equal(f.requests.at(-1).body.requestId,first.body.requestId);assert(f.node('loge-post-20'));assert.equal(f.node('loge-compose').hidden,true);
  assert.equal(f.node('loge-open-compose').disabled,false);f.click('loge-open-compose');assert.equal(f.node('loge-new-submit').disabled,true);assert.match(f.node('loge-quota').textContent,/Tu pourras publier/);assert.equal(f.timers.size,1);
  f.client.clear();assert.equal(f.timers.size,0);
});

test('invalid YouTube URLs and quota refusals preserve the composer without sending duplicate publications',async()=>{
  const f=fixture({posts:[]});await f.page();f.click('loge-open-compose');const form=f.node('loge-new-form');
  for(const [name,value]of Object.entries({title:'Titre',url:'https://evil.test/video'}))f.fill(form,name,value);
  const baseline=f.requests.length;f.submit(form);assert.equal(f.requests.length,baseline);assert.match(f.node('loge-new-status').textContent,/YouTube valide/);
  f.fill(form,'url','https://youtu.be/dQw4w9WgXcQ');const release=f.defer();f.submit(form);f.submit(form);assert.equal(f.requests.length,baseline+1);assert.equal(f.node('loge-new-submit').disabled,true);
  release(error(429,'Une seule réflexion par semaine',{nextPublicationAt:new Date(Date.now()+60000).toISOString(),serverNow:new Date().toISOString()}));await flush();
  assert.equal(form.elements.namedItem('title').value,'Titre');assert.equal(f.node('loge-new-submit').disabled,true);assert.equal(f.node('loge-open-compose').disabled,false);
  f.client.clear();
});

test('comments create, edit and delete through their bound forms and keep focused deep links',async()=>{
  const f=fixture({comments:[comment()]});await f.page('/loge-virtuelle/publications/7','?comment=8');
  assert.match(f.requests[1].url,/comments\?focus=8$/);assert.equal(f.focused,f.node('loge-comment-8'));assert.equal(f.node('loge-comment-8').classList.contains('is-focused'),true);
  const compose=f.find('form',f.node('loge-comment-compose'));f.fill(compose,'body','  Une autre piste  ',{input:false});f.submit(compose);await flush();
  assert.equal(f.requests.at(-1).body.body,'Une autre piste');assert(f.node('loge-comment-18'));assert.equal(compose.elements.namedItem('body').value,'');
  f.click(f.find('[data-comment-edit="18"]'));const edit=f.find('form',f.node('loge-comment-editor-18'));f.fill(edit,'body','Piste corrigée',{input:false});f.submit(edit);await flush();
  assert.equal(f.requests.at(-1).body.revision,1);assert.equal(f.node('loge-comment-body-18').textContent,'Piste corrigée');
  f.click(f.find('[data-comment-delete="18"]'));await flush();assert.equal(f.document.getElementById('loge-comment-18'),null);assert.equal(f.requests.at(-1).body.revision,2);
  f.client.clear();
});

test('a deleted focused comment falls back to the existing discussion instead of leaving an empty thread',async()=>{
  const f=fixture({comments:[comment()]});
  f.queue({self,post:post(),nextPublicationAt:null});
  f.queue(error(404,'Commentaire introuvable.'));
  f.queue({comments:[comment()],next:null});
  await f.page('/loge-virtuelle/publications/7','?comment=99');
  assert.match(f.requests[1].url,/comments\?focus=99$/);
  assert.equal(f.requests[2].url,'/api/loge/posts/7/comments');
  assert.equal(f.node('loge-comment-body-8').textContent,'Une réponse');
  assert.match(f.node('loge-comments-status').textContent,/Les autres échanges sont affichés/);
  f.client.clear();
});

test('profile interventions link to the precise exchange and exclude interventions on the member’s own post',async()=>{
  const f=fixture();f.queue({self,member:self,interventions:[{...comment(),post:{id:7,title:'Chez Bob',author:{id:12,username:'Bob'}}},{...comment(9),post:{id:10,title:'Chez moi',author:self}}],next:null});
  await f.page('/loge-virtuelle/membres/11','?onglet=interventions');
  assert.equal(f.requests[0].url,'/api/loge/membres/11?tab=interventions');assert(f.find('a[href="/loge-virtuelle/publications/7?comment=8"]'));assert.equal(f.app.querySelector('[data-intervention-id="9"]'),null);
  f.client.clear();
});

test('CAS conflicts preserve edited text and resolve against the current revision; account 409 errors offer no overwrite action',async()=>{
  const f=fixture();await f.page('/loge-virtuelle/membres/11','?onglet=reflexions');f.click(f.find('[data-post-edit="7"]'));const form=f.find('form',f.node('loge-post-editor-7'));
  f.fill(form,'title','Mon brouillon');f.queue(error(409,'Version différente',{conflict:true}));f.submit(form);await flush();
  assert.equal(form.elements.namedItem('title').value,'Mon brouillon');assert(f.find('[data-conflict-keep]',form));
  f.queue({self,post:{...post(),title:'Version serveur',description:'Autre texte',revision:3}});f.click(f.find('[data-conflict-keep]',form));await flush();
  assert.equal(form.elements.namedItem('title').value,'Mon brouillon');assert.equal(form.querySelector('.loge-conflict'),null);
  f.submit(form);await flush();assert.equal(f.requests.at(-1).body.revision,3);assert.equal(f.node('loge-post-title-7').textContent,'Mon brouillon');
  f.click(f.find('[data-post-edit="7"]'));const second=f.find('form',f.node('loge-post-editor-7'));f.fill(second,'title','Texte privé');
  f.queue(error(409,'Le compte connecté a changé. Recharge la page.'));f.submit(second);await flush();assert.equal(second.querySelector('.loge-conflict'),null);assert.equal(second.elements.namedItem('title').value,'Texte privé');
  f.client.clear();
});

test('leave aborts requests and ignores delayed replies; clear removes private drafts across account changes',async()=>{
  const f=fixture();await f.page();f.click('loge-open-compose');let form=f.node('loge-new-form');f.fill(form,'title','Brouillon privé');
  f.client.leave();await f.page();f.click('loge-open-compose');assert.equal(f.node('loge-new-form').elements.namedItem('title').value,'Brouillon privé');
  form=f.node('loge-new-form');f.fill(form,'url','https://youtu.be/dQw4w9WgXcQ');
  const release=f.defer();f.submit(form);const request=f.requests.at(-1);f.client.clear();f.app.innerHTML='Autre page';f.state.user={id:12,username:'Bob'};
  assert.equal(request.signal.aborted,true);release({post:post(20),nextPublicationAt:null});await flush();assert.equal(f.app.textContent,'Autre page');
  f.state.user={...self};await f.page();f.click('loge-open-compose');assert.equal(f.node('loge-new-form').elements.namedItem('title').value,'');f.client.clear();
  const response=f.defer();const opening=f.page();const loading=f.requests.at(-1);f.client.leave();f.app.innerHTML='Nouvelle route';response({self,posts:[post()],next:null});await opening;
  assert.equal(loading.signal.aborted,true);assert.equal(f.app.textContent,'Nouvelle route');
});

test('unauthenticated navigation redirects, server denial blocks the page and mismatched self never renders a feed',async()=>{
  const anonymous=fixture({user:null});await anonymous.page();assert.equal(anonymous.requests.length,0);assert.match(anonymous.navigations[0][0],/^\/connexion\?retour=/);
  const denied=fixture();denied.queue(error(403,'Échelon 33 requis'));await denied.page();assert.match(denied.app.textContent,/Échelon 33 requis/);assert.equal(denied.requests[0].signal.aborted,true);assert.equal(denied.app.querySelector('[data-post-id]'),null);denied.client.clear();
  const mismatch=fixture();mismatch.queue({self:{id:12,username:'Bob'},posts:[post()],next:null});await mismatch.page();assert.equal(mismatch.app.querySelector('[data-post-id]'),null);assert.match(mismatch.navigations[0][0],/^\/connexion/);mismatch.client.clear();
});


test('internal navigation reuses profile tabs and the feed DOM, restores scroll and never inserts a loading screen',async()=>{
  const f=fixture();await f.page();const feed=f.node('loge-feed'),firstController=f.controllers.at(-1);feed.scrollTop=280;f.window.scrollY=40;
  assert.equal(f.client.canNavigate('/loge-virtuelle/membres/11?onglet=reflexions'),true);assert.equal(f.client.canNavigate('https://evil.test/loge-virtuelle'),false);
  await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');const profile=f.node('loge-profile-list');assert(f.find('[data-post-edit="7"]'));assert(f.find('.loge-menu'));assert.equal(firstController.destroyed,true);
  f.window.scrollY=170;await f.navigate('/loge-virtuelle/membres/11?onglet=interventions');assert.equal(f.window.scrollY,170);assert.equal(f.app.querySelector('[data-post-edit]'),null);
  const requests=f.requests.length;await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');assert.equal(f.node('loge-profile-list'),profile);assert.equal(f.window.scrollY,170);assert.equal(f.requests.length,requests);
  await f.navigate('/loge-virtuelle');assert.equal(f.node('loge-feed'),feed);assert.equal(feed.scrollTop,280);assert.equal(f.window.scrollY,40);assert.equal(f.app.querySelector('[data-post-edit]'),null);assert.doesNotMatch(f.app.textContent,/Chargement/);
  assert.equal(f.controllers.filter(controller=>!controller.destroyed).length,1);f.client.clear();assert.equal(f.client.canNavigate('/loge-virtuelle'),false);
});

test('late profile replies cannot replace a newer tab and posts are manageable only in the own reflection history',async()=>{
  const f=fixture();await f.page();const release=f.defer();const opening=f.navigate('/loge-virtuelle/membres/12?onglet=reflexions');
  assert(f.node('loge-feed'));assert.doesNotMatch(f.app.textContent,/Chargement/);
  await f.navigate('/loge-virtuelle/membres/12?onglet=interventions');const target=f.node('loge-profile-list');
  release({self,member:self,posts:[post()],next:null});await opening;assert.equal(f.node('loge-profile-list'),target);assert.equal(f.app.querySelector('[data-post-edit]'),null);
  await f.navigate('/loge-virtuelle/publications/7');assert.equal(f.app.querySelector('[data-post-edit]'),null);assert.equal(f.document.getElementById('loge-comment-compose'),null);f.click(f.find('[data-comments-open]'));await flush();assert(f.find('form',f.node('loge-comment-compose')));
  f.queue({self,member:{id:12,username:'Bob'},posts:[post(7,{id:12,username:'Bob'})],next:null});await f.navigate('/loge-virtuelle/membres/12?onglet=reflexions');assert.equal(f.app.querySelector('[data-post-edit]'),null);
  f.client.clear();
});


test('returning to an already rendered invalidated feed applies fresh data instead of restoring obsolete rows',async()=>{
  const f=fixture();await f.page();const oldFeed=f.node('loge-feed');
  await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');f.click(f.find('[data-post-edit="7"]'));const form=f.find('form',f.node('loge-post-editor-7'));
  f.fill(form,'title','Réflexion actualisée');f.submit(form);await flush();
  await f.navigate('/loge-virtuelle');assert.notEqual(f.node('loge-feed'),oldFeed);assert.equal(f.node('loge-post-title-7').textContent,'Réflexion actualisée');assert.equal(f.document.getElementById('loge-post-description-7'),null);
  assert.equal(f.controllers.filter(controller=>!controller.destroyed).length,1);const count=f.controllers.length;await f.navigate('/loge-virtuelle');assert.equal(f.controllers.length,count);assert.equal(f.controllers.filter(controller=>!controller.destroyed).length,1);f.client.clear();
});

test('late mutation failures stay in their original view and resize during initial fetch is harmless',async()=>{
  const f=fixture();const releaseInitial=f.defer();const first=f.page();assert.doesNotThrow(()=>f.window.dispatchEvent(new Event('resize')));releaseInitial({self,posts:[post()],next:null,nextPublicationAt:null});await first;
  await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');f.click(f.find('[data-post-edit="7"]'));const form=f.find('form',f.node('loge-post-editor-7'));f.fill(form,'title','Brouillon conservé');
  const release=f.defer();f.submit(form);await f.navigate('/loge-virtuelle');const visible=f.app.innerHTML;release(error(503,'Une erreur privée tardive'));await flush();assert.equal(f.app.innerHTML,visible);assert.doesNotMatch(f.app.textContent,/erreur privée tardive/);
  await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');assert.equal(form.elements.namedItem('title').value,'Brouillon conservé');assert.equal(form.elements.namedItem('title').disabled,false);f.client.clear();
});


test('failed internal navigation restores both the previous cached view and its address',async()=>{
  const f=fixture();await f.page();const feed=f.node('loge-feed');feed.scrollTop=210;f.queue(error(404,'Cette publication a été supprimée.'));
  await f.navigate('/loge-virtuelle/publications/99');assert.equal(f.node('loge-feed'),feed);assert.equal(feed.scrollTop,210);assert.equal(f.location.pathname,'/loge-virtuelle');assert.deepEqual(f.navigations.at(-1),['/loge-virtuelle',true]);assert.match(f.node('loge-status').textContent,/a été supprimée/);assert.equal(f.controllers.filter(controller=>!controller.destroyed).length,1);f.client.clear();
});


test('successful late edits invalidate rendered caches and reconcile the acknowledged draft revision',async()=>{
  const f=fixture();await f.page();await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');f.click(f.find('[data-post-edit="7"]'));const form=f.find('form',f.node('loge-post-editor-7'));f.fill(form,'title','Enregistré sur serveur');
  const release=f.defer();f.submit(form);await f.navigate('/loge-virtuelle');const visible=f.app.innerHTML;const saved={...post(),title:'Enregistré sur serveur',revision:2};release({post:saved,nextPublicationAt:null});await flush();assert.equal(f.app.innerHTML,visible);
  f.queue({self,member:self,posts:[saved],next:null});await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');assert.equal(f.node('loge-post-title-7').textContent,'Enregistré sur serveur');
  f.click(f.find('[data-post-edit="7"]'));const next=f.find('form',f.node('loge-post-editor-7'));f.fill(next,'title','Suite de la réflexion');f.submit(next);await flush();assert.equal(f.requests.filter(request=>request.method==='PUT').at(-1).body.revision,2);f.client.clear();
});

test('a late creation synchronizes the quota immediately and refetches the affected profile and feed',async()=>{
  const f=fixture();await f.page();f.click('loge-open-compose');const form=f.node('loge-new-form');for(const [name,value]of Object.entries({title:'Nouvelle vidéo',url:'https://youtu.be/dQw4w9WgXcQ'}))f.fill(form,name,value);
  const release=f.defer();f.submit(form);await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');const profile=f.node('loge-profile-list'),created={...post(20),title:'Nouvelle vidéo',description:'Ma réflexion'},nextPublicationAt=new Date(Date.now()+604800000).toISOString();
  release({post:created,nextPublicationAt});await flush();assert.equal(f.node('loge-profile-list'),profile);
  f.queue({self,posts:[created,post()],next:null,nextPublicationAt});await f.navigate('/loge-virtuelle');assert(f.node('loge-post-20'));assert.equal(f.node('loge-open-compose').disabled,false);f.click('loge-open-compose');assert.equal(f.node('loge-new-submit').disabled,true);assert.match(f.node('loge-quota').textContent,/Tu pourras publier/);assert.equal(f.requests.filter(request=>request.method==='POST').length,1);f.client.clear();
});

test('comments update the reel count and late panel acknowledgements refresh when the discussion reopens',async()=>{
  const f=fixture();await f.page();const open=f.find('[data-comments-open]');f.click(open);await flush();let compose=f.find('form',f.node('loge-comment-compose'));f.fill(compose,'body','Une piste');f.submit(compose);await flush();assert.equal(open.getAttribute('aria-label'),'Commentaires (1)');
  f.click(f.find('[data-comment-delete="18"]'));await flush();assert.equal(open.getAttribute('aria-label'),'Commentaires (0)');
  f.fill(compose,'body','Un envoi tardif');const release=f.defer();f.submit(compose);f.click(f.find('[data-discussion-close]'));release({comment:{...comment(29),body:'Un envoi tardif'}});await flush();
  f.queue({comments:[{...comment(29),body:'Un envoi tardif'}],next:null});f.click(open);await flush();assert.equal(f.node('loge-comment-body-29').textContent,'Un envoi tardif');compose=f.find('form',f.node('loge-comment-compose'));assert.equal(compose.elements.namedItem('body').value,'');f.client.clear();
});

test('Loge scenes keep one layout across profile tabs and only entering the Loge pauses music',async()=>{
  const f=fixture();await f.page();await flush();assert(f.document.body.classList.contains('loge-immersive'));assert.equal(f.music.length,1);
  await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');assert(f.document.body.classList.contains('loge-immersive'));assert.equal(f.music.length,1);
  await f.navigate('/loge-virtuelle/membres/11?onglet=interventions');assert.equal(f.document.body.classList.contains('loge-immersive'),true);assert(f.app.querySelector('.is-loge-layout'));assert(f.app.querySelector('.is-video-view'));
  await f.navigate('/loge-virtuelle/membres/11?onglet=favoris');assert(f.document.body.classList.contains('loge-immersive'));assert.equal(f.music.length,1);
  await f.navigate('/loge-virtuelle/publications/7');assert(f.document.body.classList.contains('loge-immersive'));assert.equal(f.document.getElementById('loge-comments-list'),null);
  f.client.leave();assert.equal(f.document.body.classList.contains('loge-immersive'),false);assert.equal(f.controllers.filter(controller=>!controller.destroyed).length,0);
  for(const status of [401,403,503]){const failed=fixture();failed.queue(error(status,'Indisponible'));await failed.page();assert.equal(failed.document.body.classList.contains('loge-immersive'),false);failed.client.clear();}
  const anonymous=fixture({user:null});await anonymous.page();assert.equal(anonymous.document.body.classList.contains('loge-immersive'),false);
});

test('a favorite waits for acknowledgement, locks duplicate clicks and keeps its state on failure',async()=>{
  const f=fixture();await f.page();await flush();const favorite=f.find('[data-favorite="7"]');
  assert.equal(favorite.getAttribute('aria-pressed'),'false');const reject=f.defer();f.click(favorite);assert.equal(favorite.disabled,true);assert.equal(favorite.getAttribute('aria-pressed'),'false');
  assert.deepEqual(f.requests.at(-1).body,{favorite:true});assert.equal(f.requests.at(-1).url,'/api/loge/posts/7/favorite');
  reject(error(503,'Réessaie plus tard'));await flush();assert.equal(favorite.disabled,false);assert.equal(favorite.getAttribute('aria-pressed'),'false');assert.match(f.node('loge-post-status-7').textContent,/Réessaie/);
  const accept=f.defer();f.click(favorite);accept({postId:7,isFavorite:true});await flush();assert.equal(favorite.disabled,false);assert.equal(favorite.getAttribute('aria-pressed'),'true');assert(favorite.classList.contains('is-active'));assert.equal(favorite.getAttribute('aria-label'),'Retirer des favoris');
  f.click(favorite);await flush();assert.deepEqual(f.requests.filter(request=>request.url.endsWith('/favorite')).at(-1).body,{favorite:false});assert.equal(favorite.getAttribute('aria-pressed'),'false');f.client.clear();
});

test('private favorites retain server order and cursor, and removing a favorite moves to the following clip',async()=>{
  const entries=[{...post(3),isFavorite:true},{...post(9),isFavorite:true},{...post(7),isFavorite:true}];const f=fixture({posts:entries});
  f.queue({self,member:self,posts:entries.slice(0,2),next:41});await f.page('/loge-virtuelle/membres/11','?onglet=favoris');await flush();
  const list=f.node('loge-profile-list'),controller=f.controllers.at(-1),ids=()=>list.querySelectorAll('[data-post-id]').map(card=>card.dataset.postId);
  assert.deepEqual(ids(),['3','9']);assert.equal(controller.options.root,list);assert.equal(f.app.querySelector('[data-post-edit]'),null);assert(f.find('a[href="/loge-virtuelle/membres/11?onglet=favoris"]'));
  f.queue({self,member:self,posts:entries.slice(2),next:null});f.click('loge-profile-more');await flush();assert.equal(f.requests.at(-1).url,'/api/loge/membres/11?tab=favoris&after=41');assert.deepEqual(ids(),['3','9','7']);
  f.click(f.find('[data-favorite="9"]'));await flush();assert.deepEqual(ids(),['3','7']);assert.equal(controller.items.has('9'),false);assert.equal(f.node('loge-post-7').scrolled,true);assert.equal(f.node('loge-profile-more').hidden,true);
  await f.navigate('/loge-virtuelle/membres/12?onglet=reflexions');assert.equal(f.app.querySelector('a[href="/loge-virtuelle/membres/12?onglet=favoris"]'),null);f.client.clear();
});

test('favorite tabs and comment panels reuse cached scenes with one active controller and restored swipe position',async()=>{
  const f=fixture({posts:[{...post(),isFavorite:true}]});await f.page();await flush();await f.navigate('/loge-virtuelle/membres/11?onglet=favoris');await flush();
  const list=f.node('loge-profile-list');list.scrollTop=520;f.click(f.find('[data-comments-open="7"]'));await flush();assert(f.node('loge-comments-list'));assert.equal(f.controllers.at(-1).paused,true);
  const form=f.find('form',f.node('loge-comment-compose'));f.fill(form,'body','Brouillon de réponse');f.click(f.find('[data-discussion-close]'));
  await f.navigate('/loge-virtuelle/membres/11?onglet=interventions');const count=f.requests.length;await f.navigate('/loge-virtuelle/membres/11?onglet=favoris');assert.equal(f.node('loge-profile-list'),list);assert.equal(list.scrollTop,520);assert.equal(f.requests.length,count);
  f.click(f.find('[data-comments-open="7"]'));await flush();assert.equal(f.find('form',f.node('loge-comment-compose')),form);assert.equal(form.elements.namedItem('body').value,'Brouillon de réponse');assert.equal(f.controllers.filter(controller=>!controller.destroyed).length,1);f.client.clear();assert.equal(f.document.body.classList.contains('loge-immersive'),false);
});

test('a late favorite acknowledgement invalidates the cached history without changing the current scene',async()=>{
  const f=fixture();await f.page();await flush();const release=f.defer();f.click(f.find('[data-favorite="7"]'));await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');await flush();const visible=f.app.innerHTML;
  release({postId:7,isFavorite:true});await flush();assert.equal(f.app.innerHTML,visible);
  const saved={...post(),isFavorite:true};f.queue({self,member:self,posts:[saved],next:null});await f.navigate('/loge-virtuelle/membres/11?onglet=favoris');assert.equal(f.find('[data-favorite="7"]').getAttribute('aria-pressed'),'true');assert(f.node('loge-post-7'));f.client.clear();
});

test('publication forms accept Shorts and send only the title, immutable URL and creation nonce',async()=>{
  const f=fixture({posts:[]});await f.page();await flush();f.click('loge-open-compose');const form=f.node('loge-new-form');assert.equal(form.querySelector('textarea'),null);
  f.fill(form,'title','Mon titre');f.fill(form,'url','https://www.youtube.com/shorts/dQw4w9WgXcQ');f.submit(form);await flush();const create=f.requests.find(request=>request.method==='POST');assert.deepEqual(Object.keys(create.body).sort(),['requestId','title','url']);
  await f.navigate('/loge-virtuelle/membres/11?onglet=reflexions');f.click(f.find('[data-post-edit="20"]'));const edit=f.find('form',f.node('loge-post-editor-20'));assert.equal(edit.elements.namedItem('url'),null);assert.equal(edit.elements.namedItem('description'),null);f.fill(edit,'title','Titre revu');f.submit(edit);await flush();const update=f.requests.find(request=>request.method==='PUT');assert.deepEqual(update.body,{title:'Titre revu',revision:1});assert.equal(f.node('loge-post-title-20').textContent,'Titre revu');f.client.clear();
});

test('site header measurements and menu pauses are observed without leaking across navigation or cleanup',async()=>{
  const f=fixture({observeUI:true}),header=f.document.createElement('header');header.className='site-header';let height=77;header.getBoundingClientRect=()=>({height});f.document.body.append(header);
  await f.page();await flush();assert.equal(f.document.body.style.getPropertyValue('--loge-site-header-height'),'77px');
  height=93;f.observers.resize[0].emit();assert.equal(f.document.body.style.getPropertyValue('--loge-site-header-height'),'93px');
  const player=f.controllers.at(-1),menu=f.observers.menu[0];f.document.body.classList.add('nav-open');menu.emit();assert.equal(player.paused,true);
  f.document.body.classList.remove('nav-open');menu.emit();assert.equal(player.paused,false);
  f.click(f.find('[data-comments-open]'));await flush();f.document.body.classList.add('nav-open');menu.emit();f.document.body.classList.remove('nav-open');menu.emit();assert.equal(player.paused,true);
  f.click(f.find('[data-discussion-close]'));assert.equal(player.paused,false);
  f.document.body.classList.add('nav-open');menu.emit();f.document.body.classList.remove('nav-open');await f.navigate('/loge-virtuelle/membres/11?onglet=favoris');menu.emit();assert.equal(player.destroyed,true);assert.equal(f.controllers.filter(controller=>!controller.destroyed).length,1);
  f.client.clear();assert.equal(f.document.body.style.getPropertyValue('--loge-site-header-height'),'');assert.equal(f.observers.resize[0].closed,true);assert.equal(menu.closed,true);
});

test('the four Loge sections keep the same navigation and restore the interventions list scroll position',async()=>{
  const f=fixture();await f.page('/loge-virtuelle/membres/11');let tabs;
  for(const tab of ['reflexions','interventions','favoris']){
    await f.navigate('/loge-virtuelle/membres/11?onglet='+tab);const nav=f.find('.loge-tabs');assert.deepEqual(nav.querySelectorAll('a').map(link=>link.textContent),['Loge','Réflexions','Interventions','Favoris']);
    assert.equal(nav.querySelectorAll('a[aria-current="page"]').length,1);assert.equal(f.find('a[aria-current="page"]').getAttribute('href'),'/loge-virtuelle/membres/11?onglet='+tab);
    assert(f.app.querySelector('.is-loge-layout'));assert.equal(f.app.querySelector('a[aria-label="Mon profil"]'),null);tabs=nav;
    if(tab==='interventions')f.node('loge-profile-list').scrollTop=240;
  }
  await f.navigate('/loge-virtuelle/membres/11?onglet=interventions');assert.equal(f.node('loge-profile-list').scrollTop,240);assert.notEqual(tabs,f.find('.loge-tabs'));f.client.clear();
});

test('the feed and own histories share four destinations, one active section and a stable page heading',async()=>{
  const f=fixture();await f.page();await flush();
  const destinations=['/loge-virtuelle','/loge-virtuelle/membres/11?onglet=reflexions','/loge-virtuelle/membres/11?onglet=interventions','/loge-virtuelle/membres/11?onglet=favoris'];
  for(const destination of destinations){
    await f.navigate(destination);const navigation=f.find('.loge-tabs'),links=navigation.querySelectorAll('a');
    assert.deepEqual(links.map(link=>link.getAttribute('href')),destinations);
    assert.equal(navigation.querySelectorAll('a[aria-current="page"]').length,1);
    assert.equal(navigation.querySelector('a[aria-current="page"]').getAttribute('href'),destination);
    assert.equal(f.find('h1').textContent,'Loge virtuelle');assert(f.find('.is-video-view'));assert.equal(f.app.querySelector('a[aria-label="Mon profil"]'),null);
  }
  await f.navigate('/loge-virtuelle/membres/12?onglet=interventions');
  assert.deepEqual(f.find('.loge-tabs').querySelectorAll('a').map(link=>link.getAttribute('href')),destinations,'the main navigation always points to the signed-in member’s histories');
  const member=f.find('.loge-member-tabs');assert.equal(member.querySelectorAll('a').length,2);assert.equal(member.querySelector('a[aria-current="page"]').getAttribute('href'),'/loge-virtuelle/membres/12?onglet=interventions');
  assert.equal(f.app.querySelector('a[href="/loge-virtuelle/membres/12?onglet=favoris"]'),null);f.client.clear();
});

test('interventions play the shared videos once per post, retain every exchange and keep server cursor order',async()=>{
  const bob={id:12,username:'Bob'},first={...post(3,bob),commentCount:3},second={...post(9,bob),commentCount:1};
  const a={...comment(40),postId:3,body:'Ma piste récente',post:first},b={...comment(39),postId:9,post:second},c={...comment(38),postId:3,body:'Ma première piste',post:first};
  const f=fixture({posts:[first,second],comments:[a,c]});f.queue({self,member:self,interventions:[a,b,c],next:38});
  await f.page('/loge-virtuelle/membres/11','?onglet=interventions');
  const list=f.node('loge-profile-list'),player=f.controllers.at(-1);assert.deepEqual(list.querySelectorAll('[data-post-id]').map(card=>card.dataset.postId),['3','9']);
  assert.deepEqual([...player.items.keys()],['3','9']);assert.equal(player.options.root,list);
  assert.equal(list.querySelectorAll('[data-intervention-id]').length,3);assert.equal(f.node('loge-interventions-post-3').hidden,false);
  assert(f.find('a[href="/loge-virtuelle/publications/3?comment=38"]'));assert.equal(f.app.querySelector('[data-post-edit]'),null);
  const card=f.node('loge-post-3'),actions=f.find('.loge-reel-actions',card);assert.equal(actions.querySelectorAll('button').length,2);assert.equal(f.find('[data-comment-count]',actions).textContent,'3');
  f.click(f.find('[data-comments-open="3"]'));await flush();assert.equal(f.requests.filter(r=>r.url.includes('/comments')).at(-1).url,'/api/loge/posts/3/comments?focus=40');assert.equal(player.paused,true);
  f.click(f.find('[data-discussion-close]'));assert.equal(player.paused,false);
  f.queue({postId:3,isFavorite:true});f.click(f.find('[data-favorite="3"]'));await flush();assert.equal(f.find('[data-favorite="3"]').getAttribute('aria-pressed'),'true');
  f.queue({self,member:self,interventions:[c,{...comment(37),postId:9,post:second}],next:null});f.click('loge-profile-more');await flush();
  assert.equal(f.requests.find(r=>r.url.includes('&after=')).url,'/api/loge/membres/11?tab=interventions&after=38');assert.equal(list.querySelectorAll('[data-post-id]').length,2);assert.equal(list.querySelectorAll('[data-intervention-id]').length,4);f.client.clear();
});

test('editing and deleting intervention comments synchronizes their context and removes a video only after its last intervention',async()=>{
  const bob={id:12,username:'Bob'},video={...post(7,bob),commentCount:2},a={...comment(8),post:video},b={...comment(9),body:'Autre piste',post:video};
  const f=fixture({posts:[video],comments:[a,b]});f.queue({self,member:self,interventions:[b,a],next:null});await f.page('/loge-virtuelle/membres/11','?onglet=interventions');
  f.click(f.find('[data-comments-open="7"]'));await flush();f.click(f.find('[data-comment-edit="8"]'));
  const form=f.find('form',f.node('loge-comment-editor-8'));f.fill(form,'body','Piste corrigée');f.submit(form);await flush();
  assert.equal(f.find('[data-intervention-id="8"]').querySelector('span').textContent,'Piste corrigée');
  f.click(f.find('[data-comment-delete="8"]'));await flush();assert.equal(f.app.querySelector('[data-intervention-id="8"]'),null);assert(f.node('loge-post-7'));
  f.click(f.find('[data-comment-delete="9"]'));await flush();assert.equal(f.app.querySelector('[data-post-id]'),null);assert.equal(f.controllers.at(-1).items.size,0);assert.match(f.node('loge-profile-empty').textContent,/Aucune intervention/);f.client.clear();
});


test('new interventions and deletions order each video by its most recent remaining exchange',async()=>{
  const bob={id:12,username:'Bob'},a={...post(3,bob),commentCount:2},b={...post(9,bob),commentCount:1};
  const comments=[{...comment(30),postId:3,post:a},{...comment(20),postId:9,post:b},{...comment(10),postId:3,post:a}];
  const f=fixture({posts:[a,b],comments});f.queue({self,member:self,interventions:comments,next:null});await f.page('/loge-virtuelle/membres/11','?onglet=interventions');
  const ids=()=>f.node('loge-profile-list').querySelectorAll('[data-post-id]').map(card=>card.dataset.postId);assert.deepEqual(ids(),['3','9']);
  f.click(f.find('[data-comments-open="3"]'));await flush();f.click(f.find('[data-comment-delete="30"]'));await flush();assert.deepEqual(ids(),['9','3']);
  const form=f.find('form',f.node('loge-comment-compose'));f.fill(form,'body','Une nouvelle piste');f.queue({comment:{...comment(40),postId:3,body:'Une nouvelle piste'}});f.submit(form);await flush();assert.deepEqual(ids(),['3','9']);
  assert.deepEqual(f.node('loge-interventions-post-3').querySelectorAll('[data-intervention-id]').map(link=>link.dataset.interventionId),['40','10']);
  assert.equal(f.controllers.filter(player=>!player.destroyed).length,1);f.client.clear();
});
