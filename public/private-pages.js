import {dateFields,configureDate,readDate} from './life-dates.js';
import {mountComments} from './as-comments.js';
import {PRIVATE_HELP} from './private-help.js';
import {chatViewport} from './private-chat-scroll.js';
import {normalizeMechanism,mechanismFields} from './mechanism-model.js';
import {VIDEO_BRANCHES,videoLabel} from './video-model.js';
import {youtubeId,youtubeEmbed} from './youtube-video.js';
import {ensureLogeUpload,validateLogeFile} from './loge-upload.js';
import {createStreamPlayer} from './loge-stream-player.js';
import {startVideoJob,currentVideoJob,onVideoJob,setVideoJobOpener,takePendingJobOpen,retryVideoJob,cancelVideoJob,dismissVideoJob,jobActive,jobSummary,jobCategory} from './video-uploads.js';
let session=null;
export function leave(){
  if(!session)return;session.offJob?.();session.offJobOpener?.();session.moreObserver?.disconnect();session.posterObserver?.disconnect();clearInlineComments();destroyVideoPlayers();session.dialogCleanup?.();session.controller.abort();clearTimeout(session.timer);
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
  const s=session;
  if(!options.method&&s.initial?.path===path){const result=s.initial.data;s.initial=null;return result;}
  const result=await s.ctx.api(path,{...options,headers:{'X-WC-User':String(s.user),...options.headers},signal:s.controller.signal});
  if(!live(s))throw new DOMException('Navigation','AbortError');return result;
}
function status(message='',error=false,id='private-status'){const node=el(id);if(node){node.textContent=message;node.classList.toggle('is-error',error);}}
function bind(id,action){const node=el(id);if(node)node.onclick=()=>run(node,action);}
async function run(node,action){
  const s=session;if(node)node.disabled=true;
  try{await action();}catch(error){if(error.name!=='AbortError'&&live(s))status(error.message,true,s.dialog?'dialog-status':'private-status');}
  finally{if(node?.isConnected)node.disabled=false;}
}
function heading(title,subtitle='',actions='',help=''){return `<header class="private-heading ${help?'has-help ':''}${['Mécanismes','Vidéographie','Carré d’AS'].includes(title)?'center-mobile':''}"><div><h1>${title}</h1>${subtitle?`<p class="private-subtitle">${subtitle}</p>`:''}</div>${help?`<a class="private-info" href="${help}/comprendre" data-link aria-label="Comprendre ${esc(title)}"><span aria-hidden="true">i</span></a>`:''}${actions}</header>`;}
function helpPage(base){const help=PRIVATE_HELP[base];shell(`<article class="private-explanation">${heading(help.title)}${help.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<footer class="private-explanation-footer"><a class="private-back" href="${base}" data-link>Revenir à ${esc(help.title)}</a></footer></article>`);}

function shell(html){destroyVideoPlayers();session.ctx.app.innerHTML=`<section class="private-page">${html}<p id="private-status" class="private-status" role="status"></p></section>`;}
function avatar(person){return `<span class="ace-avatar">${person?.avatar?`<img src="${esc(person.avatar)}" alt="" loading="lazy" decoding="async">`:esc(person?.username?.slice(0,1)||'·')}</span>`;}
function modal(title,html){
  pauseVideoPlayers();session.dialogCleanup?.();session.dialogCleanup=null;destroyVideoPlayers(session.dialog);session.dialog?.remove();session.dialogCheck=null;const dialog=document.createElement('dialog');dialog.className='private-dialog';
  dialog.innerHTML=`<button type="button" class="private-close" aria-label="Fermer">×</button><h2>${esc(title)}</h2>${html}<p class="private-status" role="status" id="dialog-status"></p>`;
  document.body.append(dialog);session.dialog=dialog;
  const mayClose=()=>!session?.dirty||confirm('Fermer sans enregistrer tes modifications ?');
  dialog.querySelector('.private-close').onclick=()=>{if(mayClose())dialog.close();};
  dialog.addEventListener('cancel',event=>{if(!mayClose())event.preventDefault();});
  dialog.addEventListener('close',()=>{destroyVideoPlayers(dialog);if(session?.dialog===dialog){session.dialogCleanup?.();session.dialogCleanup=null;session.dirty=false;session.dialog=null;}dialog.remove();});dialog.showModal();return dialog;
}
function closeModal(){session?.dialog?.close();}
async function verifyIdentity(){const current=await api('/api/me');if(current.user?.id!==session.user){destroyVideoPlayers();session.dialogCleanup?.();session.ctx.app.innerHTML='';session.dialog?.remove();session.ctx.navigate('/connexion?retour='+encodeURIComponent(location.pathname));return false;}return true;}
export async function page(path,ctx){
  // The explanation page was removed; its address returns to the videography.
  if(path==='/videographie/comprendre'){leave();return ctx.navigate('/videographie',true);}
  if(path==='/carre-d-as/comprendre'){leave();return ctx.navigate('/carre-d-as',true);}
  if(!['/game-master-orange','/game-master-blanc','/signalements','/videographie','/videographie/archives','/carre-d-as'].includes(path)&&!/^\/carre-d-as\/fil\/\d+$/.test(path)){leave();return ctx.navigate('/',true);}
  leave();const s=session={ctx,user:ctx.state.user?.id,controller:new AbortController(),timer:null,dialog:null,dirty:false};
  if(!document.querySelector('link[href="/private-pages.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/private-pages.css';document.head.append(css);}
  const title=path.startsWith('/mecanisme')?'Mécanismes':path==='/game-master-orange'?'Game Master Orange':path==='/game-master-blanc'?'Game Master Blanc':path.startsWith('/videographie')?'Vidéographie':path==='/signalements'?'Signalements':'Carré d’AS';document.title=title+' · White Cadae';
  if(!s.user){shell(heading(title)+ctx.accountEntryMarkup());return;}
  s.beforeUnload=e=>{if(s.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',s.beforeUnload);
  s.visibility=async()=>{
    if(!live(s))return;
    if(document.hidden){pauseVideoPlayers();ctx.app.style.visibility='hidden';ctx.app.inert=true;if(s.dialog)s.dialog.style.visibility='hidden';clearTimeout(s.timer);}
    else{try{if(await verifyIdentity()){if(s.poll)await s.poll();ctx.app.style.visibility='';ctx.app.inert=false;if(s.dialog)s.dialog.style.visibility='';schedule();}}catch(e){destroyVideoPlayers();s.dialogCleanup?.();ctx.app.innerHTML='<p>Reconnecte-toi pour retrouver cet espace.</p>';ctx.app.style.visibility='';ctx.app.inert=false;s.dialog?.remove();}}
  };document.addEventListener('visibilitychange',s.visibility);
  try{
    if(path==='/game-master-orange'){await api('/api/game-master-orange');gameMaster();return;}
    if(path==='/game-master-blanc'){const content=await api('/api/game-master-blanc');gameMasterBlanc(content.page);return;} if(path==='/signalements'){await reportsPage();return;}
    const helpBase=path.endsWith('/comprendre')?path.slice(0,-11):null;
    if(PRIVATE_HELP[helpBase]){await api('/api/mechanisms');helpPage(helpBase);return;}
    const slot=Number(path.split('/')[2])||null,topic=/^\/carre-d-as\/fil\/(\d+)$/.exec(path);
    const first=path.startsWith('/mecanisme')?'/api/mechanisms'+(slot?'/'+slot:''):path==='/videographie'?'/api/life-tree?videos=1&branch=self':path==='/videographie/archives'?'/api/life-tree?archive=1':topic?'/api/ace-circles/topics/'+topic[1]:'/api/ace-circles';
    // Each endpoint checks the current user and level. Fetch consent alongside
    // the first resource, without repeating the session/progression request.
    const [privacy,data]=await Promise.all([api('/api/private/consent'),api(first)]);
    s.consent=privacy;s.initial={path:first,data};
    if(path.startsWith('/mecanisme'))await mechanismPage(slot);else if(path==='/videographie')await videoPage();else if(path==='/videographie/archives')await treePage();else if(topic)await topicPage(Number(topic[1]));else await circlePage();
  }catch(e){if(live(s)&&e.name!=='AbortError')shell(heading(title)+`<p>${esc(e.message)}</p>`);}
}
function schedule(){
  const s=session;clearTimeout(s.timer);if(!s.poll||document.hidden)return;
  const poll=s.poll;
  s.timer=setTimeout(async()=>{if(!live(s)||s.poll!==poll)return;try{await poll();if(!live(s)||s.poll!==poll)return;s.failures=0;}catch(e){if(e.name==='AbortError'||!live(s)||s.poll!==poll)return;s.failures=(s.failures||0)+1;if([401,403,404,409].includes(e.status)){s.dialog?.remove();shell('<p>Cet espace n’est plus accessible. Reviens à la page pour vérifier tes accès.</p>');s.poll=null;}else status('Connexion interrompue. La mise à jour reprendra automatiquement.',true);}if(live(s))schedule();},Math.min(30000,5000*(1+(s.failures||0))));
}
function gameMaster(){
  shell(`<div class="gm-layout"><header class="private-heading gm-heading"><h1 class="gm-title"><span>Game Master</span><span>Orange</span></h1></header><article class="gm-letter"><p class="gm-opening"><span>Avancer ensemble.</span><span>Devenir les Game Masters<br class="gm-desktop-break"> les uns des autres.</span></p><div class="gm-copy"><p>Pour avancer de la meilleure manière dans l’Escape Game Orange, trouve des partenaires dans ton entourage et invite-les à entrer dans le jeu. Au début, tu es leur Game Master : accompagne-les à partir des cheminements qui t’ont permis de comprendre ce que tu as compris et d’en arriver là.</p><p>Réécoutez les musiques, relisez les paroles, propose des parallèles ou des indices subtils. Aide-les à trouver par eux-mêmes, sans leur donner les réponses.</p><p>Le but est de devenir mutuellement les Game Masters les uns des autres. Dès que l’un de vous comprend une énigme qu’un autre cherche encore, il le guide sur cette énigme. Les rôles s’échangent au fil de vos découvertes, sans avoir besoin d’être au même échelon.</p><p>Fais grandir ce cercle de partenaires, chacun peut aider les autres à avancer et à se tirer vers le haut.</p><div class="gm-orbit" aria-hidden="true"></div>${button('Inviter mes partenaires','gm-share','')}</div></article></div>`);
  bind('gm-share',async()=>{const data={title:'Escape Game Orange',url:location.origin+'/'};if(navigator.share){try{await navigator.share(data);}catch(e){if(e.name!=='AbortError')throw e;}}else{await navigator.clipboard.writeText(data.url);status('Le lien est copié.');}});
}
function gameMasterBlanc(content){
  // Keep the last two words together, including on browsers without pretty wrapping.
  const prose=text=>{
    const community=/^(.*\s)(Game Masters Blancs\.)$/.exec(text);
    if(community)return `${esc(community[1])}<span class="gm-community-name">${esc(community[2].replaceAll(' ','\u00a0'))}</span>`;
    return esc(text.replace(/\s+(\S+)$/, '\u00a0$1'));
  };
  shell(`<div class="gm-layout gm-white"><header class="private-heading gm-heading"><h1 class="gm-title"><span>Game Master</span><span>Blanc</span></h1></header><article class="gm-letter"><p class="gm-opening">${content.opening.map(text=>`<span>${esc(text)}</span>`).join(' ')}</p><div class="gm-copy">${content.sections.map((section,index)=>`<section class="gm-section" aria-labelledby="gm-white-section-${index}"><h2 id="gm-white-section-${index}">${esc(section.title)}</h2>${section.paragraphs.map(text=>`<p>${prose(text)}</p>`).join('')}</section>`).join('')}</div></article></div>`);
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
async function videoPage(){
  session.videos={branch:'self',events:[],next:null,request:0};
  shell(`${heading('Vidéographie')}<nav class="video-branches" aria-label="Rubriques de ma Vidéographie">${VIDEO_BRANCHES.map(([key,label])=>`<button type="button" data-video-branch="${key}" aria-pressed="${key==='self'}">${label}</button>`).join('')}</nav><div class="video-section-heading"><div class="video-section-title"><h2 id="video-section-title">${esc(videoLabel('self'))}</h2><p class="video-section-count" id="video-section-count" aria-live="polite"></p></div><div class="private-actions video-add-action">${button('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Ajouter une vidéo','video-add','')}</div></div><div id="video-list" class="video-grid"></div>${button('Voir la suite','video-more','quiet','hidden')}`);
  // While a video is on its way, « Ajouter » shows where it stands instead.
  bind('video-add',()=>currentVideoJob()?.phase&&currentVideoJob().phase!=='done'?videoJobView():videoForm(null,null,session.videos.branch||'self'));
  const s=session;s.offJobOpener=setVideoJobOpener(()=>{if(live(s))videoJobView();});
  s.offJob=onVideoJob(job=>{if(!live(s)||!s.videos)return;if(job?.phase==='done'&&s.reloadedJob!==job){s.reloadedJob=job;void loadVideos(true).catch(()=>{});}else renderJobTile();});
  // The next page loads by itself as the grid's end comes into view.
  if(typeof IntersectionObserver==='function'){s.moreObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&live(s)&&!el('video-more').hidden&&!s.videos.loading)el('video-more').click();},{rootMargin:'600px 0px'});s.moreObserver.observe(el('video-more'));}
  bind('video-more',()=>loadVideos());
  const select=async branch=>{if(session.videos.branch===branch)return;session.videos.branch=branch;document.querySelectorAll('[data-video-branch]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.videoBranch===branch)));el('video-section-title').textContent=videoLabel(branch);await loadVideos(true);};
  document.querySelectorAll('[data-video-branch]').forEach(b=>b.onclick=()=>run(b,()=>select(b.dataset.videoBranch)));
  await loadVideos(true);
  if(live(s)&&takePendingJobOpen())videoJobView();
}
async function loadVideos(reset=false){
  const state=session.videos,request=++state.request;
  if(reset){clearInlineComments();destroyVideoPlayers(el('video-list'));state.events=[];state.next=null;el('video-list').replaceChildren();el('video-more').hidden=true;}
  const query=new URLSearchParams({videos:'1'});if(state.owner)query.set('owner',String(state.owner));if(state.branch)query.set('branch',state.branch);if(state.next)query.set('after',state.next);
  state.loading=true;let data;try{data=await api('/api/life-tree?'+query);}finally{state.loading=false;}
  if(session.videos!==state||state.request!==request)return;
  const start=state.events.length;state.events.push(...data.events);state.next=data.next;
  // A grid of covers, as on a profile: each opens the video in a viewer.
  el('video-list').insertAdjacentHTML('beforeend',data.events.map((e,index)=>videoTile(e,start+index)).join(''));
  el('video-list').querySelector('.video-empty')?.remove();
  if(!state.events.length)el('video-list').insertAdjacentHTML('beforeend',`<div class="video-empty"><span class="video-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg></span><p>Aucune vidéo dans cette rubrique pour le moment.</p>${state.owner?'':button('Ajouter ta première vidéo','','',`data-video-add-empty`)}</div>`);
  el('video-list').querySelector('[data-video-add-empty]')?.addEventListener('click',()=>el('video-add').click());
  el('video-more').hidden=!state.next;
  const count=el('video-section-count');if(count)count.textContent=state.events.length?`${state.events.length}${state.next?'+':''} vidéo${state.events.length>1?'s':''}`:'';
  el('video-list').querySelectorAll('[data-video-open]:not([data-bound])').forEach(tile=>{tile.dataset.bound='1';tile.onclick=()=>openVideoViewer(Number(tile.dataset.videoOpen));});
  if(!state.owner)renderJobTile();loadPosters(el('video-list'),state.owner);
}
function videoTile(e,index){
  const shared=!!e.loge_post_id;
  return `<article class="video-tile" data-video="${esc(e.id)}"><button type="button" class="video-tile-open" data-video-open="${index}" aria-label="Regarder ${esc(e.title)}"><span class="video-tile-poster"${e.creation?.videoProvider==='stream'?` data-poster="${esc(e.id)}"`:''}></span><span class="video-tile-shade" aria-hidden="true"></span><span class="video-tile-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5 20 12 8 19Z"/></svg></span>${shared?'<span class="video-tile-badge">Dans les loges</span>':''}<span class="video-tile-text"><strong>${esc(e.title)}</strong><time>${esc(dateLabel(e))}</time></span></button></article>`;
}
// Covers are signed by the server one by one, only when a tile nears the screen.
function loadPosters(root,owner=null){
  const s=session,cache=s.posters||=new Map(),queue=s.posterQueue||=[],ownerQuery=owner?'?owner='+encodeURIComponent(owner):'';
  const fill=(slot,url)=>{if(slot.querySelector('img'))return;const img=document.createElement('img');img.alt='';img.decoding='async';img.loading='lazy';img.onload=()=>slot.classList.add('is-loaded');img.src=url;slot.append(img);};
  const pump=()=>{
    while((s.posterActive||0)<3&&queue.length){
      const slot=queue.shift();if(!slot.isConnected||!live(s))continue;const id=slot.dataset.poster,hit=cache.get(id);
      if(hit&&hit.expires>Date.now()+60000){fill(slot,hit.url);continue;}
      s.posterActive=(s.posterActive||0)+1;
      api('/api/life-tree/events/'+encodeURIComponent(id)+'/playback'+ownerQuery).then(data=>{if(data?.poster){cache.set(id,{url:data.poster,expires:Date.parse(data.expiresAt)||Date.now()+1800000});if(slot.isConnected)fill(slot,data.poster);}}).catch(()=>{}).finally(()=>{s.posterActive--;pump();});
    }
  };
  const want=slot=>{if(slot.dataset.posterQueued)return;slot.dataset.posterQueued='1';queue.push(slot);pump();};
  const slots=[...root.querySelectorAll('[data-poster]')];
  if(typeof IntersectionObserver!=='function'){slots.forEach(want);return;}
  s.posterObserver||=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){s.posterObserver.unobserve(entry.target);want(entry.target);}},{rootMargin:'300px 0px'});
  for(const slot of slots)if(!slot.dataset.posterQueued)s.posterObserver.observe(slot);
}
// A video on its way shows in its category, ahead of the others.
function renderJobTile(){
  const list=el('video-list');if(!list||!session?.videos)return;
  const job=currentVideoJob(),show=!!job&&!session.videos.owner&&job.phase!=='done'&&job.branch===session.videos.branch;
  let tile=el('video-job-tile');
  if(!show){tile?.remove();list.querySelector('.video-empty')?.removeAttribute('hidden');return;}
  if(!tile){list.insertAdjacentHTML('afterbegin',`<article class="video-tile is-pending" id="video-job-tile"><button type="button" class="video-tile-open" data-video-job><span class="video-tile-ring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" pathLength="100"/><circle class="ring-value" cx="18" cy="18" r="15" pathLength="100"/></svg></span><span class="video-tile-text"><strong></strong><time></time></span></button></article>`);tile=el('video-job-tile');tile.querySelector('[data-video-job]').onclick=()=>videoJobView();}
  list.querySelector('.video-empty')?.setAttribute('hidden','');
  tile.classList.toggle('is-error',job.phase==='error');tile.style.setProperty('--ring',String(job.phase==='uploading'?job.progress||0:job.phase==='error'?100:30));
  tile.classList.toggle('is-indeterminate',!['uploading','error'].includes(job.phase));
  tile.querySelector('strong').textContent=job.title;tile.querySelector('time').textContent=job.phase==='error'?'Envoi interrompu · toucher pour voir':jobSummary(job);
  tile.querySelector('[data-video-job]').setAttribute('aria-label',`${job.title} : ${jobSummary(job)||job.error}. Afficher le suivi.`);
}
// The viewer plays one video at a time, with its details and the way to the next.
function openVideoViewer(index){
  const s=session,events=s.videos?.events||[],e=events[index];if(!e)return;
  const owner=s.videos.owner||s.user,own=owner===s.user;
  const dialog=modal(e.title,`<article class="video-card video-viewer" data-video="${esc(e.id)}"><p class="video-viewer-meta"><span>${esc(videoLabel(e.video_branch))}</span><time>${esc(dateLabel(e))}</time>${e.loge_post_id?'<span class="video-tile-badge">Dans les loges</span>':''}</p>${eventVideoPlayer(e,true,true,owner)}${!own&&e.creation?.work?`<p class="video-viewer-notes">${esc(e.creation.work)}</p>`:''}<div class="video-card-footer">${own?button('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/></svg>Modifier','video-viewer-edit','quiet'):'<span></span>'}${e.topic_id&&s.ctx.state.access?.aceSquare?button('AS','','quiet',`data-video-comments="${e.topic_id}" aria-expanded="false" aria-controls="as-comments-${e.topic_id}"`):''}</div><nav class="video-viewer-nav" aria-label="Autres vidéos">${button('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg><span>Précédente</span>','video-viewer-prev','quiet',index===0?'disabled':'')}<span class="video-viewer-position">${index+1} / ${events.length}${s.videos.next?'+':''}</span>${button('<span>Suivante</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>','video-viewer-next','quiet',index>=events.length-1&&!s.videos.next?'disabled':'')}</nav></article>`);
  dialog.classList.add('is-viewer');wireVideoPlayers(dialog,()=>Promise.resolve());
  if(own)bind('video-viewer-edit',async()=>{const data=await api('/api/life-tree/events/'+encodeURIComponent(e.id));videoForm(data.event);});
  dialog.querySelectorAll('[data-video-comments]').forEach(b=>b.onclick=()=>run(b,()=>toggleInlineComments(b)));
  const go=async step=>{
    const next=index+step;
    if(next>=events.length&&s.videos.next){await loadVideos();}
    if(live(s)&&s.videos.events[next])openVideoViewer(next);
  };
  bind('video-viewer-prev',()=>go(-1));bind('video-viewer-next',()=>go(1));
  dialog.addEventListener('keydown',event=>{if(event.target.closest?.('input,textarea,select'))return;if(event.key==='ArrowRight'){event.preventDefault();void go(1);}else if(event.key==='ArrowLeft'&&index>0){event.preventDefault();void go(-1);}});
}
function clearInlineComments(){
  if(!session?.commentPanels)return;
  for(const p of session.commentPanels.values()){p.component?.destroy();p.root.remove();}
  session.commentPanels.clear();session.activeComments=null;session.poll=null;clearTimeout(session.timer);session.dirty=false;
}
async function toggleInlineComments(button){
  const s=session,id=Number(button.dataset.videoComments),panels=s.commentPanels||=new Map();
  const close=()=>{const p=panels.get(id);if(p){p.root.hidden=true;p.button.setAttribute('aria-expanded','false');}if(s.activeComments===id){s.activeComments=null;s.poll=null;clearTimeout(s.timer);}button.focus({preventScroll:true});};
  if(s.activeComments===id){close();return;}
  for(const p of panels.values()){p.root.hidden=true;p.button.setAttribute('aria-expanded','false');}
  s.activeComments=id;s.poll=null;clearTimeout(s.timer);
  let panel=panels.get(id);
  if(!panel){
    const root=document.createElement('section');root.id='as-comments-'+id;root.className='as-comments';root.setAttribute('aria-label','Échanges avec les AS');button.closest('.video-card').append(root);
    panel={root,button,component:null,draft:false};panels.set(id,panel);
    try{
      await api('/api/ace-circles',{method:'POST',body:{}});
      if(!live(s)||panels.get(id)!==panel)return;
      panel.root.hidden=s.activeComments!==id;
      panel.component=await mountComments({root,id,api,user:s.user,esc,onClose:close,onDraft:dirty=>{panel.draft=dirty;if(live(s))s.dirty=[...panels.values()].some(p=>p.draft);}});
      if(!live(s)||panels.get(id)!==panel){panel.component.destroy();return;}
    }catch(e){panel.root.remove();panels.delete(id);if(s.activeComments===id)s.activeComments=null;throw e;}
  }
  if(s.activeComments!==id)return;
  panel.root.hidden=false;button.setAttribute('aria-expanded','true');
  await panel.component.refresh();
  if(live(s)&&s.activeComments===id){s.poll=()=>panel.component.refresh();schedule();}
}
async function loadDrafts(){
  const data=await api('/api/life-tree/drafts');
  modal('Tes brouillons',data.drafts.length?data.drafts.map(d=>`<div class="ace-invitation"><strong>${esc(d.payload.event.title||'Sans titre')}</strong><div class="private-actions">${button('Reprendre','','quiet',`data-draft="${esc(d.id)}"`)}${button('Supprimer','','subtle',`data-erase-draft="${esc(d.id)}"`)}</div></div>`).join(''):'<p>Aucun brouillon enregistré.</p>');
  session.dialog.querySelectorAll('[data-draft]').forEach(b=>b.onclick=()=>{const d=data.drafts.find(d=>d.id===b.dataset.draft);d.payload.event.videoBranch?videoForm(null,d):eventForm(null,d);});
  session.dialog.querySelectorAll('[data-erase-draft]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/life-tree/drafts/'+b.dataset.eraseDraft,{method:'DELETE',body:{}});b.closest('.ace-invitation').remove();}));
}
function videoForm(event=null,draft=null,branch='self'){
  closeModal();const s=session,d=draft?.payload.event||event||{},id=event?.id||draft?.id||uid();
  let revision=event?.revision||d.revision||0;const draftRevision=draft?.revision||0;
  branch=d.videoBranch||d.video_branch||branch;if(branch==='monthly')branch='ideas';
  // The date is never typed: a new video takes the day it is added (set by the
  // server, in Paris time) and an edit keeps the date already saved.
  const precision=d.precision==='month'?'month':'day',saved=d.date||d.video_month||d.sort_date||null;
  const date=saved?(precision==='month'?String(saved).slice(0,7):String(saved).slice(0,10)):null,existing=!!event&&(d.creation?.videoProvider==='stream'||!!youtubeId(d.creation?.url));
  // A video published in the Loge keeps its file: commenters answered that one.
  const shared=!!event?.loge_post_id,fileTitle=shared?'Vidéo publiée dans les Loges virtuelles':existing?'Choisir une autre vidéo':'Choisir une vidéo',fileHelp=shared?'Supprime sa publication dans les Loges virtuelles pour remplacer le fichier.':'200 Mo et 30 minutes maximum'+(existing?' · sans nouveau fichier, la vidéo actuelle est conservée':'');
  const dialog=modal(event?'Modifier la vidéo':'Ajouter une vidéo',`<form id="video-form"><label>Titre<input name="title" required maxlength="140" value="${esc(d.title||'')}"></label><div class="video-file-field"><span class="video-file-caption" id="video-file-caption">${existing?'Remplacer la vidéo (facultatif)':'Vidéo'}</span><label class="video-file${shared?' is-locked':''}" id="video-file-zone"><input type="file" name="video" accept="video/*" aria-labelledby="video-file-caption video-file-name" aria-describedby="video-file-help" ${existing?'':'required'} ${shared?'disabled':''}><span class="video-file-icon" aria-hidden="true"><svg class="video-file-icon-add" viewBox="0 0 24 24"><path d="M12 16V5m0 0-4 4m4-4 4 4M5 19h14"/></svg><svg class="video-file-icon-ready" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span><span class="video-file-text"><strong id="video-file-name">${fileTitle}</strong><small id="video-file-help">${fileHelp}</small></span><span class="video-file-action" id="video-file-action" hidden>Changer</span></label></div><p id="video-upload-state" class="private-note" role="status"></p><progress id="video-upload-progress" max="100" value="0" hidden aria-label="Progression de l’envoi"></progress>${button('Annuler l’envoi','video-upload-cancel','subtle','hidden')}${button('Annuler l’envoi précédent et recommencer','video-upload-restart','subtle','hidden')}<label>Catégorie<select name="videoBranch">${VIDEO_BRANCHES.map(([key,label])=>`<option value="${key}" ${branch===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="private-actions form-actions"><button class="private-button" type="submit">Enregistrer la vidéo</button>${event?button('Supprimer','video-delete','subtle'):''}</div><div id="video-conflict" hidden>${button('Comparer la version enregistrée','video-compare','quiet')}<div id="video-current"></div></div></form>`);
  const form=el('video-form'),picker=form.elements.video,upload={file:null,requestId:uid(),abandonedUploads:[]};let active=null,closed=false,committed=false,publishing=false;
  const current=()=>live(s)&&!closed&&s.dialog===dialog;
  const uploadRequest=async(path,options={})=>{
    try{return await s.ctx.api(path,{...options,headers:{'X-WC-User':String(s.user)}});}
    catch(error){
      if(live(s)&&([401,403].includes(error.status)||(error.status===409&&/compte connecté a changé/i.test(error.message)))){
        // A failed identity check must also remove content already on screen.
        leave();s.ctx.app.innerHTML='<section class="private-page"><p>Cet espace n’est plus accessible avec la session actuelle.</p><a class="private-back" href="/connexion?retour=%2Fvideographie" data-link>Vérifier mon compte</a></section>';
      }
      throw error;
    }
  };
  async function cancelAbandoned(){
    for(const uploadId of [...upload.abandonedUploads]){
      await uploadRequest('/api/life-tree/uploads/'+encodeURIComponent(uploadId),{method:'DELETE',body:{}});
      upload.abandonedUploads=upload.abandonedUploads.filter(value=>value!==uploadId);
    }
  }
  function resetUpload(file=null){
    active?.abort();if(upload.uploadId)upload.abandonedUploads.push(upload.uploadId);
    Object.assign(upload,{file,requestId:uid(),uploadId:null,uploadURL:null,uploadSent:false,durationChecked:false,uploadStatus:null,blockedUploadId:null});
    if(current())el('video-upload-restart').hidden=true;
    void cancelAbandoned().catch(()=>{});
  }
  const dispose=()=>{if(closed)return;closed=true;active?.abort();if(!committed&&!publishing)resetUpload();s.controller.signal.removeEventListener('abort',dispose);};
  s.dialogCleanup=dispose;s.controller.signal.addEventListener('abort',dispose,{once:true});
  const display=(message='',progress)=>{
    if(!current())return;el('video-upload-state').textContent=message;el('video-upload-progress').hidden=progress===undefined;if(progress!==undefined)el('video-upload-progress').value=progress;
    // A new video sends nothing before « Enregistrer »: « Changer » is enough until then.
    el('video-upload-cancel').hidden=!upload.file||!event;
    // The picker itself carries the selection: name, size and a way to change it.
    const file=upload.file;el('video-file-name').textContent=file?file.name:fileTitle;el('video-file-help').textContent=file?fileSize(file.size):fileHelp;
    el('video-file-zone').classList.toggle('has-file',!!file);el('video-file-action').hidden=!file;
  };
  form.oninput=()=>{s.dirty=true;};
  picker.onchange=()=>{
    const file=picker.files?.[0];if(!file)return;
    try{validateLogeFile(file);}catch(error){picker.value='';resetUpload();display();status(error.message,true,'dialog-status');return;}
    resetUpload(file);display();status('');s.dirty=true;
  };
  bind('video-upload-cancel',()=>{resetUpload();picker.value='';display('Envoi annulé.');});
  bind('video-upload-restart',async()=>{
    const blocked=upload.blockedUploadId;if(!blocked||!confirm('Annuler ton envoi précédent, y compris s’il est ouvert dans un autre onglet, et recommencer ?'))return;
    await uploadRequest('/api/life-tree/uploads/'+encodeURIComponent(blocked),{method:'DELETE',body:{}});
    if(!current())return;
    const file=upload.file;resetUpload(file);display();form.onsubmit({preventDefault(){}});
  });
  const body=()=>({title:form.elements.title.value,videoBranch:form.elements.videoBranch.value,entryType:'creation',medium:'vidéo',url:upload.file?'':(d.url||d.creation?.url||''),work:d.work||d.creation?.work||'',understanding:d.understanding||'',story:d.story||'',feelings:d.feelings||'',resources:d.resources||'',kind:d.kind||'autre',impact:d.impact||'à explorer',themes:d.themes||[],...(date?{precision,date}:{}),revision});
  const afterSave=()=>s.videos?loadVideos(true):s.ctx.navigate('/videographie');
  form.onsubmit=e=>{
    e.preventDefault();if(active)return;
    if(!event){
      // A new video uploads in the background: the window can close at once.
      if(!form.reportValidity())return;
      if(!upload.file){status('Choisis une vidéo.',true,'dialog-status');return;}
      try{startVideoJob({api:s.ctx.api,state:s.ctx.state,navigate:s.ctx.navigate,eventId:id,body:body(),file:upload.file});}
      catch(error){status(error.message,true,'dialog-status');return;}
      upload.file=null;s.dirty=false;videoJobView();return;
    }
    run(form.querySelector('[type=submit]'),async()=>{
      const controller=new AbortController();active=controller;
      const check=()=>{if(!current()||controller.signal.aborted)throw new DOMException('Envoi interrompu','AbortError');};
      try{
        let payload=body();if(!existing&&!upload.file)throw Error('Choisis une vidéo.');
        await cancelAbandoned();check();
        if(upload.file){
          payload.uploadId=await ensureLogeUpload(upload,{request:uploadRequest,basePath:'/api/life-tree/uploads',signal:controller.signal,onState:(state,progress)=>{
            if(!current())return;
            const labels={checking:'Vérification de la vidéo…',preparing:'Préparation de l’envoi…',uploading:`Envoi de la vidéo : ${progress||0} %`,processing:'Vidéo reçue. Préparation en cours…',ready:'Vidéo prête. Enregistrement…'};
            display(labels[state]||'',state==='uploading'?progress:undefined);
          }});check();
        }
        payload={...body(),...(payload.uploadId?{uploadId:payload.uploadId}:{})};
        // Freeze the selection during the final write: cancelling an upload does
        // not undo a video which the server has already attached to the event.
        picker.disabled=true;el('video-upload-cancel').disabled=true;
        publishing=true;await uploadRequest('/api/life-tree/events/'+id,{method:'PUT',body:payload});committed=true;publishing=false;check();
        if(draftRevision)await api('/api/life-tree/drafts/'+id,{method:'DELETE',body:{}});
        s.dirty=false;closeModal();await afterSave();
      }catch(error){
        if(current()&&!controller.signal.aborted&&error.name!=='AbortError'){if(error.status===409&&error.data?.uploadId){upload.blockedUploadId=error.data.uploadId;el('video-upload-restart').hidden=false;}display(error.message);form.querySelector('[type=submit]').textContent='Réessayer';if(error.status===409&&revision>0)el('video-conflict').hidden=false;}
        throw error;
      }finally{publishing=false;if(closed&&!committed)resetUpload();if(active===controller)active=null;if(current()){picker.disabled=shared;el('video-upload-cancel').disabled=false;}}
    });
  };
  bind('video-delete',async()=>{if(!confirm(shared?'Supprimer cette vidéo ? Elle sera aussi retirée des Loges virtuelles, avec les commentaires qu’elle y a reçus.':'Supprimer cette fiche et tous les commentaires qui lui sont liés ?'))return;await api('/api/life-tree/events/'+id,{method:'DELETE',body:{revision}});s.dirty=false;closeModal();await afterSave();});
  bind('video-compare',async()=>{const current=await api('/api/life-tree/events/'+id);destroyVideoPlayers(el('video-current'));el('video-current').innerHTML=`<section class="private-panel"><h3>${esc(current.event.title)}</h3>${videoReading(current.event)}${button('Conserver ma saisie','video-keep','quiet')}</section>`;wireVideoPlayers(el('video-current'),()=>api('/api/life-tree/events/'+id));bind('video-keep',()=>{revision=current.event.revision;el('video-conflict').hidden=true;status('Ta saisie est conservée. Tu peux l’enregistrer après comparaison.',false,'dialog-status');});});
}
// Where a background upload stands, with what can be done about it.
function videoJobView(){
  const s=session,job=currentVideoJob();if(!job){videoForm(null,null,s.videos?.branch||'self');return;}
  const dialog=modal('Ajout de ta vidéo',`<div class="video-job"><p class="video-job-title">${esc(job.title)}</p><p class="video-job-meta">${esc(jobCategory(job))} · ${esc(job.fileName)} · ${esc(fileSize(job.fileSize))}</p><ol class="video-job-steps" id="video-job-steps">${['Envoi','Traitement','Enregistrement'].map((label,index)=>`<li data-step="${index}"><span aria-hidden="true"></span>${label}</li>`).join('')}</ol><div class="video-job-bar" aria-hidden="true"><span id="video-job-fill"></span></div><p class="video-job-status" id="video-job-status" role="status" aria-live="polite"></p><p class="private-note video-job-note" id="video-job-note"></p><div class="private-actions video-job-actions" id="video-job-actions"></div></div>`);
  const steps=dialog.querySelectorAll('[data-step]');
  const render=()=>{
    const current=currentVideoJob();if(s.dialog!==dialog)return;
    if(!current){dialog.close();return;}
    const step=current.phase==='done'?3:current.phase==='saving'?2:current.phase==='processing'?1:0;
    steps.forEach((item,index)=>{item.dataset.state=index<step?'done':index===step&&current.phase!=='error'?'current':index===step?'failed':'pending';});
    const fill=el('video-job-fill');fill.style.width=(current.phase==='uploading'?current.progress||0:current.phase==='done'?100:current.phase==='error'?Math.max(4,current.progress||0):step===0?6:step===1?72:90)+'%';
    fill.classList.toggle('is-moving',['checking','preparing','processing','saving'].includes(current.phase));
    dialog.classList.toggle('is-error',current.phase==='error');
    el('video-job-status').textContent=current.phase==='error'?current.error:jobSummary(current);
    el('video-job-note').textContent=current.phase==='done'?'Ta vidéo est dans ta vidéographie.':current.phase==='error'?'Ta vidéo n’a pas été ajoutée. Tu peux réessayer ou annuler.':current.phase==='processing'?'Le service vidéo prépare la lecture : cela peut prendre quelques minutes. Tu peux fermer cette fenêtre et continuer ; le cercle près de ton échelon indique où en est l’envoi.':'Tu peux fermer cette fenêtre et continuer à utiliser le site ; le cercle près de ton échelon indique où en est l’envoi. Garde l’onglet ouvert jusqu’à la fin.';
    // Buttons are rebuilt only when the phase changes, never on each progress tick.
    if(dialog.dataset.phase===current.phase)return;dialog.dataset.phase=current.phase;
    const actions=el('video-job-actions');
    actions.innerHTML=current.phase==='done'?button('Fermer','video-job-close',''):current.phase==='error'?button('Réessayer','video-job-retry','')+button('Annuler l’ajout','video-job-cancel','subtle'):button('Continuer en arrière-plan','video-job-close','')+(current.phase==='saving'?'':button('Annuler l’envoi','video-job-cancel','subtle'));
    bind('video-job-close',()=>dialog.close());
    bind('video-job-retry',async()=>{if(currentVideoJob()?.blockedUploadId&&!confirm('Un envoi précédent (autre onglet ou ancienne session) occupe la place. L’annuler et recommencer ?'))return;await retryVideoJob();});
    bind('video-job-cancel',async()=>{if(!confirm('Annuler l’ajout de cette vidéo ?'))return;await cancelVideoJob();});
  };
  job.viewing=true;
  const off=onVideoJob(render);
  s.dialogCleanup=()=>{off();const current=currentVideoJob();if(current){current.viewing=false;if(current.phase==='done')dismissVideoJob();}};
  render();
}
const fileSize=bytes=>bytes>=1e6?(bytes/1e6).toLocaleString('fr-FR',{maximumFractionDigits:1})+'\u00a0Mo':Math.max(1,Math.round(bytes/1e3)).toLocaleString('fr-FR')+'\u00a0Ko';
function destroyVideoPlayers(root=document){
  if(!root||!session?.videoPlayers)return;
  for(const [container,entry] of session.videoPlayers){if(root===document||root===container||root.contains(container)){entry.destroy();session.videoPlayers.delete(container);}}
}
function pauseVideoPlayers(except=null){
  for(const entry of session?.videoPlayers?.values()||[])if(entry!==except)entry.player.pauseVideo();
  document.querySelectorAll?.('.video-player iframe').forEach(frame=>frame.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),'https://www.youtube-nocookie.com'));
}
function eventVideoPlayer(event,inline=false,eager=false,owner=session.user){
  if(event.creation?.videoProvider==='stream')return `<div class="videography-stream" data-stream-event="${esc(event.id)}" data-stream-owner="${esc(owner)}" data-stream-title="${esc(event.title)}"></div>`;
  return inline?inlineVideoPlayer(event.creation?.url,event.title,eager):videoPlayer(event.creation?.url,event.title);
}
function wireStreamPlayers(root){
  const s=session,players=s.videoPlayers||=new Map();
  root.querySelectorAll('[data-stream-event]').forEach(container=>{
    if(players.has(container))return;
    const controls=document.createElement('div');controls.className='videography-stream-controls';
    const seek=document.createElement('input');seek.type='range';seek.min='0';seek.max='100';seek.step='0.1';seek.value='0';seek.disabled=true;seek.setAttribute('aria-label','Position de lecture');
    const time=document.createElement('span');time.textContent='0:00 / 0:00';controls.append(seek,time);
    let player,entry;
    const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
    const update=()=>{if(!player)return;const duration=player.getDuration(),position=player.getCurrentTime();seek.disabled=!duration;seek.max=String(duration||100);seek.value=String(position);time.textContent=clock(position)+' / '+clock(duration);};
    player=createStreamPlayer({container,post:{id:container.dataset.streamEvent,title:container.dataset.streamTitle},getPlayback:id=>api('/api/life-tree/events/'+encodeURIComponent(id)+'/playback'+(String(s.user)===container.dataset.streamOwner?'':'?owner='+encodeURIComponent(container.dataset.streamOwner))),isEligible:()=>live(s)&&container.isConnected&&!document.hidden,onReady:update,onState:state=>{
      if(state===1){pauseVideoPlayers(entry);document.querySelectorAll('audio').forEach(audio=>audio.pause());}update();
    }});
    player.element.append(controls);
    seek.oninput=()=>{player.seekTo(Number(seek.value));update();};
    const events=['timeupdate','durationchange','loadedmetadata'];for(const name of events)player.video.addEventListener(name,update);
    entry={player,destroy(){for(const name of events)player.video.removeEventListener(name,update);player.destroy();}};players.set(container,entry);
  });
}
function inlineVideoPlayer(url,title,eager=false){
  const src=youtubeEmbed(url,false)+'&enablejsapi=1';if(!youtubeId(url))return '<p class="private-note">Le lien de cette vidéo n’a pas encore été ajouté.</p>';
  return `<div class="video-player"><iframe src="${esc(src)}" title="${esc('Lire la vidéo : '+title)}" loading="${eager?'eager':'lazy'}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}
function videoPlayer(url,title){
  const id=youtubeId(url);if(!id)return '<p class="private-note">Le lien de cette vidéo n’a pas encore été ajouté.</p>';
  return `<div class="video-player" data-video-player="${id}"><button type="button" class="video-play" aria-label="Lire la vidéo : ${esc(title)}"><span>Lire la vidéo</span><small>YouTube</small></button></div>`;
}
function wireVideoPlayers(root,authorize){
  wireStreamPlayers(root);
  root.querySelectorAll('[data-video-player]').forEach(container=>{
    const play=container.querySelector('button');if(!play)return;play.onclick=()=>run(play,async()=>{
      await authorize();if(!container.isConnected)return;
      pauseVideoPlayers();document.querySelectorAll('audio').forEach(audio=>audio.pause());
      const frame=document.createElement('iframe');frame.title=play.getAttribute('aria-label');
      frame.src=youtubeEmbed('https://youtu.be/'+container.dataset.videoPlayer)+'&enablejsapi=1';
      frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
      frame.referrerPolicy='strict-origin-when-cross-origin';container.replaceChildren(frame);
    });
  });
}
function videoReading(e,owner=session.user){return `${eventVideoPlayer(e,false,false,owner)}<div class="life-reading"><p class="topic-kind">${esc(videoLabel(e.video_branch))}</p><p class="private-note">${esc(dateLabel(e))}</p>${e.creation?.work?`<p>${esc(e.creation.work)}</p>`:''}${e.understanding?`<h3>À approfondir</h3><p>${esc(e.understanding)}</p>`:''}</div>`;}
async function videoDetail(data,owner){
  const event=data.event,own=owner===session.user;
  modal(event.title,videoReading(event,owner)+`<div class="private-actions">${own?button('Modifier','video-edit','quiet'):''}${event.topic_id&&session.ctx.state.access?.aceSquare?button('AS','video-comments',''):''}</div>`);
  wireVideoPlayers(session.dialog,()=>api('/api/life-tree/events/'+event.id+(own?'':'?owner='+owner)));
  bind('video-edit',()=>videoForm(event));
  bind('video-comments',async()=>{if(own)await api('/api/ace-circles',{method:'POST',body:{}});closeModal();session.ctx.navigate('/carre-d-as/fil/'+event.topic_id);});
  const dialog=session.dialog;session.dialogCheck=async()=>{const next=await api('/api/life-tree/events/'+event.id+(own?'':'?owner='+owner));if(session.dialog===dialog&&JSON.stringify(next)!==JSON.stringify(data))await videoDetail(next,owner);};
}
async function treePage(){
  session.tree={events:[],next:null,filters:new URLSearchParams({archive:"1"})};
  shell(`<a class="private-back" href="/videographie" data-link>Vidéographie</a>${heading('Mes archives','',`<div class="private-actions">${button('Brouillons','life-drafts','subtle')}</div>`)}<details class="life-filter-toggle"><summary>Filtrer mon histoire</summary><form id="life-filter" class="life-filter"><label>Contenu<select name="entryType"><option value="">Tout</option><option value="event">Vécu</option><option value="creation">Créations</option></select></label><label>Type<select name="kind">${opts(kinds,'','Tous les types')}</select></label><label>Impact<select name="impact">${opts(impacts,'','Tous les impacts')}</select></label><label>Thème<input name="theme" maxlength="60" placeholder="Confiance, création…"></label>${dateFields('from','','Depuis')}${dateFields('to','','Jusqu’à')}<div class="private-actions"><button class="private-button quiet" type="submit">Filtrer</button>${button('Effacer','life-reset','subtle')}</div></form></details><ol class="life-list life-journal" id="life-events"></ol>${button('Voir la suite','life-more','quiet','hidden')}`);
  el('life-filter').onsubmit=e=>{e.preventDefault();run(null,async()=>{const f=e.target;session.tree.filters=new URLSearchParams(Object.entries({archive:'1',entryType:f.elements.entryType.value,kind:f.elements.kind.value,impact:f.elements.impact.value,theme:f.elements.theme.value,from:readDate(f,'from','day',{optional:true}),to:readDate(f,'to','day',{optional:true})}).filter(([,v])=>v));await loadTree(true);});};
  bind('life-reset',async()=>{el('life-filter').reset();session.tree.filters=new URLSearchParams({archive:"1"});await loadTree(true);});bind('life-more',()=>loadTree());
  bind('life-drafts',loadDrafts);
  await loadTree(true);
}
async function loadTree(reset=false){
  const tree=session.tree,version=tree.request=(tree.request||0)+1;if(reset){tree.next=null;tree.events=[];}const query=new URLSearchParams(tree.filters);if(tree.next)query.set('after',tree.next);
  const data=await api('/api/life-tree?'+query);if(session.tree!==tree||tree.request!==version)return;tree.events.push(...data.events);tree.next=data.next;
  el('life-events').innerHTML=tree.events.length?tree.events.map(e=>`<li class="life-event"><button type="button" data-event="${esc(e.id)}"><time>${esc(dateLabel(e))}${e.entry_type==='creation'?' · '+esc(e.creation?.medium||'création'):''}</time><h3>${esc(e.title)}</h3>${e.story?`<p class="life-excerpt">${esc(e.story.slice(0,180))}${e.story.length>180?'…':''}</p>`:''}<div class="life-tags"><span>${esc(e.kind)}</span><span>${esc(e.impact)}</span>${e.themes.map(t=>`<span>${esc(t)}</span>`).join('')}</div></button></li>`).join(''):'<li class="life-empty"><span class="life-seed" aria-hidden="true"></span><h2>Aucune archive.</h2></li>';
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
  const afterSave=()=>session.tree?loadTree(true):session.ctx.navigate('/videographie/archives');
  form.onsubmit=e=>{e.preventDefault();run(form.querySelector('[type=submit]'),async()=>{try{await api('/api/life-tree/events/'+id,{method:'PUT',body:body()});if(draftRevision)await api('/api/life-tree/drafts/'+id,{method:'DELETE',body:{}});session.dirty=false;closeModal();await afterSave();}catch(error){if(error.status===409&&el('life-conflict'))el('life-conflict').hidden=false;throw error;}});};
  bind('life-save-draft',async()=>{const result=await api('/api/life-tree/drafts/'+id,{method:'PUT',body:{revision:draftRevision,event:body(true)}});draftRevision=result.revision;session.dirty=false;status('Brouillon privé enregistré. Il n’est pas partagé avec tes AS.',false,'dialog-status');});
  bind('life-delete-event',async()=>{if(!confirm('Supprimer cet événement et les réponses qui lui sont liées ?'))return;await api('/api/life-tree/events/'+id,{method:'DELETE',body:{revision}});session.dirty=false;closeModal();await afterSave();});
}
function reading(e){return `<div class="life-reading">${e.creation?`<section class="matter-work"><span class="matter-kind">${esc(e.creation.medium)}</span>${e.creation.work?`<p>${esc(e.creation.work)}</p>`:''}${/^https:\/\//.test(e.creation.url||'')?`<a class="private-button quiet" href="${esc(e.creation.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Ouvrir la création</a>`:''}</section>`:''}<p class="private-note">${esc(dateLabel(e))} · ${esc(e.kind)} · ${esc(e.impact)}</p>${[['story','Ce qui s’est passé'],['feelings','Comment je l’ai vécu'],['understanding','Ce que j’en comprends aujourd’hui'],['resources','Ce qui m’aide']].filter(([k])=>e[k]).map(([k,label])=>`<h3>${label}</h3><p>${esc(e[k])}</p>`).join('')}<div class="life-tags">${e.themes.map(t=>`<span>${esc(t)}</span>`).join('')}</div></div>`;}
async function eventDetail(id,owner=session.user){
  const data=await api('/api/life-tree/events/'+id+(owner!==session.user?'?owner='+owner:'')),event=data.event,own=owner===session.user;
  if(event.video_branch)return videoDetail(data,owner);
  modal(event.title,reading(event)+`<ul class="life-detail-list">${data.links.map(l=>`<li><button type="button" data-link-event="${esc(l.source_id===id?l.target_id:l.source_id)}">${esc(l.payload.label)}</button>${own?button('Délier','','subtle',`data-unlink="${esc(l.source_id)}|${esc(l.target_id)}"`):''}</li>`).join('')}</ul><div class="private-actions">${own?button('Modifier','life-edit',''):''}${own&&session.tree?button('Relier à un élément','life-link'):''}</div><div id="life-link-form"></div>`);
  bind('life-edit',()=>eventForm(event));
  const dialog=session.dialog;
  session.dialogCheck=async()=>{const next=await api('/api/life-tree/events/'+id+(owner!==session.user?'?owner='+owner:''));if(session.dialog===dialog&&JSON.stringify(next)!==JSON.stringify(data))await eventDetail(id,owner);};
  session.dialog.querySelectorAll('[data-link-event]').forEach(b=>b.onclick=()=>run(b,()=>eventDetail(b.dataset.linkEvent,owner)));
  session.dialog.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>run(b,async()=>{const [source,target]=b.dataset.unlink.split('|');await api('/api/life-tree/links',{method:'DELETE',body:{source,target}});await eventDetail(id);}));
  bind('life-link',()=>{el('life-link-form').innerHTML=`<label>Élément déjà chargé dans ta chronologie<select id="life-link-target">${session.tree.events.filter(e=>e.id!==id).map(e=>`<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</select></label><label>Le lien que tu perçois<input id="life-link-label" maxlength="200"></label>${button('Enregistrer le lien','life-link-save')}`;bind('life-link-save',async()=>{await api('/api/life-tree/links',{method:'POST',body:{source:id,target:el('life-link-target').value,label:el('life-link-label').value}});await eventDetail(id);});});
}

// The Carré d'AS: four chosen links. Each link opens both videographies, so
// every member's square is their own and holds the people they help.
async function circlePage(){
  shell(`${heading('Carré d’AS')}<p class="square-lead">Choisis jusqu’à quatre AS. Chaque lien est réciproque : vous découvrez la vidéographie l’un de l’autre pour vous aider à avancer.</p><div id="square-view"></div>`);
  session.selectedOwner=Number(/^#as-(\d+)$/.exec(location.hash)?.[1])||null;session.circle=session.initial?.data;
  await squareView(false);
}
const squareMembers=()=>{const own=session.circle.circles.find(c=>c.owner.id===session.user);const unread=new Map(session.circle.circles.filter(c=>c.owner.id!==session.user).map(c=>[c.owner.id,c]));return (own?.members||[]).map(m=>({...m,unread:unread.get(m.id)?.unread||0,reachable:unread.has(m.id)}));};
async function squareView(refresh=true){
  const s=session;if(refresh||!s.circle)s.circle=await api('/api/ace-circles');if(!live(s))return;
  const members=squareMembers();
  if(!members.some(m=>m.id===s.selectedOwner&&m.reachable))s.selectedOwner=members.find(m=>m.reachable)?.id||null;
  const slots=Array.from({length:4},(_,i)=>{
    const m=members.find(m=>m.slot===i+1);
    if(!m)return `<button type="button" class="square-slot is-empty" data-square-add><span class="square-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><strong>Choisir un AS</strong></button>`;
    return `<button type="button" class="square-slot" data-square-member="${m.id}" aria-pressed="${m.id===s.selectedOwner}" ${m.reachable?'':'disabled'}>${avatar(m)}<strong>${esc(m.username)}</strong>${m.unread?`<span class="square-unread" aria-label="${m.unread} nouvelle${m.unread>1?'s':''} réponse${m.unread>1?'s':''}">${m.unread}</span>`:''}${m.reachable?'':'<small>Pas encore à l’échelon 20</small>'}</button>`;
  }).join('');
  el('square-view').innerHTML=`<div class="square-grid" aria-label="Mes AS">${slots}</div><p class="square-count">${members.length} / 4 AS</p>${squareInvitations()}<section id="square-member" class="square-member" ${s.selectedOwner?'':'hidden'}></section>`;
  el('square-view').querySelectorAll('[data-square-add]').forEach(b=>b.onclick=()=>directoryView());
  el('square-view').querySelectorAll('[data-square-member]').forEach(b=>b.onclick=()=>run(b,async()=>{s.selectedOwner=Number(b.dataset.squareMember);history.replaceState(history.state,'','#as-'+s.selectedOwner);el('square-view').querySelectorAll('[data-square-member]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));await memberVideography();}));
  wireInvitations();
  if(s.selectedOwner)await memberVideography();
}
async function memberVideography(){
  const s=session,member=squareMembers().find(m=>m.id===s.selectedOwner),root=el('square-member');if(!member||!root)return;
  clearInlineComments();destroyVideoPlayers(root);root.hidden=false;
  root.innerHTML=`<header class="square-member-head">${avatar(member)}<div><h2>Vidéographie de ${esc(member.username)}</h2><p class="video-section-count" id="video-section-count" aria-live="polite"></p></div>${button('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 11h6"/></svg>','square-remove','subtle',`aria-label="Retirer ${esc(member.username)} de mes AS" title="Retirer cet AS"`)}</header><nav class="video-branches" aria-label="Rubriques de la vidéographie de ${esc(member.username)}">${VIDEO_BRANCHES.map(([key,label])=>`<button type="button" data-video-branch="${key}" aria-pressed="${key==='self'}">${label}</button>`).join('')}</nav><div id="video-list" class="video-grid"></div>${button('Voir la suite','video-more','quiet','hidden')}`;
  s.videos={branch:'self',owner:member.id,events:[],next:null,request:0};
  s.moreObserver?.disconnect();
  if(typeof IntersectionObserver==='function'){s.moreObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&live(s)&&!el('video-more')?.hidden&&!s.videos.loading)el('video-more').click();},{rootMargin:'600px 0px'});s.moreObserver.observe(el('video-more'));}
  bind('video-more',()=>loadVideos());
  root.querySelectorAll('[data-video-branch]').forEach(b=>b.onclick=()=>run(b,async()=>{if(s.videos.branch===b.dataset.videoBranch)return;s.videos.branch=b.dataset.videoBranch;root.querySelectorAll('[data-video-branch]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));await loadVideos(true);}));
  bind('square-remove',()=>{
    modal('Retirer un AS',`<p>Retirer ${esc(member.username)} de tes AS ? Vous n’aurez plus accès à la vidéographie l’un de l’autre ni à vos échanges sur le site.</p><div class="private-actions">${button('Annuler','square-remove-cancel','quiet')}${button('Retirer cet AS','square-remove-confirm','')}</div>`);
    bind('square-remove-cancel',closeModal);bind('square-remove-confirm',async()=>{await api('/api/ace-circles/members/'+member.membershipId,{method:'DELETE',body:{}});closeModal();if(s.selectedOwner===member.id)s.selectedOwner=null;history.replaceState(history.state,'',location.pathname);await squareView();});
  });
  try{await loadVideos(true);}catch(e){if(e.status===403&&live(s)){root.innerHTML='<p class="private-note">Cette vidéographie n’est plus accessible.</p>';return;}throw e;}
  // New replies and access changes are picked up while the page stays open.
  s.poll=async()=>{const current=await api('/api/ace-circles');if(!live(s))return;const before=JSON.stringify(squareMembers().map(m=>[m.id,m.reachable]));s.circle=current;if(JSON.stringify(squareMembers().map(m=>[m.id,m.reachable]))!==before&&!s.dialog?.open)await squareView(false);};schedule();
}
function squareInvitations(){
  const items=session.circle.invitations.map(i=>{const other=i.owner.id===session.user?i.angel:i.owner;return `<article class="square-invitation"><div><strong>${esc(other.username)}</strong><p class="private-note">${i.incoming?'Te propose de devenir AS l’un de l’autre.':'Invitation envoyée, en attente de réponse.'}</p></div><div class="private-actions">${i.incoming?button('Accepter','','',`data-invitation="${esc(i.id)}" data-action="accept"`)+button('Refuser','','subtle',`data-invitation="${esc(i.id)}" data-action="decline"`):button('Annuler','','subtle',`data-invitation="${esc(i.id)}" data-action="cancel"`)}</div></article>`;}).join('');
  const blocks=session.circle.blocks||[];
  return (items?`<section class="square-pending"><h2>Invitations</h2>${items}</section>`:'')+(blocks.length?`<details class="ace-blocked"><summary>Personnes bloquées</summary>${blocks.map(p=>`<div class="square-invitation"><strong>${esc(p.username)}</strong>${button('Débloquer','','subtle',`data-unblock="${p.id}"`)}</div>`).join('')}</details>`:'');
}
function wireInvitations(){
  el('square-view').querySelectorAll('[data-invitation]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/ace-circles/invitations/'+b.dataset.invitation,{method:'PUT',body:{action:b.dataset.action,recipientNotice:true}});await squareView();}));
  el('square-view').querySelectorAll('[data-unblock]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/ace-circles/blocks',{method:'DELETE',body:{target:Number(b.dataset.unblock)}});await squareView();}));
}
const topicKinds={event:'Vécu',creation:'Création',link:'Lien',mechanism:'Mécanisme'};
const shortDate=value=>new Date(value.replace(' ','T')+'Z').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
function mechanismReading(value){const m=normalizeMechanism(value.slot,value);return `<div class="mechanism-reading">${mechanismFields(value.slot).filter(([key])=>m[key]).map(([key,label])=>`<section><h2>${label}</h2><p>${esc(m[key])}</p></section>`).join('')}</div>`;}
async function topicPage(id){
  const data=await api('/api/ace-circles/topics/'+id),thread=session.thread={id,topic:data.topic,replies:[],last:0,first:0,more:false,parent:null,requestId:uid(),busy:false,revision:data.revision,membership:data.membership};session.tab='thread';
  shell(`<a class="private-back" href="${data.topic.owner===session.user?'/videographie':'/carre-d-as#as-'+data.topic.owner}" data-link>${data.topic.owner===session.user?'Revenir à mes vidéos':'Revenir au carré'}</a><article class="topic-thread ace-chat"><span class="topic-kind">${esc(data.topic.videoBranch?videoLabel(data.topic.videoBranch):topicKinds[data.topic.kind])}</span>${heading(esc(data.topic.title))}<div class="topic-source" id="topic-source"></div><div class="topic-replies" id="topic-replies" role="log" aria-live="polite" aria-relevant="additions"></div>${button('Voir les nouvelles réponses','topic-new','quiet','hidden')}<form id="topic-compose" class="ace-composer" ${data.topic.archived?'hidden':''}><p id="topic-reply-to" class="ace-reply" hidden></p><label class="sr-only" for="topic-text">Ta réponse</label><textarea id="topic-text" maxlength="4000" required rows="3" placeholder="Ton regard sur ce partage…"></textarea><div class="private-actions">${button('Annuler la réponse','topic-cancel','subtle','hidden')}<span></span><button class="private-button" type="submit">Répondre</button></div></form></article>`);
  const showSource=()=>{
    const t=thread.topic;
    destroyVideoPlayers(el('topic-source'));
    el('topic-source').innerHTML=t.video?`${eventVideoPlayer({id:t.eventId,title:t.title,creation:t.video},false,false,t.owner)}<div class="life-reading">${t.video.notes?`<p>${esc(t.video.notes)}</p>`:''}${t.video.understanding?`<h3>À approfondir</h3><p>${esc(t.video.understanding)}</p>`:''}</div>`:t.kind==='mechanism'?mechanismReading(t.mechanism):`${t.kind==='link'?`<p class="life-reading">${esc(t.link)}</p>`:''}<div class="private-actions">${button(t.kind==='creation'?'Voir la création':t.kind==='link'?'Voir le premier élément':'Voir l’événement','topic-event','quiet')}${t.targetId?button('Voir le second élément','topic-target','quiet'):''}</div>`;
    wireVideoPlayers(el('topic-source'),()=>api('/api/ace-circles/topics/'+id));
    bind('topic-event',()=>eventDetail(t.eventId,t.owner));bind('topic-target',()=>eventDetail(t.targetId,t.owner));
  };
  showSource();
  const cancel=()=>{thread.parent=null;el('topic-reply-to').hidden=true;el('topic-cancel').hidden=true;};bind('topic-cancel',cancel);
  function markup(m){const parent=thread.replies.find(r=>r.id===m.parentId);return `<article class="ace-message topic-reply ${m.author.id===session.user?'is-self':''} ${m.parentId?'is-reply':''}" data-message="${m.id}"><header><strong>${esc(m.author.username)}</strong><time>${esc(shortDate(m.createdAt))}</time></header>${m.parentId?`<small class="private-note">En réponse à ${esc(parent?.author.username||'une réponse précédente')}</small>`:''}<p>${esc(m.text)}</p><div class="private-actions">${thread.topic.archived?'':button('Répondre','','subtle',`data-reply="${m.id}"`)}${m.author.id===session.user?button('Supprimer','','subtle',`data-remove-reply="${m.id}"`):button('Signaler','','subtle',`data-report-reply="${m.id}"`)}</div></article>`;}
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
      if(!thread.topic.archived&&thread.last&&(follow||viewport.atEnd()))await api('/api/ace-circles/topics/'+id+'/read',{method:'PUT',body:{lastId:thread.last}});
    }finally{thread.busy=false;}
  }
  thread.replies=data.replies;thread.more=data.more;render();bind('topic-new',async()=>{await refresh(true,true);el('topic-new').hidden=true;});
  const form=el('topic-compose');form.oninput=()=>{session.dirty=!!el('topic-text').value;};form.onsubmit=e=>{e.preventDefault();run(form.querySelector('[type=submit]'),async()=>{await api('/api/ace-circles/topics/'+id+'/replies',{method:'POST',body:{id:thread.requestId,text:el('topic-text').value,parentId:thread.parent}});thread.requestId=uid();el('topic-text').value='';session.dirty=false;cancel();await refresh(false,true);});};
  session.poll=()=>refresh();schedule();
}

async function directoryView(){
  modal('Choisir un AS',`<p class="private-note">Saisis le pseudo exact d’une personne qui a atteint l’échelon 20. Si elle accepte, vous devenez AS l’un de l’autre et chacun peut découvrir la vidéographie de l’autre.</p><form id="ace-search" class="ace-search"><label>Pseudo<input name="q" required minlength="3" maxlength="30" autocomplete="off" placeholder="Son pseudo exact"></label><button class="private-button" type="submit">Rechercher</button></form><div id="ace-directory" class="ace-search-results" aria-live="polite"></div>`);
  const dialog=session.dialog;
  el('ace-search').onsubmit=e=>{e.preventDefault();const search=e.target.elements.q.value.trim();run(e.target.querySelector('button'),async()=>{const data=await api('/api/ace-circles/directory?q='+encodeURIComponent(search));if(session.dialog!==dialog)return;el('ace-directory').innerHTML=data.people.map(p=>`<article class="ace-person"><header>${avatar(p)}<h3>${esc(p.username)}</h3></header>${button('Inviter','','',`data-invite="${p.id}"`)}</article>`).join('')||'<p class="private-note">Aucune personne disponible avec ce pseudo. Vérifie son orthographe, vos invitations en attente ou ses places libres.</p>';el('ace-directory').querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/ace-circles/invitations',{method:'POST',body:{target:Number(b.dataset.invite),direction:'invite',id:uid(),recipientNotice:true}});closeModal();await squareView();}));});};
}

async function reportsPage(){
 const data=await api('/api/private/reports');shell(heading('Signalements','Uniquement les messages et motifs transmis volontairement. Aucun arbre de vie n’est consultable ici.')+data.reports.map(r=>`<article class="private-panel private-consent"><h2>${esc(r.subject||'Compte supprimé')}</h2><p class="private-note">Signalé par ${esc(r.reporter)} · ${esc(r.date)}</p><div class="life-reading"><h3>Message transmis</h3><p>${esc(r.message)}</p><h3>Motif</h3><p>${esc(r.reason)}</p></div><div class="private-actions">${button('Marquer comme traité','','quiet',`data-resolve="${esc(r.id)}"`)}</div></article>`).join('')+(data.reports.length?'':'<p class="private-note">Aucun signalement en attente.</p>'));
 document.querySelectorAll('[data-resolve]').forEach(b=>b.onclick=()=>run(b,async()=>{await api('/api/private/reports',{method:'PUT',body:{id:b.dataset.resolve}});await reportsPage();}));
}

async function mechanismPage(slot){
  if(!slot){
    const {mechanisms}=await api('/api/mechanisms');
    const group=(title,items)=>`<section class="mechanism-group"><h2 class="mechanism-group-title">${title}</h2><div class="mechanism-grid">${items.map(m=>`<a class="mechanism-card ${m.title?'is-written':''}" href="/mecanisme/${m.slot}" data-link><span class="mechanism-number">${String(m.slot).padStart(2,'0')}</span><h3>${m.title?esc(m.title):'À écrire'}</h3>${m.anchor?`<p>${esc(m.anchor)}</p>`:''}</a>`).join('')}</div></section>`;
    shell(`${heading('Mécanismes','','','/mecanisme')}${group('Mécanismes choisis',mechanisms.slice(0,5))}${group('Mécanismes innés',mechanisms.slice(5))}`);return;
  }
  const {mechanism:m}=await api('/api/mechanisms/'+slot);
  shell(`<a class="private-back" href="/mecanisme" data-link>Mécanismes</a><article class="mechanism-detail"><p class="mechanism-index">${slot<=5?'Mécanisme choisi':'Mécanisme inné'} · ${String(slot).padStart(2,'0')}</p>${heading(m.title?esc(m.title):'Une place à écrire')}${m.anchor?`<blockquote>${esc(m.anchor)}</blockquote>`:''}<div class="mechanism-reading">${mechanismFields(slot).filter(([key])=>key!=='anchor'&&m[key]).map(([key,label])=>`<section><h2>${label}</h2><p>${esc(m[key])}</p></section>`).join('')}</div></article><nav class="mechanism-pagination" aria-label="Mes mécanismes">${slot>1?`<a href="/mecanisme/${slot-1}" data-link>Précédent</a>`:'<span></span>'}${button(m.title?'Modifier':'Écrire','mechanism-edit','quiet')}${slot<10?`<a href="/mecanisme/${slot+1}" data-link>Suivant</a>`:'<span></span>'}</nav>`);
  bind('mechanism-edit',async()=>{if(await consent())mechanismForm(m);});
}
function mechanismForm(m){
  let revision=m.revision;
  modal(m.slot<=5?'Mécanisme choisi':'Mécanisme inné',`<form id="mechanism-form"><label>Mon mécanisme<input name="title" required maxlength="140" value="${esc(m.title)}"></label>${mechanismFields(m.slot).map(([key,label,max])=>`<label>${label}<textarea name="${key}" maxlength="${max}" rows="${key==='anchor'?2:7}">${esc(m[key]||'')}</textarea></label>`).join('')}<div class="private-actions form-actions"><button class="private-button" type="submit">Enregistrer</button>${button('Vider cet emplacement','mechanism-clear','subtle')}</div><div id="mechanism-conflict" hidden>${button('Comparer la version enregistrée','mechanism-compare','quiet')}<div id="mechanism-current"></div></div></form>`);
  const form=el('mechanism-form');form.oninput=()=>{session.dirty=true;};
  const save=async data=>{try{await api('/api/mechanisms/'+m.slot,{method:'PUT',body:{...data,format:2,revision}});session.dirty=false;closeModal();await mechanismPage(m.slot);}catch(e){if(e.status===409)el('mechanism-conflict').hidden=false;throw e;}};
  form.onsubmit=e=>{e.preventDefault();run(form.querySelector('[type=submit]'),()=>save(Object.fromEntries(new FormData(form))));};
  bind('mechanism-clear',async()=>{if(confirm('Vider cet emplacement ? Tu pourras y écrire un nouveau mécanisme.'))await save({title:'',description:'',improvement:'',anchor:''});});
  bind('mechanism-compare',async()=>{const {mechanism:current}=await api('/api/mechanisms/'+m.slot);el('mechanism-current').innerHTML=`<section class="private-panel"><h3>${esc(current.title)}</h3>${mechanismReading(current)}<p class="private-note">Ta saisie reste dans le formulaire. Tu peux choisir de remplacer la version ci-dessus par ta saisie.</p>${button('Conserver ma saisie','mechanism-keep','quiet')}</section>`;bind('mechanism-keep',()=>{revision=current.revision;el('mechanism-conflict').hidden=true;status('Tu peux maintenant enregistrer ta saisie.',false,'dialog-status');});});
}
