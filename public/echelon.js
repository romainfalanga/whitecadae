/* UI only. The server supplies the discovered territory, never future answers. */
window.WCGame=(()=>{
  let data=null,currentPath='',serial=0,timers=[],sending=false;
  const boards=new Map();
  let activeBoard=null;
  const positions=new Map();
  const e=s=>esc(s??'');
  const pageBy=id=>data?.pages.find(p=>p.id===id);
  function art(type){
    if(type==='infinity')return '<svg class="eg-art eg-infinity" viewBox="0 0 290 130" role="img" aria-label="Un M dans chaque boucle du signe infini"><path d="M145 65C105 7 30 7 30 65S105 123 145 65C185 7 260 7 260 65S185 123 145 65Z"/><text x="78" y="76">M</text><text x="212" y="76">M</text></svg>';
    return '';
  }
  const versions=new Map();
  const isClock=()=>location.pathname==='/signes/horloge';
  function link(p){const local=p.href.split('#')[0]===location.pathname;return `<a href="${e(local?'#'+p.id:p.href)}" ${local?'':'data-link'}>${e(p.title)}</a>`;}
  function login(){const query='?retour='+encodeURIComponent(location.pathname+location.hash);return `<div class="eg-account"><a class="orange-button" href="/connexion${query}" data-link>Se connecter</a><a href="/inscription${query}" data-link>Créer un compte</a></div>`;}
  function header(){return `<header class="eg-header"><div>${isClock()?'<nav class="eg-breadcrumb" aria-label="Fil d’Ariane"><a href="/signes" data-link>Signes</a></nav>':'<p class="eyebrow">Escape Game Orange</p>'}<h1>${isClock()?'Horloge':'Signes'}</h1></div><div class="eg-level" aria-label="Échelon actuel"><span>Échelon</span><strong>${data.echelon}</strong></div></header>`;}
  function locked(p){const r=p.requirements||{},deps=(r.pages||[]).map(d=>pageBy(d.id)).filter(Boolean);return `<p class="eg-lock">Verrouillé${r.level?` · Échelon ${r.level}`:''}${deps.length?` · Termine ${deps.map(link).join(', ')}`:''}</p>`;}
  function feedback(message,id,opened=[]){const box=id?document.querySelector(`#${id} .eg-feedback`):document.getElementById('eg-feedback');if(box){box.textContent=message;if(opened.length)box.insertAdjacentHTML('beforeend',`<div class="eg-new-access"><strong>Nouveau dans ton parcours</strong>${opened.map(item=>`<a href="${e(item.href)}" data-link>${e(item.title)} →</a>`).join('')}</div>`);box.classList.add('is-visible');}}
  function accept(next){if(data&&next.echelon<data.echelon)return;if(data?.capabilities.share)next.capabilities.share=true;data=next;}
  function found(p){return `<div class="eg-found"><ul>${p.found.map(a=>`<li><span aria-hidden="true">✧</span> ${e(a.label)}</li>`).join('')}${p.partiels.map(v=>`<li class="eg-partial">${v.jetons.map(t=>e(t.sep)+(t.q?'?':`<strong>${e(t.t)}</strong>`)).join('')}</li>`).join('')}</ul>${p.total?`<span>${p.found.length} / ${p.total} ${p.total>1?'signes':'signe'}</span>`:''}</div>`;}
  const notice=()=>'<div class="eg-feedback" role="status" aria-live="polite"></div>';
  function riddle(p){return `<article id="${e(p.id)}" class="eg-entry ${p.visual?'has-art':''} ${p.locked?'is-locked':''}" ${p.title?`aria-labelledby="title-${e(p.id)}"`:'aria-label="Mot de passe"'} tabindex="-1">${art(p.visual,true)}<div class="eg-entry-main">${p.title?`<h2 id="title-${e(p.id)}" tabindex="-1">${e(p.title)}</h2>`:''}${found(p)}${p.locked?locked(p):p.open?`<form class="eg-answer" data-answer="${e(p.id)}"><label class="sr-only" for="input-${e(p.id)}">${p.title?`Signe pour ${e(p.title)}`:'Mot de passe'}</label><div><input id="input-${e(p.id)}" name="answer" placeholder="${p.title?'Proposer un signe':'Mot de passe'}" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" required ${data.anonyme?'disabled':''}><button type="submit" class="orange-button" ${data.anonyme?'disabled':''}>Valider</button></div></form>`:'<p class="eg-complete">Tous les signes sont trouvés.</p>'}${p.id==='eg-03'&&pageBy('eg-10')?'<a class="eg-clock-link" href="/signes/horloge" data-link>Ouvrir Horloge →</a>':''}${notice()}</div></article>`;}
  function lab(p){const solved=!p.open;return `<section id="${e(p.id)}" class="eg-lab ${solved?'is-solved':''}" aria-labelledby="title-${e(p.id)}" data-solved="${solved}"><h2 id="title-${e(p.id)}" tabindex="-1">${solved?`<span>${e(p.title)}</span><span class="eg-solved-label">✓ Résolue</span>`:`<button data-open-board="${e(p.id)}" aria-expanded="false" aria-controls="panel-${e(p.id)}"><span>${e(p.title)}</span><span class="eg-open-label">Ouvrir</span></button>`}</h2><p class="eg-subtitle">${e(p.subtitle)}</p>${solved?'':notice()}${solved?'':`<div id="panel-${e(p.id)}" class="eg-lab-body" hidden>${p.locked?locked(p):`<div id="bench-${e(p.id)}" class="eg-workbench" aria-busy="true">Chargement…</div>`}</div>`}</section>`;}
  function selectBoard(id){activeBoard=activeBoard===id?null:id;sync();history.replaceState(null,'',activeBoard?'#'+id:location.pathname);if(activeBoard)document.getElementById(id)?.scrollIntoView({block:'start'});}
  function sync(){
    document.querySelectorAll('.eg-level strong').forEach(el=>el.textContent=data.echelon);
    const continuation=document.getElementById('eg-continuation'),markup=continuationMarkup(data.continuation);
    if(continuation&&continuation.innerHTML!==markup)continuation.innerHTML=markup;
    const root=document.getElementById('eg-game-content');if(!root)return;
    if(isClock()){
      for(const p of data.nodes.filter(n=>n.kind==='workshop')){
        let el=document.getElementById(p.id);
        if(!el){root.insertAdjacentHTML('beforeend',lab(p));el=document.getElementById(p.id);}
        else if(el.dataset.solved!==String(!p.open)){
          boards.get(p.id)?.finish();boards.delete(p.id);el.outerHTML=lab(p);el=document.getElementById(p.id);
          if(!p.open&&activeBoard===p.id)activeBoard=null;
        }
        const toggle=el.querySelector('[data-open-board]'),panel=el.querySelector('.eg-lab-body'),expanded=p.open&&activeBoard===p.id;
        if(toggle){toggle.onclick=()=>selectBoard(p.id);toggle.setAttribute('aria-expanded',String(expanded));toggle.querySelector('.eg-open-label').textContent=expanded?'Réduire':'Ouvrir';}
        if(panel)panel.hidden=!expanded;
        if(expanded&&!p.locked&&!boards.has(p.id)){const instance=createBoard(p,serial);boards.set(p.id,instance);instance.load();}
      }
    }else{
      const riddles=data.nodes.filter(n=>n.kind==='riddle');
      for(const [index,p] of riddles.entries()){
        const version=JSON.stringify(p),old=document.getElementById(p.id);
        if(old&&versions.get(p.id)===version)continue;
        const active=old?.contains(document.activeElement),value=old?.querySelector('input')?.value;
        if(old)old.outerHTML=riddle(p);else{
          const next=riddles.slice(index+1).map(n=>document.getElementById(n.id)).find(Boolean);
          if(next)next.insertAdjacentHTML('beforebegin',riddle(p));else root.insertAdjacentHTML('beforeend',riddle(p));
        }
        versions.set(p.id,version);
        const el=document.getElementById(p.id),form=el.querySelector('form');
        if(form){if(value)form.elements.answer.value=value;form.onsubmit=event=>{event.preventDefault();submit(pageBy(p.id),{answer:form.elements.answer.value.trim()},form.querySelector('button'));};}
        if(active)(form?.elements.answer||el.querySelector('h2')||el).focus({preventScroll:true});
      }
    }
  }
  function render(){
    versions.clear();
    if(isClock()&&!pageBy('eg-10')){app.innerHTML='<section class="eg-page"><h1>Ce chemin n’est pas disponible.</h1><a href="/signes" data-link>Retrouver Signes →</a></section>';return;}
    app.innerHTML=`<section class="eg-page">${header()}<div id="eg-continuation" aria-live="polite"></div><div id="eg-feedback" class="eg-feedback" role="status" aria-live="polite"></div>${data.anonyme?login():''}<div id="eg-game-content" class="${isClock()?'eg-labs':'eg-entries'}"></div></section>`;
    document.title=`${isClock()?'Horloge · ':''}Signes · White Cadae`;
    sync();
  }
  async function submit(p,payload,button){
    if(sending)return;sending=true;const token=serial,before=data,anchor=document.getElementById(p.id),top=anchor?.getBoundingClientRect().top;if(button)button.disabled=true;
    try{
      const result=await api('/api/signes/guess',{method:'POST',body:{id:p.id,...payload}});
      if(token!==serial)return;
      const newlyVisible=result.state.nodes.some(n=>!before.nodes.some(old=>old.id===n.id));
      accept(result.state);sync();
      if(result.ok){const input=document.getElementById(`input-${p.id}`);if(input)input.value='';}
      if(top!==undefined){const after=document.getElementById(p.id);if(after&&p.kind==='workshop'&&!pageBy(p.id)?.open){after.scrollIntoView({block:'start'});after.querySelector('h2')?.focus({preventScroll:true});}else if(after)window.scrollBy(0,after.getBoundingClientRect().top-top);}
      const opened=[...(result.opened||[])];
      const reachedContinuation=!before.continuation&&data.continuation;
      feedback(result.gained?`+${result.gained} ${result.gained>1?'échelons':'échelon'}.${newlyVisible?' Une nouvelle énigme apparaît.':''}`:result.message||'Une partie de ce signe est trouvée.',p.id,opened);
      if(reachedContinuation)document.getElementById('eg-continuation')?.scrollIntoView({block:'start'});
      if(result.gained){await refreshSession();if(token===serial)renderNav();}
    }catch(err){if(token===serial){feedback(err.message,p.id);if(err.data?.attenteMs&&button){let remaining=Math.ceil(err.data.attenteMs/1000);const label=button.textContent;const timer=setInterval(()=>{if(token!==serial||--remaining<=0){clearInterval(timer);if(token===serial){button.disabled=false;button.textContent=label;}}else button.textContent=`Réessayer dans ${remaining}s`;},1000);timers.push(timer);return;}}}
    finally{if(token===serial)sending=false;}
    if(token===serial&&button)button.disabled=false;
  }
  async function page(){const epoch=newEpoch(),token=++serial;currentPath=location.pathname;app.innerHTML='<div class="loading">Chargement…</div>';try{data=await api('/api/signes');if(token!==serial||stale(epoch))return;activeBoard=data.nodes.some(n=>n.id===location.hash.slice(1)&&n.open)?location.hash.slice(1):null;render();const anchor=location.hash.slice(1),y=positions.get(currentPath);if(anchor&&/^[a-z0-9-]+$/.test(anchor))document.getElementById(anchor)?.scrollIntoView();else if(y)requestAnimationFrame(()=>window.scrollTo(0,y));}catch(err){if(token===serial)app.innerHTML=`<h1>Signes</h1><p>${e(err.message)}</p><a href="/signes" data-link>Réessayer</a>`;}}
  function leave(){if(currentPath){positions.set(currentPath,window.scrollY);currentPath='';}serial++;sending=false;timers.forEach(clearInterval);timers=[];for(const b of boards.values())b.leave();boards.clear();}

  function createBoard(p,token){
    let spec,core,logic,flow,draft,revision=0,undo=[],redo=[],timer,saving,dirty=false,conflict=false,disposed=false;
    const key=`wc_echelon_draft_${state.user?.id}_${p.id}`,rootId='bench-'+p.id;
    const copy=x=>structuredClone(x),mounted=()=>!disposed&&token===serial&&!!document.getElementById(rootId);
    const val=x=>core.evaluate(x,spec.sources),label=x=>core.formatBlock(val(x),spec.format),source=x=>spec.sources.find(s=>s.id===x.ref);
    const symbols={add:'+',sub:'−',mul:'×',div:'÷',join:'│',group:'réparti en'};
    function tell(message){const el=document.getElementById(rootId)?.querySelector('[data-flow-status]');if(el){el.textContent=message;el.classList.add('is-error');}}
    function local(){try{localStorage.setItem(key,JSON.stringify({draft,revision,pending:dirty,updatedAt:Date.now()}));}catch{}}
    function schedule(){dirty=true;local();clearTimeout(timer);timer=setTimeout(flush,650);}
    function saveLabel(message){const el=document.getElementById(rootId)?.querySelector('[data-save]');if(el)el.textContent=message;}
    async function flush(){
      clearTimeout(timer);if(!draft||!dirty||conflict)return;
      if(saving){await saving;if(dirty&&!conflict)return flush();return;}
      const snapshot=JSON.stringify(draft);
      saving=(async()=>{try{
        const result=await api(`/api/signes/draft/${p.id}`,{method:'POST',body:{draft:JSON.parse(snapshot),revision}});
        revision=result.revision;dirty=JSON.stringify(draft)!==snapshot;local();
        if(mounted()){accept(result.state);sync();saveLabel('Sauvegardé');}
      }catch(err){if(err.status===409){conflict=true;if(mounted()){paint();tell(err.message);}}else if(mounted())saveLabel('Conservé sur cet appareil');}
      })();await saving;saving=null;
    }
    function change(next,remember=true){
      core.validDraft(next.draft,spec);
      if(remember){undo.push(copy(flow));if(undo.length>35)undo.shift();redo=[];}
      flow=next;draft=next.draft;paint();schedule();
    }
    function action(fn){try{fn();}catch(err){tell(err.message);}}
    function canTransform(op){try{logic.transform(flow,spec,op);return true;}catch{return false;}}
    function paint(){
      if(!mounted()||!draft||!pageBy(p.id)?.open)return;
      const root=document.getElementById(rootId),active=document.activeElement,focus=root.contains(active)?active.dataset?.focus:null;
      const scrollTop=window.scrollY;
      const selected=draft.selected,x=draft.items[selected[0]],y=draft.items[selected[1]],operation=flow.operator;
      const ready=!draft.items.length&&draft.answer.every(Boolean);
      let preview=null,calculationError='';if(operation&&y)try{preview=label({op:operation,left:x,right:y});}catch(err){calculationError=err.message;}
      const message=calculationError||(ready?'Ta réponse est prête à être validée.':!x?'Choisis un bloc ci-dessous.':!operation?'Choisis une action ou place ce bloc dans ta réponse.':!y?'Choisis le second bloc ci-dessous.':'Vérifie le calcul, puis touche Calculer.');
      root.setAttribute('aria-busy','false');
      root.innerHTML=`<div class="eg-studio">
        ${conflict?'<div class="eg-conflict">Un autre appareil a modifié ce brouillon.<button data-action="remote">Charger sa version</button><button data-action="local">Garder ma version</button></div>':''}
        <p class="eg-flow-status ${calculationError?'is-error':''}" data-flow-status role="status">${e(message)}</p>
        <div class="eg-bank" aria-label="Blocs disponibles">${draft.items.map((block,i)=>selected.includes(i)?'':`<button data-tile="${i}" data-focus="tile-${i}" aria-label="Choisir ${e(label(block))} · ${e(block.ref?source(block).label:block.op==='reuse'?'copie':'résultat')}"><strong>${e(label(block))}</strong><small>${e(block.ref?source(block).label.split(' · ').at(-1):block.op==='reuse'?'copie':'résultat')}</small></button>`).join('')||`<span>${ready?'Tous les blocs sont placés.':x?'Les blocs choisis sont dans ton calcul.':'Aucun bloc disponible.'}</span>`}</div>
        <div class="eg-equation" aria-label="Calcul en cours" ${ready?'hidden':''}>
          ${x?`<button class="eg-operand" data-clear="all" data-focus="left" aria-label="Reposer le bloc ${e(label(x))}"><strong>${e(label(x))}</strong><small>Reposer</small></button>`:'<span class="eg-operand empty">Un bloc</span>'}
          ${operation?`<button class="eg-operator" data-clear="operation" data-focus="operator" aria-label="Changer l’opération ${e(symbols[operation])}">${e(symbols[operation])}<small>changer</small></button>${y?`<button class="eg-operand" data-clear="right" data-focus="right" aria-label="Reposer le second bloc ${e(label(y))}"><strong>${e(label(y))}</strong><small>Reposer</small></button>`:'<span class="eg-operand empty">Second bloc</span>'}`:x?'<span class="eg-equation-hint">Une action<br>ou une case de réponse</span>':'<span class="eg-equation-hint">Ton calcul apparaîtra ici</span>'}
        </div>
        ${operation?`<div class="eg-compute">${preview!==null?`<span>= <strong>${e(preview)}</strong></span>`:'<span>Le premier bloc est conservé pendant ton choix.</span>'}<button data-calculate data-focus="calculate" class="orange-button" ${preview===null?'disabled':''}>Calculer</button></div>`:x?`<div class="eg-actions" aria-label="Actions sur le bloc choisi">${logic.operations.map(([op,symbol,title])=>`<button data-op="${op}" data-focus="op-${op}" aria-label="${title}"><b aria-hidden="true">${symbol}</b><span>${title}</span></button>`).join('')}<button data-transform="reuse" data-focus="reuse" ${canTransform('reuse')?'':'disabled'}>Dupliquer</button><button data-transform="split" data-focus="split" ${canTransform('split')?'':'disabled'}>Séparer les chiffres</button></div>`:''}
        <div class="eg-answer-dock"><h3>Ma réponse</h3><div class="eg-answer-slots">${spec.slots.map((slot,i)=>{
          const block=draft.answer[i],canPlace=!!x&&!operation;
          return `<button data-slot="${i}" data-focus="slot-${i}" class="${block?'filled':''}" ${slot.fixed||(!block&&!canPlace)?'disabled':''} aria-label="${e(slot.label)} : ${slot.fixed?'07, déjà placé':block?'reprendre '+e(label(block)):canPlace?'placer '+e(label(x)):'choisir un bloc'}"><span>${e(slot.label)}</span><strong>${block?e(label(block)):'—'}</strong><small>${slot.fixed?'Juillet → 07':block?'Reprendre':canPlace?'Placer '+e(label(x)):'À compléter'}</small></button>`;
        }).join('')}</div>
          <form data-validate><button class="orange-button" type="submit" ${!ready||conflict?'disabled':''}>Valider ma réponse</button></form>
        </div>
        <div class="eg-studio-footer"><button data-action="undo" data-focus="undo" ${!undo.length?'disabled':''}>↶ Annuler</button><button data-action="redo" data-focus="redo" ${!redo.length?'disabled':''}>Rétablir ↷</button><span data-save>${dirty?'Enregistrement…':'Sauvegardé'}</span></div>
        <div class="eg-secondary-actions">${canTransform('detach')?'<button data-transform="detach" data-focus="detach">Détacher le bloc</button>':''}${canTransform('discard')?'<button data-transform="discard" data-focus="discard">Retirer la copie</button>':''}<button data-action="reset">Recommencer</button></div>
      </div>`;
      root.querySelectorAll('[data-tile]').forEach(el=>el.onclick=()=>action(()=>change(logic.chooseBlock(flow,+el.dataset.tile),false)));
      root.querySelectorAll('[data-op]').forEach(el=>el.onclick=()=>action(()=>change(logic.chooseOperation(flow,el.dataset.op),false)));
      root.querySelectorAll('[data-clear]').forEach(el=>el.onclick=()=>action(()=>change(logic.cancelSelection(flow,el.dataset.clear),false)));
      root.querySelectorAll('[data-transform]').forEach(el=>el.onclick=()=>action(()=>change(logic.transform(flow,spec,el.dataset.transform))));
      root.querySelector('[data-calculate]')?.addEventListener('click',()=>action(()=>change(logic.transform(flow,spec))));
      root.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>action(()=>change(logic.placeBlock(flow,spec,+el.dataset.slot))));
      root.querySelectorAll('[data-action]').forEach(el=>el.onclick=async()=>{const a=el.dataset.action;
        if(a==='reset')change(logic.restoreFlow(core.initialDraft(spec)));
        if(a==='undo'){redo.push(copy(flow));flow=undo.pop();draft=flow.draft;paint();schedule();}
        if(a==='redo'){undo.push(copy(flow));flow=redo.pop();draft=flow.draft;paint();schedule();}
        if(a==='remote')await load(true);
        if(a==='local')try{const remote=await api(`/api/signes/draft/${p.id}`);if(!mounted())return;revision=remote.revision;conflict=false;dirty=true;paint();await flush();}catch(err){tell(err.message);}
      });
      root.querySelector('[data-validate]').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;await flush();if(!mounted()||conflict)return;await submit(p,{draft:copy(draft)},button);if(mounted())paint();};
      if(focus){const target=root.querySelector(`[data-focus="${focus}"]`);if(target&&!target.disabled)target.focus({preventScroll:true});else root.querySelector('.eg-equation button')?.focus({preventScroll:true});}
      window.scrollTo(0,scrollTop);
    }
    async function load(remoteOnly=false){try{
      const [remote,engine,controls]=await Promise.all([api(`/api/signes/draft/${p.id}`),import('/workshop-core.js'),import('/workshop-flow.js')]);
      if(!mounted())return;core=engine;logic=controls;spec=remote.spec;revision=remote.revision;draft=remote.draft;conflict=false;dirty=false;
      if(!remoteOnly)try{const raw=localStorage.getItem(key),saved=JSON.parse(raw);if(saved?.draft&&(saved.draft.version===1||saved.draft.answer?.length!==spec.slots.length))localStorage.setItem(key+'_previous_backup',raw);if(saved?.pending){draft=core.migrateDraft(saved.draft,spec);dirty=true;if(saved.revision!==revision)conflict=true;}}catch{}
      core.validDraft(draft,spec);flow=logic.restoreFlow(draft);draft=flow.draft;undo=[];redo=[];local();paint();if(dirty&&!conflict)flush();
    }catch(err){if(mounted())document.getElementById(rootId).innerHTML=`<p>${e(err.message)}</p><a href="${e(p.href)}" data-link>Réessayer</a>`;}}
    return {load,refresh:paint,finish(){disposed=true;clearTimeout(timer);},leave(){disposed=true;clearTimeout(timer);if(draft){local();flush();}}};
  }
  return {page,leave,clear(){leave();data=null;positions.clear();}};
})();
