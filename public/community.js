window.WCCommunity = (() => {
  let cleanup=()=>{};
  function leave(){cleanup();cleanup=()=>{};}
  const el=id=>document.getElementById('co-'+id);
  const labels={open:'Ouvert',in_progress:'En cours',completed:'Concrétisé',paused:'En pause',exploring:'En réflexion',synthesized:'Synthèse disponible',todo:'À faire',doing:'En cours',done:'Terminé',planned:'Prévu',live:'En direct',ended:'Terminé'};
  const date=value=>new Date(value).toLocaleString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
  const roomPath=room=>'/'+(room.kind==='project'?'projets':'sujets')+'/'+room.id;
  const formData=form=>Object.fromEntries(new FormData(form));
  const nav=active=>`<div class="co-nav">${WCConversation.nav(active)}</div>`;
  const message=(id,text)=>{if(el(id))el(id).textContent=text;};
  function init(){leave();const epoch=newEpoch(),events=new AbortController();cleanup=()=>events.abort();return {epoch,events};}
  const textBlock=(title,text)=>text?`<section class="co-block"><h2>${esc(title)}</h2><p class="co-prose">${esc(text)}</p></section>`:'';
  const sessionCard=b=>`<a class="co-session-card" href="/brainstorm/${b.id}" data-link><span class="co-badge ${b.state==='live'?'is-live':''}">${labels[b.state]}</span><div><h3>${esc(b.title)}</h3><p>${esc(date(b.starts_at))} · ${Math.round((b.ends_at-b.starts_at)/60000)} min · échelon ${b.min_echelon}</p>${b.room_title?`<small>${esc(b.room_title)}</small>`:''}</div><span aria-hidden="true">→</span></a>`;

  async function room(id){
    const {epoch,events}=init();app.innerHTML='<p class="loading">Chargement de la fiche…</p>';let data;
    try{data=await api('/api/community/rooms/'+id);}catch(error){if(!stale(epoch))app.innerHTML=`${nav('topic')}<p>${esc(error.message)}</p>`;return;}
    if(stale(epoch))return;const r=data.room,project=r.kind==='project';document.title=r.title+' · White Cadae';
    const statuses=project?['open','in_progress','completed','paused']:['open','exploring','synthesized'];
    app.innerHTML=`<div class="co-page">${nav(r.kind)}<header class="co-hero"><div><span class="co-eyebrow">${project?'Projet':'Sujet'} · créé par ${authorLink(r.username)}</span><h1>${esc(r.title)}</h1><span class="co-badge">${labels[r.status]||'Ouvert'}</span></div>${r.can_edit?'<button id="co-edit-toggle" aria-expanded="false" aria-controls="co-editor">Modifier la fiche</button>':''}</header>
      <div class="co-primary-actions"><a class="btn" href="/conversation?topic=${r.id}" data-link>Participer à la discussion</a>${r.can_edit?'<button id="co-schedule-toggle" aria-expanded="false" aria-controls="co-schedule">Organiser un brainstorm</button>':''}</div>
      ${r.can_edit?`<form id="co-editor" class="co-form" hidden><h2>Modifier la fiche</h2><label>Titre<input name="title" maxlength="80" required value="${esc(r.title)}"></label><label>Contexte<textarea name="description" maxlength="2000" rows="3">${esc(r.description)}</textarea></label>
      ${project?`<label>Objectif concret<textarea name="goal" maxlength="1000" rows="2" placeholder="Quel résultat souhaites-tu atteindre ?">${esc(r.goal)}</textarea></label><label>De quoi as-tu besoin ?<textarea name="needs" maxlength="2000" rows="2" placeholder="Compétences, ressources, retours, coups de main…">${esc(r.needs)}</textarea></label>`:`<label>Question à explorer<textarea name="question" maxlength="1000" rows="2" placeholder="Quelle question aimerais-tu creuser ensemble ?">${esc(r.question)}</textarea></label>`}
      <label>Avancement<select name="status">${statuses.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${labels[s]}</option>`).join('')}</select></label><label>Synthèse<textarea name="summary" maxlength="4000" rows="4" placeholder="Ce que les échanges ont permis de comprendre ou de décider…">${esc(r.summary)}</textarea></label>
      <label>Ressources <span>(une par ligne : titre | lien, huit maximum)</span><textarea name="resources" rows="3" placeholder="Une lecture utile | https://…">${esc(r.resources.map(x=>x.label+' | '+x.url).join('\n'))}</textarea></label><p class="co-help">Le contenu de la fiche est visible dès l’échelon 12.</p><button class="primary" type="submit">Enregistrer</button><p id="co-edit-status" role="status"></p></form>`:''}
      ${r.can_edit?`<form id="co-schedule" class="co-form" hidden><h2>Organiser un brainstorm</h2><label>Titre<input name="title" maxlength="100" required placeholder="Sur quoi allons-nous réfléchir ?"></label><label>Objectif de la séance<textarea name="agenda" maxlength="2000" rows="2" placeholder="La question ou la décision à préparer ensemble…"></textarea></label><div class="co-form-grid"><label>Date et heure <span>(vide : maintenant)</span><input type="datetime-local" name="starts_at"></label><label>Durée<select name="duration_minutes">${[15,30,60,90,120,180].map(n=>`<option value="${n}" ${n===60?'selected':''}>${n} minutes</option>`).join('')}</select></label></div><p class="co-help">Accessible dès ton échelon actuel (${data.echelon}). La séance s’ouvrira à l’heure prévue.</p><button class="primary" type="submit">Créer la séance</button><p id="co-schedule-status" role="status"></p></form>`:''}
      <div class="co-room-grid"><div>${textBlock('Le contexte',r.description)}${project?textBlock('L’objectif',r.goal)+textBlock('Les besoins',r.needs):textBlock('La question',r.question)}${textBlock('La synthèse',r.summary)}${!r.description&&!r.question&&!r.goal&&!r.summary?'<p class="co-help">La fiche peut être complétée par son créateur. La discussion est déjà ouverte.</p>':''}</div><aside>${r.resources.length?`<section class="co-block"><h2>Ressources</h2><ul class="co-resources">${r.resources.map(x=>`<li><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.label)}</a></li>`).join('')}</ul></section>`:''}<section class="co-block"><h2>Brainstorms</h2><div id="co-sessions"></div></section></aside></div>
      ${project?`<section class="co-block co-actions"><div class="co-section-heading"><h2>Passer à l’action</h2><button id="co-action-toggle" aria-expanded="false" aria-controls="co-action-form">Proposer une action +</button></div><form id="co-action-form" class="co-form" hidden><label>Action concrète<input name="title" maxlength="160" required placeholder="Une prochaine étape réalisable…"></label><label>Quelques précisions <span>(facultatif)</span><textarea name="details" maxlength="1000" rows="2"></textarea></label><button type="submit" class="primary">Ajouter l’action</button><p id="co-action-status" role="status"></p></form><div id="co-actions"></div><p id="co-actions-status" role="status"></p></section>`:''}
      </div>`;
    let scheduleId=crypto.randomUUID(),actionId=crypto.randomUUID(),saving=false;
    const toggle=(button,form)=>{el(button).onclick=()=>{el(form).hidden=!el(form).hidden;el(button).setAttribute('aria-expanded',String(!el(form).hidden));if(!el(form).hidden)el(form).scrollIntoView({block:'nearest',behavior:'smooth'});};};
    if(r.can_edit){toggle('edit-toggle','editor');toggle('schedule-toggle','schedule');}
    if(project)toggle('action-toggle','action-form');
    function renderActions(){
      if(!project)return;
      el('actions').innerHTML=data.actions.length?['todo','doing','done'].map(s=>`<div class="co-action-group"><h3>${labels[s]} <span>${data.actions.filter(a=>a.status===s).length}</span></h3>${data.actions.filter(a=>a.status===s).map(a=>`<article class="co-action"><h4>${esc(a.title)}</h4>${a.details?`<p class="co-prose">${esc(a.details)}</p>`:''}<small>${a.assignee?'Pris en charge par '+esc(a.assignee):'Proposé par '+esc(a.username)}</small><div class="co-action-buttons">${!a.assignee_id&&a.status!=='done'?`<button data-action-id="${a.id}" data-action="claim">Je m’en occupe</button>`:''}${a.assignee_id===state.user.id||r.can_edit?`${a.status==='done'?`<button data-action-id="${a.id}" data-action="reopen">Rouvrir</button>`:`<button data-action-id="${a.id}" data-action="done">Marquer comme terminé</button>${a.assignee_id?`<button data-action-id="${a.id}" data-action="release">Libérer l’action</button>`:''}`}`:''}</div></article>`).join('')}</div>`).join(''):'<p class="co-help">Aucune action pour le moment. Propose une première étape pour faire avancer le projet.</p>';
    }
    function renderSessions(){el('sessions').innerHTML=data.brainstorms.length?data.brainstorms.map(sessionCard).join(''):'<p class="co-help">Aucune séance accessible pour le moment.</p>';}
    async function refresh(){const result=await api('/api/community/rooms/'+id);if(stale(epoch))return;data.actions=result.actions;data.brainstorms=result.brainstorms;renderActions();renderSessions();}
    renderActions();renderSessions();
    if(r.can_edit){
      el('editor').onsubmit=async event=>{
        event.preventDefault();if(saving)return;const values=formData(event.currentTarget);saving=true;event.submitter.disabled=true;
        try{values.resources=values.resources.trim()?values.resources.split('\n').filter(x=>x.trim()).map(line=>{const separator=line.indexOf('|');if(separator<1)throw new Error('Chaque ressource doit avoir un titre et un lien séparés par |.');return {label:line.slice(0,separator).trim(),url:line.slice(separator+1).trim()};}):[];await api('/api/community/rooms/'+id,{method:'PATCH',body:{...values,revision:r.revision}});if(!stale(epoch))room(id);}
        catch(error){if(!stale(epoch))message('edit-status',error.message);}finally{saving=false;if(!stale(epoch))event.submitter.disabled=false;}
      };
      el('schedule').onsubmit=async event=>{
        event.preventDefault();const button=event.submitter;if(button.disabled)return;button.disabled=true;
        try{const values=formData(event.currentTarget),created=await api('/api/community/rooms/'+id+'/brainstorms',{method:'POST',body:{...values,starts_at:values.starts_at?new Date(values.starts_at).toISOString():null,duration_minutes:Number(values.duration_minutes),client_id:scheduleId}});if(!stale(epoch)){scheduleId=crypto.randomUUID();navigate('/brainstorm/'+created.id);}}
        catch(error){if(!stale(epoch))message('schedule-status',error.message);}finally{if(!stale(epoch))button.disabled=false;}
      };
    }
    if(project){
      el('action-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;if(button.disabled)return;button.disabled=true;try{await api('/api/community/rooms/'+id+'/actions',{method:'POST',body:{...formData(event.currentTarget),client_id:actionId}});if(stale(epoch))return;actionId=crypto.randomUUID();event.target.reset();message('action-status','Action ajoutée.');await refresh();}catch(error){if(!stale(epoch))message('action-status',error.message);}finally{if(!stale(epoch))button.disabled=false;}};
      app.addEventListener('click',async event=>{const button=event.target.closest('[data-action-id]');if(!button||button.disabled)return;const action=data.actions.find(a=>a.id===Number(button.dataset.actionId));button.disabled=true;try{await api('/api/community/actions/'+action.id,{method:'PATCH',body:{action:button.dataset.action,revision:action.revision}});if(!stale(epoch)){message('actions-status','');await refresh();}}catch(error){if(!stale(epoch)){message('actions-status',error.message);button.disabled=false;}}},{signal:events.signal});
    }
  }

  async function brainstorms(){
    const {epoch,events}=init();document.title='Brainstorm · White Cadae';
    app.innerHTML=`<div class="co-page">${nav('brainstorm')}<header class="co-hero"><div><span class="co-eyebrow">Réfléchir ensemble</span><h1>Brainstorm</h1><p>Les séances organisées autour des sujets et des projets.</p></div></header><div class="chat-chips co-session-filters" role="group" aria-label="Séances"><button data-scope="upcoming" aria-pressed="true">À venir et en direct</button><button data-scope="past" aria-pressed="false">Terminées</button></div><p class="co-help">Pour organiser une séance, ouvre la fiche de ton sujet ou de ton projet.</p><p id="co-list-status" role="status"></p><div id="co-list"></div><button id="co-more" hidden>Voir d’autres séances</button></div>`;
    let scope='upcoming',next=null,items=[],revision=0;
    async function load(more=false){const token=++revision;el('more').disabled=true;try{const result=await api('/api/community/brainstorms?'+new URLSearchParams({scope,...(more?{before:next}:{})}));if(stale(epoch)||token!==revision)return;items=more?[...items,...result.brainstorms]:result.brainstorms;next=result.nextBefore;el('list').innerHTML=items.length?items.map(sessionCard).join(''):'<p class="co-empty">Aucune séance accessible pour le moment.</p>';el('more').hidden=!next;message('list-status','');}catch(error){if(!stale(epoch)&&token===revision)message('list-status',error.message);}finally{if(!stale(epoch)&&token===revision)el('more').disabled=false;}}
    app.addEventListener('click',event=>{const button=event.target.closest('[data-scope]');if(!button)return;scope=button.dataset.scope;app.querySelectorAll('[data-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));load();},{signal:events.signal});el('more').onclick=()=>load(true);await load();
  }

  async function brainstorm(id){
    const {epoch,events}=init();app.innerHTML='<p class="loading">Chargement du brainstorm…</p>';let data;
    try{data=await api('/api/community/brainstorms/'+id);}catch(error){if(!stale(epoch))app.innerHTML=`${nav('brainstorm')}<p>${esc(error.message)}</p>`;return;}
    if(stale(epoch))return;let meeting=data.brainstorm,messages=data.messages,participants=[],socket=null,reconnect=null,disposed=false,loading=false,superseded=false;
    const key='wc-brainstorm-draft-'+state.user.id+'-'+id;let draft='';try{draft=sessionStorage.getItem(key)||'';}catch{}
    document.title=meeting.title+' · Brainstorm';
    app.innerHTML=`<div class="co-page">${nav('brainstorm')}<header class="co-hero"><div><a class="co-eyebrow" href="/${meeting.room_kind==='project'?'projets':'sujets'}/${meeting.room_id}" data-link>${esc(meeting.room_title)}</a><h1>${esc(meeting.title)}</h1><p>${esc(date(meeting.starts_at))} · ${Math.round((meeting.ends_at-meeting.starts_at)/60000)} min · dès l’échelon ${meeting.min_echelon}</p></div><span class="co-badge" id="co-state"></span></header>${textBlock('L’objectif de la séance',meeting.agenda)}
      ${meeting.can_edit?'<div class="co-primary-actions"><button id="co-start" hidden>Commencer maintenant</button><button id="co-end" hidden>Terminer la séance</button><p id="co-session-status" role="status"></p></div>':''}
      <div class="co-live-layout"><section class="co-live-chat"><div class="co-live-heading"><h2>Discussion</h2><span id="co-connection" role="status">Connexion…</span></div><div id="co-live-messages" role="log" aria-label="Messages de la séance"></div><form id="co-live-form"><p id="co-live-status" role="status"></p><p class="chat-snapshot" id="co-message-level"></p><div class="chat-input-row"><label class="sr-only" for="co-live-body">Ton message</label><textarea id="co-live-body" rows="1" maxlength="2000" required placeholder="Une idée, une question…">${esc(draft)}</textarea><button type="submit" class="primary" id="co-send" aria-label="Envoyer le message">Envoyer ↑</button></div></form></section>
      <aside class="co-voice"><h2>Salon vocal</h2><p class="co-help">Jusqu’à 8 personnes. Tu rejoins micro coupé. Les participants s’entendent en direct ; le son n’est pas enregistré.</p><div class="co-voice-controls"><button id="co-voice-join" class="primary">Rejoindre le vocal</button><button id="co-mic" hidden>Activer mon micro</button><button id="co-voice-leave" hidden>Quitter le vocal</button><button id="co-voice-play" hidden>Activer le son</button></div><p id="co-voice-status" role="status"></p><h3>Dans la séance</h3><div id="co-participants"></div></aside></div>
      <section class="co-block"><h2>La synthèse</h2>${meeting.can_edit?`<form id="co-summary-form"><label class="sr-only" for="co-summary">Synthèse de la séance</label><textarea id="co-summary" rows="4" maxlength="4000" placeholder="Les idées importantes, les décisions et les prochaines étapes…">${esc(meeting.summary)}</textarea><button type="submit">Enregistrer la synthèse</button><p id="co-summary-status" role="status"></p></form>`:`<p class="co-prose" id="co-summary-text">${esc(meeting.summary||'La synthèse sera ajoutée par l’organisateur.')}</p>`}<p class="co-help"><a href="/${meeting.room_kind==='project'?'projets':'sujets'}/${meeting.room_id}" data-link>Revenir à la fiche ${meeting.room_kind==='project'?'pour concrétiser les prochaines actions':'pour poursuivre la réflexion'}</a></p></section></div>`;
    const save=()=>{try{sessionStorage.setItem(key,el('live-body').value);}catch{}};
    const send=value=>{if(socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify(value));return true;};
    const voice=WCBrainstormVoice.create({credentials:()=>api('/api/community/brainstorms/'+id+'/voice',{method:'POST',body:{}}),send,status:text=>{message('voice-status',text);el('voice-play').hidden=!voice.snapshot().active;},changed:s=>{if(disposed)return;el('voice-join').hidden=s.active;el('voice-join').disabled=s.joining||!data.voice.available||meeting.state!=='live'||socket?.readyState!==WebSocket.OPEN;el('voice-join').textContent=s.joining?'Connexion…':'Rejoindre le vocal';el('mic').hidden=!s.active;el('voice-leave').hidden=!s.active&&!s.joining;el('mic').textContent=s.muted?'Activer mon micro':'Couper mon micro';el('mic').setAttribute('aria-pressed',String(!s.muted));if(!s.active)el('voice-play').hidden=true;}});
    function controls(){
      el('state').textContent=labels[meeting.state];el('state').classList.toggle('is-live',meeting.state==='live');
      el('live-body').disabled=el('send').disabled=meeting.state!=='live';
      el('message-level').textContent=meeting.state==='live'?`Ton échelon : ${data.echelon} · Ton message restera visible dès cet échelon.`:meeting.state==='planned'?'La discussion s’ouvrira au début de la séance.':'Cette séance est terminée. Les échanges restent consultables.';
      if(meeting.can_edit){el('start').hidden=meeting.state!=='planned';el('end').hidden=meeting.state!=='live';}
      el('voice-join').disabled=!data.voice.available||meeting.state!=='live'||socket?.readyState!==WebSocket.OPEN;
      if(!data.voice.available)message('voice-status','Le vocal n’est pas encore activé. Tu peux participer par écrit.');
      if(meeting.state!=='live'){voice.leave();socket?.close();message('connection',meeting.state==='planned'?'À venir':'Archives');}
    }
    function renderMessages(){
      const box=el('live-messages'),near=box.scrollHeight-box.scrollTop-box.clientHeight<80;
      box.innerHTML=messages.length?messages.map(m=>`<article class="chat-message ${m.username===state.user.username?'is-mine':''}"><div class="chat-message-meta">${authorLink(m.username)}<span>Échelon ${m.author_echelon} à l’envoi</span></div><p>${esc(m.body)}</p><time>${esc(new Date(m.created_at.replace(' ','T')+'Z').toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))}</time></article>`).join(''):'<p class="co-empty">Les idées de la séance apparaîtront ici.</p>';
      if(near)box.scrollTop=box.scrollHeight;
    }
    function addMessages(incoming){messages=[...new Map([...messages,...incoming].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id);renderMessages();}
    async function refresh(){
      if(loading||disposed)return;loading=true;
      try{let after=data.nextAfter||messages.at(-1)?.id||0;do{const result=await api('/api/community/brainstorms/'+id+'?after='+after);if(stale(epoch))return;data={...result};meeting=result.brainstorm;addMessages(result.messages);after=result.nextAfter;}while(after);controls();if(!meeting.can_edit)el('summary-text').textContent=meeting.summary||'La synthèse sera ajoutée par l’organisateur.';if(meeting.state==='live'&&(!socket||socket.readyState===WebSocket.CLOSED))connect();}
      catch(error){if(!stale(epoch)){message('live-status',error.message);if([401,403,404].includes(error.status)){superseded=true;voice.leave();socket?.close();el('live-body').disabled=el('send').disabled=true;message('connection','Accès interrompu');}}}finally{loading=false;}
    }
    function connect(){
      if(disposed||superseded||meeting.state!=='live'||socket&&socket.readyState<2)return;
      const url=new URL('/api/community/brainstorms/'+id+'/live',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(url);
      socket.onopen=()=>{if(disposed)return;message('connection','En direct');controls();};
      socket.onmessage=event=>{if(disposed)return;let value;try{value=JSON.parse(event.data);}catch{return;}voice.message(value);if(value.type==='message')addMessages([value.message]);if(value.type==='presence'){participants=value.participants;el('participants').innerHTML=participants.map(p=>`<div class="co-participant"><span>${esc(p.username)}</span><small>${p.voice?(p.muted?'Micro coupé':'Au vocal'):'À l’écrit'}</small></div>`).join('');}if(value.type==='ended'||value.type==='refresh')refresh();};
      socket.onclose=event=>{if(disposed)return;participants=[];el('participants').innerHTML='';el('voice-join').disabled=true;if(event.code===4002){superseded=true;voice.leave(false);message('connection','Ouvert dans un autre onglet · recharge pour reprendre ici');return;}if(meeting.state==='live'){voice.suspend();message('connection','Reconnexion…');clearTimeout(reconnect);reconnect=setTimeout(()=>refresh(),2500);}else{voice.leave(false);message('connection',meeting.state==='planned'?'À venir':'Archives');}};
      socket.onerror=()=>{if(!disposed)message('connection','Connexion interrompue');};
    }
    const timer=setInterval(()=>{if(!superseded&&(!document.hidden||voice.snapshot().active))refresh();send({type:'ping'});},5000);
    cleanup=()=>{save();disposed=true;events.abort();clearInterval(timer);clearTimeout(reconnect);voice.leave();socket?.close();};
    function grow(){el('live-body').style.height='0px';el('live-body').style.height=Math.min(72,el('live-body').scrollHeight)+'px';}
    el('live-body').oninput=()=>{save();grow();};
    let messageId=crypto.randomUUID(),sending=false;
    el('live-form').onsubmit=async event=>{event.preventDefault();if(sending||!el('live-body').value.trim())return;sending=true;el('send').disabled=true;const text=el('live-body').value.trim();try{const result=await api('/api/community/brainstorms/'+id+'/messages',{method:'POST',body:{body:text,client_id:messageId}});if(stale(epoch))return;messageId=crypto.randomUUID();if(el('live-body').value.trim()===text)el('live-body').value='';save();grow();addMessages([result.message]);message('live-status','');el('live-messages').scrollTop=el('live-messages').scrollHeight;}catch(error){if(!stale(epoch))message('live-status',error.message);}finally{sending=false;if(!stale(epoch))el('send').disabled=meeting.state!=='live';}};
    el('voice-join').onclick=()=>voice.join();el('mic').onclick=()=>voice.toggleMic();el('voice-leave').onclick=()=>{voice.leave();message('voice-status','Tu as quitté le vocal.');};el('voice-play').onclick=()=>voice.playSound();
    if(meeting.can_edit){
      const update=async(body,status)=>{try{await api('/api/community/brainstorms/'+id,{method:'PATCH',body:{...body,revision:meeting.revision}});if(!stale(epoch)){message(status,'Enregistré.');await refresh();}}catch(error){if(!stale(epoch))message(status,error.message);}};
      el('start').onclick=()=>update({action:'start'},'session-status');el('end').onclick=()=>update({action:'end'},'session-status');
      el('summary-form').onsubmit=event=>{event.preventDefault();update({summary:el('summary').value},'summary-status');};
    }
    window.addEventListener('wc:music',()=>{if(voice.snapshot().active&&WCPlayer.isPlaying()){voice.leave();message('voice-status','Vocal quitté pour écouter la musique.');}},{signal:events.signal});
    renderMessages();controls();grow();if(meeting.state==='live')connect();if(data.nextAfter)refresh();
  }
  return {leave,room,brainstorms,brainstorm};
})();
