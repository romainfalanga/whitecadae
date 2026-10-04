// A brief, dismissible celebration. No focus theft, animation loop or page reflow.
window.WCGameFeedback={mount(root){
  let overlay=null,timeout=null,removal=null;
  function clear(){
    clearTimeout(timeout);clearTimeout(removal);timeout=removal=null;
    if(overlay?.contains(document.activeElement)){
      const heading=root.querySelector('.eg-header h1');
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    }
    overlay?.remove();overlay=null;window.removeEventListener('keydown',onKey);
  }
  function close(){
    if(!overlay||removal!==null)return;
    clearTimeout(timeout);overlay.classList.add('is-leaving');
    removal=setTimeout(clear,220);
  }
  function onKey(event){if(event.key==='Escape')close();}
  return {show(gained){
    if(!Number.isInteger(gained)||gained<1)return;
    clear();overlay=document.createElement('div');
    overlay.className='eg-gain-overlay';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.setAttribute('aria-atomic','true');
    overlay.innerHTML=`<button type="button" class="eg-gain-window" aria-label="+${gained} ${gained>1?'échelons':'échelon'}. Fermer la notification"><span class="eg-gain-halo" aria-hidden="true"></span><span class="eg-gain-line"><span class="eg-gain-number">+${gained}</span> <span class="eg-gain-label">${gained>1?'échelons':'échelon'}</span></span></button>`;
    overlay.querySelector('button').onclick=close;root.append(overlay);
    window.addEventListener('keydown',onKey);timeout=setTimeout(close,4200);
  },dispose:clear};
}};
