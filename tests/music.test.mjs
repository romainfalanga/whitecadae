import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {JULY} from '../src/music-catalogue.js';

test('18 juillet catalogue, lyrics, corpus and audio are gated by five actual answers',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO users(id,email,username,password_hash,is_admin) VALUES(1,'low@test','Low','unused',0),(2,'high@test','High','unused',0),(3,'admin@test','Admin','unused',1);
    INSERT INTO sessions(token,user_id,expires_at) VALUES('low',1,'2099-01-01'),('high',2,'2099-01-01'),('admin',3,'2099-01-01');
    INSERT INTO albums(id,title,slug,position) VALUES(1,'18 juillet 2019','18-juillet-2019',1),(2,'57','57',2);
    INSERT INTO songs(id,album_id,title,slug,track_number) VALUES
    (1,1,'Wanheda','wanheda',1),(2,1,'Quand je vois je pense','quand-je-vois-je-pense',2),(3,1,'Ma folie','ma-folie',3),
    (4,1,'Un fil entre deux infinis','un-fil-entre-deux-infinis',4),(5,1,'Rendors-toi','rendors-toi',5),(6,2,'Orange','orange',4);
    INSERT INTO lyric_lines(song_id,line_number,text) VALUES(1,1,'Protected verse'),(3,1,'Retired verse'),(6,1,'Public verse');
    CREATE TABLE IF NOT EXISTS riddle_progress(user_id INTEGER,riddle_id TEXT,solved_at TEXT,PRIMARY KEY(user_id,riddle_id));`);
  const ids=['n-0-1','n-0-3','eg-02-1','eg-02-2','eg-01-1'];
  for(const [id,count]of [[1,4],[2,5]])for(const answer of ids.slice(0,count))db.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,CURRENT_TIMESTAMP)').run(id,answer);
  function prepare(q,args=[]){const params=()=>Object.fromEntries(args.map((v,i)=>[String(i+1),v]));return{
    bind(...values){return prepare(q,values);},async first(){return db.prepare(q).get(params())||null;},async all(){return{results:db.prepare(q).all(params())};},async run(){return{meta:db.prepare(q).run(params())};}
  };}
  let assetReads=0;
  const env={DB:{prepare,async batch(qs){db.exec('BEGIN');try{const out=[];for(const q of qs)out.push(await q.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},ASSETS:{async fetch(){assetReads++;return new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Type':'audio/mpeg'}});}}};
  const call=(path,session,headers={})=>worker.fetch(new Request('https://test'+path,{headers:{...(session?{Cookie:'wc_session='+session}:{}),...headers}}),env);
  for(const session of [null,'low','expired','high','admin']){
    const allowed=['high','admin'].includes(session);
    const music=await(await call('/api/music',session)).json();assert.equal(music.albums.length,allowed?1:0);
    if(allowed)assert.deepEqual(music.albums[0].tracks.map(t=>t.slug),JULY.tracks.map(t=>t.slug));
    const albums=await(await call('/api/albums',session)).json();
    assert.equal(albums.albums.at(-1).title,'Meta moi');assert.equal(albums.orphans.length,0);
    const july=albums.albums.find(a=>a.slug==='18-juillet-2019');assert.equal(!!july,allowed);
    if(allowed){assert.deepEqual(july.songs.map(s=>s.slug),JULY.tracks.map(t=>t.slug));assert.deepEqual(july.songs.map(s=>s.track_number),[1,2,3]);}
    for(const t of JULY.tracks){
      assert.equal((await call('/api/songs/'+t.slug,session)).status,allowed?200:403);
      const before=assetReads;
      const audio=await call(t.src,session,{Range:'bytes=1-2'});assert.equal(audio.status,allowed?206:403);
      assert.match(audio.headers.get('cache-control'),/no-store/);
      if(allowed){assert.equal(audio.headers.get('content-range'),'bytes 1-2/4');assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())],[2,3]);}
      else assert.equal(assetReads,before);
    }
    assert.equal((await call('/api/songs/ma-folie',session)).status,404);
    assert.equal((await call('/api/songs/rendors-toi',session)).status,404);
    assert.equal((await call('/api/songs/orange',session)).status,200);
    const corpus=await(await call('/api/corpus',session)).json();
    assert.ok(!JSON.stringify(corpus).includes('Retired verse'));
    assert.equal(JSON.stringify(corpus).includes('Protected verse'),allowed);
  }
  assert.equal((await call('/music/18-juillet-2019/wanheda.mp3','low',{Range:'bytes=0-1'})).status,403);
  db.close();
});
