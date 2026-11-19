// Stream video is rendered by our own HTML video element. The player never
// starts from scroll, readiness, navigation restoration, or a comment action.
let hlsModule;
function loadHls(){
  return hlsModule||(hlsModule=Promise.all([import('./vendor/hls.mjs'),import('./stream-edit-delay.js')])
    .then(([hls,delay])=>({default:hls.default||hls.Hls,editDelayLoader:delay.editDelayLoader}))
    .catch(error=>{hlsModule=null;throw error;}));
}
// Safari (iPhone, iPad, Mac) plays HLS itself, edit lists included. Elsewhere
// the browser's own HLS support is recent: it ignores a delayed sound track and
// always starts at the highest quality, so the site's player is used instead.
const appleDevice=()=>/Apple/.test(globalThis.navigator?.vendor||'');
// Quality follows the size of the player on screen, at most one and a half times its pixels:
// a phone never downloads 1080p for a frame a few hundred pixels wide.
const HLS_CONFIG={enableWorker:false,autoStartLoad:false,maxBufferLength:15,maxMaxBufferLength:30,backBufferLength:15,capLevelToPlayerSize:true,maxDevicePixelRatio:1.5,abrEwmaDefaultEstimate:1_200_000};
const glyph={play:'<path d="M8 5 20 12 8 19Z"/>',fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>'};
export function validStreamURL(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(/^(?:customer-[a-z0-9-]+\.)?cloudflarestream\.com$/.test(u.hostname)||u.hostname==='videodelivery.net')?u.href:null;}catch{return null;}
}
// Signed playback answers are reused until shortly before they expire: a
// cover, a player and a return to the same reel then ask the server once.
// `fresh` skips the reuse after the video service refused an address.
export function cachedPlayback(fetch,{margin=120000}={}){
  const store=new Map();
  const get=(id,part=null,{fresh=false}={})=>{
    const key=String(id)+':'+(part??''),hit=store.get(key);
    if(!fresh&&hit){if(hit.pending)return hit.pending;if(Date.parse(hit.value?.expiresAt)-Date.now()>margin)return Promise.resolve(hit.value);}
    const pending=Promise.resolve().then(()=>part===null?fetch(id):fetch(id,part)).then(value=>{if(store.get(key)?.pending===pending)store.set(key,{value});return value;},error=>{if(store.get(key)?.pending===pending)store.delete(key);throw error;});
    store.set(key,{pending});return pending;
  };
  get.cached=true;
  get.prime=(id,value,part=null)=>{if(value?.hls&&value?.expiresAt)store.set(String(id)+':'+(part??''),{value});};
  get.clear=()=>store.clear();
  return get;
}
export function createStreamPlayer({container,post,getPlayback,isEligible=()=>true,onReady=()=>{},onState=()=>{},loadLibrary=loadHls,preferNative=appleDevice(),fullscreen:withFullscreen=true}={}){
  const element=document.createElement('div');element.className='loge-stream-frame';
  const video=document.createElement('video');video.className='loge-stream-video';video.playsInline=true;video.setAttribute('playsinline','');video.preload='metadata';video.controls=false;video.autoplay=false;video.muted=false;video.setAttribute('aria-label','Vidéo : '+(post.title||''));
  const play=document.createElement('button');play.type='button';play.className='loge-stream-play';play.setAttribute('aria-label','Lire la vidéo');play.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+glyph.play+'</svg>';
  const full=document.createElement('button');full.type='button';full.className='loge-stream-fullscreen';full.setAttribute('aria-label','Afficher en plein écran');full.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+glyph.fullscreen+'</svg>';
  const message=document.createElement('span');message.className='loge-stream-message';message.setAttribute('role','status');message.textContent='Chargement…';
  // Neither the Loge reels nor the videography show a fullscreen button.
  element.append(video,play,...(withFullscreen?[full]:[]),message);container.append(element);play.disabled=true;
  let destroyed=false,hls=null,preparing=null,expires=0,sequence=0,state=-1,failed=false,requestVersion=0;
  // A published sériographie arrives as ordered parts that play as one video.
  let parts=null,partIndex=0,pendingSeek=0;
  // Warm-up waits for the manifest; recovery is tried once per source.
  let manifestReady=false,wantWarm=false,warmed=false,preparingIndex=null,lastRefresh=0,prefetched=-1;
  const listeners=[];
  function listen(target,type,callback){target.addEventListener(type,callback);listeners.push(()=>target.removeEventListener(type,callback));}
  function paint(){element.classList.toggle('is-playing',state===1);play.hidden=state===1;play.setAttribute('aria-label',failed?'Réessayer la lecture':state===0?'Relire la vidéo':'Lire la vidéo');}
  function change(next){state=next;paint();onState(next);}
  function error(text){if(destroyed)return;failed=true;play.disabled=false;message.textContent=text;change(2);}
  function releaseSource(){hls?.destroy();hls=null;video.removeAttribute('src');video.load();}
  async function prepare(index=partIndex,{fresh=false}={}){
    // A request for the same part is shared; another part replaces it.
    if(preparing&&preparingIndex===index&&!fresh)return preparing;
    const version=++requestVersion;preparingIndex=index;
    const current=(async()=>{
      play.disabled=true;message.textContent='Chargement…';failed=false;manifestReady=false;warmed=false;
      const options=fresh?[{fresh:true}]:[];
      const data=await (parts?getPlayback(post.id,index,...options):getPlayback.cached?getPlayback(post.id,null,...options):getPlayback(post.id));if(destroyed||version!==requestVersion)return;
      if(Array.isArray(data.parts)&&data.parts.length){parts=data.parts.map(part=>({duration:Number(part.duration)>0?Number(part.duration):0}));partIndex=Number.isSafeInteger(data.part)&&data.part>=0&&data.part<parts.length?data.part:Math.min(index,parts.length-1);}
      const source=validStreamURL(data.hls),poster=validStreamURL(data.poster);
      if(!source||!poster)throw Error('Source vidéo indisponible.');
      expires=Date.parse(data.expiresAt)||Date.now()+30*60*1000;video.poster=poster;
      const nativeHls=!!video.canPlayType('application/vnd.apple.mpegurl');
      let Hls=null,module=null;
      if(!(nativeHls&&preferNative)){
        try{module=await loadLibrary();}catch(cause){if(!nativeHls)throw cause;}
        if(destroyed||version!==requestVersion)return;
        Hls=module&&(module.default||module.Hls);if(!Hls?.isSupported?.())Hls=null;
      }
      if(Hls){
        const delay=module.editDelayLoader&&Hls.DefaultConfig?.loader?{fLoader:module.editDelayLoader(Hls.DefaultConfig.loader)}:{};
        hls=new Hls({...HLS_CONFIG,...delay});
        const instance=hls,tried={media:false,network:false};
        hls.on(Hls.Events.ERROR,(_event,data)=>{
          if(destroyed||hls!==instance||!data?.fatal)return;
          const code=data.response?.code,types=Hls.ErrorTypes||{},network=!!data.type&&data.type===types.NETWORK_ERROR,media=!!data.type&&data.type===types.MEDIA_ERROR;
          // An expired or refused address: ask for a fresh one and carry on.
          if(network&&(code===401||code===403||expires<=Date.now()+60000)){void refresh();return;}
          // One quiet retry for a dropped connection or a decoding hiccup.
          if(network&&!tried.network){tried.network=true;instance.startLoad(video.currentTime||-1);return;}
          if(media&&!tried.media&&typeof instance.recoverMediaError==='function'){tried.media=true;instance.recoverMediaError();return;}
          pause();error('Lecture interrompue. Réessaie.');
        });
        warmUp(hls,Hls);
        hls.attachMedia(video);hls.loadSource(source);
      }else if(nativeHls)video.src=source;
      else throw Error('Ce navigateur ne peut pas lire cette vidéo.');
      if(destroyed)return;
      play.disabled=false;message.textContent='';onReady();
    })().catch(e=>{
      if(destroyed||version!==requestVersion)return;
      // An interrupted request leaves the player ready to try again on a tap.
      if(e.name==='AbortError'){failed=true;play.disabled=false;message.textContent='';paint();return;}
      error(e.status===401||e.status===403?'Reconnecte-toi pour regarder cette vidéo.':'La vidéo ne se charge pas. Réessaie.');
    }).finally(()=>{if(preparing===current){preparing=null;preparingIndex=null;}});
    preparing=current;
    return current;
  }
  // The video on screen fetches its first seconds ahead of a tap, then waits:
  // pressing play starts at once. Nothing more loads until the member plays.
  // The feed also warms a reel when it becomes the one on screen.
  let warmEvents=null;
  function warmUp(instance,Hls){
    if(!Hls.Events?.MANIFEST_PARSED||!Hls.Events.FRAG_BUFFERED||typeof instance.once!=='function')return;
    warmEvents=Hls.Events;
    instance.once(Hls.Events.MANIFEST_PARSED,()=>{
      if(destroyed||hls!==instance)return;
      manifestReady=true;
      if(wantWarm||isEligible())warm();
    });
  }
  function warm(){
    if(!hls||!warmEvents)return;
    if(!manifestReady){wantWarm=true;return;}
    if(destroyed||warmed||state===1||!video.paused||video.currentTime>0)return;
    warmed=true;wantWarm=false;
    const instance=hls,kinds=new Set(),wanted=instance.audioTracks?.length?2:1;
    const buffered=(_event,data)=>{
      kinds.add(data?.frag?.type);
      if(kinds.size<wanted)return;
      instance.off?.(warmEvents.FRAG_BUFFERED,buffered);
      if(hls===instance&&state!==1&&video.paused)instance.stopLoad();
    };
    instance.on(warmEvents.FRAG_BUFFERED,buffered);
    instance.startLoad(pendingSeek>0?pendingSeek:-1);
  }
  // A new signed address, keeping the position and whether it was playing.
  async function refresh(){
    if(destroyed)return;
    if(Date.now()-lastRefresh<20000){pause();error('Lecture interrompue. Réessaie.');return;}
    lastRefresh=Date.now();
    const resume=state===1,at=video.ended?0:video.currentTime||0,attempt=++sequence;
    if(!video.paused)video.pause();
    releaseSource();pendingSeek=at;
    await prepare(partIndex,{fresh:true});
    if(destroyed||attempt!==sequence||failed)return;
    if(resume&&isEligible()){
      hls?.startLoad(at>0?at:-1);
      try{await video.play();}catch(e){if(e.name!=='AbortError'&&!destroyed){hls?.stopLoad();change(2);}}
    }
  }
  function pause(){sequence++;if(!video.paused)video.pause();hls?.stopLoad();if(state===1)change(2);}
  const lengths=()=>parts.map((part,index)=>part.duration||(index===partIndex&&Number.isFinite(video.duration)?video.duration:0));
  const offset=index=>lengths().slice(0,index).reduce((sum,value)=>sum+value,0);
  // Moving to another part keeps playing only when the series was playing.
  async function switchTo(index,at=0,resume=state===1){
    if(destroyed||!parts||index<0||index>=parts.length)return false;
    const attempt=++sequence;if(!video.paused)video.pause();hls?.stopLoad();
    releaseSource();partIndex=index;pendingSeek=Math.max(0,at);
    await prepare(index);
    if(destroyed||attempt!==sequence||failed)return false;
    onReady();
    if(resume&&isEligible()){
      hls?.startLoad(pendingSeek>0?pendingSeek:-1);
      try{await video.play();if(destroyed||attempt!==sequence||!isEligible())pause();}catch(e){if(e.name!=='AbortError'&&!destroyed){hls?.stopLoad();change(2);}}
    }else if(pendingSeek>0)hls?.startLoad(pendingSeek);
    return true;
  }
  async function start(){
    if(destroyed||!isEligible())return;
    if(state===1){pause();return;}
    const attempt=++sequence;
    if(failed||expires<=Date.now()+30000){if(!video.ended&&video.currentTime>0)pendingSeek=video.currentTime;releaseSource();await prepare(partIndex,{fresh:expires<=Date.now()+30000});}
    if(destroyed||attempt!==sequence||failed||!isEligible())return;
    // The end of the last part restarts the series from its first video.
    if(video.ended&&parts&&partIndex===parts.length-1&&parts.length>1){await switchTo(0,0,true);return;}
    if(video.ended)video.currentTime=0;
    message.textContent='';hls?.startLoad(-1);
    try{await video.play();if(destroyed||attempt!==sequence||!isEligible())pause();}
    catch(e){if(destroyed||attempt!==sequence)return;if(e.name!=='AbortError'){hls?.stopLoad();message.textContent=e.name==='NotAllowedError'?'Appuie pour lancer la vidéo.':'Lecture impossible. Réessaie.';failed=e.name!=='NotAllowedError';change(2);}}
  }
  async function fullscreen(){
    if(destroyed)return;
    const target=container.closest?.('.loge-reel-stage')||element;
    try{
      if(document.fullscreenElement||document.webkitFullscreenElement){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document);}
      else if(target.requestFullscreen)await target.requestFullscreen();
      else if(target.webkitRequestFullscreen)await target.webkitRequestFullscreen();
      else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();
      else message.textContent='Le plein écran n’est pas disponible sur ce navigateur.';
    }catch{message.textContent='Le plein écran n’est pas disponible pour le moment.';}
  }
  listen(play,'click',start);listen(video,'click',start);listen(full,'click',fullscreen);
  listen(video,'play',()=>{if(!isEligible()){pause();return;}message.textContent='';change(1);});
  listen(video,'pause',()=>{if(!destroyed){hls?.stopLoad();change(2);}});
  listen(video,'ended',()=>{hls?.stopLoad();if(parts&&partIndex<parts.length-1){void switchTo(partIndex+1,0,true);return;}change(0);});
  listen(video,'loadedmetadata',()=>{if(destroyed)return;if(pendingSeek>0&&Number.isFinite(video.duration)){video.currentTime=Math.min(video.duration,pendingSeek);pendingSeek=0;}onReady();});
  listen(video,'error',()=>{if(!destroyed&&video.getAttribute('src'))error('Lecture interrompue. Réessaie.');});
  // The next part of a sériographie is signed a few seconds before it is needed.
  listen(video,'timeupdate',()=>{
    if(destroyed||!parts||!getPlayback.cached||partIndex>=parts.length-1||prefetched===partIndex+1)return;
    if(Number.isFinite(video.duration)&&video.duration-video.currentTime<10){prefetched=partIndex+1;getPlayback(post.id,partIndex+1).catch(()=>{});}
  });
  listen(video,'waiting',()=>{if(!destroyed&&state===1)message.textContent='Chargement…';});
  listen(video,'playing',()=>{if(!destroyed)message.textContent='';});
  listen(video,'keydown',event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();void start();}});video.tabIndex=0;
  void prepare();
  return {
    element,video,
    getDuration:()=>parts?lengths().reduce((sum,value)=>sum+value,0):Number.isFinite(video.duration)?video.duration:0,
    getCurrentTime:()=>parts?offset(partIndex)+(video.currentTime||0):video.currentTime||0,
    getPlayerState:()=>state,
    pauseVideo:pause,
    seekTo(value){
      if(parts){
        const all=lengths();let index=0,start=0,target=Math.max(0,value);
        while(index<all.length-1&&target>=start+all[index]){start+=all[index];index++;}
        const at=Math.max(0,target-start);
        if(index!==partIndex){void switchTo(index,at,state===1);return;}
        if(Number.isFinite(video.duration))video.currentTime=Math.min(video.duration,at);
        return;
      }
      // hls.js follows a seek by itself while it is loading.
      if(Number.isFinite(video.duration))video.currentTime=Math.min(video.duration,Math.max(0,value));
    },
    // The parts of a sériographie (null for a single video) and the move to the next one.
    getParts:()=>parts?{durations:lengths(),index:partIndex}:null,
    next:()=>parts&&partIndex<parts.length-1?switchTo(partIndex+1,0,state===1):Promise.resolve(false),
    isFullscreen:()=>!!video.webkitDisplayingFullscreen,
    warm,
    destroy(){if(destroyed)return;destroyed=true;sequence++;requestVersion++;for(const off of listeners)off();video.pause();if(video.webkitDisplayingFullscreen)video.webkitExitFullscreen?.();releaseSource();element.remove();}
  };
}
