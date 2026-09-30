// One account-wide pause, shared across tabs; the server enforces the deadline.
window.WCAttemptTimer={mount({root,userId,remainingMs,readStatus}){
  const key='wc_attempt_until_'+userId,controls=new Map(),badge=root.querySelector('.eg-pause');
  let until=0,timer=null,disposed=false,checking=false,wasBlocked=false,revision=0;
  const seconds=()=>Math.max(0,Math.ceil((until-Date.now())/1000));
  const saved=()=>{try{return Number(localStorage.getItem(key))||0;}catch{return 0;}};
  function refresh(){
    if(disposed)return;
    const left=seconds(),blocked=left>0;
    badge.hidden=!blocked;
    root.classList.toggle('eg-is-paused',blocked);
    const time=badge.querySelector('time'),label='0:'+String(left).padStart(2,'0');
    if(time.textContent!==label)time.textContent=label;
    if(blocked){
      for(const el of controls.keys())if(!el.isConnected)controls.delete(el);
      root.querySelectorAll('.eg-answer input,.eg-answer button,.eg-workbench button').forEach(el=>{
        if(!controls.has(el))controls.set(el,el.disabled);
        el.disabled=true;
      });
      if(!wasBlocked)badge.querySelector('[role=status]').textContent='Un délai de 33 secondes sépare chaque essai.';
    }else{
      for(const [el,disabled] of controls)if(el.isConnected)el.disabled=disabled;
      controls.clear();
      if(timer!==null){clearInterval(timer);timer=null;}
    }
    wasBlocked=blocked;
    if(blocked&&timer===null&&!document.hidden)timer=setInterval(refresh,250);
  }
  function sync(ms,broadcast=true){
    revision++;
    until=Date.now()+Math.max(0,Math.min(33000,Number(ms)||0));
    if(broadcast)try{localStorage.setItem(key,String(until));}catch{}
    refresh();
  }
  async function reconcile(){
    if(disposed||checking||document.hidden)return;checking=true;
    const current=revision;
    try{const result=await readStatus();if(!disposed&&revision===current)sync(result.attenteMs);}
    catch{/* Keep the known deadline if the connection is unavailable. */}
    finally{checking=false;}
  }
  function onStorage(event){if(event.key===key){revision++;until=Math.min(Date.now()+33000,Number(event.newValue)||0);refresh();}}
  function onVisibility(){
    if(document.hidden){if(timer!==null)clearInterval(timer);timer=null;}
    else{refresh();reconcile();}
  }
  window.addEventListener('storage',onStorage);
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('focus',reconcile);
  until=Math.max(Date.now()+Math.max(0,Number(remainingMs)||0),Math.min(Date.now()+33000,saved()));
  refresh();
  return {start:()=>sync(33000),sync,refresh,blocked:()=>seconds()>0,dispose(){
    disposed=true;root.classList.remove('eg-is-paused');if(timer!==null)clearInterval(timer);
    window.removeEventListener('storage',onStorage);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('focus',reconcile);controls.clear();
  }};
}};
