// Layered map with native page scrolling and details beside the selected node.
window.WCJourney=(()=>{
  const labels={available:'À explorer',partial:'En cours',solved:'Résolue',locked:'Verrouillée',passage:'Passage ouvert'};
  function leave(){document.body.classList.remove('journey-wide');}
  async function page(){
    leave();
    if(new URLSearchParams(location.search).get('view')==='ouvertures'){navigate('/#mon-palier',true);return;}
    const epoch=newEpoch();document.title='Mon arborescence · White Cadae';
    app.innerHTML='<div class="loading">Chargement de ton arborescence…</div>';
    let data;try{data=await api('/api/echelon/map');}catch(err){if(!stale(epoch))app.innerHTML=`<h1>Mon arborescence</h1><p>${esc(err.message)}</p><a href="/connexion?retour=%2Fparcours" data-link>Se connecter</a>`;return;}
    if(stale(epoch))return;
    document.body.classList.add('journey-wide');
    const byId=new Map(data.nodes.map(n=>[n.id,n])),depth=new Map();
    function rank(id,visiting=new Set()){
      if(depth.has(id))return depth.get(id);if(visiting.has(id))return 0;
      visiting.add(id);const parents=data.edges.filter(e=>e.to===id).map(e=>e.from);
      const value=parents.length?1+Math.max(...parents.map(p=>rank(p,new Set(visiting)))):0;
      depth.set(id,value);return value;
    }
    data.nodes.forEach(n=>rank(n.id));
    const groups=Array.from({length:Math.max(0,...depth.values())+1},(_,i)=>data.nodes.filter(n=>depth.get(n.id)===i));
    let selected=null,filter='all',search='';
    const title=n=>n.title||'La porte';
    const count=n=>n.kind==='clock'?'Laboratoire':n.total===null?`${n.found.length} signe${n.found.length>1?'s':''} trouvé${n.found.length>1?'s':''}`:`${n.found.length} / ${n.total} signes trouvés`;
    const normal=s=>s.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const incoming=id=>data.edges.filter(e=>e.to===id);
    const nodeHtml=n=>`<div class="path-item" data-path-item="${n.id}"><button type="button" class="journey-node ${n.status}" id="node-${n.id}" data-map-node="${n.id}" aria-expanded="false" aria-controls="detail-${n.id}"><span class="journey-node-status">${labels[n.status]}</span><strong>${esc(title(n))}</strong><span>${count(n)}</span>${n.minLevel?`<small>Échelon ${n.minLevel}${data.echelon>=n.minLevel?' atteint':' requis'}</small>`:''}<span class="path-origin">${incoming(n.id).length?'Depuis '+[...new Set(incoming(n.id).map(e=>title(byId.get(e.from))))].map(esc).join(' · '):'Point de départ'}</span><span class="path-expand">Voir les pistes et les liens <b aria-hidden="true">＋</b></span></button><section class="journey-detail" id="detail-${n.id}" aria-labelledby="node-${n.id}" hidden></section></div>`;
    app.innerHTML=`<section class="journey-page journey-flow"><a class="back-link" href="/membre/${encodeURIComponent(state.user?.username||'')}" data-link>← Mon profil</a><header class="journey-header"><div><p class="eyebrow">Tes découvertes, leurs chemins</p><h1>Mon arborescence</h1></div><div class="eg-level"><span>Échelon</span><strong>${data.echelon}</strong></div></header>
      <div class="journey-summary"><div><strong>${data.summary.remaining}</strong><span>signes visibles à trouver</span></div><div><strong>${data.summary.available}</strong><span>pistes à explorer</span></div><a href="/#mon-palier" data-link>Mes contenus disponibles →</a></div>
      <p class="journey-intro">Pars des premières pistes, puis descends vers les chemins qu’elles révèlent. Ouvre une carte pour suivre ses liens. Seules les énigmes déjà visibles dans ton parcours apparaissent ici.</p>
      <div class="journey-tools"><div class="journey-filters" role="group" aria-label="État des énigmes">${[['all','Tout voir'],['todo','À explorer'],['partial','En cours'],['solved','Résolues'],['locked','Verrouillées']].map(([id,label])=>`<button type="button" data-map-filter="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><label class="journey-search"><span class="sr-only">Rechercher une énigme visible</span><input id="journey-search" type="search" placeholder="Rechercher une énigme…"></label></div>
      <p id="journey-filter-status" class="journey-hint" role="status" aria-live="polite"></p>
      <div class="path-map">${groups.map((nodes,i)=>`<section class="path-group" data-path-group="${i}" aria-labelledby="path-group-${i}"><header class="path-group-heading"><span aria-hidden="true">${String(i+1).padStart(2,'0')}</span><div><h2 id="path-group-${i}">${i===0?'Les premières pistes':`Les chemins reliés · ${i}`}</h2><p>${i===0?'Les entrées de ton territoire visible.':'Suis les liens des cartes pour retrouver leurs origines.'}</p></div></header><div class="path-grid">${nodes.map(nodeHtml).join('')}</div></section>`).join('')}</div>
      <div id="journey-empty" class="story-extra" hidden><h2>Aucune piste ne correspond</h2><p>Essaie un autre mot ou retrouve toutes tes énigmes visibles.</p><button type="button" id="journey-reset">Tout afficher</button></div>
      <footer class="journey-footer"><a class="orange-button" href="/echelon" data-link>Proposer mes réponses →</a><a href="/#mon-palier" data-link>Mes contenus disponibles →</a></footer></section>`;
    const cards=new Map([...app.querySelectorAll('[data-map-node]')].map(el=>[el.dataset.mapNode,el]));
    const items=new Map([...app.querySelectorAll('[data-path-item]')].map(el=>[el.dataset.pathItem,el]));
    function apply(){
      let matches=0;
      for(const n of data.nodes){const match=(filter==='all'||filter==='todo'&&['available','partial'].includes(n.status)||n.status===filter)&&normal(title(n)).includes(search);items.get(n.id).hidden=!match;if(match)matches++;}
      app.querySelectorAll('[data-path-group]').forEach(g=>g.hidden=![...g.querySelectorAll('[data-path-item]')].some(item=>!item.hidden));
      app.querySelectorAll('[data-map-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapFilter===filter)));
      document.getElementById('journey-filter-status').textContent=`${matches} piste${matches>1?'s':''} affichée${matches>1?'s':''} sur ${data.nodes.length} visibles.`;
      document.getElementById('journey-empty').hidden=!!matches;
    }
    function reset(){filter='all';search='';document.getElementById('journey-search').value='';apply();}
    function select(id,force=false){
      const closing=selected===id&&!force;
      cards.forEach((card,key)=>{card.setAttribute('aria-expanded','false');card.querySelector('.path-expand b').textContent='＋';document.getElementById('detail-'+key).hidden=true;items.get(key).classList.remove('is-expanded');});
      selected=closing?null:id;if(closing)return;
      const n=byId.get(id),ins=incoming(id),outs=data.edges.filter(e=>e.from===id),detail=document.getElementById('detail-'+id);
      const jump=(nodeId)=>`<button type="button" class="journey-jump" data-jump="${nodeId}">${esc(title(byId.get(nodeId)))} →</button>`;
      const condition=edge=>edge.type==='passage'?'Accessible depuis Horloge':edge.type==='discovery'?'Découverte dans le laboratoire':`${edge.found} / ${edge.needed} signe${edge.needed>1?'s':''} requis`;
      detail.innerHTML=`<div><h3>Tes découvertes</h3>${n.found.length?`<ul class="journey-found">${n.found.map(a=>`<li>${esc(a.label)}</li>`).join('')}</ul>`:'<p>Aucun signe complet trouvé sur cette piste.</p>'}${n.partiels.length?`<p>${n.partiels.length} lecture${n.partiels.length>1?'s':''} en cours.</p>`:''}</div><div><h3>Pour y accéder</h3>${n.minLevel?`<p>${data.echelon>=n.minLevel?'✓':'○'} Échelon ${n.minLevel}</p>`:''}${ins.length?`<ul>${ins.map(edge=>`<li>${jump(edge.from)}<small>${condition(edge)}</small></li>`).join('')}</ul>`:'<p>Pas de piste préalable.</p>'}</div>${outs.length?`<div><h3>Chemins reliés</h3><ul>${[...new Set(outs.map(e=>e.to))].map(to=>`<li>${jump(to)}<small>${labels[byId.get(to).status]}</small></li>`).join('')}</ul></div>`:''}<a class="orange-button" href="${esc(n.href)}" data-link>${n.kind==='clock'?'Ouvrir Horloge':n.status==='locked'?'Voir les conditions':n.status==='solved'?'Revoir cette énigme':'Explorer cette piste'}</a>`;
      detail.hidden=false;cards.get(id).setAttribute('aria-expanded','true');cards.get(id).querySelector('.path-expand b').textContent='−';items.get(id).classList.add('is-expanded');
      detail.querySelectorAll('[data-jump]').forEach(button=>button.onclick=()=>{reset();select(button.dataset.jump,true);const target=cards.get(button.dataset.jump);target.scrollIntoView({block:'start',behavior:'auto'});target.focus({preventScroll:true});});
    }
    cards.forEach((card,id)=>card.onclick=()=>select(id));
    app.querySelectorAll('[data-map-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.mapFilter;apply();});
    document.getElementById('journey-search').oninput=event=>{search=normal(event.target.value).trim();apply();};
    document.getElementById('journey-reset').onclick=reset;apply();
  }
  return {page,leave};
})();
