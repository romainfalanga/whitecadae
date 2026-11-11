// Stream video is rendered by our own HTML video element. The player never
// starts from scroll, readiness, navigation restoration, or a comment action.
let hlsModule;
function loadHls(){return hlsModule||(hlsModule=import('./vendor/hls.mjs').catch(error=>{hlsModule=null;throw error;}));}
const glyph={play:'<path d="M8 5 20 12 8 19Z"/>',fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>'};
export function validStreamURL(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(/^(?:customer-[a-z0-9-]+\.)?cloudflarestream\.com$/.test(u.hostname)||u.hostname==='videodelivery.net')?u.href:null;}catch{return null;}
}
export function createStreamPlayer({container,post,getPlayback,isEligible=()=>true,onReady=()=>{},onState=()=>{},loadLibrary=loadHls,fullscreen:withFullscreen=true}={}){
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
  const listeners=[];
  function listen(target,type,callback){target.addEventListener(type,callback);listeners.push(()=>target.removeEventListener(type,callback));}
  function paint(){element.classList.toggle('is-playing',state===1);play.hidden=state===1;play.setAttribute('aria-label',failed?'Réessayer la lecture':state===0?'Relire la vidéo':'Lire la vidéo');}
  function change(next){state=next;paint();onState(next);}
  function error(text){if(destroyed)return;failed=true;play.disabled=false;message.textContent=text;change(2);}
  function releaseSource(){hls?.destroy();hls=null;video.removeAttribute('src');video.load();}
  async function prepare(index=partIndex){
    if(preparing)return preparing;
    const version=++requestVersion;
    preparing=(async()=>{
      play.disabled=true;message.textContent='Chargement…';failed=false;
      const data=await (parts?getPlayback(post.id,index):getPlayback(post.id));if(destroyed||version!==requestVersion)return;
      if(Array.isArray(data.parts)&&data.parts.length){parts=data.parts.map(part=>({duration:Number(part.duration)>0?Number(part.duration):0}));partIndex=Number.isSafeInteger(data.part)&&data.part>=0&&data.part<parts.length?data.part:Math.min(index,parts.length-1);}
      const source=validStreamURL(data.hls),poster=validStreamURL(data.poster);
      if(!source||!poster)throw Error('Source vidéo indisponible.');
      expires=Date.parse(data.expiresAt)||Date.now()+30*60*1000;video.poster=poster;
      if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=source;
      else{
        const module=await loadLibrary();if(destroyed||version!==requestVersion)return;
        const Hls=module.default||module.Hls;if(!Hls?.isSupported())throw Error('Ce navigateur ne peut pas lire cette vidéo.');
        hls=new Hls({enableWorker:false,autoStartLoad:false,maxBufferLength:15,maxMaxBufferLength:30,backBufferLength:15});
        hls.on(Hls.Events.ERROR,(_event,data)=>{if(!destroyed&&data.fatal){pause();error('Lecture interrompue. Réessaie.');}});
        hls.attachMedia(video);hls.loadSource(source);
      }
      if(destroyed)return;
      play.disabled=false;message.textContent='';onReady();
    })().catch(e=>{if(!destroyed){if(e.name==='AbortError')return;error(e.status===401||e.status===403?'Reconnecte-toi pour regarder cette vidéo.':'La vidéo ne se charge pas. Réessaie.');}}).finally(()=>{preparing=null;});
    return preparing;
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
    if(failed||expires<=Date.now()+30000){releaseSource();await prepare();}
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
        if(Number.isFinite(video.duration)){video.currentTime=Math.min(video.duration,at);if(state===1)hls?.startLoad(-1);}
        return;
      }
      if(Number.isFinite(video.duration)){video.currentTime=Math.min(video.duration,Math.max(0,value));if(state===1)hls?.startLoad(-1);}
    },
    // The parts of a sériographie (null for a single video) and the move to the next one.
    getParts:()=>parts?{durations:lengths(),index:partIndex}:null,
    next:()=>parts&&partIndex<parts.length-1?switchTo(partIndex+1,0,state===1):Promise.resolve(false),
    isFullscreen:()=>!!video.webkitDisplayingFullscreen,
    destroy(){if(destroyed)return;destroyed=true;sequence++;requestVersion++;for(const off of listeners)off();video.pause();if(video.webkitDisplayingFullscreen)video.webkitExitFullscreen?.();releaseSource();element.remove();}
  };
}
