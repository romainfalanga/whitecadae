/* UI only. The server supplies the discovered territory, never future answers. */
window.WCGame=(()=>{
  let data=null,currentPath='',serial=0,timers=[],sending=false;
  const boards=new Map();
  const positions=new Map();
  const e=s=>esc(s??'');
  const pageBy=id=>data?.pages.find(p=>p.id===id);
  function art(type){
    if(type==='infinity')return '<svg class="eg-art eg-infinity" viewBox="0 0 290 130" role="img" aria-label="Un M dans chaque boucle du signe infini"><path d="M145 65C105 7 30 7 30 65S105 123 145 65C185 7 260 7 260 65S185 123 145 65Z"/><text x="78" y="76">M</text><text x="212" y="76">M</text></svg>';
    return '';
  }
  const versions=new Map();
  const isClock=()=>location.pathname==='/echelon/horloge';
  function link(p){const local=p.href.split('#')[0]===location.pathname;return `<a href="${e(local?'#'+p.id:p.href)}" ${local?'':'data-link'}>${e(p.title)}</a>`;}
  function login(){const query='?retour='+encodeURIComponent(location.pathname+location.hash);return `<div class="eg-account"><a class="orange-button" href="/connexion${query}" data-link>Se connecter</a><a href="/inscription${query}" data-link>Créer un compte</a></div>`;}
  function header(){return `<header class="eg-header"><div>${isClock()?'<nav class="eg-breadcrumb" aria-label="Fil d’Ariane"><a href="/echelon" data-link>Échelons</a></nav>':'<p class="eyebrow">Escape Game Orange</p>'}<h1>${isClock()?'Horloge':'Échelons'}</h1></div><div class="eg-level" aria-label="Échelon actuel"><span>Échelon</span><strong>${data.echelon}</strong></div></header>`;}
  function locked(p){const r=p.requirements||{},deps=(r.pages||[]).map(d=>pageBy(d.id)).filter(Boolean);return `<p class="eg-lock">Verrouillé${r.level?` · Échelon ${r.level}`:''}${deps.length?` · Termine ${deps.map(link).join(', ')}`:''}</p>`;}
  function feedback(message,id,opened=[]){const box=id?document.querySelector(`#${id} .eg-feedback`):document.getElementById('eg-feedback');if(box){box.textContent=message;if(opened.length)box.insertAdjacentHTML('beforeend',`<div class="eg-new-access"><strong>Nouveau dans ton parcours</strong>${opened.map(item=>`<a href="${e(item.href)}" data-link>${e(item.title)} →</a>`).join('')}<a class="eg-access-summary" href="/#mon-palier" data-link>Mes contenus disponibles</a></div>`);box.classList.add('is-visible');}}
  function accept(next){if(data&&next.echelon<data.echelon)return;if(data?.capabilities.share)next.capabilities.share=true;data=next;}
  function found(p){return `<div class="eg-found"><ul>${p.found.map(a=>`<li><span aria-hidden="true">✧</span> ${e(a.label)}</li>`).join('')}${p.partiels.map(v=>`<li class="eg-partial">${v.jetons.map(t=>e(t.sep)+(t.q?'?':`<strong>${e(t.t)}</strong>`)).join('')}</li>`).join('')}</ul>${p.total?`<span>${p.found.length} / ${p.total} ${p.total>1?'signes':'signe'}</span>`:''}</div>`;}
  const notice=()=>'<div class="eg-feedback" role="status" aria-live="polite"></div>';
  function riddle(p){return `<article id="${e(p.id)}" class="eg-entry ${p.visual?'has-art':''} ${p.locked?'is-locked':''}" ${p.title?`aria-labelledby="title-${e(p.id)}"`:'aria-label="Mot de passe"'} tabindex="-1">${art(p.visual,true)}<div class="eg-entry-main">${p.title?`<h2 id="title-${e(p.id)}" tabindex="-1">${e(p.title)}</h2>`:''}${found(p)}${p.locked?locked(p):p.open?`<form class="eg-answer" data-answer="${e(p.id)}"><label class="sr-only" for="input-${e(p.id)}">${p.title?`Signe pour ${e(p.title)}`:'Mot de passe'}</label><div><input id="input-${e(p.id)}" name="answer" placeholder="${p.title?'Proposer un signe':'Mot de passe'}" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" required ${data.anonyme?'disabled':''}><button type="submit" class="orange-button" ${data.anonyme?'disabled':''}>Valider</button></div></form>`:'<p class="eg-complete">Tous les signes sont trouvés.</p>'}${p.id==='eg-03'&&pageBy('eg-10')?'<a class="eg-clock-link" href="/echelon/horloge" data-link>Ouvrir Horloge →</a>':''}${notice()}</div></article>`;}
  function lab(p){return `<section id="${e(p.id)}" class="eg-lab" aria-labelledby="title-${e(p.id)}"><h2 id="title-${e(p.id)}">${e(p.title)}</h2><p class="eg-subtitle">${e(p.subtitle)}</p><div class="eg-results">${found(p)}</div>${notice()}<div class="eg-lab-body">${p.locked?locked(p):`<div id="bench-${e(p.id)}" class="eg-workbench" aria-busy="true">Chargement du tableau…</div>`}</div></section>`;}
  function sync(){
    document.querySelectorAll('.eg-level strong').forEach(el=>el.textContent=data.echelon);
    const root=document.getElementById('eg-game-content');if(!root)return;
    if(isClock()){
      for(const p of data.nodes.filter(n=>n.kind==='workshop')){
        let el=document.getElementById(p.id);
        if(!el){root.insertAdjacentHTML('beforeend',lab(p));el=document.getElementById(p.id);}
        else{el.querySelector('.eg-results').innerHTML=found(p);if(!p.locked&&!el.querySelector('.eg-workbench'))el.querySelector('.eg-lab-body').innerHTML=`<div id="bench-${e(p.id)}" class="eg-workbench" aria-busy="true">Chargement du tableau…</div>`;}
        if(!p.locked&&!boards.has(p.id)){const instance=createBoard(p,serial);boards.set(p.id,instance);instance.load();}
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
    if(isClock()&&!pageBy('eg-10')){app.innerHTML='<section class="eg-page"><h1>Ce chemin n’est pas disponible.</h1><a href="/echelon" data-link>Retrouver Échelons →</a></section>';return;}
    app.innerHTML=`<section class="eg-page">${header()}<div id="eg-feedback" class="eg-feedback" role="status" aria-live="polite"></div>${data.anonyme?login():'<a class="eg-progress-link" href="/#mon-palier" data-link>Mes contenus disponibles →</a>'}${isClock()?`<nav class="eg-clock-index" aria-label="Énigmes Horloge">${data.nodes.filter(n=>n.kind==='workshop').map(n=>`<a href="#${e(n.id)}">${e(n.title)}</a>`).join('')}</nav>`:''}<div id="eg-game-content" class="${isClock()?'eg-labs':'eg-entries'}"></div><footer class="eg-footer"><a href="/musique#album-57" data-link>Écouter 57</a><a href="/paroles" data-link>Lire les paroles</a>${isClock()?'<a href="/echelon" data-link>Retour à Échelons</a>':''}</footer></section>`;
    document.title=`${isClock()?'Horloge · ':''}Échelons · White Cadae`;
    sync();if(isClock())bindMusicButtons();
  }
  async function submit(p,payload,button){
    if(sending)return;sending=true;const token=serial,before=data,anchor=document.getElementById(p.id),top=anchor?.getBoundingClientRect().top;if(button)button.disabled=true;
    try{
      const result=await api('/api/echelon/guess',{method:'POST',body:{id:p.id,...payload}});
      if(token!==serial)return;
      const newlyVisible=result.state.nodes.some(n=>!before.nodes.some(old=>old.id===n.id));
      accept(result.state);sync();
      if(result.ok){const input=document.getElementById(`input-${p.id}`);if(input)input.value='';}
      if(top!==undefined){const after=document.getElementById(p.id);if(after)window.scrollBy(0,after.getBoundingClientRect().top-top);}
      const opened=[...(result.opened||[])];
      feedback(result.gained?`+${result.gained} ${result.gained>1?'échelons':'échelon'}.${newlyVisible?' Une nouvelle énigme apparaît.':''}`:result.message||'Une partie de ce signe est trouvée.',p.id,opened);
      if(result.gained){await refreshSession();if(token===serial)renderNav();}
    }catch(err){if(token===serial){feedback(err.message,p.id);if(err.data?.attenteMs&&button){let remaining=Math.ceil(err.data.attenteMs/1000);const label=button.textContent;const timer=setInterval(()=>{if(token!==serial||--remaining<=0){clearInterval(timer);if(token===serial){button.disabled=false;button.textContent=label;}}else button.textContent=`Réessayer dans ${remaining}s`;},1000);timers.push(timer);return;}}}
    finally{if(token===serial)sending=false;}
    if(token===serial&&button)button.disabled=false;
  }
  async function page(){const epoch=newEpoch(),token=++serial;currentPath=location.pathname;app.innerHTML='<div class="loading">Chargement…</div>';try{data=await api('/api/echelon');if(token!==serial||stale(epoch))return;render();const anchor=location.hash.slice(1),y=positions.get(currentPath);if(anchor&&/^[a-z0-9-]+$/.test(anchor))document.getElementById(anchor)?.scrollIntoView();else if(y)requestAnimationFrame(()=>window.scrollTo(0,y));}catch(err){if(token===serial)app.innerHTML=`<h1>Échelons</h1><p>${e(err.message)}</p><a href="/echelon" data-link>Réessayer</a>`;}}
  function leave(){if(currentPath){positions.set(currentPath,window.scrollY);currentPath='';}serial++;sending=false;timers.forEach(clearInterval);timers=[];for(const b of boards.values())b.leave();boards.clear();}

  function createBoard(p,token){
    let spec,core,draft,revision=0,undo=[],redo=[],timer,saving,dirty=false,conflict=false;
    const owner=state.user?.id,key=`wc_echelon_draft_${owner}_${p.id}`,rootId='bench-'+p.id;
    const copy=x=>JSON.parse(JSON.stringify(x));
    const mounted=()=>token===serial&&!!document.getElementById(rootId);
    const tell=message=>feedback(message,p.id);
    const val=x=>core.evaluate(x,spec.sources);
    const label=x=>core.formatBlock(val(x),spec.format);
    const source=x=>spec.sources.find(s=>s.id===x.ref);
    const symbols={add:'+',sub:'−',mul:'×',div:'÷',join:'│',group:'réparti en'};
    function expression(x){
      if(x.op==='src'||x.op==='part')return label(x);
      if(x.op==='reuse')return expression(x.arg)+' (copie)';
      return `(${expression(x.left)} ${symbols[x.op]} ${expression(x.right)})`;
    }
    function tree(x){
      if(x.op==='src'||x.op==='part')return `<li><span>${e(label(x))}</span> <small>${e(source(x).label)}${x.op==='part'?' · chiffre séparé':''}</small></li>`;
      return `<li><span>${e(label(x))}</span> <small>${x.op==='reuse'?'Dupliquer':e(symbols[x.op])}</small><ul>${x.arg?tree(x.arg):tree(x.left)+tree(x.right)}</ul></li>`;
    }
    function local(){try{localStorage.setItem(key,JSON.stringify({draft,revision,pending:dirty,updatedAt:Date.now()}));}catch{}}
    function schedule(){dirty=true;local();clearTimeout(timer);timer=setTimeout(flush,650);}
    function saveLabel(message){const el=document.getElementById(rootId)?.querySelector('[data-save]');if(el)el.textContent=message;}
    async function flush(){
      clearTimeout(timer);if(!draft||!dirty||conflict)return;
      if(saving){await saving;if(dirty&&!conflict)return flush();return;}
      const snapshot=JSON.stringify(draft);
      saving=(async()=>{try{
        const result=await api(`/api/echelon/draft/${p.id}`,{method:'POST',body:{draft:JSON.parse(snapshot),revision}});
        revision=result.revision;dirty=JSON.stringify(draft)!==snapshot;local();
        if(mounted()){accept(result.state);sync();saveLabel('Brouillon sauvegardé');}
      }catch(err){
        if(err.status===409){conflict=true;if(mounted()){paint();tell(err.message);}}
        else if(mounted())saveLabel('Brouillon conservé sur cet appareil');
      }})();await saving;saving=null;
    }
    function change(next){
      core.validDraft(next,spec);undo.push(copy(draft));if(undo.length>35)undo.shift();redo=[];
      draft=next;paint();schedule();
    }
    function action(fn){try{fn();}catch(err){tell(err.message);}}
    function calculate(op){action(()=>{
      const unary=['split','detach','reuse','discard'].includes(op);
      const chosen=unary?draft.selected.slice(-1):draft.selected;
      const x=draft.items[chosen[0]],y=draft.items[chosen[1]];
      if(!x)throw Error('Sélectionne un bloc.');
      let output;
      if(op==='split'){
        if(x.op!=='src'||String(val(x).value).length<2)throw Error('Sélectionne un nombre de départ à plusieurs chiffres.');
        output=[...String(val(x).value)].map((_,index)=>({op:'part',ref:x.ref,index}));
      }else if(op==='detach'){
        if(x.op==='reuse')throw Error('Retire cette copie ou annule sa duplication pour la modifier.');
        if(!x.left)throw Error('Ce bloc est déjà un nombre de départ.');
        output=[x.left,x.right];
      }else if(op==='reuse')output=[x,{op:'reuse',arg:copy(x)}];
      else if(op==='discard')output=[];
      else{
        if(chosen.length!==2)throw Error('Sélectionne deux blocs dans l’ordre du calcul.');
        output=[{op,left:x,right:y}];val(output[0]);
      }
      const items=draft.items.filter((_,i)=>!chosen.includes(i)).concat(output);
      change({...copy(draft),items,selected:output.length===1?[items.length-1]:[]});
    });}
    function place(index){action(()=>{
      if(spec.slots[index].fixed)return;
      const next=copy(draft);
      if(next.answer[index]){next.items.push(next.answer[index]);next.answer[index]=null;next.selected=[next.items.length-1];}
      else{
        if(next.selected.length!==1)throw Error('Sélectionne un seul bloc à placer dans cette case.');
        next.answer[index]=next.items.splice(next.selected[0],1)[0];next.selected=[];
      }
      change(next);
    });}
    function paint(){
      if(!mounted()||!draft)return;
      const root=document.getElementById(rootId),active=document.activeElement;
      const focus=root.contains(active)?active?.dataset?.focus:null;
      const complete=!pageBy(p.id)?.open,ready=!draft.items.length&&draft.answer.every(Boolean);
      const n=draft.selected.length,last=n?draft.items[draft.selected.at(-1)]:null;
      const canDiscard=(()=>{if(!last)return false;try{core.validDraft({...draft,items:draft.items.filter((_,i)=>i!==draft.selected.at(-1)),selected:[]},spec);return true;}catch{return false;}})();
      root.setAttribute('aria-busy','false');
      root.innerHTML=`<div class="eg-bench">
        <ol class="eg-steps" aria-label="Étapes de l’énigme"><li class="${!ready&&!complete?'current':''}">1. Construire</li><li class="${ready&&!complete?'current':''}">2. Placer</li><li class="${complete?'current':''}">3. ${complete?'Trouvé':'Valider'}</li></ol>
        <p class="eg-instruction">${e(spec.prompt)}</p>
        <div class="eg-bench-top"><h3>Blocs à manipuler</h3><span data-save role="status">${dirty?'Brouillon local':'Brouillon sauvegardé'}</span></div>
        ${conflict?`<div class="eg-conflict">Un autre appareil a enregistré une version.<button data-action="remote">Charger sa version</button><button data-action="local">Garder mon brouillon</button></div>`:''}
        <div class="eg-tiles" aria-label="Blocs à manipuler">${draft.items.map((x,i)=>`<button class="eg-tile" data-tile="${i}" data-focus="tile-${i}" aria-pressed="${draft.selected.includes(i)}"><small>${x.ref?e(source(x).label):x.op==='reuse'?'Copie':e(expression(x))}</small><strong>${e(label(x))}</strong>${val(x).group?`<span>${val(x).group.count} groupes de ${val(x).group.unit}</span>`:''}<i>${draft.selected.includes(i)?`${draft.selected.indexOf(i)+1} · sélectionné`:'Sélectionner'}</i></button>`).join('')||'<p class="eg-work-empty">Tous les blocs sont dans ta réponse.</p>'}</div>
        <p class="eg-selection" role="status">${n?draft.selected.map(i=>label(draft.items[i])).map(e).join(' puis '):'Choisis deux blocs dans l’ordre du calcul, ou un bloc à transformer.'}</p>
        <div class="eg-tools" aria-label="Opérations">${[['add','+','Additionner'],['sub','−','Soustraire'],['mul','×','Multiplier'],['div','÷','Diviser'],['join','│','Assembler'],['group','⋮','Répartir']].map(([op,symbol,title])=>`<button data-op="${op}" data-focus="op-${op}" ${n!==2?'disabled':''}><span aria-hidden="true">${symbol}</span>${title}</button>`).join('')}
          ${[['split','Séparer les chiffres'],['reuse','Dupliquer'],['detach','Détacher'],['discard','Retirer la copie']].map(([op,title])=>`<button data-op="${op}" data-focus="op-${op}" ${!n||(op==='discard'&&!canDiscard)?'disabled':''}>${title}</button>`).join('')}
        </div>
        <details class="eg-help"><summary>Comment manipuler les blocs ?</summary><p>Les opérations utilisent les blocs dans l’ordre de sélection. Assembler colle deux nombres. Répartir conserve autant de groupes égaux que le second bloc l’indique. Séparer les chiffres, dupliquer et détacher agissent sur le dernier bloc sélectionné. Une copie peut être retirée si tous ses nombres existent encore ailleurs.</p></details>
        <div class="eg-final"><h3>Ma réponse</h3><p>${spec.format==='album'?'Le bloc se lit « nombre – numéro d’album ». Le tiret n’est pas une soustraction.':'Sélectionne un bloc, puis touche sa case. Touche un bloc placé pour le reprendre.'}</p>
          <div class="eg-slots">${spec.slots.map((slot,i)=>`<button class="eg-slot ${draft.answer[i]?'filled':''}" data-slot="${i}" data-focus="slot-${i}" ${slot.fixed?'disabled':''}><span>${e(slot.label)}</span><strong>${draft.answer[i]?e(label(draft.answer[i])):'＋'}</strong><small>${slot.fixed?'Juillet → 07 · déjà converti':draft.answer[i]?(val(draft.answer[i]).group?`${val(draft.answer[i]).group.count} groupes de ${val(draft.answer[i]).group.unit} · Reprendre`:'Reprendre ce bloc'):'Placer le bloc sélectionné'}</small></button>`).join('')}</div>
          <form data-validate><button class="orange-button" type="submit" ${!ready||conflict||complete?'disabled':''}>${complete?'Lecture trouvée':'Valider ma réponse'}</button><span>${complete?'Cet échelon est acquis.':ready?'Les blocs sont prêts.':draft.items.length?`${draft.items.length} bloc${draft.items.length>1?'s':''} encore à placer ou à réunir.`:'Complète chaque case.'}</span></form>
        </div>
        <details class="eg-calculation-tree" ${ready?'open':''}><summary>Mon chemin de calcul</summary><div>${[...draft.items,...draft.answer.filter(Boolean)].map(x=>`<ul>${tree(x)}</ul>`).join('')}</div></details>
        <div class="eg-history"><button data-action="undo" data-focus="undo" ${!undo.length?'disabled':''}>↶ Annuler</button><button data-action="redo" data-focus="redo" ${!redo.length?'disabled':''}>Rétablir ↷</button><button data-action="reset" data-focus="reset">Repartir du début</button></div>
      </div>`;
      root.querySelectorAll('[data-tile]').forEach(el=>el.onclick=()=>{const i=+el.dataset.tile;draft.selected=draft.selected.includes(i)?draft.selected.filter(v=>v!==i):[...draft.selected.slice(-1),i];paint();schedule();});
      root.querySelectorAll('[data-op]').forEach(el=>el.onclick=()=>calculate(el.dataset.op));
      root.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>place(+el.dataset.slot));
      root.querySelectorAll('[data-action]').forEach(el=>el.onclick=async()=>{const a=el.dataset.action;
        if(a==='reset')change(core.initialDraft(spec));
        if(a==='undo'){redo.push(copy(draft));draft=undo.pop();paint();schedule();}
        if(a==='redo'){undo.push(copy(draft));draft=redo.pop();paint();schedule();}
        if(a==='remote')await load(true);
        if(a==='local')try{const remote=await api(`/api/echelon/draft/${p.id}`);if(!mounted())return;revision=remote.revision;conflict=false;dirty=true;paint();await flush();}catch(err){tell(err.message);}
      });
      root.querySelector('[data-validate]').onsubmit=async event=>{event.preventDefault();await flush();if(!mounted()||conflict)return;await submit(p,{draft:copy(draft)},event.target.querySelector('button'));if(mounted())paint();};
      if(focus){const target=root.querySelector(`[data-focus="${focus}"]`);if(target&&!target.disabled)target.focus({preventScroll:true});}
    }
    async function load(remoteOnly=false){try{
      const [remote,engine]=await Promise.all([api(`/api/echelon/draft/${p.id}`),import('/workshop-core.js')]);
      if(!mounted())return;core=engine;spec=remote.spec;revision=remote.revision;draft=remote.draft;conflict=false;dirty=false;
      if(!remoteOnly){try{
        const raw=localStorage.getItem(key),saved=JSON.parse(raw);
        if(saved?.draft?.version===1)localStorage.setItem(key+'_v1_backup',raw);
        if(saved?.pending){draft=core.migrateDraft(saved.draft,spec);dirty=true;if(saved.revision!==revision)conflict=true;}
      }catch{tell('Le brouillon distant a été restauré.');}}
      core.validDraft(draft,spec);undo=[];redo=[];local();paint();if(dirty&&!conflict)flush();
    }catch(err){if(mounted())document.getElementById(rootId).innerHTML=`<p>${e(err.message)}</p><a href="${e(p.href)}" data-link>Réessayer</a>`;}}
    return {load,refresh:paint,leave(){clearTimeout(timer);if(draft){local();flush();}}};
  }
  return {page,leave,clear(){leave();data=null;positions.clear();}};
})();
