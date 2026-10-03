import {fail,objectBody,limitWrites,unseal,integer,identifier} from './private-data.js';
import {NOTICE_VERSION,PRIVATE_NOTICE,requireLevel,storageConsent} from './private-access.js';
import {lifeRoute} from './life-tree.js';
import {mechanismsRoute} from './mechanisms.js';
import {aceRoute} from './ace-circles.js';
export async function handlePrivate(request,env,url,{getUser,json}){
  const user=await getUser(request,env);if(!user)fail('Connecte-toi pour ouvrir cet espace.',401);
  if(request.headers.get('X-WC-User')&&request.headers.get('X-WC-User')!==String(user.id))fail('Le compte connecté a changé. Recharge la page.',409);
  if(url.pathname==='/api/game-master-orange'){
    if(request.method!=='GET')fail('Méthode indisponible.',405);await requireLevel(env,user,11);return json({ok:true});
  }
  if(env.PRIVATE_SPACES_ENABLED!=='true')fail('Cet espace est momentanément indisponible.',503);
  let body=null;
  if(!['GET','HEAD'].includes(request.method)){
    if(request.headers.get('X-WC-User')!==String(user.id))fail('Recharge cette page avant de continuer.',409);
    await limitWrites(env,user.id);body=await objectBody(request);
  }
  if(url.pathname==='/api/private/reports'){
    if(!user.is_admin)fail('Accès réservé au gestionnaire des signalements.',403);
    if(request.method==='GET'){
      const after=integer(Number(url.searchParams.get('after')||0));
      const rows=(await env.DB.prepare(`SELECT r.*,u.username AS reporter_name,s.username AS subject_name FROM ace_reports r
        JOIN users u ON u.id=r.reporter_id LEFT JOIN users s ON s.id=r.subject_id WHERE r.resolved_at IS NULL AND r.rowid>?1 ORDER BY r.rowid LIMIT 21`).bind(after).all()).results;
      return json({reports:await Promise.all(rows.slice(0,20).map(async r=>({id:r.id,reporter:r.reporter_name,subject:r.subject_name,date:r.created_at,...await unseal(env,`report:${r.reporter_id}:${r.id}`,r.payload)})))});
    }
    if(request.method==='PUT'){await env.DB.prepare("UPDATE ace_reports SET resolved_at=datetime('now') WHERE id=?1").bind(identifier(body.id)).run();return json({ok:true});}
  }
  if(url.pathname==='/api/private/data'&&request.method==='DELETE'){
    if(body.confirm!=='SUPPRIMER')fail('Confirme l’effacement de tes données personnelles.');
    await env.DB.batch([
      ...['DELETE FROM circle_topic_reads WHERE reader_id=?1','DELETE FROM ace_read_markers WHERE reader_id=?1'].map(sql=>env.DB.prepare(sql).bind(user.id)),
      ...['DELETE FROM circle_topics WHERE owner_id=?1','DELETE FROM user_mechanisms WHERE owner_id=?1','DELETE FROM life_events WHERE owner_id=?1','DELETE FROM life_drafts WHERE owner_id=?1','DELETE FROM ace_circles WHERE owner_id=?1','DELETE FROM ace_memberships WHERE angel_id=?1','DELETE FROM ace_messages WHERE author_id=?1','DELETE FROM ace_invitations WHERE angel_id=?1','DELETE FROM ace_preferences WHERE user_id=?1','DELETE FROM ace_reports WHERE reporter_id=?1'].map(sql=>env.DB.prepare(sql).bind(user.id)),
      env.DB.prepare("INSERT INTO privacy_consents(user_id,purpose,version,granted) VALUES(?1,'storage',?2,0),(?1,'sharing',?2,0)").bind(user.id,NOTICE_VERSION),
    ]);return json({ok:true});
  }
  if(url.pathname==='/api/private/consent'){
    if(request.method==='GET')return json({notice:PRIVATE_NOTICE,consented:await storageConsent(env,user.id)});
    await requireLevel(env,user,12);
    if(request.method!=='POST'||body.consent!==true||body.version!==NOTICE_VERSION)fail('Un accord explicite est nécessaire.');
    await env.DB.prepare("INSERT INTO privacy_consents(user_id,purpose,version,granted) VALUES(?1,'storage',?2,1)").bind(user.id,NOTICE_VERSION).run();return json({ok:true});
  }
  if(url.pathname.startsWith('/api/mechanisms'))return mechanismsRoute(request,env,url,user,body,json);
  if(url.pathname.startsWith('/api/life-tree'))return lifeRoute(request,env,url,user,body,json);
  if(url.pathname.startsWith('/api/ace-circles'))return aceRoute(request,env,url,user,body,json);
  fail('Page introuvable.',404);
}
