import {ensureConversation,conversationAccess,readBody} from './conversation.js';
import {gameRows} from './echelon-api.js';
import {liveLink} from './live-links.js';

export const COMMUNITY_TABLES=[
  `CREATE TABLE IF NOT EXISTS community_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES conversation_topics(id),
    user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo', assignee_id INTEGER REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 0,
    client_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(room_id,user_id,client_id))`,
  `CREATE TABLE IF NOT EXISTS community_brainstorms (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES conversation_topics(id),
    user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, agenda TEXT NOT NULL DEFAULT '',
    starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, ended_at INTEGER, min_echelon INTEGER NOT NULL,
    summary TEXT NOT NULL DEFAULT '', live_url TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0, client_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(room_id,user_id,client_id))`,
  `CREATE TABLE IF NOT EXISTS community_brainstorm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, brainstorm_id INTEGER NOT NULL REFERENCES community_brainstorms(id),
    user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, author_echelon INTEGER NOT NULL,
    client_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(brainstorm_id,user_id,client_id))`,
  'CREATE INDEX IF NOT EXISTS idx_community_sessions ON community_brainstorms(starts_at,id)',
  'CREATE INDEX IF NOT EXISTS idx_community_actions_room ON community_actions(room_id,id)',
  'CREATE INDEX IF NOT EXISTS idx_community_messages_room ON community_brainstorm_messages(brainstorm_id,id)',
];
const ready=new WeakMap();
export async function ensureCommunity(env){
  if(ready.has(env.DB))return ready.get(env.DB);
  const pending=(async()=>{await ensureConversation(env);for(const sql of COMMUNITY_TABLES)await env.DB.prepare(sql).run();
    const hasLive=async()=>(await env.DB.prepare('PRAGMA table_info(community_brainstorms)').all()).results.some(c=>c.name==='live_url');
    if(!await hasLive()){try{await env.DB.prepare("ALTER TABLE community_brainstorms ADD COLUMN live_url TEXT NOT NULL DEFAULT ''").run();}catch(error){if(!await hasLive())throw error;}}
  })();
  ready.set(env.DB,pending);try{await pending;}catch(error){ready.delete(env.DB);throw error;}
}
export const sessionState=(meeting,now=Date.now())=>meeting.ended_at||now>=meeting.ends_at?'ended':now<meeting.starts_at?'planned':'live';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const string=(value,max,label,required=false)=>{if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(`${label} : ${required?'1 à ':''}${max} caractères maximum.`);return value.trim();};
const clientId=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(value))fail('Identifiant de publication invalide.');return value;};
const revision=value=>{if(!Number.isSafeInteger(value)||value<0)fail('Version de la fiche invalide.');return value;};
const owner=(room,user)=>room.user_id===user.id||!!user.is_admin;
const validatedLive=value=>{try{return liveLink(value)?.url||'';}catch(error){fail(error.message);}};
const roomQuery='SELECT t.*,u.username FROM conversation_topics t JOIN users u ON u.id=t.user_id WHERE t.id=?1';
const meetingQuery='SELECT b.*,t.title AS room_title,t.kind AS room_kind,u.username FROM community_brainstorms b JOIN conversation_topics t ON t.id=b.room_id JOIN users u ON u.id=b.user_id';
const shapeMeeting=(m,user)=>({...m,live:liveLink(m.live_url),state:sessionState(m),can_edit:owner(m,user)});
async function notify(env,id,event){
  if(!env.BRAINSTORM_LIVE)return;
  try{const stub=env.BRAINSTORM_LIVE.get(env.BRAINSTORM_LIVE.idFromName(String(id)));await stub.fetch(new Request('https://live/internal',{method:'POST',body:JSON.stringify(event)}));}catch{ /* Stored messages remain available through HTTP. */ }
}

export async function handleCommunity(request,env,{getUser,json}){
  const user=await getUser(request,env);if(!user)return json({error:'Connexion requise.'},401);
  const access=conversationAccess(user,await gameRows(env,user.id));
  if(!access.topics)return json({error:'Les sujets, projets et brainstorms s’ouvrent à l’échelon 12.',minimum_echelon:12},403);
  const url=new URL(request.url),method=request.method,path=url.pathname.replace(/\/+$/,'');
  if(!['GET','POST','PATCH'].includes(method))return json({error:'Méthode indisponible.'},405);
  if(method!=='GET'&&request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origine invalide.'},403);
  await ensureCommunity(env);
  try{
    let body;if(method!=='GET'){try{body=await readBody(request,65536);}catch{fail('Requête invalide ou trop longue.');}if(!body||typeof body!=='object'||Array.isArray(body))fail('Requête invalide.');}
    let match;
    if((match=/^\/api\/community\/rooms\/([1-9]\d*)(?:\/(actions|brainstorms))?$/.exec(path))){
      const room=await env.DB.prepare(roomQuery).bind(Number(match[1])).first();if(!room)fail('Fiche introuvable.',404);
      const section=match[2];
      if(method==='GET'&&!section){
        let resources;try{resources=JSON.parse(room.resources);}catch{resources=[];}
        const actions=room.kind==='project'?(await env.DB.prepare(`SELECT a.*,u.username,v.username AS assignee FROM community_actions a JOIN users u ON u.id=a.user_id LEFT JOIN users v ON v.id=a.assignee_id WHERE a.room_id=?1 ORDER BY a.id LIMIT 100`).bind(room.id).all()).results:[];
        const meetings=(await env.DB.prepare(meetingQuery+' WHERE b.room_id=?1 AND b.min_echelon<=?2 ORDER BY b.starts_at DESC LIMIT 50').bind(room.id,access.echelon).all()).results;
        return json({room:{...room,resources,can_edit:owner(room,user)},actions,brainstorms:meetings.map(m=>shapeMeeting(m,user)),echelon:access.echelon});
      }
      if(method==='PATCH'&&!section){
        if(!owner(room,user))fail('Seul le créateur peut modifier la fiche.',403);
        const fields={};for(const [key,max,label]of [['title',80,'Titre'],['description',2000,'Contexte'],['question',1000,'Question'],['goal',1000,'Objectif'],['needs',2000,'Besoins'],['summary',4000,'Synthèse']])fields[key]=string(body[key]??room[key],max,label,key==='title');
        const status=body.status??room.status;if(!(room.kind==='project'?['open','in_progress','completed','paused']:['open','exploring','synthesized']).includes(status))fail('Avancement inconnu.');
        const resources=body.resources??JSON.parse(room.resources);if(!Array.isArray(resources)||resources.length>8)fail('Huit ressources maximum.');
        const links=resources.map(link=>{const label=string(link?.label,100,'Nom de la ressource',true),value=string(link?.url,2000,'Lien',true);let parsed;try{parsed=new URL(value);}catch{fail('Lien invalide.');}if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)fail('Utilise un lien http ou https sans identifiants.');return {label,url:parsed.href};});
        const result=await env.DB.prepare(`UPDATE conversation_topics SET title=?1,description=?2,question=?3,goal=?4,needs=?5,summary=?6,resources=?7,status=?8,revision=revision+1 WHERE id=?9 AND revision=?10`)
          .bind(fields.title,fields.description,room.kind==='topic'?fields.question:'',room.kind==='project'?fields.goal:'',room.kind==='project'?fields.needs:'',fields.summary,JSON.stringify(links),status,room.id,revision(body.revision)).run();
        if(!result.meta.changes)fail('La fiche a changé entre-temps. Recharge-la avant de réessayer.',409);
        return json({ok:true,revision:room.revision+1});
      }
      if(method==='POST'&&section==='actions'){
        if(room.kind!=='project')fail('Les actions sont réservées aux projets.');
        const title=string(body.title,160,'Action',true),details=string(body.details??'',1000,'Détails'),key=clientId(body.client_id);
        await env.DB.prepare(`INSERT INTO community_actions(room_id,user_id,title,details,client_id) SELECT ?1,?2,?3,?4,?5 WHERE (SELECT COUNT(*) FROM community_actions WHERE room_id=?1)<100 ON CONFLICT(room_id,user_id,client_id) DO NOTHING`).bind(room.id,user.id,title,details,key).run();
        const created=await env.DB.prepare('SELECT id FROM community_actions WHERE room_id=?1 AND user_id=?2 AND client_id=?3').bind(room.id,user.id,key).first();if(!created)fail('Ce projet contient déjà 100 actions.',409);
        return json({ok:true,id:created.id},201);
      }
      if(method==='POST'&&section==='brainstorms'){
        if(!owner(room,user))fail('Seul le créateur peut organiser une séance pour cette fiche.',403);
        const title=string(body.title,100,'Titre de la séance',true),agenda=string(body.agenda??'',2000,'Objectif de la séance'),key=clientId(body.client_id);
        const starts=body.starts_at?Date.parse(body.starts_at):Date.now(),minutes=body.duration_minutes??60;
        if(!Number.isFinite(starts)||starts<Date.now()-60000||starts>Date.now()+366*86400000||!Number.isInteger(minutes)||minutes<15||minutes>180)fail('Choisis une date à venir et une durée de 15 à 180 minutes.');
        await env.DB.prepare(`INSERT INTO community_brainstorms(room_id,user_id,title,agenda,starts_at,ends_at,min_echelon,client_id,live_url) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?10 WHERE (SELECT COUNT(*) FROM community_brainstorms WHERE room_id=?1 AND ended_at IS NULL AND ends_at>?9)<20 ON CONFLICT(room_id,user_id,client_id) DO NOTHING`).bind(room.id,user.id,title,agenda,starts,starts+minutes*60000,access.echelon,key,Date.now(),validatedLive(body.live_url??'')).run();
        const created=await env.DB.prepare('SELECT id FROM community_brainstorms WHERE room_id=?1 AND user_id=?2 AND client_id=?3').bind(room.id,user.id,key).first();if(!created)fail('Vingt séances à venir maximum par fiche.',409);
        return json({ok:true,id:created.id},201);
      }
    }
    if((match=/^\/api\/community\/actions\/([1-9]\d*)$/.exec(path))&&method==='PATCH'){
      const item=await env.DB.prepare('SELECT a.*,t.user_id AS owner_id FROM community_actions a JOIN conversation_topics t ON t.id=a.room_id WHERE a.id=?1').bind(Number(match[1])).first();if(!item)fail('Action introuvable.',404);
      let status=item.status,assignee=item.assignee_id;
      if(body.action==='claim'){if(assignee&&assignee!==user.id)fail('Cette action est déjà prise en charge.',409);if(status==='done')fail('Cette action est déjà terminée.',409);assignee=user.id;status='doing';}
      else{
        if(item.assignee_id!==user.id&&item.owner_id!==user.id&&!user.is_admin)fail('Seuls le responsable de cette action et le créateur du projet peuvent la modifier.',403);
        if(body.action==='release'){assignee=null;status='todo';}else if(body.action==='done')status='done';else if(body.action==='reopen')status=assignee?'doing':'todo';else fail('Action inconnue.');
      }
      const result=await env.DB.prepare('UPDATE community_actions SET status=?1,assignee_id=?2,revision=revision+1 WHERE id=?3 AND revision=?4').bind(status,assignee,item.id,revision(body.revision)).run();
      if(!result.meta.changes)fail('Cette action a changé entre-temps. Recharge le projet.',409);return json({ok:true});
    }
    if(path==='/api/community/brainstorms'&&method==='GET'){
      const before=Number(url.searchParams.get('before')||0),scope=url.searchParams.get('scope')||'upcoming';
      if(!Number.isSafeInteger(before)||before<0||!['upcoming','past'].includes(scope))fail('Filtre invalide.');
      const {results}=await env.DB.prepare(meetingQuery+` WHERE b.min_echelon<=?1 AND (?2=0 OR b.id<?2) AND ((?3='upcoming' AND b.ended_at IS NULL AND b.ends_at>?4) OR (?3='past' AND (b.ended_at IS NOT NULL OR b.ends_at<=?4))) ORDER BY b.id DESC LIMIT 51`).bind(access.echelon,before,scope,Date.now()).all();
      const meetings=results.slice(0,50);return json({brainstorms:meetings.map(m=>shapeMeeting(m,user)),nextBefore:results.length>50?meetings.at(-1).id:null});
    }
    if((match=/^\/api\/community\/brainstorms\/([1-9]\d*)(?:\/(messages|live|voice))?$/.exec(path))){
      const meeting=await env.DB.prepare(meetingQuery+' WHERE b.id=?1 AND b.min_echelon<=?2').bind(Number(match[1]),access.echelon).first();if(!meeting)fail('Séance introuvable ou pas encore accessible.',404);
      const section=match[2],state=sessionState(meeting);
      if(method==='GET'&&!section){
        const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)fail('Pagination invalide.');
        if(state==='live')await notify(env,meeting.id,{type:'renew',userId:user.id,echelon:access.echelon,expires:Math.min(meeting.ends_at,Date.now()+300000)});
        const {results}=await env.DB.prepare(`SELECT m.id,m.body,m.author_echelon,m.created_at,u.username FROM community_brainstorm_messages m JOIN users u ON u.id=m.user_id WHERE m.brainstorm_id=?1 AND m.author_echelon<=?2 AND m.id>?3 ORDER BY m.id LIMIT 101`).bind(meeting.id,access.echelon,after).all();
        const messages=results.slice(0,100);return json({brainstorm:shapeMeeting(meeting,user),messages,nextAfter:results.length>100?messages.at(-1).id:null,echelon:access.echelon});
      }
      if(method==='PATCH'&&!section){
        if(!owner(meeting,user))fail('Seul l’organisateur peut modifier la séance.',403);
        const summary=string(body.summary??meeting.summary,4000,'Synthèse');
        if(body.action!==undefined&&!['start','end'].includes(body.action))fail('Action inconnue.');
        if(body.action==='start'&&state!=='planned')fail('La séance a déjà commencé ou est terminée.',409);
        const now=Date.now(),start=body.action==='start'?now:meeting.starts_at,end=body.action==='start'?now+(meeting.ends_at-meeting.starts_at):meeting.ends_at,ended=body.action==='end'?now:meeting.ended_at;
        const result=await env.DB.prepare('UPDATE community_brainstorms SET summary=?1,starts_at=?2,ends_at=?3,ended_at=?4,revision=revision+1,live_url=?7 WHERE id=?5 AND revision=?6').bind(summary,start,end,ended,meeting.id,revision(body.revision),validatedLive(body.live_url??meeting.live_url)).run();
        if(!result.meta.changes)fail('La séance a changé entre-temps. Recharge-la.',409);
        await notify(env,meeting.id,{type:ended?'ended':'refresh'});return json({ok:true});
      }
      if(method==='POST'&&section==='messages'){
        if(state!=='live')fail(state==='planned'?'La séance n’a pas encore commencé.':'La séance est terminée.',409);
        const text=string(body.body,2000,'Message',true),key=clientId(body.client_id);
        await env.DB.prepare('INSERT INTO community_brainstorm_messages(brainstorm_id,user_id,body,author_echelon,client_id) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(brainstorm_id,user_id,client_id) DO NOTHING').bind(meeting.id,user.id,text,access.echelon,key).run();
        const message=await env.DB.prepare('SELECT m.id,m.body,m.author_echelon,m.created_at,u.username FROM community_brainstorm_messages m JOIN users u ON u.id=m.user_id WHERE m.brainstorm_id=?1 AND m.user_id=?2 AND m.client_id=?3').bind(meeting.id,user.id,key).first();
        await notify(env,meeting.id,{type:'message',message});return json({ok:true,message},201);
      }
      if(method==='GET'&&section==='live'){
        if(request.headers.get('Origin')!==url.origin)fail('Origine invalide.',403);
        if(state!=='live')fail('La séance n’est pas en cours.',409);
        if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')fail('Connexion WebSocket requise.',426);
        if(!env.BRAINSTORM_LIVE)fail('La connexion en direct est temporairement indisponible.',503);
        const stub=env.BRAINSTORM_LIVE.get(env.BRAINSTORM_LIVE.idFromName(String(meeting.id)));
        const headers=new Headers({'Upgrade':'websocket','X-WC-Identity':encodeURIComponent(JSON.stringify({userId:user.id,username:user.username,echelon:access.echelon,endsAt:meeting.ends_at,expires:Math.min(meeting.ends_at,Date.now()+300000)}))});
        return stub.fetch(new Request('https://live/connect',{headers}));
      }
      if(method==='POST'&&section==='voice'){
        return json({error:'Rejoins le live externe indiqué dans la séance.'},410);
      }
    }
    return json({error:'Page inconnue.'},404);
  }catch(error){if(error.status)return json({error:error.message},error.status);throw error;}
}
