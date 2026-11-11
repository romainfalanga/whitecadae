import {ensureLogeStreamTables,createLogeUpload,getLogeUpload,deleteLogeUpload,readyLogeUpload,logePlayback,LOGE_STREAM_MARKER,SHARED_UPLOAD_LIVE,LOGE_ROOM_SQL} from './loge-stream.js';
import {LOGE_LEGACY_SOURCES} from './features.js';
import {videoBranchKey,LOGE_ROOMS,logeRoom} from '../public/video-model.js';
import {gameRows} from './echelon-api.js';
import {gameLevel} from './echelon.js';
import {GAME_MASTER_BLANC_LEVEL} from './content-access.js';
import {fail,objectBody,text,integer,identifier,unseal,lifeEventContext} from './private-data.js';
import {youtubeId} from '../public/youtube-video.js';
import {ensureThemeTables,handleThemes,getCurrentTheme,postThemeAssignment} from './loge-themes.js';

export const LOGE_WEEK_SECONDS=168*60*60;
export const LOGE_PAGE_SIZE=20;
export const LOGE_COMMENT_WRITES_PER_MINUTE=45;
export const LOGE_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS loge_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    UNIQUE(author_id,request_id),
    CHECK(deleted_at IS NOT NULL OR (length(youtube_id)=11 AND length(title) BETWEEN 1 AND 140 AND length(description) BETWEEN 1 AND 5000))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_posts_author ON loge_posts(author_id,id DESC)`,
  `CREATE TABLE IF NOT EXISTS loge_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES loge_posts(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    body TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER,
    UNIQUE(author_id,request_id),
    CHECK(deleted_at IS NOT NULL OR length(body) BETWEEN 1 AND 2000)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_comments_post ON loge_comments(post_id,id)`,
  `CREATE INDEX IF NOT EXISTS idx_loge_comments_author ON loge_comments(author_id,id DESC)`,
  `CREATE TABLE IF NOT EXISTS loge_publication_limits (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    next_publish_at INTEGER NOT NULL DEFAULT 0,
    claim_token TEXT NOT NULL DEFAULT '',
    write_window_at INTEGER NOT NULL DEFAULT 0,
    write_count INTEGER NOT NULL DEFAULT 0,
    write_claim_token TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS loge_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES loge_posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id,post_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_favorites_user ON loge_favorites(user_id,id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_loge_favorites_post ON loge_favorites(post_id)`
];
const ready=new WeakMap();
export async function ensureLogeTables(env){
  if(!ready.has(env.DB)){
    const pending=env.DB.batch(LOGE_SCHEMA.map(sql=>env.DB.prepare(sql))).catch(error=>{ready.delete(env.DB);throw error;});
    ready.set(env.DB,pending);
  }
  await ready.get(env.DB);
}

const iso=value=>new Date(value*1000).toISOString();
const person=row=>({id:row.author_id??row.id,username:row.username,avatar:row.has_avatar?`/api/roadmap/avatar/${row.author_id??row.id}`:null});
const authorFields=`u.username,u.avatar_data IS NOT NULL AS has_avatar`;
const themeFields=`(SELECT pt.theme_id FROM loge_post_themes pt WHERE pt.post_id=p.id) AS theme_id,
  (SELECT t.title FROM loge_post_themes pt JOIN loge_themes t ON t.id=pt.theme_id WHERE pt.post_id=p.id) AS theme_title,
  (SELECT pt.week_start FROM loge_post_themes pt WHERE pt.post_id=p.id) AS theme_week`;
const streamFields=`COALESCE((SELECT s.stream_id FROM loge_stream_uploads s WHERE s.post_id=p.id AND s.state='published'),
  (SELECT s.stream_id FROM loge_shared_videos v JOIN loge_stream_uploads s ON ${SHARED_UPLOAD_LIVE} WHERE v.post_id=p.id)) AS stream_id,
  (SELECT e.video_branch FROM loge_shared_videos v JOIN life_events e ON e.owner_id=v.user_id AND e.id=v.event_id WHERE v.post_id=p.id) AS video_branch`;
const postFields=`p.*,${streamFields},${authorFields},${themeFields},(SELECT count(*) FROM loge_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comment_count`;
const postSelect=`SELECT ${postFields} FROM loge_posts p JOIN users u ON u.id=p.author_id`;
const commentSelect=`SELECT c.*,${authorFields} FROM loge_comments c JOIN users u ON u.id=c.author_id JOIN loge_posts p ON p.id=c.post_id`;
const postView=row=>({id:row.id,author:person(row),title:row.title,description:row.description,videoProvider:row.stream_id?'stream':'youtube',category:row.video_branch?videoBranchKey(row.video_branch):null,loge:logeRoom(row.video_branch),youtubeUrl:row.stream_id?null:'https://www.youtube.com/watch?v='+row.youtube_id,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),revision:row.revision,commentCount:row.comment_count,isFavorite:!!row.is_favorite,theme:row.theme_id?{id:row.theme_id,title:row.theme_title,week:row.theme_week}:null});
const commentView=row=>({id:row.id,postId:row.post_id,author:person(row),body:row.body,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),revision:row.revision});
const cursor=url=>integer(Number(url.searchParams.get('after')||0));
const safeId=value=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)fail('Page introuvable.',404);return id;};
const page=(rows,view)=>({items:rows.slice(0,LOGE_PAGE_SIZE).map(view),next:rows.length>LOGE_PAGE_SIZE?rows[LOGE_PAGE_SIZE-1].id:null});
const clean=(value,max,required=true)=>{
  const out=text(value,max,required);
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(out))fail('Texte invalide.');
  return out;
};
function titleOf(value){const out=clean(value,140);if(/[\r\n\t]/.test(out))fail('Titre invalide.');return out;}
function requestId(value){
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))fail('Identifiant de publication invalide.');
  return value.toLowerCase();
}
async function fingerprint(values){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function bodyOf(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('Une requête JSON est requise.',415);
  return objectBody(request,32768);
}
async function timing(env,userId){
  const row=await env.DB.prepare(`SELECT unixepoch() AS now,COALESCE((SELECT next_publish_at FROM loge_publication_limits WHERE user_id=?1),0) AS next_at`).bind(userId).first();
  return {nextPublicationAt:row.next_at>row.now?iso(row.next_at):null,serverNow:iso(row.now),retryAfter:Math.max(0,row.next_at-row.now)};
}
async function selfOf(env,userId){
  const row=await env.DB.prepare('SELECT id,username,avatar_data IS NOT NULL AS has_avatar FROM users WHERE id=?1').bind(userId).first();
  if(!row)fail('Membre introuvable.',404);return person(row);
}
async function favoriteIds(env,userId,ids){
  if(!ids.length)return new Set();
  const unique=[...new Set(ids)];
  const rows=(await env.DB.prepare(`SELECT post_id FROM loge_favorites WHERE user_id=?1 AND post_id IN (${unique.map((_,i)=>'?'+(i+2)).join(',')})`).bind(userId,...unique).all()).results||[];
  return new Set(rows.map(row=>row.post_id));
}
async function withFavorites(env,userId,rows){
  const saved=await favoriteIds(env,userId,rows.map(row=>row.id));
  return rows.map(row=>({...row,is_favorite:saved.has(row.id)}));
}
async function visiblePost(env,id,viewerId=null){
  const row=await env.DB.prepare(postSelect+' WHERE p.id=?1 AND p.deleted_at IS NULL').bind(id).first();
  if(!row)fail('Publication introuvable.',404);
  if(viewerId!==null)row.is_favorite=(await favoriteIds(env,viewerId,[id])).has(id);
  return row;
}
async function ownedPost(env,id,userId){
  const row=await visiblePost(env,id);if(row.author_id!==userId)fail('Publication introuvable.',404);return row;
}
async function visibleComment(env,id){
  const row=await env.DB.prepare(commentSelect+' WHERE c.id=?1 AND c.deleted_at IS NULL AND p.deleted_at IS NULL').bind(id).first();
  if(!row)fail('Commentaire introuvable.',404);return row;
}
async function ownedComment(env,id,userId){
  const row=await visibleComment(env,id);if(row.author_id!==userId)fail('Commentaire introuvable.',404);return row;
}
function sameRequest(row,hash){
  if(row.request_fingerprint!==hash)fail('Cet envoi a déjà été utilisé avec un autre contenu.',409);
  if(row.deleted_at!==null)fail('Ce contenu a été supprimé.',404);
}
const immutableVideo=body=>{if(['url','youtubeUrl','youtubeId','youtube_id','videoId','uploadId','videoProvider','streamId','eventId'].some(field=>Object.hasOwn(body,field)))fail('La vidéo d’une publication ne peut pas être remplacée.');};
async function conflict(env,type,id,userId,json){
  if(type==='post')await ownedPost(env,id,userId);else await ownedComment(env,id,userId);
  throw json({error:'Ce contenu a changé. Recharge-le avant de réessayer.',conflict:true},409);
}
async function commentLimitRefusal(env,userId,json){
  const row=await env.DB.prepare('SELECT unixepoch() AS now,write_window_at FROM loge_publication_limits WHERE user_id=?1').bind(userId).first();
  const wait=Math.max(1,(row?.write_window_at||0)+60-(row?.now||0));
  return json({error:'Prends quelques instants avant de réessayer.'},429,{'Retry-After':String(wait)});
}
function reserveComment(env,userId,claim,nonce=null){
  // The post quota and the short comment-write budget are independent columns.
  // A repeated create request never consumes another comment-write slot.
  const notRetried=nonce?'NOT EXISTS(SELECT 1 FROM loge_comments WHERE author_id=?1 AND request_id=?3)':'1';
  return env.DB.prepare(`INSERT INTO loge_publication_limits(user_id,write_window_at,write_count,write_claim_token)
    SELECT ?1,unixepoch(),1,?2 WHERE ${notRetried}
    ON CONFLICT(user_id) DO UPDATE SET
      write_window_at=CASE WHEN write_window_at<=unixepoch()-60 THEN unixepoch() ELSE write_window_at END,
      write_count=CASE WHEN write_window_at<=unixepoch()-60 THEN 1 ELSE write_count+1 END,
      write_claim_token=excluded.write_claim_token
    WHERE (write_window_at<=unixepoch()-60 OR write_count<${LOGE_COMMENT_WRITES_PER_MINUTE}) AND ${notRetried}`).bind(...(nonce?[userId,claim,nonce]:[userId,claim]));
}

async function createPost(request,env,user,json,legacySources){
  const body=await bodyOf(request),fromVideography=Object.hasOwn(body,'eventId'),streamUpload=Object.hasOwn(body,'uploadId');
  if(!fromVideography&&!legacySources)fail('Choisis une vidéo de ta vidéographie pour la publier dans les Loges virtuelles.');
  const eventId=fromVideography?identifier(body.eventId):null,ownTitle=Object.hasOwn(body,'title');
  // A shared video keeps the title it has in the videography unless one is given.
  let entryTitle=null;
  if(fromVideography&&!ownTitle){
    const entry=await env.DB.prepare('SELECT payload FROM life_events WHERE owner_id=?1 AND id=?2 AND video_branch IS NOT NULL').bind(user.id,eventId).first();
    if(!entry)fail('Cette vidéo n’est plus dans ta vidéographie.',404);
    entryTitle=String((await unseal(env,lifeEventContext(user.id,eventId),entry.payload)).title||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,140)||'Sans titre';
  }
  const title=ownTitle?titleOf(body.title):fromVideography?entryTitle:titleOf(body.title),description=Object.hasOwn(body,'description')?clean(body.description,5000):title,video=fromVideography||streamUpload?LOGE_STREAM_MARKER:youtubeId(body.url),nonce=requestId(body.requestId);
  // Existing D1 tables require a nonempty description. A title-only client
  // fills that legacy column without rebuilding tables or changing old text.
  if([fromVideography,streamUpload,Object.hasOwn(body,'url')].filter(Boolean).length>1)fail('Choisis une seule source vidéo.');
  if(!video)fail('Ce lien YouTube n’est pas valide.');
  const hasThemeWeek=Object.hasOwn(body,'themeWeek'),requestedWeek=hasThemeWeek?body.themeWeek:null;
  if(requestedWeek!==null&&(typeof requestedWeek!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)||!Number.isFinite(Date.parse(requestedWeek+'T00:00:00Z'))||new Date(requestedWeek+'T00:00:00Z').toISOString().slice(0,10)!==requestedWeek))fail('Semaine de thème invalide.');
  // Keep the original fingerprint format for older clients. An explicit choice
  // participates in idempotency, including an explicit unchecked (null) choice.
  const identity=fromVideography?['videography',eventId]:streamUpload?['stream',body.uploadId]:video;
  // A derived title stays out of the fingerprint, so renaming the video never breaks a retry.
  const signed=fromVideography&&!ownTitle?[null,null,identity]:[title,description,identity];
  const hash=await fingerprint(hasThemeWeek?[...signed,requestedWeek]:signed);
  const repeated=await env.DB.prepare('SELECT id,request_fingerprint,deleted_at FROM loge_posts WHERE author_id=?1 AND request_id=?2').bind(user.id,nonce).first();
  if(repeated){sameRequest(repeated,hash);const time=await timing(env,user.id);return json({post:postView(await visiblePost(env,repeated.id,user.id)),nextPublicationAt:time.nextPublicationAt});}
  // Resolve only after nonce replay: a successful old-week retry must retain
  // its original post and theme even after the weekly selection changes.
  const assignment=await postThemeAssignment(env,requestedWeek);
  let upload=null;
  if(streamUpload){
    try{upload=await readyLogeUpload(env,user,body.uploadId);}catch(error){
      // A concurrent replay may finish while this call checks the provider.
      const replay=await env.DB.prepare('SELECT id,request_fingerprint,deleted_at FROM loge_posts WHERE author_id=?1 AND request_id=?2').bind(user.id,nonce).first();
      if(!replay)throw error;
      sameRequest(replay,hash);const time=await timing(env,user.id);
      return json({post:postView(await visiblePost(env,replay.id,user.id)),nextPublicationAt:time.nextPublicationAt});
    }
  }
  // A videography entry is shared, never copied: the post reads the member's
  // own published upload for as long as both exist.
  let shared=null;
  if(fromVideography){
    shared=await env.DB.prepare(`SELECT s.id,e.video_branch FROM loge_stream_uploads s JOIN life_events e ON e.owner_id=s.user_id AND e.id=s.event_id
      WHERE s.user_id=?1 AND s.event_id=?2 AND s.purpose='videography' AND s.state='published' AND e.video_branch IS NOT NULL`).bind(user.id,eventId).first();
    if(!shared)fail('Cette vidéo n’est plus dans ta vidéographie.',404);
    if(!LOGE_ROOMS.includes(shared.video_branch))fail('Cette catégorie n’a pas de loge : la vidéo reste dans ta vidéographie.',409);
    if(await env.DB.prepare('SELECT 1 FROM loge_shared_videos v JOIN loge_posts p ON p.id=v.post_id WHERE v.upload_id=?1 AND p.deleted_at IS NULL').bind(shared.id).first())fail('Cette vidéo est déjà publiée dans les Loges virtuelles.',409);
  }
  const claim=crypto.randomUUID();
  const activeWeek=assignment?`EXISTS(SELECT 1 FROM loge_theme_weeks w WHERE w.week_start=?9 AND w.theme_id=?10 AND w.starts_at<=unixepoch() AND unixepoch()<w.ends_at)`:'1';
  const reserveActiveWeek=assignment?`EXISTS(SELECT 1 FROM loge_theme_weeks w WHERE w.week_start=?5 AND w.theme_id=?6 AND w.starts_at<=unixepoch() AND unixepoch()<w.ends_at)`:'1';
  const uploadEligible=placeholder=>shared?`(EXISTS(SELECT 1 FROM loge_stream_uploads s JOIN life_events e ON e.owner_id=s.user_id AND e.id=s.event_id
      WHERE s.id=${placeholder} AND s.user_id=?1 AND s.purpose='videography' AND s.state='published' AND e.video_branch IN (${LOGE_ROOM_SQL}))
    AND NOT EXISTS(SELECT 1 FROM loge_shared_videos v JOIN loge_posts lp ON lp.id=v.post_id WHERE v.upload_id=${placeholder} AND lp.deleted_at IS NULL))`
    :`(${placeholder}='' OR EXISTS(SELECT 1 FROM loge_stream_uploads s WHERE s.id=${placeholder} AND s.user_id=?1 AND s.state='ready' AND s.post_id IS NULL AND s.expires_at>unixepoch()))`;
  // Every write rechecks the server-selected edition inside the transaction.
  // The final assertion rolls back a reservation if the edition expires between
  // statements, so a rejected theme choice cannot spend the publication quota.
  const statements=[
    env.DB.prepare(`INSERT INTO loge_publication_limits(user_id,next_publish_at,claim_token)
      SELECT ?1,unixepoch()+${LOGE_WEEK_SECONDS},?2
      WHERE NOT EXISTS(SELECT 1 FROM loge_posts WHERE author_id=?1 AND request_id=?3) AND ${reserveActiveWeek} AND ${uploadEligible('?4')}
      ON CONFLICT(user_id) DO UPDATE SET next_publish_at=excluded.next_publish_at,claim_token=excluded.claim_token
      WHERE next_publish_at<=unixepoch() AND NOT EXISTS(SELECT 1 FROM loge_posts WHERE author_id=?1 AND request_id=?3) AND ${reserveActiveWeek} AND ${uploadEligible('?4')}`)
      .bind(user.id,claim,nonce,(upload||shared)?.id||'',...(assignment?[assignment.week,assignment.themeId]:[])),
    env.DB.prepare(`INSERT INTO loge_posts(author_id,request_id,request_fingerprint,youtube_id,title,description,created_at,updated_at)
      SELECT ?1,?2,?3,?4,?5,?6,q.next_publish_at-${LOGE_WEEK_SECONDS},q.next_publish_at-${LOGE_WEEK_SECONDS}
      FROM loge_publication_limits q WHERE q.user_id=?1 AND q.claim_token=?7
      AND NOT EXISTS(SELECT 1 FROM loge_posts WHERE author_id=?1 AND request_id=?2) AND ${activeWeek} AND ${uploadEligible('?8')}`)
      .bind(user.id,nonce,hash,video,title,description,claim,(upload||shared)?.id||'',...(assignment?[assignment.week,assignment.themeId]:[]))
  ];
  if(shared){
    statements.push(env.DB.prepare(`INSERT INTO loge_shared_videos(post_id,user_id,event_id,upload_id)
      SELECT p.id,?1,?5,?4 FROM loge_posts p JOIN loge_publication_limits q ON q.user_id=p.author_id
      WHERE p.author_id=?1 AND p.request_id=?2 AND q.claim_token=?3 AND ${uploadEligible('?4')}`)
      .bind(user.id,nonce,claim,shared.id,eventId));
    // Same rollback as a direct upload: no quota is spent and no post is kept
    // when the entry was removed or shared elsewhere during the batch.
    statements.push(env.DB.prepare(`UPDATE loge_publication_limits SET next_publish_at=CASE WHEN EXISTS(
      SELECT 1 FROM loge_shared_videos v JOIN loge_posts p ON p.id=v.post_id
      WHERE v.upload_id=?4 AND p.author_id=?1 AND p.request_id=?2
      ) THEN next_publish_at ELSE NULL END WHERE user_id=?1 AND claim_token=?3`)
      .bind(user.id,nonce,claim,shared.id));
  }
  if(upload){
    statements.push(env.DB.prepare(`UPDATE loge_stream_uploads SET post_id=(SELECT p.id FROM loge_posts p WHERE p.author_id=?1 AND p.request_id=?2),
      state='published',upload_url=NULL,duration_seconds=?5,updated_at=unixepoch()
      WHERE id=?4 AND user_id=?1 AND state='ready' AND post_id IS NULL AND expires_at>unixepoch()
      AND EXISTS(SELECT 1 FROM loge_publication_limits q JOIN loge_posts p ON p.author_id=q.user_id WHERE q.user_id=?1 AND q.claim_token=?3 AND p.request_id=?2)`)
      .bind(user.id,nonce,claim,upload.id,upload.details.duration));
    // Roll back the quota and post if readiness/expiry changed during any
    // statement. D1 batches are transactional and NOT NULL is deliberate.
    statements.push(env.DB.prepare(`UPDATE loge_publication_limits SET next_publish_at=CASE WHEN EXISTS(
      SELECT 1 FROM loge_stream_uploads s JOIN loge_posts p ON p.id=s.post_id
      WHERE s.id=?4 AND s.state='published' AND p.author_id=?1 AND p.request_id=?2
      ) THEN next_publish_at ELSE NULL END WHERE user_id=?1 AND claim_token=?3`)
      .bind(user.id,nonce,claim,upload.id));
  }
  if(assignment){
    statements.push(env.DB.prepare(`INSERT INTO loge_post_themes(post_id,theme_id,week_start)
      SELECT p.id,?4,?5 FROM loge_posts p JOIN loge_publication_limits q ON q.user_id=p.author_id
      WHERE p.author_id=?1 AND p.request_id=?2 AND q.claim_token=?3
      AND EXISTS(SELECT 1 FROM loge_theme_weeks w WHERE w.week_start=?5 AND w.theme_id=?4 AND w.starts_at<=unixepoch() AND unixepoch()<w.ends_at)`)
      .bind(user.id,nonce,claim,assignment.themeId,assignment.week));
    statements.push(env.DB.prepare(`UPDATE loge_publication_limits SET next_publish_at=CASE WHEN EXISTS(
      SELECT 1 FROM loge_posts p JOIN loge_post_themes pt ON pt.post_id=p.id
      WHERE p.author_id=?1 AND p.request_id=?2 AND pt.theme_id=?4 AND pt.week_start=?5
      ) THEN next_publish_at ELSE NULL END WHERE user_id=?1 AND claim_token=?3`)
      .bind(user.id,nonce,claim,assignment.themeId,assignment.week));
  }
  let results;
  try{results=await env.DB.batch(statements);}
  catch(error){
    if((upload||shared)&&/NOT NULL constraint failed: loge_publication_limits.next_publish_at/.test(String(error?.message||error)))fail('La vidéo ou le thème n’est plus disponible. Recharge la page avant de publier.',409);
    if(assignment&&/NOT NULL constraint failed: loge_publication_limits.next_publish_at/.test(String(error?.message||error)))fail('Le thème de la semaine a changé. Recharge la page avant de publier.',409);
    throw error;
  }
  const row=await env.DB.prepare('SELECT id,request_fingerprint,deleted_at FROM loge_posts WHERE author_id=?1 AND request_id=?2').bind(user.id,nonce).first();
  const time=await timing(env,user.id);
  if(row){sameRequest(row,hash);return json({post:postView(await visiblePost(env,row.id,user.id)),nextPublicationAt:time.nextPublicationAt},results[1].meta.changes?201:200);}
  if(assignment&&!await env.DB.prepare(`SELECT 1 AS active FROM loge_theme_weeks w
    WHERE w.week_start=?1 AND w.theme_id=?2 AND w.starts_at<=unixepoch() AND unixepoch()<w.ends_at`)
    .bind(assignment.week,assignment.themeId).first())fail('Le thème de la semaine a changé. Recharge la page avant de publier.',409);
  if(upload&&!time.retryAfter)fail('La vidéo a expiré ou a été annulée.',409);
  if(shared&&!time.retryAfter)fail('Cette vidéo n’est plus disponible. Recharge la page avant de publier.',409);
  return json({error:'Tu peux publier une vidéo tous les sept jours.',nextPublicationAt:time.nextPublicationAt,serverNow:time.serverNow},429,{'Retry-After':String(Math.max(1,time.retryAfter))});
}
async function updatePost(request,env,user,id,json){
  await ownedPost(env,id,user.id);
  const body=await bodyOf(request);immutableVideo(body);
  if(Object.hasOwn(body,'themeWeek'))fail('Le thème d’une publication ne peut pas être remplacé.');
  const title=titleOf(body.title),description=Object.hasOwn(body,'description')?clean(body.description,5000):null,revision=integer(body.revision,1);
  const result=await env.DB.prepare(`UPDATE loge_posts SET title=?1,description=COALESCE(?2,description),revision=revision+1,updated_at=unixepoch()
    WHERE id=?3 AND author_id=?4 AND revision=?5 AND deleted_at IS NULL`).bind(title,description,id,user.id,revision).run();
  if(!result.meta.changes)return conflict(env,'post',id,user.id,json);
  const time=await timing(env,user.id);return json({post:postView(await visiblePost(env,id,user.id)),nextPublicationAt:time.nextPublicationAt});
}
async function deletePost(request,env,user,id,json){
  await ownedPost(env,id,user.id);
  const body=await bodyOf(request),revision=integer(body.revision,1);
  const [result]=await env.DB.batch([
    env.DB.prepare(`UPDATE loge_posts SET title='',description='',youtube_id='',deleted_at=unixepoch(),updated_at=unixepoch(),revision=revision+1
      WHERE id=?1 AND author_id=?2 AND revision=?3 AND deleted_at IS NULL`).bind(id,user.id,revision),
    env.DB.prepare(`UPDATE loge_comments SET body='',deleted_at=unixepoch(),updated_at=unixepoch(),revision=revision+1
      WHERE post_id=?1 AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM loge_posts WHERE id=?1 AND author_id=?2 AND revision=?3+1 AND deleted_at IS NOT NULL)`).bind(id,user.id,revision),
    env.DB.prepare('DELETE FROM loge_favorites WHERE post_id=?1 AND EXISTS(SELECT 1 FROM loge_posts WHERE id=?1 AND deleted_at IS NOT NULL)').bind(id),
    env.DB.prepare(`UPDATE loge_stream_uploads SET state='deleting',cleanup_after=0,upload_url=NULL,updated_at=unixepoch()
      WHERE post_id=?1 AND user_id=?2 AND state='published' AND EXISTS(SELECT 1 FROM loge_posts WHERE id=?1 AND author_id=?2 AND deleted_at IS NOT NULL)`).bind(id,user.id),
    // A shared videography entry keeps its media; only the link goes away.
    env.DB.prepare('DELETE FROM loge_shared_videos WHERE post_id=?1 AND user_id=?2 AND EXISTS(SELECT 1 FROM loge_posts WHERE id=?1 AND author_id=?2 AND deleted_at IS NOT NULL)').bind(id,user.id)
  ]);
  if(!result.meta.changes)return conflict(env,'post',id,user.id,json);
  const time=await timing(env,user.id);return json({ok:true,nextPublicationAt:time.nextPublicationAt});
}
async function createComment(request,env,user,postId,json){
  await visiblePost(env,postId);
  const body=await bodyOf(request),content=clean(body.body,2000),nonce=requestId(body.requestId),hash=await fingerprint([postId,content]);
  const repeated=await env.DB.prepare('SELECT id,request_fingerprint,deleted_at FROM loge_comments WHERE author_id=?1 AND request_id=?2').bind(user.id,nonce).first();
  if(repeated){sameRequest(repeated,hash);return json({comment:commentView(await visibleComment(env,repeated.id))});}
  const claim=crypto.randomUUID();
  const results=await env.DB.batch([
    reserveComment(env,user.id,claim,nonce),
    env.DB.prepare(`INSERT INTO loge_comments(post_id,author_id,request_id,request_fingerprint,body)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS(SELECT 1 FROM loge_posts WHERE id=?1 AND deleted_at IS NULL)
      AND EXISTS(SELECT 1 FROM loge_publication_limits WHERE user_id=?2 AND write_claim_token=?6)
      AND NOT EXISTS(SELECT 1 FROM loge_comments WHERE author_id=?2 AND request_id=?3)`).bind(postId,user.id,nonce,hash,content,claim)
  ]);
  const row=await env.DB.prepare('SELECT id,request_fingerprint,deleted_at FROM loge_comments WHERE author_id=?1 AND request_id=?2').bind(user.id,nonce).first();
  if(row){sameRequest(row,hash);return json({comment:commentView(await visibleComment(env,row.id))},results[1].meta.changes?201:200);}
  await visiblePost(env,postId);return commentLimitRefusal(env,user.id,json);
}
async function updateComment(request,env,user,id,json,remove=false){
  await ownedComment(env,id,user.id);
  const body=await bodyOf(request),revision=integer(body.revision,1),content=remove?'':clean(body.body,2000);
  const reserved=await reserveComment(env,user.id,crypto.randomUUID()).run();
  if(!reserved.meta.changes)return commentLimitRefusal(env,user.id,json);
  const result=await env.DB.prepare(`UPDATE loge_comments SET body=?1,revision=revision+1,updated_at=unixepoch()${remove?',deleted_at=unixepoch()':''}
    WHERE id=?2 AND author_id=?3 AND revision=?4 AND deleted_at IS NULL
    AND EXISTS(SELECT 1 FROM loge_posts WHERE id=loge_comments.post_id AND deleted_at IS NULL)`).bind(content,id,user.id,revision).run();
  if(!result.meta.changes)return conflict(env,'comment',id,user.id,json);
  return json(remove?{ok:true}:{comment:commentView(await visibleComment(env,id))});
}
async function listComments(env,postId,url,json){
  await visiblePost(env,postId);let after=cursor(url);
  if(url.searchParams.has('focus')){
    const focus=integer(Number(url.searchParams.get('focus')),1),target=await visibleComment(env,focus);
    if(target.post_id!==postId)fail('Commentaire introuvable.',404);
    const previous=(await env.DB.prepare('SELECT id FROM loge_comments WHERE post_id=?1 AND deleted_at IS NULL AND id<?2 ORDER BY id DESC LIMIT 10').bind(postId,focus).all()).results||[];
    after=(previous.at(-1)?.id??focus)-1;
  }
  const rows=(await env.DB.prepare(commentSelect+' WHERE c.post_id=?1 AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND c.id>?2 ORDER BY c.id LIMIT 21').bind(postId,after).all()).results||[];
  const result=page(rows,commentView);return json({comments:result.items,next:result.next});
}
async function memberPage(env,user,id,url,json){
  const tab=url.searchParams.get('tab')||'reflexions';
  if(tab==='favoris'&&id!==user.id)fail('Cette liste est privée.',403);
  const member=await selfOf(env,id),self=await selfOf(env,user.id),after=cursor(url),currentTheme=await getCurrentTheme(env);
  if(tab==='favoris'){
    const rows=(await env.DB.prepare(`SELECT ${postFields},f.id AS favorite_id FROM loge_favorites f
      JOIN loge_posts p ON p.id=f.post_id JOIN users u ON u.id=p.author_id
      WHERE f.user_id=?1 AND p.deleted_at IS NULL AND (?2=0 OR f.id<?2) ORDER BY f.id DESC LIMIT 21`).bind(user.id,after).all()).results||[];
    return json({member,self,currentTheme,posts:rows.slice(0,LOGE_PAGE_SIZE).map(row=>postView({...row,is_favorite:true})),next:rows.length>LOGE_PAGE_SIZE?rows[LOGE_PAGE_SIZE-1].favorite_id:null});
  }
  if(tab==='reflexions'){
    const rows=(await env.DB.prepare(postSelect+' WHERE p.author_id=?1 AND p.deleted_at IS NULL AND (?2=0 OR p.id<?2) ORDER BY p.id DESC LIMIT 21').bind(id,after).all()).results||[];
    const result=page(await withFavorites(env,user.id,rows),postView);return json({member,self,currentTheme,posts:result.items,next:result.next});
  }
  if(tab!=='interventions')fail('Vue invalide.');
  const rows=(await env.DB.prepare(`SELECT c.*,${authorFields},p.id AS target_post_id,p.title AS post_title,p.description AS post_description,
    p.youtube_id AS post_youtube_id,p.created_at AS post_created_at,p.updated_at AS post_updated_at,p.revision AS post_revision,p.author_id AS post_author_id,
    ${themeFields},${streamFields},pu.username AS post_username,pu.avatar_data IS NOT NULL AS post_has_avatar,
    (SELECT count(*) FROM loge_comments pc WHERE pc.post_id=p.id AND pc.deleted_at IS NULL) AS post_comment_count
    FROM loge_comments c JOIN users u ON u.id=c.author_id JOIN loge_posts p ON p.id=c.post_id JOIN users pu ON pu.id=p.author_id
    WHERE c.author_id=?1 AND p.author_id<>?1 AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND (?2=0 OR c.id<?2)
    ORDER BY c.id DESC LIMIT 21`).bind(id,after).all()).results||[];
  const favorites=await favoriteIds(env,user.id,rows.map(row=>row.target_post_id));
  const result=page(rows,row=>({...commentView(row),post:postView({
    id:row.target_post_id,author_id:row.post_author_id,username:row.post_username,has_avatar:row.post_has_avatar,
    title:row.post_title,description:row.post_description,youtube_id:row.post_youtube_id,stream_id:row.stream_id,video_branch:row.video_branch,
    created_at:row.post_created_at,updated_at:row.post_updated_at,revision:row.post_revision,
    theme_id:row.theme_id,theme_title:row.theme_title,theme_week:row.theme_week,
    comment_count:row.post_comment_count,is_favorite:favorites.has(row.target_post_id)
  })}));
  return json({member,self,currentTheme,interventions:result.items,next:result.next});
}

// Posts shared from the videography follow their entry: once its published
// media is gone (entry deleted, file replaced, private data erased) the post,
// its comments and its favourites are withdrawn in the same batch. userId=null
// sweeps every member and is the scheduled safety net.
export async function sharedPostWithdrawal(env,userId=null){
  await ensureLogeTables(env);await ensureLogeStreamTables(env);
  const scope='(?1 IS NULL OR v.user_id=?1)',withdrawn=`SELECT v.post_id FROM loge_shared_videos v JOIN loge_posts p ON p.id=v.post_id WHERE p.deleted_at IS NOT NULL AND ${scope}`;
  return [
    `UPDATE loge_posts SET title='',description='',youtube_id='',deleted_at=unixepoch(),updated_at=unixepoch(),revision=revision+1
      WHERE deleted_at IS NULL AND id IN (SELECT v.post_id FROM loge_shared_videos v WHERE ${scope} AND NOT EXISTS(SELECT 1 FROM loge_stream_uploads s WHERE ${SHARED_UPLOAD_LIVE}))`,
    `UPDATE loge_comments SET body='',deleted_at=unixepoch(),updated_at=unixepoch(),revision=revision+1 WHERE deleted_at IS NULL AND post_id IN (${withdrawn})`,
    `DELETE FROM loge_favorites WHERE post_id IN (${withdrawn})`,
    `DELETE FROM loge_shared_videos AS v WHERE ${scope} AND NOT EXISTS(SELECT 1 FROM loge_posts p WHERE p.id=v.post_id AND p.deleted_at IS NULL)`
  ].map(sql=>env.DB.prepare(sql).bind(userId));
}
export async function withdrawOrphanedSharedPosts(env){
  if(!env.DB)return;
  await env.DB.batch(await sharedPostWithdrawal(env));
}
async function videographyChoices(env,user,json){
  const rows=(await env.DB.prepare(`SELECT e.id,e.payload,e.video_branch,e.sort_date,e.precision,
      (SELECT v.post_id FROM loge_shared_videos v JOIN loge_posts p ON p.id=v.post_id WHERE v.upload_id=s.id AND p.deleted_at IS NULL) AS post_id
    FROM life_events e JOIN loge_stream_uploads s ON s.user_id=e.owner_id AND s.event_id=e.id AND s.purpose='videography' AND s.state='published'
    WHERE e.owner_id=?1 AND e.video_branch IN (${LOGE_ROOM_SQL}) ORDER BY e.sort_date DESC,e.id DESC LIMIT 101`).bind(user.id).all()).results||[];
  const videos=await Promise.all(rows.slice(0,100).map(async row=>({id:row.id,title:(await unseal(env,lifeEventContext(user.id,row.id),row.payload)).title||'',category:videoBranchKey(row.video_branch),date:row.sort_date,precision:row.precision,postId:row.post_id||null})));
  const time=await timing(env,user.id);
  return json({self:await selfOf(env,user.id),currentTheme:await getCurrentTheme(env),videos,more:rows.length>100,nextPublicationAt:time.nextPublicationAt,serverNow:time.serverNow});
}
export async function handleLoge(request,env,url,{getUser,json,legacySources=LOGE_LEGACY_SOURCES}){
  const user=await getUser(request,env);if(!user)fail('Connecte-toi pour ouvrir cette page.',401);
  if(gameLevel(await gameRows(env,user.id))<GAME_MASTER_BLANC_LEVEL)fail('Cette page n’est pas encore disponible dans ton parcours.',403);
  const writing=!['GET','HEAD','OPTIONS'].includes(request.method);
  if(writing?request.headers.get('X-WC-User')!==String(user.id):request.headers.has('X-WC-User')&&request.headers.get('X-WC-User')!==String(user.id))fail('Le compte connecté a changé. Recharge la page.',409);
  await ensureLogeTables(env);
  await ensureThemeTables(env);
  await ensureLogeStreamTables(env);
  const path=url.pathname.replace(/\/+$/,''),method=request.method;
  if(path==='/api/loge/uploads'){
    if(method!=='POST')fail('Méthode indisponible.',405);
    if(!legacySources){await bodyOf(request);fail('Les vidéos des Loges virtuelles se publient maintenant depuis ta vidéographie.',410);}
    return createLogeUpload(await bodyOf(request),env,user,url,json);
  }
  if(path==='/api/loge/videos'){
    if(method!=='GET')fail('Méthode indisponible.',405);
    return videographyChoices(env,user,json);
  }
  const uploadRoute=/^\/api\/loge\/uploads\/([0-9a-f-]+)$/i.exec(path);
  if(uploadRoute){
    if(method==='GET')return getLogeUpload(env,user,uploadRoute[1],json);
    if(method==='DELETE'){await bodyOf(request);return deleteLogeUpload(env,user,uploadRoute[1],json);}
    fail('Méthode indisponible.',405);
  }
  const playbackRoute=/^\/api\/loge\/posts\/([1-9]\d*)\/playback$/.exec(path);
  if(playbackRoute){
    if(method!=='GET')fail('Méthode indisponible.',405);
    return logePlayback(env,safeId(playbackRoute[1]),json);
  }
  const themePosts=/^\/api\/loge\/themes\/([1-9]\d*)\/posts$/.exec(path);
  if(themePosts){
    if(method!=='GET')fail('Méthode indisponible.',405);
    const id=safeId(themePosts[1]),theme=await env.DB.prepare('SELECT id,title FROM loge_themes WHERE id=?1').bind(id).first();
    if(!theme)fail('Thème introuvable.',404);
    const after=cursor(url),rows=(await env.DB.prepare(postSelect+` WHERE p.deleted_at IS NULL
      AND EXISTS(SELECT 1 FROM loge_post_themes pt WHERE pt.post_id=p.id AND pt.theme_id=?1)
      AND (?2=0 OR p.id<?2) ORDER BY p.id DESC LIMIT 21`).bind(id,after).all()).results||[];
    const result=page(await withFavorites(env,user.id,rows),postView),time=await timing(env,user.id);
    return json({theme,self:await selfOf(env,user.id),currentTheme:await getCurrentTheme(env),posts:result.items,next:result.next,nextPublicationAt:time.nextPublicationAt,serverNow:time.serverNow});
  }
  if(path==='/api/loge/themes'||path.startsWith('/api/loge/themes/'))return handleThemes(request,env,url,user,json);
  if(path==='/api/loge'){
    if(method!=='GET')fail('Méthode indisponible.',405);
    // One room per shareable category; a post follows its videography entry.
    const room=url.searchParams.get('loge')||LOGE_ROOMS[0];if(!LOGE_ROOMS.includes(room))fail('Loge introuvable.',404);
    const after=cursor(url),rows=(await env.DB.prepare(postSelect+` WHERE p.deleted_at IS NULL AND (?1=0 OR p.id<?1)
      AND COALESCE((SELECT CASE WHEN e.video_branch IN (${LOGE_ROOM_SQL}) THEN e.video_branch END FROM loge_shared_videos v JOIN life_events e ON e.owner_id=v.user_id AND e.id=v.event_id WHERE v.post_id=p.id),'${LOGE_ROOMS[0]}')=?2
      ORDER BY p.id DESC LIMIT 21`).bind(after,room).all()).results||[];
    const result=page(await withFavorites(env,user.id,rows),postView),time=await timing(env,user.id);
    return json({self:await selfOf(env,user.id),currentTheme:await getCurrentTheme(env),loge:room,posts:result.items,next:result.next,nextPublicationAt:time.nextPublicationAt,serverNow:time.serverNow});
  }
  if(path==='/api/loge/posts'){
    if(method!=='POST')fail('Méthode indisponible.',405);return createPost(request,env,user,json,legacySources);
  }
  let match=/^\/api\/loge\/posts\/([1-9]\d*)\/favorite$/.exec(path);
  if(match){
    if(method!=='PUT')fail('Méthode indisponible.',405);
    const id=safeId(match[1]);await visiblePost(env,id);
    const body=await bodyOf(request);if(typeof body.favorite!=='boolean')fail('État de favori invalide.');
    if(body.favorite)await env.DB.prepare(`INSERT INTO loge_favorites(user_id,post_id)
      SELECT ?1,?2 WHERE EXISTS(SELECT 1 FROM loge_posts WHERE id=?2 AND deleted_at IS NULL)
      ON CONFLICT(user_id,post_id) DO NOTHING`).bind(user.id,id).run();
    else await env.DB.prepare('DELETE FROM loge_favorites WHERE user_id=?1 AND post_id=?2').bind(user.id,id).run();
    await visiblePost(env,id);
    return json({postId:id,isFavorite:body.favorite});
  }
  match=/^\/api\/loge\/posts\/([1-9]\d*)\/comments$/.exec(path);
  if(match){
    const id=safeId(match[1]);
    if(method==='GET')return listComments(env,id,url,json);
    if(method==='POST')return createComment(request,env,user,id,json);
    fail('Méthode indisponible.',405);
  }
  match=/^\/api\/loge\/posts\/([1-9]\d*)$/.exec(path);
  if(match){
    const id=safeId(match[1]);
    if(method==='GET'){const time=await timing(env,user.id);return json({post:postView(await visiblePost(env,id,user.id)),self:await selfOf(env,user.id),currentTheme:await getCurrentTheme(env),nextPublicationAt:time.nextPublicationAt});}
    if(method==='PUT')return updatePost(request,env,user,id,json);
    if(method==='DELETE')return deletePost(request,env,user,id,json);
    fail('Méthode indisponible.',405);
  }
  match=/^\/api\/loge\/comments\/([1-9]\d*)$/.exec(path);
  if(match){
    const id=safeId(match[1]);
    if(method==='PUT')return updateComment(request,env,user,id,json);
    if(method==='DELETE')return updateComment(request,env,user,id,json,true);
    fail('Méthode indisponible.',405);
  }
  match=/^\/api\/loge\/membres\/([1-9]\d*)$/.exec(path);
  if(match){if(method!=='GET')fail('Méthode indisponible.',405);return memberPage(env,user,safeId(match[1]),url,json);}
  fail('Page introuvable.',404);
}
