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

// Use YouTube's official player settings, without custom controls or overlays.
// Audible autoplay is attempted once; browser policy can require a native gesture.
export function createLogeVideoFeed({root=null,isCurrent=()=>true,onError=()=>{}}={}){
  const records=new Map();let active=null,destroyed=false,paused=false,musicClip=null,musicPlaying=false,expanded=null;
  const connected=record=>record.container.isConnected!==false;
  const current=()=>{try{return !destroyed&&!paused&&isCurrent()&&!document.hidden;}catch{return false;}};
  const eligible=record=>current()&&record===active&&connected(record)&&measureRecord(record,viewport()).ratio>0.5;
  const invoke=(record,method)=>{try{return record.player?.[method]?.();}catch{return undefined;}};
  function stop(record){invoke(record,'pauseVideo');record.playing=false;record.container.classList.remove('is-playing');}
  function stopOthers(record){for(const other of records.values())if(other!==record)stop(other);}
  function play(record){
    if(!record.ready||record.failed||record.blocked||!eligible(record)||musicClip===record.key||record.attempted)return;
    record.attempted=true;stopOthers(record);
    // Synchronous pause before playVideo prevents concurrent music playback.
    window.WCPlayer?.pause();
    invoke(record,'unMute');record.playPending=true;invoke(record,'playVideo');
  }
  const nativeFullscreen=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
  const ownsFullscreen=(container,element)=>!!element&&(element===container||container.contains(element));
  function exitNative(container){
    const before=nativeFullscreen();
    if(!ownsFullscreen(container,before))return Promise.resolve();
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    try{return Promise.resolve(exit?.call(document)).then(()=>{
      // Native fullscreen inside YouTube can leave our container underneath it
      // in the fullscreen stack. Pop that owned level too, without touching an
      // unrelated fullscreen element or looping if the browser made no change.
      if(nativeFullscreen()!==before)return exitNative(container);
    }).catch(()=>{});}catch{return Promise.resolve();}
  }
  function restoreExpanded(state){
    if(!current()||expanded)return;
    if(root){root.scrollTop=state.scroll.top;root.scrollLeft=state.scroll.left;}
    try{window.scrollTo(state.scroll.pageLeft,state.scroll.pageTop);}catch{/* Optional in nonvisual runtimes. */}
    if(state.trigger?.isConnected!==false)try{state.trigger?.focus?.({preventScroll:true});}catch{}
  }
  function closeExpanded(state=expanded,{refreshView=true,restore=true,exit=true}={}){
    if(!state||expanded!==state)return;
    expanded=null;state.closed=true;
    state.record.container.classList.remove('is-video-expanded');
    state.button.removeEventListener('click',state.close);state.bar.remove();
    if(exit)void exitNative(state.record.container).then(()=>{if(restore)restoreExpanded(state);});
    if(restore)restoreExpanded(state);
    if(refreshView&&!destroyed)refresh();
  }
  function fullscreen(id,trigger=null){
    const record=records.get(String(id));
    if(!record||record.failed||!record.video||!connected(record)||!current())return false;
    if(expanded?.record===record)return true;
    if(expanded)closeExpanded(expanded,{refreshView:false,restore:false});
    const bar=document.createElement('div'),button=document.createElement('button');
    bar.className='loge-fullscreen-tools';button.className='loge-fullscreen-exit';button.type='button';button.textContent='Quitter le plein écran';bar.append(button);
    const state={record,bar,button,trigger:trigger||document.activeElement,native:false,closed:false,
      scroll:{top:root?.scrollTop||0,left:root?.scrollLeft||0,pageTop:window.scrollY||0,pageLeft:window.scrollX||0}};
    state.close=()=>closeExpanded(state);expanded=state;
    button.addEventListener('click',state.close);record.container.append(bar);record.container.classList.add('is-video-expanded');
    // Request synchronously in the caller's click activation, before any audio
    // command. CSS already supplies the same expanded view if this is refused.
    const request=record.container.requestFullscreen||record.container.webkitRequestFullscreen;
    if(request){
      try{
        const result=request.call(record.container);
        void Promise.resolve(result).then(()=>{
          if(expanded!==state||!current()||!connected(record)){
            if(expanded===state)closeExpanded(state,{refreshView:false,restore:false});
            // A late native entry must not revive a removed/destroyed view, or
            // close a new fullscreen request for this same desired container.
            if(expanded?.record.container!==record.container)void exitNative(record.container);
            return;
          }
          if(ownsFullscreen(record.container,nativeFullscreen()))state.native=true;
          refresh();
        }).catch(()=>{
          if(expanded!==state)return;
          if(!current()||!connected(record))closeExpanded(state,{refreshView:false,restore:false});
          else refresh();
        });
      }catch{/* Keep the expanded CSS view when native fullscreen is denied. */}
    }
    refresh();try{button.focus?.({preventScroll:true});}catch{}
    return true;
  }
  function fullscreenChanged(){
    const state=expanded;if(!state)return;
    const element=nativeFullscreen();
    if(ownsFullscreen(state.record.container,element)){state.native=true;refresh();}
    else if(state.native||element)closeExpanded(state,{exit:false});
  }
  function fullscreenKey(event){
    if(expanded&&event.key==='Escape'){event.preventDefault();event.stopPropagation();closeExpanded();}
    else if(expanded&&event.key==='Tab'&&!event.shiftKey&&document.activeElement===expanded.button){
      event.preventDefault();try{(expanded.record.iframe||expanded.button).focus?.({preventScroll:true});}catch{}
    }
  }
  function fullscreenFocus(){
    if(expanded&&document.activeElement&&!expanded.record.container.contains(document.activeElement))try{expanded.button.focus?.({preventScroll:true});}catch{}
  }
  function release(record){
    if(expanded?.record===record)closeExpanded(expanded,{refreshView:false});
    record.token++;stop(record);observer?.unobserve(record.observed||record.container);
    try{record.player?.destroy?.();}catch{/* Removing the iframe still stops playback. */}
    record.player=null;record.ready=false;record.attempted=false;record.musicPauseConfirmed=false;record.playPending=false;record.state=null;
    record.iframe?.remove();record.iframe=null;
    observe(record);
  }
  function unavailable(record,error){
    if(destroyed||!records.has(record.key))return;
    release(record);record.failed=true;
    if(!record.label){record.label=document.createElement('p');record.label.className='loge-video-unavailable';record.label.textContent='Vidéo indisponible.';record.container.append(record.label);}
    try{onError(error,record.post);}catch{/* Presentation errors cannot revive playback. */}
  }
  function warm(record){
    if(record.iframe||record.failed||!connected(record))return;
    const token=++record.token,iframe=document.createElement('iframe');
    const src=new URL('https://www.youtube-nocookie.com/embed/'+record.video);
    for(const [key,value]of Object.entries({enablejsapi:'1',origin:location.origin,playsinline:'1',autoplay:'0',mute:'0',controls:'0',disablekb:'0',fs:'1',rel:'0'}))src.searchParams.set(key,value);
    iframe.id='loge-youtube-'+(++frameSequence)+'-'+record.key;iframe.className='loge-reel-frame';
    iframe.src=src.href;iframe.title='Vidéo : '+(record.post.title||'');
    iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen','');iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    record.iframe=iframe;record.blocked=false;record.container.append(iframe);
    if(expanded?.record===record)record.container.append(expanded.bar);
    observe(record);
    const live=()=>!destroyed&&records.get(record.key)===record&&record.token===token&&record.iframe===iframe;
    youtubeAPI().then(YT=>{
      if(!live())return;
      record.player=new YT.Player(iframe, {events:{
        onReady:event=>{
          if(!live()){try{event.target.pauseVideo();event.target.destroy();}catch{}return;}
          record.player=event.target;record.ready=true;
          // Loading can change layout or finish after the user has scrolled.
          // Re-select using the iframe itself before any autoplay attempt.
          refresh();if(!eligible(record))stop(record);
        },
        onStateChange:event=>{
          if(!live())return;
          record.state=event.data;
          if([0,1,2].includes(event.data))record.playPending=false;
          if(event.data===1){
            // No playVideo command is issued while musicClip is locked. A
            // PLAYING event after the requested PAUSED state can therefore
            // resume native playback; an earlier in-flight event is stopped.
            if(!eligible(record)||(musicClip===record.key&&!record.musicPauseConfirmed)){stop(record);return;}
            stopOthers(record);window.WCPlayer?.pause();record.attempted=true;record.blocked=false;record.playing=true;record.container.classList.add('is-playing');
          }else if(event.data===0||event.data===2){
            record.playing=false;record.container.classList.remove('is-playing');
            if(event.data===2&&musicClip===record.key)record.musicPauseConfirmed=true;
          }
        },
        onAutoplayBlocked:()=>{
          if(!live())return;
          // No muted fallback or automatic retry: leave the native iframe
          // available for a real user gesture after the browser's refusal.
          record.playPending=false;record.blocked=true;
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
      if(active){active.attempted=false;active.blocked=false;}
    }
    // Keep at most the current/nearest player and two adjacent players warm.
    const anchor=expanded?.record||active||list.filter(record=>!record.failed).sort((a,b)=>b.ratio-a.ratio||a.distance-b.distance)[0];
    const index=list.indexOf(anchor),start=Math.max(0,Math.min(index-1,list.length-3));
    const keep=new Set(index<0?[]:list.slice(start,start+3));
    for(const record of records.values())if(!keep.has(record)&&record.iframe)release(record);
    for(const record of keep)warm(record);
    if(active)play(active);
  }
  function viewport(){
    const screen={top:0,left:0,right:window.innerWidth,bottom:window.innerHeight};
    if(expanded)return screen;
    const box=root?.getBoundingClientRect?.();
    return box?{top:Math.max(0,box.top),left:Math.max(0,box.left),right:Math.min(screen.right,box.right),bottom:Math.min(screen.bottom,box.bottom)}:screen;
  }
  function measureRecord(record,viewport){
    if(!connected(record)||(expanded&&expanded.record!==record))return {ratio:0,distance:Infinity};
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
  function refresh(){if(destroyed)return;if(expanded&&(!current()||!connected(expanded.record)))closeExpanded(expanded,{refreshView:false,restore:false});measure();reconcile();}
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
    else if(current()){if(active)active.attempted=false;refresh();}
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
      // player. Accept that known state, except while a scripted play is pending.
      active.musicPauseConfirmed=!active.playPending&&(state===2||(state===undefined&&active.state===2)||(active.blocked&&[-1,0,5].includes(state)));
    }
    for(const record of records.values())stop(record);
  }
  const scrollTarget=root||window;
  scrollTarget.addEventListener('scroll',refresh,{passive:true});window.addEventListener('resize',refresh,{passive:true});
  document.addEventListener('visibilitychange',visibility);window.addEventListener('wc:music',music);
  document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);document.addEventListener('keydown',fullscreenKey);
  document.addEventListener('focusin',fullscreenFocus);
  return {
    add(post,container){
      if(destroyed||!post||!container)return;
      const key=String(post.id),existing=records.get(key);
      if(existing&&existing.container===container&&existing.post.youtubeUrl===post.youtubeUrl){existing.post=post;if(existing.iframe)existing.iframe.title='Vidéo : '+(post.title||'');refresh();return;}
      if(existing)this.remove(key);
      const record={key,post:{...post},container,video:youtubeId(post.youtubeUrl),ratio:0,distance:Infinity,token:0,blocked:false};records.set(key,record);
      if(!record.video)unavailable(record,Error('Lien vidéo invalide.'));
      observe(record);refresh();
    },
    remove(id){const record=records.get(String(id));if(!record)return;release(record);observer?.unobserve(record.observed);record.label?.remove();records.delete(record.key);if(active===record){active=null;musicClip=null;}refresh();},
    refresh,
    fullscreen,
    pause(){if(destroyed)return;paused=true;closeExpanded(expanded,{refreshView:false,restore:false});observer?.disconnect();for(const record of records.values())stop(record);},
    resume(){if(destroyed)return;paused=false;for(const record of records.values())observe(record);if(active)active.attempted=false;refresh();},
    destroy(){
      if(destroyed)return;destroyed=true;observer?.disconnect();
      closeExpanded(expanded,{refreshView:false,restore:false});
      scrollTarget.removeEventListener('scroll',refresh);window.removeEventListener('resize',refresh);
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('wc:music',music);
      document.removeEventListener('fullscreenchange',fullscreenChanged);document.removeEventListener('webkitfullscreenchange',fullscreenChanged);document.removeEventListener('keydown',fullscreenKey);
      document.removeEventListener('focusin',fullscreenFocus);
      for(const record of records.values()){release(record);record.label?.remove();}records.clear();active=null;
    }
  };
}
