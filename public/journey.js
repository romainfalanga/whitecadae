window.WCJourney=(()=>{
  let resize=null;
  const labels={available:'À explorer',partial:'En cours',solved:'Résolue',locked:'Verrouillée',passage:'Passage ouvert'};
  function leave(){resize?.disconnect();resize=null;}
  async function page(){
    leave();const epoch=newEpoch();document.title='Mon arborescence · White Cadae';
    app.innerHTML='<div class="loading">Chargement de ton arborescence…</div>';
    let data;try{data=await api('/api/echelon/map');}catch(err){if(!stale(epoch))app.innerHTML=`<h1>Mon arborescence</h1><p>${esc(err.message)}</p><a href="/connexion?retour=%2Fparcours" data-link>Se connecter</a>`;return;}
    if(stale(epoch))return;
    const byId=new Map(data.nodes.map(n=>[n.id,n])),depth=new Map();
    function rank(id,visiting=new Set()){
      if(depth.has(id))return depth.get(id);if(visiting.has(id))return 0;
      visiting.add(id);const parents=data.edges.filter(e=>e.to===id).map(e=>e.from);
      const value=parents.length?1+Math.max(...parents.map(p=>rank(p,new Set(visiting)))):0;
      depth.set(id,value);return value;
    }
    data.nodes.forEach(n=>rank(n.id));
    const columns=Array.from({length:Math.max(0,...depth.values())+1},(_,i)=>data.nodes.filter(n=>depth.get(n.id)===i));
    let selected=null,filter='all',search='';
    const title=n=>n.title||'La porte';
    const count=n=>n.kind==='clock'?'Laboratoire':n.total===null?`${n.found.length} signe${n.found.length>1?'s':''} trouvé${n.found.length>1?'s':''}`:`${n.found.length} / ${n.total} signe${n.total>1?'s':''}`;
    app.innerHTML=`<section class="journey-page"><a class="back-link" href="/membre/${encodeURIComponent(state.user.username)}" data-link>← Mon profil</a><header class="journey-header"><div><p class="eyebrow">Ton champ des possibles</p><h1>Mon arborescence</h1></div><div class="eg-level"><span>Échelon</span><strong>${data.echelon}</strong></div></header>
      <div class="journey-summary"><div><strong>${data.summary.remaining}</strong><span>signes visibles à trouver</span></div><div><strong>${data.summary.horizon}${data.summary.uncounted?' +':''}</strong><span>horizon d’échelon actuellement visible</span></div></div>
      <p class="journey-intro">Ce champ s’agrandit avec tes découvertes. Les chemins gris sont visibles, mais attendent encore une clé ou un échelon.${data.summary.uncounted?' La porte garde une part inconnue.':''}</p>
      <div class="journey-tools"><div class="journey-filters" role="group" aria-label="État des énigmes">${[['all','Tout voir'],['todo','À explorer'],['partial','En cours'],['solved','Résolues'],['locked','Verrouillées']].map(([id,label])=>`<button type="button" data-map-filter="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><label class="journey-search"><span class="sr-only">Rechercher une énigme visible</span><input id="journey-search" type="search" placeholder="Rechercher une énigme…"></label></div>
      <p id="journey-filter-status" class="journey-hint" role="status" aria-live="polite"></p>
      <div class="journey-workspace"><div class="journey-scroll" tabindex="0" aria-label="Carte des chemins visibles, défilement horizontal"><div class="journey-map" id="journey-map"><svg class="journey-lines" aria-hidden="true"></svg>${columns.map((nodes,i)=>`<div class="journey-column" data-depth="${i}">${nodes.map(n=>`<button type="button" class="journey-node ${n.status}" data-map-node="${n.id}" aria-pressed="false" aria-controls="journey-detail"><span class="journey-node-status">${labels[n.status]}</span><strong>${esc(title(n))}</strong><span>${count(n)}</span>${n.minLevel?`<small>Échelon ${n.minLevel}${data.echelon>=n.minLevel?' atteint':' requis'}</small>`:''}</button>`).join('')}</div>`).join('')}</div></div>
      <aside id="journey-detail" class="journey-detail" aria-label="Détail du chemin"><p class="eyebrow">Choisis une énigme</p><h2>Une piste en ouvre une autre.</h2><p>Sélectionne une carte pour voir tes découvertes, ce qui lui donne accès et les chemins déjà visibles qu’elle ouvre.</p><a href="/echelon" data-link>Retrouver les énigmes →</a></aside></div>
      <p class="journey-hint">Les traits relient les découvertes et leurs ouvertures. Une même énigme peut demander plusieurs signes ; chacun fait gagner un échelon.</p></section>`;
    const root=document.getElementById('journey-map'),detail=document.getElementById('journey-detail');
    const cards=new Map([...root.querySelectorAll('[data-map-node]')].map(el=>[el.dataset.mapNode,el]));
    function draw(){
      if(stale(epoch))return;const svg=root.querySelector('svg'),box=root.getBoundingClientRect();
      svg.setAttribute('viewBox',`0 0 ${root.scrollWidth} ${root.scrollHeight}`);
      svg.innerHTML=data.edges.map(edge=>{
        const a=cards.get(edge.from).getBoundingClientRect(),b=cards.get(edge.to).getBoundingClientRect();
        const x1=a.right-box.left,y1=a.top-box.top+a.height/2,x2=b.left-box.left,y2=b.top-box.top+b.height/2,mid=(x1+x2)/2;
        return `<path class="${edge.found>=edge.needed?'met':''} ${selected&&(edge.from===selected||edge.to===selected)?'active':''}" d="M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}"/>`;
      }).join('');
    }
    function apply(){
      let count=0,first=null;for(const n of data.nodes){const match=(filter==='all'||filter==='todo'&&['available','partial'].includes(n.status)||n.status===filter)&&title(n).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(search);cards.get(n.id).classList.toggle('is-dimmed',!match);if(match){count++;first||=cards.get(n.id);}}
      if(first&&(search||filter!=='all')){const viewport=root.parentElement;viewport.scrollTo({left:first.offsetLeft-(viewport.clientWidth-first.offsetWidth)/2,top:first.offsetTop-(viewport.clientHeight-first.offsetHeight)/2,behavior:'auto'});}
      document.querySelectorAll('[data-map-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapFilter===filter)));
      document.getElementById('journey-filter-status').textContent=`${count} ${count>1?'chemins mis':'chemin mis'} en lumière sur ${data.nodes.length} visibles.`;
    }
    function select(id){
      selected=id;const n=byId.get(id),incoming=data.edges.filter(e=>e.to===id),outgoing=data.edges.filter(e=>e.from===id);
      cards.forEach((card,key)=>card.setAttribute('aria-pressed',String(key===id)));
      const jump=(nodeId,label)=>`<button type="button" class="journey-jump" data-jump="${nodeId}">${esc(label||title(byId.get(nodeId)))}</button>`;
      const condition=edge=>edge.type==='passage'?'Accessible depuis Horloge':edge.type==='discovery'?'Découverte dans le laboratoire':`${edge.found} / ${edge.needed} ${edge.needed>1?'signes précis requis':'signe précis requis'}`;
      detail.innerHTML=`<p class="eyebrow">${labels[n.status]}</p><h2>${esc(title(n))}</h2><p>${count(n)}</p>${n.found?.length?`<ul class="journey-found">${n.found.map(a=>`<li>${esc(a.label)}</li>`).join('')}</ul>`:''}${n.partiels?.length?`<p class="journey-hint">${n.partiels.length} lecture${n.partiels.length>1?'s':''} partiellement trouvée${n.partiels.length>1?'s':''}.</p>`:''}
        <h3>Pour y accéder</h3>${n.minLevel?`<p>${data.echelon>=n.minLevel?'✓':'○'} Échelon ${n.minLevel}</p>`:''}${incoming.length?`<ul>${incoming.map(edge=>`<li>${jump(edge.from)}<small>${condition(edge)}</small></li>`).join('')}</ul>`:n.minLevel?'':'<p>Ce chemin est ouvert dès le départ.</p>'}
        ${outgoing.length?`<h3>Chemins reliés</h3><ul>${[...new Set(outgoing.map(e=>e.to))].map(to=>`<li>${jump(to)}<small>${labels[byId.get(to).status]}</small></li>`).join('')}</ul>`:''}
        <a class="orange-button" href="${esc(n.href)}" data-link>${n.kind==='clock'?'Ouvrir Horloge':n.status==='locked'?'Voir l’énigme verrouillée':n.status==='solved'?'Revoir l’énigme':'Explorer cette piste'}</a>`;
      detail.querySelectorAll('[data-jump]').forEach(button=>button.onclick=()=>{select(button.dataset.jump);const target=cards.get(button.dataset.jump);target.scrollIntoView({block:'nearest',inline:'center',behavior:motion()});target.focus({preventScroll:true});});
      draw();
    }
    const motion=()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth';
    cards.forEach((card,id)=>card.onclick=()=>{select(id);if(window.matchMedia('(max-width:700px)').matches)detail.scrollIntoView({block:'start',behavior:motion()});});
    document.querySelectorAll('[data-map-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.mapFilter;apply();});
    document.getElementById('journey-search').oninput=event=>{search=event.target.value.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();apply();};
    resize=new ResizeObserver(draw);resize.observe(root);apply();requestAnimationFrame(draw);
  }
  return {page,leave};
})();
