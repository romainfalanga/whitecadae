import {seal,unseal,fail,text,integer,identifier} from './private-data.js';
import {circleAccess,freshAccess,writeGuard,requireContentAccess} from './private-access.js';
import {youtubeLink} from '../public/youtube-video.js';

export function recordTopic(env,{owner,key,kind,event=null,target=null,slot=null,guard='1',values=[]}){
  return env.DB.prepare(`INSERT INTO circle_topics(owner_id,resource_key,kind,event_id,target_id,mechanism_slot)
    SELECT ?1,?2,?3,?4,?5,?6 WHERE ${guard}
    ON CONFLICT(owner_id,resource_key) DO UPDATE SET kind=excluded.kind,revision=revision+1,updated_at=strftime('%Y-%m-%d %H:%M:%f','now')`)
    .bind(owner,key,kind,event,target,slot,...values);
}
async function accessTo(env,user,owner){
  const access=await circleAccess(env,user,owner);
  requireContentAccess(access,user);
  return access;
}
const replyContext=(owner,author,key)=>`message:${owner}:${author}:${key}`;
function visible(access,user){return {sql:`m.owner_id=?1 AND m.id>=?2 AND NOT EXISTS(SELECT 1 FROM ace_blocks b WHERE (b.user_id=?3 AND b.blocked_id=m.author_id) OR (b.blocked_id=?3 AND b.user_id=m.author_id))`,values:[access.owner,access.member?.joined_seq||0,user.id]};}
async function topicContent(env,row){
  if(row.kind==='mechanism'){
    const value=row.source_payload!==undefined?{payload:row.source_payload}:await env.DB.prepare('SELECT payload FROM user_mechanisms WHERE owner_id=?1 AND slot=?2').bind(row.owner_id,row.mechanism_slot).first();
    if(!value)fail('Ce contenu a été retiré.',404);
    const mechanism=await unseal(env,`mechanism:${row.owner_id}:${row.mechanism_slot}`,value.payload);
    return {title:mechanism.title||'Mécanisme effacé',mechanism:{slot:row.mechanism_slot,...mechanism}};
  }
  const value=row.source_payload!==undefined?{payload:row.source_payload}:await env.DB.prepare('SELECT payload FROM life_events WHERE owner_id=?1 AND id=?2').bind(row.owner_id,row.event_id).first();
  if(!value)fail('Ce contenu a été retiré.',404);
  const event=await unseal(env,`life:${row.owner_id}:${row.event_id}`,value.payload);
  if(row.kind==='link'){
    const link=row.link_payload!==undefined?{payload:row.link_payload}:await env.DB.prepare('SELECT payload FROM life_links WHERE owner_id=?1 AND source_id=?2 AND target_id=?3').bind(row.owner_id,row.event_id,row.target_id).first();
    const target=row.target_payload!==undefined?{payload:row.target_payload}:await env.DB.prepare('SELECT payload FROM life_events WHERE owner_id=?1 AND id=?2').bind(row.owner_id,row.target_id).first();
    if(!link||!target)fail('Ce lien a été retiré.',404);
    return {title:event.title+' — '+(await unseal(env,`life:${row.owner_id}:${row.target_id}`,target.payload)).title,link:(await unseal(env,`link:${row.owner_id}:${row.event_id}:${row.target_id}`,link.payload)).label};
  }
  return {title:event.title,...(row.video_branch?{video:{url:youtubeLink(event.creation?.url),notes:event.creation?.work||'',understanding:event.understanding||''}}:{})};
}
const topicView=(row,content)=>({id:row.id,owner:row.owner_id,kind:row.kind,eventId:row.event_id,targetId:row.target_id,slot:row.mechanism_slot,videoBranch:row.kind==='creation'?row.video_branch||null:null,archived:row.kind!=='creation'||!row.video_branch,revision:row.revision,updatedAt:row.updated_at,...content});
async function freshTopic(env,access,user,topic){await freshAccess(env,access,user);if(!await env.DB.prepare('SELECT 1 FROM circle_topics WHERE id=?1 AND revision=?2').bind(topic.id,topic.revision).first())fail('Ce contenu a changé. Recharge la discussion.',409);}

export async function topicsRoute(request,env,url,user,body,json){
  const method=request.method,feed=/^\/api\/ace-circles\/(\d+)\/topics$/.exec(url.pathname),detail=/^\/api\/ace-circles\/topics\/(\d+)(?:\/(replies|read))?$/.exec(url.pathname);
  if(feed&&method==='GET'){
    const owner=integer(Number(feed[1]),1),access=await accessTo(env,user,owner),v=visible(access,user);
    const archive=url.searchParams.get('archive')==='1';if(archive&&owner!==user.id)fail('Archives privées.',403);
    const stamp=`${access.circle.access_revision}:${access.circle.content_revision}`;
    if(url.searchParams.get('revision')===stamp){await freshAccess(env,access,user);return json({unchanged:true,revision:stamp});}
    const values=[owner,user.id,access.member?.joined_seq||0];let filter=archive?'AND (e.video_branch IS NULL OR t.kind<>\'creation\')':"AND e.video_branch IS NOT NULL AND t.kind='creation'";const after=url.searchParams.get('after');
    if(after){if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?\|\d+$/.test(after))fail('Page invalide.');const [date,id]=after.split('|');values.push(date,integer(Number(id),1));filter+=' AND (t.updated_at<?4 OR (t.updated_at=?4 AND t.id<?5))';}
    const visibleReply=`m.owner_id=t.owner_id AND m.topic_id=t.id AND m.kind='message' AND m.id>=?3 AND NOT EXISTS(SELECT 1 FROM ace_blocks b WHERE (b.user_id=?2 AND b.blocked_id=m.author_id) OR (b.blocked_id=?2 AND b.user_id=m.author_id))`;
    const rows=(await env.DB.prepare(`SELECT t.*,e.video_branch,COALESCE(e.payload,u.payload) AS source_payload,l.payload AS link_payload,target.payload AS target_payload,
      (SELECT count(*) FROM ace_messages m WHERE ${visibleReply}) AS reply_count,
      (SELECT count(*) FROM ace_messages m WHERE ${visibleReply} AND m.author_id<>?2 AND m.id>COALESCE((SELECT last_id FROM circle_topic_reads WHERE topic_id=t.id AND reader_id=?2),0)) AS unread_count
      FROM circle_topics t LEFT JOIN life_events e ON e.owner_id=t.owner_id AND e.id=t.event_id
      LEFT JOIN user_mechanisms u ON u.owner_id=t.owner_id AND u.slot=t.mechanism_slot
      LEFT JOIN life_links l ON l.owner_id=t.owner_id AND l.source_id=t.event_id AND l.target_id=t.target_id
      LEFT JOIN life_events target ON target.owner_id=t.owner_id AND target.id=t.target_id
      WHERE t.owner_id=?1 ${filter} ORDER BY t.updated_at DESC,t.id DESC LIMIT 21`).bind(...values).all()).results;
    const topics=await Promise.all(rows.slice(0,20).map(async row=>{
      const content=await topicContent(env,row);
      return {...topicView(row,{title:content.title}),replies:row.reply_count,unread:row.unread_count};
    }));
    await freshAccess(env,access,user);return json({topics,revision:stamp,next:rows.length>20?`${rows[19].updated_at}|${rows[19].id}`:null});
  }
  if(!detail)fail('Discussion indisponible.',404);
  const id=integer(Number(detail[1]),1),topic=await env.DB.prepare('SELECT t.*,e.video_branch FROM circle_topics t LEFT JOIN life_events e ON e.owner_id=t.owner_id AND e.id=t.event_id WHERE t.id=?1').bind(id).first();
  if(!topic)fail('Discussion indisponible.',404);
  const isVideo=topic.kind==='creation'&&!!topic.video_branch;
  if(!isVideo&&user.id!==topic.owner_id)fail('Archives privées.',403);
  if(!isVideo&&!['GET'].includes(method))fail('Cette discussion est archivée.',410);
  const access=await accessTo(env,user,topic.owner_id),v=visible(access,user);
  if(method==='GET'){
    const after=integer(Number(url.searchParams.get('after')||0)),before=integer(Number(url.searchParams.get('before')||0));if(after&&before)fail('Page invalide.');
    const knownValue=url.searchParams.get('known');let removed=[];
    if(knownValue){
      if(!/^\d+(,\d+){0,399}$/.test(knownValue))fail('Page invalide.');
      const known=[...new Set(knownValue.split(',').map(n=>integer(Number(n),1)))];
      const present=new Set((await env.DB.prepare(`SELECT m.id FROM ace_messages m WHERE ${v.sql} AND m.topic_id=?4 AND m.id IN(SELECT value FROM json_each(?5))`).bind(...v.values,id,JSON.stringify(known)).all()).results.map(m=>m.id));
      removed=known.filter(id=>!present.has(id));
    }
    const rows=(await env.DB.prepare(`SELECT m.*,u.username FROM ace_messages m JOIN users u ON u.id=m.author_id WHERE ${v.sql} AND m.topic_id=?4 AND m.kind='message' ${after?'AND m.id>?5':before?'AND m.id<?5':''} ORDER BY m.id ${after?'ASC':'DESC'} LIMIT 41`).bind(...v.values,id,...(after||before?[after||before]:[])).all()).results;
    const page=rows.slice(0,40);if(!after)page.reverse();
    const replies=await Promise.all(page.map(async m=>({id:m.id,parentId:m.parent_id,author:{id:m.author_id,username:m.username},createdAt:m.created_at,...await unseal(env,replyContext(topic.owner_id,m.author_id,m.request_id),m.payload)})));
    const content=await topicContent(env,topic);await freshTopic(env,access,user,topic);
    return json({topic:topicView(topic,content),replies,removed,more:rows.length>40,membership:access.member?.id||'owner',revision:`${access.circle.access_revision}:${access.circle.content_revision}:${topic.revision}`});
  }
  if(detail[2]==='read'&&method==='PUT'){
    const last=integer(body.lastId),g=writeGuard(access,user);
    await env.DB.prepare(`INSERT INTO circle_topic_reads(topic_id,reader_id,last_id) SELECT ?6,?3,?5 WHERE ${g.sql} AND EXISTS(SELECT 1 FROM ace_messages WHERE owner_id=?1 AND topic_id=?6 AND id=?5 AND id>=?7)
      ON CONFLICT(topic_id,reader_id) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)`).bind(...g.values,last,id,access.member?.joined_seq||0).run();return json({ok:true});
  }
  if(detail[2]!=='replies'||method!=='POST')fail('Méthode indisponible.',405);
  const key=identifier(body.id),content=text(body.text,4000,true),parent=body.parentId?integer(body.parentId,1):null;
  if(parent&&!await env.DB.prepare(`SELECT 1 FROM ace_messages m WHERE ${v.sql} AND m.topic_id=?4 AND m.id=?5 AND m.kind='message'`).bind(...v.values,id,parent).first())fail('Cette réponse n’est pas disponible.',404);
  const payload=await seal(env,replyContext(topic.owner_id,user.id,key),{text:content}),g=writeGuard(access,user);
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO ace_messages(owner_id,author_id,payload,request_id,event_id,parent_id,topic_id)
    SELECT ?1,?3,?5,?6,?7,?8,?9 WHERE ${g.sql} AND EXISTS(SELECT 1 FROM circle_topics WHERE id=?9 AND owner_id=?1 AND revision=?10)
    AND (SELECT message_count FROM ace_circles WHERE owner_id=?1)<20000
    AND (?8 IS NULL OR EXISTS(SELECT 1 FROM ace_messages WHERE id=?8 AND topic_id=?9))`)
    .bind(...g.values,payload,key,topic.event_id,parent,id,topic.revision).run();
  if(!result.meta.changes){await freshTopic(env,access,user,topic);if(!await env.DB.prepare('SELECT 1 FROM ace_messages WHERE owner_id=?1 AND author_id=?2 AND request_id=?3 AND topic_id=?4').bind(topic.owner_id,user.id,key,id).first())fail('Cette réponse n’a pas pu être enregistrée.',409);}
  return json({ok:true});
}
