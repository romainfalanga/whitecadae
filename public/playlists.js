window.WCPlaylists=(()=>{
  let data=null,activeId=null,draft=null,creating=false,creatingName='',busy=false,controller=null,serial=0,owner=null;
  const node=id=>document.getElementById(id);
  const e=value=>esc(value??'');
  const selected=()=>data?.playlists.find(playlist=>playlist.id===activeId);
  const track=slug=>data?.tracks.find(item=>item.slug===slug);
  const current=playlist=>{const state=WCPlayer.snapshot();return state.playlistId===playlist?.id&&state.playlistSource===playlist?.playback?.src;};
  function notice(message=''){const el=node('pl-status');if(el)el.textContent=message;}
  function icon(direction){return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${direction==='up'?'m6 14 6-6 6 6':'m6 10 6 6 6-6'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
  function row(slug,index){
    const item=track(slug);if(!item)return '';
    const playlist=selected(),playing=current(playlist)&&WCPlayer.snapshot().slug===slug&&WCPlayer.snapshot().playing;
    return `<li><span class="pl-number">${String(index+1).padStart(2,'0')}</span>${draft?`<span class="pl-track-name">${e(item.title)}<small>${e(item.album)}</small></span><div class="pl-order"><button type="button" data-move="${index}" data-direction="-1" aria-label="Monter ${e(item.title)}" ${index===0?'disabled':''}>${icon('up')}</button><button type="button" data-move="${index}" data-direction="1" aria-label="Descendre ${e(item.title)}" ${index===draft.tracks.length-1?'disabled':''}>${icon('down')}</button><button type="button" data-remove="${index}" aria-label="Retirer ${e(item.title)}">×</button></div>`:`<button class="pl-track-play" type="button" data-play="${index}" aria-pressed="${playing}">${WCIcon(playing?'pause':'play')}<span>${e(item.title)}<small>${e(item.album)}</small></span></button><span class="pl-duration">${mmss(Math.floor(item.duration))}</span>`}</li>`;
  }
  function render(){
    if(!data)return;
    const playlist=selected();
    app.innerHTML=`<section class="pl-page"><header class="pl-header"><h1>Playlist</h1>${!creating?'<button class="pl-text-button" id="pl-new" type="button">Nouvelle playlist</button>':''}</header>
      ${creating?`<form id="pl-create" class="pl-create"><label class="sr-only" for="pl-new-name">Nom de la playlist</label><input id="pl-new-name" name="name" maxlength="80" placeholder="Nom" value="${e(creatingName)}" required><button class="orange-button" type="submit">Créer</button><button class="pl-text-button" id="pl-create-cancel" type="button">Annuler</button></form>`:''}
      ${playlist?`<div class="pl-active">${draft?`<form id="pl-editor"><label class="sr-only" for="pl-name">Nom de la playlist</label><input id="pl-name" name="name" value="${e(draft.name)}" maxlength="80" required><ol class="pl-tracks is-editing">${draft.tracks.map(row).join('')}</ol><div class="pl-add"><label class="sr-only" for="pl-track">Ajouter un morceau</label><select id="pl-track"><option value="">Ajouter un morceau</option>${data.tracks.filter(item=>!draft.tracks.includes(item.slug)).map(item=>`<option value="${e(item.slug)}">${e(item.title)} · ${e(item.album)}</option>`).join('')}</select><button type="button" id="pl-add" aria-label="Ajouter le morceau" disabled>+</button></div><footer class="pl-edit-actions"><button class="orange-button" type="submit">Enregistrer</button><button class="pl-text-button" id="pl-cancel" type="button">Annuler</button><button class="pl-text-button pl-delete" id="pl-delete" type="button">Supprimer</button></footer></form>`:`<div class="pl-toolbar"><label class="sr-only" for="pl-select">Playlist</label><select id="pl-select">${data.playlists.map(item=>`<option value="${item.id}" ${item.id===playlist.id?'selected':''}>${e(item.name)}</option>`).join('')}</select><button class="orange-button" id="pl-listen" type="button" ${!playlist.tracks.length?'disabled':''}>${WCIcon(current(playlist)&&WCPlayer.snapshot().playing?'pause':'play')}<span>${current(playlist)&&WCPlayer.snapshot().playing?'Pause':'Écouter'}</span></button><button class="pl-text-button" id="pl-edit" type="button">Modifier</button></div><ol class="pl-tracks">${playlist.tracks.map(row).join('')}</ol>`}</div>`:''}<p id="pl-status" class="pl-status" role="status" aria-live="polite"></p></section>`;
    bind();
    if(busy)app.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  }
  function listen(index){
    const playlist=selected();if(!playlist?.tracks.length||busy)return;
    if(current(playlist)&&(index===undefined||playlist.tracks[index]===WCPlayer.snapshot().slug))WCPlayer.toggle();
    else WCPlayer.playPlaylist(playlist,index??0);
  }
  function bind(){
    if(node('pl-new'))node('pl-new').onclick=()=>{creating=true;creatingName='';draft=null;render();node('pl-new-name')?.focus();};
    if(node('pl-create-cancel'))node('pl-create-cancel').onclick=()=>{creating=false;render();};
    if(node('pl-new-name'))node('pl-new-name').oninput=event=>creatingName=event.target.value;
    if(node('pl-create'))node('pl-create').onsubmit=event=>{event.preventDefault();create(node('pl-new-name').value);};
    if(node('pl-select'))node('pl-select').onchange=event=>{activeId=Number(event.target.value);render();};
    if(node('pl-listen'))node('pl-listen').onclick=()=>listen();
    if(node('pl-edit'))node('pl-edit').onclick=()=>{const playlist=selected();draft={name:playlist.name,tracks:[...playlist.tracks]};creating=false;render();};
    if(node('pl-name'))node('pl-name').oninput=event=>draft.name=event.target.value;
    if(node('pl-cancel'))node('pl-cancel').onclick=()=>{draft=null;render();};
    if(node('pl-editor'))node('pl-editor').onsubmit=event=>{event.preventDefault();save();};
    if(node('pl-delete'))node('pl-delete').onclick=remove;
    if(node('pl-track'))node('pl-track').onchange=()=>node('pl-add').disabled=!node('pl-track').value;
    if(node('pl-add'))node('pl-add').onclick=()=>{const slug=node('pl-track').value;if(slug&&!draft.tracks.includes(slug)){draft.tracks.push(slug);render();}};
    app.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{const from=Number(el.dataset.move),to=from+Number(el.dataset.direction);if(to<0||to>=draft.tracks.length)return;[draft.tracks[from],draft.tracks[to]]=[draft.tracks[to],draft.tracks[from]];render();node('pl-name')?.blur();});
    app.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{draft.tracks.splice(Number(el.dataset.remove),1);render();});
    app.querySelectorAll('[data-play]').forEach(el=>el.onclick=()=>listen(Number(el.dataset.play)));
  }
  const request=(path,options={})=>api(path,{...options,headers:{'X-WC-User':String(owner),...options.headers},signal:controller.signal});
  async function change(action){
    if(busy)return;
    const token=serial;busy=true;render();
    try{await action();if(token===serial){busy=false;render();}}
    catch(error){if(token!==serial)return;busy=false;render();if(error.name!=='AbortError')notice(error.message);}
  }
  async function create(name){
    creatingName=name;
    await change(async()=>{const token=serial,result=await request('/api/playlists',{method:'POST',body:{name,tracks:[]}});if(token!==serial)return;data.playlists.unshift(result.playlist);activeId=result.playlist.id;creating=false;draft={name:result.playlist.name,tracks:[]};});
  }
  async function save(){
    const playlist=selected(),body={name:draft.name,tracks:[...draft.tracks],revision:playlist.revision};
    await change(async()=>{const token=serial,result=await request('/api/playlists/'+playlist.id,{method:'PUT',body});if(token!==serial)return;WCPlayer.updatePlaylistMetadata(result.playlist);data.playlists=data.playlists.map(item=>item.id===playlist.id?result.playlist:item);draft=null;});
  }
  async function remove(){
    const playlist=selected();if(!playlist||!confirm('Supprimer cette playlist ?'))return;
    await change(async()=>{const token=serial;await request('/api/playlists/'+playlist.id,{method:'DELETE',body:{revision:playlist.revision}});if(token!==serial)return;WCPlayer.clearPlaylist(playlist.id);data.playlists=data.playlists.filter(item=>item.id!==playlist.id);activeId=data.playlists[0]?.id??null;draft=null;creating=!data.playlists.length;});
  }
  function playback(){
    if(!data||draft||busy)return;
    const playlist=selected();if(!playlist)return;
    const button=node('pl-listen'),playing=current(playlist)&&WCPlayer.snapshot().playing;
    if(button&&!button.disabled)button.innerHTML=WCIcon(playing?'pause':'play')+'<span>'+(playing?'Pause':'Écouter')+'</span>';
    app.querySelectorAll('[data-play]').forEach(el=>{const item=playlist.tracks[Number(el.dataset.play)],active=current(playlist)&&WCPlayer.snapshot().slug===item&&WCPlayer.snapshot().playing;el.setAttribute('aria-pressed',String(active));const svg=el.querySelector('svg');if(svg)svg.outerHTML=WCIcon(active?'pause':'play');});
  }
  async function page(){
    leave();const epoch=newEpoch(),token=++serial;controller=new AbortController();owner=state.user?.id??null;data=null;draft=null;creating=false;creatingName='';busy=false;
    document.title='Playlist · White Cadae';app.innerHTML='<div class="loading">Chargement…</div>';
    try{const result=await request('/api/playlists');if(token!==serial||stale(epoch))return;data=result;activeId=data.playlists.some(item=>item.id===activeId)?activeId:data.playlists[0]?.id??null;creating=!data.playlists.length;window.addEventListener('wc:music',playback);render();}
    catch(error){if(token===serial&&error.name!=='AbortError')app.innerHTML=`<section class="pl-page"><h1>Playlist</h1>${!state.user?accountEntryMarkup('/playlist'):`<p>${e(error.message)}</p>`}</section>`;}
  }
  function leave(){serial++;controller?.abort();controller=null;window.removeEventListener('wc:music',playback);busy=false;}
  function clear(){leave();data=null;draft=null;activeId=null;owner=null;creatingName='';}
  return {page,leave,clear};
})();
