window.WCExternalLive = (() => {
  function create(container){
    let current=null,key=null;
    function hide(){container.querySelector('iframe')?.remove();const button=container.querySelector('[data-show-live]');if(button){button.hidden=false;button.textContent='Afficher le live';}const close=container.querySelector('[data-hide-live]');if(close)close.hidden=true;}
    function render(live){
      const next=JSON.stringify(live);if(next===key)return;key=next;current=live;container.replaceChildren();
      const title=document.createElement('h2');title.textContent=live?'Live sur '+live.label:'Le live';container.append(title);
      const note=document.createElement('p');note.className='co-help';container.append(note);
      if(!live){note.textContent='L’organisateur peut ajouter un lien YouTube ou Twitch, ou une invitation Discord pour parler ensemble.';return;}
      note.textContent=live.provider==='discord'?'Rejoins le salon sur Discord pour échanger à la voix.':'Le flux est diffusé par '+live.label+'. S’il ne peut pas être intégré, ouvre-le directement sur la plateforme.';
      const actions=document.createElement('div');actions.className='co-primary-actions';container.append(actions);
      const external=document.createElement('a');external.className='btn';external.href=safeUrl(live.url);external.target='_blank';external.rel='noopener noreferrer';external.textContent=(live.provider==='discord'?'Rejoindre ':'Ouvrir sur ')+live.label;external.onclick=()=>{WCPlayer.pause();hide();};
      let source;
      if(live.provider==='youtube'&&/^[A-Za-z0-9_-]{11}$/.test(live.id))source='https://www.youtube-nocookie.com/embed/'+live.id+'?autoplay=0&playsinline=1&rel=0';
      if(live.provider==='twitch'&&/^[a-z0-9_]{1,25}$/.test(live.id))source='https://player.twitch.tv/?'+new URLSearchParams({channel:live.id,parent:location.hostname,autoplay:'false',muted:'false'});
      if(source){
        const show=document.createElement('button'),close=document.createElement('button');show.dataset.showLive='';close.dataset.hideLive='';show.textContent='Afficher le live';close.textContent='Fermer le lecteur';close.hidden=true;
        show.onclick=()=>{
          if(live.provider==='twitch'&&container.clientWidth<400){note.textContent='Sur cet écran, ouvre le live sur Twitch pour profiter du lecteur.';return;}
          WCPlayer.pause();const frame=document.createElement('iframe');frame.src=source;frame.title='Live '+live.label;frame.className='co-external-player '+live.provider;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';container.append(frame);show.hidden=true;close.hidden=false;
        };close.onclick=hide;actions.append(show,close);
      }
      actions.append(external);
    }
    return {render,hide};
  }
  return {create};
})();
