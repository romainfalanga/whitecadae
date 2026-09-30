// Compare occupied, visible rungs only: a hidden population must not affect colour.
// Equal populations share orange. Never round: nearby populations keep nearby hues.
function roadmapColors(steps,visibleLevel){
  const occupied=steps.filter(step=>Number.isInteger(step.level)&&step.level>=1&&step.level<=visibleLevel&&Number.isSafeInteger(step.count)&&step.count>0);
  const counts=occupied.map(step=>step.count),low=Math.min(...counts),high=Math.max(...counts);
  return new Map(occupied.map(step=>[step.level,low===high?28:8+40*(step.count-low)/(high-low)]));
}

window.WCRoadmap=(()=>{
  let serial=0,controller=null,data=null,photo=null;
  const pendingMembers=new Set();
  let colors=new Map();
  let releaseStars=null;
  const e=value=>esc(value??'');
  const initial=name=>[...String(name||'?')][0].toLocaleUpperCase('fr-FR');
  const portrait=(member,small=false)=>`<span class="road-avatar ${small?'is-small':''}" aria-hidden="true"><span>${e(initial(member.username))}</span>${member.avatar?`<img src="${e(member.avatar)}" alt="" width="80" height="80" loading="lazy" decoding="async">`:''}</span>`;
  function bindImages(root=app){root.querySelectorAll('.road-avatar img').forEach(img=>{img.onerror=()=>img.remove();});}
  function profile(){return `<section class="road-profile" aria-label="Mon compte"><div class="road-identity">${portrait(data.self)}<div><strong id="road-username">${e(data.self.username)}</strong></div></div><button id="road-edit" class="road-text-button" aria-expanded="false" aria-controls="road-settings">Modifier mon profil</button>
    <div id="road-settings" hidden>
      <form id="road-profile-form"><label for="road-name">Pseudo</label><input id="road-name" value="${e(data.self.username)}" minlength="3" maxlength="30" required autocomplete="nickname"><label class="road-photo-picker" for="road-photo">Changer ma photo<input id="road-photo" type="file" accept="image/jpeg,image/png,image/webp"></label><div id="road-photo-preview"></div><div class="road-form-actions"><button class="orange-button" type="submit">Enregistrer</button><button id="road-cancel" type="button">Annuler</button></div></form>
      <div class="road-credentials"><label for="road-email">Adresse mail</label><input id="road-email" type="email" value="${e(data.self.email)}" readonly aria-describedby="road-email-note"><p id="road-email-note">Cette adresse ne peut pas être modifiée.</p>
      <details class="road-security"><summary>Changer mon mot de passe</summary><form id="road-password-form"><input type="hidden" name="username" value="${e(data.self.email)}" autocomplete="username"><label for="road-current-password">Mot de passe actuel</label><input id="road-current-password" type="password" autocomplete="current-password" required><label for="road-new-password">Nouveau mot de passe</label><input id="road-new-password" type="password" autocomplete="new-password" minlength="8" required aria-describedby="road-password-hint"><p id="road-password-hint">8 caractères minimum.</p><label for="road-confirm-password">Confirmer le nouveau mot de passe</label><input id="road-confirm-password" type="password" autocomplete="new-password" minlength="8" required><div class="road-form-actions"><button class="orange-button" type="submit">Modifier le mot de passe</button><button id="road-password-cancel" type="button">Annuler</button></div><p id="road-password-status" role="status" aria-live="polite"></p></form></details></div>
      <button id="road-logout" class="road-text-button" type="button">Se déconnecter</button>
    </div><p id="road-profile-status" role="status" aria-live="polite"></p></section>`;}
  function step(level){
    const past=level<data.echelon,current=level===data.echelon,item=data.steps.find(s=>s.level===level),count=item?.count||0;
    const visible=!!data.self&&level<=data.echelon,hue=colors.get(level)??8,nextHue=colors.get(level+1)??8;
    return `<li id="palier-${level}" class="road-step ${past?'is-past':current?'is-current':'is-future'} ${visible&&count?'is-populated':''}" style="--star-hue:${hue};--next-hue:${nextHue}" ${current?'aria-current="step"':''}>
      <span class="road-node" aria-hidden="true" ${past||current?`data-stellar="${hue}" data-star-seed="${level}"`:''}><span class="road-sphere"></span></span><div class="road-step-content">
      <div class="road-step-title"><h2>Échelon ${level}</h2>${current?'<span class="road-here">Tu es ici</span>':''}</div>
      ${visible?(count?`<button class="road-people-toggle" data-members="${level}" aria-expanded="false" aria-controls="members-${level}"><span>${count} personne${count>1?'s':''}<span class="sr-only"> à l’échelon ${level}</span></span><span class="road-plus" aria-hidden="true">+</span></button>`:'<p class="road-empty">0 personne</p>'):''}
      ${visible?`<div id="members-${level}" class="road-members" hidden></div>`:''}</div></li>`;
  }
  function toggleMembers(level){
    const box=document.getElementById('members-'+level),toggle=app.querySelector(`[data-members="${level}"]`);
    box.hidden=!box.hidden;
    toggle.setAttribute('aria-expanded',String(!box.hidden));
    toggle.querySelector('.road-plus').textContent=box.hidden?'+':'−';
    if(!box.hidden&&!box.dataset.loaded)showMembers(level);
  }
  async function showMembers(level,after=0){
    if(pendingMembers.has(level))return;
    const token=serial,box=document.getElementById('members-'+level);
    pendingMembers.add(level);
    if(!after)box.innerHTML='<p role="status">Chargement…</p>';
    const more=box.querySelector('[data-more]');if(more)more.disabled=true;
    try{
      const result=await api(`/api/roadmap/members?level=${level}&after=${after}`,{signal:controller.signal});
      if(token!==serial)return;
      if(!after)box.innerHTML='<ul></ul>';
      box.querySelector('ul').insertAdjacentHTML('beforeend',result.members.map(m=>`<li data-member="${m.id}">${portrait(m,true)}<span>${e(m.username)}</span></li>`).join(''));
      box.querySelectorAll('[data-more],.road-member-error').forEach(el=>el.remove());
      if(result.next!==null){box.insertAdjacentHTML('beforeend','<button class="road-text-button" data-more>Voir la suite</button>');box.querySelector('[data-more]').onclick=()=>showMembers(level,result.next);}
      if(!after&&!result.members.length)box.innerHTML='<p>Ce palier est désormais libre.</p>';
      box.dataset.loaded='true';
      bindImages(box);
    }catch(err){if(token!==serial||err.name==='AbortError')return;
      if(more)more.disabled=false;
      if(!after){box.innerHTML='<p class="road-member-error" role="status"></p><button class="road-text-button" data-retry>Réessayer</button>';box.querySelector('p').textContent=err.message;box.querySelector('[data-retry]').onclick=()=>showMembers(level);}
      else{box.querySelector('.road-member-error')?.remove();box.insertAdjacentHTML('beforeend',`<p class="road-member-error" role="status">${e(err.message)}</p>`);}
    }finally{if(token===serial)pendingMembers.delete(level);}
  }
  async function preparePhoto(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Choisis une photo JPG, PNG ou WebP de moins de 8 Mo.');
    const image=typeof createImageBitmap==='function'?await createImageBitmap(file):await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(Error('Photo illisible.'));reader.onload=()=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Photo illisible.'));img.src=reader.result;};reader.readAsDataURL(file);
    }),canvas=document.createElement('canvas');
    try{canvas.width=canvas.height=256;const context=canvas.getContext('2d');const side=Math.min(image.width,image.height);
      context.fillStyle='#15151a';context.fillRect(0,0,256,256);context.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,256,256);
      return canvas.toDataURL('image/jpeg',.84);
    }finally{image.close?.();}
  }
  function bindProfile(){
    if(!data.self)return;
    const settings=document.getElementById('road-settings'),form=document.getElementById('road-profile-form'),edit=document.getElementById('road-edit'),status=document.getElementById('road-profile-status'),token=serial;
    const passwordForm=document.getElementById('road-password-form'),passwordStatus=document.getElementById('road-password-status'),confirm=document.getElementById('road-confirm-password');
    const controls=[...settings.querySelectorAll('input,button'),edit];
    let photoVersion=0;
    const resetPassword=()=>{passwordForm.reset();confirm.setCustomValidity('');passwordStatus.textContent='';};
    const close=()=>{photoVersion++;settings.hidden=true;edit.setAttribute('aria-expanded','false');form.reset();photo=null;form.querySelector('[type=submit]').disabled=false;document.getElementById('road-photo-preview').innerHTML='';status.textContent='';resetPassword();settings.querySelector('details').open=false;edit.focus();};
    edit.onclick=()=>{if(!settings.hidden){close();return;}settings.hidden=false;status.textContent='';edit.setAttribute('aria-expanded','true');document.getElementById('road-name').focus();};
    document.getElementById('road-cancel').onclick=close;
    document.getElementById('road-logout').onclick=async()=>{
      controls.forEach(control=>control.disabled=true);
      try{await api('/api/logout',{method:'POST'});await refreshSession();if(token===serial)navigate('/echelon',true);}
      catch(err){if(token===serial){status.textContent=err.message;controls.forEach(control=>control.disabled=false);}}
    };
    document.getElementById('road-photo').onchange=async event=>{const file=event.target.files[0],version=++photoVersion;photo=null;document.getElementById('road-photo-preview').innerHTML='';if(!file){form.querySelector('[type=submit]').disabled=false;status.textContent='';return;}
      const save=form.querySelector('[type=submit]');save.disabled=true;status.textContent='Préparation de la photo…';
      try{const prepared=await preparePhoto(file);if(token!==serial||version!==photoVersion)return;photo=prepared;document.getElementById('road-photo-preview').innerHTML=`<img src="${prepared}" alt="Aperçu de ma photo" width="80" height="80">`;status.textContent='';}
      catch(err){if(token===serial&&version===photoVersion)status.textContent=err.message;}
      finally{if(token===serial&&version===photoVersion)save.disabled=false;}
    };
    form.onsubmit=async event=>{event.preventDefault();controls.forEach(control=>control.disabled=true);status.textContent='Enregistrement…';
      try{
        const username=document.getElementById('road-name').value.trim();
        const result=await api('/api/account/username',{method:'PUT',body:{username},signal:controller.signal});
        if(token!==serial)return;
        data.self.username=result.username;if(state.user)state.user.username=result.username;
        // Each successful field remains visible even if the other update fails.
        document.getElementById('road-username').textContent=result.username;
        document.getElementById('road-name').defaultValue=result.username;
        if(photo){await api('/api/account/avatar',{method:'POST',body:{data:photo},signal:controller.signal});if(token!==serial)return;data.self.avatar=`/api/roadmap/avatar/${data.self.id}?v=${Date.now()}`;}
        document.querySelector('.road-identity .road-avatar').outerHTML=portrait(data.self);
        app.querySelectorAll(`[data-member="${data.self.id}"]`).forEach(row=>{row.innerHTML=portrait(data.self,true)+`<span>${e(data.self.username)}</span>`;});
        bindImages();close();status.textContent='Profil mis à jour.';
      }catch(err){if(token===serial&&err.name!=='AbortError')status.textContent=err.message;}
      finally{if(token===serial){controls.forEach(control=>control.disabled=false);if(settings.hidden)edit.focus();}}
    };
    passwordForm.oninput=()=>confirm.setCustomValidity('');
    document.getElementById('road-password-cancel').onclick=()=>{resetPassword();settings.querySelector('details').open=false;settings.querySelector('summary').focus();};
    passwordForm.onsubmit=async event=>{
      event.preventDefault();
      const next=document.getElementById('road-new-password').value;
      if(confirm.value!==next){confirm.setCustomValidity('Les deux mots de passe ne correspondent pas.');confirm.reportValidity();return;}
      controls.forEach(control=>control.disabled=true);passwordStatus.textContent='Modification…';
      try{
        await api('/api/account/password',{method:'PUT',body:{current_password:document.getElementById('road-current-password').value,new_password:next},signal:controller.signal});
        if(token!==serial)return;
        resetPassword();passwordStatus.textContent='Mot de passe modifié. Les autres sessions ont été déconnectées.';
      }catch(err){if(token===serial&&err.name!=='AbortError')passwordStatus.textContent=err.message;}
      finally{if(token===serial)controls.forEach(control=>control.disabled=false);}
    };
  }
  async function page(){
    const epoch=newEpoch(),token=++serial;controller?.abort();controller=new AbortController();pendingMembers.clear();photo=null;releaseStars?.();releaseStars=null;
    app.innerHTML='<div class="loading">Chargement du parcours…</div>';document.title='Échelons · White Cadae';
    try{
      data=await api('/api/roadmap',{signal:controller.signal});if(token!==serial||stale(epoch))return;
      colors=roadmapColors(data.steps,data.echelon);
      app.innerHTML=`<section class="road-page"><header class="road-header"><h1>Échelons</h1><div class="road-score" aria-label="Échelon ${data.echelon} sur ${data.total}"><strong>${data.echelon}</strong><span>/ ${data.total}</span></div></header>
        ${data.self?'':accountEntryMarkup('/echelon')}
        <div class="road-layout ${data.self?'':'is-anonymous'}">${data.self?`<aside class="road-sidebar">${profile()}</aside>`:''}
        <ol class="road-line" aria-label="Parcours des 33 échelons">${Array.from({length:data.total},(_,i)=>step(i+1)).join('')}</ol></div></section>`;
      app.querySelectorAll('[data-members]').forEach(button=>button.onclick=()=>toggleMembers(Number(button.dataset.members)));
      bindImages();bindProfile();releaseStars=window.WCStellar?.mount(app);
    }catch(err){if(token===serial&&err.name!=='AbortError'&&!stale(epoch)){app.innerHTML=`<h1>Échelons</h1><p role="status">${e(err.message)}</p><button id="road-retry">Réessayer</button>`;document.getElementById('road-retry').onclick=page;}}
  }
  function leave(){serial++;controller?.abort();controller=null;pendingMembers.clear();photo=null;releaseStars?.();releaseStars=null;}
  return {page,leave};
})();
