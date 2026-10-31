import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './community-fixture.mjs';
import {NODES} from '../src/echelon.js';
import {RELEASES} from '../src/music-catalogue.js';
import {handlePlaylistAudio,playlistPlayback} from '../src/playlist-audio.js';
import {sourcesBySlug} from '../src/playlist-audio-manifest.js';
import {inspectMp3} from '../scripts/build-playlist-audio.mjs';

const tracks=RELEASES.flatMap(album=>album.tracks),slugs=tracks.map(track=>track.slug);
const media=slug=>readFileSync(new URL('../public'+sourcesBySlug[slug].src,import.meta.url));
function setup({honorRanges=false}={}){
  const f=fixture(),reads=[],cancelled=[];
  f.env.ASSETS={async fetch(request){
    const path=new URL(request.url).pathname,entry=Object.values(sourcesBySlug).find(source=>source.src===path);
    reads.push({path,range:request.headers.get('Range')});
    if(!entry)return new Response('Missing',{status:404});
    const bytes=readFileSync(new URL('../public'+path,import.meta.url));let start=0,end=bytes.length-1,status=200;
    const match=/^bytes=(\d+)-(\d+)$/.exec(request.headers.get('Range')||'');
    if(honorRanges&&match){start=+match[1];end=+match[2];status=206;}
    let offset=start;
    const body=new ReadableStream({pull(controller){
      if(offset>end){controller.close();return;}
      const next=Math.min(end+1,offset+65536);controller.enqueue(bytes.subarray(offset,next));offset=next;
    },cancel(){cancelled.push(path);}});
    const headers={'Content-Type':'audio/mpeg','Content-Length':String(end-start+1)};
    if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;
    return new Response(body,{status,headers});
  }};
  const deps={getUser:async request=>{
    const token=/wc_session=qa(\d+)/.exec(request.headers.get('Cookie')||'');
    return token?f.sql.prepare('SELECT id,is_admin FROM users WHERE id=?').get(+token[1]+1)||null:null;
  },json:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})};
  const call=async(selected,{token='qa10',method='GET',headers={},raw}={})=>{
    const url=new URL('https://test.local'+(raw??playlistPlayback(selected).src));
    const request=new Request(url,{method,headers:{Cookie:'wc_session='+token,...headers}});
    try{return await handlePlaylistAudio(request,f.env,url,deps);}catch(error){if(error instanceof Response)return error;throw error;}
  };
  return {...f,reads,cancelled,call};
}

test('every normalized asset is a complete independent CBR stream and its manifest matches every byte',()=>{
  assert.deepEqual(Object.keys(sourcesBySlug),slugs);
  for(const slug of slugs){
    const entry=sourcesBySlug[slug],found=inspectMp3(media(slug));
    assert.deepEqual(found,{bytes:entry.bytes,frames:entry.frames,duration:entry.duration,sha256:entry.sha256},slug);
    assert.ok(entry.bytes<25*1024*1024);
  }
  assert.throws(()=>inspectMp3(Buffer.from('ID3abc')));
  assert.throws(()=>inspectMp3(media(slugs[0]).subarray(0,-1)));
});

test('an ordered cross-album queue is one immutable source with exact native chapter offsets',()=>{
  const order=['la-matiere-dense','30-vins-divins','un-fil-entre-deux-infinis','13h20'];
  const playback=playlistPlayback(order);let end=0;
  for(const [index,chapter]of playback.chapters.entries()){
    assert.equal(chapter.slug,order[index]);assert.equal(chapter.start,end);end+=sourcesBySlug[chapter.slug].duration;
  }
  assert.equal(playback.duration,end);
  const url=new URL(playback.src,'https://test.local');assert.equal(url.searchParams.get('tracks'),order.join(','));
  assert.notEqual(playlistPlayback(order.toReversed()).src,playback.src);
  order.reverse();assert.equal(url.searchParams.get('tracks'),'la-matiere-dense,30-vins-divins,un-fil-entre-deux-infinis,13h20');
  for(const invalid of [[],['missing'],['wanheda'],['13h20','13h20'],Array(9).fill('13h20')])assert.throws(()=>playlistPlayback(invalid));
});

test('audio access checks the real level and each current song before reading any private asset',async()=>{
  const f=setup();try{
    for(const token of ['qa9','qa99','invalid']){
      const res=await f.call(['13h20'],{token});assert.equal(res.status,token==='invalid'?401:403);
    }
    assert.equal((await f.call(['les-probabilites'])).status,403);
    for(const raw of ['/api/playlists/audio','/api/playlists/audio?tracks=wanheda','/api/playlists/audio?tracks=missing','/api/playlists/audio?tracks=13h20,13h20','/api/playlists/audio?tracks=13h20&tracks=orange','/api/playlists/audio?tracks='])assert.equal((await f.call(null,{raw})).status,400,raw);
    assert.equal(f.reads.length,0);
    const good=await f.call(['orange','13h20']);assert.equal(good.status,200);await good.body.cancel();
    assert.equal((await f.call(['13h20'],{headers:{'X-WC-User':'100'}})).status,409);
    assert.equal((await f.call(['13h20'],{method:'POST'})).status,405);
    // Removing a rung from an existing account immediately revokes native range requests.
    f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=11 AND riddle_id=?').run(NODES.flatMap(n=>n.answers.map(a=>a.id))[8]);
    assert.equal((await f.call(['13h20'],{headers:{Range:'bytes=0-1'}})).status,403);
  }finally{f.sql.close();}
});

test('HEAD and unsatisfiable ranges return exact lengths without fetching assets; If-Range and multi-range follow media semantics',async()=>{
  const f=setup(),order=['orange','13h20'],total=order.reduce((n,slug)=>n+sourcesBySlug[slug].bytes,0);
  try{
    const head=await f.call(order,{method:'HEAD'});
    assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Length'),String(total));assert.equal(f.reads.length,0);
    assert.match(head.headers.get('Cache-Control'),/private, no-store/);assert.equal(head.headers.get('Vary'),'Cookie');assert.equal(head.headers.get('Accept-Ranges'),'bytes');
    const etag=head.headers.get('ETag');
    assert.notEqual((await f.call(order.toReversed(),{method:'HEAD'})).headers.get('ETag'),etag);
    for(const range of [`bytes=${total}-`,`bytes=20-10`,'bytes=-0','bytes=999999999999999999999-']){
      const res=await f.call(order,{headers:{Range:range}});assert.equal(res.status,416,range);assert.equal(res.headers.get('Content-Range'),'bytes */'+total);assert.equal(await res.text(),'');
    }
    assert.equal(f.reads.length,0);
    const unchanged=await f.call(order,{headers:{Range:'bytes=0-0','If-Range':etag}});assert.equal(unchanged.status,206);assert.equal((await unchanged.arrayBuffer()).byteLength,1);
    for(const headers of [{Range:'bytes=0-0','If-Range':'"older-playlist"'},{Range:'bytes=0-1,4-5'},{Range:'unsupported'}]){
      const res=await f.call(order,{headers});assert.equal(res.status,200);assert.equal(res.headers.get('Content-Length'),String(total));await res.body.cancel();
    }
  }finally{f.sql.close();}
});

for(const honorRanges of [false,true])test('byte-perfect boundaries, prefix/suffix seeks and complete order with upstream '+(honorRanges?'206 ranges':'200 full assets'),async()=>{
  const f=setup({honorRanges}),order=['orange','13h20','30-vins-divins'];
  const whole=Buffer.concat(order.map(media)),boundary=sourcesBySlug.orange.bytes;
  try{
    const selections=[[0,0],[0,127],[boundary-9,boundary+11],[boundary+23,boundary+256],[whole.length-51,whole.length-1]];
    for(const [start,end]of selections){
      const res=await f.call(order,{headers:{Range:`bytes=${start}-${end}`}});
      assert.equal(res.status,206);assert.equal(res.headers.get('Content-Range'),`bytes ${start}-${end}/${whole.length}`);assert.equal(res.headers.get('Content-Length'),String(end-start+1));
      assert.deepEqual(Buffer.from(await res.arrayBuffer()),whole.subarray(start,end+1));
    }
    const suffix=await f.call(order,{headers:{Range:'bytes=-47'}});assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),whole.subarray(-47));
    const tail=await f.call(order,{headers:{Range:`bytes=${whole.length-71}-`}});assert.deepEqual(Buffer.from(await tail.arrayBuffer()),whole.subarray(-71));
    const full=await f.call(order);assert.equal(full.status,200);assert.equal(full.headers.get('Content-Type'),'audio/mpeg');assert.deepEqual(Buffer.from(await full.arrayBuffer()),whole);
  }finally{f.sql.close();}
});

test('cancelling the native stream stops its source reader and never opens the next song',async()=>{
  const f=setup();try{
    const response=await f.call(['orange','13h20']);const reader=response.body.getReader();
    assert.equal((await reader.read()).done,false);await reader.cancel('Stopped playback');
    assert.equal(f.reads.length,1);assert.deepEqual(f.cancelled,[sourcesBySlug.orange.src]);
  }finally{f.sql.close();}
});

test('Workers fixed-length transport preserves exact ranges, backpressure, cancellation and source errors',async()=>{
  const original=globalThis.FixedLengthStream,created=[];
  // Exercise the Workers-only branch with a length-enforcing native transform.
  // Unlike Node's Response headers, Workers uses this body type to derive its
  // on-wire Content-Length instead of switching to chunked encoding.
  globalThis.FixedLengthStream=class extends TransformStream{
    constructor(length){
      let written=0;
      super({transform(chunk,controller){
        written+=chunk.byteLength;if(written>length)throw Error('Fixed length exceeded');
        controller.enqueue(chunk);
      },flush(){if(written!==length)throw Error('Fixed length incomplete');}});
      created.push({length,readable:this.readable});
    }
  };
  const f=setup({honorRanges:true}),order=['orange','13h20'],boundary=sourcesBySlug.orange.bytes;
  try{
    const whole=Buffer.concat(order.map(media));
    const range=await f.call(order,{headers:{Range:`bytes=${boundary-9}-${boundary+11}`}});
    assert.equal(created[0].length,21);assert.equal(range.body,created[0].readable);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()),whole.subarray(boundary-9,boundary+12));

    const readCount=f.reads.length,cancelCount=f.cancelled.length,response=await f.call(order);
    assert.equal(created[1].length,whole.length);assert.equal(response.body,created[1].readable);
    // An unconsumed response may prefetch bounded chunks, never the next song.
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.reads.length,readCount+1);
    const reader=response.body.getReader();assert.equal((await reader.read()).done,false);
    await reader.cancel('Stopped fixed-length playback');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.reads.length,readCount+1);assert.equal(f.cancelled.length,cancelCount+1);
    assert.equal(f.cancelled.at(-1),sourcesBySlug.orange.src);

    f.env.ASSETS.fetch=async()=>new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'audio/mpeg'}});
    const incomplete=await f.call(['orange']);
    await assert.rejects(incomplete.arrayBuffer(),/incomplete/);
  }finally{
    if(original===undefined)delete globalThis.FixedLengthStream;else globalThis.FixedLengthStream=original;
    f.sql.close();
  }
});
