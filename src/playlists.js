import {gameRows} from './echelon-api.js';
import {gameLevel} from './echelon.js';
import {RELEASES,canListen} from './music-catalogue.js';
import {fail,objectBody,text,integer} from './private-data.js';
import {playlistPlayback} from './playlist-audio.js';
import {PLAYLISTS_ENABLED} from './features.js';

export const PLAYLIST_LIMIT=30;
export const PLAYLIST_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
    tracks TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tracks)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id,updated_at DESC,id DESC)`
];
const ready=new WeakMap();
export async function ensurePlaylistTables(env){
  if(ready.has(env.DB))return ready.get(env.DB);
  const pending=env.DB.batch(PLAYLIST_SCHEMA.map(sql=>env.DB.prepare(sql)));
  ready.set(env.DB,pending);
  try{await pending;}catch(error){ready.delete(env.DB);throw error;}
}

// The same fresh catalogue is used for display, edits and any playback transport.
export async function playlistAccess(env,user){
  if(!user)fail('Connecte-toi pour ouvrir cette page.',401);
  const level=gameLevel(await gameRows(env,user.id));
  if(level<10)fail('Cette page n’est pas encore disponible dans ton parcours.',403);
  const access={level,admin:!!user.is_admin};
  const tracks=RELEASES.flatMap(album=>album.tracks.filter(track=>canListen(track,access)).map(track=>({
    slug:track.slug,title:track.title,duration:track.duration,src:track.src,
    albumId:album.id,album:album.album,artist:album.artist,cover:album.cover,coverType:album.coverType
  })));
  return {level,tracks,allowed:new Set(tracks.map(track=>track.slug))};
}

function displayPlaylist(row,allowed){
  let tracks=[];
  try{const saved=JSON.parse(row.tracks);if(Array.isArray(saved))tracks=[...new Set(saved.filter(slug=>typeof slug==='string'&&allowed.has(slug)))];}catch{}
  return {id:row.id,name:row.name,tracks,revision:row.revision,playback:tracks.length?playlistPlayback(tracks):null};
}
function nameOf(value){
  const name=text(value,80,true);
  if(/[\u0000-\u001f\u007f]/.test(name))fail('Nom de playlist invalide.');
  return name;
}
function tracksOf(value,allowed){
  if(!Array.isArray(value)||value.length>allowed.size||new Set(value).size!==value.length||value.some(slug=>typeof slug!=='string'||!allowed.has(slug)))fail('Ces morceaux ne sont pas disponibles.');
  return value;
}
async function owned(env,userId,id){
  const row=await env.DB.prepare('SELECT id,name,tracks,revision FROM playlists WHERE id=?1 AND user_id=?2').bind(id,userId).first();
  if(!row)fail('Playlist introuvable.',404);
  return row;
}
async function bodyOf(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('Une requête JSON est requise.',415);
  return objectBody(request,16384);
}

export async function handlePlaylists(request,env,url,{getUser,json,playlistsEnabled=PLAYLISTS_ENABLED}){
  // Explicit dependency injection keeps the saved feature testable while its
  // production entry point always uses the source-controlled product switch.
  if(!playlistsEnabled)return json({error:'Page introuvable.'},404);
  const user=await getUser(request,env),access=await playlistAccess(env,user);
  if(request.headers.get('X-WC-User')&&request.headers.get('X-WC-User')!==String(user.id))fail('Le compte connecté a changé. Recharge la page.',409);
  const path=url.pathname.replace(/\/+$/,''),collection=path==='/api/playlists',match=/^\/api\/playlists\/([1-9]\d*)$/.exec(path);
  if(!collection&&!match)return json({error:'Page introuvable.'},404);
  await ensurePlaylistTables(env);
  if(collection){
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,name,tracks,revision FROM playlists WHERE user_id=?1 ORDER BY updated_at DESC,id DESC').bind(user.id).all();
      return json({playlists:(rows.results||[]).map(row=>displayPlaylist(row,access.allowed)),tracks:access.tracks});
    }
    if(request.method!=='POST')return json({error:'Méthode indisponible.'},405);
    const body=await bodyOf(request),name=nameOf(body.name),tracks=tracksOf(body.tracks===undefined?[]:body.tracks,access.allowed);
    const result=await env.DB.prepare(`INSERT INTO playlists(user_id,name,tracks)
      SELECT ?1,?2,?3 WHERE (SELECT count(*) FROM playlists WHERE user_id=?1)<?4`).bind(user.id,name,JSON.stringify(tracks),PLAYLIST_LIMIT).run();
    if(!result.meta.changes)return json({error:'Tu as atteint la limite de playlists.'},409);
    return json({playlist:displayPlaylist(await owned(env,user.id,result.meta.last_row_id),access.allowed)},201);
  }
  const id=Number(match[1]);
  if(!Number.isSafeInteger(id))return json({error:'Playlist introuvable.'},404);
  if(!['PUT','DELETE'].includes(request.method))return json({error:'Méthode indisponible.'},405);
  await owned(env,user.id,id);
  const body=await bodyOf(request),revision=integer(body.revision,1);
  let result;
  if(request.method==='PUT'){
    const name=nameOf(body.name),tracks=tracksOf(body.tracks,access.allowed);
    result=await env.DB.prepare(`UPDATE playlists SET name=?1,tracks=?2,revision=revision+1,updated_at=datetime('now')
      WHERE id=?3 AND user_id=?4 AND revision=?5`).bind(name,JSON.stringify(tracks),id,user.id,revision).run();
  }else result=await env.DB.prepare('DELETE FROM playlists WHERE id=?1 AND user_id=?2 AND revision=?3').bind(id,user.id,revision).run();
  if(!result.meta.changes){await owned(env,user.id,id);return json({error:'Cette playlist a changé sur un autre appareil. Recharge-la avant de réessayer.',conflict:true},409);}
  return json(request.method==='DELETE'?{ok:true}:{playlist:displayPlaylist(await owned(env,user.id,id),access.allowed)});
}
