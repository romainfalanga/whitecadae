import {gameRows} from './echelon-api.js';
import {gameLevel,MAX_GAME_LEVEL} from './echelon.js';

export const VIDEO_CATEGORIES = [
  {id:'univers',label:'Univers'}, {id:'philosophie',label:'Philosophiques'},
  {id:'psychologie',label:'Psychologiques'}, {id:'projets',label:'Projets'}, {id:'idees',label:'Idées'},
];
const VIDEO_LIMIT=80*1024*1024, AUDIO_LIMIT=8*1024*1024;
const ready=new WeakMap();
export async function ensureVideoTables(env) {
  if(ready.has(env.DB))return ready.get(env.DB);
  const pending=(async()=>{await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS vg_media (
      id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,mime TEXT NOT NULL,
      size INTEGER NOT NULL,duration REAL NOT NULL,object_key TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',
      transcript TEXT,words TEXT,attempts INTEGER NOT NULL DEFAULT 0,transcribing INTEGER NOT NULL DEFAULT 0,
      upload_started_at INTEGER,transcription_started_at INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS vg_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,min_echelon INTEGER NOT NULL,
      youtube_id TEXT,media_id TEXT UNIQUE REFERENCES vg_media(id),client_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),deleted_at TEXT,
      UNIQUE(user_id,client_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS vg_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,post_id INTEGER NOT NULL REFERENCES vg_posts(id),
      parent_id INTEGER REFERENCES vg_comments(id),user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,media_id TEXT UNIQUE REFERENCES vg_media(id),words TEXT NOT NULL DEFAULT '[]',client_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),deleted_at TEXT,
      UNIQUE(user_id,client_id))`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_vg_posts_feed ON vg_posts(category,id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_vg_comments_post ON vg_comments(post_id,id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_vg_media_user ON vg_media(user_id,created_at)'),
  ]);
  const columns=await env.DB.prepare('PRAGMA table_info(vg_posts)').all();
  if(!columns.results.some(c=>c.name==='echelon_version')){
    try{await env.DB.prepare('ALTER TABLE vg_posts ADD COLUMN echelon_version INTEGER NOT NULL DEFAULT 2').run();}
    catch(error){if(!(await env.DB.prepare('PRAGMA table_info(vg_posts)').all()).results.some(c=>c.name==='echelon_version'))throw error;}
  }
  })();
  ready.set(env.DB,pending);
  try{await pending;}catch(error){ready.delete(env.DB);throw error;}
}
export function youtubeId(value) {
  try {
    const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port)return null;
    const host=u.hostname.replace(/^www\.|^m\./,'');
    const id=host==='youtu.be'?u.pathname.slice(1):['youtube.com','youtube-nocookie.com'].includes(host)?(u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1]):null;
    return /^[\w-]{11}$/.test(id||'')?id:null;
  }catch{return null;}
}
function positive(value){return Number.isSafeInteger(value)&&value>0;}
async function readBody(request,max=65000){
  if(Number(request.headers.get('content-length'))>max)return null;
  const reader=request.body?.getReader();if(!reader)return null;
  let size=0,parts=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();return null;}parts.push(value);}
    return JSON.parse(await new Blob(parts).text());
  }catch{return null;}
}
function wordsOf(output,text,duration){
  const out=[];
  const add=(word,start,end)=>{const m=String(word||'').trim(),d=Math.max(0,Number(start)||0),f=Math.min(duration,Number(end)||0);if(m&&f>=d&&d<=duration)out.push({m,d,f});};
  if(output.words?.length)for(const w of output.words)add(w.word||w.text,w.start,w.end);
  else for(const segment of output.segments||[]){
    if(segment.words?.length){for(const w of segment.words)add(w.word||w.text,w.start,w.end);}
    else{const tokens=String(segment.text||'').trim().split(/\s+/).filter(Boolean),start=Number(segment.start)||0,end=Number(segment.end)||duration;tokens.forEach((w,i)=>add(w,start+(end-start)*i/tokens.length,start+(end-start)*(i+1)/tokens.length));}
  }
  if(!out.length){const tokens=text.split(/\s+/).filter(Boolean);tokens.forEach((w,i)=>add(w,duration*i/tokens.length,duration*(i+1)/tokens.length));}
  return out.sort((a,b)=>a.d-b.d).slice(0,1500);
}
export function validateTimings(words,text,duration){
  if(!Array.isArray(words)||words.length>1500)return null;
  let previous=0;const result=[];
  for(const word of words){const m=String(word?.m||''),d=word?.d,f=word?.f;
    if(!m||m.length>200||!Number.isFinite(d)||!Number.isFinite(f)||d<previous||d<0||f<d||f>duration+.1)return null;
    result.push({m,d,f});previous=d;
  }
  if(result.map(w=>w.m).join(' ').replace(/\s+/g,' ').trim()!==text.replace(/\s+/g,' ').trim())return null;
  return result;
}
function rangeOf(raw,size){
  if(!raw)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(raw);
  if(!match||(!match[1]&&!match[2]))return false;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<size?{offset:start,length:end-start+1}:false;
}
export async function handleVideographie(request,env,{getUser,json}) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  const user=await getUser(request,env);
  if(!user)return json({error:'Connexion requise.'},401);
  const level=gameLevel(await gameRows(env,user.id)),ceiling=user.is_admin?MAX_GAME_LEVEL:level;
  if(!user.is_admin&&level<9)return json({error:'La Vidéographie s’ouvre à l’échelon 9.'},403);
  if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  await ensureVideoTables(env);
  const one=(sql,...args)=>env.DB.prepare(sql).bind(...args).first();
  const run=(sql,...args)=>env.DB.prepare(sql).bind(...args).run();
  const all=async(sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
  const error=(message,status=400)=>json({error:message},status);
  const post=async id=>{const p=await one('SELECT p.*,u.username FROM vg_posts p JOIN users u ON u.id=p.user_id WHERE p.id=?1 AND p.deleted_at IS NULL',id);return p&&(user.is_admin||p.min_echelon+(p.echelon_version===2?1:0)<=level)?p:null;};
  const threshold=p=>p.min_echelon+(p.echelon_version===2?1:0);
  const present=p=>({id:p.id,title:p.title,description:p.description,category:p.category,min_echelon:threshold(p),username:p.username,created_at:p.created_at,youtube_id:p.youtube_id,media_url:p.media_id?'/api/vg-media/'+p.media_id:null,editable:!!(user.is_admin||p.user_id===user.id),comments:p.comments||0});
  const ownedMedia=async(id,kind)=>{const m=await one('SELECT * FROM vg_media WHERE id=?1 AND user_id=?2 AND kind=?3 AND state=?4',id,user.id,kind,'ready');return m;};
  let match;

  if(path==='/api/videographies'&&method==='GET'){
    const category=url.searchParams.get('category')||'tout',before=Number(url.searchParams.get('before')||0);
    if(category!=='tout'&&!VIDEO_CATEGORIES.some(c=>c.id===category))return error('Catégorie inconnue.');
    if(!Number.isSafeInteger(before)||before<0)return error('Pagination invalide.');
    const rows=await all(`SELECT p.*,u.username,(SELECT count(*) FROM vg_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comments
      FROM vg_posts p JOIN users u ON u.id=p.user_id WHERE p.deleted_at IS NULL AND (?1=1 OR p.min_echelon+CASE WHEN p.echelon_version=2 THEN 1 ELSE 0 END<=?2)
      AND (?3='tout' OR p.category=?3) AND (?4=0 OR p.id<?4) ORDER BY p.id DESC LIMIT 25`,user.is_admin?1:0,level,category,before);
    const posts=rows.slice(0,24);
    return json({posts:posts.map(present),nextBefore:rows.length>24?posts.at(-1).id:null,categories:VIDEO_CATEGORIES,echelon:ceiling,uploads:!!env.MEDIA,limits:{videoBytes:VIDEO_LIMIT,audioBytes:AUDIO_LIMIT,videoSeconds:600,audioSeconds:180}});
  }
  if(path==='/api/videographies'&&method==='POST'){
    const b=await readBody(request);if(!b)return error('Publication invalide.');
    const title=String(b.title||'').trim(),description=String(b.description||'').trim(),minimum=b.min_echelon;
    if(!title||title.length>160||description.length>4000)return error('Un titre de 160 caractères et une description de 4 000 caractères au maximum.');
    if(!VIDEO_CATEGORIES.some(c=>c.id===b.category))return error('Choisis une catégorie.');
    if(!Number.isInteger(minimum)||minimum<9||minimum>ceiling)return error('Cet échelon de visibilité n’est pas disponible.');
    if(!/^[\w-]{16,80}$/.test(b.client_id||''))return error('Identifiant de publication invalide.');
    const prior=await one('SELECT id FROM vg_posts WHERE user_id=?1 AND client_id=?2',user.id,b.client_id);if(prior)return json({id:prior.id},200);
    const yt=b.url?youtubeId(b.url):null,media=b.media_id?await ownedMedia(b.media_id,'video'):null;
    if((yt?1:0)+(media?1:0)!==1||b.url&&!yt||b.media_id&&!media)return error('Ajoute un fichier vidéo ou un lien YouTube valide.');
    if(media&&await one('SELECT id FROM vg_posts WHERE media_id=?1',media.id))return error('Cette vidéo a déjà été publiée.',409);
    const recent=await one("SELECT count(*) AS n FROM vg_posts WHERE user_id=?1 AND created_at>datetime('now','-1 day')",user.id);
    if(recent.n>=10&&!user.is_admin)return error('Tu peux publier dix vidéos par jour. Réessaie demain.',429);
    const result=await run('INSERT INTO vg_posts(user_id,title,description,category,min_echelon,youtube_id,media_id,client_id,echelon_version) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,3)',user.id,title,description,b.category,minimum,yt,media?.id||null,b.client_id);
    return json({id:result.meta.last_row_id},201);
  }
  if((match=path.match(/^\/api\/videographies\/(\d+)$/))){
    const p=await post(Number(match[1]));if(!p)return error('Vidéo introuvable.',404);
    if(method==='GET')return json({post:present(p),echelon:ceiling,categories:VIDEO_CATEGORIES,uploads:!!env.MEDIA});
    if(p.user_id!==user.id&&!user.is_admin)return error('Vidéo introuvable.',404);
    if(method==='DELETE'){await run("UPDATE vg_posts SET deleted_at=datetime('now') WHERE id=?1",p.id);return json({ok:true});}
    if(method==='PATCH'){
      const b=await readBody(request);if(!b)return error('Modification invalide.');
      const title=String(b.title||'').trim(),description=String(b.description||'').trim(),minimum=b.min_echelon;
      if(!title||title.length>160||description.length>4000||!VIDEO_CATEGORIES.some(c=>c.id===b.category))return error('Vérifie le titre, la description et la catégorie.');
      if(!Number.isInteger(minimum)||minimum<9||minimum>ceiling)return error('Échelon invalide.');
      if(minimum<threshold(p)&&(await one('SELECT count(*) AS n FROM vg_comments WHERE post_id=?1',p.id)).n)return error('L’échelon ne peut pas être abaissé après les premières réponses, pour conserver leur audience.');
      await run("UPDATE vg_posts SET title=?1,description=?2,category=?3,min_echelon=?4,echelon_version=3,updated_at=datetime('now') WHERE id=?5",title,description,b.category,minimum,p.id);return json({ok:true});
    }
  }
  if((match=path.match(/^\/api\/videographies\/(\d+)\/comments$/))){
    const p=await post(Number(match[1]));if(!p)return error('Vidéo introuvable.',404);
    if(method==='GET'){
      const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)return error('Pagination invalide.');
      const rows=await all(`SELECT c.*,u.username,m.duration FROM vg_comments c JOIN users u ON u.id=c.user_id LEFT JOIN vg_media m ON m.id=c.media_id
        WHERE c.post_id=?1 AND c.id>?2 ORDER BY c.id ASC LIMIT 101`,p.id,after);
      const comments=rows.slice(0,100).map(c=>({id:c.id,parent_id:c.parent_id,username:c.username,body:c.deleted_at?'':c.body,words:c.deleted_at?[]:JSON.parse(c.words),duration:c.duration||0,audio_url:!c.deleted_at&&c.media_id?'/api/vg-media/'+c.media_id:null,deleted:!!c.deleted_at,editable:!c.deleted_at&&(user.is_admin||c.user_id===user.id),created_at:c.created_at}));
      return json({comments,nextAfter:rows.length>100?comments.at(-1).id:null});
    }
    if(method==='POST'){
      const b=await readBody(request,250000);if(!b)return error('Commentaire invalide.');
      const text=String(b.body||'').trim(),parent=b.parent_id??null;
      if(!text||text.length>6000||!b.media_id)return error('Enregistre un vocal et vérifie sa transcription (6 000 caractères maximum).');
      if(parent!==null&&(!positive(parent)||!await one('SELECT id FROM vg_comments WHERE id=?1 AND post_id=?2',parent,p.id)))return error('La réponse doit appartenir à cette vidéo.');
      if(!/^[\w-]{16,80}$/.test(b.client_id||''))return error('Identifiant de commentaire invalide.');
      const prior=await one('SELECT id FROM vg_comments WHERE user_id=?1 AND client_id=?2',user.id,b.client_id);if(prior)return json({id:prior.id},200);
      const m=await ownedMedia(b.media_id,'audio');if(!m)return error('Enregistrement introuvable.');
      if(await one('SELECT id FROM vg_comments WHERE media_id=?1',m.id))return error('Cet enregistrement a déjà été publié.',409);
      const words=validateTimings(b.words,text,m.duration);if(!words)return error('Vérifie la préécoute et le minutage du texte.');
      const count=await one("SELECT count(*) AS n FROM vg_comments WHERE user_id=?1 AND created_at>datetime('now','-1 day')",user.id);
      if(count.n>=60&&!user.is_admin)return error('La limite de 60 réponses quotidiennes est atteinte.',429);
      const r=await run('INSERT INTO vg_comments(post_id,parent_id,user_id,body,media_id,words,client_id) VALUES(?1,?2,?3,?4,?5,?6,?7)',p.id,parent,user.id,text,m.id,JSON.stringify(words),b.client_id);
      return json({id:r.meta.last_row_id},201);
    }
  }
  if((match=path.match(/^\/api\/vg-comments\/(\d+)$/))){
    const c=await one('SELECT * FROM vg_comments WHERE id=?1 AND deleted_at IS NULL',Number(match[1]));
    if(!c||!await post(c.post_id)||(c.user_id!==user.id&&!user.is_admin))return error('Commentaire introuvable.',404);
    if(method==='DELETE'){await run("UPDATE vg_comments SET deleted_at=datetime('now') WHERE id=?1",c.id);return json({ok:true});}
    if(method==='PATCH'){
      const b=await readBody(request,250000),m=await one('SELECT duration FROM vg_media WHERE id=?1',c.media_id),text=String(b?.body||'').trim();
      const words=m&&text&&text.length<=6000?validateTimings(b?.words,text,m.duration):null;
      if(!words)return error('Texte ou minutage invalide.');
      await run("UPDATE vg_comments SET body=?1,words=?2,updated_at=datetime('now') WHERE id=?3",text,JSON.stringify(words),c.id);return json({ok:true});
    }
  }
  // Media handlers are kept in the same authorization boundary as publications.
  return handleMedia();

  async function handleMedia() {
    if(path==='/api/vg-media'&&method==='POST'){
      if(!env.MEDIA)return error('L’envoi de fichiers n’est pas disponible pour le moment.',503);
      const b=await readBody(request);if(!b)return error('Fichier invalide.');
      const valid=b.kind==='video'?['video/mp4','video/webm','video/quicktime']:b.kind==='audio'?['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav']:[];
      const mime=String(b.mime||'').split(';')[0].toLowerCase(),limit=b.kind==='video'?VIDEO_LIMIT:AUDIO_LIMIT;
      if(!valid.includes(mime)||!positive(b.size)||b.size>limit||!Number.isFinite(b.duration)||b.duration<=0||b.duration>(b.kind==='video'?600:180))return error('Format, durée ou taille non pris en charge. Vidéo : 10 min / 80 Mo ; vocal : 3 min / 8 Mo.');
      // Pending uploads count towards quotas too, so parallel requests cannot reserve unbounded storage.
      const id=crypto.randomUUID(),key='members/'+user.id+'/'+id;
      const r=await run(`INSERT INTO vg_media(id,user_id,kind,mime,size,duration,object_key)
        SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE
        (SELECT coalesce(sum(size),0) FROM vg_media WHERE user_id=?2 AND created_at>datetime('now','-1 day'))+?5<=209715200
        AND (SELECT coalesce(sum(size),0) FROM vg_media WHERE user_id=?2)+?5<=1073741824
        AND (SELECT coalesce(sum(size),0) FROM vg_media)+?5<=8589934592
        AND (SELECT count(*) FROM vg_media WHERE user_id=?2 AND created_at>datetime('now','-1 day'))<100`,id,user.id,b.kind,mime,b.size,b.duration,key);
      if(!r.meta.changes)return error('La capacité d’envoi disponible est atteinte. Réessaie plus tard.',429);
      return json({id,upload_url:'/api/vg-media/'+id+'/upload'},201);
    }
    const route=path.match(/^\/api\/vg-media\/([\w-]+)(?:\/(upload|transcribe))?$/);
    if(!route)return error('Route introuvable.',404);
    const m=await one('SELECT * FROM vg_media WHERE id=?1',route[1]);if(!m)return error('Média introuvable.',404);
    if(!env.MEDIA)return error('Le stockage est indisponible.',503);
    if(!route[2]&&method==='DELETE'){
      if(m.user_id!==user.id)return error('Média introuvable.',404);
      if(await one('SELECT id FROM vg_posts WHERE media_id=?1',m.id)||await one('SELECT id FROM vg_comments WHERE media_id=?1',m.id))return error('Ce média appartient à une publication.',409);
      if(m.state==='uploading'||m.transcribing)return error('Le traitement est encore en cours.',409);
      await env.MEDIA.delete(m.object_key);
      await run("UPDATE vg_media SET state='discarded',size=0,transcript=NULL,words=NULL WHERE id=?1",m.id);
      return json({ok:true});
    }
    if(route[2]==='upload'&&method==='PUT'){
      if(m.user_id!==user.id)return error('Média introuvable.',404);
      if(m.state==='ready')return json({id:m.id,ready:true});
      const declaredSize=request.headers.get('Content-Length');
      if(!request.body||(declaredSize!==null&&Number(declaredSize)!==m.size)||String(request.headers.get('Content-Type')).split(';')[0].toLowerCase()!==m.mime)return error('Le fichier ne correspond pas à l’envoi préparé.');
      const claimed=await run("UPDATE vg_media SET state='uploading',upload_started_at=unixepoch() WHERE id=?1 AND (state='pending' OR (state='uploading' AND upload_started_at<unixepoch()-600))",m.id);
      if(!claimed.meta.changes)return error('Un envoi est déjà en cours.',409);
      try{
        // R2 needs a stream with a known length. Browsers can omit Content-Length
        // on streamed requests, so use the validated ticket and enforce its size.
        let received=0;
        const stream=typeof FixedLengthStream==='function'?new FixedLengthStream(m.size):new TransformStream({
          transform(chunk,controller){received+=chunk.byteLength;if(received>m.size)throw new Error('Unexpected upload size');controller.enqueue(chunk);},
          flush(){if(received!==m.size)throw new Error('Unexpected upload size');},
        });
        const [stored]=await Promise.all([
          env.MEDIA.put(m.object_key,stream.readable,{httpMetadata:{contentType:m.mime}}),
          request.body.pipeTo(stream.writable),
        ]);
        if(stored.size!==m.size)throw new Error('Unexpected upload size');
        await run("UPDATE vg_media SET state='ready' WHERE id=?1",m.id);
        return json({id:m.id,ready:true});
      }catch{
        await env.MEDIA.delete(m.object_key).catch(()=>{});
        await run("UPDATE vg_media SET state='pending' WHERE id=?1",m.id);
        return error('L’envoi n’a pas abouti. Vérifie ta connexion et réessaie.',503);
      }
    }
    if(route[2]==='transcribe'&&method==='POST'){
      if(m.user_id!==user.id||m.kind!=='audio'||m.state!=='ready')return error('Enregistrement introuvable.',404);
      if(m.transcript)return json({text:m.transcript,words:JSON.parse(m.words||'[]'),duration:m.duration});
      if(!env.AI)return error('La transcription est indisponible. Tu peux corriger le texte à la main ou réessayer.',503);
      const claimed=await run('UPDATE vg_media SET attempts=attempts+1,transcribing=1,transcription_started_at=unixepoch() WHERE id=?1 AND (transcribing=0 OR transcription_started_at<unixepoch()-300) AND attempts<3',m.id);
      if(!claimed.meta.changes)return error('Transcription déjà en cours ou limite de tentatives atteinte. Tu peux saisir le texte manuellement.',429);
      try{
        const object=await env.MEDIA.get(m.object_key);if(!object)return error('Enregistrement introuvable.',404);
        const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
        const result=await env.AI.run('@cf/openai/whisper-large-v3-turbo',{audio:btoa(binary),language:'fr',vad_filter:true});
        const text=String(result.text||result.transcription_info?.text||result.transcription||'').trim().slice(0,6000);
        if(!text)return error('Aucune parole reconnue. Réécoute le vocal ou saisis sa transcription.',422);
        const words=wordsOf(result,text,m.duration);
        await run('UPDATE vg_media SET transcript=?1,words=?2 WHERE id=?3',text,JSON.stringify(words),m.id);
        return json({text,words,duration:m.duration});
      }catch{return error('La transcription a échoué. Ton vocal est conservé : réessaie ou saisis le texte.',503);}
      finally{await run('UPDATE vg_media SET transcribing=0 WHERE id=?1',m.id);}
    }
    if(!route[2]&&['GET','HEAD'].includes(method)&&m.state==='ready'){
      const p=await one('SELECT * FROM vg_posts WHERE media_id=?1',m.id);
      const c=await one('SELECT c.deleted_at,p.min_echelon,p.echelon_version,p.deleted_at AS post_deleted FROM vg_comments c JOIN vg_posts p ON p.id=c.post_id WHERE c.media_id=?1',m.id);
      if(p?.deleted_at||c?.deleted_at||c?.post_deleted)return error('Média introuvable.',404);
      const required=p?threshold(p):c?threshold(c):undefined;
      if(required!==undefined?(!user.is_admin&&level<required):m.user_id!==user.id)return error('Média introuvable.',404);
      const head=await env.MEDIA.head(m.object_key);if(!head)return error('Média introuvable.',404);
      const range=rangeOf(request.headers.get('Range'),head.size);
      const headers={'Content-Type':m.mime,'Cache-Control':'private, no-store','Vary':'Cookie','Accept-Ranges':'bytes','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'};
      if(range===false)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+head.size}});
      headers['Content-Length']=String(range?range.length:head.size);
      if(range)headers['Content-Range']=`bytes ${range.offset}-${range.offset+range.length-1}/${head.size}`;
      const object=method==='HEAD'?null:await env.MEDIA.get(m.object_key,range?{range}:undefined);
      return new Response(object?.body||null,{status:range?206:200,headers});
    }
    return error('Méthode indisponible.',405);
  }
}
