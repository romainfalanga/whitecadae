// Only comment editors use this viewport lift. The feed/player stay mounted.
export function revealCommentCaret(field){
  if(!field||!(field.clientHeight>0)||!(field.scrollHeight>field.clientHeight)||typeof field.selectionStart!=='number'||!window.getComputedStyle)return;
  const css=window.getComputedStyle(field),mirror=document.createElement('div'),marker=document.createElement('span');
  for(const name of ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-transform','text-indent','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','box-sizing','tab-size'])mirror.style.setProperty(name,css.getPropertyValue(name));
  for(const [name,value]of Object.entries({position:'fixed',left:'-10000px',top:'0',width:field.getBoundingClientRect().width+'px',height:'auto',visibility:'hidden','white-space':'pre-wrap','overflow-wrap':'break-word'}))mirror.style.setProperty(name,value);
  mirror.setAttribute('aria-hidden','true');mirror.textContent=field.value.slice(0,field.selectionStart);marker.textContent='\u200b';mirror.append(marker);document.body.append(mirror);
  try{const line=parseFloat(css.lineHeight)||24,padding=parseFloat(css.paddingTop)||0,top=marker.offsetTop,bottom=top+line;
    if(bottom>field.scrollTop+field.clientHeight-padding)field.scrollTop=bottom-field.clientHeight+padding;
    else if(top<field.scrollTop+padding)field.scrollTop=Math.max(0,top-padding);
  }finally{mirror.remove();}
}

export function createLogeCommentViewport({isCurrent,getPanel,onGeometry=()=>{}}){
  const viewport=window.visualViewport,heights=new Map();let closed=false,panel=null,field=null,frame=null,active=false,lastWidth=0,lastHeight=0,rotationHeight=0;
  const coarse=()=>window.matchMedia?.('(pointer: coarse)').matches||window.innerWidth<=1100;
  const geometry=()=>({height:Math.max(1,viewport?.height||window.innerHeight||800),top:Math.max(0,viewport?.offsetTop||0),left:Math.max(0,viewport?.offsetLeft||0),width:Math.max(1,viewport?.width||window.innerWidth||400)});
  const listen=(target,event,fn)=>{target?.addEventListener(event,fn,{passive:true});return ()=>target?.removeEventListener(event,fn);};
  function reset(){if(panel){panel.classList.remove('is-keyboard-editing');for(const name of ['height','top','left','width'])panel.style.removeProperty('--loge-comment-viewport-'+name);}document.body.classList.remove('loge-comment-keyboard');active=false;panel=null;}
  function reveal(){frame=null;if(closed||!active||!isCurrent()||!field||field.closest('.loge-comments-panel')!==panel)return;
    const scroller=field.closest('.loge-comment-composer')||field.closest('.loge-comments-scroll'),rect=field.getBoundingClientRect?.(),bounds=scroller?.getBoundingClientRect?.();
    if(rect&&bounds&&(rect.top<bounds.top+8||rect.bottom>bounds.bottom-8))field.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    revealCommentCaret(field);
  }
  function refresh(){
    if(closed)return;const g=geometry(),key=Math.round((window.innerWidth||g.width)/100),current=getPanel(),focused=document.activeElement;
    const textarea=focused?.matches?.('textarea')&&focused.closest('.loge-comments-panel')===current?focused:null;
    const visible=textarea&&!textarea.closest('.loge-comment-composer')?.hidden&&(!textarea.getClientRects||textarea.getClientRects().length>0);
    if(visible)field=textarea;
    else if(!focused||focused.closest?.('.loge-comments-panel')!==current||!active)field=null;
    for(let ancestor=field;ancestor&&ancestor!==current;ancestor=ancestor.parentElement||ancestor.parentNode||ancestor.parent)if(ancestor.hidden){field=null;break;}
    if(field?.getClientRects&&!field.getClientRects().length)field=null;
    const full=Math.max(heights.get(key)||0,window.innerHeight||g.height,g.height);heights.set(key,full);
    // Remember the pre-keyboard height, including browsers that resize both
    // viewports. A rotation during typing keeps the editor lifted until expansion.
    const rotated=lastWidth&&Math.abs(g.width-lastWidth)>80,expanded=lastHeight&&g.height>lastHeight+80;
    if(active&&rotated)rotationHeight=g.height;else if(expanded)rotationHeight=0;
    const keyboard=!!field&&coarse()&&(g.height<full-80||(active&&rotationHeight>0&&g.height<rotationHeight+80));
    lastWidth=g.width;lastHeight=g.height;
    if(!isCurrent()||!current||!field||!keyboard){const oldField=field,wasActive=active;reset();if(wasActive)onGeometry(oldField);return;}
    if(panel&&panel!==current)reset();panel=current;active=true;panel.classList.add('is-keyboard-editing');document.body.classList.add('loge-comment-keyboard');
    for(const [name,value]of Object.entries(g))panel.style.setProperty('--loge-comment-viewport-'+name,value+'px');
    onGeometry(field);
    if(frame===null)frame=window.requestAnimationFrame?window.requestAnimationFrame(reveal):setTimeout(reveal,0);
  }
  const removers=[listen(viewport,'resize',refresh),listen(viewport,'scroll',refresh),listen(window,'resize',refresh),listen(window,'orientationchange',refresh),listen(document,'focusin',refresh),listen(document,'focusout',()=>{if(frame===null)frame=window.requestAnimationFrame?window.requestAnimationFrame(()=>{frame=null;refresh();}):setTimeout(()=>{frame=null;refresh();},0);}),listen(document,'input',refresh),listen(document,'selectionchange',refresh)];
  refresh();
  return {refresh,destroy(){closed=true;for(const remove of removers)remove();if(frame!==null){if(window.cancelAnimationFrame)window.cancelAnimationFrame(frame);else clearTimeout(frame);}frame=null;reset();field=null;}};
}
