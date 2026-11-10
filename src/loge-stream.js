import {fail} from './private-data.js';

export const LOGE_UPLOAD_MAX_BYTES=200_000_000;
export const LOGE_UPLOAD_MAX_SECONDS=1800;
export const LOGE_UPLOAD_TTL=3600;
const PROVIDER_SAFETY_SECONDS=31*86400; // Stream scheduledDeletion requires >=30 days.
// This is a conservative local ceiling; Stream also enforces the account's
// storage allowance, including videos outside the Loge.
export const LOGE_STREAM_BUDGET_SECONDS=60_000;
export const LOGE_STREAM_MARKER='__stream___'; // 11 chars: retain the legacy CHECK.
export const LOGE_STREAM_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS loge_stream_uploads (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    declared_size INTEGER NOT NULL,
    stream_id TEXT UNIQUE,
    upload_url TEXT,
    state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','waiting','processing','ready','published','deleting','deleted')),
    post_id INTEGER UNIQUE,
    purpose TEXT NOT NULL DEFAULT 'loge' CHECK(purpose IN ('loge','videography')),
    event_id TEXT,
    link_fingerprint TEXT,
    duration_seconds REAL NOT NULL DEFAULT 1800,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    cleanup_after INTEGER NOT NULL DEFAULT 0,
    cleanup_attempts INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id,request_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_loge_stream_outstanding ON loge_stream_uploads(user_id,purpose) WHERE state IN ('reserved','waiting','processing','ready')`,
  `CREATE INDEX IF NOT EXISTS idx_loge_stream_cleanup ON loge_stream_uploads(state,cleanup_after,expires_at)`
];
// A Loge post shared from the videography points at the member's own published
// upload instead of owning a media. The row lives exactly as long as the post.
export const LOGE_SHARED_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS loge_shared_videos (
    post_id INTEGER PRIMARY KEY REFERENCES loge_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    upload_id TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loge_shared_upload ON loge_shared_videos(upload_id)`,
  `CREATE INDEX IF NOT EXISTS idx_loge_shared_user ON loge_shared_videos(user_id,event_id)`
];
// The shared upload must still be the published media of a videography entry.
export const SHARED_UPLOAD_LIVE=`s.id=v.upload_id AND s.user_id=v.user_id AND s.event_id=v.event_id AND s.purpose='videography' AND s.state='published'
  AND EXISTS(SELECT 1 FROM life_events e WHERE e.owner_id=s.user_id AND e.id=s.event_id AND e.video_branch IS NOT NULL)`;
const ready=new WeakMap();
export const VIDEOGRAPHY_STREAM_INDEX=`CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_video_event ON loge_stream_uploads(user_id,event_id) WHERE purpose='videography' AND state='published'`;
async function initialize(env){
  await env.DB.batch([LOGE_STREAM_SCHEMA[0],LOGE_STREAM_SCHEMA[2],...LOGE_SHARED_SCHEMA].map(sql=>env.DB.prepare(sql)));
  const columns=new Set(((await env.DB.prepare('PRAGMA table_info(loge_stream_uploads)').all()).results||[]).map(row=>row.name));
  for(const [name,definition] of [['purpose',"TEXT NOT NULL DEFAULT 'loge' CHECK(purpose IN ('loge','videography'))"],['event_id','TEXT'],['link_fingerprint','TEXT']]){
    if(!columns.has(name))try{await env.DB.prepare(`ALTER TABLE loge_stream_uploads ADD COLUMN ${name} ${definition}`).run();}catch(error){
      // Different Worker isolates may initialize together. Only an already
      // applied column is harmless; do not hide other migration failures.
      const current=(await env.DB.prepare('PRAGMA table_info(loge_stream_uploads)').all()).results||[];
      if(!current.some(row=>row.name===name))throw error;
    }
  }
  const outstanding=await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_loge_stream_outstanding'").first();
  if(!outstanding?.sql?.includes("(user_id,purpose) WHERE state IN ('reserved','waiting','processing','ready')"))await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS idx_loge_stream_outstanding'),env.DB.prepare(LOGE_STREAM_SCHEMA[1])
  ]);
  await env.DB.prepare(VIDEOGRAPHY_STREAM_INDEX).run();
}
export async function ensureLogeStreamTables(env){
  if(!ready.has(env.DB))ready.set(env.DB,initialize(env).catch(error=>{ready.delete(env.DB);throw error;}));
  await ready.get(env.DB);
}
const iso=value=>new Date(value*1000).toISOString();
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function uploadIdOf(value){if(!uuid(value))fail('Vidéo introuvable.',404);return value.toLowerCase();}
const provider=env=>{if(!env.STREAM?.createDirectUpload||!env.STREAM?.video)fail('L’envoi de vidéos est momentanément indisponible.',503);return env.STREAM;};
const creator=(userId,purpose='loge')=>purpose+':user:'+userId;
const meta=(id,purpose='loge')=>purpose==='loge'?{source:'whitecadae-loge',logeUploadId:id}:{source:'whitecadae-videography',uploadId:id};
const isOwned=(details,row)=>details?.id===row.stream_id&&details.creator===creator(row.user_id,row.purpose)&&details.meta?.source==='whitecadae-'+(row.purpose||'loge')&&(row.purpose==='videography'?details.meta?.uploadId:details.meta?.logeUploadId)===row.id;
const isMissing=error=>error?.status===404||error?.statusCode===404||error?.name==='NotFoundError';
const unavailable=()=>fail('Le service vidéo est momentanément indisponible. Réessaie dans quelques instants.',503);
async function rowOf(env,id,userId,purpose='loge'){
  const row=await env.DB.prepare('SELECT *,unixepoch() AS now FROM loge_stream_uploads WHERE id=?1 AND user_id=?2 AND purpose=?3').bind(uploadIdOf(id),userId,purpose).first();
  if(!row)fail('Vidéo introuvable.',404);return row;
}
async function quota(env,userId,json){
  const row=await env.DB.prepare('SELECT unixepoch() AS now,next_publish_at FROM loge_publication_limits WHERE user_id=?1 AND next_publish_at>unixepoch()').bind(userId).first();
  if(row)throw json({error:'Tu peux publier une vidéo tous les sept jours.',nextPublicationAt:iso(row.next_publish_at),serverNow:iso(row.now)},429,{'Retry-After':String(Math.max(1,row.next_publish_at-row.now))});
}
function uploadView(row){return {uploadId:row.id,uploadURL:row.upload_url,expiresAt:iso(row.expires_at),maxBytes:LOGE_UPLOAD_MAX_BYTES,maxDurationSeconds:LOGE_UPLOAD_MAX_SECONDS};}
function validUploadURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='upload.cloudflarestream.com'||/^(?:[a-z0-9-]+\.)*upload\.videodelivery\.net$/.test(u.hostname));}catch{return false;}}
async function replayUpload(env,row,body,json){
  if(row.filename!==body.filename||row.declared_size!==body.size)fail('Cet envoi a déjà été utilisé avec un autre fichier.',409);
  if(row.state==='published')return json({...uploadView(row),status:'ready',...(row.purpose==='videography'?{eventId:row.event_id}:{postId:row.post_id})});
  if(['deleting','deleted'].includes(row.state)||row.expires_at<=row.now)fail('Cet envoi a expiré ou a été annulé.',410);
  if(!row.upload_url)return json({error:'La préparation de cet envoi est en cours. Réessaie dans quelques instants.',uploadId:row.id},409,{'Retry-After':'3'});
  if(row.purpose==='loge')await quota(env,row.user_id,json);return json(uploadView(row));
}
export async function createLogeUpload(body,env,user,url,json,purpose='loge'){
  provider(env);
  if(!uuid(body.requestId))fail('Identifiant d’envoi invalide.');
  if(typeof body.filename!=='string'||body.filename.length<1||body.filename.length>255||/[\x00-\x1f\x7f/\\]/.test(body.filename)||! /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(body.filename))fail('Choisis un fichier vidéo MP4, MOV, M4V, WebM, MKV ou AVI.');
  if(!Number.isSafeInteger(body.size)||body.size<1||body.size>LOGE_UPLOAD_MAX_BYTES)fail('La vidéo doit peser au maximum 200 Mo.');
  const nonce=body.requestId.toLowerCase();
  const previous=await env.DB.prepare('SELECT *,unixepoch() AS now FROM loge_stream_uploads WHERE user_id=?1 AND request_id=?2').bind(user.id,nonce).first();
  if(previous){if(previous.purpose!==purpose)fail('Cet identifiant d’envoi appartient à un autre espace.',409);return replayUpload(env,previous,body,json);}
  if(purpose==='loge')await quota(env,user.id,json);
  const id=crypto.randomUUID();
  // A single SQL statement reserves both the user's outstanding slot and the
  // local storage budget before any paid provider operation. Queue entries
  // still reserve their allowance until deletion is confirmed.
  const result=await env.DB.prepare(`INSERT INTO loge_stream_uploads(id,user_id,request_id,filename,declared_size,expires_at,cleanup_after,purpose)
    SELECT ?1,?2,?3,?4,?5,unixepoch()+${LOGE_UPLOAD_TTL},unixepoch()+${LOGE_UPLOAD_TTL+PROVIDER_SAFETY_SECONDS},?6
    WHERE NOT EXISTS(SELECT 1 FROM loge_stream_uploads WHERE user_id=?2 AND purpose=?6 AND (state IN ('reserved','waiting','processing','ready') OR (state='deleting' AND stream_id IS NULL)))
    AND NOT EXISTS(SELECT 1 FROM loge_stream_uploads WHERE user_id=?2 AND request_id=?3)
    AND (?6<>'loge' OR NOT EXISTS(SELECT 1 FROM loge_publication_limits WHERE user_id=?2 AND next_publish_at>unixepoch()))
    AND (SELECT count(*) FROM loge_stream_uploads WHERE user_id=?2 AND created_at>unixepoch()-3600)<3
    AND COALESCE((SELECT sum(duration_seconds) FROM loge_stream_uploads WHERE state<>'deleted'),0)+${LOGE_UPLOAD_MAX_SECONDS}<=${LOGE_STREAM_BUDGET_SECONDS}`)
    .bind(id,user.id,nonce,body.filename,body.size,purpose).run();
  if(!result.meta.changes){
    const replay=await env.DB.prepare('SELECT *,unixepoch() AS now FROM loge_stream_uploads WHERE user_id=?1 AND request_id=?2').bind(user.id,nonce).first();
    if(replay){if(replay.purpose!==purpose)fail('Cet identifiant d’envoi appartient à un autre espace.',409);return replayUpload(env,replay,body,json);}
    if(purpose==='loge')await quota(env,user.id,json);
    const outstanding=await env.DB.prepare("SELECT id FROM loge_stream_uploads WHERE user_id=?1 AND purpose=?2 AND (state IN ('reserved','waiting','processing','ready') OR (state='deleting' AND stream_id IS NULL))").bind(user.id,purpose).first();
    if(outstanding)return json({error:'Termine ou annule ton envoi précédent avant d’en commencer un autre.',uploadId:outstanding.id},409);
    return json({error:'La capacité d’envoi est temporairement atteinte. Réessaie plus tard.'},429,{'Retry-After':'3600'});
  }
  const row=await rowOf(env,id,user.id,purpose);
  let uploaded;
  try{
    // Automatic provider expiry is a second safety net for an interrupted
    // Worker after creation, before the provider id reaches D1. Published
    // media have this date cleared only after readiness is checked.
    uploaded=await env.STREAM.createDirectUpload({maxDurationSeconds:LOGE_UPLOAD_MAX_SECONDS,expiry:iso(row.expires_at),scheduledDeletion:iso(row.expires_at+PROVIDER_SAFETY_SECONDS),creator:creator(user.id,purpose),meta:meta(id,purpose),allowedOrigins:[url.hostname],requireSignedURLs:true});
    if(typeof uploaded?.id!=='string'||!/^[a-f0-9]{32}$/i.test(uploaded.id))throw new Error('Invalid Stream identifier');
    await env.DB.prepare("UPDATE loge_stream_uploads SET stream_id=?1,upload_url=?2,cleanup_after=0,state=CASE WHEN state='reserved' THEN 'waiting' ELSE state END,updated_at=unixepoch() WHERE id=?3")
      .bind(uploaded.id,validUploadURL(uploaded.uploadURL)?uploaded.uploadURL:null,id).run();
    if(!validUploadURL(uploaded.uploadURL))throw new Error('Invalid Stream upload URL');
  }catch(error){
    // Explicit provider rejections created no media and can release their
    // slot. Network/server failures are ambiguous and must retain it.
    if(!uploaded&&['BadRequestError','QuotaReachedError','MaxFileSizeError','RateLimitedError'].includes(error?.name)){
      await env.DB.prepare("UPDATE loge_stream_uploads SET state='deleted',upload_url=NULL,updated_at=unixepoch() WHERE id=?1 AND stream_id IS NULL").bind(id).run();
      unavailable();
    }
    // Ambiguous provisioning failures retain the reservation through provider
    // scheduled deletion, so retries cannot allocate unbounded hidden media.
    await env.DB.prepare(`UPDATE loge_stream_uploads SET state='deleting',cleanup_after=CASE WHEN stream_id IS NULL THEN expires_at+${PROVIDER_SAFETY_SECONDS} ELSE 0 END,upload_url=NULL,updated_at=unixepoch() WHERE id=?1`).bind(id).run();
    unavailable();
  }
  const current=await rowOf(env,id,user.id,purpose);
  if(current.state!=='waiting')fail('Cet envoi a été annulé.',410);
  return json(uploadView(current),201);
}
async function refresh(env,row){
  if(['deleting','deleted'].includes(row.state))return {...row,status:'error'};
  if(row.state!=='published'&&row.expires_at<=row.now){
    await env.DB.prepare("UPDATE loge_stream_uploads SET state='deleting',upload_url=NULL,updated_at=unixepoch() WHERE id=?1 AND post_id IS NULL AND event_id IS NULL AND state<>'deleted'").bind(row.id).run();
    return {...row,status:'error'};
  }
  if(!row.stream_id)return {...row,status:'waiting'};
  let details;try{details=await provider(env).video(row.stream_id).details();}catch(error){if(!isMissing(error))unavailable();details=null;}
  if(!isOwned(details,row)){if(details)unavailable();return {...row,status:'error'};}
  const invalid=details.status?.state==='error'||(Number.isFinite(details.size)&&details.size>LOGE_UPLOAD_MAX_BYTES)||(Number.isFinite(details.duration)&&details.duration>LOGE_UPLOAD_MAX_SECONDS);
  let state=invalid?'deleting':details.readyToStream===true&&Number.isFinite(details.duration)&&details.duration>0&&Number.isFinite(details.size)&&details.size>0?'ready':['pendingupload','pending'].includes(details.status?.state)?'waiting':'processing';
  if(state==='ready'&&details.requireSignedURLs!==true)unavailable();
  if(row.state!=='published'){
    await env.DB.prepare(`UPDATE loge_stream_uploads SET state=?1,updated_at=unixepoch() WHERE id=?2 AND state IN ('waiting','processing','ready') AND post_id IS NULL AND event_id IS NULL`).bind(state,row.id).run();
    const current=await rowOf(env,row.id,row.user_id,row.purpose);
    if(['deleting','deleted'].includes(current.state))state='deleting';
    row=current;
  }
  return {...row,details,status:state==='deleting'?'error':state};
}
export async function getLogeUpload(env,user,id,json,purpose='loge'){
  const row=await refresh(env,await rowOf(env,id,user.id,purpose));
  return json({uploadId:row.id,status:row.status,expiresAt:iso(row.expires_at),...(row.status==='ready'?{durationSeconds:row.details.duration}:{}),...(row.status==='error'?{error:'La vidéo est expirée, annulée ou ne respecte pas les limites d’envoi.'}:{})});
}
export async function readyLogeUpload(env,user,id,purpose='loge'){
  const row=await refresh(env,await rowOf(env,id,user.id,purpose));
  if(row.post_id!==null||row.event_id!==null||row.state==='published')fail('Cette vidéo est déjà publiée.',409);
  if(row.status!=='ready')fail(row.status==='error'?'Cette vidéo ne peut plus être publiée.':'La vidéo est encore en cours de préparation.',409);
  // Removing the provider safety timer before linking is safe: a failed
  // publication remains in D1 and is swept by the bounded cleanup queue.
  try{await provider(env).video(row.stream_id).update({requireSignedURLs:true,scheduledDeletion:null});}catch{unavailable();}
  return row;
}
async function cleanupOne(env,row){
  // The deleting state is acquired before external deletion. Publication only
  // accepts ready, so a racing publisher can never link a video being removed.
  if(row.stream_id){
    try{
      const video=provider(env).video(row.stream_id),details=await video.details();
      if(!isOwned(details,row))throw new Error('Stream ownership mismatch');
      await video.delete();
    }catch(error){if(!isMissing(error))throw error;}
  }
  await env.DB.prepare("UPDATE loge_stream_uploads SET state='deleted',upload_url=NULL,updated_at=unixepoch() WHERE id=?1 AND state='deleting'").bind(row.id).run();
}
export async function deleteLogeUpload(env,user,id,json,purpose='loge'){
  const row=await rowOf(env,id,user.id,purpose);
  if(row.post_id!==null||row.event_id!==null)fail('Cette vidéo appartient déjà à une publication.',409);
  const updated=await env.DB.prepare("UPDATE loge_stream_uploads SET state='deleting',upload_url=NULL,updated_at=unixepoch() WHERE id=?1 AND post_id IS NULL AND event_id IS NULL AND state<>'deleted'").bind(row.id).run();
  if(updated.meta.changes&&row.stream_id){try{await cleanupOne(env,row);}catch{/* The cron retries safely. */}}
  const current=await rowOf(env,id,user.id,purpose);
  if(current.post_id!==null||current.event_id!==null)fail('Cette vidéo appartient déjà à une publication.',409);
  return json({ok:true,uploadId:row.id});
}
function signedURL(raw,id,token,kind){
  let url;try{url=new URL(raw);}catch{unavailable();}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(/^(?:[a-z0-9-]+\.)*videodelivery\.net$/.test(url.hostname)||/^customer-[a-z0-9-]+\.cloudflarestream\.com$/.test(url.hostname)))unavailable();
  if(!url.pathname.startsWith('/'+id+'/')||(kind==='hls'&&!url.pathname.endsWith('/manifest/video.m3u8'))||(kind==='poster'&&!/^\/[a-f0-9]{32}\/thumbnails\/thumbnail\.(?:jpg|png|webp)$/i.test(url.pathname)))unavailable();
  url.pathname='/'+token+url.pathname.slice(id.length+1);return url.href;
}
async function postUpload(env,postId){
  return await env.DB.prepare(`SELECT s.* FROM loge_stream_uploads s JOIN loge_posts p ON p.id=s.post_id
    WHERE p.id=?1 AND p.deleted_at IS NULL AND s.purpose='loge' AND s.state='published' AND p.author_id=s.user_id`).bind(postId).first()
    ||await env.DB.prepare(`SELECT s.* FROM loge_shared_videos v JOIN loge_posts p ON p.id=v.post_id JOIN loge_stream_uploads s ON ${SHARED_UPLOAD_LIVE}
    WHERE v.post_id=?1 AND p.deleted_at IS NULL AND p.author_id=v.user_id`).bind(postId).first();
}
export async function logePlayback(env,postId,json){
  const row=await postUpload(env,postId);
  if(!row)fail('Vidéo introuvable.',404);
  const output=await signedStreamPlayback(env,row);
  // The post, or the videography entry it shares, may vanish while the token is minted.
  if((await postUpload(env,postId))?.id!==row.id)fail('Vidéo introuvable.',404);
  return json(output);
}
export async function signedStreamPlayback(env,row){
  try{
    const video=provider(env).video(row.stream_id),details=await video.details();
    if(!isOwned(details,row)||!details.readyToStream||details.requireSignedURLs!==true)unavailable();
    const token=await video.generateToken();
    if(typeof token!=='string'||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))unavailable();
    let payload;try{payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{unavailable();}
    // The native Stream binding returns exp as a decimal string. Accept its
    // documented numeric meaning, but never coerce arbitrary JSON values.
    const expiry=typeof payload.exp==='number'?payload.exp:typeof payload.exp==='string'&&/^\d+$/.test(payload.exp)?Number(payload.exp):NaN;
    if(!Number.isSafeInteger(expiry)||expiry<=Math.floor(Date.now()/1000)||payload.sub!==row.stream_id)unavailable();
    const hls=signedURL(details.playback?.hls||details.hlsPlaybackUrl,row.stream_id,token,'hls');
    const poster=signedURL(details.thumbnail,row.stream_id,token,'poster');
    return {hls,poster,expiresAt:iso(expiry)};
  }catch(error){if(error instanceof Response)throw error;unavailable();}
}
export async function cleanupLogeStream(env){
  if(!env.STREAM||!env.DB)return {deleted:0,failed:0};
  await ensureLogeStreamTables(env);
  // Recover an interrupted create through the provider's read-only listing.
  // Only exact, server-authored ownership metadata can attach an id. A missing
  // result is inconclusive (listing is bounded), so retain the reservation and
  // the provider safety date rather than guess or delete unrelated media.
  if(env.STREAM.videos?.list){
    const unknown=(await env.DB.prepare(`SELECT * FROM loge_stream_uploads
      WHERE stream_id IS NULL AND state IN ('reserved','deleting')
      AND created_at<=unixepoch()-300 AND updated_at<=unixepoch()-300
      ORDER BY updated_at LIMIT 5`).all()).results||[];
    for(const row of unknown){
      try{
        const videos=await env.STREAM.videos.list({after:iso(row.created_at-60),before:iso(row.created_at+300),limit:100});
        const matches=Array.isArray(videos)?videos.filter(video=>typeof video.id==='string'&&/^[a-f0-9]{32}$/i.test(video.id)&&isOwned(video,{...row,stream_id:video.id})):[];
        if(matches.length===1)await env.DB.prepare(`UPDATE loge_stream_uploads SET stream_id=?1,state='deleting',cleanup_after=0,updated_at=unixepoch()
          WHERE id=?2 AND stream_id IS NULL AND state IN ('reserved','deleting')`).bind(matches[0].id,row.id).run();
        else await env.DB.prepare('UPDATE loge_stream_uploads SET updated_at=unixepoch() WHERE id=?1 AND stream_id IS NULL').bind(row.id).run();
      }catch{/* Bounded retry on a later invocation; no ownership guesses. */}
    }
  }
  const candidates=(await env.DB.prepare(`SELECT s.* FROM loge_stream_uploads s
    WHERE s.state<>'deleted' AND s.cleanup_after<=unixepoch() AND (
      s.state='deleting' OR (s.post_id IS NULL AND s.event_id IS NULL AND s.expires_at<=unixepoch())
      OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id)
      OR (s.purpose='loge' AND s.post_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM loge_posts p WHERE p.id=s.post_id AND p.deleted_at IS NULL))
      OR (s.purpose='videography' AND s.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM life_events e WHERE e.id=s.event_id AND e.owner_id=s.user_id AND e.video_branch IS NOT NULL)))
    ORDER BY s.cleanup_after,s.created_at LIMIT 20`).all()).results||[];
  let deleted=0,failed=0;
  for(const row of candidates){
    const claimed=await env.DB.prepare(`UPDATE loge_stream_uploads SET state='deleting',upload_url=NULL,cleanup_after=unixepoch()+300,updated_at=unixepoch()
      WHERE id=?1 AND state<>'deleted' AND cleanup_after<=unixepoch() AND (
      state='deleting' OR (post_id IS NULL AND event_id IS NULL AND expires_at<=unixepoch())
      OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=user_id)
      OR (purpose='loge' AND post_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM loge_posts p WHERE p.id=post_id AND p.deleted_at IS NULL))
      OR (purpose='videography' AND event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM life_events e WHERE e.id=loge_stream_uploads.event_id AND e.owner_id=loge_stream_uploads.user_id AND e.video_branch IS NOT NULL)))`).bind(row.id).run();
    if(!claimed.meta.changes)continue;
    try{await cleanupOne(env,row);deleted++;}catch{
      failed++;
      await env.DB.prepare("UPDATE loge_stream_uploads SET cleanup_attempts=cleanup_attempts+1,cleanup_after=unixepoch()+MIN(86400,300*(cleanup_attempts+1)),updated_at=unixepoch() WHERE id=?1 AND state='deleting'").bind(row.id).run();
    }
  }
  return {deleted,failed};
}
