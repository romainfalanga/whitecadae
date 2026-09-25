import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {JULY,FAIS_MIEUX,RELEASES} from '../src/music-catalogue.js';
import {NODES} from '../src/echelon.js';

test('every gated track opens with its lyrics, cover and direct audio at its own threshold',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO albums(id,title,slug,position) VALUES(1,'18 juillet 2019','18-juillet-2019',1),(2,'57','57',2),(4,'Fais mieux','114',4);
    INSERT INTO songs(id,album_id,title,slug,track_number) VALUES(100,1,'Ma folie','ma-folie',3),(101,1,'Rendors-toi','rendors-toi',5),(102,2,'Orange','orange',4);
    INSERT INTO lyric_lines(song_id,line_number,text) VALUES(100,1,'Retired verse'),(102,1,'Public verse');
    CREATE TABLE IF NOT EXISTS riddle_progress(user_id INTEGER,riddle_id TEXT,solved_at TEXT,PRIMARY KEY(user_id,riddle_id));`);
  let songId=1;
  for(const album of RELEASES)for(const [index,track] of album.tracks.entries()){
    db.prepare('INSERT INTO songs(id,album_id,title,slug,track_number) VALUES(?,?,?,?,?)').run(songId,album===JULY?1:4,track.title,track.slug,index+1);
    db.prepare('INSERT INTO lyric_lines(song_id,line_number,text) VALUES(?,1,?)').run(songId,'Protected verse '+track.slug);songId++;
  }
  const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
  const accounts=[...Array.from({length:15},(_,level)=>({level,session:'level'+level})),{level:0,session:'admin',admin:true}];
  for(const [index,account]of accounts.entries()){
    const userId=index+1;db.prepare('INSERT INTO users(id,email,username,password_hash,is_admin) VALUES(?,?,?,?,?)').run(userId,account.session+'@test',account.session,'unused',account.admin?1:0);
    db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(account.session,userId,'2099-01-01');
    for(const answer of ids.slice(0,account.level))db.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,CURRENT_TIMESTAMP)').run(userId,answer);
  }
  function prepare(q,args=[]){const params=()=>Object.fromEntries(args.map((v,i)=>[String(i+1),v]));return{
    bind(...values){return prepare(q,values);},async first(){return db.prepare(q).get(params())||null;},async all(){return{results:db.prepare(q).all(params())};},async run(){return{meta:db.prepare(q).run(params())};}
  };}
  let assetReads=0;
  const env={DB:{prepare,async batch(qs){db.exec('BEGIN');try{const out=[];for(const q of qs)out.push(await q.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},ASSETS:{async fetch(request){assetReads++;return new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Type':request.url.endsWith('.jpeg')?'image/jpeg':request.url.endsWith('.png')?'image/png':'audio/mpeg'}});}}};
  const call=(path,session,headers={})=>worker.fetch(new Request('https://test'+path,{headers:{...(session?{Cookie:'wc_session='+session}:{}),...headers}}),env);
  for(const {session,level,admin} of [{session:null,level:0},{session:'expired',level:0},...accounts]){
    const permitted=t=>admin||level>=t.minLevel;
    const music=await(await call('/api/music',session)).json();
    const expectedTracks=RELEASES.flatMap(album=>album.tracks.filter(permitted));
    assert.deepEqual(music.albums.flatMap(a=>a.tracks.map(t=>t.slug)),expectedTracks.map(t=>t.slug));
    assert.equal((await call('/api/journey',session)).status,410);
    const story=await call('/api/aa',session);assert.equal(story.status,410);assert.doesNotMatch(await story.text(),/Andromédien|dépersonnalisation/);
    const map=await call('/api/echelon/map',session);assert.equal(map.status,accounts.some(a=>a.session===session)?200:401);
    if(map.status===200){const data=await map.json();assert.deepEqual(data.openings.items.filter(i=>i.id.startsWith('music-')&&i.id!=='music-57'&&i.open).map(i=>i.id),expectedTracks.map(t=>'music-'+t.slug));}
    const catalogue=await(await call('/api/albums',session)).json();
    const corpus=JSON.stringify(await(await call('/api/corpus',session)).json());
    assert.doesNotMatch(corpus,/Retired verse/);
    for(const release of RELEASES){
      const tracks=release.tracks.filter(permitted),visible=tracks.length>0;
      const listed=catalogue.albums.find(a=>a.slug===release.lyricAlbums[0]);
      assert.equal(!!listed,visible,release.id+' '+session);
      if(visible){assert.equal(listed.title,release.album);assert.deepEqual(listed.songs.map(s=>s.slug),tracks.map(t=>t.slug));assert.deepEqual(listed.songs.map(s=>s.track_number),tracks.map((_,i)=>i+1));}
      const cover=await call(release.cover,session);assert.equal(cover.status,visible?200:403);assert.match(cover.headers.get('cache-control'),/no-store/);
      if(visible)assert.equal(cover.headers.get('content-type'),release.coverType);
      for(const track of release.tracks){
        const allowed=!!permitted(track);
        if(!allowed)assert.ok(!JSON.stringify(music).includes('"slug":"'+track.slug+'"'));
        const lyrics=await call('/api/songs/'+track.slug,session);assert.equal(lyrics.status,allowed?200:403);
        if(allowed){const body=await lyrics.json();assert.equal(body.song.album_title,release.album);assert.equal(body.song.title,track.title);assert.equal(body.lines[0].text,'Protected verse '+track.slug);}
        assert.equal(corpus.includes('Protected verse '+track.slug),allowed);
        const before=assetReads,audio=await call(track.src,session,{Range:'bytes=1-2'});assert.equal(audio.status,allowed?206:403);assert.match(audio.headers.get('cache-control'),/no-store/);
        if(allowed){assert.equal(audio.headers.get('content-range'),'bytes 1-2/4');assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())],[2,3]);}
        else assert.equal(assetReads,before);
      }
    }
    assert.equal((await call('/api/songs/ma-folie',session)).status,404);
    assert.equal((await call('/api/songs/rendors-toi',session)).status,404);
    assert.equal((await call('/api/songs/orange',session)).status,200);
  }
  assert.equal(FAIS_MIEUX.tracks[1].duration,93);
  assert.equal(db.prepare('SELECT count(*) AS n FROM lyric_lines WHERE song_id<100').get().n,6);
  db.close();
});
