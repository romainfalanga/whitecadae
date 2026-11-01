import {fail,objectBody,text} from './private-data.js';

export const THEME_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS loge_themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 140),
    normalized TEXT NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS loge_theme_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL REFERENCES loge_themes(id),
    target_week TEXT NOT NULL CHECK(length(target_week)=10),
    starts_at INTEGER NOT NULL,
    opens_at INTEGER NOT NULL CHECK(opens_at<starts_at),
    proposed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(target_week,theme_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_candidates_week ON loge_theme_candidates(target_week,id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_loge_candidates_deadline ON loge_theme_candidates(starts_at,target_week)`,
  `CREATE TABLE IF NOT EXISTS loge_theme_votes (
    candidate_id INTEGER NOT NULL REFERENCES loge_theme_candidates(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(candidate_id,user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_theme_votes_user ON loge_theme_votes(user_id,candidate_id)`,
  `CREATE TABLE IF NOT EXISTS loge_theme_weeks (
    week_start TEXT PRIMARY KEY CHECK(length(week_start)=10),
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
    theme_id INTEGER REFERENCES loge_themes(id),
    candidate_id INTEGER REFERENCES loge_theme_candidates(id),
    likes INTEGER NOT NULL DEFAULT 0 CHECK(likes>=0),
    settled_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_theme_weeks_theme ON loge_theme_weeks(theme_id,week_start DESC)`,
  `CREATE TABLE IF NOT EXISTS loge_post_themes (
    post_id INTEGER PRIMARY KEY REFERENCES loge_posts(id) ON DELETE CASCADE,
    theme_id INTEGER NOT NULL REFERENCES loge_themes(id),
    week_start TEXT NOT NULL REFERENCES loge_theme_weeks(week_start)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_post_themes_theme ON loge_post_themes(theme_id,post_id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_loge_post_themes_week ON loge_post_themes(week_start,post_id DESC)`
];
const ready=new WeakMap();
export async function ensureThemeTables(env){
  if(!ready.has(env.DB))ready.set(env.DB,env.DB.batch(THEME_SCHEMA.map(sql=>env.DB.prepare(sql))).catch(error=>{ready.delete(env.DB);throw error;}));
  await ready.get(env.DB);
}

const parisDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function partsAt(ms){return Object.fromEntries(parisDate.formatToParts(ms).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));}
function civilDate(key){const [year,month,day]=key.split('-').map(Number),date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);return date;}
const dateKey=date=>date.toISOString().slice(0,10);
function midnight(key){
  const civil=civilDate(key).getTime();let instant=civil;
  for(let i=0;i<3;i++){const p=partsAt(instant),wall=civilDate(`${String(p.year).padStart(4,'0')}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`).getTime()+(p.hour*3600+p.minute*60+p.second)*1000;instant+=civil-wall;}
  return instant/1000;
}
export function parisWeek(nowMs=Date.now()){
  if(!Number.isFinite(nowMs))throw new TypeError('Invalid week time');
  const p=partsAt(nowMs),date=civilDate(`${String(p.year).padStart(4,'0')}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`);
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  const key=dateKey(date),start=midnight(key);date.setUTCDate(date.getUTCDate()+7);
  const nextKey=dateKey(date),nextStart=midnight(nextKey);date.setUTCDate(date.getUTCDate()+7);
  return {key,start,end:nextStart,nextKey,nextStart,nextEnd:midnight(dateKey(date))};
}
function weekKey(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Semaine invalide.');
  const date=civilDate(value);
  if(dateKey(date)!==value||date.getUTCDay()!==1)fail('Semaine invalide.');
  return value;
}
const iso=seconds=>new Date(seconds*1000).toISOString();
const rows=async statement=>(await statement.all()).results||[];
const winnerQuery=`SELECT c.id,c.theme_id,(SELECT count(*) FROM loge_theme_votes v WHERE v.candidate_id=c.id AND v.created_at<c.starts_at) AS likes
  FROM loge_theme_candidates c WHERE c.target_week=?1 AND c.created_at<c.starts_at
  ORDER BY likes DESC,c.id ASC LIMIT 1`;
function settlement(env,key){
  const week=parisWeek(midnight(weekKey(key))*1000);
  // One statement freezes the winner and its count atomically. A late or
  // concurrent request cannot replace an already settled edition.
  return env.DB.prepare(`INSERT OR IGNORE INTO loge_theme_weeks(week_start,starts_at,ends_at,theme_id,candidate_id,likes)
    SELECT ?1,?2,?3,w.theme_id,w.id,COALESCE(w.likes,0)
    FROM (SELECT 1) LEFT JOIN (${winnerQuery}) w ON 1=1
    WHERE ?2<=unixepoch()`).bind(key,week.start,week.end);
}
export async function settleThemeWeeks(env,nowMs=Date.now()){
  await ensureThemeTables(env);
  const cutoff=Math.floor(nowMs/1000);
  // Process all missed candidate editions in bounded D1 batches. No empty
  // historical weeks are fabricated; the current empty edition is recorded.
  for(;;){
    const pending=await rows(env.DB.prepare(`SELECT c.target_week FROM loge_theme_candidates c
      WHERE c.starts_at<=?1 AND c.starts_at<=unixepoch()
      AND NOT EXISTS(SELECT 1 FROM loge_theme_weeks w WHERE w.week_start=c.target_week)
      GROUP BY c.target_week ORDER BY c.target_week LIMIT 40`).bind(cutoff));
    if(!pending.length)break;
    await env.DB.batch(pending.map(row=>settlement(env,row.target_week)));
  }
  await settlement(env,parisWeek(nowMs).key).run();
}
export async function getCurrentTheme(env,nowMs=Date.now()){
  await settleThemeWeeks(env,nowMs);
  const week=parisWeek(nowMs),row=await env.DB.prepare(`SELECT w.theme_id,t.title,w.likes FROM loge_theme_weeks w
    LEFT JOIN loge_themes t ON t.id=w.theme_id WHERE w.week_start=?1`).bind(week.key).first();
  return {week:week.key,themeId:row?.theme_id??null,title:row?.title??null,startsAt:week.start,endsAt:week.end,likes:row?.likes??0};
}
export async function postThemeAssignment(env,requestedWeek,nowMs=Date.now()){
  if(requestedWeek===null||requestedWeek===undefined)return null;
  weekKey(requestedWeek);
  const current=await getCurrentTheme(env,nowMs);
  if(requestedWeek!==current.week||current.themeId===null)fail('Le thème de la semaine a changé. Recharge la page.',409);
  return {week:current.week,themeId:current.themeId};
}

function positiveId(value,status=400){if(typeof value==='string'){if(!/^[1-9]\d*$/.test(value))fail('Identifiant invalide.',status);value=Number(value);}if(!Number.isSafeInteger(value)||value<1)fail('Identifiant invalide.',status);return value;}
function cursor(url){const value=url.searchParams.get('after');return value===null?0:positiveId(value);}
const normalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replace(/\s+/gu,' ').trim();
function titleOf(value){const title=text(value,140,true);if(/[\u0000-\u001f\u007f]/u.test(title))fail('Titre invalide.');return title.replace(/\s+/gu,' ');}
async function bodyOf(request,allowed){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('Une requête JSON est requise.',415);
  const body=await objectBody(request,4096);
  if(Object.keys(body).some(key=>!allowed.includes(key)))fail('Requête invalide.');
  return body;
}
const proposalFields=`c.id,c.theme_id,t.title,c.proposed_by,u.username,c.created_at,
  (SELECT count(*) FROM loge_theme_votes v WHERE v.candidate_id=c.id AND v.created_at<c.starts_at) AS likes,
  EXISTS(SELECT 1 FROM loge_theme_votes v WHERE v.candidate_id=c.id AND v.user_id=?1 AND v.created_at<c.starts_at) AS liked`;
const proposalSelect=`SELECT ${proposalFields} FROM loge_theme_candidates c JOIN loge_themes t ON t.id=c.theme_id LEFT JOIN users u ON u.id=c.proposed_by`;
const proposalView=row=>({id:row.id,themeId:row.theme_id,title:row.title,likes:row.likes,liked:!!row.liked,proposedBy:{id:row.proposed_by,username:row.username||'Membre supprimé'},createdAt:iso(row.created_at)});
const nextWeekOf=week=>({week:week.nextKey,startsAt:week.nextStart,endsAt:week.nextEnd});
async function listProposals(env,userId,url,week){
  const found=await rows(env.DB.prepare(proposalSelect+' WHERE c.target_week=?2 AND (?3=0 OR c.id<?3) ORDER BY c.id DESC LIMIT 21').bind(userId,week.nextKey,cursor(url)));
  return {proposals:found.slice(0,20).map(proposalView),next:found.length>20?found[19].id:null,nextWeek:nextWeekOf(week)};
}
async function history(env,url){
  const q=normalize(text(url.searchParams.get('q')??'',140)),after=cursor(url);
  const found=await rows(env.DB.prepare(`SELECT t.id,t.title,MAX(w.week_start) AS last_week,count(*) AS editions,
    (SELECT count(*) FROM loge_post_themes pt JOIN loge_posts p ON p.id=pt.post_id WHERE pt.theme_id=t.id AND p.deleted_at IS NULL) AS video_count
    FROM loge_themes t JOIN loge_theme_weeks w ON w.theme_id=t.id
    WHERE (?1=0 OR t.id<?1) AND (?2='' OR instr(t.normalized,?2)>0)
    GROUP BY t.id ORDER BY t.id DESC LIMIT 21`).bind(after,q));
  return {themes:found.slice(0,20).map(row=>({id:row.id,title:row.title,lastWeek:row.last_week,editions:row.editions,videoCount:row.video_count})),next:found.length>20?found[19].id:null};
}
function requestedNext(value,week){weekKey(value);if(value!==week.nextKey)fail('Les propositions de cette semaine sont closes. Recharge la page.',409);}
const openGuard=`?3<=unixepoch() AND unixepoch()<?4 AND NOT EXISTS(SELECT 1 FROM loge_theme_weeks WHERE week_start=?2)`;
async function propose(request,env,user,week,json){
  const body=await bodyOf(request,['title','themeId','targetWeek']);requestedNext(body.targetWeek,week);
  const hasTitle=Object.hasOwn(body,'title'),hasId=Object.hasOwn(body,'themeId');
  if(hasTitle===hasId)fail('Choisis un titre ou un thème existant.');
  let title=null,normalized=null,themeId=null;
  if(hasTitle){title=titleOf(body.title);normalized=normalize(title);if(!normalized)fail('Titre invalide.');}
  else{
    if(typeof body.themeId!=='number')fail('Identifiant invalide.');themeId=positiveId(body.themeId);
    if(!await env.DB.prepare('SELECT 1 FROM loge_theme_weeks WHERE theme_id=?1 LIMIT 1').bind(themeId).first())fail('Thème introuvable.',404);
  }
  const statements=[];
  if(hasTitle)statements.push(env.DB.prepare(`INSERT INTO loge_themes(title,normalized,created_by)
    SELECT ?1,?5,?6 WHERE ${openGuard} ON CONFLICT(normalized) DO NOTHING`).bind(title,week.nextKey,week.start,week.nextStart,normalized,user.id));
  statements.push(env.DB.prepare(`INSERT INTO loge_theme_candidates(theme_id,target_week,opens_at,starts_at,proposed_by)
    SELECT t.id,?2,?3,?4,?5 FROM loge_themes t WHERE ${hasTitle?'t.normalized=?1':'t.id=?1'} AND ${openGuard}
    ON CONFLICT(target_week,theme_id) DO NOTHING`).bind(hasTitle?normalized:themeId,week.nextKey,week.start,week.nextStart,user.id));
  const results=await env.DB.batch(statements);
  const row=await env.DB.prepare(proposalSelect+` WHERE c.target_week=?2 AND ${hasTitle?'t.normalized=?3':'t.id=?3'}`).bind(user.id,week.nextKey,hasTitle?normalized:themeId).first();
  await stillOpen(env,week);
  if(!row)fail('Les propositions de cette semaine sont closes. Recharge la page.',409);
  return json({proposal:proposalView(row)},results.at(-1).meta.changes?201:200);
}
async function stillOpen(env,week){
  const open=await env.DB.prepare('SELECT 1 WHERE ?1<=unixepoch() AND unixepoch()<?2 AND NOT EXISTS(SELECT 1 FROM loge_theme_weeks WHERE week_start=?3)').bind(week.start,week.nextStart,week.nextKey).first();
  if(!open)fail('Les propositions de cette semaine sont closes. Recharge la page.',409);
}
async function like(request,env,user,week,id,json){
  const body=await bodyOf(request,['liked','targetWeek']);if(typeof body.liked!=='boolean')fail('État de soutien invalide.');requestedNext(body.targetWeek,week);
  const condition=`EXISTS(SELECT 1 FROM loge_theme_candidates c WHERE c.id=?1 AND c.target_week=?3 AND c.opens_at<=unixepoch() AND unixepoch()<c.starts_at
    AND NOT EXISTS(SELECT 1 FROM loge_theme_weeks w WHERE w.week_start=c.target_week))`;
  if(body.liked)await env.DB.prepare(`INSERT INTO loge_theme_votes(candidate_id,user_id) SELECT ?1,?2 WHERE ${condition} ON CONFLICT(candidate_id,user_id) DO NOTHING`).bind(id,user.id,week.nextKey).run();
  else await env.DB.prepare(`DELETE FROM loge_theme_votes WHERE candidate_id=?1 AND user_id=?2 AND ${condition}`).bind(id,user.id,week.nextKey).run();
  await stillOpen(env,week);
  const row=await env.DB.prepare(proposalSelect+' WHERE c.id=?2 AND c.target_week=?3').bind(user.id,id,week.nextKey).first();
  if(!row)fail('Proposition introuvable.',404);
  return json({proposal:proposalView(row)});
}

// handleLoge performs authentication, earned-level and account-binding checks.
export async function handleThemes(request,env,url,user,json){
  await ensureThemeTables(env);
  const clock=await env.DB.prepare(`SELECT unixepoch() AS now,
    COALESCE((SELECT next_publish_at FROM loge_publication_limits WHERE user_id=?1),0) AS next_at`).bind(user.id).first(),nowMs=clock.now*1000,week=parisWeek(nowMs);
  await settleThemeWeeks(env,nowMs);
  const path=url.pathname.replace(/\/+$/,''),method=request.method;
  if(path==='/api/loge/themes'){
    if(method!=='GET')fail('Méthode indisponible.',405);
    const [current,proposals,past]=await Promise.all([getCurrentTheme(env,nowMs),listProposals(env,user.id,url,week),history(env,new URL(url.origin+url.pathname))]);
    return json({current,nextWeek:proposals.nextWeek,proposals:proposals.proposals,next:proposals.next,history:past.themes,historyNext:past.next,nextPublicationAt:clock.next_at>clock.now?iso(clock.next_at):null,serverNow:iso(clock.now)});
  }
  if(path==='/api/loge/themes/proposals'){
    if(method==='GET')return json(await listProposals(env,user.id,url,week));
    if(method==='POST')return propose(request,env,user,week,json);
    fail('Méthode indisponible.',405);
  }
  if(path==='/api/loge/themes/history'){
    if(method!=='GET')fail('Méthode indisponible.',405);return json(await history(env,url));
  }
  const match=/^\/api\/loge\/themes\/proposals\/([1-9]\d*)\/like$/.exec(path);
  if(match){if(method!=='PUT')fail('Méthode indisponible.',405);return like(request,env,user,week,positiveId(match[1],404),json);}
  fail('Page introuvable.',404);
}
