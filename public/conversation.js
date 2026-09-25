window.WCConversation={async page(){
  const epoch=newEpoch();document.title='Conversation · White Cadae';
  app.innerHTML='<div class="loading">Chargement…</div>';
  const params=new URLSearchParams(location.search);
  const filter={theme:params.get('theme')||'tout',mode:params.get('mode')||'tout',niveau:params.get('niveau')||'2'};
  const query=before=>new URLSearchParams({...filter,...(before?{before}: {})}).toString();
  let data,revision=0,olderBusy=false,pollBusy=false,replacing=false;
  try{data=await api('/api/conversation?'+query());}
  catch(err){if(!stale(epoch))app.innerHTML=`<h1>Conversation</h1><p>${esc(err.message)}</p><a href="/conversation" data-link>Revenir à la conversation</a>`;return;}
  if(stale(epoch))return;
  const themes=data.themes,themeBy=id=>themes.find(t=>t.id===id);
  const options=selected=>Array.from({length:Math.max(1,data.echelon-1)},(_,i)=>`<option value="${i+2}" ${String(i+2)===String(selected)?'selected':''}>${i+2}</option>`).join('');
  const message=m=>`<article class="msg" id="message-${m.id}"><div class="msg-head">${authorLink(m.username)}<span class="msg-theme">${esc(themeBy(m.theme)?.label||'Général')}</span><span class="msg-echelon">${m.echelon_version===1?'Accès historique':'Échelon'} ≥ ${m.min_echelon}</span><time>${esc(formatDate(m.created_at))}</time></div><p class="msg-body">${esc(m.body)}</p></article>`;
  app.innerHTML=`<section class="conversation-page"><h1>Conversation</h1><p class="subtitle">Croiser les lectures, partager des pistes et donner une forme à ses idées.</p>
    <div class="conv-themes" role="group" aria-label="Thèmes de conversation"><button type="button" data-theme="tout">Tout</button>${themes.map(t=>`<button type="button" data-theme="${t.id}">${esc(t.label)}</button>`).join('')}</div>
    <p id="conv-theme-description" class="conv-help"></p>
    <div class="conv-filtre"><label>Échelons <select id="conv-f-mode"><option value="tout">Tout ce qui m’est ouvert</option><option value="max">Jusqu’à l’échelon…</option><option value="exact">Seulement l’échelon…</option><option value="min">À partir de l’échelon…</option><option value="historique">Messages historiques</option></select></label><select id="conv-f-niveau" aria-label="Échelon du filtre">${options(filter.niveau)}</select><button type="button" class="link-btn" id="conv-reset">Réinitialiser</button></div>
    <p id="conv-status" role="status" aria-live="polite" class="conv-help"></p>
    <button type="button" class="conv-older" id="conv-older">Voir les messages précédents</button><div class="conv-list" id="conv-list" aria-label="Messages de la conversation"></div>
    ${data.echelon>=2?`<form id="conv-form" class="conv-form"><div class="conv-composer-settings"><label>Thème du message<select id="conv-theme">${themes.map(t=>`<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select></label><label>Visible dès l’échelon<select id="conv-min">${options(2)}</select></label></div><p id="conv-prompt" class="conv-help"></p><label class="sr-only" for="conv-body">Ton message</label><textarea id="conv-body" maxlength="2000" rows="3" aria-describedby="conv-prompt"></textarea><div class="conv-form-foot"><span class="conv-help">Choisis l’échelon qui préserve la découverte des autres joueurs.</span><button type="submit" class="primary">Envoyer</button></div><p class="form-error" id="conv-err" role="alert"></p></form>`:''}</section>`;
  const el=id=>document.getElementById('conv-'+id),list=el('list');
  function showFilters(){
    document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===filter.theme)));
    el('theme-description').textContent=themeBy(filter.theme)?.description||'Tous les thèmes, dans les échelons auxquels tu as accès.';
    el('f-mode').value=filter.mode;el('f-niveau').value=filter.niveau;el('f-niveau').hidden=['tout','historique'].includes(filter.mode);
  }
  function render(placement='keep'){
    const height=list.scrollHeight,top=list.scrollTop,bottom=height-top-list.clientHeight<60;
    list.innerHTML=data.messages.length?data.messages.map(message).join(''):'<p class="empty-note">Aucun message dans cette sélection. Tu peux ouvrir la discussion.</p>';
    el('older').hidden=!data.nextBefore;
    if(placement==='older')list.scrollTop=list.scrollHeight-height+top;
    else if(placement==='bottom'||bottom)list.scrollTop=list.scrollHeight;
    else list.scrollTop=top;
  }
  function prompt(){if(!el('theme'))return;const t=themeBy(el('theme').value);el('prompt').textContent=t.description;el('body').placeholder=t.prompt;}
  async function load(kind='replace'){
    const token=revision,cursor=kind==='older'?data.nextBefore:null;
    if(kind==='older'&&(!cursor||olderBusy))return;
    if(kind==='poll'&&(pollBusy||replacing))return;
    if(kind==='older'){olderBusy=true;el('older').disabled=true;}
    if(kind==='poll')pollBusy=true;
    if(kind==='replace'){replacing=true;el('status').textContent='Chargement…';data.messages=[];data.nextBefore=null;list.innerHTML='';el('older').hidden=true;list.setAttribute('aria-busy','true');}
    try{
      const next=await api('/api/conversation?'+query(cursor));
      if(stale(epoch)||token!==revision)return;
      if(next.echelon!==data.echelon){data.echelon=next.echelon;for(const id of ['f-niveau','min'])if(el(id)){const value=el(id).value;el(id).innerHTML=options(Math.min(Number(value),data.echelon));}}
      const previous=data.messages;
      if(kind==='replace')data=next;
      else {data.messages=[...new Map([...previous,...next.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id);if(kind==='older')data.nextBefore=next.nextBefore;}
      el('status').textContent='';render(kind==='replace'?'bottom':kind==='older'?'older':'keep');
    }catch(err){if(!stale(epoch)&&token===revision)el('status').textContent=err.message;}
    finally{if(kind==='older')olderBusy=false;if(kind==='poll')pollBusy=false;if(token===revision&&kind==='replace')replacing=false;if(!stale(epoch)){el('older').disabled=false;if(token===revision)list.setAttribute('aria-busy','false');}}
  }
  function apply(){revision++;showFilters();history.replaceState(null,'','/conversation?'+query());load();}
  document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{filter.theme=b.dataset.theme;if(el('theme')&&!el('body').value.trim()){el('theme').value=filter.theme==='tout'?'general':filter.theme;prompt();}apply();});
  el('f-mode').onchange=()=>{filter.mode=el('f-mode').value;apply();};el('f-niveau').onchange=()=>{filter.niveau=el('f-niveau').value;apply();};
  el('reset').onclick=()=>{Object.assign(filter,{theme:'tout',mode:'tout',niveau:'2'});apply();};
  el('older').onclick=()=>load('older');
  if(el('form')){
    el('theme').value=filter.theme==='tout'?'general':filter.theme;el('theme').onchange=prompt;prompt();
    el('form').onsubmit=async event=>{
      event.preventDefault();const body=el('body').value.trim();if(!body)return;
      const button=event.currentTarget.querySelector('button[type="submit"]'),theme=el('theme').value;button.disabled=true;el('err').textContent='';
      try{await api('/api/conversation',{method:'POST',body:{body,theme,min_echelon:Number(el('min').value)}});if(stale(epoch))return;el('body').value='';filter.theme=theme;filter.mode='tout';revision++;showFilters();history.replaceState(null,'','/conversation?'+query());await load();}
      catch(err){if(!stale(epoch))el('err').textContent=err.message;}
      finally{if(!stale(epoch))button.disabled=false;}
    };
  }
  showFilters();render('bottom');
  pageTimer=setInterval(()=>{if(!document.hidden)load('poll');},20000);
}};
