import {youtubeId} from './youtube-video.js';
import {createLogeVideoFeed} from './loge-video.js';

let session=null;
const drafts=new Map();
const base='/loge-virtuelle';
const memberPath=id=>`${base}/membres/${encodeURIComponent(id)}`;
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
function shell(html){
  const view=session.current,root=document.createElement('section');root.className='loge-page'+(view.kind==='feed'?' is-feed':'');
  root.innerHTML=html+statusMarkup('loge-status');view.root=root;session.ctx.app.replaceChildren(root);
}
function profileLink(){return `<a class="loge-button is-quiet" href="${memberPath(session.user)}" data-link>Mon profil</a>`;}
function login(s){
  if(!live(s))return;
  closeVideo(s);s.blocked=true;
  s.ctx.navigate('/connexion?retour='+encodeURIComponent(location.pathname+location.search),true);
}
function deny(s,error){
  if(!live(s))return;
  closeVideo(s);s.blocked=true;s.controller.abort();
  s.ctx.app.innerHTML=`<section class="loge-page">${heading('Loge virtuelle')}<p class="loge-empty">${s.ctx.esc(error.message||'Cet espace n’est pas encore accessible dans ton parcours.')}</p><a href="/echelon" data-link>Retrouver les échelons</a></section>`;
}
function savedDraft(user,path,options,result){
  const body=options.body||{},prefix=String(user)+':',same=(draft,names)=>names.every(name=>String(draft[name]??'').trim()===String(body[name]??'').trim());
  const post=/^\/api\/loge\/posts\/([1-9]\d*)$/.exec(path),comment=/^\/api\/loge\/comments\/([1-9]\d*)$/.exec(path),thread=/^\/api\/loge\/posts\/([1-9]\d*)\/comments$/.exec(path);
  if(options.method==='POST'&&(path==='/api/loge/posts'||thread)){
    const key=prefix+(thread?'create-comment-'+thread[1]:'create-post'),draft=drafts.get(key);
    if(draft&&draft.requestId===body.requestId){
      const unchanged=same(draft,thread?['body']:['title','description'])&&(thread||youtubeId(draft.url)===youtubeId(body.url));
      if(thread){if(unchanged)draft.body='';draft.requestId=crypto.randomUUID();}
      else if(unchanged)drafts.delete(key);else draft.requestId=crypto.randomUUID();
    }
  }else if(options.method==='PUT'&&(post||comment)){
    const key=prefix+(post?'post-':'comment-')+(post||comment)[1],draft=drafts.get(key),record=post?result.post:result.comment;
    if(draft&&record){if(same(draft,post?['title','description']:['body']))drafts.delete(key);else draft.revision=Math.max(Number(draft.revision)||0,record.revision);}
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
  if('nextPublicationAt' in result)s.nextPublicationAt=result.nextPublicationAt;
  const server=dateValue(result.serverNow);if(server)s.clockOffset=server.getTime()-Date.now();
}
function updateQuota(){
  const s=session;if(!live(s))return;clearTimeout(s.quotaTimer);
  const until=dateValue(s.nextPublicationAt),remaining=until?until.getTime()-Date.now()-s.clockOffset:0;
  const blocked=remaining>0;
  const text=blocked?`Tu pourras publier une nouvelle réflexion le ${dateLabel(s.nextPublicationAt)}.`:'Tu peux publier une réflexion. Une publication est possible tous les sept jours.';
  const quota=node('loge-quota');if(quota){quota.textContent=text;quota.hidden=!blocked&&!!node('loge-compose')?.hidden;}
  const submit=node('loge-new-submit');if(submit&&!submit.closest('form')?.dataset.busy)submit.disabled=blocked;
  const open=node('loge-open-compose');if(open)open.disabled=blocked;
  if(blocked)s.quotaTimer=setTimeout(updateQuota,Math.min(remaining+50,2147483647));
}
function getDraft(key,initial){
  const full=session.user+':'+key;
  if(!drafts.has(full))drafts.set(full,{...initial,requestId:crypto.randomUUID()});
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
  for(const el of container.querySelectorAll('button,input,textarea')){
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

function videoMarkup(post){return `<div class="loge-reel-media" id="loge-video-${esc(post.id)}" data-video-post="${esc(post.id)}"></div>`;}
function canManagePosts(){const view=session.current;return view.kind==='profile'&&view.tab==='reflexions'&&String(view.memberId)===String(session.user);}
function closeVideo(s=session){for(const view of s?.views?.values()||[]){view.player?.destroy();view.player=null;view.paginationObserver?.disconnect();view.paginationObserver=null;}}
function bindVideo(id){const view=session.current,post=view.posts.get(String(id)),container=node('loge-video-'+id);if(view.player&&post&&container)view.player.add(post,container);}
function initMedia(view){
  const s=session;if(!live(s)||s.current!==view)return;
  view.player?.destroy();view.player=createLogeVideoFeed({root:view.kind==='feed'?view.root.querySelector('.loge-reels'):null,isCurrent:()=>live(s)&&s.current===view&&!view.destroyed,onError:()=>{}});
  for(const post of view.posts.values()){const container=view.root.querySelector('[data-video-post="'+post.id+'"]');if(container)view.player.add(post,container);}
  refreshLayout(view);
}
function refreshLayout(view){
  if(!view||!live(session)||session.current!==view)return;
  const reels=view.root?.querySelector('.loge-reels');
  if(reels?.getBoundingClientRect){
    const top=reels.getBoundingClientRect().top,player=document.getElementById('music-player'),playerHeight=player&&!player.hidden?(player.getBoundingClientRect?.().height||0):0;
    const height=Math.max(360,(window.innerHeight||800)-Math.max(0,top)-playerHeight-8);
    reels.style.setProperty('--loge-reel-height',height+'px');
  }
  view.player?.refresh();
}
function ownerMenu(kind,id){return `<details class="loge-menu"><summary aria-label="Options de ${kind==='post'?'la publication':'ton commentaire'}">…</summary><div>${button('Modifier',`data-${kind}-edit="${esc(id)}"`,true)}${button('Supprimer',`data-${kind}-delete="${esc(id)}"`,true)}</div></details>`;}
function postMarkup(post,detail=false){
  const reel=session.current.kind==='feed';
  if(reel)return `<article class="loge-publication loge-reel" id="loge-post-${esc(post.id)}" data-post-id="${esc(post.id)}"><div class="loge-reel-stage">${videoMarkup(post)}<footer class="loge-reel-info"><div class="loge-reel-byline">${author(post.author)}${stamp(post.createdAt)}</div><h2 class="loge-post-title" id="loge-post-title-${esc(post.id)}"><a href="${postPath(post.id)}" data-link>${esc(post.title)}</a></h2><p class="loge-description is-excerpt" id="loge-post-description-${esc(post.id)}">${esc(post.description)}</p><div class="loge-reel-actions">${button('Commentaires'+(Number.isInteger(post.commentCount)?' ('+post.commentCount+')':''),`data-comments-open="${esc(post.id)}" aria-expanded="false"`,true)}</div>${statusMarkup('loge-post-status-'+post.id)}</footer></div><div class="loge-reel-discussion" id="loge-panel-slot-${esc(post.id)}" hidden></div></article>`;
  return `<article class="loge-publication${detail?' is-detail':''}" id="loge-post-${esc(post.id)}" data-post-id="${esc(post.id)}"><header class="loge-post-head">${author(post.author)}${stamp(post.createdAt)}${own(post)&&canManagePosts()?ownerMenu('post',post.id):''}</header><${detail?'h1':'h2'} class="loge-post-title" id="loge-post-title-${esc(post.id)}">${detail?esc(post.title):`<a href="${postPath(post.id)}" data-link>${esc(post.title)}</a>`}</${detail?'h1':'h2'}>${videoMarkup(post)}<p class="loge-description${detail?'':' is-excerpt'}" id="loge-post-description-${esc(post.id)}">${esc(post.description)}</p>${detail?'':`<footer class="loge-post-actions"><a href="${postPath(post.id)}" data-link>Commentaires${Number.isInteger(post.commentCount)?' ('+post.commentCount+')':''}</a></footer>`}<div id="loge-post-editor-${esc(post.id)}"></div>${statusMarkup('loge-post-status-'+post.id)}</article>`;
}
function updatePost(post){
  const s=session;s.posts.set(String(post.id),post);
  const title=node('loge-post-title-'+post.id),description=node('loge-post-description-'+post.id);
  if(title){const link=title.querySelector('a');(link||title).textContent=post.title;}
  if(description)description.textContent=post.description;

  if(s.view==='post')document.title=post.title+' · Loge virtuelle · White Cadae';
}
function insertPost(post,list,detail=false){
  const s=session;if(s.posts.has(String(post.id))&&node('loge-post-'+post.id)){updatePost(post);return;}
  s.posts.set(String(post.id),post);
  const before=[...list.querySelectorAll('[data-post-id]')].find(el=>Number(el.dataset.postId)<Number(post.id));
  if(before)before.insertAdjacentHTML('beforebegin',postMarkup(post,detail));else{const end=list.querySelector('.loge-feed-pagination');if(end)end.insertAdjacentHTML('beforebegin',postMarkup(post,detail));else list.insertAdjacentHTML('beforeend',postMarkup(post,detail));}
  bindVideo(post.id);
  const card=node('loge-post-'+post.id);
  card.querySelector('[data-comments-open]')?.addEventListener('click',()=>openDiscussion(post.id));
  card.querySelector('[data-post-edit]')?.addEventListener('click',()=>openPostEdit(post.id));
  card.querySelector('[data-post-delete]')?.addEventListener('click',()=>deletePost(post.id));
}
function postFields(draft,create=false){return `<label>Titre<input name="title" required maxlength="140" value="${esc(draft.title)}" autocomplete="off"></label><label>Description<textarea name="description" required maxlength="5000" rows="5">${esc(draft.description)}</textarea></label>${create?`<label>Lien de la vidéo YouTube non répertoriée<input name="url" type="url" required maxlength="2048" value="${esc(draft.url)}" placeholder="https://youtu.be/…" inputmode="url" autocomplete="off"></label><p class="loge-note">Publie d’abord ta vidéo en « Non répertoriée » sur YouTube, puis colle son lien ici.</p>`:''}`;}
function openComposer(){
  const s=session;if(!live(s))return;
  const root=node('loge-compose');if(!root)return;
  if(root.innerHTML){root.hidden=!root.hidden;updateQuota();return;}
  const draft=getDraft('create-post',{title:'',description:'',url:''});
  root.hidden=false;root.innerHTML=`<h2 id="loge-compose-title">Publier une réflexion</h2><form id="loge-new-form">${postFields(draft,true)}<div class="loge-form-actions"><button class="loge-button" type="submit" id="loge-new-submit">Publier</button>${button('Fermer','data-compose-close',true)}</div>${statusMarkup('loge-new-status')}</form>`;
  const form=node('loge-new-form');rememberFields(form,draft,['title','description','url']);
  form.querySelector('[data-compose-close]').onclick=()=>{root.hidden=true;node('loge-open-compose')?.focus({preventScroll:true});updateQuota();};
  form.onsubmit=event=>{
    event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['title','description','url']);
    const url=form.elements.namedItem('url').value.trim();if(!youtubeId(url)){notice('loge-new-status','Utilise un lien vidéo YouTube valide.',true);return;}
    perform('create-post',form,async()=>{
      const result=await request('/api/loge/posts',{method:'POST',body:{title:draft.title.trim(),description:draft.description.trim(),url,requestId:draft.requestId}});
      acceptSelf(result);invalidateOtherViews();forgetDraft('create-post');root.innerHTML='';root.hidden=true;
      const list=node('loge-feed');if(list){node('loge-feed-empty')?.remove();insertPost(result.post,list);node('loge-post-'+result.post.id)?.scrollIntoView({block:'start'});}
      notice('loge-status','Ta réflexion est publiée.');updateQuota();
    },error=>notice('loge-new-status',error.message,true));
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
      for(const field of kind==='post'?['title','description']:['body']){draft[field]=record[field];form.elements.namedItem(field).value=record[field];}
    }
    box.remove();notice(kind==='post'?'loge-post-edit-status-'+id:'loge-comment-edit-status-'+id,action==='keep'?'La version actuelle est chargée. Vérifie ton texte conservé avant de l’enregistrer.':'La version actuelle est chargée.');
  },error=>notice(kind==='post'?'loge-post-edit-status-'+id:'loge-comment-edit-status-'+id,error.message,true));
}
function openPostEdit(id){
  const post=session.posts.get(String(id));if(!canManagePosts()||!post||!own(post))return;
  node('loge-post-'+id)?.querySelector('details')?.removeAttribute('open');
  const root=node('loge-post-editor-'+id);if(root.innerHTML){root.hidden=!root.hidden;return;}
  const draft=getDraft('post-'+id,{title:post.title,description:post.description,revision:post.revision});
  root.hidden=false;root.innerHTML=`<form class="loge-edit-form">${postFields(draft)}<div class="loge-form-actions"><button class="loge-button" type="submit">Enregistrer</button>${button('Fermer','data-edit-close',true)}</div>${statusMarkup('loge-post-edit-status-'+id)}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['title','description']);form.querySelector('[data-edit-close]').onclick=()=>{root.hidden=true;};
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['title','description']);perform('post-'+id,form,async()=>{
    const result=await request('/api/loge/posts/'+encodeURIComponent(id),{method:'PUT',body:{title:draft.title.trim(),description:draft.description.trim(),revision:draft.revision}});
    acceptSelf(result);invalidateOtherViews();updatePost(result.post);forgetDraft('post-'+id);root.innerHTML='';root.hidden=true;notice('loge-post-status-'+id,'Ta réflexion est mise à jour.');
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
function commentCount(postId,change){const post=session.posts.get(String(postId));if(!post)return;post.commentCount=Math.max(0,(post.commentCount||0)+change);const toggle=node('loge-post-'+postId)?.querySelector('[data-comments-open]');if(toggle)toggle.textContent='Commentaires ('+post.commentCount+')';}
function updateComment(comment){const el=node('loge-comment-body-'+comment.id);if(el)el.textContent=comment.body;}
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
  root.hidden=false;root.innerHTML=`<form class="loge-edit-form"><label>Ton commentaire<textarea name="body" required maxlength="2000" rows="3">${esc(draft.body)}</textarea></label><div class="loge-form-actions"><button class="loge-button" type="submit">Enregistrer</button>${button('Fermer','data-edit-close',true)}</div>${statusMarkup('loge-comment-edit-status-'+id)}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['body']);form.querySelector('[data-edit-close]').onclick=()=>{root.hidden=true;};
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['body']);perform('comment-'+id,form,async()=>{
    const result=await request('/api/loge/comments/'+encodeURIComponent(id),{method:'PUT',body:{body:draft.body.trim(),revision:draft.revision}});
    invalidateOtherViews();session.comments.set(String(id),result.comment);updateComment(result.comment);forgetDraft('comment-'+id);root.innerHTML='';root.hidden=true;notice('loge-comment-status-'+id,'Ton commentaire est mis à jour.');
  },error=>{notice('loge-comment-edit-status-'+id,error.message,true);if(error.status===409&&error.data?.conflict)conflict(form,'comment',id,draft);});};
}
function deleteComment(id){
  const comment=session.comments.get(String(id));if(!comment||!own(comment)||!confirm('Supprimer ce commentaire ?'))return;
  perform('comment-'+id,node('loge-comment-'+id),async()=>{
    await request('/api/loge/comments/'+encodeURIComponent(id),{method:'DELETE',body:{revision:comment.revision}});
    invalidateOtherViews();commentCount(comment.postId,-1);session.comments.delete(String(id));forgetDraft('comment-'+id);node('loge-comment-'+id)?.remove();notice('loge-comments-status','Ton commentaire est supprimé.');
  },error=>refreshAfterConflict('comment',id,error));
}
function bindCommentComposer(id){
  const draft=getDraft('create-comment-'+id,{body:''}),root=node('loge-comment-compose');
  root.innerHTML=`<form><label>Écrire un commentaire<textarea name="body" required maxlength="2000" rows="3">${esc(draft.body)}</textarea></label><div class="loge-form-actions"><button class="loge-button" type="submit">Publier le commentaire</button></div>${statusMarkup('loge-comment-create-status')}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['body']);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['body']);perform('create-comment-'+id,form,async()=>{
    const result=await request(`/api/loge/posts/${encodeURIComponent(id)}/comments`,{method:'POST',body:{body:draft.body.trim(),requestId:draft.requestId}});
    invalidateOtherViews();if(!session.comments.has(String(result.comment.id)))commentCount(id,1);node('loge-comments-empty')?.remove();insertComment(result.comment,node('loge-comments-list'));draft.body='';draft.requestId=crypto.randomUUID();form.elements.namedItem('body').value='';
    notice('loge-comment-create-status','Ton commentaire est publié.');
  },error=>notice('loge-comment-create-status',error.message,true));};
}

function invalidateOtherViews(){const s=session;for(const view of s.views.values())if(view!==s.current){view.dirty=true;view.version++;}}
function commentsMarkup(drawer=false){return `<header class="loge-comments-heading"><h2 id="loge-comments-title">Commentaires</h2>${drawer?button('Fermer','data-discussion-close aria-label="Fermer les commentaires"',true):''}</header><div class="loge-comments-scroll" id="loge-comments-scroll"><div id="loge-comments-list"></div>${button('Voir d’autres commentaires','id="loge-comments-more"',true)}${statusMarkup('loge-comments-status')}</div><div id="loge-comment-compose" class="loge-comment-composer"></div>`;}
function bindComments(panel){
  const s=session;node('loge-comments-more').onclick=()=>loadComments(panel.postId,panel.next);
  panel.root.querySelector('[data-discussion-close]')?.addEventListener('click',()=>closeDiscussion());bindCommentComposer(panel.postId);
  panel.root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeDiscussion();}});
}
function closeDiscussion(){
  const view=session?.current,panel=view?.activePanel;if(!panel||view.kind!=='feed')return;
  panel.scrollTop=node('loge-comments-scroll')?.scrollTop||0;panel.root.remove();
  const card=node('loge-post-'+panel.postId);card?.classList.remove('is-comments-open');
  const slot=node('loge-panel-slot-'+panel.postId);if(slot)slot.hidden=true;
  const toggle=card?.querySelector('[data-comments-open]');toggle?.setAttribute('aria-expanded','false');toggle?.focus({preventScroll:true});
  view.activePanel=null;view.player?.resume();refreshLayout(view);
}
async function openDiscussion(postId){
  const s=session,view=s.current;if(view.kind!=='feed')return;
  if(String(view.activePanel?.postId)===String(postId)){closeDiscussion();return;}
  closeDiscussion();
  let panel=view.panels.get(String(postId));
  if(!panel){panel={postId,root:document.createElement('section'),next:null,loaded:false,loading:false,focusComment:null,scrollTop:0};panel.root.className='loge-comments-panel';panel.root.setAttribute('aria-labelledby','loge-comments-title');panel.root.innerHTML=commentsMarkup(true);view.panels.set(String(postId),panel);}
  if(panel.dirty){panel.root.innerHTML=commentsMarkup(true);panel.loaded=false;panel.bound=false;panel.next=null;panel.dirty=false;}
  view.activePanel=panel;view.player?.pause();node('loge-panel-slot-'+postId).hidden=false;node('loge-panel-slot-'+postId).append(panel.root);
  const card=node('loge-post-'+postId);card.classList.add('is-comments-open');card.querySelector('[data-comments-open]').setAttribute('aria-expanded','true');
  if(!panel.bound){bindComments(panel);panel.bound=true;}else node('loge-comments-scroll').scrollTop=panel.scrollTop;
  refreshLayout(view);panel.root.querySelector('[data-discussion-close]')?.focus({preventScroll:true});
  if(!panel.loaded)await loadComments(postId);
}
async function loadComments(id,after=null){
  const s=session,view=s.current,panel=view.activePanel;if(!panel||String(panel.postId)!==String(id)||panel.loading)return;
  panel.loading=true;const more=node('loge-comments-more');if(more)more.disabled=true;
  try{
    const query=new URLSearchParams();if(after!==null)query.set('after',after);else if(panel.focusComment)query.set('focus',panel.focusComment);
    const result=await request(`/api/loge/posts/${encodeURIComponent(id)}/comments${query.size?'?'+query:''}`);
    if(s.current!==view||view.activePanel!==panel)return;
    const list=node('loge-comments-list');for(const comment of result.comments)insertComment(comment,list);
    if(!list.querySelector('[data-comment-id]'))list.innerHTML='<p class="loge-empty" id="loge-comments-empty">Aucun commentaire pour le moment.</p>';
    panel.loaded=true;panel.next=result.next;const next=node('loge-comments-more');next.hidden=result.next==null;next.disabled=false;
    if(panel.focusComment){const target=node('loge-comment-'+panel.focusComment);if(target){target.classList.add('is-focused');target.setAttribute('tabindex','-1');target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}panel.focusComment=null;}
    return true;
  }catch(error){
    if(live(s)&&s.current===view&&view.activePanel===panel&&error.status===404&&after===null&&panel.focusComment){panel.focusComment=null;panel.loading=false;const loaded=await loadComments(id);if(loaded&&live(s)&&s.current===view)notice('loge-comments-status','Ce commentaire n’est plus disponible. Les autres échanges sont affichés.');return loaded;}
    if(live(s)&&s.current===view&&view.activePanel===panel&&error.name!=='AbortError')notice('loge-comments-status',error.message,true);
    return false;
  }finally{panel.loading=false;if(live(s)&&s.current===view&&view.activePanel===panel&&node('loge-comments-more'))node('loge-comments-more').disabled=false;}
}
function interventionMarkup(comment){return `<article class="loge-intervention" data-intervention-id="${esc(comment.id)}"><header>${stamp(comment.createdAt)}<span>Chez <a href="${memberPath(comment.post.author.id)}" data-link>${esc(comment.post.author.username)}</a></span></header><h2><a href="${postPath(comment.post.id)}?comment=${encodeURIComponent(comment.id)}" data-link>${esc(comment.post.title)}</a></h2><p>${esc(comment.body)}</p><a class="loge-text-link" href="${postPath(comment.post.id)}?comment=${encodeURIComponent(comment.id)}" data-link>Retrouver l’échange</a></article>`;}
function addProfileRows(view,result){
  const list=node('loge-profile-list');
  if(view.tab==='reflexions')for(const post of result.posts||[])insertPost(post,list);
  else for(const comment of result.interventions||[]){if(String(comment.post?.author?.id)===String(view.memberId)||view.interventions.has(String(comment.id)))continue;view.interventions.add(String(comment.id));list.insertAdjacentHTML('beforeend',interventionMarkup(comment));}
  if(!view.posts.size&&!view.interventions.size)list.innerHTML=`<p class="loge-empty">${view.tab==='reflexions'?'Aucune réflexion publiée pour le moment.':'Aucune intervention chez un autre membre pour le moment.'}</p>`;
  view.next=result.next;const next=node('loge-profile-more');next.hidden=result.next==null;next.disabled=false;
}
async function moreProfile(){
  const s=session,view=s.current;if(view.loading||view.next==null)return;view.loading=true;node('loge-profile-more').disabled=true;
  try{const result=await request(view.endpoint+'&after='+encodeURIComponent(view.next));acceptSelf(result);addProfileRows(view,result);}
  catch(error){if(live(s)&&s.current===view&&error.name!=='AbortError')notice('loge-status',error.message,true);}
  finally{view.loading=false;if(live(s)&&s.current===view&&node('loge-profile-more'))node('loge-profile-more').disabled=false;}
}
function feedPagination(view){
  view.paginationObserver?.disconnect();
  if(typeof IntersectionObserver!=='function'||view.next==null)return;
  const sentinel=view.root.querySelector('.loge-feed-pagination');if(!sentinel)return;
  const s=session;view.paginationObserver=new IntersectionObserver(entries=>{if(live(s)&&s.current===view&&entries.some(entry=>entry.isIntersecting)&&view.next!=null&&!view.loading)moreFeed();},{root:view.root.querySelector('.loge-reels'),rootMargin:'0px 0px 100% 0px'});view.paginationObserver.observe(sentinel);
}
async function moreFeed(){
  const s=session,view=s.current;if(view.loading||view.next==null)return;view.loading=true;node('loge-feed-more').disabled=true;
  try{const result=await request('/api/loge?after='+encodeURIComponent(view.next));acceptSelf(result);for(const post of result.posts)insertPost(post,node('loge-feed'));view.next=result.next;const more=node('loge-feed-more');more.hidden=result.next==null;more.disabled=false;feedPagination(view);view.player?.refresh();}
  catch(error){if(live(s)&&s.current===view&&error.name!=='AbortError')notice('loge-status',error.message,true);}
  finally{view.loading=false;if(live(s)&&s.current===view&&node('loge-feed-more'))node('loge-feed-more').disabled=false;}
}
function renderView(view,result){
  view.player?.destroy();view.player=null;view.paginationObserver?.disconnect();view.paginationObserver=null;
  const s=session;view.posts.clear();view.comments.clear();view.interventions.clear();view.panels.clear();view.activePanel=null;
  if(view.kind==='feed'){
    document.title='Loge virtuelle · White Cadae';
    shell(`${heading('Loge virtuelle',button('Publier','id="loge-open-compose" aria-controls="loge-compose"')+profileLink())}<p id="loge-quota" class="loge-note"></p><section id="loge-compose" class="loge-compose loge-composer-sheet" role="dialog" aria-modal="true" aria-labelledby="loge-compose-title" hidden></section><div id="loge-feed" class="loge-reels" aria-label="Réflexions en vidéo"><div class="loge-feed-pagination">${button('Voir la suite','id="loge-feed-more"',true)}</div></div>`);
    node('loge-open-compose').onclick=openComposer;node('loge-feed-more').onclick=moreFeed;
    for(const post of result.posts)insertPost(post,node('loge-feed'));
    if(!view.posts.size)node('loge-feed').insertAdjacentHTML('afterbegin','<p class="loge-empty" id="loge-feed-empty">Aucune réflexion n’a encore été publiée.</p>');
    view.next=result.next;node('loge-feed-more').hidden=result.next==null;node('loge-feed-more').closest('.loge-feed-pagination').hidden=result.next==null;updateQuota();
  }else if(view.kind==='profile'){
    view.member=result.member;document.title=result.member.username+' · Loge virtuelle · White Cadae';
    shell(`<div class="loge-top-links"><a href="${base}" data-link>Loge virtuelle</a>${String(view.memberId)!==String(s.user)?profileLink():''}</div>${heading(result.member.username)}<nav class="loge-tabs" aria-label="Historique de ${esc(result.member.username)}"><a href="${memberPath(view.memberId)}?onglet=reflexions" data-link ${view.tab==='reflexions'?'aria-current="page"':''}>Réflexions</a><a href="${memberPath(view.memberId)}?onglet=interventions" data-link ${view.tab==='interventions'?'aria-current="page"':''}>Interventions</a></nav><div id="loge-profile-list" class="loge-feed"></div>${button('Voir la suite','id="loge-profile-more"',true)}`);
    node('loge-profile-more').onclick=moreProfile;addProfileRows(view,result);
  }else{
    document.title=result.post.title+' · Loge virtuelle · White Cadae';
    shell(`<div class="loge-top-links"><a href="${base}" data-link>Loge virtuelle</a>${profileLink()}</div><div id="loge-detail-post"></div><section class="loge-comments" id="loge-detail-comments" aria-labelledby="loge-comments-title">${commentsMarkup()}</section>`);
    insertPost(result.post,node('loge-detail-post'),true);
    const panel={postId:view.postId,root:node('loge-detail-comments'),loaded:false,loading:false,next:null,focusComment:view.focusComment};view.activePanel=panel;view.panels.set(String(view.postId),panel);bindComments(panel);
  }
  view.title=document.title;view.loadedAt=Date.now();view.dirty=false;view.renderedGeneration=view.dataGeneration;
}
function parseDestination(destination){
  let url;try{url=new URL(destination,location.origin||'https://whitecadae.fr');}catch{return null;}
  if(url.origin!==(location.origin||'https://whitecadae.fr'))return null;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  if(path===base)return {key:base,kind:'feed',endpoint:'/api/loge',openCompose:url.searchParams.has('publier')};
  const member=/^\/loge-virtuelle\/membres\/([1-9]\d*)$/.exec(path);
  if(member){const tab=url.searchParams.get('onglet')==='interventions'?'interventions':'reflexions';return {key:memberPath(member[1])+'?onglet='+tab,kind:'profile',memberId:member[1],tab,endpoint:'/api/loge/membres/'+member[1]+'?tab='+tab};}
  const post=/^\/loge-virtuelle\/publications\/([1-9]\d*)$/.exec(path);
  if(post){const focus=url.searchParams.get('comment');return {key:postPath(post[1])+(focus?'?comment='+encodeURIComponent(focus):''),kind:'post',postId:post[1],focusComment:focus,endpoint:'/api/loge/posts/'+post[1]};}
  return null;
}
function makeView(spec){return {...spec,root:null,data:null,dataGeneration:0,renderedGeneration:0,fetching:null,version:1,destroyed:false,dirty:false,loadedAt:0,scrollY:0,reelScroll:0,posts:new Map(),comments:new Map(),interventions:new Set(),panels:new Map(),activePanel:null,next:null,loading:false,player:null,paginationObserver:null};}
async function fetchView(view){
  const s=session;if(view.fetching)return view.fetching;
  view.fetching=(async()=>{const result=await request(view.endpoint,{}, {view,background:true});acceptSelf(result);view.data=result;view.dataGeneration++;view.loadedAt=Date.now();view.dirty=false;return result;})();
  try{return await view.fetching;}finally{view.fetching=null;}
}
function saveView(view){
  if(!view?.root)return;view.scrollY=window.scrollY||0;view.reelScroll=view.root.querySelector('.loge-reels')?.scrollTop||0;
  view.player?.pause();view.paginationObserver?.disconnect();view.paginationObserver=null;
}
function restoreView(view){
  const s=session,scroll=()=>{if(!live(s)||s.current!==view)return;const reels=view.root.querySelector('.loge-reels');if(reels)reels.scrollTop=view.reelScroll;window.scrollTo?.(0,view.scrollY);if(view.player){view.player.resume();view.player.refresh();}else initMedia(view);if(view.activePanel&&view.kind==='feed')view.player?.pause();feedPagination(view);};
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
  if(view.kind==='profile')prefetchDestination(memberPath(view.memberId)+'?onglet='+(view.tab==='reflexions'?'interventions':'reflexions'));
  else if(view.kind==='feed')for(const tab of ['reflexions','interventions'])prefetchDestination(memberPath(session.user)+'?onglet='+tab);
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
    if(!result||view.dirty||Date.now()-view.loadedAt>120000)result=await fetchView(view);
    if(!live(s)||token!==s.navigationVersion||view.destroyed)return;
    if(s.current!==view){s.current?.player?.destroy();if(s.current)s.current.player=null;s.current=view;}
    if(!view.root||view.renderedGeneration!==view.dataGeneration){renderView(view,result);}else{s.ctx.app.replaceChildren(view.root);document.title=view.title;}
    restoreView(view);if(view.openCompose&&view.kind==='feed')openComposer();
    if(view.kind==='post'&&!view.activePanel?.loaded)await loadComments(view.postId);
    if(!live(s)||s.current!==view)return;s.views.delete(view.key);s.views.set(view.key,view);prefetchSibling(view);trimViews();
  }catch(error){
    if(!live(s)||token!==s.navigationVersion)return;
    if(error.name==='AbortError'){if(view.dirty)await navigate(destination);return;}
    if(previous?.root){s.current=previous;s.ctx.app.replaceChildren(previous.root);restoreView(previous);notice('loge-status',error.message,true);if(parseDestination(location.pathname+location.search+location.hash)?.key!==previous.key)await s.ctx.navigate(previous.key,true);}
    else{s.current=view;shell(`${heading('Loge virtuelle')}<p class="loge-empty">${esc(error.message)}</p><a href="${base}" data-link>Réessayer</a>`);}
  }
}
export function leave(){
  const s=session;if(!s)return;
  closeVideo(s);s.closed=true;s.controller.abort();clearTimeout(s.quotaTimer);window.removeEventListener('resize',s.resize);document.removeEventListener('keydown',s.keydown);session=null;
}
export function clear(){leave();drafts.clear();}
export async function page(path,ctx){
  leave();if(!ctx.state.user){ctx.navigate('/connexion?retour='+encodeURIComponent(path+location.search),true);return;}
  if(!parseDestination(path+location.search)){ctx.navigate(base,true);return;}
  if(!document.querySelector('link[href="/loge.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/loge.css';document.head.append(css);}
  const s=session={ctx,user:ctx.state.user.id,controller:new AbortController(),closed:false,blocked:false,pending:new Set(),views:new Map(),current:null,navigationVersion:0,nextPublicationAt:null,clockOffset:0,quotaTimer:null};
  for(const key of ['posts','comments','interventions','next','loading','member'])Object.defineProperty(s,key,{get:()=>s.current?.[key],set:value=>{if(s.current)s.current[key]=value;}});
  Object.defineProperty(s,'view',{get:()=>s.current?.kind});
  s.resize=()=>refreshLayout(s.current);window.addEventListener('resize',s.resize);
  s.keydown=event=>{if(!live(s))return;const compose=node('loge-compose');if(event.key==='Tab'&&compose&&!compose.hidden){const controls=[...compose.querySelectorAll('button,input,textarea,a')].filter(el=>!el.disabled);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}if(event.key!=='Escape')return;if(compose&&!compose.hidden){compose.hidden=true;node('loge-open-compose')?.focus({preventScroll:true});updateQuota();}else if(s.current?.kind==='feed')closeDiscussion();};document.addEventListener('keydown',s.keydown);
  ctx.app.innerHTML='<section class="loge-page"><p class="loge-empty" role="status">Chargement…</p></section>';
  await navigate(path+location.search+location.hash);
}
