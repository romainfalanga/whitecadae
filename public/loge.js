import {youtubeId,youtubeLink,youtubeEmbed} from './youtube-video.js';

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
function shell(html){session.ctx.app.innerHTML=`<section class="loge-page">${html}${statusMarkup('loge-status')}</section>`;}
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
async function request(path,options={}){
  const s=session;if(!live(s))throw new DOMException('Navigation','AbortError');
  try{
    const result=await s.ctx.api(path,{...options,headers:{...options.headers,'X-WC-User':String(s.user)},signal:s.controller.signal});
    if(!live(s))throw new DOMException('Navigation','AbortError');return result;
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
  const quota=node('loge-quota');if(quota)quota.textContent=text;
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
  const s=session;if(!live(s)||s.pending.has(key))return;
  s.pending.add(key);setBusy(container,true);
  try{await work();}
  catch(error){if(live(s)&&error.name!=='AbortError'){if(error.status===429&&error.data){acceptSelf(error.data);updateQuota();}if(onError)await onError(error);else notice('loge-status',error.message,true);}}
  finally{s.pending.delete(key);if(live(s)&&container?.isConnected!==false){setBusy(container,false);updateQuota();}}
}

function videoMarkup(post){
  const valid=!!youtubeId(post.youtubeUrl);
  return `<div class="loge-video" id="loge-video-${esc(post.id)}" data-video-post="${esc(post.id)}">${valid?`<button type="button" class="loge-video-open" data-video-open="${esc(post.id)}" aria-label="Ouvrir la vidéo : ${esc(post.title)}"><span class="loge-video-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg></span><span>Voir la vidéo</span></button>`:'<p class="loge-video-unavailable">Cette vidéo n’est pas disponible.</p>'}</div>`;
}
function closeVideo(s=session){
  const current=s?.activeVideo;if(!current)return;s.activeVideo=null;
  const container=document.getElementById('loge-video-'+current.id);
  if(container){container.querySelector('iframe')?.remove();const post=s.posts.get(String(current.id));if(post&&session===s&&!s.closed){container.outerHTML=videoMarkup(post);bindVideo(post.id);}}
}
function bindVideo(id){
  const el=node('loge-video-'+id),s=session;if(!el)return;
  el.querySelector('[data-video-open]')?.addEventListener('click',()=>{
    if(!live(s))return;
    const post=s.posts.get(String(id));if(!post||!youtubeId(post.youtubeUrl))return;
    closeVideo(s);window.WCPlayer?.pause();
    const container=node('loge-video-'+id);if(!container)return;
    container.innerHTML=`<iframe src="${esc(youtubeEmbed(post.youtubeUrl,false))}" title="${esc('Vidéo : '+post.title)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="loge-video-options">${button('Fermer le lecteur','data-video-close',true)}<p>Si la vidéo ne se lit pas, <a href="${esc(youtubeLink(post.youtubeUrl))}" target="_blank" rel="noopener noreferrer">ouvre-la sur YouTube<span class="sr-only"> (nouvel onglet)</span></a>.</p></div>`;
    s.activeVideo={id};
    container.querySelector('[data-video-close]').onclick=()=>closeVideo(s);
    container.querySelector('iframe').addEventListener('error',()=>{if(live(s))notice('loge-status','Le lecteur vidéo n’a pas pu être chargé. Tu peux ouvrir la vidéo sur YouTube.',true);});
  });
}

function postMarkup(post,detail=false){
  return `<article class="loge-publication${detail?' is-detail':''}" id="loge-post-${esc(post.id)}" data-post-id="${esc(post.id)}"><header class="loge-post-head">${author(post.author)}${stamp(post.createdAt)}</header><${detail?'h1':'h2'} class="loge-post-title" id="loge-post-title-${esc(post.id)}">${detail?esc(post.title):`<a href="${postPath(post.id)}" data-link>${esc(post.title)}</a>`}</${detail?'h1':'h2'}>${videoMarkup(post)}<p class="loge-description${detail?'':' is-excerpt'}" id="loge-post-description-${esc(post.id)}">${esc(post.description)}</p><footer class="loge-post-actions">${detail?'':`<a href="${postPath(post.id)}" data-link>Commentaires${Number.isInteger(post.commentCount)?' ('+post.commentCount+')':''}</a>`}${own(post)?`<div class="loge-owner-actions">${button('Modifier',`data-post-edit="${esc(post.id)}"`,true)}${button('Supprimer',`data-post-delete="${esc(post.id)}"`,true)}</div>`:''}</footer><div id="loge-post-editor-${esc(post.id)}"></div>${statusMarkup('loge-post-status-'+post.id)}</article>`;
}
function updatePost(post){
  const s=session;s.posts.set(String(post.id),post);
  const title=node('loge-post-title-'+post.id),description=node('loge-post-description-'+post.id);
  if(title){const link=title.querySelector('a');(link||title).textContent=post.title;}
  if(description)description.textContent=post.description;
  const video=node('loge-video-'+post.id);video?.querySelector('[data-video-open]')?.setAttribute('aria-label','Ouvrir la vidéo : '+post.title);
  if(s.view==='post')document.title=post.title+' · Loge virtuelle · White Cadae';
}
function insertPost(post,list,detail=false){
  const s=session;if(s.posts.has(String(post.id))&&node('loge-post-'+post.id)){updatePost(post);return;}
  s.posts.set(String(post.id),post);
  const before=[...list.querySelectorAll('[data-post-id]')].find(el=>Number(el.dataset.postId)<Number(post.id));
  if(before)before.insertAdjacentHTML('beforebegin',postMarkup(post,detail));else list.insertAdjacentHTML('beforeend',postMarkup(post,detail));
  bindVideo(post.id);
  const card=node('loge-post-'+post.id);
  card.querySelector('[data-post-edit]')?.addEventListener('click',()=>openPostEdit(post.id));
  card.querySelector('[data-post-delete]')?.addEventListener('click',()=>deletePost(post.id));
}
function postFields(draft,create=false){return `<label>Titre<input name="title" required maxlength="140" value="${esc(draft.title)}" autocomplete="off"></label><label>Description<textarea name="description" required maxlength="5000" rows="5">${esc(draft.description)}</textarea></label>${create?`<label>Lien de la vidéo YouTube non répertoriée<input name="url" type="url" required maxlength="2048" value="${esc(draft.url)}" placeholder="https://youtu.be/…" inputmode="url" autocomplete="off"></label><p class="loge-note">Publie d’abord ta vidéo en « Non répertoriée » sur YouTube, puis colle son lien ici.</p>`:''}`;}
function openComposer(){
  const s=session;if(!live(s))return;
  const root=node('loge-compose');if(!root)return;
  if(root.innerHTML){root.hidden=!root.hidden;return;}
  const draft=getDraft('create-post',{title:'',description:'',url:''});
  root.hidden=false;root.innerHTML=`<h2>Publier une réflexion</h2><form id="loge-new-form">${postFields(draft,true)}<div class="loge-form-actions"><button class="loge-button" type="submit" id="loge-new-submit">Publier</button>${button('Fermer','data-compose-close',true)}</div>${statusMarkup('loge-new-status')}</form>`;
  const form=node('loge-new-form');rememberFields(form,draft,['title','description','url']);
  form.querySelector('[data-compose-close]').onclick=()=>{root.hidden=true;};
  form.onsubmit=event=>{
    event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['title','description','url']);
    const url=form.elements.namedItem('url').value.trim();if(!youtubeId(url)){notice('loge-new-status','Utilise un lien vidéo YouTube valide.',true);return;}
    perform('create-post',form,async()=>{
      const result=await request('/api/loge/posts',{method:'POST',body:{title:draft.title.trim(),description:draft.description.trim(),url,requestId:draft.requestId}});
      acceptSelf(result);forgetDraft('create-post');root.innerHTML='';root.hidden=true;
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
  const post=session.posts.get(String(id));if(!post||!own(post))return;
  const root=node('loge-post-editor-'+id);if(root.innerHTML){root.hidden=!root.hidden;return;}
  const draft=getDraft('post-'+id,{title:post.title,description:post.description,revision:post.revision});
  root.hidden=false;root.innerHTML=`<form class="loge-edit-form">${postFields(draft)}<div class="loge-form-actions"><button class="loge-button" type="submit">Enregistrer</button>${button('Fermer','data-edit-close',true)}</div>${statusMarkup('loge-post-edit-status-'+id)}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['title','description']);form.querySelector('[data-edit-close]').onclick=()=>{root.hidden=true;};
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['title','description']);perform('post-'+id,form,async()=>{
    const result=await request('/api/loge/posts/'+encodeURIComponent(id),{method:'PUT',body:{title:draft.title.trim(),description:draft.description.trim(),revision:draft.revision}});
    acceptSelf(result);updatePost(result.post);forgetDraft('post-'+id);root.innerHTML='';root.hidden=true;notice('loge-post-status-'+id,'Ta réflexion est mise à jour.');
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
  const s=session,post=s.posts.get(String(id));if(!post||!own(post)||!confirm('Supprimer cette réflexion et ses commentaires ?'))return;
  perform('post-'+id,node('loge-post-'+id),async()=>{
    const result=await request('/api/loge/posts/'+encodeURIComponent(id),{method:'DELETE',body:{revision:post.revision}});
    acceptSelf(result);if(String(s.activeVideo?.id)===String(id))closeVideo(s);s.posts.delete(String(id));forgetDraft('post-'+id);
    if(s.view==='post'){s.ctx.navigate(base,true);return;}
    node('loge-post-'+id)?.remove();notice('loge-status','Ta réflexion est supprimée.');updateQuota();
  },error=>refreshAfterConflict('post',id,error));
}

function commentMarkup(comment){return `<article class="loge-comment" id="loge-comment-${esc(comment.id)}" data-comment-id="${esc(comment.id)}"><header>${author(comment.author)}${stamp(comment.createdAt)}</header><p id="loge-comment-body-${esc(comment.id)}">${esc(comment.body)}</p>${own(comment)?`<div class="loge-owner-actions">${button('Modifier',`data-comment-edit="${esc(comment.id)}"`,true)}${button('Supprimer',`data-comment-delete="${esc(comment.id)}"`,true)}</div>`:''}<div id="loge-comment-editor-${esc(comment.id)}"></div>${statusMarkup('loge-comment-status-'+comment.id)}</article>`;}
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
  const root=node('loge-comment-editor-'+id);if(root.innerHTML){root.hidden=!root.hidden;return;}
  const draft=getDraft('comment-'+id,{body:comment.body,revision:comment.revision});
  root.hidden=false;root.innerHTML=`<form class="loge-edit-form"><label>Ton commentaire<textarea name="body" required maxlength="2000" rows="3">${esc(draft.body)}</textarea></label><div class="loge-form-actions"><button class="loge-button" type="submit">Enregistrer</button>${button('Fermer','data-edit-close',true)}</div>${statusMarkup('loge-comment-edit-status-'+id)}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['body']);form.querySelector('[data-edit-close]').onclick=()=>{root.hidden=true;};
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['body']);perform('comment-'+id,form,async()=>{
    const result=await request('/api/loge/comments/'+encodeURIComponent(id),{method:'PUT',body:{body:draft.body.trim(),revision:draft.revision}});
    session.comments.set(String(id),result.comment);updateComment(result.comment);forgetDraft('comment-'+id);root.innerHTML='';root.hidden=true;notice('loge-comment-status-'+id,'Ton commentaire est mis à jour.');
  },error=>{notice('loge-comment-edit-status-'+id,error.message,true);if(error.status===409&&error.data?.conflict)conflict(form,'comment',id,draft);});};
}
function deleteComment(id){
  const comment=session.comments.get(String(id));if(!comment||!own(comment)||!confirm('Supprimer ce commentaire ?'))return;
  perform('comment-'+id,node('loge-comment-'+id),async()=>{
    await request('/api/loge/comments/'+encodeURIComponent(id),{method:'DELETE',body:{revision:comment.revision}});
    session.comments.delete(String(id));forgetDraft('comment-'+id);node('loge-comment-'+id)?.remove();notice('loge-comments-status','Ton commentaire est supprimé.');
  },error=>refreshAfterConflict('comment',id,error));
}
function bindCommentComposer(id){
  const draft=getDraft('create-comment-'+id,{body:''}),root=node('loge-comment-compose');
  root.innerHTML=`<form><label>Écrire un commentaire<textarea name="body" required maxlength="2000" rows="3">${esc(draft.body)}</textarea></label><div class="loge-form-actions"><button class="loge-button" type="submit">Publier le commentaire</button></div>${statusMarkup('loge-comment-create-status')}</form>`;
  const form=root.querySelector('form');rememberFields(form,draft,['body']);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;readFields(form,draft,['body']);perform('create-comment-'+id,form,async()=>{
    const result=await request(`/api/loge/posts/${encodeURIComponent(id)}/comments`,{method:'POST',body:{body:draft.body.trim(),requestId:draft.requestId}});
    node('loge-comments-empty')?.remove();insertComment(result.comment,node('loge-comments-list'));draft.body='';draft.requestId=crypto.randomUUID();form.elements.namedItem('body').value='';
    notice('loge-comment-create-status','Ton commentaire est publié.');
  },error=>notice('loge-comment-create-status',error.message,true));};
}

async function loadFeed(after=null){
  const s=session;if(s.loading)return;s.loading=true;const more=node('loge-feed-more');if(more)more.disabled=true;
  try{
    const result=await request('/api/loge'+(after!==null?'?after='+encodeURIComponent(after):''));acceptSelf(result);
    if(after===null){
      shell(`${heading('Loge virtuelle',button('Publier','id="loge-open-compose"')+profileLink())}<p id="loge-quota" class="loge-note"></p><section id="loge-compose" class="loge-compose" hidden></section><div id="loge-feed" class="loge-feed"></div>${button('Voir les réflexions précédentes','id="loge-feed-more"',true)}`);
      node('loge-open-compose').onclick=openComposer;node('loge-feed-more').onclick=()=>loadFeed(s.next);
    }
    const list=node('loge-feed');for(const post of result.posts)insertPost(post,list);
    if(!s.posts.size)list.innerHTML='<p class="loge-empty" id="loge-feed-empty">Aucune réflexion n’a encore été publiée.</p>';
    s.next=result.next;const next=node('loge-feed-more');next.hidden=result.next==null;next.disabled=false;updateQuota();
    if(after===null&&new URLSearchParams(location.search).has('publier'))openComposer();
  }catch(error){if(live(s)&&error.name!=='AbortError'){if(after===null)initialError(error);else notice('loge-status',error.message,true);}}
  finally{s.loading=false;if(live(s)&&node('loge-feed-more'))node('loge-feed-more').disabled=false;}
}
async function loadComments(id,after=null){
  const s=session;if(s.loadingComments)return;s.loadingComments=true;const more=node('loge-comments-more');if(more)more.disabled=true;
  try{
    const query=new URLSearchParams();if(after!==null)query.set('after',after);else if(s.focusComment)query.set('focus',s.focusComment);
    const result=await request(`/api/loge/posts/${encodeURIComponent(id)}/comments${query.size?'?'+query:''}`);
    const list=node('loge-comments-list');for(const comment of result.comments)insertComment(comment,list);
    if(!s.comments.size)list.innerHTML='<p class="loge-empty" id="loge-comments-empty">Aucun commentaire pour le moment.</p>';
    s.commentsNext=result.next;const next=node('loge-comments-more');next.hidden=result.next==null;next.disabled=false;
    if(s.focusComment){const target=node('loge-comment-'+s.focusComment);if(target){target.classList.add('is-focused');target.setAttribute('tabindex','-1');target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}s.focusComment=null;}
    return true;
  }catch(error){
    if(live(s)&&error.status===404&&after===null&&s.focusComment){
      s.focusComment=null;s.loadingComments=false;
      const loaded=await loadComments(id);
      if(loaded&&live(s))notice('loge-comments-status','Ce commentaire n’est plus disponible. Les autres échanges sont affichés.');
      return loaded;
    }
    if(live(s)&&error.name!=='AbortError')notice('loge-comments-status',error.message,true);
    return false;
  }
  finally{s.loadingComments=false;if(live(s)&&node('loge-comments-more'))node('loge-comments-more').disabled=false;}
}
async function detailPage(id){
  const s=session,result=await request('/api/loge/posts/'+encodeURIComponent(id));acceptSelf(result);
  document.title=result.post.title+' · Loge virtuelle · White Cadae';
  shell(`<div class="loge-top-links"><a href="${base}" data-link>Loge virtuelle</a>${profileLink()}</div><div id="loge-detail-post"></div><section class="loge-comments" aria-labelledby="loge-comments-title"><h2 id="loge-comments-title">Commentaires</h2><div id="loge-comments-list"></div>${button('Voir d’autres commentaires','id="loge-comments-more"',true)}${statusMarkup('loge-comments-status')}<div id="loge-comment-compose" class="loge-compose"></div></section>`);
  insertPost(result.post,node('loge-detail-post'),true);bindCommentComposer(id);node('loge-comments-more').onclick=()=>loadComments(id,s.commentsNext);await loadComments(id);
}
function interventionMarkup(comment){return `<article class="loge-intervention" data-intervention-id="${esc(comment.id)}"><header>${stamp(comment.createdAt)}<span>Chez <a href="${memberPath(comment.post.author.id)}" data-link>${esc(comment.post.author.username)}</a></span></header><h2><a href="${postPath(comment.post.id)}?comment=${encodeURIComponent(comment.id)}" data-link>${esc(comment.post.title)}</a></h2><p>${esc(comment.body)}</p><a class="loge-text-link" href="${postPath(comment.post.id)}?comment=${encodeURIComponent(comment.id)}" data-link>Retrouver l’échange</a></article>`;}
async function loadProfile(id,tab,after=null){
  const s=session;if(s.loading)return;s.loading=true;const more=node('loge-profile-more');if(more)more.disabled=true;
  try{
    const query=new URLSearchParams({tab});if(after!==null)query.set('after',after);
    const result=await request(`/api/loge/membres/${encodeURIComponent(id)}?${query}`);acceptSelf(result);
    if(after===null){
      s.member=result.member;document.title=result.member.username+' · Loge virtuelle · White Cadae';
      shell(`<div class="loge-top-links"><a href="${base}" data-link>Loge virtuelle</a>${String(id)!==String(s.user)?profileLink():''}</div>${heading(result.member.username)}<nav class="loge-tabs" aria-label="Historique de ${esc(result.member.username)}"><a href="${memberPath(id)}?onglet=reflexions" data-link ${tab==='reflexions'?'aria-current="page"':''}>Réflexions</a><a href="${memberPath(id)}?onglet=interventions" data-link ${tab==='interventions'?'aria-current="page"':''}>Interventions</a></nav><div id="loge-profile-list" class="loge-feed"></div>${button('Voir la suite','id="loge-profile-more"',true)}`);
      node('loge-profile-more').onclick=()=>loadProfile(id,tab,s.next);
    }
    const list=node('loge-profile-list');
    if(tab==='reflexions')for(const post of result.posts||[])insertPost(post,list);
    else for(const comment of result.interventions||[]){if(String(comment.post?.author?.id)===String(id)||s.interventions.has(String(comment.id)))continue;s.interventions.add(String(comment.id));list.insertAdjacentHTML('beforeend',interventionMarkup(comment));}
    if(!s.posts.size&&!s.interventions.size)list.innerHTML=`<p class="loge-empty">${tab==='reflexions'?'Aucune réflexion publiée pour le moment.':'Aucune intervention chez un autre membre pour le moment.'}</p>`;
    s.next=result.next;const next=node('loge-profile-more');next.hidden=result.next==null;next.disabled=false;
  }catch(error){if(live(s)&&error.name!=='AbortError'){if(after===null)initialError(error);else notice('loge-status',error.message,true);}}
  finally{s.loading=false;if(live(s)&&node('loge-profile-more'))node('loge-profile-more').disabled=false;}
}
function initialError(error){
  shell(`${heading('Loge virtuelle')}<p class="loge-empty">${esc(error.message)}</p><a href="${esc(location.pathname+location.search)}" data-link>Réessayer</a><p><a href="${base}" data-link>Retrouver la Loge virtuelle</a></p>`);
}
export function leave(){
  const s=session;if(!s)return;
  closeVideo(s);s.closed=true;s.controller.abort();clearTimeout(s.quotaTimer);
  window.removeEventListener('wc:music',s.music);window.removeEventListener('wc:musicplaying',s.musicPlaying);session=null;
}
export function clear(){leave();drafts.clear();}
export async function page(path,ctx){
  leave();
  if(!ctx.state.user){ctx.navigate('/connexion?retour='+encodeURIComponent(path+location.search),true);return;}
  const matchPost=/^\/loge-virtuelle\/publications\/([1-9]\d*)$/.exec(path),matchMember=/^\/loge-virtuelle\/membres\/([1-9]\d*)$/.exec(path);
  if(path!==base&&!matchPost&&!matchMember){ctx.navigate(base,true);return;}
  if(!document.querySelector('link[href="/loge.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/loge.css';document.head.append(css);}
  const s=session={ctx,user:ctx.state.user.id,controller:new AbortController(),closed:false,blocked:false,pending:new Set(),posts:new Map(),comments:new Map(),interventions:new Set(),next:null,commentsNext:null,nextPublicationAt:null,clockOffset:0,quotaTimer:null,loading:false,loadingComments:false,activeVideo:null,view:matchPost?'post':matchMember?'profile':'feed',focusComment:new URLSearchParams(location.search).get('comment')};
  s.music=event=>{if(event.detail?.playing)closeVideo(s);};s.musicPlaying=()=>closeVideo(s);
  window.addEventListener('wc:music',s.music);window.addEventListener('wc:musicplaying',s.musicPlaying);
  document.title='Loge virtuelle · White Cadae';shell('<p class="loge-empty" role="status">Chargement…</p>');
  try{
    if(matchPost)await detailPage(matchPost[1]);
    else if(matchMember){const tab=new URLSearchParams(location.search).get('onglet')==='interventions'?'interventions':'reflexions';await loadProfile(matchMember[1],tab);}
    else await loadFeed();
  }catch(error){if(live(s)&&error.name!=='AbortError')initialError(error);}
}
