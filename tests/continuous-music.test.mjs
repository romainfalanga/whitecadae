import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import worker from '../src/index.js';
import {CONTINUOUS} from '../src/music-continuous.js';
import {musicAlbums} from '../src/music-catalogue.js';
import {fixture} from './community-fixture.mjs';
test('continuous variants include only unlocked chapters in canonical album order and exact file sizes',()=>{
  for(let level=1;level<=12;level++)for(const album of musicAlbums({level})){
    if(album.tracks.length===1){assert.equal(album.playback,null);continue;}
    assert.deepEqual(album.playback.chapters.map(c=>c.slug),album.tracks.map(t=>t.slug));
    let end=0;for(const c of album.playback.chapters){assert.ok(Math.abs(c.start-end)<.0001);end=c.start+c.duration;}assert.ok(Math.abs(end-album.playback.duration)<.0001);
  }
  for(const item of Object.values(CONTINUOUS).flat()){assert.equal(statSync(new URL('../public'+item.src,import.meta.url)).size,item.bytes);assert.ok(item.bytes<25*1024*1024);}
});
test('continuous URLs and their byte ranges enforce the song threshold before accessing assets',async()=>{
  const f=fixture();let reads=0;f.env.ASSETS={fetch:async req=>{reads++;const bytes=readFileSync(new URL('../public'+new URL(req.url).pathname,import.meta.url));return new Response(bytes,{headers:{'Content-Type':'audio/mp4'}});}};
  for(const item of Object.values(CONTINUOUS).flat())for(const level of [0,2,3,5,6,7,8,9,10,11,12]){
    const before=reads,res=await worker.fetch(new Request('https://test.local'+item.src,{headers:{Cookie:'wc_session=qa'+level,Range:'bytes=100-107'}}),f.env);
    assert.equal(res.status,level>=item.minLevel?206:403);if(res.status===206){assert.match(res.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await res.arrayBuffer()),readFileSync(new URL('../public'+item.src,import.meta.url)).subarray(100,108));}else assert.equal(reads,before);
  }
  for(const path of ['/music//57/continuous-v1-5.m4a','/music/57/unknown.m4a','/music/%2f57/continuous-v1-5.m4a'])assert.equal((await worker.fetch(new Request('https://test.local'+path),f.env)).status,404);
  f.sql.close();
});
test('7 (Galaxie and Signe) cannot be read or solved before Sans indices unlocks at 2',async()=>{
  const f=fixture();for(const level of [0]){
    const state=await(await worker.fetch(new Request('https://test.local/api/echelon',{headers:{Cookie:'wc_session=qa'+level}}),f.env)).json();assert.ok(!state.nodes.some(n=>n.id==='n-k'));
    for(const answer of ['Galaxie','Signe']){const res=await worker.fetch(new Request('https://test.local/api/echelon/guess',{method:'POST',headers:{Cookie:'wc_session=qa'+level,'Content-Type':'application/json'},body:JSON.stringify({id:'n-k',answer})}),f.env);assert.equal(res.status,404);}
  }
  const state=await(await worker.fetch(new Request('https://test.local/api/echelon',{headers:{Cookie:'wc_session=qa2'}}),f.env)).json();assert.ok(state.nodes.some(n=>n.id==='n-k'));f.sql.close();
});
