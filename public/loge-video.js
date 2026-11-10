import {createStreamPlayer} from './loge-stream-player.js';
import {youtubeId} from './youtube-video.js';

let apiPromise=null,frameSequence=0;
function youtubeAPI(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  const pending=new Promise((resolve,reject)=>{
    const previous=window.onYouTubeIframeAPIReady;
    let timer,script,settled=false;
    const cleanup=()=>{
      clearTimeout(timer);script?.removeEventListener('error',failed);
      if(window.onYouTubeIframeAPIReady===ready)window.onYouTubeIframeAPIReady=previous;
    };
    const failed=()=>{if(settled)return;settled=true;cleanup();script?.remove();reject(Error('Le lecteur vidéo est indisponible.'));};
    const ready=()=>{
      if(settled)return;
      try{if(typeof previous==='function')previous();}catch{/* Another embed must not break this feed. */}
      if(!window.YT?.Player){failed();return;}
      settled=true;cleanup();resolve(window.YT);
    };
    window.onYouTubeIframeAPIReady=ready;
    script=document.querySelector('script[data-loge-youtube-api]');
    if(!script){
      script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';
      script.async=true;script.setAttribute('data-loge-youtube-api','');
      script.addEventListener('error',failed,{once:true});
      timer=setTimeout(failed,20000);document.head.append(script);
    }else{script.addEventListener('error',failed,{once:true});timer=setTimeout(failed,20000);}
  });
  apiPromise=pending;
  // A later visit can retry a failed load. Do not automatically retry every
  // failed player in the current view or leave a rejected promise cached.
  void pending.catch(()=>{if(apiPromise===pending)apiPromise=null;});
  return pending;
}

// Keep YouTube's native controls hidden; the optional external timeline uses
// only the official time, duration and seek APIs and never covers the iframe.
// Videos start only through the native player after a deliberate user action.
export function createLogeVideoFeed({root=null,isCurrent=()=>true,onError=()=>{},getPlayback}={}){
  const records=new Map();let active=null,destroyed=false,paused=false,musicClip=null,musicPlaying=false,nativeExitPending=null,progressTimer=null;
  const connected=record=>record.container.isConnected!==false;
  const current=()=>{try{return !destroyed&&!paused&&isCurrent()&&!document.hidden;}catch{return false;}};
  const eligible=record=>current()&&record===active&&connected(record)&&measureRecord(record,viewport()).ratio>0.5;
  const invoke=(record,method)=>{try{return record.player?.[method]?.();}catch{return undefined;}};
  const clock=seconds=>{const value=Math.floor(Math.max(0,seconds));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');};
  const timelineEligible=record=>record.ready&&!record.failed&&record.timeline?.isConnected!==false&&eligible(record)&&!(musicClip===record.key&&!record.playing);
  function duration(record){const value=invoke(record,'getDuration');return Number.isFinite(value)&&value>0?value:0;}
  function paintTimeline(record,time,length){
    const value=Math.min(length,Math.max(0,Number.isFinite(time)?time:0)),description=clock(value)+' / '+clock(length);
    record.range.max=String(length);record.range.value=String(value);record.range.setAttribute('aria-valuetext',description);
    if(record.timeLabel)record.timeLabel.textContent=description;
  }
  function syncTimeline(record){
    if(!record.range)return;
    const length=timelineEligible(record)?duration(record):0;
    record.timeline.hidden=!length;record.range.disabled=!length;
    if(!length){record.scrubbing=false;paintTimeline(record,0,0);return;}
    if(!record.scrubbing)paintTimeline(record,invoke(record,'getCurrentTime'),length);
  }
  function clearProgress(){if(progressTimer!==null){clearInterval(progressTimer);progressTimer=null;}}
  function trackProgress(){
    const record=active;
    if(!record?.range||!timelineEligible(record)||record.blocked||!(record.playing)){clearProgress();return;}
    if(progressTimer===null)progressTimer=setInterval(()=>{
      const latest=active;
      if(!latest?.range||!timelineEligible(latest)||latest.blocked||!(latest.playing)){clearProgress();if(latest)syncTimeline(latest);return;}
      syncTimeline(latest);
    },250);
  }
  function refreshTimelines(){for(const record of records.values())syncTimeline(record);trackProgress();}
  function attachTimeline(record,timeline){
    record.range?.removeEventListener('input',record.previewSeek);record.range?.removeEventListener('change',record.commitSeek);
    if(record.timeline){record.timeline.hidden=true;if(record.range)record.range.disabled=true;}
    record.timeline=timeline;record.range=timeline?.querySelector('input[type="range"]');record.timeLabel=timeline?.querySelector('[data-video-time]');record.scrubbing=false;
    if(!record.range)return;
    const seekValue=()=>{
      if(records.get(record.key)!==record||!timelineEligible(record))return null;
      const length=duration(record),value=Number(record.range.value);
      return length&&Number.isFinite(value)?{value:Math.min(length,Math.max(0,value)),length}:null;
    };
    record.previewSeek=()=>{const seek=seekValue();if(!seek){syncTimeline(record);return;}record.scrubbing=true;paintTimeline(record,seek.value,seek.length);};
    record.commitSeek=()=>{
      const seek=seekValue();record.scrubbing=false;
      if(!seek){syncTimeline(record);return;}
      const playing=invoke(record,'getPlayerState')===1&&record.playing;
      try{record.player.seekTo(seek.value,true);if(!playing)record.player.pauseVideo();}catch{/* A stale or unavailable API must not restart playback. */}
      paintTimeline(record,seek.value,seek.length);
    };
    record.range.addEventListener('input',record.previewSeek);record.range.addEventListener('change',record.commitSeek);syncTimeline(record);
  }
  function fullscreenRecord(){
    const element=document.fullscreenElement||document.webkitFullscreenElement;
    return [...records.values()].find(record=>element&&(record.iframe===element||record.stream&&record.container.closest?.('.loge-reel-stage')===element)||record.stream&&record.player?.isFullscreen?.())||null;
  }
  function exitOwnedFullscreen(record=null){
    const owner=fullscreenRecord();
    if(!owner||(record&&record!==owner)||nativeExitPending===owner.iframe)return;
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    if(!exit)return;
    const iframe=owner.iframe;nativeExitPending=iframe;
    try{void Promise.resolve(exit.call(document)).catch(()=>{}).finally(()=>{if(nativeExitPending===iframe)nativeExitPending=null;});}
    catch{nativeExitPending=null;}
  }
  function fullscreenChanged(){
    // Let native layout settle, and avoid re-entering release() if exitFullscreen
    // dispatches its event synchronously while a player is being removed.
    queueMicrotask(()=>{if(!destroyed)refresh();});
  }
  function stop(record){invoke(record,'pauseVideo');record.playing=false;record.container.classList.remove('is-playing');syncTimeline(record);if(record===active)clearProgress();}
  function stopOthers(record){for(const other of records.values())if(other!==record)stop(other);}
  function release(record){
    exitOwnedFullscreen(record);
    record.token++;stop(record);observer?.unobserve(record.observed||record.container);
    try{record.player?.destroy?.();}catch{/* Removing the iframe still stops playback. */}
    record.player=null;record.ready=false;record.musicPauseConfirmed=false;record.state=null;
    record.iframe?.remove();record.iframe=null;
    syncTimeline(record);
    observe(record);
  }
  function unavailable(record,error){
    if(destroyed||!records.has(record.key))return;
    release(record);record.failed=true;
    if(!record.label){record.label=document.createElement('p');record.label.className='loge-video-unavailable';record.label.textContent='Vidéo indisponible.';record.container.append(record.label);}
    try{onError(error,record.post);}catch{/* Presentation errors cannot revive playback. */}
  }
  function warmStream(record){
    const token=++record.token;
    const live=()=>!destroyed&&records.get(record.key)===record&&record.token===token;
    const player=createStreamPlayer({container:record.container,post:record.post,getPlayback,
      isEligible:()=>live()&&eligible(record),
      onReady:()=>{if(!live())return;record.ready=true;refresh();},
      onState:state=>{
        if(!live())return;
        record.state=state;
        if(state===1){
          if(!eligible(record)){stop(record);return;}
          stopOthers(record);window.WCPlayer?.pause();record.playing=true;record.blocked=false;record.container.classList.add('is-playing');
        }else{record.playing=false;record.container.classList.remove('is-playing');if(state===2&&musicClip===record.key)record.musicPauseConfirmed=true;}
        refreshTimelines();
      }
    });
    record.player=player;record.iframe=player.element;observe(record);
  }
  function warm(record){
    if(record.iframe||record.failed||!connected(record))return;
    if(record.stream){warmStream(record);return;}
    const token=++record.token,iframe=document.createElement('iframe');
    const src=new URL('https://www.youtube-nocookie.com/embed/'+record.video);
    for(const [key,value]of Object.entries({enablejsapi:'1',origin:location.origin,playsinline:'1',autoplay:'0',mute:'0',controls:'0',disablekb:'0',fs:'1',rel:'0'}))src.searchParams.set(key,value);
    iframe.id='loge-youtube-'+(++frameSequence)+'-'+record.key;iframe.className='loge-reel-frame';
    iframe.src=src.href;iframe.title='Vidéo : '+(record.post.title||'');
    iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen','');iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    record.iframe=iframe;record.blocked=false;record.container.append(iframe);observe(record);
    const live=()=>!destroyed&&records.get(record.key)===record&&record.token===token&&record.iframe===iframe;
    youtubeAPI().then(YT=>{
      if(!live())return;
      record.player=new YT.Player(iframe, {events:{
        onReady:event=>{
          if(!live()){try{event.target.pauseVideo();event.target.destroy();}catch{}return;}
          record.player=event.target;record.ready=true;
          // Loading can change layout or finish after the user has scrolled.
          // Re-select using the iframe itself; readiness never starts playback.
          refresh();if(!eligible(record))stop(record);
        },
        onStateChange:event=>{
          if(!live())return;
          record.state=event.data;
          if(event.data===1){
            // The site never requests playback. A
            // PLAYING event after the requested PAUSED state can therefore
            // resume native playback; an earlier in-flight event is stopped.
            if(!eligible(record)||(musicClip===record.key&&!record.musicPauseConfirmed)){stop(record);return;}
            stopOthers(record);window.WCPlayer?.pause();record.blocked=false;record.playing=true;record.container.classList.add('is-playing');
          }else if(event.data===0||event.data===2){
            record.playing=false;record.container.classList.remove('is-playing');
            if(event.data===2&&musicClip===record.key)record.musicPauseConfirmed=true;
          }
          refreshTimelines();
        },
        onAutoplayBlocked:()=>{
          if(!live())return;
          // No muted fallback or automatic retry: leave the native iframe
          // available for a real user gesture after the browser's refusal.
          record.blocked=true;
          refreshTimelines();
        },
        onError:event=>{if(live())unavailable(record,Error('Vidéo indisponible ('+event.data+').'));}
      }});
    }).catch(error=>{if(live())unavailable(record,error);});
  }
  function ordered(){
    return [...records.values()].sort((a,b)=>{
      const position=a.container.compareDocumentPosition?.(b.container)||0;
      return position&4?-1:position&2?1:0;
    });
  }
  function reconcile(){
    if(!current()){for(const record of records.values())stop(record);return;}
    const list=ordered().filter(connected);
    // Cached views can be detached briefly while their DOM is restored. Keep
    // their bounded warm players, but never start one in the detached tree.
    if(!list.length){for(const record of records.values())stop(record);return;}
    const visible=list.filter(record=>record.ratio>0.5&&!record.failed).sort((a,b)=>b.ratio-a.ratio||(a===active?-1:b===active?1:0));
    const next=visible[0]||null;
    if(next!==active){
      if(active)stop(active);active=next;musicClip=null;
      if(active)active.blocked=false;
    }
    // Keep at most the current/nearest player and two adjacent players warm.
    const anchor=fullscreenRecord()||active||list.filter(record=>!record.failed).sort((a,b)=>b.ratio-a.ratio||a.distance-b.distance)[0];
    const index=list.indexOf(anchor),start=Math.max(0,Math.min(index-1,list.length-3));
    const keep=new Set(index<0?[]:list.slice(start,start+3));
    for(const record of records.values())if(!keep.has(record)&&record.iframe)release(record);
    for(const record of keep)warm(record);
  }
  function viewport(){
    const screen={top:0,left:0,right:window.innerWidth,bottom:window.innerHeight};
    if(fullscreenRecord())return screen;
    const box=root?.getBoundingClientRect?.();
    return box?{top:Math.max(0,box.top),left:Math.max(0,box.left),right:Math.min(screen.right,box.right),bottom:Math.min(screen.bottom,box.bottom)}:screen;
  }
  function measureRecord(record,viewport){
    const full=fullscreenRecord();
    if(!connected(record)||(full&&record!==full))return {ratio:0,distance:Infinity};
    if(full===record&&record.stream)return {ratio:1,distance:0};
    const box=(record.iframe||record.container).getBoundingClientRect(),width=box.width??box.right-box.left,height=box.height??box.bottom-box.top;
    const area=Math.max(0,Math.min(box.right,viewport.right)-Math.max(box.left,viewport.left))*Math.max(0,Math.min(box.bottom,viewport.bottom)-Math.max(box.top,viewport.top));
    return {ratio:width>0&&height>0?area/(width*height):0,distance:Math.abs((box.top+box.bottom-viewport.top-viewport.bottom)/2)};
  }
  function measure(){
    const view=viewport();
    for(const record of records.values()){
      Object.assign(record,measureRecord(record,view));
    }
  }
  function refresh(){if(destroyed)return;if(!current())exitOwnedFullscreen();measure();reconcile();refreshTimelines();}
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(()=>{
    if(destroyed||paused)return;
    refresh();
  },{root,threshold:Array.from({length:21},(_,i)=>i/20)}):null;
  function observe(record){
    if(record.observed)observer?.unobserve(record.observed);
    record.observed=record.iframe||record.container;
    if(!destroyed&&!paused)observer?.observe(record.observed);
  }
  function visibility(){
    if(document.hidden){for(const record of records.values())stop(record);}
    else if(current())refresh();
    refreshTimelines();
  }
  function music(event){
    if(typeof event.detail?.playing!=='boolean')return;
    const starting=event.detail.playing&&!musicPlaying;musicPlaying=event.detail.playing;
    if(!musicPlaying)return;
    // Repeated music status notifications must not erase an acknowledged
    // pause. A fresh request while the clip is playing starts a new handshake.
    if(active&&(starting||musicClip!==active.key||active.playing)){
      musicClip=active.key;
      const state=invoke(active,'getPlayerState');
      // pauseVideo need not emit another PAUSED event for an already-paused
      // player. Accept that known state without requesting playback.
      active.musicPauseConfirmed=(state===2||(state===undefined&&active.state===2)||(active.blocked&&[-1,0,5].includes(state)));
    }
    for(const record of records.values())stop(record);
    refreshTimelines();
  }
  const scrollTarget=root||window;
  scrollTarget.addEventListener('scroll',refresh,{passive:true});window.addEventListener('resize',refresh,{passive:true});
  document.addEventListener('visibilitychange',visibility);window.addEventListener('wc:music',music);
  document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);
  return {
    add(post,container,timeline=null){
      if(destroyed||!post||!container)return;
      const key=String(post.id),existing=records.get(key);
      if(existing&&existing.container===container&&existing.post.videoProvider===post.videoProvider&&existing.post.youtubeUrl===post.youtubeUrl){existing.post=post;if(existing.timeline!==timeline)attachTimeline(existing,timeline);if(existing.iframe)existing.iframe.title='Vidéo : '+(post.title||'');refresh();return;}
      if(existing)this.remove(key);
      const record={key,post:{...post},container,stream:post.videoProvider==='stream',video:youtubeId(post.youtubeUrl),ratio:0,distance:Infinity,token:0,blocked:false};records.set(key,record);
      attachTimeline(record,timeline);
      if(!record.stream&&!record.video)unavailable(record,Error('Lien vidéo invalide.'));
      observe(record);refresh();
    },
    remove(id){const record=records.get(String(id));if(!record)return;release(record);attachTimeline(record,null);observer?.unobserve(record.observed);record.label?.remove();records.delete(record.key);if(active===record){active=null;musicClip=null;}refresh();},
    refresh,
    pause(){if(destroyed)return;paused=true;exitOwnedFullscreen();observer?.disconnect();for(const record of records.values())stop(record);refreshTimelines();},
    resume(){if(destroyed)return;paused=false;for(const record of records.values())observe(record);refresh();},
    destroy(){
      if(destroyed)return;destroyed=true;clearProgress();observer?.disconnect();
      exitOwnedFullscreen();
      scrollTarget.removeEventListener('scroll',refresh);window.removeEventListener('resize',refresh);
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('wc:music',music);
      document.removeEventListener('fullscreenchange',fullscreenChanged);document.removeEventListener('webkitfullscreenchange',fullscreenChanged);
      for(const record of records.values()){release(record);attachTimeline(record,null);record.label?.remove();}records.clear();active=null;
    }
  };
}
