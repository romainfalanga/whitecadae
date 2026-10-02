import {dateFields,configureDate,readDate} from './life-dates.js';
import {chatViewport} from './private-chat-scroll.js';
let session=null;
export function leave(){
  if(!session)return;session.controller.abort();clearTimeout(session.timer);
  document.removeEventListener('visibilitychange',session.visibility);
  window.removeEventListener('beforeunload',session.beforeUnload);
  session.dialog?.remove();session.ctx.app.style.visibility='';session.ctx.app.inert=false;session=null;
}
const uid=()=>crypto.randomUUID();
const kinds=['rencontre','famille','relation','études','travail','santé','changement','réussite','perte','autre'];
const impacts=['ressource','difficulté','mixte','à explorer'];
const precisionNames={day:'Date précise',month:'Mois',year:'Année',period:'Période',unknown:'Date inconnue'};
const esc=value=>session.ctx.esc(value);
const el=id=>document.getElementById(id);
const button=(label,id,style='quiet',extra='')=>`<button type="button" class="private-button ${style}" ${id?`id="${id}"`:''} ${extra}>${label}</button>`;
const opts=(items,selected='',empty='')=>(empty?`<option value="">${empty}</option>`:'')+items.map(v=>`<option ${v===selected?'selected':''} value="${esc(v)}">${esc(v)}</option>`).join('');
function live(s=session){return s&&s===session&&s.ctx.isCurrent()&&!s.controller.signal.aborted;}
async function api(path,options={}){
  const s=session;const result=await s.ctx.api(path,{...options,headers:{'X-WC-User':String(s.user),...options.headers},signal:s.controller.signal});
  if(!live(s))throw new DOMException('Navigation','AbortError');return result;
}
function status(message='',error=false,id='private-status'){const node=el(id);if(node){node.textContent=message;node.classList.toggle('is-error',error);}}
function bind(id,action){const node=el(id);if(node)node.onclick=()=>run(node,action);}
async function run(node,action){
  const s=session;if(node)node.disabled=true;
  try{await action();}catch(error){if(error.name!=='AbortError'&&live(s))status(error.message,true,s.dialog?'dialog-status':'private-status');}
  finally{if(node?.isConnected)node.disabled=false;}
}
function heading(title,subtitle='',actions=''){return `<header class="private-heading"><div><h1>${title}</h1>${subtitle?`<p class="private-subtitle">${subtitle}</p>`:''}</div>${actions}</header>`;}
function shell(html){session.ctx.app.innerHTML=`<section class="private-page">${html}<p id="private-status" class="private-status" role="status"></p></section>`;}
function avatar(person){return `<span class="ace-avatar">${person?.avatar?`<img src="${esc(person.avatar)}" alt="" loading="lazy" decoding="async">`:esc(person?.username?.slice(0,1)||'·')}</span>`;}
function modal(title,html){
  session.dialog?.remove();session.dialogCheck=null;const dialog=document.createElement('dialog');dialog.className='private-dialog';
  dialog.innerHTML=`<button type="button" class="private-close" aria-label="Fermer">×</button><h2>${esc(title)}</h2>${html}<p class="private-status" role="status" id="dialog-status"></p>`;
  document.body.append(dialog);session.dialog=dialog;
  const mayClose=()=>!session?.dirty||confirm('Fermer sans enregistrer tes modifications ?');
  dialog.querySelector('.private-close').onclick=()=>{if(mayClose())dialog.close();};
  dialog.addEventListener('cancel',event=>{if(!mayClose())event.preventDefault();});
  dialog.addEventListener('close',()=>{session&&(session.dirty=false);dialog.remove();if(session?.dialog===dialog)session.dialog=null;});dialog.showModal();return dialog;
}
function closeModal(){session?.dialog?.close();}
async function verifyIdentity(){const current=await api('/api/me');if(current.user?.id!==session.user){session.ctx.app.innerHTML='';session.dialog?.remove();session.ctx.navigate('/connexion?retour='+encodeURIComponent(location.pathname));return false;}return true;}
export async function page(path,ctx){
  leave();const s=session={ctx,user:ctx.state.user?.id,controller:new AbortController(),timer:null,dialog:null,dirty:false};
  if(!document.querySelector('link[href="/private-pages.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/private-pages.css';document.head.append(css);}
  const title=path.startsWith('/mecanisme')?'Mécanismes':path==='/game-master-orange'?'Game Master Orange':path==='/matiere'?'Matière':path==='/signalements'?'Signalements':'Carré d’AS';document.title=title+' · White Cadae';
  if(!s.user){shell(heading(title)+ctx.accountEntryMarkup());return;}
  s.beforeUnload=e=>{if(s.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',s.beforeUnload);
  s.visibility=async()=>{
    if(!live(s))return;
    if(document.hidden){ctx.app.style.visibility='hidden';ctx.app.inert=true;if(s.dialog)s.dialog.style.visibility='hidden';clearTimeout(s.timer);}
    else{try{if(await verifyIdentity()){if(s.poll)await s.poll();ctx.app.style.visibility='';ctx.app.inert=false;if(s.dialog)s.dialog.style.visibility='';schedule();}}catch(e){ctx.app.innerHTML='<p>Reconnecte-toi pour retrouver cet espace.</p>';ctx.app.style.visibility='';ctx.app.inert=false;s.dialog?.remove();}}
  };document.addEventListener('visibilitychange',s.visibility);
  try{
    if(path==='/game-master-orange'){await api('/api/game-master-orange');gameMaster();return;} if(path==='/signalements'){await reportsPage();return;}
    const capabilities=await api('/api/me');
    if(!capabilities.access[path.startsWith('/mecanisme')?'mechanisms':path==='/matiere'?'lifeTree':'aceSquare'])throw new Error('Cette page n’est pas encore disponible dans ton parcours.');
    s.consent=await api('/api/private/consent');
    if(path.startsWith('/mecanisme'))await mechanismPage(Number(path.split('/')[2])||null);else if(path==='/matiere')await treePage();else if(/^\/carre-d-as\/fil\/\d+$/.test(path))await topicPage(Number(path.split('/').pop()));else await circlePage();
  }catch(e){if(live(s)&&e.name!=='AbortError')shell(heading(title)+`<p>${esc(e.message)}</p>`);}
}
function schedule(){
  const s=session;clearTimeout(s.timer);if(!s.poll||document.hidden)return;
  s.timer=setTimeout(async()=>{if(!live(s))return;try{await s.poll();s.failures=0;}catch(e){if(e.name==='AbortError')return;s.failures=(s.failures||0)+1;if([401,403,404,409].includes(e.status)){s.dialog?.remove();shell('<p>Cet espace n’est plus accessible. Reviens à la page pour vérifier tes accès.</p>');s.poll=null;}else status('Connexion interrompue. La mise à jour reprendra automatiquement.',true);}if(live(s))schedule();},Math.min(30000,5000*(1+(s.failures||0))));
}
function gameMaster(){
  shell(`<div class="gm-layout">${heading('Game Master Orange')}<article class="gm-letter"><p class="gm-opening">Avancer ensemble, devenir les Game Masters les uns des autres.</p><div class="gm-copy"><p>Pour avancer de la meilleure manière dans l’Escape Game Orange, trouve des partenaires dans ton entourage et invite-les à entrer dans le jeu. Au début, tu es leur Game Master : accompagne-les à partir des cheminements qui t’ont permis de comprendre.</p><p>Réécoutez les musiques, relisez les paroles, propose un parallèle ou un indice subtil. Aide-les à trouver par eux-mêmes, sans leur donner les réponses.</p><p>Le but est de devenir mutuellement les Game Masters les uns des autres. Dès que l’un de vous comprend une énigme qu’un autre cherche encore, il le guide sur cette énigme. Les rôles s’échangent au fil de vos découvertes, sans avoir besoin d’être au même échelon.</p><p>Fais grandir ce cercle de partenaires : chacun peut aider les autres à avancer et à mieux comprendre.</p><div class="gm-orbit" aria-hidden="true"></div>${button('Inviter mes partenaires','gm-share','')}</div></article></div>`);
  bind('gm-share',async()=>{const data={title:'Escape Game Orange',url:location.origin+'/'};if(navigator.share){try{await navigator.share(data);}catch(e){if(e.name!=='AbortError')throw e;}}else{await navigator.clipboard.writeText(data.url);status('Le lien est copié.');}});
}
function noticeMarkup(){const n=session.consent.notice;return `<div class="private-note"><p>${esc(n.purpose)}</p><p>${esc(n.storage)}</p><p>${esc(n.retention)}</p><p>${esc(n.care)}</p></div>`;}
async function consent(){
  if(session.consent.consented)return true;
  modal('Ton espace personnel',`${noticeMarkup()}<label class="private-check"><input type="checkbox" id="private-agree">Je consens explicitement à la conservation des récits et réflexions que je choisis de saisir, y compris s’ils contiennent des informations sensibles sur ma vie ou ma santé.</label>${button('Accepter et continuer','private-accept','')}`);
  return new Promise(resolve=>{
    const dialog=session.dialog;let accepted=false;dialog.addEventListener('close',()=>resolve(accepted),{once:true});
    bind('private-accept',async()=>{if(!el('private-agree').checked)throw new Error('Coche la case pour donner ton accord.');await api('/api/private/consent',{method:'POST',body:{consent:true,version:session.consent.notice.version}});session.consent.consented=true;accepted=true;dialog.close();});
  });
}
function dateLabel(event){
  if(event.precision==='unknown')return 'Date inconnue';const format=value=>new Date(value+'T12:00:00').toLocaleDateString('fr-FR',{year:'numeric',...(event.precision!=='year'?{month:'long'}:{}),...(['day','period'].includes(event.precision)?{day:'numeric'}:{})});
  return format(event.sort_date)+(event.end_date?' — '+format(event.end_date):'');
}
async function treePage(){
  session.tree={events:[],next:null,filters:new URLSearchParams()};
  shell(`${heading('Matière','',`<div class="private-actions matter-actions">${button('Ajouter un événement','life-add','')}${button('Ajouter une création','life-create','quiet')}${button('Brouillons','life-drafts','subtle')}</div>`)}<details class="life-filter-toggle"><summary>Filtrer mon histoire</summary><form id="life-filter" class="life-filter"><label>Contenu<select name="entryType"><option value="">Tout</option><option value="event">Vécu</option><option value="creation">Créations</option></select></label><label>Type<select name="kind">${opts(kinds,'','Tous les types')}</select></label><label>Impact<select name="impact">${opts(impacts,'','Tous les impacts')}</select></label><label>Thème<input name="theme" maxlength="60" placeholder="Confiance, création…"></label>${dateFields('from','','Depuis')}${dateFields('to','','Jusqu’à')}<div class="private-actions"><button class="private-button quiet" type="submit">Filtrer</button>${button('Effacer','life-reset','subtle')}</div></form></details><ol class="life-list life-journal" id="life-events"></ol>${button('Voir la suite','life-more','quiet','hidden')}`);
  bind('life-add',async()=>{if(await consent())eventForm();});
  bind('life-create',async()=>{if(await consent())eventForm(null,null,'creation');});
  el('life-filter').onsubmit=e=>{e.preventDefault();run(null,async()=>{const f=e.target;session.tree.filters=new URLSearchParams(Object.entries({entryType:f.elements.entryType.value,kind:f.elements.kind.value,impact:f.elements.impact.value,theme:f.elements.theme.value,from:readDate(f,'from','day',{optional:true}),to:readDate(f,'to','day',{optional:true})}).filter(([,v])=>v));await loadTree(true);});};
  bind('life-reset',async()=>{el('life-filter').reset();session.tree.filters=new URLSearchParams();await loadTree(true);});bind('life-more',()=>loadTree());
  bind('life-drafts',async()=>{const data=await api('/api/life-tree/drafts');modal('Tes brouillons',data.drafts.length?data.drafts.map(d=>`<div class="ace-invitation"><strong>${esc(d.payload.event.title)}</strong><div class="private-actions">${button('Reprendre','','quiet',`data-draft="${esc(d.id)}"`)}${button('Supprimer','','subtle',`data-erase-draft="${esc(d.id)}"`)}</div></div>`).join(''):'<p>Aucun brouillon enregistré.</p>');session.dialog.querySelectorAll('[data-draft]').forEach(b=>b.onclick=()=>{const d=data.drafts.find(d=>d.id===b.dataset.draft);eventForm(null,d);});session.dialog.querySelectorAll('[data-erase-draft]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/life-tree/drafts/'+b.dataset.eraseDraft,{method:'DELETE',body:{}});b.closest('.ace-invitation').remove();}));});
  await loadTree(true);
}
async function loadTree(reset=false){
  const tree=session.tree,version=tree.request=(tree.request||0)+1;if(reset){tree.next=null;tree.events=[];}const query=new URLSearchParams(tree.filters);if(tree.next)query.set('after',tree.next);
  const data=await api('/api/life-tree?'+query);if(session.tree!==tree||tree.request!==version)return;tree.events.push(...data.events);tree.next=data.next;
  el('life-events').innerHTML=tree.events.length?tree.events.map(e=>`<li class="life-event"><button type="button" data-event="${esc(e.id)}"><time>${esc(dateLabel(e))}${e.entry_type==='creation'?' · '+esc(e.creation?.medium||'création'):''}</time><h3>${esc(e.title)}</h3>${e.story?`<p class="life-excerpt">${esc(e.story.slice(0,180))}${e.story.length>180?'…':''}</p>`:''}<div class="life-tags"><span>${esc(e.kind)}</span><span>${esc(e.impact)}</span>${e.themes.map(t=>`<span>${esc(t)}</span>`).join('')}</div></button></li>`).join(''):'<li class="life-empty"><span class="life-seed" aria-hidden="true"></span><h2>Ton arbre prend forme ici.</h2></li>';
  el('life-more').hidden=!tree.next;
  el('life-events').querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>run(b,()=>eventDetail(b.dataset.event)));
}
function eventForm(event=null,draft=null,entryType='event'){
  closeModal();const d=draft?.payload.event||event||{},id=event?.id||draft?.id||uid();let revision=event?.revision||d.revision||0,draftRevision=draft?.revision||0;
  entryType=d.entryType||d.entry_type||entryType;const creation=entryType==='creation';
  const precision=d.precision||'year',date=d.date??(d.sort_date&&precision!=='unknown'?d.sort_date.slice(0,precision==='year'?4:precision==='month'?7:10):'');
  modal(creation?(event?'Ta création':'Une nouvelle création'):(event?'Un événement de ton histoire':'Un nouveau repère'),`<form id="life-form"><label>Titre<input name="title" required maxlength="140" value="${esc(d.title||'')}" placeholder="${creation?'Le nom de ta création':'Ce moment que je garde en mémoire'}"></label>${creation?`<label>Forme<select name="medium">${opts(['musique','vidéo','texte','image','autre'],d.medium||d.creation?.medium||'texte')}</select></label><label>Lien vers la création<input type="url" name="url" maxlength="2048" placeholder="https://…" value="${esc(d.url||d.creation?.url||'')}"></label><label>Texte de la création<textarea name="work" maxlength="12000">${esc(d.work||d.creation?.work||'')}</textarea></label>`:''}<section class="life-form-section"><label>Repère temporel<select name="precision">${Object.entries(precisionNames).map(([v,label])=>`<option value="${v}" ${v===precision?'selected':''}>${label}</option>`).join('')}</select></label>${dateFields('start',date,'Quand ?')}${dateFields('end',d.endDate||d.end_date||'','Fin de la période')}</section><div class="private-form-grid"><label>Type<select name="kind">${opts(kinds,d.kind||'autre')}</select></label><label>Impact<select name="impact">${opts(impacts,d.impact||'à explorer')}</select></label></div><label>${creation?'Ce qui a donné naissance à cette création':'Ce qui s’est passé'}<textarea name="story" maxlength="8000">${esc(d.story||'')}</textarea></label><details ${d.feelings||d.understanding||d.resources?'open':''}><summary>Prendre du recul</summary>${[['feelings','Comment je l’ai vécu'],['understanding','Ce que j’en comprends aujourd’hui'],['resources','Ce qui m’aide']].map(([key,label])=>`<label>${label}<textarea name="${key}" maxlength="6000">${esc(d[key]||'')}</textarea></label>`).join('')}</details><label>Thèmes ou schémas personnels<input name="themes" value="${esc((d.themes||[]).join(', '))}" maxlength="730" placeholder="Sépare les thèmes par une virgule"></label><p class="private-note">Ce sont tes propres repères, sans diagnostic automatique.</p><div class="private-actions form-actions"><button class="private-button" type="submit">Enregistrer</button>${button('Garder en brouillon','life-save-draft')}${event?button('Supprimer','life-delete-event','subtle'):''}</div><div class="private-actions" id="life-conflict" hidden>${button('Voir la version enregistrée','life-current','quiet')}${button('Copier ma saisie','life-copy','quiet')}</div></form>`);
  const form=el('life-form');form.oninput=()=>{session.dirty=true;};
  function setDate(){const p=form.elements.precision.value;configureDate(el('start-fields'),p);configureDate(el('end-fields'),p==='period'?'day':'unknown');}
  form.elements.precision.onchange=()=>{session.dirty=true;setDate();};setDate();
  const body=(draft=false)=>{const values=Object.fromEntries(new FormData(form)),p=values.precision;return {...values,entryType,date:readDate(form,'start',p,{draft}),endDate:p==='period'?readDate(form,'end','day',{draft}):'',themes:form.elements.themes.value.split(',').map(s=>s.trim()).filter(Boolean),revision};};
  bind('life-copy',async()=>{await navigator.clipboard.writeText(JSON.stringify(body(),null,2));status('Ta saisie est copiée.',false,'dialog-status');});
  bind('life-current',async()=>{const current=await api('/api/life-tree/events/'+id);el('life-conflict-current')?.remove();form.insertAdjacentHTML('beforeend',`<section id="life-conflict-current" class="private-panel"><h3>Version actuellement enregistrée</h3><strong>${esc(current.event.title)}</strong>${reading(current.event)}<p class="private-note">Ta saisie reste dans le formulaire au-dessus. Après comparaison, tu peux choisir de l’enregistrer à la place de cette version.</p>${button('Conserver ma saisie pour la prochaine sauvegarde','life-keep-mine')}</section>`);bind('life-keep-mine',()=>{revision=current.event.revision;el('life-conflict-current').remove();el('life-conflict').hidden=true;status('Ta saisie est conservée. Le bouton Enregistrer remplacera la version que tu viens de comparer.',false,'dialog-status');});});
  const afterSave=()=>session.tree?loadTree(true):session.ctx.navigate('/matiere');
  form.onsubmit=e=>{e.preventDefault();run(form.querySelector('[type=submit]'),async()=>{try{await api('/api/life-tree/events/'+id,{method:'PUT',body:body()});if(draftRevision)await api('/api/life-tree/drafts/'+id,{method:'DELETE',body:{}});session.dirty=false;closeModal();await afterSave();}catch(error){if(error.status===409&&el('life-conflict'))el('life-conflict').hidden=false;throw error;}});};
  bind('life-save-draft',async()=>{const result=await api('/api/life-tree/drafts/'+id,{method:'PUT',body:{revision:draftRevision,event:body(true)}});draftRevision=result.revision;session.dirty=false;status('Brouillon privé enregistré. Il n’est pas partagé avec tes AS.',false,'dialog-status');});
  bind('life-delete-event',async()=>{if(!confirm('Supprimer cet événement et les réponses qui lui sont liées ?'))return;await api('/api/life-tree/events/'+id,{method:'DELETE',body:{revision}});session.dirty=false;closeModal();await afterSave();});
}
function reading(e){return `<div class="life-reading">${e.creation?`<section class="matter-work"><span class="matter-kind">${esc(e.creation.medium)}</span>${e.creation.work?`<p>${esc(e.creation.work)}</p>`:''}${/^https:\/\//.test(e.creation.url||'')?`<a class="private-button quiet" href="${esc(e.creation.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Ouvrir la création <span aria-hidden="true">↗</span></a>`:''}</section>`:''}<p class="private-note">${esc(dateLabel(e))} · ${esc(e.kind)} · ${esc(e.impact)}</p>${[['story','Ce qui s’est passé'],['feelings','Comment je l’ai vécu'],['understanding','Ce que j’en comprends aujourd’hui'],['resources','Ce qui m’aide']].filter(([k])=>e[k]).map(([k,label])=>`<h3>${label}</h3><p>${esc(e[k])}</p>`).join('')}<div class="life-tags">${e.themes.map(t=>`<span>${esc(t)}</span>`).join('')}</div></div>`;}
async function eventDetail(id,owner=session.user){
  const data=await api('/api/life-tree/events/'+id+(owner!==session.user?'?owner='+owner:'')),event=data.event,own=owner===session.user;
  modal(event.title,reading(event)+`<ul class="life-detail-list">${data.links.map(l=>`<li><button type="button" data-link-event="${esc(l.source_id===id?l.target_id:l.source_id)}">${esc(l.payload.label)}</button>${own?button('Délier','','subtle',`data-unlink="${esc(l.source_id)}|${esc(l.target_id)}"`):''}</li>`).join('')}</ul><div class="private-actions">${own?button('Modifier','life-edit',''):''}${own&&session.tree?button('Relier à un élément','life-link'):''}</div><div id="life-link-form"></div>`);
  bind('life-edit',()=>eventForm(event));
  const dialog=session.dialog;
  session.dialogCheck=async()=>{const next=await api('/api/life-tree/events/'+id+(owner!==session.user?'?owner='+owner:''));if(session.dialog===dialog&&JSON.stringify(next)!==JSON.stringify(data))await eventDetail(id,owner);};
  session.dialog.querySelectorAll('[data-link-event]').forEach(b=>b.onclick=()=>run(b,()=>eventDetail(b.dataset.linkEvent,owner)));
  session.dialog.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>run(b,async()=>{const [source,target]=b.dataset.unlink.split('|');await api('/api/life-tree/links',{method:'DELETE',body:{source,target}});await eventDetail(id);}));
  bind('life-link',()=>{el('life-link-form').innerHTML=`<label>Élément déjà chargé dans ta chronologie<select id="life-link-target">${session.tree.events.filter(e=>e.id!==id).map(e=>`<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</select></label><label>Le lien que tu perçois<input id="life-link-label" maxlength="200"></label>${button('Enregistrer le lien','life-link-save')}`;bind('life-link-save',async()=>{await api('/api/life-tree/links',{method:'POST',body:{source:id,target:el('life-link-target').value,label:el('life-link-label').value}});await eventDetail(id);});});
}

async function circlePage(){
  session.circle=await api('/api/ace-circles');session.selectedOwner=Number(/^#carre-(\d+)$/.exec(location.hash)?.[1])||session.selectedOwner||session.user;
  shell(`${heading('Carré d’AS','Quatre personnes à tes côtés. Et, à ton tour, jusqu’à quatre personnes à accompagner.')}<div class="ace-tabs" role="tablist" aria-label="Carré d’AS">${[['circle','Mon carré'],['companions','J’accompagne'],['settings','Invitations'+(session.circle.invitations.filter(i=>i.incoming).length?' · '+session.circle.invitations.filter(i=>i.incoming).length:'')]].map(([key,label])=>`<button type="button" role="tab" id="ace-tab-${key}" aria-selected="${key==='circle'}" data-tab="${key}">${label}</button>`).join('')}</div><div id="ace-view"></div>`);
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>run(b,()=>circleTab(b.dataset.tab)));
  await circleTab(session.selectedOwner===session.user?'circle':'companions');
}
async function circleTab(name){
  session.poll=null;clearTimeout(session.timer);document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));session.tab=name;
  if(name==='settings')return settingsView();if(name==='circle')session.selectedOwner=session.user;else if(session.selectedOwner===session.user)session.selectedOwner=null;return circlesView();
}
async function circlesView(){
  const ownView=session.tab==='circle',circles=session.circle.circles.filter(c=>ownView?c.owner.id===session.user:c.owner.id!==session.user);
  if(!circles.length){
    el('ace-view').innerHTML=`<div class="ace-intro"><div class="ace-four" aria-hidden="true"><span>AS</span><span>AS</span><span>AS</span><span>AS</span></div><h2>${ownView?'Quatre places, des liens choisis.':'Être là, à ton tour.'}</h2><p>${ownView?'Invite une personne de ton entourage par son pseudo. Tes AS pourront découvrir ta Matière et tes Mécanismes lorsque tu activeras leur partage.':'Les carrés des personnes dont tu es un AS apparaissent ici après acceptation de leur invitation.'}</p><div class="private-actions">${ownView?button('Ajouter un AS','ace-add','')+button('Ouvrir mon carré','ace-create','quiet'):button('Voir mes invitations','ace-open-invitations','quiet')}</div></div>`;
    bind('ace-add',directoryView);bind('ace-open-invitations',()=>circleTab('settings'));bind('ace-create',async()=>{await api('/api/ace-circles',{method:'POST',body:{}});session.circle=await api('/api/ace-circles');await circlesView();});return;
  }
  const selected=circles.find(c=>c.owner.id===session.selectedOwner)||circles[0];session.selectedOwner=selected.owner.id;
  const allowed=ownView||selected.sharing&&selected.combinedSharing;
  el('ace-view').innerHTML=`<nav class="ace-nav ${circles.length===1?'is-single':''}" aria-label="Les personnes que j’accompagne">${circles.map(c=>`<button type="button" data-circle="${c.owner.id}" aria-current="${c===selected}">${esc(c.owner.username)}</button>`).join('')}</nav><div class="ace-layout"><aside id="ace-members"><section class="ace-members-panel"><header><h2>${ownView?'Mes AS':'Les AS de '+esc(selected.owner.username)}</h2><span>${selected.members.length} / 4</span></header><div class="ace-star-map">${memberSlots(selected)}</div></section><div class="private-actions">${ownView&&selected.members.length<4?button('Ajouter un AS','ace-add','quiet'):''}${button('Matière','ace-view-tree','quiet',allowed?'':'disabled')}${button('Mécanismes','ace-view-mechanisms','quiet',allowed?'':'disabled')}${!ownView?button('Quitter ce carré','ace-leave','subtle'):''}</div>${ownView?`<p class="private-note">${selected.sharing&&selected.combinedSharing?'Matière et Mécanismes sont partagés avec tes AS.':'Active le partage pour ouvrir ces échanges à tes AS.'}</p>${button('Gérer le partage','ace-sharing-settings','subtle')}`:''}</aside><section class="topic-feed"><header><h2>${ownView?'Autour de ma Matière':'Autour de '+esc(selected.owner.username)}</h2></header><div id="topic-list"></div>${button('Voir la suite','topic-more','quiet','hidden')}${button('Échanges précédents','ace-history','subtle')}</section></div>`;
  bind('ace-add',directoryView);bind('ace-sharing-settings',()=>circleTab('settings'));
  bind('ace-view-tree',()=>sharedTree(selected.owner.id));bind('ace-view-mechanisms',()=>sharedMechanisms(selected.owner.id));bind('ace-history',()=>legacyMessages(selected.owner.id));
  bind('ace-leave',async()=>{if(!confirm('Quitter ce carré et perdre l’accès à ses échanges ?'))return;await api('/api/ace-circles/members/'+selected.membershipId,{method:'DELETE',body:{}});session.circle=await api('/api/ace-circles');await circlesView();});
  document.querySelectorAll('[data-circle]').forEach(b=>b.onclick=()=>run(b,async()=>{session.selectedOwner=Number(b.dataset.circle);session.poll=null;clearTimeout(session.timer);await circlesView();}));
  const feed=session.feed={owner:selected.owner.id,next:null,revision:null};
  const load=async(more=false,poll=false)=>{
    let data;try{data=await api(`/api/ace-circles/${feed.owner}/topics`+(more&&feed.next?'?after='+encodeURIComponent(feed.next):poll&&feed.revision?'?revision='+encodeURIComponent(feed.revision):''));}
    catch(e){if(e.status===403&&session.feed===feed){closeModal();el('topic-list').innerHTML='<p class="private-note">Le partage de Matière et Mécanismes n’est pas activé.</p>';el('topic-more').hidden=true;el('ace-view-tree').disabled=true;el('ace-view-mechanisms').disabled=true;const current=await api('/api/ace-circles');if(session.feed===feed){session.circle=current;const circle=current.circles.find(c=>c.owner.id===feed.owner);el('ace-view-tree').disabled=!circle?.sharing;}return;}throw e;}
    if(session.feed!==feed||!['circle','companions'].includes(session.tab)||data.unchanged)return;
    if(poll&&feed.revision&&data.revision!==feed.revision&&!session.dirty&&session.dialog){try{if(session.dialogCheck)await session.dialogCheck();else closeModal();}catch(e){if([403,404].includes(e.status))closeModal();else throw e;}}
    feed.revision=data.revision;feed.next=data.next;el('ace-view-tree').disabled=false;el('ace-view-mechanisms').disabled=false;
    const markup=data.topics.map(t=>`<a class="topic-card" href="/carre-d-as/fil/${t.id}" data-link><div class="topic-meta"><span class="topic-kind">${topicKinds[t.kind]}</span><time>${esc(shortDate(t.updatedAt))}</time></div><h3>${esc(t.title)}</h3><span class="topic-count">${t.replies} réponse${t.replies>1?'s':''}${t.unread?` <strong>· ${t.unread} nouvelle${t.unread>1?'s':''}</strong>`:''}</span></a>`).join('');
    if(more)el('topic-list').insertAdjacentHTML('beforeend',markup);else el('topic-list').innerHTML=markup||'<p class="private-note topic-empty">Tes ajouts et modifications dans Matière et Mécanismes ouvrent ici leurs discussions.</p>';
    el('topic-more').hidden=!data.next;
  };
  bind('topic-more',()=>load(true));await load();session.poll=()=>load(false,true);schedule();
}
const topicKinds={event:'Vécu',creation:'Création',link:'Lien',mechanism:'Mécanisme'};
const shortDate=value=>new Date(value.replace(' ','T')+'Z').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
function mechanismReading(m){return `<div class="mechanism-reading">${[['description','Ce que je veux cultiver'],['notice','Ce que j’observe'],['practice','Comment je le mets en pratique'],['anchor','Mon repère']].filter(([key])=>m[key]).map(([key,label])=>`<section><h2>${label}</h2><p>${esc(m[key])}</p></section>`).join('')}</div>`;}
async function sharedMechanisms(owner){
  const data=await api('/api/mechanisms?owner='+owner);
  modal('Mécanismes',`<div class="shared-mechanisms">${data.mechanisms.map(m=>`<button class="private-button quiet" type="button" data-read-mechanism="${m.slot}"><span>${String(m.slot).padStart(2,'0')}</span>${esc(m.title||'À écrire')}</button>`).join('')}</div>`);
  const dialog=session.dialog;session.dialogCheck=async()=>{const next=await api('/api/mechanisms?owner='+owner);if(session.dialog===dialog&&JSON.stringify(next)!==JSON.stringify(data))await sharedMechanisms(owner);};
  session.dialog.querySelectorAll('[data-read-mechanism]').forEach(b=>b.onclick=()=>run(b,()=>sharedMechanism(owner,b.dataset.readMechanism)));
}
async function sharedMechanism(owner,slot){
  const current=await api('/api/mechanisms/'+slot+'?owner='+owner);modal(current.mechanism.title||'Mécanisme',mechanismReading(current.mechanism));
  const dialog=session.dialog;session.dialogCheck=async()=>{const next=await api('/api/mechanisms/'+slot+'?owner='+owner);if(session.dialog===dialog&&JSON.stringify(next)!==JSON.stringify(current))await sharedMechanism(owner,slot);};
}
async function legacyMessages(owner){
  modal('Échanges précédents','<div id="ace-history-list"></div>'+button('Voir les messages précédents','ace-history-more','quiet'));
  const dialog=session.dialog;let before=0;
  const load=async()=>{const data=await api(`/api/ace-circles/${owner}/messages?legacy=1`+(before?'&before='+before:''));if(session.dialog!==dialog)return;before=data.messages[0]?.id||0;el('ace-history-list').insertAdjacentHTML('afterbegin',data.messages.map(m=>`<article class="ace-message"><header><strong>${esc(m.author?.username||'Membre')}</strong></header><p>${esc(m.text||'Un événement a évolué.')}</p></article>`).join('')||'<p>Aucun échange précédent.</p>');el('ace-history-more').hidden=!data.more;};bind('ace-history-more',load);await load();
}
async function topicPage(id){
  const data=await api('/api/ace-circles/topics/'+id),thread=session.thread={id,topic:data.topic,replies:[],last:0,first:0,more:false,parent:null,requestId:uid(),busy:false,revision:data.revision,membership:data.membership};session.tab='thread';
  shell(`<a class="private-back" href="/carre-d-as#carre-${data.topic.owner}" data-link>Revenir au carré</a><article class="topic-thread ace-chat"><span class="topic-kind">${topicKinds[data.topic.kind]}</span>${heading(esc(data.topic.title))}<div class="topic-source" id="topic-source"></div><div class="topic-replies" id="topic-replies" role="log" aria-live="polite" aria-relevant="additions"></div>${button('Voir les nouvelles réponses','topic-new','quiet','hidden')}<form id="topic-compose" class="ace-composer"><p id="topic-reply-to" class="ace-reply" hidden></p><label class="sr-only" for="topic-text">Ta réponse</label><textarea id="topic-text" maxlength="4000" required rows="3" placeholder="Ton regard sur ce partage…"></textarea><div class="private-actions">${button('Annuler la réponse','topic-cancel','subtle','hidden')}<span></span><button class="private-button" type="submit">Répondre</button></div></form></article>`);
  const showSource=()=>{
    const t=thread.topic;
    el('topic-source').innerHTML=t.kind==='mechanism'?mechanismReading(t.mechanism):`${t.kind==='link'?`<p class="life-reading">${esc(t.link)}</p>`:''}<div class="private-actions">${button(t.kind==='creation'?'Voir la création':t.kind==='link'?'Voir le premier élément':'Voir l’événement','topic-event','quiet')}${t.targetId?button('Voir le second élément','topic-target','quiet'):''}</div>`;
    bind('topic-event',()=>eventDetail(t.eventId,t.owner));bind('topic-target',()=>eventDetail(t.targetId,t.owner));
  };
  showSource();
  const cancel=()=>{thread.parent=null;el('topic-reply-to').hidden=true;el('topic-cancel').hidden=true;};bind('topic-cancel',cancel);
  function markup(m){const parent=thread.replies.find(r=>r.id===m.parentId);return `<article class="ace-message topic-reply ${m.author.id===session.user?'is-self':''} ${m.parentId?'is-reply':''}" data-message="${m.id}"><header><strong>${esc(m.author.username)}</strong><time>${esc(shortDate(m.createdAt))}</time></header>${m.parentId?`<small class="private-note">En réponse à ${esc(parent?.author.username||'une réponse précédente')}</small>`:''}<p>${esc(m.text)}</p><div class="private-actions">${button('Répondre','','subtle',`data-reply="${m.id}"`)}${m.author.id===session.user?button('Supprimer','','subtle',`data-remove-reply="${m.id}"`):button('Signaler','','subtle',`data-report-reply="${m.id}"`)}</div></article>`;}
  function wire(){
    el('topic-replies').querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>{thread.parent=Number(b.dataset.reply);const m=thread.replies.find(r=>r.id===thread.parent);el('topic-reply-to').textContent='En réponse à '+m.author.username;el('topic-reply-to').hidden=false;el('topic-cancel').hidden=false;el('topic-text').focus({preventScroll:true});el('topic-compose').scrollIntoView({block:'end',behavior:'instant'});});
    el('topic-replies').querySelectorAll('[data-remove-reply]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/ace-circles/messages/'+b.dataset.removeReply,{method:'DELETE',body:{}});await refresh(true);}));
    el('topic-replies').querySelectorAll('[data-report-reply]').forEach(b=>b.onclick=()=>{modal('Signaler cette réponse',`<p class="private-note">Seuls cette réponse et ton motif seront transmis au gestionnaire du site.</p><label>Motif<textarea id="topic-report-reason" maxlength="1000"></textarea></label>${button('Envoyer le signalement','topic-report-send','')}`);bind('topic-report-send',async()=>{await api('/api/ace-circles/reports',{method:'POST',body:{owner:thread.topic.owner,messageId:Number(b.dataset.reportReply),reason:el('topic-report-reason').value}});closeModal();status('Signalement enregistré.');});});
    bind('topic-older',async()=>{const older=await api('/api/ace-circles/topics/'+id+'?before='+thread.first);if(session.thread!==thread)return;thread.replies.unshift(...older.replies);thread.more=older.more;render();});
  }
  function render(){const node=el('topic-replies');chatViewport(node).preserve(()=>{node.innerHTML=(thread.more?button('Réponses précédentes','topic-older','subtle'):'')+(thread.replies.map(markup).join('')||'<p class="private-note">Cette discussion attend un premier regard.</p>');});thread.first=thread.replies[0]?.id||0;thread.last=thread.replies.at(-1)?.id||0;wire();}
  async function refresh(reset=false,follow=false){
    if(thread.busy)return;thread.busy=true;
    try{
      if(thread.replies.length>400)reset=true;
      let next=await api('/api/ace-circles/topics/'+id+(reset||!thread.last?'':'?after='+thread.last+'&known='+thread.replies.map(r=>r.id).join(',')));if(session.thread!==thread)return;
      if(next.membership!==thread.membership)throw Object.assign(new Error('Les accès ont changé.'),{status:403});
      const sourceChanged=next.topic.revision!==thread.topic.revision||next.topic.title!==thread.topic.title;
      if(session.thread!==thread)return;
      thread.topic=next.topic;thread.revision=next.revision;
      if(sourceChanged){el('topic-source').previousElementSibling.querySelector('h1').textContent=next.topic.title;showSource();session.dialog?.close();}
      const viewport=chatViewport(el('topic-replies')),atEnd=viewport.atEnd();
      if(reset){thread.replies=next.replies;thread.more=next.more;render();}else if(next.replies.length||next.removed?.length){thread.replies=thread.replies.filter(r=>!next.removed?.includes(r.id));thread.replies.push(...next.replies);if(next.removed?.includes(thread.parent))cancel();render();}
      if(next.more&&!reset)el('topic-new').hidden=false;
      if(follow||atEnd&&next.replies.length)viewport.toEnd();
      if(thread.last&&(follow||viewport.atEnd()))await api('/api/ace-circles/topics/'+id+'/read',{method:'PUT',body:{lastId:thread.last}});
    }finally{thread.busy=false;}
  }
  thread.replies=data.replies;thread.more=data.more;render();bind('topic-new',async()=>{await refresh(true,true);el('topic-new').hidden=true;});
  const form=el('topic-compose');form.oninput=()=>{session.dirty=!!el('topic-text').value;};form.onsubmit=e=>{e.preventDefault();run(form.querySelector('[type=submit]'),async()=>{if(!await consent())return;await api('/api/ace-circles/topics/'+id+'/replies',{method:'POST',body:{id:thread.requestId,text:el('topic-text').value,parentId:thread.parent}});thread.requestId=uid();el('topic-text').value='';session.dirty=false;cancel();await refresh(false,true);});};
  session.poll=()=>refresh();schedule();
}

async function sharedTree(owner){
  let next=null;modal('Matière',`<ol class="life-list" id="ace-tree-events"></ol>${button('Voir la suite','ace-tree-more','quiet')}`);
  const load=async()=>{const data=await api('/api/life-tree?owner='+owner+(next?'&after='+encodeURIComponent(next):''));next=data.next;el('ace-tree-events').insertAdjacentHTML('beforeend',data.events.map(e=>`<li class="life-event"><button type="button" data-shared-event="${esc(e.id)}"><time>${esc(dateLabel(e))}${e.entry_type==='creation'?' · '+esc(e.creation?.medium||'création'):''}</time><h3>${esc(e.title)}</h3></button></li>`).join('')||'<li class="life-empty">Aucun événement enregistré.</li>');el('ace-tree-more').hidden=!next;el('ace-tree-events').querySelectorAll('[data-shared-event]').forEach(b=>b.onclick=()=>run(b,()=>eventDetail(b.dataset.sharedEvent,owner)));};bind('ace-tree-more',load);await load();
}
function memberSlots(circle){return Array.from({length:4},(_,i)=>{const m=circle.members.find(m=>m.slot===i+1);return `<div class="ace-slot ${m?'is-filled':''}"><span class="ace-card-mark" aria-hidden="true">AS</span>${avatar(m)}<div><strong>${m?esc(m.username):'Une place à choisir'}</strong><small>${m?'À tes côtés':'Sur invitation'}</small></div></div>`;}).join('');}
async function settingsView(){
  const view=session.tab;const data=await api('/api/ace-circles');if(session.tab!==view)return;session.circle=data;const own=data.circles.find(c=>c.owner.id===session.user);el('ace-tab-settings').textContent='Invitations'+(data.invitations.filter(i=>i.incoming).length?' · '+data.invitations.filter(i=>i.incoming).length:'');
  el('ace-view').innerHTML=`<div class="private-grid"><div><section class="private-panel"><h2>Mes invitations</h2><p class="private-note">Une invitation acceptée ouvre la conversation. Elle ne partage ton arbre que si tu as donné ton accord.</p>${data.invitations.length?data.invitations.map(i=>`<div class="ace-invitation"><p>${i.direction==='invite'?`${esc(i.owner.username)} invite ${esc(i.angel.username)} dans son carré.`:`${esc(i.angel.username)} propose d’accompagner ${esc(i.owner.username)}.`}</p><div class="private-actions">${i.incoming?button('Accepter','','quiet',`data-invitation="${esc(i.id)}" data-action="accept"`)+button('Refuser','','subtle',`data-invitation="${esc(i.id)}" data-action="decline"`):button('Annuler','','subtle',`data-invitation="${esc(i.id)}" data-action="cancel"`)}</div></div>`).join(''):'<p>Aucune invitation en attente.</p>'}<div class="private-actions">${button('Rechercher un pseudo','ace-add','quiet')}</div></section><section class="private-panel private-consent"><h2>Mes AS</h2>${own?.members.length?own.members.map(m=>`<div class="ace-invitation"><div class="private-actions">${avatar(m)}<strong>${esc(m.username)}</strong>${button('Retirer','','subtle',`data-remove-member="${esc(m.membershipId)}"`)}${button('Bloquer','','subtle',`data-block="${m.id}"`)}</div></div>`).join(''):'<p>Quatre places pour les personnes que tu choisis.</p>'}</section></div><aside><section class="private-panel"><h2>Matière et Mécanismes</h2><p>${own?.sharing&&own?.combinedSharing?'Toi et tes AS acceptés.':own?.sharing?'Ton arbre reste partagé selon ton accord précédent. Tes mécanismes et tes nouvelles créations restent privés.':'Visible uniquement par toi.'}</p><p class="private-note">${esc(session.consent.notice.combinedSharing)}</p><div class="private-actions">${button(own?.sharing&&own?.combinedSharing?'Arrêter le partage':'Partager avec mes AS','ace-share',own?.sharing?'quiet':'')}</div></section><details class="private-panel private-consent"><summary>Personnes bloquées et données</summary>${data.blocks.map(p=>`<p>${esc(p.username)} ${button('Débloquer','','subtle',`data-unblock="${p.id}"`)}</p>`).join('')||'<p>Aucune personne bloquée.</p>'}${noticeMarkup()}${button('Retirer mon accord et effacer mes données','ace-erase-data','subtle')}</details></aside></div>`;
  bind('ace-add',directoryView);
  bind('ace-erase-data',()=>{modal('Retirer mon accord',`<p>Tes mécanismes, ton arbre, tes brouillons, ton carré, tes accompagnements, ta présentation et les messages que tu as écrits seront effacés. Ton compte, tes signes et ta progression restent conservés.</p><label>Écris SUPPRIMER<input id="private-erase-confirm" autocomplete="off"></label>${button('Effacer mes données','private-erase-final')}`);bind('private-erase-final',async()=>{await api('/api/private/data',{method:'DELETE',body:{confirm:el('private-erase-confirm').value}});closeModal();session.consent.consented=false;await circlePage();});});
  bind('ace-share',async()=>{if(own?.sharing&&own?.combinedSharing){await api('/api/ace-circles/sharing',{method:'PUT',body:{enabled:false}});await settingsView();return;}if(!await consent())return;modal('Partager Matière et Mécanismes',`<p>${esc(session.consent.notice.combinedSharing)}</p><label class="private-check"><input id="ace-sharing-agree" type="checkbox">J’autorise explicitement mes AS à lire toute ma Matière, mes Mécanismes et leurs futures mises à jour.</label>${button('Activer le partage','ace-sharing-enable','')}`);bind('ace-sharing-enable',async()=>{if(!el('ace-sharing-agree').checked)throw new Error('Coche la case pour confirmer le partage.');await api('/api/ace-circles/sharing',{method:'PUT',body:{enabled:true,consent:true,scope:'matter-and-mechanisms'}});closeModal();await settingsView();});});
  document.querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>run(b,async()=>{if(!confirm('Retirer cette personne de ton carré ?'))return;await api('/api/ace-circles/members/'+b.dataset.removeMember,{method:'DELETE',body:{}});await settingsView();}));
  document.querySelectorAll('[data-block],[data-unblock]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/ace-circles/blocks',{method:b.dataset.block?'POST':'DELETE',body:{target:Number(b.dataset.block||b.dataset.unblock)}});await settingsView();}));
  document.querySelectorAll('[data-invitation]').forEach(b=>b.onclick=()=>run(b,async()=>{const i=data.invitations.find(i=>i.id===b.dataset.invitation);if(b.dataset.action==='accept'&&i.direction==='request'&&!confirm(`${i.angel.username} pourra lire tout ton arbre si le partage est actif, ainsi que les nouveaux échanges de ton carré. Accepter ?`))return;await api('/api/ace-circles/invitations/'+i.id,{method:'PUT',body:{action:b.dataset.action,recipientNotice:true}});await settingsView();}));
}
async function sendInvitation(values){
  if(values.direction!=='request'&&!confirm('Cette personne, si elle accepte, verra les nouveaux échanges de ton carré et tout ton arbre si tu en actives le partage. Continuer ?'))return false;
  await api('/api/ace-circles/invitations',{method:'POST',body:{...values,id:uid(),recipientNotice:true}});status('La demande a été envoyée.');return true;
}
async function directoryView(){
  modal('Ajouter un AS',`<p class="private-note">Saisis le pseudo exact d’une personne qui a accès au Carré d’AS. Elle choisira d’accepter ou non ton invitation. Son arbre ne s’affiche jamais dans la recherche.</p><form id="ace-search" class="ace-search"><label>Pseudo<input name="q" required minlength="3" maxlength="30" autocomplete="off" placeholder="Son pseudo exact"></label><button class="private-button" type="submit">Rechercher</button></form><div id="ace-directory" class="ace-search-results" aria-live="polite"></div>`);
  const dialog=session.dialog;
  el('ace-search').onsubmit=e=>{e.preventDefault();const search=e.target.elements.q.value.trim();run(e.target.querySelector('button'),async()=>{const data=await api('/api/ace-circles/directory?q='+encodeURIComponent(search));if(session.dialog!==dialog)return;el('ace-directory').innerHTML=data.people.map(p=>`<article class="ace-person"><header>${avatar(p)}<h3>${esc(p.username)}</h3></header><p>Une invitation pour rejoindre ton carré.</p>${button('Inviter comme AS','','quiet',`data-invite="${p.id}"`)}</article>`).join('')||'<p class="private-note">Aucune personne disponible avec ce pseudo. Vérifie son orthographe ou tes invitations en attente.</p>';el('ace-directory').querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>run(b,async()=>{if(!await sendInvitation({target:Number(b.dataset.invite),direction:'invite'}))return;closeModal();session.circle=await api('/api/ace-circles');await circleTab('settings');}));});};
}

async function reportsPage(){
 const data=await api('/api/private/reports');shell(heading('Signalements','Uniquement les messages et motifs transmis volontairement. Aucun arbre de vie n’est consultable ici.')+data.reports.map(r=>`<article class="private-panel private-consent"><h2>${esc(r.subject||'Compte supprimé')}</h2><p class="private-note">Signalé par ${esc(r.reporter)} · ${esc(r.date)}</p><div class="life-reading"><h3>Message transmis</h3><p>${esc(r.message)}</p><h3>Motif</h3><p>${esc(r.reason)}</p></div><div class="private-actions">${button('Marquer comme traité','','quiet',`data-resolve="${esc(r.id)}"`)}</div></article>`).join('')+(data.reports.length?'':'<p class="private-note">Aucun signalement en attente.</p>'));
 document.querySelectorAll('[data-resolve]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/private/reports',{method:'PUT',body:{id:b.dataset.resolve}});await reportsPage();}));
}

async function mechanismPage(slot){
  if(!slot){
    const {mechanisms}=await api('/api/mechanisms');
    shell(`${heading('Mécanismes','Relis et améliore tes mécanismes une fois par jour.',`<span class="mechanism-count" aria-label="${mechanisms.filter(m=>m.title).length} mécanismes renseignés sur 10">${mechanisms.filter(m=>m.title).length}<small> / 10</small></span>`)}<div class="mechanism-grid">${mechanisms.map(m=>`<a class="mechanism-card ${m.title?'is-written':''}" href="/mecanisme/${m.slot}" data-link><span class="mechanism-number">${String(m.slot).padStart(2,'0')}</span><h2>${m.title?esc(m.title):'À écrire'}</h2><p>${m.title?esc(m.anchor||m.description.slice(0,110)):'Quelle manière d’être veux-tu cultiver ?'}</p></a>`).join('')}</div>`);
    return;
  }
  const {mechanism:m}=await api('/api/mechanisms/'+slot);
  shell(`<a class="private-back" href="/mecanisme" data-link>Mes dix mécanismes</a><article class="mechanism-detail"><p class="mechanism-index">Mécanisme ${String(slot).padStart(2,'0')}</p>${heading(m.title?esc(m.title):'Une place à écrire')}${m.anchor?`<blockquote>${esc(m.anchor)}</blockquote>`:''}<div class="mechanism-reading">${[['description','Ce que je veux cultiver'],['notice','Ce que j’observe'],['practice','Comment je le mets en pratique']].filter(([key])=>m[key]).map(([key,label])=>`<section><h2>${label}</h2><p>${esc(m[key])}</p></section>`).join('')||'<p class="private-note">Un groupe de mots ou une phrase peut devenir ton premier repère.</p>'}</div></article><nav class="mechanism-pagination" aria-label="Mes mécanismes">${slot>1?`<a href="/mecanisme/${slot-1}" data-link>Précédent</a>`:'<span></span>'}${button(m.title?'Modifier':'Écrire','mechanism-edit','quiet')}${slot<10?`<a href="/mecanisme/${slot+1}" data-link>Suivant</a>`:'<span></span>'}</nav>`);
  bind('mechanism-edit',async()=>{if(!await consent())return;mechanismForm(m);});
}
function mechanismForm(m){
  let revision=m.revision;
  modal('Mécanisme '+String(m.slot).padStart(2,'0'),`<form id="mechanism-form"><label>Mon mécanisme<input name="title" required maxlength="140" value="${esc(m.title)}" placeholder="Un groupe de mots, une phrase"></label>${[['description','Ce que je veux cultiver',6000],['notice','Ce que j’observe',3000],['practice','Comment je le mets en pratique',3000],['anchor','Mon repère en quelques mots',500]].map(([key,label,max])=>`<label>${label}<textarea name="${key}" maxlength="${max}">${esc(m[key])}</textarea></label>`).join('')}<div class="private-actions form-actions"><button class="private-button" type="submit">Enregistrer</button>${button('Vider cet emplacement','mechanism-clear','subtle')}</div><div id="mechanism-conflict" hidden>${button('Comparer la version enregistrée','mechanism-compare','quiet')}<div id="mechanism-current"></div></div></form>`);
  const form=el('mechanism-form');form.oninput=()=>{session.dirty=true;};
  const save=async(data)=>{try{await api('/api/mechanisms/'+m.slot,{method:'PUT',body:{...data,revision}});session.dirty=false;closeModal();await mechanismPage(m.slot);}catch(e){if(e.status===409)el('mechanism-conflict').hidden=false;throw e;}};
  form.onsubmit=e=>{e.preventDefault();run(form.querySelector('[type=submit]'),()=>save(Object.fromEntries(new FormData(form))));};
  bind('mechanism-clear',async()=>{if(!confirm('Vider cet emplacement ? Tu pourras y écrire un nouveau mécanisme.'))return;await save({title:'',description:'',notice:'',practice:'',anchor:''});});
  bind('mechanism-compare',async()=>{const {mechanism:current}=await api('/api/mechanisms/'+m.slot);el('mechanism-current').innerHTML=`<section class="private-panel"><h3>${esc(current.title)}</h3>${['description','notice','practice','anchor'].map(k=>`<p>${esc(current[k])}</p>`).join('')}<p class="private-note">Ta saisie reste dans le formulaire. Tu peux choisir de remplacer la version ci-dessus par ta saisie.</p>${button('Conserver ma saisie','mechanism-keep','quiet')}</section>`;bind('mechanism-keep',()=>{revision=current.revision;el('mechanism-conflict').hidden=true;status('Tu peux maintenant enregistrer ta saisie.',false,'dialog-status');});});
}
