window.WCConversation = (() => {
  let cleanup = () => {};
  function leave() { cleanup(); cleanup = () => {}; document.body.classList.remove('conversation-mode','chat-keyboard'); }
  async function page() {
    leave();
    const epoch = newEpoch(), events = new AbortController();
    document.title = 'Conversation · White Cadae';
    document.body.classList.add('conversation-mode');
    const params = new URLSearchParams(location.search);
    const filter = {theme: ['general','indices'].includes(params.get('theme')) ? params.get('theme') : 'tout', mode: ['exact','min','max','historique'].includes(params.get('mode')) ? params.get('mode') : 'tout', niveau: params.get('niveau') || '2'};
    let data = {messages: [], echelon: 2, nextBefore: null}, revision = 0, loading = false, sending = false;
    const draftKey = 'wc-conversation-draft-' + state.user.id;
    let draft = {body:'', theme:'general', min:2};
    try { draft = {...draft, ...JSON.parse(sessionStorage.getItem(draftKey) || '{}')}; } catch {}
    if (!['general','indices'].includes(draft.theme)) draft.theme = 'general';
    const query = extras => new URLSearchParams({...filter, ...extras}).toString();
    app.innerHTML = `<section class="chat-shell" aria-label="Conversation générale">
      <header class="chat-head"><h1>Conversation</h1><span>Un espace commun</span></header>
      <div class="chat-toolbar"><div class="chat-chips" role="group" aria-label="Filtrer par thème"><button data-filter="tout">Tout</button><button data-filter="general">Général</button><button data-filter="indices">Indice</button></div><button id="chat-level-button" aria-expanded="false" aria-controls="chat-levels">Échelon <span id="chat-level-label">· Tous</span> ⌄</button>
        <div id="chat-levels" class="chat-popover" hidden><div class="chat-chips" role="group" aria-label="Mode du filtre"><button data-mode="tout">Tous mes accès</button><button data-mode="max">Jusqu’à</button><button data-mode="exact">Exactement</button><button data-mode="min">À partir de</button></div><div id="chat-level-options" class="chat-number-buttons" aria-label="Choisir un échelon"></div><button id="chat-level-close" class="link-btn">Fermer</button></div>
      </div>
      <div class="chat-stream"><button id="chat-older" hidden>Messages précédents ↑</button><div id="chat-messages" role="log" aria-label="Messages"><p class="chat-empty">Chargement de la conversation…</p></div><button id="chat-new" hidden>Nouveaux messages ↓</button></div>
      <form class="chat-compose" id="chat-form"><p id="chat-status" role="status" aria-live="polite"></p>
        <div class="chat-compose-options"><div class="chat-chips" role="group" aria-label="Thème de ton message"><button type="button" data-compose-theme="general">Général</button><button type="button" data-compose-theme="indices">Indice</button></div><button type="button" id="chat-audience-button" aria-expanded="false" aria-controls="chat-audience">Visible dès <span id="chat-audience-label"></span> ⌄</button></div>
        <div id="chat-audience" class="chat-popover chat-audience" hidden><p>Visible dès l’échelon</p><div class="chat-number-buttons" id="chat-audience-options"></div><button type="button" class="link-btn" id="chat-audience-close">Fermer</button></div>
        <div class="chat-input-row"><label class="sr-only" for="chat-body">Ton message</label><textarea id="chat-body" rows="1" maxlength="2000" placeholder="Écrire un message…" required>${esc(draft.body)}</textarea><button class="primary" type="submit" id="chat-send" aria-label="Envoyer le message">Envoyer ↑</button></div>
      </form></section>`;
    const el = id => document.getElementById('chat-' + id), stream = app.querySelector('.chat-stream');
    const saveDraft = () => { draft.body = el('body').value; try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch {} };
    let largestViewport=window.visualViewport?.height||innerHeight;
    const resize = () => {
      const viewport = window.visualViewport;
      const height=viewport?.height||innerHeight;largestViewport=Math.max(largestViewport,height);
      const focused=document.activeElement===el('body');
      const keyboard=focused && (Math.max(innerHeight,largestViewport)-height>140);
      document.body.classList.toggle('chat-keyboard',keyboard);
      const bottom = height + (viewport?.offsetTop || 0);
      const player = document.getElementById('music-player');
      const playerHeight = player && !player.hidden && !keyboard ? player.getBoundingClientRect().height : 0;
      app.style.setProperty('--chat-height', Math.max(0, bottom - app.getBoundingClientRect().top - playerHeight) + 'px');
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.querySelector('.site-header')); observer.observe(document.getElementById('music-player'));
    window.addEventListener('resize', resize, {signal:events.signal});
    window.visualViewport?.addEventListener('resize', resize, {signal:events.signal});
    window.visualViewport?.addEventListener('scroll', resize, {signal:events.signal});
    cleanup = () => { saveDraft(); events.abort(); observer.disconnect(); };
    function grow() { el('body').style.height = '0px'; el('body').style.height = Math.min(72, el('body').scrollHeight) + 'px'; }
    function controls() {
      app.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter.theme)));
      app.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === filter.mode)));
      app.querySelectorAll('[data-compose-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.composeTheme === draft.theme)));
      el('audience-label').textContent = 'Échelon ' + draft.min;
      el('level-label').textContent = filter.mode === 'tout' ? '· Tous' : filter.mode === 'historique' ? '· Historique' : ({exact:'=',max:'≤',min:'≥'}[filter.mode] + ' ' + filter.niveau);
      const levels = Array.from({length:Math.max(1,data.echelon-1)},(_,i)=>i+2);
      el('level-options').innerHTML = levels.map(n=>`<button data-level="${n}" aria-pressed="${String(n)===String(filter.niveau)&&filter.mode!=='tout'}">${n}</button>`).join('');
      el('audience-options').innerHTML = levels.map(n=>`<button type="button" data-audience="${n}" aria-pressed="${n===Number(draft.min)}">${n}</button>`).join('');
    }
    const bottom = () => stream.scrollHeight - stream.scrollTop - stream.clientHeight < 70;
    function render(placement = 'keep') {
      const height=stream.scrollHeight, top=stream.scrollTop, near=bottom();
      el('messages').innerHTML = data.messages.length ? data.messages.map(m=>`<article class="chat-message ${m.username===state.user.username?'is-mine':''}" id="message-${m.id}"><div class="chat-message-meta">${authorLink(m.username)}<span>${m.theme==='indices'?'Indice':'Général'} · ${m.echelon_version===1?'Accès historique':'Éch.'} ${m.min_echelon}</span></div><p>${esc(m.body)}</p><time datetime="${esc(m.created_at.replace(' ','T')+'Z')}">${esc(new Date(m.created_at.replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</time></article>`).join('') : '<div class="chat-empty"><span aria-hidden="true">◇</span><p>Aucun message pour le moment.</p><small>La conversation est ouverte.</small></div>';
      el('older').hidden = !data.nextBefore;
      if (placement==='older') stream.scrollTop=stream.scrollHeight-height+top;
      else if (placement==='bottom'||near) { stream.scrollTop=stream.scrollHeight; el('new').hidden=true; }
      else { stream.scrollTop=top; if(placement==='new')el('new').hidden=false; }
    }
    async function load(kind='replace') {
      if (loading && kind!=='replace') return;
      const token=revision; loading=true;
      const extras = kind==='older' ? {before:data.nextBefore} : kind==='poll' && data.messages.length ? {after:data.messages.at(-1).id} : {};
      if(kind==='replace') el('status').textContent='Chargement…';
      try {
        let next;
        do {
          next = await api('/api/conversation?' + query(extras));
          if (stale(epoch)||token!==revision) return;
          if(kind==='replace') data=next;
          else { data.messages=[...new Map([...data.messages,...next.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id); data.echelon=next.echelon; if(kind==='older'||kind==='poll'&&!extras.after)data.nextBefore=next.nextBefore; }
          draft.min=Math.min(data.echelon,Math.max(2,Number(draft.min)||2));
          controls(); render(kind==='replace'?'bottom':kind==='older'?'older':next.messages.length?'new':'keep');
          extras.after=next.nextAfter;
        } while(kind==='poll' && next.nextAfter);
        el('status').textContent='';
      } catch(error) { if(!stale(epoch)&&token===revision)el('status').textContent=error.message; }
      finally { if(token===revision)loading=false; }
    }
    function toggle(id, button, value) { el(id).hidden=!value;el(button).setAttribute('aria-expanded',String(value)); }
    function apply() { revision++; history.replaceState(null,'','/conversation?'+query({})); controls(); load(); }
    app.addEventListener('click',event=>{
      const button=event.target.closest('button'); if(!button)return;
      if(button.dataset.filter){filter.theme=button.dataset.filter;apply();}
      if(button.dataset.mode){filter.mode=button.dataset.mode;apply();}
      if(button.dataset.level){filter.niveau=button.dataset.level;if(filter.mode==='tout'||filter.mode==='historique')filter.mode='exact';apply();}
      if(button.dataset.composeTheme){draft.theme=button.dataset.composeTheme;saveDraft();controls();}
      if(button.dataset.audience){draft.min=Number(button.dataset.audience);saveDraft();controls();toggle('audience','audience-button',false);el('body').focus();}
    },{signal:events.signal});
    el('level-button').onclick=()=>{toggle('audience','audience-button',false);toggle('levels','level-button',el('levels').hidden);};
    el('level-close').onclick=()=>toggle('levels','level-button',false);
    el('audience-button').onclick=()=>{toggle('levels','level-button',false);toggle('audience','audience-button',el('audience').hidden);};
    el('audience-close').onclick=()=>toggle('audience','audience-button',false);
    el('older').onclick=()=>load('older');
    el('new').onclick=()=>{stream.scrollTop=stream.scrollHeight;el('new').hidden=true;};
    stream.addEventListener('scroll',()=>{if(bottom())el('new').hidden=true;},{signal:events.signal});
    el('body').oninput=()=>{grow();saveDraft();};
    el('body').onfocus=resize;el('body').onblur=resize;
    el('body').onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();el('form').requestSubmit();}};
    el('form').onsubmit=async event=>{
      event.preventDefault(); if(sending||!el('body').value.trim())return;
      const text=el('body').value.trim(); sending=true;el('send').disabled=true;
      try {
        await api('/api/conversation',{method:'POST',body:{body:text,theme:draft.theme,min_echelon:Number(draft.min)}});
        if(stale(epoch))return;
        if(el('body').value.trim()===text)el('body').value='';saveDraft();grow();
        await load('poll');
        if(filter.theme!=='tout'&&filter.theme!==draft.theme||filter.mode!=='tout')el('status').textContent='Message envoyé. Les filtres de lecture restent actifs.';
        else {stream.scrollTop=stream.scrollHeight;el('new').hidden=true;}
      } catch(error){if(!stale(epoch))el('status').textContent=error.message;}
      finally{sending=false;if(!stale(epoch))el('send').disabled=false;}
    };
    controls();grow();resize();await load();
    if(!stale(epoch))pageTimer=setInterval(()=>{if(!document.hidden)load('poll');},7000);
  }
  return {page,leave};
})();
