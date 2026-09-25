import {buildGameState,progress,getGameNode,isVisible,isPlayable,SHARE,boardSources} from './echelon.js';
import {matchNode} from './enigmas57.js';
import {validDraft,hasTwoSevens,validateConstruction} from './echelon-workshop.js';
import {buildJourney} from './journey.js';

let ready=false;
export async function ensureGameTables(env){
  if(ready)return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS riddle_progress (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,riddle_id TEXT NOT NULL,hints_used INTEGER NOT NULL DEFAULT 0,revealed INTEGER NOT NULL DEFAULT 0,solved_at TEXT,updated_at TEXT NOT NULL DEFAULT (datetime('now')),PRIMARY KEY(user_id,riddle_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS echelon_drafts (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,board_id TEXT NOT NULL,draft TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT (datetime('now')),PRIMARY KEY(user_id,board_id))"),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS echelon_attempts (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,next_at INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0)')
  ]);ready=true;
}
export async function gameRows(env,id){if(!id)return [];await ensureGameTables(env);return (await env.DB.prepare('SELECT riddle_id, solved_at FROM riddle_progress WHERE user_id = ?1').bind(id).all()).results||[];}
async function saveIds(env,id,ids){
  if(!ids.length)return;
  const q=env.DB.prepare("INSERT INTO riddle_progress (user_id,riddle_id,solved_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(user_id,riddle_id) DO UPDATE SET solved_at=COALESCE(solved_at,datetime('now'))");
  await env.DB.batch([...new Set(ids)].map(key=>q.bind(id,key)));
}
async function stateFor(env,id){
  const rows=await gameRows(env,id),state=buildGameState(rows);
  if(id){const existing=new Set(rows.filter(r=>r.solved_at).map(r=>r.riddle_id));await saveIds(env,id,state.pages.map(p=>'@eg/seen/'+p.id).filter(key=>!existing.has(key)));}
  return {...state,anonyme:!id};
}
async function bodyOf(request){if(Number(request.headers.get('Content-Length'))>40000)throw new Error('Requête trop grande.');const text=await request.text();if(text.length>40000)throw new Error('Requête trop grande.');return JSON.parse(text);}
export async function handleEchelon(request,env,path,{getUser,json}){
  const user=await getUser(request,env),id=user?.id;
  if(request.method==='GET'&&(path==='/api/echelon'||path==='/api/57'))return json(await stateFor(env,id));
  if(!id)return json({error:'Connecte-toi pour conserver tes découvertes.'},401);
  const rows=await gameRows(env,id),p=progress(rows);
  if(request.method==='GET'&&path==='/api/echelon/map')return json(buildJourney(rows));
  let body={};
  if(request.method==='POST')try{body=await bodyOf(request);}catch{return json({error:'Requête invalide.'},400);}
  const draftMatch=/^\/api\/echelon\/draft\/([a-z0-9-]+)$/.exec(path);
  if(draftMatch){
    const n=getGameNode(draftMatch[1]);
    if(!n||n.kind!=='workshop'||!isVisible(n,p))return json({error:'Page indisponible.'},404);
    if(!isPlayable(n,p))return json({error:'Ce tableau n’est pas encore ouvert.'},403);
    const current=await env.DB.prepare('SELECT draft,revision,updated_at FROM echelon_drafts WHERE user_id=?1 AND board_id=?2').bind(id,n.id).first();
    if(request.method==='GET')return json({sources:boardSources[n.board],draft:current?JSON.parse(current.draft):null,revision:current?.revision||0});
    if(request.method!=='POST')return json({error:'Méthode indisponible.'},405);
    // A single save may contain both the discovery and the duplication. Do not
    // make the player wait for a previous autosave to unlock the operation.
    const share=p.milestones.has(SHARE)||(n.board==='pair'&&hasTwoSevens(body.draft?.items));
    let draft;try{draft=validDraft(body.draft,n.board,share);}catch(e){return json({error:e.message},400);}
    if(!Number.isInteger(body.revision)||body.revision<0)return json({error:'Version invalide.'},400);
    const result=await env.DB.prepare("INSERT INTO echelon_drafts(user_id,board_id,draft,revision) SELECT ?1,?2,?3,1 WHERE ?4=0 ON CONFLICT(user_id,board_id) DO UPDATE SET draft=excluded.draft,revision=echelon_drafts.revision+1,updated_at=datetime('now') WHERE echelon_drafts.revision=?4").bind(id,n.id,JSON.stringify(draft),body.revision).run();
    // SQLite's INSERT SELECT cannot update a nonzero revision; use a CAS update.
    let changed=result.meta.changes;
    if(body.revision>0){const update=await env.DB.prepare("UPDATE echelon_drafts SET draft=?1,revision=revision+1,updated_at=datetime('now') WHERE user_id=?2 AND board_id=?3 AND revision=?4").bind(JSON.stringify(draft),id,n.id,body.revision).run();changed=update.meta.changes;}
    if(!changed)return json({error:'Un autre appareil a modifié ce tableau. Ton brouillon local est conservé.',conflict:true},409);
    if(n.board==='pair'&&!p.milestones.has(SHARE)&&hasTwoSevens(draft.items))await saveIds(env,id,[SHARE]);
    return json({revision:body.revision+1,state:await stateFor(env,id)});
  }
  if(request.method!=='POST'||!['/api/echelon/guess','/api/57/guess'].includes(path))return json({error:'Page indisponible.'},404);
  const n=getGameNode(String(body.id||''));
  if(!n||!isVisible(n,p))return json({error:'Page indisponible.'},404);
  if(!isPlayable(n,p))return json({error:'Cette énigme n’est pas encore ouverte.'},403);
  if(n.answers.every(a=>p.solved.has(a.id)))return json({ok:true,gained:0,message:'Cette lecture est déjà trouvée.',state:await stateFor(env,id)});
  const text=String(body.answer||'').trim();
  if(text.length>200||(!text&&n.kind!=='workshop'))return json({error:'Propose un signe.'},400);
  const now=Date.now();
  const claim=await env.DB.prepare('INSERT INTO echelon_attempts(user_id,next_at) VALUES (?1,?2) ON CONFLICT(user_id) DO UPDATE SET next_at=excluded.next_at WHERE echelon_attempts.next_at<=?3').bind(id,now+5000,now).run();
  if(!claim.meta.changes){const wait=await env.DB.prepare('SELECT next_at FROM echelon_attempts WHERE user_id=?1').bind(id).first();return json({error:'Prends un instant avant de réessayer.',attenteMs:Math.max(0,wait.next_at-now)},429);}
  let prise;
  if(n.kind==='workshop'){
    const share=p.milestones.has(SHARE)||(n.board==='pair'&&hasTwoSevens(body.roots));
    const valid=validateConstruction(n.board,body.roots,share);
    prise=valid?(n.board==='first'?matchNode(n,text,p.solved,p.parts):{prises:[{id:n.answers[0].id,masque:1,complet:true}],echo:[]}):null;
  }else prise=matchNode(n,text,p.solved,p.parts);
  const fresh=prise?.prises||[];
  const known=!!prise?.echo?.length&&prise.echo.every(t=>t.ok);
  if(!fresh.length){
    if(known)await env.DB.prepare('UPDATE echelon_attempts SET next_at=0,failures=0 WHERE user_id=?1').bind(id).run();
    else await env.DB.prepare('UPDATE echelon_attempts SET failures=failures+1,next_at=?1+CASE WHEN failures>=9 THEN 60000 WHEN failures>=4 THEN 30000 ELSE 500 END WHERE user_id=?2').bind(Date.now(),id).run();
    return json({ok:known,gained:0,message:known?'Cette lecture est déjà trouvée.':n.kind==='workshop'?'Cette construction ne révèle pas encore une nouvelle lecture.':'Cette lecture ne correspond pas encore.',echo:prise?.echo||[],state:await stateFor(env,id)});
  }
  const ids=[];
  for(const v of fresh){const ans=n.answers.find(a=>a.id===v.id);for(let i=0;i<ans.parties.length;i++)if(v.masque&(1<<i))ids.push(v.id+'.p'+i);if(v.complet)ids.push(v.id);}
  await saveIds(env,id,ids);
  await env.DB.prepare('UPDATE echelon_attempts SET next_at=0,failures=0 WHERE user_id=?1').bind(id).run();
  const state=await stateFor(env,id);
  return json({ok:true,gained:Math.max(0,state.echelon-p.solved.size),echo:prise.echo||[],state});
}
