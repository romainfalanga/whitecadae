window.WCVideographie = (() => {
  let cleanup=()=>{};
  const leave=()=>{cleanup();cleanup=()=>{};};
  const categories=[['univers','Univers'],['philosophie','Philosophiques'],['psychologie','Psychologiques'],['projets','Projets'],['idees','Idées']];
  const label=id=>categories.find(c=>c[0]===id)?.[1]||id;
  let minimumLevel=12;
  const options=(ceiling,current=minimumLevel)=>Array.from({length:Math.max(1,ceiling-minimumLevel+1)},(_,i)=>{const level=i+minimumLevel;return `<option value="${level}" ${level===Math.max(minimumLevel,current)?'selected':''}>Échelon ${level}</option>`;}).join('');
  const problem=error=>`<div class="vg-notice" role="status">${esc(error.message)}</div>`;
  function scope(){
    leave();const epoch=newEpoch(),controller=new AbortController(),disposers=[];
    const current=()=>!controller.signal.aborted&&!stale(epoch);
    cleanup=()=>{controller.abort();disposers.forEach(fn=>fn());};
    return {current,signal:controller.signal,dispose:fn=>disposers.push(fn)};
  }
  function fields(ceiling,p={}){
    return `<label>Titre<input name="title" maxlength="160" required value="${esc(p.title||'')}" placeholder="Quelle réflexion veux-tu partager ?"></label>
      <label>Description<textarea name="description" maxlength="4000" rows="3" placeholder="Présente ta réflexion ou ce sur quoi tu aimerais être aidé…">${esc(p.description||'')}</textarea></label>
      <div class="vg-form-row"><label>Catégorie<select name="category">${categories.map(([id,title])=>`<option value="${id}" ${p.category===id?'selected':''}>${title}</option>`).join('')}</select></label><label>Visible à partir de<select name="min_echelon">${options(ceiling,p.min_echelon)}</select></label></div>`;
  }
  function formBody(form){const data=new FormData(form);return {title:data.get('title'),description:data.get('description'),category:data.get('category'),min_echelon:Number(data.get('min_echelon'))};}
  async function feed(){
    const life=scope();document.title='Vidéographie — White Cadae';
    app.innerHTML=`<section class="vg-page"><header class="vg-header"><div><h1>Vidéographie</h1><p>Des réflexions à partager. Des voix pour avancer ensemble.</p></div><button id="vg-add" disabled>＋ Ajouter une vidéo</button></header>
      <div id="vg-publish" hidden></div><nav class="vg-filters chat-chips" aria-label="Catégories"><button data-category="tout" aria-pressed="true">Tout</button>${categories.map(([id,title])=>`<button data-category="${id}" aria-pressed="false">${title}</button>`).join('')}</nav>
      <p id="vg-status" role="status">Chargement…</p><div class="vg-grid" id="vg-grid"></div><button id="vg-more" class="vg-more" hidden>Voir plus de vidéos</button></section>`;
    const q=s=>app.querySelector(s);let category='tout',next=null,revision=0,loading=false,formReady=false,ceiling=minimumLevel,uploads=false;
    async function load(append=false){
      if(append&&loading)return;const turn=++revision;loading=true;q('#vg-status').textContent='Chargement…';
      try{
        const data=await api('/api/videographies?category='+category+(append&&next?'&before='+next:''),{signal:life.signal});if(!life.current()||turn!==revision)return;
        ceiling=data.echelon;minimumLevel=data.minimum_echelon||minimumLevel;uploads=data.uploads;next=data.nextBefore;q('#vg-add').disabled=false;
        const html=data.posts.map(p=>`<article class="vg-card"><a href="/videographie/video/${p.id}" data-link class="vg-card-link"><div class="vg-card-cover" aria-hidden="true"><span>▶</span><small>${esc(label(p.category))}</small></div><div class="vg-card-content"><span class="vg-eyebrow">Échelon ${p.min_echelon}</span><h2>${esc(p.title)}</h2>${p.description?`<p>${esc(p.description)}</p>`:''}<footer><span>${esc(p.username)}</span><span>${p.comments} réponse${p.comments>1?'s':''}</span></footer></div></a></article>`).join('');
        if(append)q('#vg-grid').insertAdjacentHTML('beforeend',html);else q('#vg-grid').innerHTML=html;
        q('#vg-more').hidden=!next;q('#vg-status').textContent=q('#vg-grid').children.length?'':'Aucune vidéo dans cette catégorie pour le moment. Partage la première réflexion.';
      }catch(error){if(life.current()&&turn===revision)q('#vg-status').textContent=error.message;}
      finally{if(turn===revision)loading=false;}
    }
    app.addEventListener('click',event=>{
      const cat=event.target.closest('[data-category]');if(cat){category=cat.dataset.category;next=null;q('.vg-filters').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===cat)));load();}
    },{signal:life.signal});
    q('#vg-more').onclick=()=>load(true);
    q('#vg-add').onclick=()=>{
      const panel=q('#vg-publish');panel.hidden=!panel.hidden;q('#vg-add').textContent=panel.hidden?'＋ Ajouter une vidéo':'Fermer';
      if(!formReady){formReady=true;publishForm(panel,ceiling,uploads,life);}
      if(!panel.hidden)panel.querySelector('input')?.focus();
    };
    await load();
  }
  function publishForm(panel,ceiling,uploads,life){
    const key='vg-publication-'+state.user.id;let draft={};try{draft=JSON.parse(sessionStorage.getItem(key)||'{}');}catch{}
    let mode=uploads?'file':'link',file=null,fileUrl=null,duration=0,ticket=null,uploaded=false,busy=false,clientId=draft.client_id||crypto.randomUUID();
    panel.innerHTML=`<form class="vg-form"><h2>Partager une vidéo</h2>${fields(ceiling,draft)}<div class="chat-chips vg-source" aria-label="Source de la vidéo">${uploads?'<button type="button" data-source="file" aria-pressed="true">Fichier vidéo</button>':''}<button type="button" data-source="link" aria-pressed="${!uploads}">Lien YouTube</button></div>
      <label class="vg-file" ${uploads?'':'hidden'}>Choisir une vidéo<input type="file" accept="video/mp4,video/webm,video/quicktime"><small>10 minutes · 80 Mo maximum</small></label>
      <label class="vg-link" ${uploads?'hidden':''}>Lien YouTube<input name="url" type="url" ${uploads?'disabled':''} placeholder="https://www.youtube.com/watch?v=…" value="${esc(draft.url||'')}"></label><video class="vg-upload-preview" controls playsinline hidden></video>
      <p class="vg-form-status" role="status"></p><button type="submit">Publier la vidéo</button></form>`;
    const form=panel.querySelector('form'),q=s=>form.querySelector(s),status=q('.vg-form-status');
    const save=()=>{try{sessionStorage.setItem(key,JSON.stringify({...formBody(form),url:form.elements.url.value,client_id:clientId}));}catch{}};
    form.addEventListener('input',save,{signal:life.signal});
    life.dispose(()=>{save();q('video').pause();if(fileUrl)URL.revokeObjectURL(fileUrl);});
    q('.vg-source').onclick=event=>{
      const button=event.target.closest('[data-source]');if(!button||busy)return;mode=button.dataset.source;
      q('.vg-source').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));q('.vg-file').hidden=mode!=='file';q('.vg-link').hidden=mode!=='link';form.elements.url.disabled=mode!=='link';q('video').hidden=mode!=='file'||!file;q('video').pause();status.textContent='';
    };
    q('[type=file]').onchange=async event=>{
      const chosen=event.target.files[0];if(!chosen||busy)return;
      if(ticket)api('/api/vg-media/'+ticket,{method:'DELETE'}).catch(()=>{});ticket=null;uploaded=false;duration=0;file=null;
      if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=null;
      if(chosen.size>80*1024*1024){status.textContent='Cette vidéo dépasse 80 Mo.';q('video').hidden=true;return;}
      file=chosen;status.textContent='Lecture du fichier…';fileUrl=URL.createObjectURL(file);const preview=q('video');preview.hidden=false;preview.src=fileUrl;
      const inspect=()=>{duration=preview.duration;if(Number.isFinite(duration)&&duration>0)status.textContent=duration<=600?'Vidéo prête · '+mmss(duration):'Choisis une vidéo de dix minutes maximum.';};
      preview.onloadedmetadata=()=>{inspect();if(!Number.isFinite(duration)){preview.currentTime=1e10;preview.ontimeupdate=()=>{inspect();if(Number.isFinite(duration)){preview.ontimeupdate=null;preview.currentTime=0;}};}};
      preview.ondurationchange=inspect;
      preview.onerror=()=>{duration=0;status.textContent='Ce fichier ne peut pas être lu ici. Essaie une vidéo MP4 ou WebM compatible.';};
      preview.onplay=()=>WCPlayer.pause();preview.load();
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      if(mode==='file'&&(!file||!Number.isFinite(duration)||duration<=0||duration>600)){status.textContent='Choisis une vidéo lisible de dix minutes maximum.';return;}
      if(mode==='link'&&!form.elements.url.value.trim()){status.textContent='Ajoute un lien YouTube.';return;}
      busy=true;q('[type=submit]').disabled=true;q('[type=file]').disabled=true;status.textContent='Envoi de la vidéo…';save();
      try{
        if(mode==='file'&&!uploaded){ticket=await WCVocal.upload(file,'video',duration,{id:ticket,onTicket:id=>ticket=id,onProgress:p=>status.textContent='Envoi de la vidéo · '+p+' %',signal:life.signal});uploaded=true;}
        status.textContent='Publication…';
        const result=await api('/api/videographies',{method:'POST',body:{...formBody(form),client_id:clientId,...(mode==='file'?{media_id:ticket}:{url:form.elements.url.value.trim()})}});
        if(!life.current())return;sessionStorage.removeItem(key);clientId=crypto.randomUUID();form.reset();navigate('/videographie/video/'+result.id);
      }catch(error){if(life.current())status.textContent=error.message;}
      finally{busy=false;if(life.current()){q('[type=submit]').disabled=false;q('[type=file]').disabled=false;}}
    };
  }
  async function detail(id){
    const life=scope();app.innerHTML='<section class="vg-page"><p>Chargement de la vidéo…</p></section>';
    let data;
    try{data=await api('/api/videographies/'+id,{signal:life.signal});}catch(error){if(life.current())app.innerHTML=`<section class="vg-page"><a href="/videographie" data-link>← Vidéographie</a>${problem(error)}</section>`;return;}
    if(!life.current())return;minimumLevel=data.minimum_echelon||minimumLevel;const p=data.post;document.title=p.title+' — White Cadae';
    app.innerHTML=`<section class="vg-page vg-detail"><a href="/videographie" data-link class="vg-back">← Vidéographie</a><div class="vg-detail-layout"><article class="vg-original"><div class="vg-video">${p.youtube_id?`<iframe src="https://www.youtube-nocookie.com/embed/${esc(p.youtube_id)}" title="${esc(p.title)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`:`<video controls playsinline preload="metadata" src="${esc(p.media_url)}"></video>`}</div>
      <div class="vg-post-meta"><span>${esc(label(p.category))}</span><span>Échelon ${p.min_echelon}</span></div><h1>${esc(p.title)}</h1><div class="vg-byline">${authorLink(p.username)} · ${esc(formatDate(p.created_at))}</div>${p.description?`<p class="vg-description">${esc(p.description)}</p>`:''}
      ${p.editable?'<div class="vg-actions"><button id="vg-edit-post" class="link-btn">Modifier la vidéo</button><button id="vg-delete-post" class="link-btn">Supprimer</button></div><div id="vg-post-editor" hidden></div>':''}</article>
      <aside class="vg-listen"><h2>Écouter les réponses</h2><p id="vg-queue-empty">Les réponses vocales apparaîtront ici.</p><button id="vg-listen-all" disabled>▶ Tout écouter</button><div id="vg-player" hidden><p id="vg-now"></p><audio id="vg-audio" controls preload="metadata"></audio><div class="vg-player-nav"><button id="vg-previous" aria-label="Réponse précédente">← Précédente</button><span id="vg-position"></span><button id="vg-next" aria-label="Réponse suivante">Suivante →</button></div><div id="vg-captions" class="voice-words" aria-live="off"></div></div><p id="vg-player-status" role="status"></p></aside></div>
      <div class="vg-discussion-head"><h2>La discussion</h2><button id="vg-to-reply">＋ Répondre</button></div><p id="vg-comment-status" role="status">Chargement des réponses…</p><div id="vg-comments"></div><button id="vg-comments-more" class="vg-more" hidden>Voir les réponses suivantes</button>
      <section id="vg-reply" class="vg-reply"><h2>Ta réponse</h2><div id="vg-reply-target" hidden><span></span><button id="vg-cancel-reply" class="link-btn">Annuler</button></div><p class="vg-audience">Visible aux mêmes personnes que cette vidéo · échelon ${p.min_echelon} et suivants.</p><div id="vg-studio"></div><p id="vg-submit-status" role="status"></p><button id="vg-submit">Publier ma réponse</button></section></section>`;
    const q=s=>app.querySelector(s),comments=new Map(),audio=q('#vg-audio');let cursor=0,more=true,loading=null,studio=null,parent=null,queue=[],queueIndex=-1,frame=0,editingStudio=null,editPanel=null,submitting=false;
    const replyKey='vg-reply-'+state.user.id+'-'+id;try{parent=Number(sessionStorage.getItem(replyKey))||null;}catch{}
    const pause=()=>{audio.pause();cancelAnimationFrame(frame);};
    const stopOther=()=>{WCPlayer.pause();document.querySelectorAll('audio,video').forEach(m=>{if(m!==audio)m.pause();});const iframe=q('.vg-video iframe');if(iframe&&iframe.dataset.started==='true'){iframe.src=iframe.src;iframe.dataset.started='false';}};
    document.addEventListener('wc:vocal-preview',()=>{pause();q('.vg-video video')?.pause();const iframe=q('.vg-video iframe');if(iframe&&iframe.dataset.started==='true'){iframe.src=iframe.src;iframe.dataset.started='false';}},{signal:life.signal});
    q('.vg-video video')?.addEventListener('play',()=>{pause();WCPlayer.pause();document.querySelectorAll('audio').forEach(a=>a.pause());},{signal:life.signal});
    window.addEventListener('blur',()=>{if(document.activeElement===q('.vg-video iframe')){pause();WCPlayer.pause();document.activeElement.dataset.started='true';}},{signal:life.signal});
    life.dispose(()=>{pause();audio.removeAttribute('src');audio.load();q('.vg-video video')?.pause();studio?.dispose();editingStudio?.dispose();});
    function tree(){
      const children=new Map();for(const c of comments.values()){const parentId=comments.has(c.parent_id)?c.parent_id:null;if(!children.has(parentId))children.set(parentId,[]);children.get(parentId).push(c);}
      for(const list of children.values())list.sort((a,b)=>a.id-b.id);
      const stack=(children.get(null)||[]).map(c=>({c,depth:0})).reverse(),ordered=[];
      while(stack.length){const item=stack.pop();ordered.push(item);const next=children.get(item.c.id)||[];for(let i=next.length-1;i>=0;i--)stack.push({c:next[i],depth:item.depth+1});}
      return ordered;
    }
    function draw(){
      const list=tree();q('#vg-comments').innerHTML=list.map(({c,depth})=>`<article class="vg-comment ${c.deleted?'is-deleted':''}" id="vg-comment-${c.id}" style="--depth:${Math.min(depth,3)}"><div class="vg-comment-meta">${authorLink(c.username)}<span>${esc(formatDate(c.created_at))}</span></div>${c.parent_id?`<a class="vg-parent" href="#vg-comment-${c.parent_id}">↳ En réponse à ${esc(comments.get(c.parent_id)?.username||'un membre')}</a>`:''}
        ${c.deleted?'<p class="vg-deleted">Réponse supprimée</p>':`<p class="vg-comment-body">${esc(c.body)}</p><div class="vg-actions"><button data-play="${c.id}">▶ Écouter · ${mmss(c.duration)}</button><button class="link-btn" data-reply="${c.id}">Répondre</button>${c.editable?`<button class="link-btn" data-edit="${c.id}">Corriger le texte</button><button class="link-btn" data-delete="${c.id}">Supprimer</button>`:''}</div>`}</article>`).join('');
      const active=queue[queueIndex];if(active)q('#vg-comment-'+active.id)?.classList.add('is-playing');
      const audible=list.some(x=>x.c.audio_url);q('#vg-listen-all').disabled=!audible;q('#vg-queue-empty').hidden=audible;q('#vg-comments-more').hidden=!more;
      q('#vg-comment-status').textContent=list.length?'':'Aucune réponse pour le moment. Enregistre la première.';target();
    }
    function target(){
      const c=comments.get(parent);if(parent&&!c&& !more)parent=null;
      q('#vg-reply-target').hidden=!parent;q('#vg-reply-target span').textContent=parent?'En réponse à '+(c?.username||'un membre'):'';
      try{if(parent)sessionStorage.setItem(replyKey,String(parent));else sessionStorage.removeItem(replyKey);}catch{}
    }
    async function load(){
      if(loading)return loading;if(!more)return;
      loading=(async()=>{try{const result=await api('/api/videographies/'+id+'/comments?after='+cursor,{signal:life.signal});if(!life.current())return;result.comments.forEach(c=>comments.set(c.id,c));if(result.comments.length)cursor=result.comments.at(-1).id;more=!!result.nextAfter;draw();}catch(error){if(life.current())q('#vg-comment-status').textContent=error.message;throw error;}finally{loading=null;}})();return loading;
    }
    async function refresh(){cursor=0;more=true;comments.clear();await load();}
    const animate=()=>{if(!life.current())return;WCVocal.paint(q('#vg-captions'),queue[queueIndex]?.words||[],audio.currentTime);if(!audio.paused)frame=requestAnimationFrame(animate);};
    async function play(index){
      if(index<0||index>=queue.length)return;queueIndex=index;const c=queue[index];stopOther();audio.src=c.audio_url;q('#vg-player').hidden=false;q('#vg-now').textContent=c.username+(c.parent_id?' · en réponse à '+(comments.get(c.parent_id)?.username||'un membre'):'');q('#vg-position').textContent=(index+1)+' / '+queue.length;q('#vg-captions').innerHTML=WCVocal.textMarkup(c.words);q('#vg-previous').disabled=index===0;q('#vg-next').disabled=index===queue.length-1;q('#vg-player-status').textContent='';
      q('#vg-comments').querySelectorAll('.is-playing').forEach(el=>el.classList.remove('is-playing'));q('#vg-comment-'+c.id)?.classList.add('is-playing');
      try{await audio.play();}catch{if(life.current())q('#vg-player-status').textContent='Appuie sur Lecture pour écouter cette réponse.';}
    }
    audio.onplay=()=>{stopOther();cancelAnimationFrame(frame);animate();};audio.onpause=()=>cancelAnimationFrame(frame);audio.onseeked=()=>{if(queue[queueIndex])WCVocal.paint(q('#vg-captions'),queue[queueIndex].words,audio.currentTime);};
    audio.onended=()=>{if(queueIndex<queue.length-1)play(queueIndex+1);else q('#vg-player-status').textContent='Toutes les réponses ont été écoutées.';};
    audio.onerror=()=>{if(life.current()&&audio.getAttribute('src'))q('#vg-player-status').textContent='Cette réponse ne peut pas être lue. Réessaie ou passe à la suivante.';};
    q('#vg-previous').onclick=()=>play(queueIndex-1);q('#vg-next').onclick=()=>play(queueIndex+1);
    q('#vg-listen-all').onclick=async()=>{
      q('#vg-listen-all').disabled=true;q('#vg-player-status').textContent='Préparation des réponses…';
      try{while(more&&life.current())await load();if(!life.current())return;queue=tree().map(x=>x.c).filter(c=>c.audio_url);if(queue.length)await play(0);}
      catch(error){if(life.current())q('#vg-player-status').textContent=error.message;}
      finally{if(life.current())q('#vg-listen-all').disabled=!tree().some(x=>x.c.audio_url);}
    };
    q('#vg-comments-more').onclick=()=>load().catch(()=>{});
    q('#vg-to-reply').onclick=()=>{q('#vg-reply').scrollIntoView({behavior:'smooth',block:'start'});q('#vg-reply [data-voice=record]')?.focus({preventScroll:true});};
    q('#vg-cancel-reply').onclick=()=>{parent=null;target();};
    q('#vg-comments').addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.play){queue=tree().map(x=>x.c).filter(c=>c.audio_url);await play(queue.findIndex(c=>c.id===Number(button.dataset.play)));q('.vg-listen').scrollIntoView({behavior:'smooth',block:'nearest'});}
      if(button.dataset.reply){parent=Number(button.dataset.reply);target();q('#vg-to-reply').click();}
      if(button.dataset.edit)await editComment(comments.get(Number(button.dataset.edit)));
      if(button.dataset.delete){if(!confirm('Supprimer cette réponse ? Ses réponses resteront dans la discussion.'))return;button.disabled=true;try{await api('/api/vg-comments/'+button.dataset.delete,{method:'DELETE'});pause();if(life.current())await refresh();}catch(error){if(life.current())q('#vg-comment-status').textContent=error.message;button.disabled=false;}}
    },{signal:life.signal});
    async function editComment(c){
      if(editingStudio)editingStudio.dispose();editPanel?.remove();pause();
      editPanel=document.createElement('div');editPanel.className='vg-comment-editor';editPanel.innerHTML='<h3>Corriger la transcription</h3><div class="vg-edit-studio"></div><p role="status"></p><div class="vg-actions"><button data-save>Enregistrer</button><button data-cancel class="link-btn">Annuler</button></div>';q('#vg-comment-'+c.id).append(editPanel);
      const panel=editPanel;
      editingStudio=await WCVocal.studio(panel.querySelector('.vg-edit-studio'),{key:'edit-'+c.id,editing:true,initial:{id:c.audio_url.split('/').at(-1),text:c.body,words:c.words,duration:c.duration,uploaded:true}});
      if(!life.current()){editingStudio.dispose();return;}
      panel.querySelector('[data-cancel]').onclick=()=>{editingStudio?.dispose();editingStudio=null;panel.remove();};
      panel.querySelector('[data-save]').onclick=async event=>{if(submitting)return;event.target.disabled=true;try{const v=await editingStudio.prepare();await api('/api/vg-comments/'+c.id,{method:'PATCH',body:{body:v.text,words:v.words}});editingStudio.dispose();editingStudio=null;if(life.current())await refresh();}catch(error){if(life.current())panel.querySelector('[role=status]').textContent=error.message;}finally{event.target.disabled=false;}};
    }
    if(p.editable){
      q('#vg-edit-post').onclick=()=>{const panel=q('#vg-post-editor');panel.hidden=!panel.hidden;if(panel.innerHTML)return;panel.innerHTML=`<form class="vg-form">${fields(data.echelon,p)}<p role="status"></p><button type="submit">Enregistrer</button></form>`;panel.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;try{await api('/api/videographies/'+id,{method:'PATCH',body:formBody(form)});if(life.current())navigate('/videographie/video/'+id,true);}catch(error){form.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};};
      q('#vg-delete-post').onclick=async()=>{if(!confirm('Supprimer cette vidéo et masquer sa discussion ?'))return;try{await api('/api/videographies/'+id,{method:'DELETE'});if(life.current())navigate('/videographie');}catch(error){if(life.current())q('#vg-comment-status').textContent=error.message;}};
    }
    await load().catch(()=>{});if(!life.current())return;
    if(!data.uploads){q('#vg-studio').innerHTML='<p>L’enregistrement est temporairement indisponible.</p>';q('#vg-submit').disabled=true;return;}
    studio=await WCVocal.studio(q('#vg-studio'),{key:'comment-'+state.user.id+'-'+id});if(!life.current()){studio.dispose();return;}
    q('#vg-submit').onclick=async()=>{
      if(submitting||studio.isBusy()){q('#vg-submit-status').textContent='Termine l’enregistrement ou la transcription avant de publier.';return;}
      submitting=true;q('#vg-submit').disabled=true;
      try{const v=await studio.prepare();q('#vg-submit-status').textContent='Publication…';await api('/api/videographies/'+id+'/comments',{method:'POST',body:{body:v.text,words:v.words,media_id:v.id,parent_id:parent,client_id:v.client_id}});await studio.clear();if(!life.current())return;parent=null;target();await refresh();q('#vg-submit-status').textContent='Ta réponse est publiée.';}
      catch(error){if(life.current())q('#vg-submit-status').textContent=error.message;}
      finally{submitting=false;if(life.current())q('#vg-submit').disabled=false;}
    };
  }
  return {feed,detail,leave};
})();
