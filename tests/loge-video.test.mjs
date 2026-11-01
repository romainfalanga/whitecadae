import {test} from 'node:test';
import assert from 'node:assert/strict';

let moduleId=0;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Bus extends EventTarget{
  constructor(){super();this.listeners=new Map();}
  addEventListener(type,listener,options){super.addEventListener(type,listener,options);if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
  removeEventListener(type,listener,options){super.removeEventListener(type,listener,options);this.listeners.get(type)?.delete(listener);}
  count(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
class Element extends Bus{
  constructor(tag,document){
    super();this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentNode=null;this.attributes=new Map();this.hidden=false;
    const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)};
    this.box={top:0,left:0,right:400,bottom:800,width:400,height:800};
  }
  append(...nodes){for(const node of nodes){node.remove();this.children.push(node);node.parentNode=this;}}
  remove(){if(this.parentNode){const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),1);this.parentNode=null;}}
  setAttribute(key,value){this.attributes.set(key,String(value));}
  getAttribute(key){return this.attributes.get(key)??null;}
  get isConnected(){return this===this.ownerDocument||!!this.parentNode?.isConnected;}
  getBoundingClientRect(){return this.tagName==='IFRAME'&&!this.frameBox?this.parentNode.getBoundingClientRect():this.frameBox||this.box;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){
    const found=[];for(const child of this.children){
      if(selector==='script[data-loge-youtube-api]'&&child.tagName==='SCRIPT'&&child.attributes.has('data-loge-youtube-api')||selector==='input[type="range"]'&&child.tagName==='INPUT'&&child.getAttribute('type')==='range'||selector==='[data-video-time]'&&child.attributes.has('data-video-time')||selector.toUpperCase()===child.tagName)found.push(child);
      found.push(...child.querySelectorAll(selector));
    }return found;
  }
  compareDocumentPosition(other){
    const all=[];function visit(node){all.push(node);for(const child of node.children)visit(child);}visit(this.ownerDocument);
    const a=all.indexOf(this),b=all.indexOf(other);return a<0||b<0?1:a<b?4:a>b?2:0;
  }
}
async function harness({apiReady=true,previousReady}={}){
  const names=['window','document','location','IntersectionObserver','setInterval','clearInterval'],original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const document=new Element('document');document.ownerDocument=document;document.hidden=false;
  document.createElement=tag=>new Element(tag,document);document.head=document.createElement('head');document.body=document.createElement('body');document.append(document.head,document.body);
  const window=new Bus();window.innerWidth=400;window.innerHeight=800;window.WCPlayer={pause(){musicPauses++;const event=new Event('wc:music');event.detail={playing:false};window.dispatchEvent(event);}};
  let musicPauses=0,timerSequence=0;const players=[],observers=[],feeds=[],timers=new Map();
  class Player{
    constructor(iframe,options){this.iframe=iframe;this.events=options.events;this.calls=[];this.muted=true;this.state=-1;this.time=0;this.duration=180;this.seeks=[];players.push(this);}
    emit(type,data){if(type==='onStateChange')this.state=data;this.events[type]?.({target:this,data});}
    mute(){this.calls.push('mute');this.muted=true;}
    unMute(){this.calls.push('unMute');this.muted=false;}
    isMuted(){return this.muted;}
    getPlayerState(){return this.state;}
    getCurrentTime(){return this.time;}
    getDuration(){return this.duration;}
    seekTo(value,allowSeekAhead){this.seeks.push([value,allowSeekAhead]);this.time=value;}
    playVideo(){this.calls.push('play');}
    pauseVideo(){this.calls.push('pause');}
    destroy(){this.calls.push('destroy');this.iframe.remove();}
    count(action){return this.calls.filter(call=>call===action).length;}
  }
  const YT={Player};if(apiReady)window.YT=YT;if(previousReady)window.onYouTubeIframeAPIReady=previousReady;
  class Observer{
    constructor(callback,options){this.callback=callback;this.options=options;this.targets=new Set();observers.push(this);}
    observe(node){this.targets.add(node);}
    unobserve(node){this.targets.delete(node);}
    disconnect(){this.targets.clear();}
    emit(entries){this.callback(entries.map(([target,ratio])=>({target,isIntersecting:ratio>0,intersectionRatio:ratio})));}
  }
  Object.assign(globalThis,{window,document,location:{origin:'https://whitecadae.fr'},IntersectionObserver:Observer,setInterval:(callback,delay)=>{const id=++timerSequence;timers.set(id,{callback,delay});return id;},clearInterval:id=>timers.delete(id)});
  const {createLogeVideoFeed}=await import('../public/loge-video.js?test='+(++moduleId));
  function feed(options={}){const value=createLogeVideoFeed(options);feeds.push(value);return value;}
  function container(index=0,parent=document.body){const node=document.createElement('div');node.index=index;node.box={top:index*800,left:0,right:400,bottom:(index+1)*800,width:400,height:800};parent.append(node);return node;}
  const post=id=>({id,youtubeUrl:'https://youtu.be/M7lc1UVf-VE',title:'Réflexion '+id});
  function api(){window.YT=YT;window.onYouTubeIframeAPIReady?.();}
  function timeline(parent=document.body){const node=document.createElement('div'),range=document.createElement('input'),label=document.createElement('span');node.hidden=true;range.setAttribute('type','range');range.setAttribute('aria-label','Position dans la vidéo');range.min='0';range.max='0';range.step='.1';range.value='0';range.disabled=true;label.setAttribute('data-video-time','');node.append(range,label);parent.append(node);return {node,range,label};}
  async function close(){for(const value of feeds)value.destroy();if(!window.YT?.Player)api();await tick();for(const [name,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
  return {feed,post,container,timeline,timers,progress:()=>{for(const {callback}of [...timers.values()])callback();},document,window,players,observers,api,YT,close,get musicPauses(){return musicPauses;}};
}

test('warm loading is bounded to three native iframes with safe official API parameters',async()=>{
  const h=await harness(),feed=h.feed(),containers=[];
  try{
    for(let i=0;i<20;i++){const node=h.container(i);containers.push(node);feed.add(h.post(i),node);}
    assert.equal(h.document.querySelectorAll('iframe').length,3);await tick();assert.equal(h.players.length,3);
    for(const iframe of h.document.querySelectorAll('iframe')){
      const url=new URL(iframe.src);assert.equal(url.origin,'https://www.youtube-nocookie.com');
      for(const [key,value]of Object.entries({enablejsapi:'1',origin:'https://whitecadae.fr',playsinline:'1',autoplay:'0',mute:'0',controls:'0',disablekb:'0',fs:'1'}))assert.equal(url.searchParams.get(key),value);
      assert.match(iframe.getAttribute('allow'),/autoplay/);assert.equal(iframe.getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
    }
    for(const player of h.players)player.emit('onReady');
    assert.equal(h.players[0].count('play'),1);assert.equal(h.players[1].count('play'),0);assert.equal(h.players[2].count('play'),0);
    assert.ok(h.musicPauses>=1);assert.equal(h.document.querySelectorAll('button').length,0);
    assert.equal(h.players[0].muted,false);assert.equal(h.players[0].count('mute'),0);assert.ok(h.players[0].calls.indexOf('unMute')<h.players[0].calls.indexOf('play'));
    assert.equal(h.players[1].count('unMute'),0);assert.equal(h.players[2].count('unMute'),0);
    for(const node of containers)node.box={...node.box,top:(node.index-10)*800,bottom:(node.index-9)*800};feed.refresh();await tick();
    assert.equal(h.document.querySelectorAll('iframe').length,3);
    assert.equal(h.players.slice(0,3).every(player=>player.count('destroy')===1),true);
    assert.equal(h.players.length,6);
    for(const player of h.players.slice(3))player.emit('onReady');
    assert.equal(h.players.slice(3).filter(player=>player.count('play')===1).length,1);
    // Reload/resize never overrides a user's pause with another scripted play.
    const current=h.players.slice(3).find(player=>player.count('play')===1);current.emit('onStateChange',2);feed.refresh();assert.equal(current.count('play'),1);
  }finally{await h.close();}
});

test('only more than half-visible video plays; switching pauses the previous player and late inactive playback',async()=>{
  const h=await harness(),feed=h.feed(),one=h.container(),two=h.container(1);
  try{
    feed.add(h.post(1),one);feed.add(h.post(2),two);await tick();h.players.forEach(player=>player.emit('onReady'));
    const [a,b]=h.players,io=h.observers[0];
    one.box={...one.box,top:-400,bottom:400};two.box={...two.box,top:400,bottom:1200};
    io.emit([[a.iframe,.5],[b.iframe,.5]]);const before=a.count('play');a.emit('onStateChange',1);assert.equal(a.count('play'),before);assert.ok(a.count('pause')>0);
    one.box={...one.box,top:-408,bottom:392};two.box={...two.box,top:392,bottom:1192};
    io.emit([[a.iframe,.49],[b.iframe,.51]]);assert.equal(b.count('play'),1);assert.ok(a.count('pause')>0);
    a.emit('onStateChange',1);assert.ok(a.count('pause')>1);assert.equal(one.classList.contains('is-playing'),false);
    b.emit('onStateChange',1);assert.equal(two.classList.contains('is-playing'),true);
  }finally{await h.close();}
});

test('audible autoplay has no custom control or muted retry; blocked playback remains available to native gestures',async()=>{
  const h=await harness(),feed=h.feed(),node=h.container();
  try{
    feed.add(h.post(1),node);await tick();const player=h.players[0];player.emit('onReady');
    assert.equal(player.muted,false);assert.equal(node.querySelectorAll('button').length,0);
    const before=player.count('play');player.emit('onAutoplayBlocked');assert.equal(player.muted,false);assert.equal(player.count('play'),before);
    player.emit('onAutoplayBlocked');feed.refresh();feed.pause();feed.resume();
    h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(player.count('play'),before);assert.equal(player.count('mute'),0);
    assert.equal(node.querySelectorAll('button').length,0);assert.equal(new URL(node.querySelector('iframe').src).searchParams.get('controls'),'0');
    player.emit('onStateChange',1);assert.equal(node.classList.contains('is-playing'),true);assert.equal(player.count('play'),before);assert.equal(player.muted,false);
    player.emit('onStateChange',2);feed.refresh();assert.equal(player.count('play'),before);
  }finally{await h.close();}
});

test('music, hidden tabs, navigation suspension and detached caches cannot restart a video',async()=>{
  let current=true;const h=await harness(),feed=h.feed({isCurrent:()=>current}),one=h.container(),two=h.container(1);
  try{
    feed.add(h.post(1),one);feed.add(h.post(2),two);await tick();h.players.forEach(player=>player.emit('onReady'));
    const [a,b]=h.players;
    h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));const hidden=a.count('play');a.emit('onAutoplayBlocked');feed.refresh();assert.equal(a.count('play'),hidden);
    h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(a.count('play'),hidden);
    feed.pause();assert.equal(h.observers[0].targets.size,0);const paused=a.count('play');feed.refresh();a.emit('onStateChange',1);assert.equal(a.count('play'),paused);
    one.remove();two.remove();feed.resume();assert.equal(a.count('play'),paused);
    h.document.body.append(one,two);current=false;feed.resume();assert.equal(a.count('play'),paused);
    current=true;feed.resume();assert.equal(a.count('play'),paused);
    a.emit('onStateChange',1);
    const music=new Event('wc:music');music.detail={playing:true};h.window.dispatchEvent(music);
    const count=a.count('play');feed.refresh();assert.equal(a.count('play'),count);a.emit('onStateChange',1);assert.equal(one.classList.contains('is-playing'),false);
    a.emit('onStateChange',2);a.emit('onStateChange',1);assert.equal(a.count('play'),count);assert.equal(one.classList.contains('is-playing'),true);
    h.window.dispatchEvent(music);one.box={...one.box,top:-800,bottom:0};two.box={...two.box,top:0,bottom:800};feed.refresh();assert.equal(b.count('play'),1);
  }finally{await h.close();}
});

test('native Play can resume after music pause is acknowledged while late PLAYING and scripted retries stay blocked',async()=>{
  const h=await harness(),feed=h.feed(),container=h.container();
  try{
    feed.add(h.post(1),container);await tick();const player=h.players[0];player.emit('onReady');player.emit('onStateChange',1);
    const music=new Event('wc:music');music.detail={playing:true};h.window.dispatchEvent(music);
    const calls=player.count('play'),musicPauses=h.musicPauses,pauseCalls=player.count('pause');
    player.emit('onStateChange',1);assert.equal(container.classList.contains('is-playing'),false);assert.ok(player.count('pause')>pauseCalls);
    assert.equal(h.musicPauses,musicPauses);
    player.emit('onStateChange',2);h.window.dispatchEvent(music);feed.refresh();player.emit('onAutoplayBlocked');
    assert.equal(player.count('play'),calls);assert.equal(container.classList.contains('is-playing'),false);
    // A new PLAYING event after PAUSED comes through the native player path,
    // with no scripted play call and with music paused before accepting it.
    player.emit('onStateChange',1);assert.equal(container.classList.contains('is-playing'),true);assert.equal(player.count('play'),calls);assert.ok(h.musicPauses>musicPauses);
    player.emit('onStateChange',2);feed.refresh();assert.equal(player.count('play'),calls);
    // A fresh music request while video is playing requires a new acknowledgement.
    player.emit('onStateChange',1);h.window.dispatchEvent(music);player.emit('onStateChange',1);
    assert.equal(container.classList.contains('is-playing'),false);assert.equal(player.count('play'),calls);
  }finally{await h.close();}
});

test('an already-paused native player can resume after music without waiting for a redundant PAUSED event',async()=>{
  const h=await harness(),feed=h.feed(),container=h.container();
  try{
    feed.add(h.post(1),container);await tick();const player=h.players[0];player.emit('onReady');player.emit('onStateChange',1);player.emit('onStateChange',2);
    const music=new Event('wc:music');music.detail={playing:true};h.window.dispatchEvent(music);
    const calls=player.count('play');feed.refresh();player.emit('onAutoplayBlocked');assert.equal(player.count('play'),calls);
    player.emit('onStateChange',1);assert.equal(container.classList.contains('is-playing'),true);assert.equal(player.count('play'),calls);
  }finally{await h.close();}
});

test('a cached PAUSED state does not unlock a scripted play still in transit when music starts',async()=>{
  const h=await harness(),feed=h.feed(),container=h.container();
  try{
    feed.add(h.post(1),container);await tick();const player=h.players[0];player.state=2;player.emit('onReady');
    const music=new Event('wc:music');music.detail={playing:true};h.window.dispatchEvent(music);
    player.emit('onStateChange',1);assert.equal(container.classList.contains('is-playing'),false);
    player.emit('onStateChange',2);player.emit('onStateChange',1);assert.equal(container.classList.contains('is-playing'),true);
  }finally{await h.close();}
});

test('a browser-blocked unstarted clip can resume natively after music without a redundant pause acknowledgement',async()=>{
  const h=await harness(),feed=h.feed(),container=h.container();
  try{
    feed.add(h.post(1),container);await tick();const player=h.players[0];player.emit('onReady');player.emit('onAutoplayBlocked');
    const music=new Event('wc:music');music.detail={playing:true};h.window.dispatchEvent(music);
    const calls=player.count('play');feed.refresh();player.emit('onAutoplayBlocked');assert.equal(player.count('play'),calls);
    player.emit('onStateChange',1);assert.equal(container.classList.contains('is-playing'),true);assert.equal(player.count('play'),calls);assert.equal(player.count('mute'),0);
  }finally{await h.close();}
});

test('shared API loading chains existing callbacks once and destroyed or evicted players never initialize late',async()=>{
  let oldCalls=0;const h=await harness({apiReady:false,previousReady:()=>{oldCalls++;throw Error('Other embed');}}),one=h.feed(),two=h.feed();
  try{
    const a=h.container(),b=h.container();one.add(h.post(1),a);two.add(h.post(1),b);
    assert.equal(h.document.querySelectorAll('script').length,1);assert.equal(h.document.querySelectorAll('iframe').length,2);assert.equal(h.players.length,0);
    assert.notEqual(a.querySelector('iframe').id,b.querySelector('iframe').id);
    one.destroy();h.api();await tick();assert.equal(oldCalls,1);assert.equal(h.players.length,1);assert.equal(h.players[0].iframe,b.querySelector('iframe'));
    two.destroy();h.players[0].emit('onReady');assert.equal(h.players[0].count('play'),0);assert.ok(h.players[0].count('destroy')>=1);
    assert.equal(h.document.querySelectorAll('iframe').length,0);assert.equal(h.document.count(),0);assert.equal(h.window.count(),0);
  }finally{await h.close();}
});

test('remove/update/errors release players and expose one compact unavailable label without unsafe URLs',async()=>{
  const errors=[],h=await harness(),feed=h.feed({onError:(error,post)=>errors.push([error.message,post.id])}),node=h.container();
  try{
    feed.add({...h.post('invalid'),youtubeUrl:'https://evil.test/watch?v=M7lc1UVf-VE'},node);
    assert.equal(node.querySelectorAll('iframe').length,0);assert.equal(node.querySelector('p').textContent,'Vidéo indisponible.');assert.equal(errors.length,1);
    feed.remove('invalid');assert.equal(node.children.length,0);
    feed.add(h.post(1),node);await tick();const old=h.players[0];old.emit('onReady');
    feed.add({...h.post(1),title:'Titre corrigé'},node);assert.equal(h.players.length,1);assert.equal(old.iframe.title,'Vidéo : Titre corrigé');
    old.emit('onError',150);assert.equal(node.querySelectorAll('iframe').length,0);assert.equal(node.querySelectorAll('button').length,0);assert.equal(node.querySelectorAll('p').length,1);assert.equal(errors.length,2);
    feed.refresh();assert.equal(h.players.length,1);
    feed.remove(1);old.emit('onReady');assert.equal(old.count('play'),1);assert.equal(node.children.length,0);
  }finally{await h.close();}
});

test('API failure is handled without fallback link, duplicate play control or late mutation',async()=>{
  const errors=[],h=await harness({apiReady:false}),feed=h.feed({onError:error=>errors.push(error.message)}),node=h.container();
  try{
    feed.add(h.post(1),node);h.document.querySelector('script').dispatchEvent(new Event('error'));await tick();
    assert.equal(node.querySelectorAll('iframe').length,0);assert.equal(node.querySelectorAll('button').length,0);assert.equal(node.querySelector('p').textContent,'Vidéo indisponible.');assert.equal(errors.length,1);
    feed.destroy();h.api();await tick();assert.equal(node.children.length,0);assert.equal(h.players.length,0);
  }finally{await h.close();}
});

test('a later visit can recover from API load failure without retrying the failed view automatically',async()=>{
  const h=await harness({apiReady:false}),first=h.feed(),a=h.container();
  try{
    first.add(h.post(1),a);const failed=h.document.querySelector('script');
    failed.dispatchEvent(new Event('error'));await tick();
    assert.equal(h.document.querySelectorAll('script').length,0);
    first.refresh();assert.equal(h.document.querySelectorAll('script').length,0);first.destroy();a.remove();
    const second=h.feed(),b=h.container();second.add(h.post(2),b);
    assert.equal(h.document.querySelectorAll('script').length,1);assert.notEqual(h.document.querySelector('script'),failed);
    h.api();await tick();assert.equal(h.players.length,1);h.players[0].emit('onReady');assert.equal(h.players[0].count('play'),1);
  }finally{await h.close();}
});

test('visibility measures and observes the actual iframe, including a layout change before onReady',async()=>{
  const h=await harness(),feed=h.feed(),container=h.container();
  try{
    feed.add(h.post(1),container);await tick();const player=h.players[0],iframe=player.iframe,io=h.observers[0];
    assert.equal(io.targets.has(iframe),true);assert.equal(io.targets.has(container),false);
    // The entire container is visible, but a shifted iframe has only 40% of
    // its area visible. Its delayed onReady must not use the container ratio.
    iframe.frameBox={top:-600,left:0,right:400,bottom:400,width:400,height:1000};
    player.emit('onReady');assert.equal(player.count('play'),0);
    iframe.frameBox={top:-400,left:0,right:400,bottom:400,width:400,height:800};
    io.emit([[iframe,.5]]);assert.equal(player.count('play'),0);
    iframe.frameBox={...iframe.frameBox,top:-392,bottom:408};io.emit([[iframe,.51]]);assert.equal(player.count('play'),1);
    // Even before an observer delivery, a fresh geometry check prevents a
    // stale autoplay or native PLAYING event from restarting an offscreen player.
    iframe.frameBox={...iframe.frameBox,top:900,bottom:1700};
    player.emit('onAutoplayBlocked');player.emit('onStateChange',1);assert.equal(player.count('play'),1);assert.equal(container.classList.contains('is-playing'),false);
  }finally{await h.close();}
});

test('YouTube native fullscreen ignores reel clipping and pauses other visible frames without adding custom UI',async()=>{
  const h=await harness(),root=h.container(),feed=h.feed({root}),media=[];
  try{
    root.box={top:100,left:0,right:400,bottom:300,width:400,height:200};
    for(let i=0;i<20;i++){const node=h.container(i,root);media.push(node);feed.add(h.post(i),node);}await tick();h.players.forEach(player=>player.emit('onReady'));
    assert.equal(h.players.filter(player=>player.count('play')).length,0);assert.equal('fullscreen' in feed,false);
    const selected=h.players[2],iframe=selected.iframe,src=iframe.src;selected.time=37;
    iframe.frameBox={top:0,left:0,right:400,bottom:800,width:400,height:800};h.players[1].iframe.frameBox={...iframe.frameBox};
    h.document.fullscreenElement=iframe;h.document.dispatchEvent(new Event('fullscreenchange'));await tick();
    assert.equal(selected.count('play'),1);assert.equal(iframe.src,src);assert.equal(selected.time,37);
    assert.equal(h.document.querySelectorAll('iframe').length,3);assert.equal(h.document.querySelectorAll('button').length,0);
    const other=h.players[1];other.emit('onStateChange',1);assert.equal(other.iframe.parentNode.classList.contains('is-playing'),false);assert.ok(other.count('pause')>0);
    assert.equal(selected.iframe,media[2].querySelector('iframe'));assert.equal(selected.count('destroy'),0);
    h.document.fullscreenElement=null;iframe.frameBox=null;other.iframe.frameBox=null;h.document.dispatchEvent(new Event('fullscreenchange'));await tick();
    assert.ok(selected.count('pause')>0);assert.equal(selected.iframe,media[2].querySelector('iframe'));assert.equal(selected.time,37);
  }finally{await h.close();}
});

for(const prefixed of [false,true])for(const action of ['pause','remove','destroy'])test((prefixed?'WebKit':'standard')+' native fullscreen exits only the owned player on '+action,async()=>{
  const h=await harness(),feed=h.feed(),media=h.container();let exits=0;
  const property=prefixed?'webkitFullscreenElement':'fullscreenElement',event=prefixed?'webkitfullscreenchange':'fullscreenchange',exit=prefixed?'webkitExitFullscreen':'exitFullscreen';
  try{
    feed.add(h.post(1),media);await tick();const player=h.players[0];player.emit('onReady');const iframe=player.iframe;
    h.document[property]=iframe;h.document.dispatchEvent(new Event(event));await tick();
    h.document[exit]=()=>{exits++;h.document[property]=null;h.document.dispatchEvent(new Event(event));return prefixed?undefined:Promise.resolve();};
    if(action==='remove')feed.remove(1);else feed[action]();await tick();
    assert.equal(exits,1);assert.equal(h.document[property],null);assert.equal(media.querySelectorAll('button').length,0);
    if(action==='pause'){
      assert.equal(media.querySelector('iframe'),iframe);const before=player.count('play');player.emit('onStateChange',1);feed.refresh();assert.equal(player.count('play'),before);assert.equal(media.classList.contains('is-playing'),false);
    }else assert.equal(media.querySelector('iframe'),null);
    if(action==='destroy'){assert.equal(h.document.count(),0);assert.equal(h.window.count(),0);}
  }finally{await h.close();}
});

test('native fullscreen of another element is untouched and removing a different clip keeps the owned fullscreen',async()=>{
  const h=await harness(),feed=h.feed(),one=h.container(),two=h.container(1),foreign=h.container();let exits=0;
  try{
    feed.add(h.post(1),one);feed.add(h.post(2),two);await tick();h.players.forEach(player=>player.emit('onReady'));
    h.document.exitFullscreen=()=>{exits++;h.document.fullscreenElement=null;h.document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
    h.document.fullscreenElement=h.players[0].iframe;feed.remove(2);await tick();assert.equal(exits,0);assert.equal(h.document.fullscreenElement,h.players[0].iframe);
    h.document.fullscreenElement=foreign;h.document.dispatchEvent(new Event('fullscreenchange'));await tick();feed.pause();feed.destroy();await tick();assert.equal(exits,0);assert.equal(h.document.fullscreenElement,foreign);
  }finally{await h.close();}
});

test('a native fullscreen event arriving after navigation suspension is exited without restarting playback',async()=>{
  let current=true;const h=await harness(),feed=h.feed({isCurrent:()=>current}),media=h.container();let exits=0;
  try{
    feed.add(h.post(1),media);await tick();const player=h.players[0];player.emit('onReady');const plays=player.count('play');feed.pause();current=false;
    h.document.exitFullscreen=()=>{exits++;h.document.fullscreenElement=null;h.document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
    h.document.fullscreenElement=player.iframe;h.document.dispatchEvent(new Event('fullscreenchange'));await tick();
    assert.equal(exits,1);assert.equal(h.document.fullscreenElement,null);assert.equal(player.count('play'),plays);assert.equal(media.classList.contains('is-playing'),false);
  }finally{await h.close();}
});

test('the external timeline tracks official duration and time, previews a drag, and commits a clamped seek',async()=>{
  const h=await harness(),feed=h.feed(),media=h.container(),timeline=h.timeline();
  try{
    feed.add(h.post(1),media,timeline.node);assert.equal(timeline.node.hidden,true);assert.equal(timeline.range.disabled,true);
    await tick();const player=h.players[0];player.duration=125;player.time=7.9;player.emit('onReady');player.emit('onStateChange',1);
    assert.equal(timeline.node.hidden,false);assert.equal(timeline.range.disabled,false);assert.equal(timeline.range.max,'125');assert.equal(timeline.range.value,'7.9');
    assert.equal(timeline.label.textContent,'0:07 / 2:05');assert.equal(timeline.range.getAttribute('aria-valuetext'),'0:07 / 2:05');
    assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,250);
    player.time=65.2;h.progress();assert.equal(timeline.range.value,'65.2');assert.equal(timeline.label.textContent,'1:05 / 2:05');
    timeline.range.value='92';timeline.range.dispatchEvent(new Event('input'));assert.equal(player.seeks.length,0);assert.equal(timeline.label.textContent,'1:32 / 2:05');
    player.time=66;h.progress();assert.equal(timeline.range.value,'92');
    const plays=player.count('play'),pauses=player.count('pause');timeline.range.dispatchEvent(new Event('change'));
    assert.deepEqual(player.seeks,[[92,true]]);assert.equal(player.count('play'),plays);assert.equal(player.count('pause'),pauses);
    timeline.range.value='999';timeline.range.dispatchEvent(new Event('change'));assert.deepEqual(player.seeks.at(-1),[125,true]);
    timeline.range.value='-50';timeline.range.dispatchEvent(new Event('change'));assert.deepEqual(player.seeks.at(-1),[0,true]);
    for(const bad of ['NaN','Infinity','-Infinity']){timeline.range.value=bad;timeline.range.dispatchEvent(new Event('change'));}assert.equal(player.seeks.length,3);
    assert.equal(media.querySelectorAll('input').length,0);assert.equal(media.querySelectorAll('button').length,0);assert.equal(new URL(player.iframe.src).searchParams.get('controls'),'0');
  }finally{await h.close();}
});

test('manual pause keeps seeking available without replaying, while suspension, music and detachment stop progress and seeks',async()=>{
  const h=await harness(),feed=h.feed(),media=h.container(),timeline=h.timeline();
  const seek=value=>{timeline.range.value=String(value);timeline.range.dispatchEvent(new Event('change'));};
  try{
    feed.add(h.post(1),media,timeline.node);await tick();const player=h.players[0];player.emit('onReady');player.emit('onStateChange',1);
    player.emit('onStateChange',2);assert.equal(h.timers.size,0);assert.equal(timeline.node.hidden,false);
    const plays=player.count('play'),pauses=player.count('pause');seek(33);assert.deepEqual(player.seeks,[[33,true]]);assert.equal(player.count('play'),plays);assert.equal(player.count('pause'),pauses+1);assert.equal(h.timers.size,0);
    player.emit('onStateChange',1);assert.equal(h.timers.size,1);feed.pause();assert.equal(h.timers.size,0);assert.equal(timeline.node.hidden,true);assert.equal(timeline.range.disabled,true);seek(44);assert.equal(player.seeks.length,1);
    feed.resume();player.emit('onStateChange',1);assert.equal(h.timers.size,1);
    h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.timers.size,0);seek(45);assert.equal(player.seeks.length,1);
    h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));player.emit('onStateChange',1);
    const music=new Event('wc:music');music.detail={playing:true};h.window.dispatchEvent(music);assert.equal(h.timers.size,0);assert.equal(timeline.range.disabled,true);seek(46);assert.equal(player.seeks.length,1);
    player.emit('onStateChange',2);player.emit('onStateChange',1);assert.equal(h.timers.size,1);assert.equal(timeline.node.hidden,false);
    media.remove();h.progress();assert.equal(h.timers.size,0);assert.equal(timeline.range.disabled,true);seek(47);assert.equal(player.seeks.length,1);
  }finally{await h.close();}
});

test('unknown, nonfinite and failing durations stay hidden until valid metadata arrives and errors stop the timeline',async()=>{
  const h=await harness(),feed=h.feed(),media=h.container(),timeline=h.timeline();
  try{
    feed.add(h.post(1),media,timeline.node);await tick();const player=h.players[0];player.duration=0;player.emit('onReady');player.emit('onStateChange',1);
    assert.equal(timeline.node.hidden,true);assert.equal(timeline.range.disabled,true);assert.equal(h.timers.size,1);
    for(const value of [NaN,Infinity,-1,undefined]){player.duration=value;h.progress();timeline.range.value='10';timeline.range.dispatchEvent(new Event('change'));assert.equal(timeline.node.hidden,true);assert.equal(player.seeks.length,0);}
    player.getDuration=()=>{throw Error('Not ready');};h.progress();assert.equal(timeline.node.hidden,true);
    player.getDuration=()=>61;player.getCurrentTime=()=>{throw Error('Not ready');};h.progress();assert.equal(timeline.node.hidden,false);assert.equal(timeline.label.textContent,'0:00 / 1:01');
    player.emit('onError',150);assert.equal(timeline.node.hidden,true);assert.equal(timeline.range.disabled,true);assert.equal(h.timers.size,0);
    timeline.range.value='20';timeline.range.dispatchEvent(new Event('change'));assert.equal(player.seeks.length,0);
  }finally{await h.close();}
});

test('many warm clips share one active progress timer and inactive, replaced or removed timelines cannot seek',async()=>{
  const h=await harness(),feed=h.feed(),media=[],timelines=[];
  try{
    for(let i=0;i<20;i++){media.push(h.container(i));timelines.push(h.timeline());feed.add(h.post(i),media[i],timelines[i].node);}await tick();h.players.forEach(player=>player.emit('onReady'));
    const first=h.players[0];first.emit('onStateChange',1);assert.equal(h.document.querySelectorAll('iframe').length,3);assert.equal(h.timers.size,1);
    assert.equal(timelines.filter(timeline=>!timeline.node.hidden).length,1);
    timelines[1].range.value='30';timelines[1].range.dispatchEvent(new Event('change'));assert.equal(h.players[1].seeks.length,0);
    const old=timelines[0],replacement=h.timeline();feed.add(h.post(0),media[0],replacement.node);assert.equal(old.node.hidden,true);assert.equal(old.range.count(),0);
    old.range.value='30';old.range.dispatchEvent(new Event('change'));assert.equal(first.seeks.length,0);assert.equal(h.timers.size,1);
    for(const node of media)node.box={...node.box,top:(node.index-10)*800,bottom:(node.index-9)*800};feed.refresh();await tick();h.players.slice(3).forEach(player=>player.emit('onReady'));
    assert.equal(h.document.querySelectorAll('iframe').length,3);assert.equal(h.timers.size,1);assert.equal(replacement.range.disabled,true);
    replacement.range.value='30';replacement.range.dispatchEvent(new Event('change'));assert.equal(first.seeks.length,0);
    const selected=h.players.slice(3).find(player=>player.count('play'));selected.emit('onStateChange',1);feed.remove(10);assert.equal(h.timers.size,0);assert.equal(timelines[10].range.count(),0);assert.equal(timelines[10].range.disabled,true);
    feed.destroy();assert.equal(h.timers.size,0);assert.ok(timelines.every(timeline=>timeline.range.count()===0));assert.equal(replacement.range.count(),0);
  }finally{await h.close();}
});

test('blocked autoplay clears progress polling and a detached timeline never issues a seek',async()=>{
  const h=await harness(),feed=h.feed(),media=h.container(),timeline=h.timeline();
  try{
    feed.add(h.post(1),media,timeline.node);await tick();const player=h.players[0];player.emit('onReady');assert.equal(h.timers.size,1);
    player.emit('onAutoplayBlocked');assert.equal(h.timers.size,0);assert.equal(timeline.node.hidden,false);
    player.emit('onStateChange',1);assert.equal(h.timers.size,1);timeline.node.remove();h.progress();assert.equal(h.timers.size,0);
    timeline.range.value='30';timeline.range.dispatchEvent(new Event('change'));assert.equal(player.seeks.length,0);feed.destroy();assert.equal(timeline.range.count(),0);
  }finally{await h.close();}
});
