/* UI only. The server supplies the discovered territory, never future answers. */
window.WCGame=(()=>{
  let data=null,board=null,currentPath='',serial=0,timers=[];
  const positions=new Map();
  const e=s=>esc(s??'');
  const pageBy=id=>data?.pages.find(p=>p.id===id);
  const link=p=>`<a href="${e(p.href)}" data-link>${e(p.title)} <span aria-hidden="true">↗</span></a>`;
  function art(type,small=false){
    const paths={
      bird:'<path d="M24 76 77 53 117 61 145 26 174 61 213 53 266 76 205 71 165 82 145 102 125 82 85 71Z"/>',
      infinity:'<path d="M145 65C70-25 12 25 34 70C63 131 133 47 145 65C220 155 278 105 256 60C227-1 157 83 145 65Z"/><text x="76" y="76">M</text><text x="212" y="76">M</text>',
      needle:'<path d="m58 100 175-72M70 95l8-3"/><ellipse cx="224" cy="32" rx="12" ry="3" transform="rotate(-24 224 32)"/>',
      dice:'<path d="m100 25 62-10 33 30-6 57-62 12-34-31Z M100 25l32 32 63-12M132 57l-5 57"/>',
      arcs:'<path d="M55 95Q145-60 235 95M80 95Q145-7 210 95M107 95Q145 44 183 95"/>',
      stars:'<path d="m45 90 58-63 41 47 51-37 43 51"/><circle cx="45" cy="90" r="3"/><circle cx="103" cy="27" r="4"/><circle cx="144" cy="74" r="3"/><circle cx="195" cy="37" r="4"/><circle cx="238" cy="88" r="3"/>',
      layers:'<ellipse cx="118" cy="65" rx="53" ry="38"/><ellipse cx="174" cy="65" rx="53" ry="38"/>',
      sound:'<path d="M63 62h12m10-16v32m15-45v58m17-72v85m17-56v29m18-52v75m17-85v98m18-73v48m17-33v18m15-11h12"/>',
      square:'<path d="M92 20h100v90H92ZM92 20l100 90M192 20l-100 90"/>',
      water:'<path d="M145 18Q95 79 122 101Q145 121 168 101Q195 79 145 18M55 106q20-12 40 0t40 0t40 0t40 0t40 0"/>',
      dots:'<circle cx="145" cy="65" r="4"/><circle cx="145" cy="65" r="30" stroke-dasharray="1 10"/><circle cx="145" cy="65" r="54" stroke-dasharray="1 10"/>',
      line:'<path d="M75 25h140v80H75ZM20 64h250"/>',
      horizon:'<path d="M35 95h220M88 95a57 57 0 0 1 114 0M145 11v12M57 46l15 10M233 46l-15 10"/>',
      clock:'<circle cx="145" cy="65" r="51"/><path d="M145 25v40l32 16M145 14v6m51 45h-6m-45 51v-6M94 65h6"/>',
      shadow:'<path d="M80 102q-25-62 29-78l-6 32q42-28 84 0l-6-32q54 16 29 78M126 87h38"/>',
      door:'<path d="M106 110V52a39 39 0 0 1 78 0v58M98 110h94M169 72v8"/>'
    };
    if(type==='white')return `<div class="eg-art eg-white ${small?'is-small':''}" aria-hidden="true"><span></span></div>`;
    if(type==='time'||type==='numbers')return `<div class="eg-art eg-type ${small?'is-small':''}" aria-hidden="true">${type==='time'?'13:20':'Ⅴ · XX'}</div>`;
    return `<svg class="eg-art ${small?'is-small':''}" viewBox="0 0 290 130" aria-hidden="true" focusable="false">${paths[type]||paths.door}</svg>`;
  }
  const status=p=>p.locked?'Verrouillée':p.found?.length===p.total&&p.total?'Résolue':p.found?.length||p.partiels?.length?'En cours':p.kind==='reading'?'À observer':p.kind==='clock'?'À explorer':'À découvrir';
  function card(p){return `<a class="eg-card ${p.locked?'is-locked':''} ${!p.open&&p.found?.length?'is-solved':''}" href="${e(p.href)}" data-link>${art(p.visual,true)}<div><span class="eg-card-state">${e(status(p))}</span><h3>${e(p.title)}</h3>${p.subtitle?`<p>${e(p.subtitle)}</p>`:''}</div><span class="eg-card-count">${p.total?`${p.found.length}<span>/${p.total}</span>`:'↗'}</span></a>`;}
  function login(){const query='?retour='+encodeURIComponent(location.pathname);return `<div class="eg-account"><a class="orange-button" href="/connexion${query}" data-link>Se connecter</a><a href="/inscription${query}" data-link>Créer un compte</a></div>`;}
  function header(p){const group=pageBy(p?.group);return `<header class="eg-header"><div>${p?`<nav class="eg-breadcrumb" aria-label="Fil d’Ariane"><a href="/echelon" data-link>Échelon</a>${group&&p.kind!=='gallery'?`<span> / </span>${link(group)}`:''}</nav>`:'<p class="eyebrow">Escape Game Orange</p>'}<h1>${e(p?.title||'Échelon')}</h1></div><div class="eg-level" aria-label="Échelon actuel"><span>Échelon</span><strong>${data.echelon}</strong></div></header>`;}
  function related(p){const pages=(p.related||[]).map(pageBy).filter(Boolean);return pages.length?`<nav class="eg-related" aria-label="Chemins liés"><p class="eyebrow">Poursuivre</p>${pages.map(link).join('')}</nav>`:'';}
  function locked(p){const r=p.requirements||{};return `<div class="eg-lock"><span aria-hidden="true">◇</span><p>Ce chemin est visible. Sa lecture attend encore${r.level?` l’échelon <strong>${r.level}</strong>`:''}${r.pages?.length?`${r.level?' et':' que tu termines'} ${r.pages.map(d=>pageBy(d.id)).filter(Boolean).map(link).join(', ')}`:''}.</p></div>`;}
  function feedback(message){const box=document.getElementById('eg-feedback');if(box){box.textContent=message;box.classList.add('is-visible');}}
  function revealSummary(before,after){const old=new Map(before?.pages.map(p=>[p.id,p])||[]);return after.pages.filter(p=>(!old.has(p.id)||old.get(p.id).locked&&!p.locked)&&p.kind!=='gallery');}
  function accept(next){data=next;}
  function render(){
    const id=location.pathname==='/echelon'?null:location.pathname.split('/').pop(),p=id?pageBy(id):null;
    if(id&&!p){app.innerHTML='<section class="eg-page"><h1>Ce chemin n’est pas disponible.</h1><a href="/echelon" data-link>Retrouver Échelon →</a></section>';return;}
    let content='';
    if(!p||p.kind==='gallery'){
      const groups=p?[p]:data.pages.filter(n=>n.kind==='gallery');
      content=(!p?'<p class="eg-intro">Une lecture peut en ouvrir une autre.</p>':'')+(data.anonyme?login():'')+groups.map(g=>`<section class="eg-branch"><div class="eg-branch-heading"><h2>${p?g.title:link(g)}</h2><span aria-hidden="true">↗</span></div><div class="eg-cards">${data.pages.filter(n=>n.kind!=='gallery'&&n.group===g.id).map(card).join('')}</div></section>`).join('');
    }else if(p.kind==='reading'){
      content=`${art(p.visual)}<div class="eg-reading" id="eg-reading">${p.quotes.map(([song,text])=>{const t=WC57.tracks.find(t=>t.title===song);return `<blockquote><p>${e(text)}</p><footer>${t?`<a href="/chanson/${t.slug}" data-link>${e(song)}</a>`:e(song)}</footer></blockquote>`;}).join('')}</div><button class="eg-subtle" id="eg-superpose" aria-pressed="false">Superposer les lectures</button>${related(p)}`;
    }else if(p.kind==='clock'){
      content=`${art(p.visual)}<div class="eg-durations">${WC57.tracks.map(t=>`<div><span>${e(t.title)}</span><strong>${mmss(Math.floor(t.duration))}</strong><button class="eg-listen" data-play-track="${e(t.slug)}">Écouter</button></div>`).join('')}</div><div class="eg-cards">${data.pages.filter(n=>n.kind==='workshop').map(card).join('')}</div>${related(p)}`;
    }else{
      const discoveries=(p.found||[]).map(a=>`<li><span aria-hidden="true">✧</span> ${e(a.label)}</li>`).join('');
      const partials=(p.partiels||[]).map(v=>`<li class="eg-partial">${v.jetons.map(t=>e(t.sep)+(t.q?'?':`<strong>${e(t.t)}</strong>`)).join('')}</li>`).join('');
      content=`${p.kind==='workshop'?'':art(p.visual)}${p.subtitle?`<p class="eg-subtitle">${e(p.subtitle)}</p>`:''}<div class="eg-found"><ul>${discoveries}${partials}</ul>${p.total?`<span>${p.found.length} / ${p.total} ${p.total>1?'lectures':'lecture'}</span>`:''}</div>${p.locked?locked(p):p.kind==='workshop'?'<div id="eg-workbench" aria-busy="true">Chargement du tableau…</div>':p.open?`<form id="eg-answer" class="eg-answer"><label for="eg-input">${p.source?(p.source.includes('=')?`Ta lecture de ${e(p.source)}`:`${e(p.source)} =`):'Un signe'}</label><div><input id="eg-input" name="answer" placeholder="Proposer un signe" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" required ${data.anonyme?'disabled':''}><button type="submit" class="orange-button" ${data.anonyme?'disabled':''}>Valider</button></div></form>`:'<p class="eg-complete">Toutes les lectures de cette page sont trouvées.</p>'}${data.anonyme?login():''}${related(p)}`;
    }
    app.innerHTML=`<section class="eg-page">${header(p)}<div id="eg-feedback" class="eg-feedback" role="status" aria-live="polite"></div>${content}<footer class="eg-footer"><a href="/57" data-link>Écouter 57</a><a href="/paroles" data-link>Lire les paroles</a>${p?'<a href="/echelon" data-link>Retour à la carte</a>':''}</footer></section>`;
    document.title=`${p?p.title+' · ':''}Échelon · White Cadae`;
    const form=document.getElementById('eg-answer');if(form)form.onsubmit=event=>{event.preventDefault();submit(p,{answer:form.elements.answer.value.trim()},form.querySelector('button'));};
    const toggle=document.getElementById('eg-superpose');if(toggle)toggle.onclick=()=>{const on=toggle.getAttribute('aria-pressed')!=='true';toggle.setAttribute('aria-pressed',String(on));toggle.textContent=on?'Voir les lectures séparément':'Superposer les lectures';document.getElementById('eg-reading').classList.toggle('is-layered',on);};
    if(p?.kind==='clock')bindMusicButtons();
    if(p?.kind==='workshop'&&!p.locked){board=createBoard(p,serial);board.load();}
  }
  async function submit(p,payload,button){
    const token=serial,before=data;if(button)button.disabled=true;
    try{
      const result=await api('/api/echelon/guess',{method:'POST',body:{id:p.id,...payload}});
      if(token!==serial)return;
      const reveals=revealSummary(before,result.state);accept(result.state);
      if(p.kind!=='workshop'||result.gained){if(board){board.leave();board=null;}render();}
      else {const badge=document.querySelector('.eg-level strong');if(badge)badge.textContent=data.echelon;}
      const message=result.gained?`+${result.gained} ${result.gained>1?'échelons':'échelon'}. ${reveals.length?'Un nouveau chemin se révèle.':''}`:result.message||'Une partie de cette lecture est trouvée.';
      feedback(message);
      if(result.gained){await refreshSession();if(token===serial)renderNav();}
    }catch(err){if(token===serial){feedback(err.message);if(err.data?.attenteMs&&button){let remaining=Math.ceil(err.data.attenteMs/1000);const label=button.textContent;const timer=setInterval(()=>{if(token!==serial||--remaining<=0){clearInterval(timer);if(token===serial){button.disabled=false;button.textContent=label;}}else button.textContent=`Réessayer dans ${remaining}s`;},1000);timers.push(timer);return;}}}
    if(token===serial&&button)button.disabled=false;
  }
  async function page(){const epoch=newEpoch(),token=++serial;currentPath=location.pathname;app.innerHTML='<div class="loading">Les chemins se dessinent…</div>';try{data=await api('/api/echelon');if(token!==serial||stale(epoch))return;render();const y=positions.get(currentPath);if(y)requestAnimationFrame(()=>window.scrollTo(0,y));}catch(err){if(token===serial)app.innerHTML=`<h1>Échelon</h1><p>${e(err.message)}</p><a href="/echelon" data-link>Réessayer</a>`;}}
  function leave(){if(currentPath){positions.set(currentPath,window.scrollY);currentPath='';}serial++;timers.forEach(clearInterval);timers=[];board?.leave();board=null;}

  function createBoard(p,token){
    let sources=[],draft=null,revision=0,undo=[],redo=[],timer=null,saving=null,dirty=false,conflict=false,answerText='',dragIndex=null;
    const owner=state.user?.id;
    const key=()=>`wc_echelon_draft_${owner}_${p.id}`;
    const mounted=()=>token===serial&&!!document.getElementById('eg-workbench');
    const initial=()=>({version:1,items:sources.map(s=>({op:'src',ref:s.id})),selected:[]});
    const copy=x=>JSON.parse(JSON.stringify(x));
    const getSource=ref=>sources.find(s=>s.id===ref);
    function value(x){if(x.op==='src')return getSource(x.ref).value;if(x.op==='part')return +String(getSource(x.ref).value)[x.index];if(x.op==='reuse')return value(x.arg);const a=value(x.left),b=value(x.right);const v=({add:()=>a+b,sub:()=>a-b,mul:()=>a*b,div:()=>{if(!b)throw Error('Division par zéro impossible.');return a/b;},join:()=>{if(a<0||b<0||!Number.isInteger(a)||!Number.isInteger(b))throw Error('Assemble des nombres entiers positifs.');return Number(String(a)+String(b));}}[x.op])();if(!Number.isFinite(v)||Math.abs(v)>999999)throw Error('Ce résultat est trop grand.');return v;}
    function expression(x){if(x.op==='src'||x.op==='part')return String(value(x));if(x.op==='reuse')return `${expression(x.arg)} ↗`;return `(${expression(x.left)} ${{add:'+',sub:'−',mul:'×',div:'÷',join:'│'}[x.op]} ${expression(x.right)})`;}
    function origins(x,set=new Set()){if(x.ref)set.add(getSource(x.ref).label);if(x.left)origins(x.left,set);if(x.right)origins(x.right,set);if(x.arg)origins(x.arg,set);return [...set].join(' · ');}
    function checkUses(items){const counts=new Map(),shared=new Set();function visit(x,reused=false){if(x.op==='src'||x.op==='part'){const digits=x.op==='part'?[x.index]:[...String(getSource(x.ref).value)].map((_,i)=>i);for(const i of digits){const key=x.ref+'.'+i;counts.set(key,(counts.get(key)||0)+1);if(reused)shared.add(key);}return;}if(x.op==='reuse'){if(reused)throw Error('Ce nombre est déjà partagé.');visit(x.arg,true);}else{visit(x.left,reused);visit(x.right,reused);}}items.forEach(x=>visit(x));if([...counts].some(([r,n])=>n>(shared.has(r)?2:1)))throw Error('Un nombre partagé peut servir deux fois.');}
    function local(){if(!draft)return;try{localStorage.setItem(key(),JSON.stringify({draft,revision,pending:dirty,updatedAt:Date.now()}));}catch{/* quota: remote draft still works */}}
    function schedule(){dirty=true;local();clearTimeout(timer);timer=setTimeout(flush,650);}
    async function flush(){
      clearTimeout(timer);if(!draft||!dirty||conflict)return;if(saving){await saving;if(dirty&&!conflict)return flush();return;}
      const snapshot=JSON.stringify(draft);
      saving=(async()=>{
      try{const result=await api(`/api/echelon/draft/${p.id}`,{method:'POST',body:{draft:JSON.parse(snapshot),revision}});revision=result.revision;dirty=JSON.stringify(draft)!==snapshot;local();
        if(mounted()){const newlyShared=!data.capabilities.share&&result.state.capabilities.share;accept(result.state);if(newlyShared){paint();const paths=document.querySelector('.eg-related');if(paths)paths.outerHTML=related(pageBy(p.id));feedback('Une nouvelle possibilité se révèle : partager un nombre.');}else saveLabel('Brouillon sauvegardé');}
      }catch(err){if(err.status===409){conflict=true;if(mounted()){paint();feedback(err.message);}}else if(mounted())saveLabel('Brouillon conservé sur cet appareil');}
      })();
      await saving;saving=null;
    }
    function saveLabel(text){const el=document.getElementById('eg-save');if(el)el.textContent=text;}
    function change(next){undo.push(copy(draft));if(undo.length>35)undo.shift();redo=[];draft=next;paint();schedule();}
    function calculate(op){try{
      const selected=draft.selected,x=draft.items[selected[0]],y=draft.items[selected[1]];
      let output=[];
      if(op==='split'){if(x.op!=='src'||String(value(x)).length<2)throw Error('Sélectionne un groupe de chiffres de la durée.');output=[...String(value(x))].map((_,index)=>({op:'part',ref:x.ref,index}));}
      else if(op==='detach'){if(x.op==='reuse')throw Error('Annule le partage pour modifier ce nombre.');else if(x.left)output=[x.left,x.right];else throw Error('Ce nombre est déjà séparé.');}
      else if(op==='reuse'){if(!data.capabilities.share)throw Error('Cette possibilité n’est pas encore découverte.');output=[x,{op:'reuse',arg:x}];}
      else{if(selected.length!==2)throw Error('Choisis deux nombres, dans l’ordre de ton calcul.');output=[{op,left:x,right:y}];value(output[0]);}
      const items=draft.items.filter((_,i)=>!selected.includes(i)).concat(output);if(items.length>30)throw Error('Détache ou reprends une construction pour faire de la place.');checkUses(items);
      change({version:1,items,selected:output.length===1?[items.length-1]:[]});
    }catch(err){feedback(err.message);}}
    function paint(){if(!mounted()||!draft)return;const root=document.getElementById('eg-workbench');const active=document.activeElement;const focusKey=root.contains(active)?(active.id?'#'+active.id:active.hasAttribute('data-tile')?'[data-tile="'+active.dataset.tile+'"]':active.hasAttribute('data-op')?'[data-op="'+active.dataset.op+'"]':null):null;root.setAttribute('aria-busy','false');
      const n=draft.selected.length;
      root.innerHTML=`<div class="eg-bench"><div class="eg-bench-top"><p>Relie les nombres. Change de lecture.</p><span id="eg-save" role="status">${dirty?'Brouillon local':'Brouillon sauvegardé'}</span></div>${conflict?'<div class="eg-conflict">Un autre appareil a enregistré une version.<button id="eg-remote">Charger sa version</button><button id="eg-local">Garder mon brouillon ici</button></div>':''}<div class="eg-tiles" aria-label="Nombres et constructions">${draft.items.map((x,i)=>`<button class="eg-tile" data-tile="${i}" draggable="true" aria-pressed="${draft.selected.includes(i)}"><small>${e(origins(x))}</small><strong>${e(Number(value(x).toFixed(5)))}</strong>${x.left||x.op==='reuse'?`<span>${e(expression(x))}</span>`:''}<i>${draft.selected.includes(i)?`${draft.selected.indexOf(i)+1} · sélectionné`:'Sélectionner'}</i></button>`).join('')}</div><div class="eg-tools" aria-label="Opérations">${[['add','+','Additionner'],['sub','−','Soustraire'],['mul','×','Multiplier'],['div','÷','Diviser'],['join','│','Assembler']].map(([op,symbol,label])=>`<button data-op="${op}" ${n!==2?'disabled':''}><span aria-hidden="true">${symbol}</span>${label}</button>`).join('')}<button data-op="split" ${n!==1?'disabled':''}>Séparer</button><button data-op="detach" ${n!==1?'disabled':''}>Détacher</button>${data.capabilities.share?`<button data-op="reuse" ${n!==1?'disabled':''}>Partager ↗</button>`:''}</div><div class="eg-history"><button id="eg-undo" ${!undo.length?'disabled':''}>↶ Annuler</button><button id="eg-redo" ${!redo.length?'disabled':''}>Rétablir ↷</button><button id="eg-reset">Repartir des durées</button></div><form id="eg-board-answer" class="eg-answer">${p.board==='first'?`<label for="eg-meaning">Quelle lecture vois-tu ?</label><input id="eg-meaning" name="meaning" maxlength="200" autocomplete="off" placeholder="Proposer un signe" value="${e(answerText)}">`:''}<button class="orange-button" type="submit">Valider ma lecture</button></form><p class="eg-bench-note">Sélectionne deux nombres dans l’ordre souhaité. │ assemble les chiffres. Les essais restent réversibles.</p></div>`;
      root.querySelectorAll('[data-tile]').forEach(el=>{const index=+el.dataset.tile;el.onclick=()=>{const d=copy(draft);d.selected=d.selected.includes(index)?d.selected.filter(i=>i!==index):[...d.selected.slice(-1),index];draft=d;paint();schedule();};el.ondragstart=()=>{dragIndex=index;};el.ondragover=event=>event.preventDefault();el.ondrop=event=>{event.preventDefault();if(dragIndex===null||dragIndex===index)return;const items=copy(draft.items),item=items.splice(dragIndex,1)[0];items.splice(index,0,item);change({version:1,items,selected:[]});dragIndex=null;};});
      root.querySelectorAll('[data-op]').forEach(el=>el.onclick=()=>calculate(el.dataset.op));
      root.querySelector('#eg-undo').onclick=()=>{redo.push(copy(draft));draft=undo.pop();paint();schedule();};
      root.querySelector('#eg-redo').onclick=()=>{undo.push(copy(draft));draft=redo.pop();paint();schedule();};
      root.querySelector('#eg-reset').onclick=()=>change(initial());
      root.querySelector('#eg-board-answer').onsubmit=async event=>{event.preventDefault();if(p.board==='first')answerText=event.target.elements.meaning.value.trim();await flush();if(!mounted())return;await submit(p,{roots:draft.items,answer:answerText},event.target.querySelector('button'));};
      const field=root.querySelector('#eg-meaning');if(field)field.oninput=()=>{answerText=field.value;};
      if(conflict){root.querySelector('#eg-remote').onclick=()=>load(true);root.querySelector('#eg-local').onclick=async()=>{const current=await api(`/api/echelon/draft/${p.id}`);revision=current.revision;conflict=false;dirty=true;paint();flush();};}
      if(focusKey){const target=root.querySelector(focusKey);if(target&&!target.disabled)target.focus({preventScroll:true});else root.querySelector('[data-tile][aria-pressed="true"]')?.focus({preventScroll:true});}
    }
    async function load(remoteOnly=false){try{
      const remote=await api(`/api/echelon/draft/${p.id}`);if(!mounted())return;sources=remote.sources;revision=remote.revision;draft=remote.draft||initial();conflict=false;dirty=false;
      if(!remoteOnly){try{const saved=JSON.parse(localStorage.getItem(key()));if(saved?.pending){draft=saved.draft;dirty=true;if(saved.revision!==revision)conflict=true;}}catch{/* a corrupt local draft must not break the page */}}
      try{draft.items.forEach(value);}catch{draft=remote.draft||initial();dirty=false;}
      undo=[];redo=[];local();paint();if(dirty&&!conflict)flush();
    }catch(err){if(mounted())document.getElementById('eg-workbench').innerHTML=`<p>${e(err.message)}</p><a href="${e(p.href)}" data-link>Réessayer</a>`;}}
    return {load,leave(){clearTimeout(timer);local();flush();}};
  }
  return {page,leave,clear(){leave();data=null;positions.clear();}};
})();
