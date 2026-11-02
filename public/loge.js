import {createLogeCommentViewport} from './loge-comment-viewport.js';
import {LOGE_THEMES_ENABLED} from './loge-features.js';
import {youtubeId} from './youtube-video.js';
import {createLogeVideoFeed} from './loge-video.js';
import {themeOverviewMarkup,proposalMarkup,historyMarkup} from './loge-themes-ui.js';

let session=null;
const drafts=new Map();
const base='/loge-virtuelle';
const memberPath=id=>`${base}/membres/${encodeURIComponent(id)}`;
const themePath=id=>base+'/theme'+(id?'?theme='+encodeURIComponent(id):'');
const postPath=id=>`${base}/publications/${encodeURIComponent(id)}`;
const live=s=>!!s&&session===s&&!s.closed&&!s.blocked&&!s.controller.signal.aborted&&s.ctx.isCurrent()&&String(s.ctx.state.user?.id)===String(s.user);
const esc=value=>session.ctx.esc(String(value??''));
const own=record=>String(record.author?.id)===String(session.user);
const node=id=>document.getElementById(id);
const statusMarkup=id=>`<p id="${id}" class="loge-status" role="status" aria-live="polite"></p>`;
const button=(label,attributes='',quiet=false)=>`<button type="button" class="loge-button${quiet?' is-quiet':''}" ${attributes}>${label}</button>`;

function dateValue(value){
  if(!value)return null;
  const time=typeof value==='number'?value:Date.parse(value);
  return Number.isFinite(time)?new Date(time):null;
}
function dateLabel(value){const date=dateValue(value);return date?date.toLocaleString('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';}
function stamp(value){return dateValue(value)?`<time datetime="${esc(value)}">${esc(dateLabel(value))}</time>`:'';}
function author(person){
  const avatar=typeof person?.avatar==='string'&&/^\/api\/(?:loge|roadmap)\//.test(person.avatar)?`<img src="${esc(person.avatar)}" alt="" loading="lazy" decoding="async">`:esc(person?.username?.slice(0,1)||'·');
  return `<a class="loge-author" href="${memberPath(person.id)}" data-link><span class="loge-avatar" aria-hidden="true">${avatar}</span><span>${esc(person.username)}</span></a>`;
}
function notice(id,message,error=false){const el=node(id);if(el){el.textContent=message;el.classList.toggle('is-error',error);}}
function heading(title,actions=''){return `<header class="loge-heading"><h1>${esc(title)}</h1>${actions?`<nav class="loge-actions" aria-label="Actions de la Loge">${actions}</nav>`:''}</header>`;}
function videoView(view){return logeView(view);}
function logeView(view){return !!view&&['feed','profile','post','theme'].includes(view.kind);}
function siteHeaderSize(){const header=document.querySelector('.site-header'),height=header?.getBoundingClientRect?.().height;document.body.style.setProperty('--loge-site-header-height',(height>0?Math.ceil(height):77)+'px');}
function menuState(s){
  if(!live(s))return;const open=document.body.classList.contains('nav-open');if(open===s.navOpen)return;s.navOpen=open;
  if(open){const view=s.current;s.menuPaused={view,player:view?.player,version:s.navigationVersion};view?.player?.pause();}
  else{const saved=s.menuPaused;s.menuPaused=null;const view=s.current;if(view&&saved?.player&&saved.view===view&&saved.player===view.player&&saved.version===s.navigationVersion&&!view.editingId&&node('loge-compose')?.hidden)saved.player?.resume();}
}
function immersion(enabled){
  const active=document.body.classList.contains('loge-immersive');
  if(enabled&&!active)window.WCPlayer?.pause();
  document.body.classList.toggle('loge-immersive',!!enabled);
  if(enabled)siteHeaderSize();else document.body.style.removeProperty?.('--loge-site-header-height');
}
function icon(kind){
  const paths={home:'<path d="m3 10 9-7 9 7v10H7V10m2 10v-6h6v6"/>',back:'<path d="m14 5-7 7 7 7"/>',profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',plus:'<path d="M12 4v16M4 12h16"/>',comment:'<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind]||''}</svg>`;
}
function shell(html){
  const view=session.current,root=document.createElement('section');root.className='loge-page'+(logeView(view)?' is-loge-layout':'')+(videoView(view)?' is-video-view':'')+(view.kind==='feed'?' is-feed':'');
  root.innerHTML=html+statusMarkup('loge-status');view.root=root;session.ctx.app.replaceChildren(root);
}
function topbar(view){const other=view.kind==='profile'&&String(view.memberId)!==String(session.user);return `<header class="loge-topbar"><h1>${esc(other?view.member.username:'Loge virtuelle')}</h1><button type="button" class="loge-publish" id="loge-open-compose" aria-label="Publier" aria-controls="loge-compose">${icon('plus')}<span>Publier</span></button></header>`;}
function composerMarkup(){return '<section id="loge-compose" class="loge-compose loge-composer-sheet" role="dialog" aria-modal="true" aria-labelledby="loge-compose-title" hidden></section>';}
function logeNavigation(view){
  const ownProfile=view.kind==='profile'&&String(view.memberId)===String(session.user),active=view.kind==='theme'?'theme':ownProfile&&view.tab==='reflexions'?'reflexions':'loge';
  return `<nav class="loge-tabs" aria-label="Navigation de la Loge">${[['loge','Loge Virtuelle',base],['reflexions','Mes réflexions',memberPath(session.user)+'?onglet=reflexions'],...(LOGE_THEMES_ENABLED?[['theme','Thème',themePath()]]:[])].map(([tab,label,href])=>`<a href="${href}" data-link ${active===tab?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
function login(s){
  if(!live(s))return;
  closeVideo(s);immersion(false);s.blocked=true;
  s.ctx.navigate('/connexion?retour='+encodeURIComponent(location.pathname+location.search),true);
}
function deny(s,error){
  if(!live(s))return;
  closeVideo(s);immersion(false);s.blocked=true;s.controller.abort();
  s.ctx.app.innerHTML=`<section class="loge-page">${heading('Loge virtuelle')}<p class="loge-empty">${s.ctx.esc(error.message||'Cet espace n’est pas encore accessible dans ton parcours.')}</p><a href="/echelon" data-link>Retrouver les échelons</a></section>`;
}
function savedDraft(user,path,options,result){
  const body=options.body||{},prefix=String(user)+':',same=(draft,names)=>names.every(name=>String(draft[name]??'').trim()===String(body[name]??'').trim());
  const post=/^\/api\/loge\/posts\/([1-9]\d*)$/.exec(path),comment=/^\/api\/loge\/comments\/([1-9]\d*)$/.exec(path),thread=/^\/api\/loge\/posts\/([1-9]\d*)\/comments$/.exec(path);
  if(options.method==='POST'&&(path==='/api/loge/posts'||thread)){
    const key=prefix+(thread?'create-comment-'+thread[1]:'create-post'),draft=drafts.get(key);
    if(draft&&draft.requestId===body.requestId){
      const unchanged=same(draft,thread?['body']:['title'])&&(thread||youtubeId(draft.url)===youtubeId(body.url)&&String(draft.themeWeek||'')===String(body.themeWeek||''));
      if(thread){if(unchanged)draft.body='';draft.requestId=crypto.randomUUID();}
      else if(unchanged)drafts.delete(key);else draft.requestId=crypto.randomUUID();
    }
  }else if(options.method==='PUT'&&(post||comment)){
    const key=prefix+(post?'post-':'comment-')+(post||comment)[1],draft=drafts.get(key),record=post?result.post:result.comment;
    if(draft&&record){if(same(draft,post?['title']:['body']))drafts.delete(key);else draft.revision=Math.max(Number(draft.revision)||0,record.revision);}
  }else if(options.method==='DELETE'&&(post||comment)){
    drafts.delete(prefix+(post?'post-':'comment-')+(post||comment)[1]);if(post)drafts.delete(prefix+'create-comment-'+post[1]);
  }
}
function lateMutation(owner,path,options,result){
  savedDraft(owner.user,path,options,result);
  const active=session;if(!live(active)||String(active.user)!==String(owner.user))return;
  const previous=dateValue(active.nextPublicationAt),incoming=dateValue(result.nextPublicationAt);
  acceptSelf({...result,...('nextPublicationAt' in result?{nextPublicationAt:previous&&(!incoming||previous>incoming)?active.nextPublicationAt:result.nextPublicationAt}:{})});
  for(const view of active.views.values()){view.dirty=true;view.version++;for(const panel of view.panels.values())panel.dirty=true;}updateQuota();
}
async function request(path,options={},scope={}){
  const s=session,view=scope.view||s?.current,version=view?.version,panel=view?.activePanel;if(!live(s))throw new DOMException('Navigation','AbortError');
  try{
    const result=await s.ctx.api(path,{...options,headers:{...options.headers,'X-WC-User':String(s.user)},signal:s.controller.signal});
    const stale=!live(s)||view?.destroyed||view?.version!==version||(!scope.background&&s.current!==view)||(!scope.background&&path.includes('/comments')&&panel!==view?.activePanel);
    if(stale){if(['POST','PUT','DELETE'].includes(options.method))lateMutation(s,path,options,result);throw new DOMException('Navigation','AbortError');}return result;
  }catch(error){if(session===s){if(error.status===401)login(s);else if(error.status===403)deny(s,error);}throw error;}
}
function acceptSelf(result){
  const s=session;
  if(result.self&&String(result.self.id)!==String(s.user)){login(s);throw new DOMException('Compte changé','AbortError');}
  if(result.self)s.self=result.self;
  const incomingTheme='currentTheme' in result?result.currentTheme:'current' in result&&'nextWeek' in result?result.current:null;
  if(LOGE_THEMES_ENABLED&&incomingTheme&&(!s.currentTheme||incomingTheme.week>=s.currentTheme.week))s.currentTheme=incomingTheme;
  if('nextPublicationAt' in result)s.nextPublicationAt=result.nextPublicationAt;
  const server=dateValue(result.serverNow);if(server)s.clockOffset=server.getTime()-Date.now();
  armThemeBoundary(s);
}
function updateQuota(){
  const s=session;if(!live(s))return;clearTimeout(s.quotaTimer);
  const until=dateValue(s.nextPublicationAt),remaining=until?until.getTime()-Date.now()-s.clockOffset:0;
  const blocked=remaining>0;
  const text=blocked?`Tu pourras publier une nouvelle réflexion le ${dateLabel(s.nextPublicationAt)}.`:'Tu peux publier une réflexion. Une publication est possible tous les sept jours.';
  const quota=node('loge-quota');if(quota){quota.textContent=text;quota.hidden=!blocked&&!!node('loge-compose')?.hidden;}
  const submit=node('loge-new-submit');if(submit&&!submit.closest('form')?.dataset.busy)submit.disabled=blocked;
  const open=node('loge-open-compose');if(open){open.disabled=false;open.setAttribute('title',blocked?text:'Publier');}
  if(blocked)s.quotaTimer=setTimeout(updateQuota,Math.min(remaining+50,2147483647));
}
function getDraft(key,initial){
  const full=session.user+':'+key;
  if(!drafts.has(full))drafts.set(full,{...initial,requestId:crypto.randomUUID()});
  if(key==='create-post'||key.startsWith('post-'))delete drafts.get(full).description;
  while(drafts.size>40)drafts.delete(drafts.keys().next().value);
  return drafts.get(full);
}
function forgetDraft(key){drafts.delete(session.user+':'+key);}
function readFields(form,draft,names){for(const name of names){const control=form.elements.namedItem(name);if(control)draft[name]=control.value;}}
function rememberFields(form,draft,names){
  for(const name of names){const control=form.elements.namedItem(name);if(control)control.addEventListener('input',()=>{draft[name]=control.value;});}
}
function setBusy(container,busy){
  if(!container)return;
  container.dataset.busy=busy?'true':'';
  for(const el of [container,...container.querySelectorAll('button,input,textarea')].filter(el=>typeof el.disabled==='boolean')){
    if(busy){el.dataset.logeDisabled=String(el.disabled);el.disabled=true;}
    else{el.disabled=el.dataset.logeDisabled==='true';delete el.dataset.logeDisabled;}
  }
}
async function perform(key,container,work,onError){
  const s=session,view=s?.current,version=view?.version,panel=view?.activePanel;if(!live(s)||s.pending.has(key))return;
  s.pending.add(key);setBusy(container,true);
  try{await work();}
  catch(error){if(live(s)&&s.current===view&&view.version===version&&view.activePanel===panel&&error.name!=='AbortError'){if(error.status===429&&error.data){acceptSelf(error.data);updateQuota();}if(onError)await onError(error);else notice('loge-status',error.message,true);}}
  finally{s.pending.delete(key);if(live(s)){setBusy(container,false);if(s.current===view&&view.version===version)updateQuota();}}
}

function videoMarkup(post){return `<div class="loge-reel-media" id="loge-video-${esc(post.id)}" data-video-post="${esc(post.id)}"></div><div class="loge-timeline" id="loge-timeline-${esc(post.id)}" hidden><input type="range" min="0" max="0" step="0.1" value="0" aria-label="Position dans la vidéo" disabled><span data-video-time>0:00 / 0:00</span></div>`;}
function canManagePosts(){const view=session.current;return view.kind==='profile'&&view.tab==='reflexions'&&String(view.memberId)===String(session.user);}
function closeVideo(s=session){for(const view of s?.views?.values()||[]){view.player?.destroy();view.player=null;view.paginationObserver?.disconnect();view.paginationObserver=null;}}
function bindVideo(id){const view=session.current,post=view.posts.get(String(id)),container=node('loge-video-'+id);if(view.player&&post&&container)view.player.add(post,container,node('loge-timeline-'+post.id));}
function initMedia(view){
  const s=session;if(!live(s)||s.current!==view)return;
  view.player?.destroy();view.player=createLogeVideoFeed({root:videoView(view)?viewScroller(view):null,isCurrent:()=>live(s)&&s.current===view&&!view.destroyed,onError:()=>{}});
  for(const post of view.posts.values()){const container=view.root.querySelector('[data-video-post="'+post.id+'"]');if(container)view.player.add(post,container,node('loge-timeline-'+post.id));}
  refreshLayout(view);
}
function viewScroller(view){return view?.root?.querySelector('.loge-reels')||view?.root?.querySelector('.loge-themes-scroll')||view?.root?.querySelector('.loge-feed');}
function refreshLayout(view){
  if(!view||!live(session)||session.current!==view)return;
  const reels=view.root?.querySelector('.loge-reels');
  if(reels?.getBoundingClientRect){const top=reels.getBoundingClientRect().top,height=Math.max(200,(window.innerHeight||800)-Math.max(0,top));reels.style.setProperty('--loge-reel-height',height+'px');}
  view.player?.refresh();
}
function ownerMenu(kind,id){return `<details class="loge-menu"><summary aria-label="Options de ${kind==='post'?'la publication':'ton commentaire'}">…</summary><div>${button('Modifier',`data-${kind}-edit="${esc(id)}"`,true)}${button('Supprimer',`data-${kind}-delete="${esc(id)}"`,true)}</div></details>`;}
function postMarkup(post){
  const manage=own(post)&&canManagePosts(),count=Number.isInteger(post.commentCount)?post.commentCount:0;
  return `<article class="loge-publication loge-reel" id="loge-post-${esc(post.id)}" data-post-id="${esc(post.id)}"><div class="loge-reel-stage">${videoMarkup(post)}<footer class="loge-reel-info"><div class="loge-reel-copy"><div class="loge-reel-byline"><a class="loge-reel-username" href="${memberPath(post.author.id)}" data-link>${esc(post.author.username)}</a>${manage?ownerMenu('post',post.id):''}</div><h2 class="loge-post-title" id="loge-post-title-${esc(post.id)}"><a href="${postPath(post.id)}" data-link>${esc(post.title)}</a></h2>${LOGE_THEMES_ENABLED&&post.theme?`<a class="loge-post-theme" href="${themePath(post.theme.id)}" data-link>${esc(post.theme.title)}</a>`:''}${statusMarkup('loge-post-status-'+post.id)}</div><div class="loge-reel-actions" role="group" aria-label="Actions de la vidéo"><button type="button" class="loge-reel-icon" data-comments-open="${esc(post.id)}" aria-label="Commentaires (${count})" aria-expanded="false">${icon('comment')}<small data-comment-count>${count}</small></button></div><div class="loge-intervention-context" id="loge-interventions-post-${esc(post.id)}" hidden></div></footer></div><div class="loge-reel-discussion" id="loge-panel-slot-${esc(post.id)}" hidden></div>${manage?`<div id="loge-post-editor-${esc(post.id)}" class="loge-edit-sheet" role="dialog" aria-modal="true" aria-label="Modifier le titre" hidden></div>`:''}</article>`;
}
function removeProfileClip(postId){
  const view=session.current,list=node('loge-profile-list');if(!list)return;
  if(String(view.activePanel?.postId)===String(postId))closeDiscussion();
  const cards=[...list.querySelectorAll('[data-post-id]')],index=cards.findIndex(card=>String(card.dataset.postId)===String(postId)),next=cards[index+1]||cards[index-1];
  view.player?.remove(postId);view.posts.delete(String(postId));node('loge-post-'+postId)?.remove();next?.scrollIntoView({block:'start',behavior:'auto'});
  if(!view.posts.size)list.insertAdjacentHTML('afterbegin',`<p class="loge-empty" id="loge-profile-empty">${view.tab==='interventions'?'Aucune intervention pour le moment.':'Aucune vidéo en favori.'}</p>`);
  view.player?.refresh();
}
function updatePost(post){
  const s=session;s.posts.set(String(post.id),post);
  const title=node('loge-post-title-'+post.id);
  if(title){const link=title.querySelector('a');(link||title).textContent=post.title;}
  commentCount(post.id,0);

  if(s.view==='post')document.title=post.title+' · Loge virtuelle · White Cadae';
}
function insertPost(post,list,detail=false){
  const s=session;if(s.posts.has(String(post.id))&&node('loge-post-'+post.id)){updatePost(post);return;}
  s.posts.set(String(post.id),post);
  const before=['favoris','interventions'].includes(s.current.tab)?null:[...list.querySelectorAll('[data-post-id]')].find(el=>Number(el.dataset.postId)<Number(post.id));
  if(before)before.insertAdjacentHTML('beforebegin',postMarkup(post,detail));else{const end=list.querySelector('.loge-feed-pagination');if(end)end.insertAdjacentHTML('beforebegin',postMarkup(post,detail));else list.insertAdjacentHTML('beforeend',postMarkup(post,detail));}
  bindVideo(post.id);
  const card=node('loge-post-'+post.id);
  card.querySelector('[data-comments-open]')?.addEventListener('click',()=>openDiscussion(post.id));
  card.querySelector('[data-post-edit]')?.addEventListener('click',()=>openPostEdit(post.id));
  card.querySelector('[data-post-delete]')?.addEventListener('click',()=>deletePost(post.id));
}
function postFields(draft,create=false){return `<label>Titre<input name="title" required maxlength="140" value="${esc(draft.title)}" autocomplete="off"></label>${create?`<label>Vidéo YouTube<input name="url" type="url" required maxlength="2048" value="${esc(draft.url)}" placeholder="Colle le lien de ta vidéo" inputmode="url" autocomplete="off"></label>${LOGE_THEMES_ENABLED?`<div id="loge-theme-choice-slot">${themeChoiceMarkup(draft)}</div>`:''}`:''}`;}
function composerVisibility(open){
  const view=session.current,root=node('loge-compose');if(!root)return;root.hidden=!open;view.root.classList.toggle('has-compose',open);
  if(open)view.player?.pause();else if(!view.editingId&&!document.body.classList.contains('nav-open'))view.player?.resume();updateQuota();
}
function closePostEditor(id){const view=session.current,root=node('loge-post-editor-'+id);if(root)root.hidden=true;view.editingId=null;view.root.classList.remove('has-editor');if(node('loge-compose')?.hidden&&!document.body.classList.contains('nav-open'))view.player?.resume();node('loge-post-'+id)?.querySelector('summary')?.focus({preventScroll:true});}
function openComposer(){
  const s=session;if(!live(s))return;
  const root=node('loge-compose');if(!root)return;
  if(root.innerHTML){composerVisibility(root.hidden);return;}
  const draft=getDraft('create-post',{title:'',url:'',themeWeek:null});
  composerVisibility(true);root.innerHTML=`<h2 id="loge-compose-title">Publier une réflexion</h2><p id="loge-quota" class="loge-note"></p><form id="loge-new-form">${postFields(draft,true)}<div class="loge-form-actions"><button class="loge-button" type="submit" id="loge-new-submit">Publier</button>${button('Fermer','data-compose-close',true)}</div>${statusMarkup('loge-new-status')}</form>`;
  const form=node('loge-new-form');rememberFields(form,draft,['title','url']);syncComposerTheme();
  if(session.currentTheme?.endsAt*1000<=Date.now()+session.clockOffset)void refreshThemeBoundary(session);
  form.querySelector('[data-compose-close]').onclick=()=>{composerVisibility(false);node('loge-open-compose')?.focus({preventScroll:true});};
  form.onsubmit=event=>{
    event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['title','url']);
    const url=form.elements.namedItem('url').value.trim();if(!youtubeId(url)){notice('loge-new-status','Utilise un lien vidéo YouTube valide.',true);return;}
    perform('create-post',form,async()=>{
      const choice=form.elements.namedItem('themeWeek');draft.themeWeek=choice?.checked?choice.value:null;
      const result=await request('/api/loge/posts',{method:'POST',body:{title:draft.title.trim(),url,requestId:draft.requestId,...(draft.themeWeek?{themeWeek:draft.themeWeek}:{})}});
      acceptSelf(result);invalidateOtherViews();forgetDraft('create-post');root.innerHTML='';composerVisibility(false);
      const list=node('loge-feed')||(canManagePosts()?node('loge-profile-list'):session.current.kind==='theme'&&session.current.selectedTheme&&result.post.theme&&String(session.current.selectedTheme.id)===String(result.post.theme.id)?node('loge-theme-posts'):null);if(list){node('loge-feed-empty')?.remove();node('loge-profile-empty')?.remove();node('loge-theme-posts-empty')?.remove();insertPost(result.post,list);node('loge-post-'+result.post.id)?.scrollIntoView({block:'start'});}
      notice('loge-status','Ta réflexion est publiée.');updateQuota();
    },error=>{notice('loge-new-status',error.message,true);if(error.status===409&&/thème|semaine/i.test(error.message))void refreshThemeBoundary(session);});
  };
  updateQuota();form.elements.namedItem('title').focus({preventScroll:true});
}
async function currentPost(id){const data=await request('/api/loge/posts/'+encodeURIComponent(id));acceptSelf(data);updatePost(data.post);updateQuota();return data.post;}
async function currentComment(comment){
  const data=await request(`/api/loge/posts/${encodeURIComponent(comment.postId)}/comments?focus=${encodeURIComponent(comment.id)}`);
  const found=data.comments.find(item=>String(item.id)===String(comment.id));
  if(!found)throw Object.assign(Error('Ce commentaire n’est plus disponible.'),{status:404});
  session.comments.set(String(found.id),found);updateComment(found);return found;
}
function conflict(form,kind,id,draft){
  const s=session,old=form.querySelector('.loge-conflict');old?.remove();
  form.insertAdjacentHTML('beforeend',`<div class="loge-conflict" role="status"><p>Cette ${kind==='post'?'publication':'réponse'} a été modifiée sur un autre appareil. Ton texte est conservé.</p><div class="loge-form-actions">${button('Charger la version actuelle','data-conflict-load',true)}${button('Conserver mon texte','data-conflict-keep',true)}</div></div>`);
  const box=form.querySelector('.loge-conflict');
  for(const action of ['load','keep'])box.querySelector('[data-conflict-'+action+']').onclick=()=>perform('resolve-'+kind+'-'+id,box,async()=>{
    const record=kind==='post'?await currentPost(id):await currentComment(s.comments.get(String(id)));
    draft.revision=record.revision;
    if(action==='load'){
      for(const field of kind==='post'?['title']:['body']){draft[field]=record[field];form.elements.namedItem(field).value=record[field];}
    }
    box.remove();notice(kind==='post'?'loge-post-edit-status-'+id:'loge-comment-edit-status-'+id,action==='keep'?'La version actuelle est chargée. Vérifie ton texte conservé avant de l’enregistrer.':'La version actuelle est chargée.');
  },error=>notice(kind==='post'?'loge-post-edit-status-'+id:'loge-comment-edit-status-'+id,error.message,true));
}
function openPostEdit(id){
  const post=session.posts.get(String(id));if(!canManagePosts()||!post||!own(post))return;
  node('loge-post-'+id)?.querySelector('details')?.removeAttribute('open');
  const root=node('loge-post-editor-'+id);if(root.innerHTML&&!root.hidden){closePostEditor(id);return;}
  session.current.editingId=id;session.current.root.classList.add('has-editor');session.current.player?.pause();
  if(root.innerHTML){root.hidden=false;root.querySelector('input')?.focus({preventScroll:true});return;}
  const draft=getDraft('post-'+id,{title:post.title,revision:post.revision});
  root.hidden=false;root.innerHTML=`<form class="loge-edit-form">${postFields(draft)}<div class="loge-form-actions"><button class="loge-button" type="submit">Enregistrer</button>${button('Fermer','data-edit-close',true)}</div>${statusMarkup('loge-post-edit-status-'+id)}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['title']);form.querySelector('[data-edit-close]').onclick=()=>closePostEditor(id);form.elements.namedItem('title').focus({preventScroll:true});
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['title']);perform('post-'+id,form,async()=>{
    const result=await request('/api/loge/posts/'+encodeURIComponent(id),{method:'PUT',body:{title:draft.title.trim(),revision:draft.revision}});
    acceptSelf(result);invalidateOtherViews();updatePost(result.post);forgetDraft('post-'+id);root.innerHTML='';closePostEditor(id);notice('loge-post-status-'+id,'Ta réflexion est mise à jour.');
  },error=>{notice('loge-post-edit-status-'+id,error.message,true);if(error.status===409&&error.data?.conflict)conflict(form,'post',id,draft);});};
}
function refreshAfterConflict(kind,id,error){
  const target=kind==='post'?'loge-post-status-'+id:'loge-comment-status-'+id;
  notice(target,error.message,true);if(error.status!==409||!error.data?.conflict)return;
  const box=node(target);box.insertAdjacentHTML('beforeend',button('Charger la version actuelle','data-refresh-current',true));
  box.querySelector('[data-refresh-current]').onclick=()=>perform('refresh-'+kind+'-'+id,box,async()=>{
    if(kind==='post')await currentPost(id);else await currentComment(session.comments.get(String(id)));
    notice(target,'La version actuelle est chargée. Tu peux vérifier son contenu avant de réessayer.');
  },next=>notice(target,next.message,true));
}
function deletePost(id){
  const s=session,post=s.posts.get(String(id));if(!canManagePosts()||!post||!own(post)||!confirm('Supprimer cette réflexion et ses commentaires ?'))return;
  perform('post-'+id,node('loge-post-'+id),async()=>{
    const result=await request('/api/loge/posts/'+encodeURIComponent(id),{method:'DELETE',body:{revision:post.revision}});
    acceptSelf(result);invalidateOtherViews();s.current.player?.remove(id);s.posts.delete(String(id));forgetDraft('post-'+id);
    node('loge-post-'+id)?.remove();notice('loge-status','Ta réflexion est supprimée.');updateQuota();
  },error=>refreshAfterConflict('post',id,error));
}

function commentMarkup(comment){
  const person=comment.author,avatar=typeof person.avatar==='string'&&/^\/api\/(?:loge|roadmap)\//.test(person.avatar)?`<img src="${esc(person.avatar)}" alt="" loading="lazy" decoding="async">`:esc(person.username?.slice(0,1)||'·');
  return `<article class="loge-comment" id="loge-comment-${esc(comment.id)}" data-comment-id="${esc(comment.id)}"><a class="loge-avatar loge-comment-avatar" href="${memberPath(person.id)}" data-link aria-label="Profil de ${esc(person.username)}">${avatar}</a><div class="loge-comment-main"><div class="loge-comment-bubble"><a class="loge-comment-author" href="${memberPath(person.id)}" data-link>${esc(person.username)}</a><p id="loge-comment-body-${esc(comment.id)}">${esc(comment.body)}</p></div><div class="loge-comment-meta">${stamp(comment.createdAt)}${own(comment)?ownerMenu('comment',comment.id):''}</div><div id="loge-comment-editor-${esc(comment.id)}"></div>${statusMarkup('loge-comment-status-'+comment.id)}</div></article>`;
}
function commentCount(postId,change){const post=session.posts.get(String(postId));if(!post)return;post.commentCount=Math.max(0,(post.commentCount||0)+change);const toggle=node('loge-post-'+postId)?.querySelector('[data-comments-open]');if(toggle){toggle.setAttribute('aria-label','Commentaires ('+post.commentCount+')');const count=toggle.querySelector('[data-comment-count]');if(count)count.textContent=String(post.commentCount);}}
function updateComment(comment){const el=node('loge-comment-body-'+comment.id);if(el)el.textContent=comment.body;const context=session.current?.root?.querySelector('[data-intervention-id="'+comment.id+'"]')?.querySelector('span');if(context)context.textContent=comment.body;}
function insertComment(comment,list){
  const s=session;s.comments.set(String(comment.id),comment);
  if(node('loge-comment-'+comment.id)){updateComment(comment);return;}
  const before=[...list.querySelectorAll('[data-comment-id]')].find(el=>Number(el.dataset.commentId)>Number(comment.id));
  if(before)before.insertAdjacentHTML('beforebegin',commentMarkup(comment));else list.insertAdjacentHTML('beforeend',commentMarkup(comment));
  const root=node('loge-comment-'+comment.id);
  root.querySelector('[data-comment-edit]')?.addEventListener('click',()=>openCommentEdit(comment.id));
  root.querySelector('[data-comment-delete]')?.addEventListener('click',()=>deleteComment(comment.id));
}
function openCommentEdit(id){
  const comment=session.comments.get(String(id));if(!comment||!own(comment))return;
  node('loge-comment-'+id)?.querySelector('details')?.removeAttribute('open');
  const root=node('loge-comment-editor-'+id);if(root.innerHTML){root.hidden=!root.hidden;return;}
  const draft=getDraft('comment-'+id,{body:comment.body,revision:comment.revision});
  root.hidden=false;root.innerHTML=`<form class="loge-edit-form"><label>Ton commentaire<textarea name="body" required maxlength="2000" rows="5">${esc(draft.body)}</textarea></label><div class="loge-form-actions"><button class="loge-button" type="submit">Enregistrer</button>${button('Fermer','data-edit-close',true)}</div>${statusMarkup('loge-comment-edit-status-'+id)}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['body']);growingComment(form);form.querySelector('[data-edit-close]').onclick=()=>{root.hidden=true;};
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['body']);perform('comment-'+id,form,async()=>{
    const result=await request('/api/loge/comments/'+encodeURIComponent(id),{method:'PUT',body:{body:draft.body.trim(),revision:draft.revision}});
    invalidateOtherViews();session.comments.set(String(id),result.comment);updateComment(result.comment);forgetDraft('comment-'+id);root.innerHTML='';root.hidden=true;notice('loge-comment-status-'+id,'Ton commentaire est mis à jour.');
  },error=>{notice('loge-comment-edit-status-'+id,error.message,true);if(error.status===409&&error.data?.conflict)conflict(form,'comment',id,draft);});};
}
function deleteComment(id){
  const comment=session.comments.get(String(id));if(!comment||!own(comment)||!confirm('Supprimer ce commentaire ?'))return;
  perform('comment-'+id,node('loge-comment-'+id),async()=>{
    await request('/api/loge/comments/'+encodeURIComponent(id),{method:'DELETE',body:{revision:comment.revision}});
    invalidateOtherViews();commentCount(comment.postId,-1);session.comments.delete(String(id));forgetDraft('comment-'+id);node('loge-comment-'+id)?.remove();removeIntervention(comment);notice('loge-comments-status','Ton commentaire est supprimé.');
  },error=>refreshAfterConflict('comment',id,error));
}
function growComment(field){
  if(!field)return;const panel=field.closest('.loge-comments-panel'),available=panel?.getBoundingClientRect?.().height,editing=panel?.classList.contains('is-keyboard-editing'),minimum=editing?Math.min(144,Math.max(72,(available||window.visualViewport?.height||300)-180)):144,limit=Math.max(minimum,Math.min(360,(window.visualViewport?.height||window.innerHeight||800)*.45,available>0?available-(editing?180:136):360));
  field.style.setProperty('height','auto');const height=Math.max(minimum,field.scrollHeight||minimum);
  field.style.setProperty('height',Math.min(limit,height)+'px');field.style.setProperty('overflow-y',height>limit?'auto':'hidden');
}
function growingComment(form){const field=form.elements.namedItem('body');growComment(field);field?.addEventListener('input',()=>{growComment(field);session?.commentViewport?.refresh();});}
function commentWriting(panel,writing,{focus=true}={}){
  const root=panel.root,scroll=root.querySelector('.loge-comments-scroll'),compose=root.querySelector('.loge-comment-composer'),open=root.querySelector('[data-comment-write]');
  const wasWriting=!!panel.writing;if(writing&&!wasWriting)panel.writingVersion=(panel.writingVersion||0)+1;
  if(writing&&!compose.innerHTML)bindCommentComposer(panel);
  if(writing&&!panel.writing)panel.readScrollTop=scroll.scrollTop||0;
  panel.writing=writing;root.classList.toggle('is-writing',writing);scroll.hidden=writing;compose.hidden=!writing;open.hidden=writing;open.setAttribute('aria-expanded',String(writing));
  if(writing){const field=compose.querySelector('textarea');growComment(field);if(focus)field?.focus({preventScroll:true});}
  else{if(wasWriting)scroll.scrollTop=panel.readScrollTop||0;if(focus)open.focus({preventScroll:true});}
  session?.commentViewport?.refresh();
}
function bindCommentComposer(panel){
  const id=panel.postId,draft=getDraft('create-comment-'+id,{body:''}),root=panel.root.querySelector('.loge-comment-composer');
  root.innerHTML=`<form><label>Écrire un commentaire<textarea name="body" required maxlength="2000" rows="5">${esc(draft.body)}</textarea></label><div class="loge-form-actions">${button('Annuler','data-comment-cancel',true)}<button class="loge-button" type="submit">Publier le commentaire</button></div>${statusMarkup('loge-comment-create-status')}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['body']);growingComment(form);form.querySelector('[data-comment-cancel]').onclick=()=>commentWriting(panel,false);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['body']);const submitted={body:draft.body.trim(),requestId:draft.requestId},writingVersion=panel.writingVersion;perform('create-comment-'+id,form,async()=>{
    const result=await request(`/api/loge/posts/${encodeURIComponent(id)}/comments`,{method:'POST',body:submitted});
    invalidateOtherViews();if(!session.comments.has(String(result.comment.id)))commentCount(id,1);node('loge-comments-empty')?.remove();insertComment(result.comment,node('loge-comments-list'));if(session.current.tab==='interventions')insertIntervention({...result.comment,post:session.posts.get(String(id))},node('loge-profile-list'));
    const unchanged=draft.requestId===submitted.requestId&&draft.body.trim()===submitted.body;
    draft.requestId=crypto.randomUUID();if(unchanged){draft.body='';form.elements.namedItem('body').value='';growComment(form.elements.namedItem('body'));if(panel.writing&&panel.writingVersion===writingVersion){commentWriting(panel,false);node('loge-comment-'+result.comment.id)?.scrollIntoView({block:'nearest',inline:'nearest'});}}
    notice('loge-comments-status','Ton commentaire est publié.');
  },error=>notice(panel.writing?'loge-comment-create-status':'loge-comments-status',error.message,true));};
}

function invalidateOtherViews(){const s=session;for(const view of s.views.values())if(view!==s.current){view.dirty=true;view.version++;}}
function commentsMarkup(drawer=false){return `<header class="loge-comments-heading"><h2 id="loge-comments-title">Commentaires</h2>${drawer?button('Fermer','data-discussion-close aria-label="Fermer les commentaires"',true):''}</header><div class="loge-comments-scroll" id="loge-comments-scroll"><div id="loge-comments-list"></div>${button('Voir d’autres commentaires','id="loge-comments-more"',true)}${statusMarkup('loge-comments-status')}</div>${button('Écrire un commentaire','data-comment-write aria-expanded="false" aria-controls="loge-comment-compose"',true)}<div id="loge-comment-compose" class="loge-comment-composer" hidden></div>`;}
function bindComments(panel){
  const s=session;node('loge-comments-more').onclick=()=>loadComments(panel.postId,panel.next);
  panel.root.querySelector('[data-discussion-close]')?.addEventListener('click',()=>closeDiscussion());panel.root.querySelector('[data-comment-write]').onclick=()=>commentWriting(panel,true);
  panel.root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(panel.writing)commentWriting(panel,false);else closeDiscussion();}});
}
function closeDiscussion(){
  const view=session?.current,panel=view?.activePanel;if(!panel||!videoView(view))return;
  commentWriting(panel,false,{focus:false});panel.scrollTop=node('loge-comments-scroll')?.scrollTop||0;panel.root.remove();
  const card=node('loge-post-'+panel.postId);card?.classList.remove('is-comments-open');
  const slot=node('loge-panel-slot-'+panel.postId);if(slot)slot.hidden=true;
  const toggle=card?.querySelector('[data-comments-open]');toggle?.setAttribute('aria-expanded','false');toggle?.focus({preventScroll:true});
  view.activePanel=null;session?.commentViewport?.refresh();refreshLayout(view);
}
async function openDiscussion(postId){
  const s=session,view=s.current;if(!videoView(view))return;
  if(String(view.activePanel?.postId)===String(postId)){closeDiscussion();return;}
  closeDiscussion();
  let panel=view.panels.get(String(postId));
  if(!panel){panel={postId,root:document.createElement('section'),next:null,loaded:false,loading:false,focusComment:view.kind==='post'?view.focusComment:view.interventionFocus.get(String(postId))||null,scrollTop:0};panel.root.className='loge-comments-panel';panel.root.setAttribute('aria-labelledby','loge-comments-title');panel.root.innerHTML=commentsMarkup(true);view.panels.set(String(postId),panel);}
  if(panel.dirty){panel.root.innerHTML=commentsMarkup(true);panel.loaded=false;panel.bound=false;panel.next=null;panel.dirty=false;}
  view.activePanel=panel;node('loge-panel-slot-'+postId).hidden=false;node('loge-panel-slot-'+postId).append(panel.root);
  const card=node('loge-post-'+postId);card.classList.add('is-comments-open');card.querySelector('[data-comments-open]').setAttribute('aria-expanded','true');
  if(!panel.bound){bindComments(panel);panel.bound=true;}else node('loge-comments-scroll').scrollTop=panel.scrollTop;commentWriting(panel,false,{focus:false});
  refreshLayout(view);panel.root.querySelector('[data-discussion-close]')?.focus({preventScroll:true});
  if(!panel.loaded)await loadComments(postId);
}
async function loadComments(id,after=null){
  const s=session,view=s.current,panel=view.activePanel;if(!panel||String(panel.postId)!==String(id)||panel.loading)return;
  panel.loading=true;const more=node('loge-comments-more');if(more)more.disabled=true;notice('loge-comments-status','Chargement des commentaires…');
  try{
    const query=new URLSearchParams();if(after!==null)query.set('after',after);else if(panel.focusComment)query.set('focus',panel.focusComment);
    const result=await request(`/api/loge/posts/${encodeURIComponent(id)}/comments${query.size?'?'+query:''}`);
    if(s.current!==view||view.activePanel!==panel)return;
    const list=node('loge-comments-list');for(const comment of result.comments)insertComment(comment,list);
    if(!list.querySelector('[data-comment-id]'))list.innerHTML='<p class="loge-empty" id="loge-comments-empty">Aucun commentaire pour le moment.</p>';
    notice('loge-comments-status','');panel.loaded=true;panel.next=result.next;const next=node('loge-comments-more');next.hidden=result.next==null;next.disabled=false;
    if(panel.focusComment){const target=node('loge-comment-'+panel.focusComment);if(target){target.classList.add('is-focused');target.setAttribute('tabindex','-1');if(!panel.writing){target.scrollIntoView({block:'nearest',inline:'nearest'});target.focus({preventScroll:true});}}panel.focusComment=null;}
    return true;
  }catch(error){
    if(live(s)&&s.current===view&&view.activePanel===panel&&error.status===404&&after===null&&panel.focusComment){panel.focusComment=null;panel.loading=false;const loaded=await loadComments(id);if(loaded&&live(s)&&s.current===view)notice('loge-comments-status','Ce commentaire n’est plus disponible. Les autres échanges sont affichés.');return loaded;}
    if(live(s)&&s.current===view&&view.activePanel===panel&&error.name!=='AbortError')notice('loge-comments-status',error.message,true);
    return false;
  }finally{panel.loading=false;if(live(s)&&s.current===view&&view.activePanel===panel&&node('loge-comments-more'))node('loge-comments-more').disabled=false;}
}
function insertIntervention(comment,list){
  const view=session.current,id=String(comment.id),postId=String(comment.post.id);
  if(String(comment.author.id)!==String(view.memberId)||String(comment.post.author.id)===String(view.memberId)||view.interventions.has(id))return;
  view.interventions.add(id);view.interventionFocus.set(postId,Math.max(Number(view.interventionFocus.get(postId))||0,Number(comment.id)));insertPost(comment.post,list);
  const context=node('loge-interventions-post-'+postId);context.hidden=false;
  const before=[...context.querySelectorAll('[data-intervention-id]')].find(link=>Number(link.dataset.interventionId)<Number(comment.id)),markup=`<a class="loge-intervention-link" data-intervention-id="${esc(comment.id)}" href="${postPath(comment.post.id)}?comment=${encodeURIComponent(comment.id)}" data-link><span>${esc(comment.body)}</span>${stamp(comment.createdAt)}</a>`;
  if(before)before.insertAdjacentHTML('beforebegin',markup);else context.insertAdjacentHTML('beforeend',markup);
  orderInterventionClips(view,list);
}
function orderInterventionClips(view,list){
  const cards=[...list.querySelectorAll('[data-post-id]')],sorted=[...cards].sort((a,b)=>Number(view.interventionFocus.get(b.dataset.postId))-Number(view.interventionFocus.get(a.dataset.postId)));
  for(let index=0;index<sorted.length;index++){const current=list.querySelectorAll('[data-post-id]');if(current[index]!==sorted[index])list.insertBefore(sorted[index],current[index]);}
}
function removeIntervention(comment){
  const view=session.current,link=view.root.querySelector('[data-intervention-id="'+comment.id+'"]');if(!link)return;
  link.remove();view.interventions.delete(String(comment.id));
  const context=node('loge-interventions-post-'+comment.postId),next=context?.querySelector('[data-intervention-id]');
  if(next){view.interventionFocus.set(String(comment.postId),next.dataset.interventionId);orderInterventionClips(view,node('loge-profile-list'));}
  else{view.interventionFocus.delete(String(comment.postId));removeProfileClip(comment.postId);view.panels.delete(String(comment.postId));}
}
function paginationState(view,buttonId){const control=node(buttonId);if(!control)return;control.hidden=view.next==null;control.disabled=false;const group=control.closest('.loge-feed-pagination');if(group)group.hidden=view.next==null;}
function addProfileRows(view,result){
  const list=node('loge-profile-list');node('loge-profile-empty')?.remove();node('loge-favorites-empty')?.remove();
  if(view.tab!=='interventions')for(const post of result.posts||[])insertPost(post,list);
  else for(const comment of result.interventions||[])insertIntervention(comment,list);
  if(!view.posts.size&&!view.interventions.size)list.insertAdjacentHTML('afterbegin',`<p class="loge-empty" id="loge-profile-empty">${view.tab==='favoris'?'Aucune vidéo en favori.':view.tab==='reflexions'?'Aucune réflexion publiée pour le moment.':'Aucune intervention pour le moment.'}</p>`);
  view.next=result.next;paginationState(view,'loge-profile-more');
}
async function moreProfile(){
  const s=session,view=s.current;if(view.loading||view.next==null)return;view.loading=true;node('loge-profile-more').disabled=true;
  try{const result=await request(view.endpoint+'&after='+encodeURIComponent(view.next));acceptSelf(result);addProfileRows(view,result);feedPagination(view);view.player?.refresh();}
  catch(error){if(live(s)&&s.current===view&&error.name!=='AbortError')notice('loge-status',error.message,true);}
  finally{view.loading=false;if(live(s)&&s.current===view&&node('loge-profile-more'))node('loge-profile-more').disabled=false;}
}
function feedPagination(view){
  view.paginationObserver?.disconnect();
  if(typeof IntersectionObserver!=='function'||view.next==null)return;
  const sentinel=view.root.querySelector('.loge-feed-pagination');if(!sentinel)return;
  const s=session;view.paginationObserver=new IntersectionObserver(entries=>{if(live(s)&&s.current===view&&entries.some(entry=>entry.isIntersecting)&&view.next!=null&&!view.loading){if(view.kind==='feed')moreFeed();else if(view.kind==='theme')moreThemePosts();else moreProfile();}},{root:viewScroller(view),rootMargin:'0px 0px 100% 0px'});view.paginationObserver.observe(sentinel);
}
async function moreFeed(){
  const s=session,view=s.current;if(view.loading||view.next==null)return;view.loading=true;node('loge-feed-more').disabled=true;
  try{const result=await request('/api/loge?after='+encodeURIComponent(view.next));acceptSelf(result);for(const post of result.posts)insertPost(post,node('loge-feed'));view.next=result.next;paginationState(view,'loge-feed-more');feedPagination(view);view.player?.refresh();}
  catch(error){if(live(s)&&s.current===view&&error.name!=='AbortError')notice('loge-status',error.message,true);}
  finally{view.loading=false;if(live(s)&&s.current===view&&node('loge-feed-more'))node('loge-feed-more').disabled=false;}
}
function armThemeBoundary(s=session){
  if(!LOGE_THEMES_ENABLED||!live(s))return;clearTimeout(s.themeTimer);s.themeTimer=null;
  const end=Number(s.currentTheme?.endsAt)*1000,remaining=end-Date.now()-s.clockOffset;
  if(Number.isFinite(remaining)&&remaining>0){s.themeAttemptedWeek=null;s.themeTimer=setTimeout(()=>refreshThemeBoundary(s),Math.min(remaining+50,2147483647));}
  else if(Number.isFinite(remaining)&&s.currentTheme&&s.themeAttemptedWeek!==s.currentTheme.week&&!s.themeRefreshing){s.themeAttemptedWeek=s.currentTheme.week;s.themeTimer=setTimeout(()=>refreshThemeBoundary(s),50);}
}
async function refreshThemeBoundary(s=session){
  if(!LOGE_THEMES_ENABLED||!live(s)||s.themeRefreshing)return;const view=s.current;if(!view)return;s.themeRefreshing=true;
  try{
    const result=await request('/api/loge/themes',{}, {view,background:true});if(!live(s))return;
    acceptSelf(result);for(const cached of s.views.values())if(cached.kind==='theme')cached.dirty=true;
    if(s.current===view&&view.kind==='theme'){
      const compose=node('loge-compose'),wasOpen=compose&&!compose.hidden;view.version++;
      await navigate(view.key);if(live(s)&&s.current===view&&wasOpen)openComposer();
    }else if(s.current===view)syncComposerTheme();
  }catch(error){if(live(s)&&error.name!=='AbortError')notice('loge-status','Le thème sera actualisé à la prochaine ouverture.',true);}
  finally{if(live(s)){s.themeRefreshing=false;armThemeBoundary(s);}}
}
function themeChoiceMarkup(draft){
  if(!LOGE_THEMES_ENABLED)return '';
  const theme=session.currentTheme;if(!theme?.themeId||theme.endsAt*1000<=Date.now()+session.clockOffset)return '';
  return `<label class="loge-theme-choice"><input type="checkbox" name="themeWeek" value="${esc(theme.week)}" ${draft.themeWeek===theme.week?'checked':''}><span>Cette réflexion concerne le thème de la semaine : ${esc(theme.title)}</span></label>`;
}
function syncComposerTheme(){
  if(!LOGE_THEMES_ENABLED)return;
  const slot=node('loge-theme-choice-slot');if(!slot||session.pending.has('create-post'))return;
  const draft=getDraft('create-post',{title:'',url:'',themeWeek:null});slot.innerHTML=themeChoiceMarkup(draft);
  const choice=slot.querySelector('input');if(choice)choice.addEventListener('change',()=>{draft.themeWeek=choice.checked?choice.value:null;});
}
function bindThemeProposal(view,proposal){
  const control=node('loge-proposal-'+proposal.id)?.querySelector('[data-theme-like]');if(!control)return;
  control.onclick=()=>perform('theme-like-'+proposal.id,control,async()=>{
    const result=await request('/api/loge/themes/proposals/'+proposal.id+'/like',{method:'PUT',body:{liked:!view.proposals.get(String(proposal.id)).liked,targetWeek:view.themeData.nextWeek.week}});
    upsertProposal(view,result.proposal);invalidateOtherViews();
  },error=>themeError(view,error,'loge-theme-status'));
}
function upsertProposal(view,proposal){
  view.proposals.set(String(proposal.id),proposal);const old=node('loge-proposal-'+proposal.id),list=node('loge-theme-proposals');
  if(old)old.outerHTML=proposalMarkup(proposal,esc);
  else{if(!list.querySelector('[data-theme-like]'))list.innerHTML='';list.insertAdjacentHTML('afterbegin',proposalMarkup(proposal,esc));}
  bindThemeProposal(view,proposal);
}
function themeError(view,error,id){
  notice(id,error.message,true);
  if(error.status===409)for(const cached of session.views.values())if(cached.kind==='theme')cached.dirty=true;
}
function proposeTheme(view,body,container){
  return perform('theme-propose',container,async()=>{
    const result=await request('/api/loge/themes/proposals',{method:'POST',body:{...body,targetWeek:view.themeData.nextWeek.week}});
    upsertProposal(view,result.proposal);invalidateOtherViews();
    if('title' in body){const form=node('loge-theme-propose-form');form.elements.namedItem('title').value='';getDraft('theme-proposal',{title:''}).title='';}
    notice('title' in body?'loge-theme-proposal-status':'loge-theme-status','Le thème est proposé pour la semaine prochaine.');
  },error=>themeError(view,error,'title' in body?'loge-theme-proposal-status':'loge-theme-status'));
}
function bindThemeHistory(view){
  for(const control of node('loge-theme-history').querySelectorAll('[data-theme-propose]'))control.onclick=()=>proposeTheme(view,{themeId:Number(control.dataset.themePropose)},control);
}
async function loadThemeHistory(view,after=null){
  const s=session,version=++view.historyVersion,query=new URLSearchParams();if(after)query.set('after',after);if(view.historyQuery)query.set('q',view.historyQuery);
  const more=node('loge-theme-history-more');more.disabled=true;
  try{
    const result=await request('/api/loge/themes/history'+(query.size?'?'+query:''));if(!live(s)||s.current!==view||view.historyVersion!==version)return;
    const list=node('loge-theme-history');if(!after){view.history.clear();list.innerHTML='';}
    for(const theme of result.themes){if(view.history.has(String(theme.id)))continue;view.history.set(String(theme.id),theme);list.insertAdjacentHTML('beforeend',historyMarkup(theme,esc));}
    if(!view.history.size)list.innerHTML='<p class="loge-empty">Aucun thème trouvé.</p>';
    view.historyNext=result.next;more.hidden=result.next==null;bindThemeHistory(view);
  }catch(error){if(live(s)&&s.current===view&&view.historyVersion===version&&error.name!=='AbortError')themeError(view,error,'loge-theme-status');}
  finally{if(live(s)&&s.current===view&&view.historyVersion===version)more.disabled=false;}
}
function themePostsState(view,result){
  const list=node('loge-theme-posts');node('loge-theme-posts-empty')?.remove();
  for(const post of result.posts||[])insertPost(post,list);
  if(!view.posts.size)list.insertAdjacentHTML('afterbegin','<p class="loge-empty" id="loge-theme-posts-empty">Aucune réflexion sur ce thème pour le moment.</p>');
  view.next=result.next;paginationState(view,'loge-theme-posts-more');
}
async function moreThemePosts(){
  const s=session,view=s.current;if(view.loading||!view.selectedTheme||view.next==null)return;view.loading=true;node('loge-theme-posts-more').disabled=true;
  try{const result=await request('/api/loge/themes/'+view.selectedTheme.id+'/posts?after='+encodeURIComponent(view.next));acceptSelf(result);themePostsState(view,result);feedPagination(view);view.player?.refresh();}
  catch(error){if(live(s)&&s.current===view&&error.name!=='AbortError')notice('loge-status',error.message,true);}
  finally{view.loading=false;if(live(s)&&s.current===view&&node('loge-theme-posts-more'))node('loge-theme-posts-more').disabled=false;}
}
function renderThemeView(view,result){
  view.posts.clear();view.comments.clear();view.panels.clear();view.activePanel=null;view.editingId=null;
  view.themeData=result;view.selectedTheme=result.selectedTheme;view.proposals=new Map((result.proposals||[]).map(p=>[String(p.id),p]));view.history=new Map((result.history||[]).map(t=>[String(t.id),t]));view.historyNext=result.historyNext;view.historyQuery='';view.historyVersion=0;
  shell(`${topbar(view)}${logeNavigation(view)}${composerMarkup()}<div class="loge-themes-scroll">${themeOverviewMarkup(result,view.themeId?result.selectedTheme:null,esc)}<section class="loge-theme-videos"><header><h2>${result.selectedTheme?esc(result.selectedTheme.title):'Réflexions du thème'}</h2></header><div id="loge-theme-posts"><div class="loge-feed-pagination">${button('Voir la suite','id="loge-theme-posts-more"',true)}</div></div></section></div>`);
  node('loge-open-compose').onclick=openComposer;node('loge-theme-posts-more').onclick=moreThemePosts;
  themePostsState(view,{posts:result.posts,next:result.postNext});
  for(const proposal of view.proposals.values())bindThemeProposal(view,proposal);bindThemeHistory(view);
  const form=node('loge-theme-propose-form'),draft=getDraft('theme-proposal',{title:''});form.elements.namedItem('title').value=draft.title;rememberFields(form,draft,['title']);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['title']);proposeTheme(view,{title:draft.title.trim()},form);};
  node('loge-theme-proposals-more').onclick=()=>perform('theme-more',node('loge-theme-proposals-more'),async()=>{
    if(view.themeData.next==null)return;const more=await request('/api/loge/themes/proposals?after='+encodeURIComponent(view.themeData.next));
    if(more.nextWeek.week!==view.themeData.nextWeek.week){view.dirty=true;throw Object.assign(Error('Les propositions de cette semaine sont closes. Actualise la page.'),{status:409});}
    for(const proposal of more.proposals){if(view.proposals.has(String(proposal.id)))continue;view.proposals.set(String(proposal.id),proposal);node('loge-theme-proposals').insertAdjacentHTML('beforeend',proposalMarkup(proposal,esc));bindThemeProposal(view,proposal);}
    view.themeData.next=more.next;node('loge-theme-proposals-more').hidden=more.next==null;
  },error=>themeError(view,error,'loge-theme-status'));
  node('loge-theme-search-form').onsubmit=event=>{event.preventDefault();view.historyQuery=node('loge-theme-search-form').elements.namedItem('q').value.trim();loadThemeHistory(view);};
  node('loge-theme-history-more').onclick=()=>loadThemeHistory(view,view.historyNext);
  document.title='Thème · Loge virtuelle · White Cadae';view.title=document.title;view.loadedAt=Date.now();view.dirty=false;view.renderedGeneration=view.dataGeneration;updateQuota();
}

function renderView(view,result){
  view.player?.destroy();view.player=null;view.paginationObserver?.disconnect();view.paginationObserver=null;
  if(view.kind==='theme'){renderThemeView(view,result);return;}
  const s=session;view.posts.clear();view.comments.clear();view.interventions.clear();view.interventionFocus.clear();view.panels.clear();view.activePanel=null;view.editingId=null;
  if(view.kind==='profile'){view.member=result.member;document.title=result.member.username+' · Loge virtuelle · White Cadae';}
  else document.title=(view.kind==='post'?result.post.title+' · ':'')+'Loge virtuelle · White Cadae';
  const tabs=logeNavigation(view);
  {
    const listId=view.kind==='feed'?'loge-feed':view.kind==='profile'?'loge-profile-list':'loge-detail-post',moreId=view.kind==='profile'?'loge-profile-more':'loge-feed-more';
    shell(`${topbar(view)}${tabs}${composerMarkup()}<div id="${listId}" class="loge-reels" aria-label="Réflexions en vidéo"><div class="loge-feed-pagination">${button('Voir la suite',`id="${moreId}"`,true)}</div></div>`);
    node('loge-open-compose').onclick=openComposer;
    if(view.kind==='profile'){node(moreId).onclick=moreProfile;addProfileRows(view,result);}
    else{
      node(moreId).onclick=moreFeed;for(const post of view.kind==='post'?[result.post]:result.posts)insertPost(post,node(listId));
      if(!view.posts.size)node(listId).insertAdjacentHTML('afterbegin','<p class="loge-empty" id="loge-feed-empty">Aucune réflexion publiée pour le moment.</p>');
      view.next=view.kind==='post'?null:result.next;paginationState(view,moreId);
    }
  }
  updateQuota();view.title=document.title;view.loadedAt=Date.now();view.dirty=false;view.renderedGeneration=view.dataGeneration;
}
function parseDestination(destination){
  let url;try{url=new URL(destination,location.origin||'https://whitecadae.fr');}catch{return null;}
  if(url.origin!==(location.origin||'https://whitecadae.fr'))return null;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  if(path===base+'/theme'){if(!LOGE_THEMES_ENABLED)return null;const id=url.searchParams.get('theme');if(id!==null&&(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))))return null;return {key:themePath(id),kind:'theme',themeId:id?Number(id):null,endpoint:'/api/loge/themes'};}
  if(path===base)return {key:base,kind:'feed',endpoint:'/api/loge',openCompose:url.searchParams.has('publier')};
  const member=/^\/loge-virtuelle\/membres\/([1-9]\d*)$/.exec(path);
  if(member){const tab=['interventions','favoris'].includes(url.searchParams.get('onglet'))?url.searchParams.get('onglet'):'reflexions';return {key:memberPath(member[1])+'?onglet='+tab,kind:'profile',memberId:member[1],tab,endpoint:'/api/loge/membres/'+member[1]+'?tab='+tab};}
  const post=/^\/loge-virtuelle\/publications\/([1-9]\d*)$/.exec(path);
  if(post){const focus=url.searchParams.get('comment');return {key:postPath(post[1])+(focus?'?comment='+encodeURIComponent(focus):''),kind:'post',postId:post[1],focusComment:focus,endpoint:'/api/loge/posts/'+post[1]};}
  return null;
}
function makeView(spec){return {...spec,root:null,data:null,dataGeneration:0,renderedGeneration:0,fetching:null,version:1,destroyed:false,dirty:false,loadedAt:0,scrollY:0,reelScroll:0,posts:new Map(),comments:new Map(),interventions:new Set(),interventionFocus:new Map(),panels:new Map(),activePanel:null,editingId:null,next:null,loading:false,player:null,paginationObserver:null};}
async function themeViewData(view){
  for(let attempt=0;attempt<2;attempt++){
    const data=await request(view.endpoint,{}, {view,background:true});acceptSelf(data);const id=view.themeId||data.current?.themeId;
    if(!id)return {...data,selectedTheme:null,posts:[],postNext:null};
    const videos=await request('/api/loge/themes/'+id+'/posts',{}, {view,background:true});acceptSelf(videos);
    if(videos.currentTheme?.week>data.current?.week)continue;
    return {...data,selectedTheme:videos.theme,posts:videos.posts,postNext:videos.next};
  }
  throw Object.assign(Error('Le thème vient de changer. Réessaie.'),{status:409});
}
async function fetchView(view){
  const s=session;if(view.fetching)return view.fetching;
  view.fetching=(async()=>{const result=view.kind==='theme'?await themeViewData(view):await request(view.endpoint,{}, {view,background:true});acceptSelf(result);view.data=result;view.dataGeneration++;view.loadedAt=Date.now();view.dirty=false;return result;})();
  try{return await view.fetching;}finally{view.fetching=null;}
}
function saveView(view){
  if(!view?.root)return;if(view.activePanel?.writing)commentWriting(view.activePanel,false,{focus:false});view.scrollY=window.scrollY||0;view.reelScroll=viewScroller(view)?.scrollTop||0;
  view.player?.pause();view.paginationObserver?.disconnect();view.paginationObserver=null;
}
function restoreView(view){
  const s=session,scroll=()=>{if(!live(s)||s.current!==view)return;const reels=viewScroller(view);if(reels)reels.scrollTop=view.reelScroll;window.scrollTo?.(0,view.scrollY);if(view.player){view.player.resume();view.player.refresh();}else initMedia(view);if(document.body.classList.contains('nav-open')||view.editingId||node('loge-compose')&&!node('loge-compose').hidden)view.player?.pause();feedPagination(view);};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(scroll);else scroll();
}
function trimViews(){
  const s=session;while(s.views.size>6){const found=[...s.views.entries()].find(([,view])=>view!==s.current&&!view.fetching);if(!found)break;const [key,view]=found;view.destroyed=true;view.player?.destroy();view.paginationObserver?.disconnect();s.views.delete(key);}
}
function prefetchDestination(destination){
  const s=session,spec=parseDestination(destination);let target=s.views.get(spec.key);if(!target){target=makeView(spec);s.views.set(spec.key,target);}
  if(target.fetching||(!target.dirty&&Date.now()-target.loadedAt<120000))return;
  fetchView(target).catch(()=>{});
}
function prefetchSibling(view){
  if(view.kind!=='feed')prefetchDestination(base);
  if(view.kind!=='profile'||String(view.memberId)!==String(session.user)||view.tab!=='reflexions')prefetchDestination(memberPath(session.user)+'?onglet=reflexions');
  trimViews();
}
export function canNavigate(destination){return live(session)&&!!parseDestination(destination);}
export async function navigate(destination){
  const s=session,spec=parseDestination(destination);if(!live(s)||!spec)return;
  const token=++s.navigationVersion,previous=s.current;
  if(previous)saveView(previous);
  let view=s.views.get(spec.key);if(!view){view=makeView(spec);if(previous?.kind==='profile'&&previous.memberId===view.memberId)view.scrollY=window.scrollY||0;s.views.set(spec.key,view);}
  if(!view.root&&previous?.kind==='profile'&&view.kind==='profile'&&String(previous.memberId)===String(view.memberId))view.scrollY=window.scrollY||0;
  view.openCompose=spec.openCompose;
  try{
    let result=view.data;
    if(!result||view.dirty||Date.now()-view.loadedAt>120000||view.kind==='theme'&&result.current?.endsAt*1000<=Date.now()+s.clockOffset)result=await fetchView(view);
    if(!live(s)||token!==s.navigationVersion||view.destroyed)return;
    if(s.current!==view){s.current?.player?.destroy();if(s.current)s.current.player=null;s.current=view;}
    immersion(logeView(view));
    if(!view.root||view.renderedGeneration!==view.dataGeneration){renderView(view,result);}else{s.ctx.app.replaceChildren(view.root);document.title=view.title;}
    s.commentViewport?.refresh();restoreView(view);if(view.openCompose)openComposer();
    if(view.kind==='post'&&view.focusComment&&!view.activePanel)await openDiscussion(view.postId);
    if(!live(s)||s.current!==view)return;s.views.delete(view.key);s.views.set(view.key,view);prefetchSibling(view);trimViews();
  }catch(error){
    if(!live(s)||token!==s.navigationVersion)return;
    if(error.name==='AbortError'){if(view.dirty)await navigate(destination);return;}
    if(previous?.root){s.current=previous;immersion(logeView(previous));s.ctx.app.replaceChildren(previous.root);restoreView(previous);notice('loge-status',error.message,true);if(parseDestination(location.pathname+location.search+location.hash)?.key!==previous.key)await s.ctx.navigate(previous.key,true);}
    else{s.current=view;immersion(false);shell(`${heading('Loge virtuelle')}<p class="loge-empty">${esc(error.message)}</p><a href="${base}" data-link>Réessayer</a>`);view.root.className='loge-page';}
  }
}
export function leave(){
  const s=session;immersion(false);if(!s)return;
  s.commentViewport?.destroy();closeVideo(s);s.headerObserver?.disconnect();s.menuObserver?.disconnect();s.closed=true;s.controller.abort();clearTimeout(s.quotaTimer);clearTimeout(s.themeTimer);window.removeEventListener('focus',s.themeFocus);document.removeEventListener('visibilitychange',s.themeFocus);window.removeEventListener('resize',s.resize);document.removeEventListener('keydown',s.keydown);session=null;
}
export function clear(){leave();drafts.clear();}
export async function page(path,ctx){
  leave();if(!ctx.state.user){ctx.navigate('/connexion?retour='+encodeURIComponent(path+location.search),true);return;}
  if(!parseDestination(path+location.search)){ctx.navigate(base,true);return;}
  if(LOGE_THEMES_ENABLED&&!document.querySelector('link[href="/loge-themes.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/loge-themes.css';document.head.append(css);}
  if(!document.querySelector('link[href="/loge.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/loge.css';document.head.append(css);}
  const s=session={ctx,user:ctx.state.user.id,controller:new AbortController(),closed:false,blocked:false,pending:new Set(),views:new Map(),current:null,navigationVersion:0,nextPublicationAt:null,clockOffset:0,quotaTimer:null};
  for(const key of ['posts','comments','interventions','next','loading','member'])Object.defineProperty(s,key,{get:()=>s.current?.[key],set:value=>{if(s.current)s.current[key]=value;}});
  Object.defineProperty(s,'view',{get:()=>s.current?.kind});
  s.commentViewport=createLogeCommentViewport({isCurrent:()=>live(s),getPanel:()=>s.current?.activePanel?.root,onGeometry:field=>growComment(field)});
  s.themeFocus=()=>{if(live(s)&&!document.hidden&&s.currentTheme?.endsAt*1000<=Date.now()+s.clockOffset)void refreshThemeBoundary(s);};if(LOGE_THEMES_ENABLED){window.addEventListener('focus',s.themeFocus);document.addEventListener('visibilitychange',s.themeFocus);}
  s.resize=()=>{if(live(s)&&document.body.classList.contains('loge-immersive')){siteHeaderSize();refreshLayout(s.current);for(const field of s.current?.root?.querySelectorAll('textarea')||[])if(field.closest('.loge-comments-panel'))growComment(field);}};window.addEventListener('resize',s.resize);
  const header=document.querySelector('.site-header');if(header&&typeof ResizeObserver==='function'){s.headerObserver=new ResizeObserver(()=>{if(live(s))s.resize();});s.headerObserver.observe(header);}
  s.navOpen=document.body.classList.contains('nav-open');s.menuPaused=null;if(typeof MutationObserver==='function'){s.menuObserver=new MutationObserver(()=>menuState(s));s.menuObserver.observe(document.body,{attributes:true,attributeFilter:['class']});}
  s.keydown=event=>{if(!live(s))return;const compose=node('loge-compose'),editor=s.current?.editingId?node('loge-post-editor-'+s.current.editingId):null,dialog=compose&&!compose.hidden?compose:editor&&!editor.hidden?editor:null;
    if(event.key==='Tab'&&dialog){const controls=[...dialog.querySelectorAll('button,input,textarea,a')].filter(el=>!el.disabled),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}
    if(event.key!=='Escape')return;if(compose&&!compose.hidden){composerVisibility(false);node('loge-open-compose')?.focus({preventScroll:true});}else if(editor&&!editor.hidden)closePostEditor(s.current.editingId);else if(videoView(s.current))closeDiscussion();};document.addEventListener('keydown',s.keydown);
  immersion(logeView(parseDestination(path+location.search)));ctx.app.innerHTML='<section class="loge-page"><p class="loge-empty" role="status">Chargement…</p></section>';
  await navigate(path+location.search+location.hash);
}
