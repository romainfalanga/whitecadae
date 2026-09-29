window.WCRoadmap=(()=>{
  let serial=0,controller=null,activeLevel=null,data=null,photo=null,membersVersion=0;
  const e=value=>esc(value??'');
  const initial=name=>[...String(name||'?')][0].toLocaleUpperCase('fr-FR');
  const portrait=(member,small=false)=>`<span class="road-avatar ${small?'is-small':''}" aria-hidden="true"><span>${e(initial(member.username))}</span>${member.avatar?`<img src="${e(member.avatar)}" alt="" width="80" height="80" loading="lazy" decoding="async">`:''}</span>`;
  function bindImages(root=app){root.querySelectorAll('.road-avatar img').forEach(img=>{img.onerror=()=>img.remove();});}
  function profile(){return data.self?`<section class="road-profile" aria-label="Mon profil"><div class="road-identity">${portrait(data.self)}<div><strong id="road-username">${e(data.self.username)}</strong><span>Échelon ${data.echelon}</span></div></div><button id="road-edit" class="road-text-button" aria-expanded="false" aria-controls="road-profile-form">Modifier mon profil</button>
    <form id="road-profile-form" hidden><label for="road-name">Pseudo</label><input id="road-name" value="${e(data.self.username)}" minlength="3" maxlength="30" required autocomplete="nickname"><label class="road-photo-picker" for="road-photo">Changer ma photo<input id="road-photo" type="file" accept="image/jpeg,image/png,image/webp"></label><div id="road-photo-preview"></div><div class="road-form-actions"><button class="orange-button" type="submit">Enregistrer</button><button id="road-cancel" type="button">Annuler</button></div><button id="road-logout" class="road-text-button" type="button">Se déconnecter</button></form><p id="road-profile-status" role="status" aria-live="polite"></p></section>`:
    `<section class="road-profile"><p>Garde une trace de ton parcours.</p><a class="orange-button" href="/connexion?retour=%2Fechelon" data-link>Se connecter</a><a class="road-register" href="/inscription?retour=%2Fechelon" data-link>Créer un compte</a></section>`;}
  function step(level){
    const past=level<data.echelon,current=level===data.echelon,item=data.steps.find(s=>s.level===level),count=item?.count||0;
    return `<li id="palier-${level}" class="road-step ${past?'is-past':current?'is-current':'is-future'}" ${current?'aria-current="step"':''}>
      <span class="road-node" aria-hidden="true">${String(level).padStart(2,'0')}</span><div class="road-step-content">
      <div class="road-step-title"><h2>Échelon ${level}</h2>${current?'<span class="road-here">Tu es ici</span>':''}</div>
      ${current?`<div class="road-current-person">${data.self?`${portrait(data.self,true)}<strong>${e(data.self.username)}</strong>`:'Ton point de départ'}</div>`:
      past&&count?`<button class="road-people-toggle" data-members="${level}" aria-expanded="false" aria-controls="members-${level}"><span class="road-avatar-stack">${item.members.map(m=>portrait(m,true)).join('')}</span><span>${count} personne${count>1?'s':''}</span><span class="road-plus" aria-hidden="true">＋</span></button>`:
      `<p class="road-step-note">${past?'Chemin parcouru':'À découvrir'}</p>`}
      ${past?`<div id="members-${level}" class="road-members" hidden></div>`:''}</div></li>`;
  }
  async function showMembers(level,after=0){
    const token=serial,version=++membersVersion,box=document.getElementById('members-'+level),toggle=app.querySelector(`[data-members="${level}"]`);
    if(!after){
      if(activeLevel===level){box.hidden=true;toggle.setAttribute('aria-expanded','false');activeLevel=null;return;}
      app.querySelectorAll('.road-members').forEach(el=>{el.hidden=true;el.innerHTML='';});
      app.querySelectorAll('[data-members]').forEach(el=>el.setAttribute('aria-expanded','false'));
      activeLevel=level;box.hidden=false;toggle.setAttribute('aria-expanded','true');box.innerHTML='<p role="status">Chargement…</p>';
    }
    const more=box.querySelector('[data-more]');if(more)more.disabled=true;
    try{
      const result=await api(`/api/roadmap/members?level=${level}&after=${after}`,{signal:controller.signal});
      if(token!==serial||activeLevel!==level||version!==membersVersion)return;
      if(!after)box.innerHTML='<ul></ul>';
      box.querySelector('ul').insertAdjacentHTML('beforeend',result.members.map(m=>`<li>${portrait(m,true)}<span>${e(m.username)}</span></li>`).join(''));
      box.querySelectorAll('[data-more],.road-member-error').forEach(el=>el.remove());
      if(result.next!==null){box.insertAdjacentHTML('beforeend','<button class="road-text-button" data-more>Voir la suite</button>');box.querySelector('[data-more]').onclick=()=>showMembers(level,result.next);}
      if(!after&&!result.members.length)box.innerHTML='<p>Ce palier est désormais libre.</p>';
      bindImages(box);
    }catch(err){if(token!==serial||version!==membersVersion||err.name==='AbortError')return;
      if(more)more.disabled=false;
      if(!after){box.innerHTML='<p class="road-member-error" role="status"></p><button class="road-text-button" data-retry>Réessayer</button>';box.querySelector('p').textContent=err.message;box.querySelector('[data-retry]').onclick=()=>{activeLevel=null;showMembers(level);};}
      else{box.querySelector('.road-member-error')?.remove();box.insertAdjacentHTML('beforeend',`<p class="road-member-error" role="status">${e(err.message)}</p>`);}
    }
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
    const form=document.getElementById('road-profile-form'),edit=document.getElementById('road-edit'),status=document.getElementById('road-profile-status'),token=serial;
    let photoVersion=0;
    const close=()=>{photoVersion++;form.hidden=true;edit.setAttribute('aria-expanded','false');form.reset();photo=null;form.querySelector('[type=submit]').disabled=false;document.getElementById('road-photo-preview').innerHTML='';status.textContent='';};
    edit.onclick=()=>{if(!form.hidden){close();return;}form.hidden=false;edit.setAttribute('aria-expanded','true');document.getElementById('road-name').focus();};
    document.getElementById('road-cancel').onclick=close;
    document.getElementById('road-logout').onclick=async()=>{
      const controls=[...form.elements,edit];controls.forEach(control=>control.disabled=true);
      try{await api('/api/logout',{method:'POST'});await refreshSession();if(token===serial)navigate('/echelon',true);}
      catch(err){if(token===serial){status.textContent=err.message;controls.forEach(control=>control.disabled=false);}}
    };
    document.getElementById('road-photo').onchange=async event=>{const file=event.target.files[0],version=++photoVersion;photo=null;if(!file)return;
      const save=form.querySelector('[type=submit]');save.disabled=true;status.textContent='Préparation de la photo…';
      try{const prepared=await preparePhoto(file);if(token!==serial||version!==photoVersion)return;photo=prepared;document.getElementById('road-photo-preview').innerHTML=`<img src="${prepared}" alt="Aperçu de ma photo" width="80" height="80">`;status.textContent='';}
      catch(err){if(token===serial&&version===photoVersion)status.textContent=err.message;}
      finally{if(token===serial&&version===photoVersion)save.disabled=false;}
    };
    form.onsubmit=async event=>{event.preventDefault();const save=form.querySelector('[type=submit]');const controls=[...form.elements,edit];controls.forEach(control=>control.disabled=true);status.textContent='Enregistrement…';
      try{
        const username=document.getElementById('road-name').value.trim();
        const result=await api('/api/account/username',{method:'PUT',body:{username},signal:controller.signal});
        if(token!==serial)return;
        data.self.username=result.username;if(state.user)state.user.username=result.username;
        // Each successful field remains visible even if the other update fails.
        document.getElementById('road-username').textContent=result.username;
        document.querySelector('.road-current-person strong').textContent=result.username;
        document.getElementById('road-name').defaultValue=result.username;
        if(photo){await api('/api/account/avatar',{method:'POST',body:{data:photo},signal:controller.signal});if(token!==serial)return;data.self.avatar=`/api/roadmap/avatar/${data.self.id}?v=${Date.now()}`;}
        document.querySelector('.road-identity .road-avatar').outerHTML=portrait(data.self);
        document.querySelector('.road-current-person .road-avatar').outerHTML=portrait(data.self,true);
        bindImages();close();status.textContent='Profil mis à jour.';
      }catch(err){if(token===serial&&err.name!=='AbortError')status.textContent=err.message;}
      finally{if(token===serial)controls.forEach(control=>control.disabled=false);}
    };
  }
  async function page(){
    const epoch=newEpoch(),token=++serial;controller=new AbortController();activeLevel=null;photo=null;
    app.innerHTML='<div class="loading">Chargement du parcours…</div>';document.title='Échelon · White Cadae';
    try{
      data=await api('/api/roadmap',{signal:controller.signal});if(token!==serial||stale(epoch))return;
      app.innerHTML=`<section class="road-page"><header class="road-header"><div><p class="eyebrow">Un signe après l’autre</p><h1>Échelon</h1><p class="road-intro">Ton chemin s’éclaire à chaque découverte.</p></div><div class="road-score"><strong>${data.echelon}</strong><span>/ ${data.total}</span></div></header>
        <div class="road-layout"><aside class="road-sidebar">${profile()}<div class="road-tools"><button id="road-locate">Me situer <span aria-hidden="true">↓</span></button><a href="/signes" data-link>Trouver des signes <span aria-hidden="true">↗</span></a></div><p class="road-caption">Seuls les membres des échelons que tu as dépassés apparaissent sur ton chemin.</p></aside>
        <ol class="road-line" aria-label="Parcours des 33 échelons">${Array.from({length:data.total},(_,i)=>step(i+1)).join('')}</ol></div></section>`;
      app.querySelectorAll('[data-members]').forEach(button=>button.onclick=()=>showMembers(Number(button.dataset.members)));
      document.getElementById('road-locate').onclick=()=>document.getElementById('palier-'+data.echelon).scrollIntoView({block:'center',behavior:'auto'});
      bindImages();bindProfile();
    }catch(err){if(token===serial&&err.name!=='AbortError'&&!stale(epoch)){app.innerHTML=`<h1>Échelon</h1><p role="status">${e(err.message)}</p><button id="road-retry">Réessayer</button>`;document.getElementById('road-retry').onclick=page;}}
  }
  function leave(){serial++;controller?.abort();controller=null;activeLevel=null;photo=null;}
  return {page,leave};
})();
