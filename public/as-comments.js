import {chatViewport} from './private-chat-scroll.js';

// This component only owns the discussion. It never touches the video iframe.
// A short, relative date, as under a social post.
function when(value){
  const date=new Date(String(value).replace(' ','T')+(String(value).endsWith('Z')?'':'Z')),minutes=Math.round((Date.now()-date)/60000);
  if(!Number.isFinite(minutes))return '';
  if(minutes<1)return 'à l’instant';if(minutes<60)return `il y a ${minutes} min`;
  const hours=Math.round(minutes/60);if(hours<24)return `il y a ${hours} h`;
  const days=Math.round(hours/24);if(days===1)return 'hier';if(days<7)return `il y a ${days} j`;
  return date.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
}
export async function mountComments({root,id,api,user,esc,onDraft,onClose,title='Expansions harmonieuses',placeholder='Ton expansion harmonieuse…'}){
  let alive=true,busy=false,parent=null,requestId=crypto.randomUUID(),replies=[],more=false,membership=null,acknowledged=null;
  const find=selector=>root.querySelector(selector);
  root.innerHTML=`<header class="as-comments-head"><h4>${esc(title)}</h4><button type="button" data-close aria-label="Fermer les expansions harmonieuses"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div data-replies class="as-thread topic-replies" role="log" aria-live="polite" aria-relevant="additions"></div><button type="button" data-new class="private-button subtle as-new" hidden>Voir les nouvelles expansions harmonieuses</button><form class="as-compose"><p data-parent class="as-replying" hidden></p><div class="as-compose-row"><label class="sr-only" for="as-message-${id}">Ta réponse</label><textarea id="as-message-${id}" name="message" maxlength="4000" rows="1" required placeholder="${esc(placeholder)}"></textarea><button type="submit" class="as-send" aria-label="Envoyer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></div><button type="button" data-cancel class="as-cancel" hidden>Annuler la réponse</button></form><p data-status class="private-status" role="status"></p>`;
  const form=find('form'),messages=find('[data-replies]');
  const current=()=>alive&&root.isConnected;
  function status(text='',error=false){if(current()){find('[data-status]').textContent=text;find('[data-status]').classList.toggle('is-error',error);}}
  async function action(button,fn){button.disabled=true;try{await fn();}catch(e){if(current()&&e.name!=='AbortError')status(e.message,true);}finally{if(current())button.disabled=false;}}
  const cancel=()=>{parent=null;find('[data-parent]').hidden=true;find('[data-cancel]').hidden=true;};
  find('[data-close]').onclick=onClose;find('[data-cancel]').onclick=cancel;
  const grow=()=>{const area=form.elements.message;area.style.height='auto';area.style.height=Math.min(area.scrollHeight,160)+'px';};
  form.oninput=()=>{grow();onDraft(!!form.elements.message.value);};
  function render(){
    chatViewport(messages).preserve(()=>{messages.innerHTML=(more?'<button type="button" data-older class="private-button subtle">Réponses précédentes</button>':'')+(replies.map(m=>{
      const ancestor=replies.find(r=>r.id===m.parentId);
      const own=m.author.id===user,initial=esc((m.author.username||'?').trim().charAt(0).toUpperCase());
      return `<article class="as-message ace-message topic-reply ${own?'is-self':''} ${m.parentId?'is-reply':''}"><span class="as-avatar" aria-hidden="true">${initial}</span><div class="as-body"><div class="as-bubble"><strong>${esc(own?'Toi':m.author.username)}</strong>${m.parentId?`<small>En réponse à ${esc(ancestor?(ancestor.author.id===user?'toi':ancestor.author.username):'une réponse précédente')}</small>`:''}<p>${esc(m.text)}</p></div><div class="as-meta"><time datetime="${esc(m.createdAt)}">${esc(when(m.createdAt))}</time><button type="button" data-reply="${m.id}">Répondre</button>${own?`<button type="button" data-delete="${m.id}">Supprimer</button>`:`<button type="button" data-report="${m.id}">Signaler</button>`}</div></div></article>`;
    }).join('')||'<p class="as-empty">Aucune expansion harmonieuse pour le moment.</p>');});
    root.querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>{parent=Number(b.dataset.reply);const m=replies.find(r=>r.id===parent);find('[data-parent]').textContent='En réponse à '+(m.author.id===user?'toi':m.author.username);find('[data-parent]').hidden=false;find('[data-cancel]').hidden=false;form.elements.message.focus({preventScroll:true});});
    root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>action(b,async()=>{await api('/api/ace-circles/messages/'+b.dataset.delete,{method:'DELETE',body:{}});await refresh(true);}));
    root.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>{
      const m=replies.find(r=>r.id===Number(b.dataset.report));
      if(find('[data-report-form]'))find('[data-report-form]').remove();
      const report=document.createElement('form');report.dataset.reportForm='';report.className='as-report';report.innerHTML='<label>Motif du signalement<textarea name="reason" required maxlength="1000" rows="2"></textarea></label><div class="private-actions"><button class="private-button" type="submit">Signaler cette réponse</button><button class="private-button subtle" type="button">Annuler</button></div>';
      b.closest('.as-body').append(report);report.querySelector('[type=button]').onclick=()=>report.remove();report.onsubmit=e=>{e.preventDefault();action(report.querySelector('[type=submit]'),async()=>{await api('/api/ace-circles/reports',{method:'POST',body:{owner:topicOwner,messageId:m.id,reason:report.elements.reason.value}});report.remove();status('Signalement enregistré.');});};
    });
    if(find('[data-older]'))find('[data-older]').onclick=()=>action(find('[data-older]'),async()=>{const data=await api('/api/ace-circles/topics/'+id+'?before='+replies[0].id);if(!current())return;if(data.membership!==membership)throw new Error('Les accès ont changé.');replies=[...data.replies,...replies];more=data.more;render();});
  }
  let topicOwner=null;
  async function refresh(reset=false){
    if(!current()||busy||root.hidden)return;busy=true;
    try{
      if(replies.length>400)reset=true;
      const last=replies.at(-1)?.id||0;
      const data=await api('/api/ace-circles/topics/'+id+(!reset&&last?'?after='+last+'&known='+replies.map(r=>r.id).join(','):''));if(!current())return;
      if(membership!==null&&data.membership!==membership)throw Object.assign(new Error('Les accès ont changé.'),{status:403});
      membership=data.membership;topicOwner=data.topic.owner;
      if(reset||!last){replies=data.replies;more=data.more;render();}
      else if(data.replies.length||data.removed?.length){replies=replies.filter(r=>!data.removed?.includes(r.id));const ids=new Set(replies.map(r=>r.id));replies.push(...data.replies.filter(r=>!ids.has(r.id)));if(data.removed?.includes(parent))cancel();render();}
      find('[data-new]').hidden=reset||!data.more;
      // Acknowledge only what is new: an idle panel writes nothing.
      const read=replies.at(-1)?.id;if(read&&read!==acknowledged){await api('/api/ace-circles/topics/'+id+'/read',{method:'PUT',body:{lastId:read}});acknowledged=read;}
      status();
    }catch(e){
      if(current()&&[401,403,404,409].includes(e.status)){root.replaceChildren();const note=document.createElement('p');note.textContent='Ces expansions harmonieuses ne sont plus accessibles.';root.append(note);alive=false;onDraft(false);}throw e;
    }finally{busy=false;}
  }
  find('[data-new]').onclick=()=>action(find('[data-new]'),()=>refresh(true));
  form.onsubmit=e=>{e.preventDefault();action(form.querySelector('[type=submit]'),async()=>{await api('/api/ace-circles/topics/'+id+'/replies',{method:'POST',body:{id:requestId,text:form.elements.message.value,parentId:parent}});if(!current())return;requestId=crypto.randomUUID();form.elements.message.value='';grow();onDraft(false);cancel();await refresh();chatViewport(messages).toEnd?.();});};
  await refresh(true);
  return {refresh,destroy(){alive=false;root.remove();},hasDraft:()=>!!form.elements.message.value};
}
