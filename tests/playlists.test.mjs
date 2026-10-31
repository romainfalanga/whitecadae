import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handlePlaylists,PLAYLIST_LIMIT} from '../src/playlists.js';
import {NODES} from '../src/echelon.js';
import {fixture} from './community-fixture.mjs';
import {accountResetPlan} from '../scripts/account-reset-plan.mjs';

const ids=NODES.flatMap(node=>node.answers.map(answer=>answer.id));
function setup(){
  const f=fixture();
  const deps={playlistsEnabled:true,json:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}}),getUser:async request=>{
    const token=/wc_session=([^;]+)/.exec(request.headers.get('Cookie')||'')?.[1];
    return f.sql.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=?').get(token||'')||null;
  }};
  async function call(path='/api/playlists',{token='qa10',method='GET',body,raw,headers={}}={}){
    const request=new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session='+token,...((body!==undefined||raw!==undefined)?{'Content-Type':'application/json'}:{}),...headers},...((body!==undefined||raw!==undefined)?{body:raw??JSON.stringify(body)}:{})});
    let response;try{response=await handlePlaylists(request,f.env,new URL(request.url),deps);}catch(error){if(!(error instanceof Response))throw error;response=error;}
    return {status:response.status,data:await response.json(),headers:response.headers};
  }
  function level(userId,score){
    f.sql.prepare('DELETE FROM riddle_progress WHERE user_id=?').run(userId);
    for(const id of ids.slice(0,score-1))f.sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(userId,id,'now');
  }
  return {...f,call,level};
}

test('Playlist opens only at ten real levels; anonymous, forged and administrator requests cannot bypass the threshold',async()=>{
  const f=setup();try{
    for(const [token,status]of [['invalid',401],['qa9',403],['qa99',403],['qa10',200]]){
      const result=await f.call('/api/playlists?level=33&admin=true',{token});
      assert.equal(result.status,status,token);assert.match(result.headers.get('cache-control'),/no-store/);
      if(status!==200)assert.doesNotMatch(JSON.stringify(result.data),/13h20|src|La matière|probabilités/);
    }
    const available=(await f.call()).data;
    assert.equal(available.tracks.length,4);assert.deepEqual(available.playlists,[]);
    assert.deepEqual(available.tracks.map(track=>track.slug),['13h20','30-vins-divins','sans-indice-dans-les-des','orange']);
    assert.ok(available.tracks.every(track=>track.albumId==='57'&&track.album==='57'&&track.cover.endsWith('.webp')));
    f.level(11,33);assert.equal((await f.call()).data.tracks.length,8);
    assert.equal((await f.call('/api/playlists',{headers:{'X-WC-User':'12'}})).status,409);
  }finally{f.sql.close();}
});

test('owner-scoped CRUD persists cross-album order and uses revisions to protect changes from another device',async()=>{
  const f=setup();try{
    const tracks=['fais-mieux','13h20','la-matiere-dense'];
    const created=await f.call('/api/playlists',{token:'qa25',method:'POST',body:{name:'  Mes trajectoires  ',tracks,user_id:12}});
    assert.equal(created.status,201);
    const playlist=created.data.playlist;assert.equal(playlist.name,'Mes trajectoires');assert.equal(playlist.revision,1);assert.deepEqual(playlist.tracks,tracks);
    const path='/api/playlists/'+playlist.id;
    assert.deepEqual((await f.call('/api/playlists',{token:'qa11'})).data.playlists,[]);
    for(const method of ['PUT','DELETE'])assert.equal((await f.call(path,{token:'qa11',method,body:{name:'Steal',tracks:[],revision:1}})).status,404);
    const update=await f.call(path,{token:'qa25',method:'PUT',body:{name:'Nouvel ordre',tracks:tracks.toReversed(),revision:1}});
    assert.equal(update.status,200);assert.equal(update.data.playlist.revision,2);assert.deepEqual(update.data.playlist.tracks,tracks.toReversed());
    for(const method of ['PUT','DELETE']){
      const stale=await f.call(path,{token:'qa25',method,body:{name:'Stale',tracks:[],revision:1}});
      assert.equal(stale.status,409);assert.equal(stale.data.conflict,true);
    }
    assert.deepEqual((await f.call('/api/playlists',{token:'qa25'})).data.playlists,[update.data.playlist]);
    assert.equal((await f.call(path,{token:'qa25',method:'DELETE',body:{revision:2}})).status,200);
    assert.deepEqual((await f.call('/api/playlists',{token:'qa25'})).data.playlists,[]);
    assert.equal((await f.call(path,{token:'qa25',method:'DELETE',body:{revision:2}})).status,404);
  }finally{f.sql.close();}
});

test('edits reject locked or retired music, duplicates, invalid bodies and invalid names without losing a playlist',async()=>{
  const f=setup();try{
    const created=await f.call('/api/playlists',{method:'POST',body:{name:'Playlist'}}),path='/api/playlists/'+created.data.playlist.id;
    assert.deepEqual(created.data.playlist.tracks,[]);
    assert.equal((await f.call('/api/playlists',{method:'POST',body:{name:'Test',tracks:null}})).status,400);
    for(const tracks of [['les-probabilites'],['la-matiere-dense'],['fais-mieux'],['un-fil-entre-deux-infinis'],['wanheda'],['quand-je-vois-je-pense'],['unknown'],['orange','orange'],[{}],{},null]){
      assert.equal((await f.call(path,{method:'PUT',body:{name:'Test',tracks,revision:1}})).status,400,JSON.stringify(tracks));
    }
    for(const name of ['', '   ',123,null,'x'.repeat(81),'Some\u0000name','Some\nname'])assert.equal((await f.call(path,{method:'PUT',body:{name,tracks:[],revision:1}})).status,400);
    for(const revision of [0,-1,1.5,'1',null])assert.equal((await f.call(path,{method:'DELETE',body:{revision}})).status,400);
    for(const raw of ['{','[]','null'])assert.equal((await f.call('/api/playlists',{method:'POST',raw})).status,400);
    assert.equal((await f.call('/api/playlists',{method:'POST',raw:'{}',headers:{'Content-Type':'text/plain'}})).status,415);
    assert.equal((await f.call('/api/playlists',{method:'POST',body:{name:'x'.repeat(17000)},headers:{'Content-Length':'1'}})).status,413);
    assert.equal((await f.call(path,{method:'POST',body:{}})).status,405);
    assert.equal((await f.call('/api/playlists/999999',{method:'DELETE',body:{revision:1}})).status,404);
    assert.equal((await f.call()).data.playlists[0].revision,1);
  }finally{f.sql.close();}
});

test('a downgrade hides inaccessible tracks without rewriting saved order or granting old playback rights',async()=>{
  const f=setup();try{
    const tracks=['les-probabilites','30-vins-divins','la-matiere-dense'];
    const created=await f.call('/api/playlists',{token:'qa25',method:'POST',body:{name:'Mix',tracks}}),id=created.data.playlist.id;
    f.level(26,10);
    const current=await f.call('/api/playlists',{token:'qa25'});
    assert.equal(current.data.tracks.length,4);assert.deepEqual(current.data.playlists[0].tracks,['30-vins-divins']);
    assert.deepEqual(JSON.parse(f.sql.prepare('SELECT tracks FROM playlists WHERE id=?').get(id).tracks),tracks);
    assert.equal((await f.call('/api/playlists/'+id,{token:'qa25',method:'PUT',body:{name:'Mix',tracks,revision:1}})).status,400);
    f.level(26,9);assert.equal((await f.call('/api/playlists',{token:'qa25'})).status,403);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM playlists').get().n,1);
  }finally{f.sql.close();}
});

test('the per-account playlist cap is atomic and does not limit another owner',async()=>{
  const f=setup();try{
    for(let i=0;i<PLAYLIST_LIMIT-1;i++)assert.equal((await f.call('/api/playlists',{method:'POST',body:{name:'Playlist '+i}})).status,201);
    const simultaneous=await Promise.all([0,1].map(i=>f.call('/api/playlists',{method:'POST',body:{name:'Concurrent '+i}})));
    assert.deepEqual(simultaneous.map(result=>result.status).sort(),[201,409]);
    assert.equal((await f.call()).data.playlists.length,PLAYLIST_LIMIT);
    assert.equal((await f.call('/api/playlists',{token:'qa11',method:'POST',body:{name:'My list'}})).status,201);
  }finally{f.sql.close();}
});

test('schema creation is additive and idempotent; user deletion and offline reset planning include playlists',async()=>{
  const f=setup();try{
    f.sql.exec('DROP TABLE playlists');
    const created=await f.call('/api/playlists',{method:'POST',body:{name:'Persisted',tracks:['orange']}});assert.equal(created.status,201);
    const migration=readFileSync(new URL('../migrations/0045_playlists.sql',import.meta.url),'utf8');
    f.sql.exec(migration);f.sql.exec(migration);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM playlists').get().n,1);
    assert.equal(accountResetPlan(f.sql).report.tables.playlists,1);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM playlists').get().n,1);
    f.sql.exec('PRAGMA foreign_keys=ON;DELETE FROM users WHERE id=11');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM playlists').get().n,0);
  }finally{f.sql.close();}
});
