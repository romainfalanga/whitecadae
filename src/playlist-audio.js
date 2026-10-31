import {gatedTrack} from './music-catalogue.js';
import {playlistAccess} from './playlists.js';
import {PLAYLIST_AUDIO_VERSION,sourcesBySlug} from './playlist-audio-manifest.js';

const maximum=8;
function validSlugs(slugs){
  return Array.isArray(slugs)&&slugs.length>0&&slugs.length<=maximum&&new Set(slugs).size===slugs.length&&slugs.every(slug=>typeof slug==='string'&&Object.hasOwn(sourcesBySlug,slug)&&!!gatedTrack(slug));
}

// The source URL describes an immutable order, independently of later edits.
// Native playback crosses each chapter without changing audio.src or running JS.
export function playlistPlayback(slugs){
  if(!validSlugs(slugs))throw Error('Invalid playlist audio selection.');
  let duration=0;
  const chapters=slugs.map(slug=>{const chapter={slug,start:duration,duration:sourcesBySlug[slug].duration};duration+=chapter.duration;return chapter;});
  return {src:'/api/playlists/audio?tracks='+encodeURIComponent(slugs.join(',')),duration,chapters};
}

async function etagFor(slugs){
  const text=PLAYLIST_AUDIO_VERSION+'|'+slugs.map(slug=>slug+':'+sourcesBySlug[slug].bytes+':'+sourcesBySlug[slug].sha256).join('|');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return '"playlist-'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')+'"';
}

function rangeOf(header,total){
  const match=/^bytes=(\d*)-(\d*)$/.exec(header?.trim()||'');
  // Like ordinary media servers, ignore unsupported or multiple ranges.
  if(!match||(!match[1]&&!match[2]))return null;
  const first=match[1]?Number(match[1]):null,last=match[2]?Number(match[2]):null;
  if((first!==null&&!Number.isSafeInteger(first))||(last!==null&&!Number.isSafeInteger(last)))return false;
  const start=first===null?Math.max(0,total-last):first;
  const end=first===null?total-1:last===null?total-1:Math.min(last,total-1);
  if(start<0||start>=total||end<start)return false;
  return {start,end};
}

function audioBody(request,env,url,parts){
  const abort=new AbortController();let reader=null,cursor=0,offset=0,remaining=0,part=null,cancelled=false,finished=false;
  const detach=()=>request.signal.removeEventListener('abort',onAbort);
  const onAbort=()=>abort.abort(request.signal.reason);
  request.signal.addEventListener('abort',onAbort,{once:true});
  if(request.signal.aborted)onAbort();
  async function cancel(reason){
    if(cancelled)return;cancelled=true;abort.abort(reason);detach();
    if(reader){const current=reader;reader=null;await current.cancel(reason);}
  }
  return new ReadableStream({
    async pull(controller){
      try{
        while(!cancelled){
          if(!reader){
            if(cursor===parts.length){finished=true;detach();controller.close();return;}
            part=parts[cursor++];remaining=part.end-part.start+1;
            const response=await env.ASSETS.fetch(new Request(new URL(part.source.src,url.origin),{headers:{Range:`bytes=${part.start}-${part.end}`,Accept:'audio/mpeg'},signal:abort.signal}));
            if(cancelled){await response.body?.cancel();return;}
            if(!response.body||![200,206].includes(response.status)||!/^audio\/mpeg(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('Playlist audio asset unavailable.');
            offset=0;
            if(response.status===206){
              const expected=`bytes ${part.start}-${part.end}/${part.source.bytes}`;
              if(response.headers.get('Content-Range')!==expected){await response.body.cancel();throw Error('Unexpected source range.');}
              offset=part.start;
            }
            reader=response.body.getReader();
          }
          const {done,value}=await reader.read();
          if(cancelled)return;
          if(done){reader.releaseLock();reader=null;if(remaining)throw Error('Playlist audio asset is incomplete.');continue;}
          const low=Math.max(0,part.start-offset),high=Math.min(value.byteLength,part.end+1-offset);offset+=value.byteLength;
          if(high>low){const chunk=value.subarray(low,high);remaining-=chunk.byteLength;controller.enqueue(chunk);}
          if(offset>part.end){const current=reader;reader=null;await current.cancel();current.releaseLock();}
          if(!remaining&&cursor===parts.length){finished=true;detach();controller.close();return;}
          if(high>low)return;
        }
      }catch(error){
        if(!cancelled&&!finished){await cancel(error).catch(()=>{});controller.error(error);}
      }
    },
    cancel
  });
}

function fixedLengthBody(body,length){
  // Workers derives Content-Length from the body, ignoring a manually supplied
  // header on ordinary ReadableStreams. Keep this stream native and bounded.
  // The fallback is for runtimes such as Node, which lack FixedLengthStream.
  if(typeof FixedLengthStream!=='function')return body;
  const fixed=new FixedLengthStream(length);
  // pipeTo forwards errors and consumer cancellation in both directions while
  // honoring backpressure. The response consumer observes any pipe failure.
  void body.pipeTo(fixed.writable).catch(()=>{});
  return fixed.readable;
}

export async function handlePlaylistAudio(request,env,url,{getUser,json}){
  const user=await getUser(request,env),access=await playlistAccess(env,user);
  if(request.headers.get('X-WC-User')&&request.headers.get('X-WC-User')!==String(user.id))return json({error:'Le compte connecté a changé. Recharge la page.'},409);
  if(!['GET','HEAD'].includes(request.method))return json({error:'Méthode indisponible.'},405);
  const selections=url.searchParams.getAll('tracks');
  const slugs=selections.length===1&&selections[0].length<=512?selections[0].split(','):null;
  if(!validSlugs(slugs))return json({error:'Ces morceaux ne sont pas disponibles.'},400);
  if(slugs.some(slug=>!access.allowed.has(slug)))return json({error:'Ces morceaux ne sont pas encore disponibles dans ton parcours.'},403);
  const total=slugs.reduce((sum,slug)=>sum+sourcesBySlug[slug].bytes,0),etag=await etagFor(slugs);
  const headers=new Headers({'Content-Type':'audio/mpeg','Content-Length':String(total),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','Vary':'Cookie','ETag':etag});
  if(request.method==='HEAD')return new Response(null,{headers});
  const range=request.headers.get('Range'),ifRange=request.headers.get('If-Range');
  const selected=range&&(!ifRange||ifRange===etag)?rangeOf(range,total):null;
  if(selected===false){headers.set('Content-Range','bytes */'+total);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
  const {start=0,end=total-1}=selected||{};
  if(selected){headers.set('Content-Range',`bytes ${start}-${end}/${total}`);headers.set('Content-Length',String(end-start+1));}
  let offset=0;
  const parts=slugs.flatMap(slug=>{
    const source=sourcesBySlug[slug],base=offset;offset+=source.bytes;
    const low=Math.max(start,base),high=Math.min(end,offset-1);
    return high<low?[]:[{source,start:low-base,end:high-base}];
  });
  return new Response(fixedLengthBody(audioBody(request,env,url,parts),end-start+1),{status:selected?206:200,headers});
}
