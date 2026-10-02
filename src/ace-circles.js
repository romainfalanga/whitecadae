import {seal,unseal,fail,text,identifier,integer,limitWrites} from './private-data.js';
import {NOTICE_VERSION,requireLevel,requireStorage,levelOf,circleAccess,freshAccess,writeGuard,blocked,person} from './private-access.js';

const profileSQL='SELECT id,username,avatar_data IS NOT NULL AS has_avatar FROM users WHERE id=?1';
async function profile(env,id){const row=await env.DB.prepare(profileSQL).bind(id).first();return row?person(row):null;}
const messageContext=(owner,author,key)=>`message:${owner}:${author}:${key}`;
async function messageView(env,row){return {id:row.id,author:row.author_id?{id:row.author_id,username:row.username}:null,eventId:row.event_id,parentId:row.parent_id,kind:row.kind,createdAt:row.created_at,...(row.kind==='message'?await unseal(env,messageContext(row.owner_id,row.author_id,row.request_id),row.payload):{})};}
const invisibleBlocked=`NOT EXISTS(SELECT 1 FROM ace_blocks b WHERE (b.user_id=?3 AND b.blocked_id=m.author_id) OR (b.blocked_id=?3 AND b.user_id=m.author_id))`;
function messageVisibility(access,user){return {sql:`m.owner_id=?1 AND m.id>=?2 AND ${invisibleBlocked} AND (m.event_id IS NULL OR ?4=1)`,values:[access.owner,access.member?.joined_seq||0,user.id,access.owner===user.id||access.circle.share_enabled?1:0]};}
async function ensureCircle(env,owner){await env.DB.prepare('INSERT OR IGNORE INTO ace_circles(owner_id) VALUES(?1)').bind(owner).run();}
async function invitation(env,user,id){
  const row=await env.DB.prepare('SELECT * FROM ace_invitations WHERE id=?1 AND (owner_id=?2 OR angel_id=?2)').bind(id,user.id).first();
  if(!row)fail('Invitation indisponible.',404);return row;
}
export async function aceRoute(request,env,url,user,body,json){
  const suffix=url.pathname.replace(/^\/api\/ace-circles/,'').replace(/\/$/,''),method=request.method;
  // Leaving/blocking and deleting one's own messages remain possible after a
  // level change; they never disclose a circle's contents.
  const exitAction=method==='DELETE'&&/^\/(members|messages)\/[\w-]+$/.test(suffix)||method==='POST'&&suffix==='/blocks';
  if(!exitAction)await requireLevel(env,user,20);
  if(!suffix&&method==='POST'){await ensureCircle(env,user.id);return json({ok:true});}
  if(!suffix&&method==='GET'){
    const own=await env.DB.prepare('SELECT * FROM ace_circles WHERE owner_id=?1').bind(user.id).first();
    const candidates=(await env.DB.prepare(`SELECT c.*,m.id AS membership_id,m.joined_seq,u.username,u.avatar_data IS NOT NULL AS has_avatar FROM ace_circles c
      JOIN users u ON u.id=c.owner_id LEFT JOIN ace_memberships m ON m.owner_id=c.owner_id AND m.angel_id=?1
      WHERE c.owner_id=?1 OR m.angel_id=?1 ORDER BY c.owner_id=?1 DESC,c.owner_id LIMIT 5`).bind(user.id).all()).results;
    const circles=[];
    for(const row of candidates){
      if(row.owner_id!==user.id&&(await levelOf(env,row.owner_id)<20||await blocked(env,user.id,row.owner_id)))continue;
      const members=(await env.DB.prepare(`SELECT m.id AS membership_id,m.owner_slot,u.id,u.username,u.avatar_data IS NOT NULL AS has_avatar FROM ace_memberships m JOIN users u ON u.id=m.angel_id WHERE m.owner_id=?1 ORDER BY m.owner_slot`).bind(row.owner_id).all()).results;
      const unread=await env.DB.prepare(`SELECT count(*) AS n FROM ace_messages m WHERE m.owner_id=?1 AND m.id>=?2 AND m.author_id<>?3 AND (m.event_id IS NULL OR ?4=1)
        AND m.id>COALESCE((SELECT last_id FROM ace_read_markers WHERE owner_id=?1 AND reader_id=?3),0) AND ${invisibleBlocked}`).bind(row.owner_id,row.joined_seq||0,user.id,row.owner_id===user.id||row.share_enabled?1:0).first();
      circles.push({owner:person({...row,id:row.owner_id}),sharing:!!row.share_enabled,membershipId:row.membership_id,members:members.map(m=>({...person(m),membershipId:m.membership_id,slot:m.owner_slot})),unread:unread.n});
    }
    const invitations=(await env.DB.prepare(`SELECT i.*,o.username AS owner_name,a.username AS angel_name FROM ace_invitations i JOIN users o ON o.id=i.owner_id JOIN users a ON a.id=i.angel_id
      WHERE (i.owner_id=?1 OR i.angel_id=?1) AND i.state='pending' AND i.expires_at>datetime('now') ORDER BY i.created_at DESC LIMIT 48`).bind(user.id).all()).results;
    const pref=await env.DB.prepare('SELECT * FROM ace_preferences WHERE user_id=?1').bind(user.id).first();
    const blocks=(await env.DB.prepare('SELECT u.id,u.username FROM ace_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=?1 LIMIT 200').bind(user.id).all()).results;
    return json({own:!!own,circles,invitations:invitations.map(i=>({id:i.id,owner:{id:i.owner_id,username:i.owner_name},angel:{id:i.angel_id,username:i.angel_name},incoming:(i.direction==='invite'?i.angel_id:i.owner_id)===user.id,direction:i.direction,expiresAt:i.expires_at})),preferences:pref?{listed:!!pref.listed,intro:(await unseal(env,`intro:${user.id}`,pref.intro)).text,code:pref.private_code}:null,blocks});
  }
  if(suffix==='/preferences'&&method==='PUT'){
    if(typeof body.listed!=='boolean')fail('Choix invalide.');const intro=await seal(env,`intro:${user.id}`,{text:text(body.intro,500)});
    const code=crypto.randomUUID().replaceAll('-','');
    await env.DB.prepare(`INSERT INTO ace_preferences(user_id,listed,intro,private_code) VALUES(?1,?2,?3,?4)
      ON CONFLICT(user_id) DO UPDATE SET listed=excluded.listed,intro=excluded.intro,private_code=CASE WHEN ?5=1 THEN excluded.private_code ELSE private_code END`).bind(user.id,body.listed?1:0,intro,code,body.rotateCode===true?1:0).run();return json({ok:true});
  }
  if(suffix==='/directory'&&method==='GET'){
    const search=text(url.searchParams.get('q')||'',30);
    if(search.length<3)return json({people:[],next:null});
    await limitWrites(env,user.id);
    const rows=(await env.DB.prepare(`SELECT u.id,u.username FROM users u
      WHERE u.id<>?1 AND u.username=?2 COLLATE NOCASE
      AND (SELECT count(*) FROM ace_memberships WHERE angel_id=u.id)<4
      AND NOT EXISTS(SELECT 1 FROM ace_memberships WHERE owner_id=?1 AND angel_id=u.id)
      AND NOT EXISTS(SELECT 1 FROM ace_invitations WHERE owner_id=?1 AND angel_id=u.id AND state='pending' AND expires_at>datetime('now'))
      AND NOT EXISTS(SELECT 1 FROM ace_blocks WHERE (user_id=?1 AND blocked_id=u.id) OR (blocked_id=?1 AND user_id=u.id)) LIMIT 1`).bind(user.id,search).all()).results;
    const people=[];for(const row of rows)if(await levelOf(env,row.id)>=20)people.push({id:row.id,username:row.username});
    return json({people,next:null});
  }
  const avatar=/^\/avatar\/(\d+)$/.exec(suffix);
  if(avatar&&method==='GET'){
    const target=integer(Number(avatar[1]),1);let allowed=target===user.id;
    if(!allowed&&!await blocked(env,user.id,target)&&await levelOf(env,target)>=20){
      allowed=!!await env.DB.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM ace_preferences WHERE user_id=?1 AND listed=1)
        OR EXISTS(SELECT 1 FROM ace_memberships m WHERE (m.owner_id=?1 AND m.angel_id=?2) OR (m.owner_id=?2 AND m.angel_id=?1))
        OR EXISTS(SELECT 1 FROM ace_memberships a JOIN ace_memberships b ON a.owner_id=b.owner_id WHERE a.angel_id=?1 AND b.angel_id=?2)`).bind(target,user.id).first();
    }
    if(!allowed)fail('Photo indisponible.',404);
    const row=await env.DB.prepare('SELECT avatar_data,avatar_mime FROM users WHERE id=?1').bind(target).first();if(!row?.avatar_data)fail('Photo indisponible.',404);
    return new Response(Uint8Array.from(atob(row.avatar_data),c=>c.charCodeAt(0)),{headers:{'Content-Type':row.avatar_mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(suffix==='/invitations'&&method==='POST'){
    const id=identifier(body.id),direction=body.direction==='request'?'request':'invite';let target;
    if(body.code){const code=text(body.code,64,true);target=await env.DB.prepare('SELECT user_id AS id FROM ace_preferences WHERE private_code=?1').bind(code).first();}
    else{const targetId=integer(body.target,1);target=await env.DB.prepare('SELECT id FROM users WHERE id=?1').bind(targetId).first();}
    if(!target||target.id===user.id||await blocked(env,user.id,target.id)||await levelOf(env,target.id)<20)fail('Cette mise en relation n’est pas disponible.',404);
    const owner=direction==='invite'?user.id:target.id,angel=direction==='invite'?target.id:user.id;
    if(direction==='invite'&&body.recipientNotice!==true)fail('Confirme les accès que cette personne recevra.');
    // A request requires a private code. Directory entries are prospective angels.
    if(direction==='request'&&!body.code)fail('Utilise le code privé de la personne que tu souhaites accompagner.');
    if(direction==='invite')await ensureCircle(env,owner);
    else if(!await env.DB.prepare('SELECT 1 FROM ace_circles WHERE owner_id=?1').bind(owner).first())fail('Cette personne n’a pas encore créé son carré.',409);
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO ace_invitations(id,owner_id,angel_id,direction,expires_at,recipient_notice)
      SELECT ?1,?2,?3,?4,datetime('now','+7 days'),?5
      WHERE NOT EXISTS(SELECT 1 FROM ace_memberships WHERE owner_id=?2 AND angel_id=?3)
      AND NOT EXISTS(SELECT 1 FROM ace_invitations WHERE owner_id=?2 AND angel_id=?3 AND state='pending' AND expires_at>datetime('now'))
      AND (SELECT count(*) FROM ace_memberships WHERE owner_id=?2)<4 AND (SELECT count(*) FROM ace_memberships WHERE angel_id=?3)<4
      AND (SELECT count(*) FROM ace_invitations WHERE (owner_id=?6 OR angel_id=?6) AND created_at>datetime('now','-1 day'))<16`).bind(id,owner,angel,direction,direction==='invite'?1:0,user.id).run();
    if(!result.meta.changes){const existing=await env.DB.prepare('SELECT id FROM ace_invitations WHERE id=?1 AND owner_id=?2 AND angel_id=?3').bind(id,owner,angel).first();if(!existing)fail('Une invitation existe déjà, une limite de places est atteinte ou trop de demandes ont été envoyées aujourd’hui.',409);}
    return json({ok:true,id});
  }
  const action=/^\/invitations\/([\w-]+)$/.exec(suffix);
  if(action&&method==='PUT'){
    const row=await invitation(env,user,identifier(action[1]));const recipient=row.direction==='invite'?row.angel_id:row.owner_id;
    if(body.action==='accept'){
      if(user.id!==recipient)fail('Seul le destinataire peut accepter.',403);
      if(row.state==='accepted')return json({ok:true});
      if(row.state!=='pending'||row.expires_at<=new Date().toISOString().replace('T',' ').slice(0,19))fail('Cette invitation a expiré.',409);
      if(await levelOf(env,row.owner_id)<20||await levelOf(env,row.angel_id)<20||await blocked(env,row.owner_id,row.angel_id))fail('Cette mise en relation n’est plus disponible.',403);
      if(row.direction==='request'&&body.recipientNotice!==true)fail('Confirme les accès que cette personne recevra.');
      // Slots are selected and inserted in one statement. Unique constraints
      // enforce both capacities even with simultaneous acceptance requests.
      const [inserted]=await env.DB.batch([
        env.DB.prepare(`WITH slots(n) AS (VALUES(1),(2),(3),(4)) INSERT OR IGNORE INTO ace_memberships(id,owner_id,angel_id,owner_slot,angel_slot,joined_seq)
          SELECT ?1,?2,?3,a.n,b.n,COALESCE((SELECT MAX(id) FROM ace_messages),0)+1 FROM slots a CROSS JOIN slots b
          WHERE NOT EXISTS(SELECT 1 FROM ace_memberships WHERE owner_id=?2 AND owner_slot=a.n)
          AND NOT EXISTS(SELECT 1 FROM ace_memberships WHERE angel_id=?3 AND angel_slot=b.n)
          AND EXISTS(SELECT 1 FROM ace_invitations WHERE id=?1 AND state='pending' AND expires_at>datetime('now'))
          AND NOT EXISTS(SELECT 1 FROM ace_blocks WHERE (user_id=?2 AND blocked_id=?3) OR (user_id=?3 AND blocked_id=?2))
          ORDER BY a.n,b.n LIMIT 1`).bind(row.id,row.owner_id,row.angel_id),
        env.DB.prepare("UPDATE ace_invitations SET state='accepted',recipient_notice=1 WHERE id=?1 AND EXISTS(SELECT 1 FROM ace_memberships WHERE id=?1)").bind(row.id),
        env.DB.prepare("INSERT INTO privacy_consents(user_id,purpose,version,granted,recipient_id) SELECT ?1,'recipient',?2,1,?3 WHERE EXISTS(SELECT 1 FROM ace_memberships WHERE id=?4)").bind(row.owner_id,NOTICE_VERSION,row.angel_id,row.id),
      ]);
      if(!inserted.meta.changes&&!await env.DB.prepare('SELECT 1 FROM ace_memberships WHERE id=?1').bind(row.id).first())fail('Les quatre places du carré ou les quatre accompagnements sont déjà occupés.',409);
      return json({ok:true});
    }
    if(!['decline','cancel'].includes(body.action))fail('Action invalide.');
    if((body.action==='decline')!==(user.id===recipient))fail('Cette action ne t’appartient pas.',403);
    await env.DB.prepare("UPDATE ace_invitations SET state=?2 WHERE id=?1 AND state='pending'").bind(row.id,body.action==='decline'?'declined':'cancelled').run();return json({ok:true});
  }
  const member=/^\/members\/([\w-]+)$/.exec(suffix);
  if(member&&method==='DELETE'){
    await env.DB.prepare('DELETE FROM ace_memberships WHERE id=?1 AND (owner_id=?2 OR angel_id=?2)').bind(identifier(member[1]),user.id).run();return json({ok:true});
  }
  if(suffix==='/sharing'&&method==='PUT'){
    if(typeof body.enabled!=='boolean'||body.enabled&&body.consent!==true)fail('Un accord explicite est nécessaire pour partager tout ton arbre.');
    if(body.enabled)await requireStorage(env,user.id);await ensureCircle(env,user.id);
    await env.DB.batch([
      env.DB.prepare('UPDATE ace_circles SET share_enabled=?2,access_revision=access_revision+1 WHERE owner_id=?1').bind(user.id,body.enabled?1:0),
      env.DB.prepare("INSERT INTO privacy_consents(user_id,purpose,version,granted) VALUES(?1,'sharing',?2,?3)").bind(user.id,NOTICE_VERSION,body.enabled?1:0),
    ]);return json({ok:true});
  }
  if(suffix==='/blocks'&&method==='POST'){
    const target=integer(body.target,1);if(target===user.id||!await profile(env,target))fail('Personne indisponible.',404);
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO ace_blocks(user_id,blocked_id) VALUES(?1,?2)').bind(user.id,target),
      env.DB.prepare('UPDATE ace_circles SET access_revision=access_revision+1 WHERE owner_id IN(?1,?2) OR owner_id IN(SELECT owner_id FROM ace_memberships WHERE angel_id IN(?1,?2) GROUP BY owner_id HAVING count(*)=2)').bind(user.id,target),
      env.DB.prepare('DELETE FROM ace_memberships WHERE (owner_id=?1 AND angel_id=?2) OR (owner_id=?2 AND angel_id=?1)').bind(user.id,target),
      env.DB.prepare("UPDATE ace_invitations SET state='cancelled' WHERE (owner_id=?1 AND angel_id=?2) OR (owner_id=?2 AND angel_id=?1)").bind(user.id,target),
    ]);return json({ok:true});
  }
  if(suffix==='/blocks'&&method==='DELETE'){await env.DB.prepare('DELETE FROM ace_blocks WHERE user_id=?1 AND blocked_id=?2').bind(user.id,integer(body.target,1)).run();return json({ok:true});}
  const chat=/^\/(\d+)\/(messages|read)$/.exec(suffix);
  if(chat){
    const owner=integer(Number(chat[1]),1),access=await circleAccess(env,user,owner),visibility=messageVisibility(access,user);
    if(chat[2]==='read'&&method==='PUT'){
      const last=integer(body.lastId),g=writeGuard(access,user);
      await env.DB.prepare(`INSERT INTO ace_read_markers(owner_id,reader_id,last_id) SELECT ?1,?3,?5 WHERE ${g.sql}
        AND EXISTS(SELECT 1 FROM ace_messages WHERE owner_id=?1 AND id=?5)
        ON CONFLICT(owner_id,reader_id) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)`).bind(...g.values,last).run();return json({ok:true});
    }
    if(method==='GET'){
      const after=integer(Number(url.searchParams.get('after')||0)),before=integer(Number(url.searchParams.get('before')||0));
      if(after&&before)fail('Page invalide.');
      const event=url.searchParams.get('event'),parent=Number(url.searchParams.get('parent')||0);if(event)identifier(event);integer(parent);
      const filters=[visibility.sql];const values=[...visibility.values];const add=(q,v)=>{values.push(v);filters.push(q.replace('$','?'+values.length));};
      if(after)add('m.id>$',after);if(before)add('m.id<$',before);if(event)add('m.event_id=$',event);if(parent)add('m.parent_id=$',parent);
      const rows=(await env.DB.prepare(`SELECT m.*,u.username FROM ace_messages m LEFT JOIN users u ON u.id=m.author_id WHERE ${filters.join(' AND ')} ORDER BY m.id ${after?'ASC':'DESC'} LIMIT 41`).bind(...values).all()).results;
      const page=rows.slice(0,40);if(!after)page.reverse();const messages=await Promise.all(page.map(row=>messageView(env,row)));await freshAccess(env,access,user);
      return json({messages,more:rows.length>40,sharing:!!access.circle.share_enabled,membership:access.member?.id||'owner',accessRevision:access.circle.access_revision,contentRevision:access.circle.content_revision});
    }
    if(method==='POST'){
      await requireStorage(env,user.id);const requestId=identifier(body.id),content=text(body.text,4000,true),event=body.eventId?identifier(body.eventId):null,parent=body.parentId?integer(body.parentId,1):null;
      let relatedEvent=event;
      if(parent){const row=await env.DB.prepare(`SELECT m.event_id FROM ace_messages m WHERE ${visibility.sql} AND m.id=?5`).bind(...visibility.values,parent).first();if(!row)fail('Ce message n’est pas disponible.',404);if(event&&row.event_id!==event)fail('Réponse liée à un autre événement.');relatedEvent=row.event_id;}
      if(relatedEvent){if(owner!==user.id&&!access.circle.share_enabled)fail('Le partage de cet arbre est désactivé.',403);if(!await env.DB.prepare('SELECT 1 FROM life_events WHERE owner_id=?1 AND id=?2').bind(owner,relatedEvent).first())fail('Événement indisponible.',404);}
      const g=writeGuard(access,user),payload=await seal(env,messageContext(owner,user.id,requestId),{text:content});
      const result=await env.DB.prepare(`INSERT OR IGNORE INTO ace_messages(owner_id,author_id,payload,request_id,event_id,parent_id)
        SELECT ?1,?3,?5,?6,?7,?8 WHERE ${g.sql}
        AND (SELECT message_count FROM ace_circles WHERE owner_id=?1)<20000
        AND (?7 IS NULL OR EXISTS(SELECT 1 FROM life_events WHERE owner_id=?1 AND id=?7))
        AND (?8 IS NULL OR EXISTS(SELECT 1 FROM ace_messages WHERE owner_id=?1 AND id=?8))`).bind(...g.values,payload,requestId,relatedEvent,parent).run();
      if(!result.meta.changes){await freshAccess(env,access,user);if(!await env.DB.prepare('SELECT 1 FROM ace_messages WHERE owner_id=?1 AND author_id=?2 AND request_id=?3').bind(owner,user.id,requestId).first())fail('Ce message ne peut plus être envoyé ou ce carré a atteint sa capacité de 20 000 échanges.',409);}
      return json({ok:true});
    }
  }
  const message=/^\/messages\/(\d+)$/.exec(suffix);
  if(message&&method==='DELETE'){
    await env.DB.prepare('DELETE FROM ace_messages WHERE id=?1 AND author_id=?2 AND kind=\'message\'').bind(integer(Number(message[1]),1),user.id).run();return json({ok:true});
  }
  if(suffix==='/reports'&&method==='POST'){
    const owner=integer(body.owner,1),access=await circleAccess(env,user,owner),v=messageVisibility(access,user);
    const row=await env.DB.prepare(`SELECT m.*,u.username FROM ace_messages m LEFT JOIN users u ON u.id=m.author_id WHERE ${v.sql} AND m.id=?5 AND m.kind='message'`).bind(...v.values,integer(body.messageId,1)).first();
    if(!row)fail('Message indisponible.',404);const reason=text(body.reason,1000,true),view=await messageView(env,row),id=crypto.randomUUID();
    const payload=await seal(env,`report:${user.id}:${id}`,{reason,message:view.text});await freshAccess(env,access,user);
    await env.DB.prepare('INSERT INTO ace_reports(id,reporter_id,subject_id,payload) VALUES(?1,?2,?3,?4)').bind(id,user.id,row.author_id,payload).run();return json({ok:true});
  }
  fail('Page introuvable.',404);
}
