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
  function feedback(message,id){const box=id?document.querySelector(`#${id} .eg-feedback`):document.getElementById('eg-feedback');if(box){box.textContent=message;box.classList.add('is-visible');}}
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
    app.innerHTML=`<section class="eg-page">${header()}<div id="eg-feedback" class="eg-feedback" role="status" aria-live="polite"></div>${data.anonyme?login():''}${isClock()?`<div class="eg-durations">${WC57.tracks.map(t=>`<div><span>${e(t.title)}</span><strong>${mmss(Math.floor(t.duration))}</strong><button class="eg-listen" data-play-track="${e(t.slug)}">Écouter</button></div>`).join('')}</div>`:''}<div id="eg-game-content" class="${isClock()?'eg-labs':'eg-entries'}"></div><footer class="eg-footer"><a href="/musique#album-57" data-link>Écouter 57</a><a href="/paroles" data-link>Lire les paroles</a>${isClock()?'<a href="/echelon" data-link>Retour à Échelons</a>':''}</footer></section>`;
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
      feedback(result.gained?`+${result.gained} ${result.gained>1?'échelons':'échelon'}.${newlyVisible?' Une nouvelle énigme apparaît.':''}`:result.message||'Une partie de ce signe est trouvée.',p.id);
      if(result.gained){await refreshSession();if(token===serial)renderNav();}
    }catch(err){if(token===serial){feedback(err.message,p.id);if(err.data?.attenteMs&&button){let remaining=Math.ceil(err.data.attenteMs/1000);const label=button.textContent;const timer=setInterval(()=>{if(token!==serial||--remaining<=0){clearInterval(timer);if(token===serial){button.disabled=false;button.textContent=label;}}else button.textContent=`Réessayer dans ${remaining}s`;},1000);timers.push(timer);return;}}}
    finally{if(token===serial)sending=false;}
    if(token===serial&&button)button.disabled=false;
  }
  async function page(){const epoch=newEpoch(),token=++serial;currentPath=location.pathname;app.innerHTML='<div class="loading">Chargement…</div>';try{data=await api('/api/echelon');if(token!==serial||stale(epoch))return;render();const anchor=location.hash.slice(1),y=positions.get(currentPath);if(anchor&&/^[a-z0-9-]+$/.test(anchor))document.getElementById(anchor)?.scrollIntoView();else if(y)requestAnimationFrame(()=>window.scrollTo(0,y));}catch(err){if(token===serial)app.innerHTML=`<h1>Échelons</h1><p>${e(err.message)}</p><a href="/echelon" data-link>Réessayer</a>`;}}
  function leave(){if(currentPath){positions.set(currentPath,window.scrollY);currentPath='';}serial++;sending=false;timers.forEach(clearInterval);timers=[];for(const b of boards.values())b.leave();boards.clear();}

  function createBoard(p,token){
    let sources=[],draft=null,revision=0,undo=[],redo=[],timer=null,saving=null,dirty=false,conflict=false,answerText='',dragIndex=null;
    const owner=state.user?.id;
    const key=()=>`wc_echelon_draft_${owner}_${p.id}`;
    const rootId='bench-'+p.id;
    const mounted=()=>token===serial&&!!document.getElementById(rootId);
    const scopedFeedback=message=>feedback(message,p.id);
    const initial=()=>({version:1,items:sources.map(s=>({op:'src',ref:s.id})),selected:[]});
    const copy=x=>JSON.parse(JSON.stringify(x));
    const getSource=ref=>sources.find(s=>s.id===ref);
    function value(x){if(x.op==='src')return getSource(x.ref).value;if(x.op==='part')return +String(getSource(x.ref).value)[x.index];if(x.op==='reuse')return value(x.arg);const a=value(x.left),b=value(x.right);const v=({add:()=>a+b,sub:()=>a-b,mul:()=>a*b,div:()=>{if(!b)throw Error('Division par zéro impossible.');return a/b;},join:()=>{if(a<0||b<0||!Number.isInteger(a)||!Number.isInteger(b))throw Error('Assemble des nombres entiers positifs.');return Number(String(a)+String(b));}}[x.op])();if(!Number.isFinite(v)||Math.abs(v)>999999)throw Error('Ce résultat est trop grand.');return v;}
    function expression(x){if(x.op==='src'||x.op==='part')return String(value(x));if(x.op==='reuse')return `${expression(x.arg)} ↗`;return `(${expression(x.left)} ${{add:'+',sub:'−',mul:'×',div:'÷',join:'│'}[x.op]} ${expression(x.right)})`;}
    function origins(x,set=new Set()){if(x.ref)set.add(getSource(x.ref).label);if(x.left)origins(x.left,set);if(x.right)origins(x.right,set);if(x.arg)origins(x.arg,set);return [...set].join(' · ');}
    function checkUses(items){const counts=new Map(),shared=new Set();function visit(x,reused=false){if(x.op==='src'||x.op==='part'){const digits=x.op==='part'?[x.index]:[...String(getSource(x.ref).value)].map((_,i)=>i);for(const i of digits){const key=x.ref+'.'+i;counts.set(key,(counts.get(key)||0)+1);if(reused)shared.add(key);}return;}if(x.op==='reuse'){if(reused)throw Error('Ce nombre est déjà partagé.');visit(x.arg,true);}else{visit(x.left,reused);visit(x.right,reused);}}items.forEach(x=>visit(x));if([...counts].some(([r,n])=>n>(shared.has(r)?2:1)))throw Error('Un nombre partagé peut servir deux fois.');}
    function canDuplicate(){
      if(data.capabilities.share)return true;
      if(p.board!=='pair'||!draft)return false;
      const sevens=[];
      function scan(x){
        if(x.op==='add'){
          const pair=[x.left,x.right],three=pair.find(t=>t.op==='src'&&['a','c'].includes(t.ref)),four=pair.find(t=>t.op==='part'&&t.ref==='d');
          if(three&&four)sevens.push([three.ref,four.index]);
        }
        if(x.left)scan(x.left);if(x.right)scan(x.right);if(x.arg)scan(x.arg);
      }
      draft.items.forEach(scan);
      return sevens.some(([ref,index])=>sevens.some(([otherRef,otherIndex])=>ref!==otherRef&&index!==otherIndex));
    }
    function local(){if(!draft)return;try{localStorage.setItem(key(),JSON.stringify({draft,revision,pending:dirty,updatedAt:Date.now()}));}catch{/* quota: remote draft still works */}}
    function schedule(){dirty=true;local();clearTimeout(timer);timer=setTimeout(flush,650);}
    async function flush(){
      clearTimeout(timer);if(!draft||!dirty||conflict)return;if(saving){await saving;if(dirty&&!conflict)return flush();return;}
      const snapshot=JSON.stringify(draft);
      saving=(async()=>{
      try{const result=await api(`/api/echelon/draft/${p.id}`,{method:'POST',body:{draft:JSON.parse(snapshot),revision}});revision=result.revision;dirty=JSON.stringify(draft)!==snapshot;local();
        if(mounted()){const newlyShared=!data.capabilities.share&&result.state.capabilities.share;accept(result.state);sync();if(newlyShared){for(const b of boards.values())b.refresh();scopedFeedback('Tu peux maintenant dupliquer un nombre.');}else saveLabel('Brouillon sauvegardé');}
      }catch(err){if(err.status===409){conflict=true;if(mounted()){paint();scopedFeedback(err.message);}}else if(mounted())saveLabel('Brouillon conservé sur cet appareil');}
      })();
      await saving;saving=null;
    }
    function saveLabel(text){const el=document.getElementById(rootId)?.querySelector('[data-save]');if(el)el.textContent=text;}
    function change(next){undo.push(copy(draft));if(undo.length>35)undo.shift();redo=[];draft=next;paint();schedule();}
    function calculate(op){try{
      const unary=['split','detach','reuse'].includes(op);
      const selected=unary?draft.selected.slice(-1):draft.selected,x=draft.items[selected[0]],y=draft.items[selected[1]];
      if(!x)throw Error('Sélectionne un nombre.');
      let output=[];
      if(op==='split'){if(x.op!=='src'||String(value(x)).length<2)throw Error('Sélectionne un groupe de chiffres de la durée.');output=[...String(value(x))].map((_,index)=>({op:'part',ref:x.ref,index}));}
      else if(op==='detach'){if(x.op==='reuse')throw Error('Annule le partage pour modifier ce nombre.');else if(x.left)output=[x.left,x.right];else throw Error('Ce nombre est déjà séparé.');}
      else if(op==='reuse'){if(!canDuplicate())throw Error('Cette possibilité n’est pas encore découverte.');output=[x,{op:'reuse',arg:x}];}
      else{if(selected.length!==2)throw Error('Choisis deux nombres, dans l’ordre de ton calcul.');output=[{op,left:x,right:y}];value(output[0]);}
      const items=draft.items.filter((_,i)=>!selected.includes(i)).concat(output);if(items.length>30)throw Error('Détache ou reprends une construction pour faire de la place.');checkUses(items);
      change({version:1,items,selected:output.length===1?[items.length-1]:[]});
    }catch(err){scopedFeedback(err.message);}}
    function paint(){if(!mounted()||!draft)return;const root=document.getElementById(rootId);const active=document.activeElement;const focusKey=root.contains(active)?(active.id?'#'+active.id:active.hasAttribute('data-tile')?'[data-tile="'+active.dataset.tile+'"]':active.hasAttribute('data-op')?'[data-op="'+active.dataset.op+'"]':null):null;root.setAttribute('aria-busy','false');
      const n=draft.selected.length,selectedNumber=n?value(draft.items[draft.selected.at(-1)]):null;
      root.innerHTML=`<div class="eg-bench"><div class="eg-bench-top"><p>Relie les nombres. Change de lecture.</p><span data-save role="status">${dirty?'Brouillon local':'Brouillon sauvegardé'}</span></div>${conflict?`<div class="eg-conflict">Un autre appareil a enregistré une version.<button id="eg-remote-${p.id}">Charger sa version</button><button id="eg-local-${p.id}">Garder mon brouillon ici</button></div>`:''}<div class="eg-tiles" aria-label="Nombres et constructions">${draft.items.map((x,i)=>`<button class="eg-tile" data-tile="${i}" draggable="true" aria-pressed="${draft.selected.includes(i)}"><small>${e(origins(x))}</small><strong>${e(Number(value(x).toFixed(5)))}</strong>${x.left||x.op==='reuse'?`<span>${e(expression(x))}</span>`:''}<i>${draft.selected.includes(i)?`${draft.selected.indexOf(i)+1} · sélectionné`:'Sélectionner'}</i></button>`).join('')}</div><div class="eg-tools" aria-label="Opérations">${[['add','+','Additionner'],['sub','−','Soustraire'],['mul','×','Multiplier'],['div','÷','Diviser'],['join','│','Assembler']].map(([op,symbol,label])=>`<button data-op="${op}" ${n!==2?'disabled':''}><span aria-hidden="true">${symbol}</span>${label}</button>`).join('')}<button data-op="split" ${!n?'disabled':''}>Séparer</button><button data-op="detach" ${!n?'disabled':''}>Détacher</button>${p.board!=='first'?`<button data-op="reuse" ${!n||!canDuplicate()?'disabled':''}>Dupliquer${n?' '+e(Number(selectedNumber.toFixed(5))):''}</button>`:''}</div><div class="eg-history"><button id="eg-undo-${p.id}" ${!undo.length?'disabled':''}>↶ Annuler</button><button id="eg-redo-${p.id}" ${!redo.length?'disabled':''}>Rétablir ↷</button><button id="eg-reset-${p.id}">Repartir des durées</button></div><form id="eg-board-answer-${p.id}" class="eg-answer">${p.board==='first'?`<label for="eg-meaning-${p.id}">Quelle lecture vois-tu ?</label><input id="eg-meaning-${p.id}" name="meaning" maxlength="200" autocomplete="off" placeholder="Proposer un signe" value="${e(answerText)}">`:''}<button class="orange-button" type="submit">Valider ma lecture</button></form><p class="eg-bench-note">Sélectionne deux nombres dans l’ordre du calcul. Séparer, détacher et dupliquer agissent sur le dernier nombre sélectionné. │ assemble les chiffres.</p></div>`;
      root.querySelectorAll('[data-tile]').forEach(el=>{const index=+el.dataset.tile;el.onclick=()=>{const d=copy(draft);d.selected=d.selected.includes(index)?d.selected.filter(i=>i!==index):[...d.selected.slice(-1),index];draft=d;paint();schedule();};el.ondragstart=()=>{dragIndex=index;};el.ondragover=event=>event.preventDefault();el.ondrop=event=>{event.preventDefault();if(dragIndex===null||dragIndex===index)return;const items=copy(draft.items),item=items.splice(dragIndex,1)[0];items.splice(index,0,item);change({version:1,items,selected:[]});dragIndex=null;};});
      root.querySelectorAll('[data-op]').forEach(el=>el.onclick=()=>calculate(el.dataset.op));
      root.querySelector('#eg-undo-'+p.id).onclick=()=>{redo.push(copy(draft));draft=undo.pop();paint();schedule();};
      root.querySelector('#eg-redo-'+p.id).onclick=()=>{undo.push(copy(draft));draft=redo.pop();paint();schedule();};
      root.querySelector('#eg-reset-'+p.id).onclick=()=>change(initial());
      root.querySelector('#eg-board-answer-'+p.id).onsubmit=async event=>{event.preventDefault();if(p.board==='first')answerText=event.target.elements.meaning.value.trim();await flush();if(!mounted())return;await submit(p,{roots:draft.items,answer:answerText},event.target.querySelector('button'));};
      const field=root.querySelector('#eg-meaning-'+p.id);if(field)field.oninput=()=>{answerText=field.value;};
      if(conflict){root.querySelector('#eg-remote-'+p.id).onclick=()=>load(true);root.querySelector('#eg-local-'+p.id).onclick=async()=>{const current=await api(`/api/echelon/draft/${p.id}`);revision=current.revision;conflict=false;dirty=true;paint();flush();};}
      if(focusKey){const target=root.querySelector(focusKey);if(target&&!target.disabled)target.focus({preventScroll:true});else root.querySelector('[data-tile][aria-pressed="true"]')?.focus({preventScroll:true});}
    }
    async function load(remoteOnly=false){try{
      const remote=await api(`/api/echelon/draft/${p.id}`);if(!mounted())return;sources=remote.sources;revision=remote.revision;draft=remote.draft||initial();conflict=false;dirty=false;
      if(!remoteOnly){try{const saved=JSON.parse(localStorage.getItem(key()));if(saved?.pending){draft=saved.draft;dirty=true;if(saved.revision!==revision)conflict=true;}}catch{/* a corrupt local draft must not break the page */}}
      try{draft.items.forEach(value);}catch{draft=remote.draft||initial();dirty=false;}
      undo=[];redo=[];local();paint();if(dirty&&!conflict)flush();
    }catch(err){if(mounted())document.getElementById(rootId).innerHTML=`<p>${e(err.message)}</p><a href="${e(p.href)}" data-link>Réessayer</a>`;}}
    return {load,refresh:paint,leave(){clearTimeout(timer);local();flush();}};
  }
  return {page,leave,clear(){leave();data=null;positions.clear();}};
})();
