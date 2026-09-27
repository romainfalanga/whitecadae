window.WCConversation = (() => {
  let cleanup = () => {};
  function leave() { cleanup(); cleanup = () => {}; document.body.classList.remove('conversation-mode','chat-keyboard'); }
  const el = id => document.getElementById('chat-' + id);
  const tabs = topics => `<nav class="chat-tabs" aria-label="Conversations"><a href="/conversation" data-link ${!topics?'aria-current="page"':''}>Générale</a><a href="/conversation?view=topics" data-link ${topics?'aria-current="page"':''}>Tous les sujets</a></nav>`;
  const readDraft = key => { try { return JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { return {}; } };
  const storeDraft = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };

  function fitViewport(events, save = () => {}) {
    let largestViewport = window.visualViewport?.height || innerHeight;
    const resize = () => {
      const viewport = window.visualViewport, height = viewport?.height || innerHeight;
      largestViewport = Math.max(largestViewport, height);
      const focused = app.contains(document.activeElement) && document.activeElement.matches('textarea,input');
      // Keep the compact layout until the viewport expands again: blurring an
      // input must not move a submit button between pointer-down and click.
      const keyboard = (focused || document.body.classList.contains('chat-keyboard')) && Math.max(innerHeight, largestViewport) - height > 140;
      document.body.classList.toggle('chat-keyboard', keyboard);
      const player = document.getElementById('music-player');
      const playerHeight = player && !player.hidden && !keyboard ? player.getBoundingClientRect().height : 0;
      app.style.setProperty('--chat-height', Math.max(0, height + (viewport?.offsetTop || 0) - app.getBoundingClientRect().top - playerHeight) + 'px');
    };
    const observer = new ResizeObserver(resize);
    for (const node of [document.querySelector('.site-header'), document.getElementById('music-player')]) if (node) observer.observe(node);
    window.addEventListener('resize', resize, {signal:events.signal});
    window.visualViewport?.addEventListener('resize', resize, {signal:events.signal});
    window.visualViewport?.addEventListener('scroll', resize, {signal:events.signal});
    app.addEventListener('focusin', resize, {signal:events.signal});
    app.addEventListener('focusout', resize, {signal:events.signal});
    cleanup = () => { save(); events.abort(); observer.disconnect(); };
    resize();
  }

  async function directory(epoch, events) {
    const draftKey = 'wc-topic-draft-' + state.user.id;
    const draft = {title:'', description:'', client_id:crypto.randomUUID(), ...readDraft(draftKey)};
    let allowance = null, topics = [], nextBefore = null, loading = false, creating = false, revision = 0;
    app.innerHTML = `<section class="chat-shell chat-directory-shell" aria-label="Tous les sujets">
      <header class="chat-head"><h1>Conversation</h1><span>Tous les sujets</span></header>
      <div class="chat-toolbar">${tabs(true)}</div>
      <div class="chat-directory">
        <div class="chat-directory-intro"><div><h2>Les sujets de conversation</h2><p>Rejoins un salon pour échanger autour d’un sujet.</p></div><button class="primary" id="chat-create-toggle" aria-expanded="false" aria-controls="chat-topic-form" hidden>Créer un sujet +</button></div>
        <p id="chat-quota" class="chat-quota"></p>
        <form id="chat-topic-form" class="chat-topic-form" hidden><h3>Nouveau sujet</h3>
          <label for="chat-title">Titre du sujet</label><input id="chat-title" maxlength="80" required placeholder="De quoi souhaites-tu parler ?" value="${esc(draft.title)}">
          <label for="chat-description">Quelques mots pour commencer <span>(facultatif)</span></label><textarea id="chat-description" maxlength="500" rows="2" placeholder="Présente le sujet aux autres…">${esc(draft.description)}</textarea>
          <p>Ce salon sera visible dès l’échelon 12. Chaque message gardera l’échelon de son auteur à l’envoi.</p>
          <div class="chat-topic-actions"><button type="submit" class="primary" id="chat-create">Créer le sujet</button><button type="button" id="chat-create-cancel">Annuler</button></div>
          <p id="chat-create-status" role="status"></p>
        </form>
        <form class="chat-search" id="chat-search-form" hidden><label class="sr-only" for="chat-search">Chercher un sujet</label><input id="chat-search" type="search" maxlength="80" placeholder="Chercher un sujet…"><button type="submit">Chercher</button></form>
        <p id="chat-status" role="status">Chargement des sujets…</p><div id="chat-topics"></div><button id="chat-more" hidden>Voir d’autres sujets</button>
      </div></section>`;
    const save = () => { draft.title = el('title').value; draft.description = el('description').value; storeDraft(draftKey, draft); };
    fitViewport(events, save);
    function controls() {
      const remaining = allowance.limit - allowance.used;
      el('quota').textContent = `${allowance.used} sujet${allowance.used>1?'s':''} créé${allowance.used>1?'s':''} sur ${allowance.limit}. ` + (allowance.nextLevel ? `Un emplacement supplémentaire à l’échelon ${allowance.nextLevel}.` : 'Tes trois emplacements sont débloqués.');
      el('create-toggle').hidden = false; el('create-toggle').disabled = remaining <= 0;
      if (remaining <= 0) { el('topic-form').hidden = true; el('create-toggle').setAttribute('aria-expanded','false'); }
    }
    function render() {
      el('topics').innerHTML = topics.length ? topics.map(t=>`<a class="chat-topic-card" href="/conversation?topic=${t.id}" data-link><div><h3>${esc(t.title)}</h3>${t.description?`<p>${esc(t.description)}</p>`:''}<span>Créé par ${esc(t.username)} · échelon ${t.created_echelon}</span></div><span class="chat-topic-arrow" aria-hidden="true">→</span></a>`).join('') : '<div class="chat-empty"><span aria-hidden="true">◇</span><p>Aucun sujet '+(el('search').value.trim()?'ne correspond à ta recherche.':'pour le moment.')+'</p></div>';
      el('more').hidden = !nextBefore;
    }
    async function load(more = false) {
      if (loading && more) return;
      const token = ++revision; loading = true; el('more').disabled = true;
      try {
        const query = new URLSearchParams({q:el('search').value.trim(), ...(more?{before:nextBefore}:{})});
        const result = await api('/api/conversation/topics?' + query);
        if (stale(epoch) || token !== revision) return;
        topics = more ? [...topics,...result.topics] : result.topics; nextBefore = result.nextBefore; allowance = result.allowance;
        controls(); render(); el('search-form').hidden = false; el('status').textContent = '';
      } catch (error) {
        if (stale(epoch) || token !== revision) return;
        el('status').textContent = error.message;
        // Locked users never receive room titles or creator information.
        if (!allowance) el('quota').textContent = 'Un premier sujet à l’échelon 12, un deuxième au 18, un troisième au 23.';
      } finally { if (!stale(epoch) && token === revision) { loading = false; el('more').disabled = false; } }
    }
    function toggle(open) {
      el('topic-form').hidden = !open; el('create-toggle').setAttribute('aria-expanded', String(open));
      if (open) { el('title').focus(); el('topic-form').scrollIntoView({block:'nearest'}); }
    }
    el('create-toggle').onclick = () => toggle(el('topic-form').hidden);
    el('create-cancel').onclick = () => { toggle(false); el('create-toggle').focus(); };
    el('title').oninput = save; el('description').oninput = save;
    el('search-form').onsubmit = event => { event.preventDefault(); load(); };
    el('search').onsearch = () => load();
    el('more').onclick = () => load(true);
    el('topic-form').onsubmit = async event => {
      event.preventDefault(); if (creating) return;
      save(); creating = true; el('create').disabled = true; el('create-status').textContent = 'Création…';
      try {
        const result = await api('/api/conversation/topics', {method:'POST', body:draft});
        if (stale(epoch)) return;
        el('title').value = ''; el('description').value = ''; draft.client_id = crypto.randomUUID(); save();
        navigate('/conversation?topic=' + result.id);
      } catch (error) { if (!stale(epoch)) { el('create-status').textContent = error.message; load(); } }
      finally { creating = false; if (!stale(epoch)) el('create').disabled = false; }
    };
    await load();
  }

  async function page() {
    leave();
    const epoch = newEpoch(), events = new AbortController(), params = new URLSearchParams(location.search);
    document.title = 'Conversation · White Cadae'; document.body.classList.add('conversation-mode');
    if (params.get('view') === 'topics') return directory(epoch, events);
    const topic = params.get('topic');
    const filter = {mode:['exact','min','max','historique'].includes(params.get('mode'))?params.get('mode'):'tout', niveau:params.get('niveau')||'2'};
    let data = {messages:[], echelon:null, readCeiling:2, nextBefore:null}, revision = 0, loading = false, sending = false, available = false;
    const draftKey = 'wc-conversation-draft-' + state.user.id + (topic?'-topic-'+topic:'');
    const draft = {body:'', ...readDraft(draftKey)};
    const query = extras => new URLSearchParams({...filter,...(topic?{topic}:{}),...extras}).toString();
    app.innerHTML = `<section class="chat-shell" aria-label="${topic?'Discussion du sujet':'Conversation générale'}">
      <header class="chat-head"><h1 id="chat-heading">${topic?'Sujet de conversation':'Conversation générale'}</h1><span id="chat-context">${topic?'Chargement…':'Un espace commun'}</span></header>
      <div class="chat-toolbar">${tabs(!!topic)}<button id="chat-level-button" aria-expanded="false" aria-controls="chat-levels" aria-label="Filtrer les messages par échelon">Filtrer <span id="chat-level-label"></span> ⌄</button>
        <div id="chat-levels" class="chat-popover" hidden><p class="chat-filter-hint">Afficher les messages selon leur échelon d’accès.</p><div class="chat-chips" role="group" aria-label="Mode du filtre"><button data-mode="tout">Tous mes accès</button><button data-mode="max">Jusqu’à</button><button data-mode="exact">Exactement</button><button data-mode="min">À partir de</button></div><div id="chat-level-options" class="chat-number-buttons" aria-label="Choisir un échelon"></div><button id="chat-level-close" class="link-btn">Fermer</button></div>
      </div>
      <div class="chat-stream"><div id="chat-topic-intro" hidden></div><button id="chat-older" hidden>Messages précédents ↑</button><div id="chat-messages" role="log" aria-label="Messages"><p class="chat-empty">Chargement de la conversation…</p></div><button id="chat-new" hidden>Nouveaux messages ↓</button></div>
      <form class="chat-compose" id="chat-form"><p id="chat-status" role="status" aria-live="polite"></p><p id="chat-snapshot" class="chat-snapshot">Chaque message conserve ton échelon au moment de l’envoi.</p>
        <div class="chat-input-row"><label class="sr-only" for="chat-body">Ton message</label><textarea id="chat-body" rows="1" maxlength="2000" placeholder="Écrire un message…" required disabled>${esc(draft.body)}</textarea><button class="primary" type="submit" id="chat-send" aria-label="Envoyer le message" disabled>Envoyer ↑</button></div>
      </form></section>`;
    const stream = app.querySelector('.chat-stream');
    const saveDraft = () => { draft.body = el('body').value; storeDraft(draftKey, {body:draft.body}); };
    fitViewport(events, saveDraft);
    function grow() { el('body').style.height = '0px'; el('body').style.height = Math.min(72, el('body').scrollHeight) + 'px'; }
    function controls() {
      app.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===filter.mode)));
      el('level-label').textContent = filter.mode==='tout'?'':filter.mode==='historique'?'· Historique':({exact:'=',max:'≤',min:'≥'}[filter.mode]+' '+filter.niveau);
      el('level-options').innerHTML = Array.from({length:Math.max(1,data.readCeiling-1)},(_,i)=>i+2).map(n=>`<button data-level="${n}" aria-pressed="${String(n)===String(filter.niveau)&&filter.mode!=='tout'}">${n}</button>`).join('');
      el('snapshot').textContent = data.echelon===null?'Chaque message conserve ton échelon au moment de l’envoi.':`Ton échelon : ${data.echelon} · Messages visibles dès cet échelon.`;
      el('body').disabled = !available; el('send').disabled = !available || sending;
    }
    const bottom = () => stream.scrollHeight - stream.scrollTop - stream.clientHeight < 70;
    function render(placement = 'keep') {
      const height = stream.scrollHeight, top = stream.scrollTop, near = bottom();
      el('messages').innerHTML = data.messages.length ? data.messages.map(m=>`<article class="chat-message ${m.username===state.user.username?'is-mine':''}" id="message-${m.id}"><div class="chat-message-meta">${authorLink(m.username)}<span>${m.author_echelon!==null&&m.author_echelon!==undefined?'Échelon '+m.author_echelon+' à l’envoi':m.echelon_version===1?'Accès historique '+m.min_echelon:'Ancien message · visible dès l’échelon '+m.min_echelon}</span></div><p>${esc(m.body)}</p><time datetime="${esc(m.created_at.replace(' ','T')+'Z')}">${esc(new Date(m.created_at.replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</time></article>`).join('') : '<div class="chat-empty"><span aria-hidden="true">◇</span><p>Aucun message '+(filter.mode==='tout'?'accessible pour le moment.':'pour ce filtre.')+'</p><small>Tu peux commencer la discussion.</small></div>';
      el('older').hidden = !data.nextBefore;
      if (placement==='older') stream.scrollTop = stream.scrollHeight - height + top;
      else if (placement==='bottom' || near) { stream.scrollTop = stream.scrollHeight; el('new').hidden = true; }
      else { stream.scrollTop = top; if (placement==='new') el('new').hidden = false; }
    }
    async function load(kind = 'replace') {
      if (loading && kind!=='replace') return;
      const token = revision; loading = true;
      const extras = kind==='older'?{before:data.nextBefore}:kind==='poll'&&data.messages.length?{after:data.messages.at(-1).id}:{};
      if (kind==='replace') el('status').textContent = 'Chargement…';
      try {
        let next;
        do {
          next = await api('/api/conversation?' + query(extras));
          if (stale(epoch) || token!==revision) return;
          if (kind==='replace') data = next;
          else { data = {...next, messages:[...new Map([...data.messages,...next.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id), nextBefore:kind==='older'||kind==='poll'&&!extras.after?next.nextBefore:data.nextBefore}; }
          available = true;
          if (next.topic) {
            document.title = next.topic.title + ' · Conversation'; el('heading').textContent = next.topic.title;
            el('context').textContent = 'Salon · dès l’échelon 12';
            el('topic-intro').hidden = false;
            el('topic-intro').innerHTML = `<p>${esc(next.topic.description)}</p><small>Un sujet de ${authorLink(next.topic.username)}</small>`;
          }
          controls(); render(kind==='replace'?'bottom':kind==='older'?'older':next.messages.length?'new':'keep');
          extras.after = next.nextAfter;
        } while (kind==='poll' && next.nextAfter);
        el('status').textContent = '';
      } catch (error) {
        if (!stale(epoch) && token===revision) {
          el('status').textContent = error.message;
          if (!available) el('messages').innerHTML = `<div class="chat-empty"><p>${esc(error.message)}</p><button id="chat-retry" type="button">Réessayer</button></div>`;
        }
      } finally { if (token===revision) loading = false; }
    }
    function toggle(value) { el('levels').hidden = !value; el('level-button').setAttribute('aria-expanded',String(value)); }
    function apply() { revision++; history.replaceState(null,'','/conversation?'+query({})); controls(); load(); }
    app.addEventListener('click',event=>{
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.mode) { filter.mode = button.dataset.mode; apply(); }
      if (button.dataset.level) { filter.niveau = button.dataset.level; if (['tout','historique'].includes(filter.mode)) filter.mode = 'exact'; apply(); }
      if (button.id==='chat-retry') load();
    }, {signal:events.signal});
    app.addEventListener('keydown',event=>{if(event.key==='Escape')toggle(false);},{signal:events.signal});
    el('level-button').onclick = () => toggle(el('levels').hidden); el('level-close').onclick = () => toggle(false);
    el('older').onclick = () => load('older');
    el('new').onclick = () => { stream.scrollTop = stream.scrollHeight; el('new').hidden = true; };
    stream.addEventListener('scroll',()=>{if(bottom())el('new').hidden=true;},{signal:events.signal});
    el('body').oninput = () => { grow(); saveDraft(); };
    el('body').onkeydown = event => { if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();el('form').requestSubmit();} };
    el('form').onsubmit = async event => {
      event.preventDefault(); if (sending || !available || !el('body').value.trim()) return;
      const text = el('body').value.trim(); sending = true; el('send').disabled = true;
      try {
        const result = await api('/api/conversation'+(topic?'?topic='+encodeURIComponent(topic):''), {method:'POST',body:{body:text}});
        if (stale(epoch)) return;
        data.echelon = result.echelon; controls();
        if (el('body').value.trim()===text) el('body').value = ''; saveDraft(); grow();
        // An in-flight poll may precede this insert. Fetch again after it settles.
        revision++; await load();
        if (filter.mode!=='tout') el('status').textContent = 'Message envoyé. Les filtres de lecture restent actifs.';
      } catch (error) { if (!stale(epoch)) el('status').textContent = error.message; }
      finally { sending = false; if (!stale(epoch)) controls(); }
    };
    controls(); grow(); await load();
    if (!stale(epoch)) pageTimer = setInterval(()=>{if(!document.hidden)load('poll');},7000);
  }
  return {page,leave};
})();
