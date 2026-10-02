import {seal,unseal,tagHash,fail,text,identifier,integer} from './private-data.js';
import {circleAccess,freshAccess,requireStorage,requireLevel} from './private-access.js';
import {recordTopic} from './circle-topics.js';
export const EVENT_KINDS=['rencontre','famille','relation','études','travail','santé','changement','réussite','perte','autre'];
export const EVENT_IMPACTS=['ressource','difficulté','mixte','à explorer'];
const context=(owner,id)=>`life:${owner}:${id}`;
function date(value,precision){
  if(precision==='unknown')return '9999-12-31';
  const re=precision==='year'?/^\d{4}$/:precision==='month'?/^\d{4}-\d{2}$/:/^\d{4}-\d{2}-\d{2}$/;
  if(typeof value!=='string'||!re.test(value))fail('Choisis un repère temporel valide.');
  const full=value+(precision==='year'?'-01-01':precision==='month'?'-01':'');
  const parsed=new Date(full+'T00:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==full||full<'0001-01-01'||full>new Date().toISOString().slice(0,10))fail('Cette date n’est pas valide.');
  return full;
}
export const CREATION_MEDIA=['musique','vidéo','texte','image','autre'];
function creationLink(value){
  const raw=text(value,2048);if(!raw)return '';let url;try{url=new URL(raw);}catch{fail('Utilise un lien HTTPS valide.');}
  if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||!url.hostname.includes('.'))fail('Utilise un lien HTTPS public sans identifiants.');
  return url.href;
}
function validate(body){
  const entry_type=body.entryType||'event';if(!['event','creation'].includes(entry_type))fail('Type de contenu invalide.');
  const creation=entry_type==='creation'?{medium:body.medium,url:creationLink(body.url),work:text(body.work,12000)}:null;
  if(creation&&(!CREATION_MEDIA.includes(creation.medium)||(!creation.url&&!creation.work)))fail('Ajoute un texte ou un lien à ta création.');
  const precision=body.precision;if(!['day','month','year','period','unknown'].includes(precision))fail('Précise la forme de la date.');
  const sort_date=date(body.date,precision==='period'?'day':precision),end_date=precision==='period'?date(body.endDate,'day'):null;
  if(end_date&&end_date<sort_date)fail('La fin de la période doit suivre son début.');
  if(!EVENT_KINDS.includes(body.kind)||!EVENT_IMPACTS.includes(body.impact))fail('Repère invalide.');
  if(!Array.isArray(body.themes)||body.themes.length>12)fail('Utilise au maximum douze thèmes.');
  const themes=[...new Set(body.themes.map(v=>text(v,60,true)))];
  return {entry_type,sort_date,end_date,precision,kind:body.kind,impact:body.impact,payload:{title:text(body.title,140,true),story:text(body.story,8000),feelings:text(body.feelings),understanding:text(body.understanding),resources:text(body.resources),themes,...(creation?{creation}:{})}};
}
function validateDraft(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Brouillon invalide.');
  const out={};for(const key of ['title','story','feelings','understanding','resources','kind','impact','precision','date','endDate','entryType','medium','url','work'])out[key]=text(value[key],key==='title'?140:key==='work'?12000:key==='url'?2048:['kind','impact','precision','date','endDate','entryType','medium','url','work'].includes(key)?40:8000);
  if(!Array.isArray(value.themes)||value.themes.length>12)fail('Utilise au maximum douze thèmes.');out.themes=value.themes.map(t=>text(t,60,true));out.revision=integer(value.revision||0);return {event:out};
}
async function unpack(env,row){
  const {payload,owner_id,...rest}=row;return {...rest,...await unseal(env,context(owner_id,row.id),payload)};
}
function filteredQuery(url,owner){
  const values=[owner],filters=['e.owner_id=?1'];const add=(sql,value)=>{values.push(value);filters.push(sql.replace('$','?'+values.length));};
  for(const [key,column,allowed] of [['kind','kind',EVENT_KINDS],['impact','impact',EVENT_IMPACTS]])if(url.searchParams.get(key)){const value=url.searchParams.get(key);if(!allowed.includes(value))fail('Filtre invalide.');add('e.'+column+'=$',value);}
  for(const [key,op] of [['from','>='],['to','<=']])if(url.searchParams.get(key))add('e.sort_date'+op+'$',date(url.searchParams.get(key),'day'));
  return {values,filters,add};
}
export async function lifeRoute(request,env,url,user,body,json){
  const suffix=url.pathname.replace(/^\/api\/life-tree/,'').replace(/\/$/,''),method=request.method;
  // Data portability and erasure remain available even after exceptional loss
  // of progression. They never grant access to somebody else's data.
  if((suffix==='/export'&&method==='GET')||(suffix===''&&method==='DELETE')){
    if(method==='DELETE'){
      if(body.confirm!=='SUPPRIMER')fail('Confirme la suppression de ton arbre.');
      await env.DB.batch(['DELETE FROM life_events WHERE owner_id=?1','DELETE FROM life_drafts WHERE owner_id=?1'].map(q=>env.DB.prepare(q).bind(user.id)));
      return json({ok:true});
    }
    const after=url.searchParams.get('after')||'';if(after)identifier(after);
    const rows=(await env.DB.prepare('SELECT * FROM life_events WHERE owner_id=?1 AND id>?2 ORDER BY id LIMIT 31').bind(user.id,after).all()).results;
    const page=rows.slice(0,30),last=page.at(-1)?.id||after;
    const links=(await env.DB.prepare('SELECT * FROM life_links WHERE owner_id=?1 AND source_id>?2 AND source_id<=?3').bind(user.id,after,last).all()).results;
    const drafts=after?[]:(await env.DB.prepare('SELECT * FROM life_drafts WHERE owner_id=?1').bind(user.id).all()).results;
    return json({version:1,next:rows.length>30?last:null,events:await Promise.all(page.map(r=>unpack(env,r))),links:await Promise.all(links.map(async r=>({source:r.source_id,target:r.target_id,...await unseal(env,`link:${user.id}:${r.source_id}:${r.target_id}`,r.payload)}))),drafts:await Promise.all(drafts.map(async r=>({id:r.id,...await unseal(env,`draft:${user.id}:${r.id}`,r.payload)})))},200,{'Content-Disposition':'attachment; filename="arbre-de-vie.json"'});
  }
  const owner=url.searchParams.has('owner')?integer(Number(url.searchParams.get('owner')),1):user.id;
  const access=await circleAccess(env,user,owner,true);
  if(method!=='GET'){if(owner!==user.id)fail('Seul l’auteur peut modifier son arbre.',403);await requireStorage(env,user.id);}
  if(!suffix&&method==='GET'){
    const q=filteredQuery(url,owner),tag=url.searchParams.get('theme'),entryType=url.searchParams.get('entryType');
    if(entryType){if(!['event','creation'].includes(entryType))fail('Filtre invalide.');q.add('e.entry_type=$',entryType);}
    if(owner!==user.id&&!access.circle.combined_sharing)q.filters.push("e.entry_type='event'");
    if(tag)q.add('EXISTS(SELECT 1 FROM life_tags t WHERE t.owner_id=e.owner_id AND t.event_id=e.id AND t.tag_hash=$)',await tagHash(env,owner,text(tag,60,true)));
    const after=url.searchParams.get('after');if(after){if(!/^\d{4}-\d{2}-\d{2}\|[a-zA-Z0-9_-]{8,64}$/.test(after))fail('Page invalide.');q.add("(e.sort_date||'|'||e.id)>$",after);}
    const rows=(await env.DB.prepare(`SELECT e.* FROM life_events e WHERE ${q.filters.join(' AND ')} ORDER BY e.sort_date,e.id LIMIT 31`).bind(...q.values).all()).results;
    const events=await Promise.all(rows.slice(0,30).map(r=>unpack(env,r)));await freshAccess(env,access,user);
    return json({events,next:rows.length>30?`${events.at(-1).sort_date}|${events.at(-1).id}`:null,owner,editable:owner===user.id,sharing:!!access.circle?.share_enabled,kinds:EVENT_KINDS,impacts:EVENT_IMPACTS});
  }
  if(suffix==='/drafts'&&method==='GET'){
    if(owner!==user.id)fail('Brouillons privés.',403);
    const rows=(await env.DB.prepare('SELECT id,revision,updated_at,payload FROM life_drafts WHERE owner_id=?1 ORDER BY updated_at DESC LIMIT 20').bind(owner).all()).results;
    return json({drafts:await Promise.all(rows.map(async r=>({...r,payload:await unseal(env,`draft:${owner}:${r.id}`,r.payload)})))});
  }
  const draft=/^\/drafts\/([a-zA-Z0-9_-]+)$/.exec(suffix);
  if(draft){
    if(owner!==user.id)fail('Brouillons privés.',403);const id=identifier(draft[1]);
    if(method==='DELETE'){await env.DB.prepare('DELETE FROM life_drafts WHERE owner_id=?1 AND id=?2').bind(owner,id).run();return json({ok:true});}
    if(method==='PUT'){
      integer(body.revision);const payload=await seal(env,`draft:${owner}:${id}`,validateDraft(body.event));
      const result=body.revision===0?await env.DB.prepare(`INSERT OR IGNORE INTO life_drafts(owner_id,id,payload) SELECT ?1,?2,?3 WHERE (SELECT count(*) FROM life_drafts WHERE owner_id=?1)<20`).bind(owner,id,payload).run():await env.DB.prepare("UPDATE life_drafts SET payload=?3,revision=revision+1,updated_at=datetime('now') WHERE owner_id=?1 AND id=?2 AND revision=?4").bind(owner,id,payload,body.revision).run();
      if(!result.meta.changes)fail('Ce brouillon a changé ailleurs ou la limite de vingt brouillons est atteinte. Ta saisie reste dans ce formulaire.',409);
      return json({id,revision:body.revision+1});
    }
  }
  const match=/^\/events\/([a-zA-Z0-9_-]+)$/.exec(suffix);
  if(match){
    const id=identifier(match[1]);
    const row=await env.DB.prepare('SELECT * FROM life_events WHERE owner_id=?1 AND id=?2').bind(owner,id).first();
    if(method==='GET'){
      if(!row||owner!==user.id&&row.entry_type==='creation'&&!access.circle.combined_sharing)fail('Contenu indisponible.',404);
      const links=(await env.DB.prepare("SELECT source_id,target_id,payload FROM life_links WHERE owner_id=?1 AND (source_id=?2 OR target_id=?2) AND (?3=1 OR (SELECT count(*) FROM life_events WHERE owner_id=?1 AND id IN(source_id,target_id) AND entry_type='event')=2) LIMIT 40").bind(owner,id,owner===user.id||access.circle.combined_sharing?1:0).all()).results;
      const output={event:await unpack(env,row),links:await Promise.all(links.map(async l=>({...l,payload:await unseal(env,`link:${owner}:${l.source_id}:${l.target_id}`,l.payload)})))};
      await freshAccess(env,access,user);return json(output);
    }
    if(method==='DELETE'){
      const result=await env.DB.prepare('DELETE FROM life_events WHERE owner_id=?1 AND id=?2 AND revision=?3').bind(owner,id,integer(body.revision,1)).run();
      if(!result.meta.changes)fail('Cet événement a changé. Recharge-le avant de le supprimer.',409);return json({ok:true});
    }
    if(method==='PUT'){
      const event=validate(body),revision=integer(body.revision);
      if(row&&event.entry_type!==row.entry_type)fail('Le type de ce contenu ne peut pas être changé.');
      const payload=await seal(env,context(owner,id),event.payload);
      if(row&&row.revision!==revision)fail('Cet événement a été modifié ailleurs. Ta saisie est conservée : recharge la version enregistrée avant de choisir.',409);
      const statements=[revision===0?env.DB.prepare(`INSERT OR IGNORE INTO life_events(id,owner_id,sort_date,end_date,precision,kind,impact,payload,entry_type)
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE (SELECT count(*) FROM life_events WHERE owner_id=?2)<2000`).bind(id,owner,event.sort_date,event.end_date,event.precision,event.kind,event.impact,payload,event.entry_type):
        env.DB.prepare("UPDATE life_events SET sort_date=?3,end_date=?4,precision=?5,kind=?6,impact=?7,payload=?8,revision=revision+1,updated_at=datetime('now') WHERE id=?1 AND owner_id=?2 AND revision=?9").bind(id,owner,event.sort_date,event.end_date,event.precision,event.kind,event.impact,payload,revision)];
      // Payload equality is a per-request CAS marker, including a random nonce.
      statements.push(env.DB.prepare('DELETE FROM life_tags WHERE owner_id=?1 AND event_id=?2 AND EXISTS(SELECT 1 FROM life_events WHERE id=?2 AND payload=?3)').bind(owner,id,payload));
      for(const tag of event.payload.themes)statements.push(env.DB.prepare('INSERT INTO life_tags(owner_id,event_id,tag_hash) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM life_events WHERE id=?2 AND owner_id=?1 AND payload=?4)').bind(owner,id,await tagHash(env,owner,tag),payload));
      statements.push(recordTopic(env,{owner,key:'event:'+id,kind:event.entry_type,event:id,guard:'EXISTS(SELECT 1 FROM life_events WHERE owner_id=?1 AND id=?4 AND payload=?7)',values:[payload]}));
      const [result]=await env.DB.batch(statements);
      if(!result.meta.changes)fail('Enregistrement non effectué : version modifiée ou limite de 2 000 événements atteinte. Ta saisie reste disponible.',409);
      return json({event:await unpack(env,await env.DB.prepare('SELECT * FROM life_events WHERE owner_id=?1 AND id=?2').bind(owner,id).first())});
    }
  }
  if(suffix==='/links'&&(method==='POST'||method==='DELETE')){
    const source=identifier(body.source),target=identifier(body.target);if(source===target)fail('Choisis deux événements différents.');
    if(method==='DELETE'){await env.DB.prepare('DELETE FROM life_links WHERE owner_id=?1 AND source_id=?2 AND target_id=?3').bind(owner,source,target).run();return json({ok:true});}
    const payload=await seal(env,`link:${owner}:${source}:${target}`,{label:text(body.label,200,true)});
    const statement=env.DB.prepare(`INSERT INTO life_links(owner_id,source_id,target_id,payload)
      SELECT ?1,?2,?3,?4 WHERE (SELECT count(*) FROM life_events WHERE owner_id=?1 AND id IN(?2,?3))=2
      AND (SELECT count(*) FROM life_links WHERE owner_id=?1 AND (source_id IN(?2,?3) OR target_id IN(?2,?3)))<40
      ON CONFLICT(owner_id,source_id,target_id) DO UPDATE SET payload=excluded.payload`).bind(owner,source,target,payload);
    const [result]=await env.DB.batch([statement,recordTopic(env,{owner,key:'link:'+source+':'+target,kind:'link',event:source,target,guard:'EXISTS(SELECT 1 FROM life_links WHERE owner_id=?1 AND source_id=?4 AND target_id=?5 AND payload=?7)',values:[payload]})]);
    if(!result.meta.changes)fail('Les deux événements doivent appartenir à ton arbre et avoir moins de quarante liens.');return json({ok:true});
  }
  fail('Page introuvable.',404);
}
