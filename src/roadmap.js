import {MAX_GAME_LEVEL,gameLevel} from './echelon.js';
import {gameRows,ensureGameTables} from './echelon-api.js';
import {CURRENT_SCORES,ensureRoadmapLevels} from './roadmap-levels.js';

const member=row=>({id:row.id,username:row.username,avatar:row.has_avatar?`/api/roadmap/avatar/${row.id}`:null});
export async function handleRoadmap(request,env,url,{getUser,json}){
  const path=url.pathname.replace(/\/+$/,''),user=await getUser(request,env);
  if(request.method!=='GET')return json({error:'Méthode indisponible.'},405);
  const level=user?gameLevel(await gameRows(env,user.id)):1;
  if(path==='/api/roadmap'){
    if(!user)return json({echelon:1,total:MAX_GAME_LEVEL,self:null,steps:[]});
    await ensureGameTables(env);await ensureRoadmapLevels(env);
    const self=await env.DB.prepare('SELECT id,username,avatar_data IS NOT NULL AS has_avatar FROM users WHERE id=?1').bind(user.id).first();
    const [counts,previews]=await Promise.all([
      env.DB.prepare(`SELECT l.level,count(*) AS count ${CURRENT_SCORES} AND l.level<?1 AND u.id<>?2 GROUP BY l.level`).bind(level,user.id).all(),
      env.DB.prepare(`SELECT * FROM (SELECT u.id,u.username,u.avatar_data IS NOT NULL AS has_avatar,l.level,row_number() OVER(PARTITION BY l.level ORDER BY u.id) AS position ${CURRENT_SCORES} AND l.level<?1 AND u.id<>?2) WHERE position<=3 ORDER BY level,id`).bind(level,user.id).all(),
    ]);
    return json({echelon:level,total:MAX_GAME_LEVEL,self:self?member(self):null,steps:(counts.results||[]).map(row=>({level:row.level,count:row.count,members:(previews.results||[]).filter(p=>p.level===row.level).map(member)}))});
  }
  if(!user)return json({error:'Connecte-toi pour voir le parcours des membres.'},401);
  if(path==='/api/roadmap/members'){
    const selected=Number(url.searchParams.get('level')),after=Number(url.searchParams.get('after')||0);
    if(!Number.isInteger(selected)||selected<1||selected>=level)return json({error:'Cet échelon n’est pas visible.'},403);
    if(!Number.isSafeInteger(after)||after<0)return json({error:'Page invalide.'},400);
    await ensureRoadmapLevels(env);
    const {results=[]}=await env.DB.prepare(`SELECT u.id,u.username,u.avatar_data IS NOT NULL AS has_avatar ${CURRENT_SCORES} AND l.level=?1 AND u.id<>?2 AND u.id>?3 ORDER BY u.id LIMIT 25`).bind(selected,user.id,after).all();
    const members=results.slice(0,24).map(member);
    return json({level:selected,members,next:results.length>24?members.at(-1).id:null});
  }
  const avatar=/^\/api\/roadmap\/avatar\/(\d+)$/.exec(path);
  if(avatar){
    const target=Number(avatar[1]);
    if(!Number.isSafeInteger(target))return json({error:'Photo indisponible.'},404);
    // Check live discoveries, not a possibly stale directory entry.
    if(target!==user.id&&gameLevel(await gameRows(env,target))>=level)return json({error:'Photo indisponible.'},404);
    const row=await env.DB.prepare('SELECT avatar_data,avatar_mime FROM users WHERE id=?1').bind(target).first();
    if(!row?.avatar_data)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
    const bytes=Uint8Array.from(atob(row.avatar_data),c=>c.charCodeAt(0));
    return new Response(bytes,{headers:{'Content-Type':row.avatar_mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  return json({error:'Page introuvable.'},404);
}
