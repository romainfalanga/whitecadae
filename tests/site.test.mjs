import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';

test('catalogue migration renames only the album and preserves its songs and lyrics', async () => {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE albums(id INTEGER PRIMARY KEY,title TEXT,slug TEXT,release_date TEXT,is_single INTEGER,position INTEGER);
    CREATE TABLE songs(id INTEGER PRIMARY KEY,album_id INTEGER,title TEXT,slug TEXT,track_number INTEGER);
    CREATE TABLE lyric_lines(id INTEGER PRIMARY KEY,song_id INTEGER,text TEXT);
    INSERT INTO albums VALUES(4,'114','114',NULL,0,4),(9,'114','different',NULL,0,9);
    INSERT INTO songs VALUES(13,4,'La matière danse','la-matiere-dense',1),(14,4,'Les probabilités','les-probabilites',2),(15,4,'Fais mieux','fais-mieux',3);
    INSERT INTO lyric_lines VALUES(1,15,'Paroles conservées');`);
  const env={DB:{prepare(query){return{async run(){return db.prepare(query).run();},async all(){return{results:db.prepare(query).all()};}};}}};
  for(let i=0;i<2;i++){
    const response=await worker.fetch(new Request('https://test.local/api/albums'),env);
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.albums.find(a=>a.id===4).title,'Fais mieux');
    assert.equal(data.albums.find(a=>a.id===9).title,'114');
    assert.deepEqual(data.albums.find(a=>a.id===4).songs.map(s=>s.id),[13,14,15]);
    assert.equal(data.albums.find(a=>a.id===4).songs[2].line_count,1);
  }
  assert.equal(db.prepare('SELECT text FROM lyric_lines WHERE id=1').get().text,'Paroles conservées');
  db.close();
});

test('MP3 serving handles bounded, open, suffix and invalid byte ranges', async () => {
  const env={ASSETS:{async fetch(){return new Response(new Uint8Array([0,1,2,3,4,5,6,7,8,9]),{headers:{'Content-Type':'audio/mpeg','Content-Length':'10','ETag':'"test"'}});}}};
  for (const [range,status,expected] of [['bytes=2-4',206,[2,3,4]],['bytes=7-',206,[7,8,9]],['bytes=-2',206,[8,9]],['bytes=9-99',206,[9]],['bytes=10-',416,[]],['bytes=4-2',416,[]],['bytes=-0',416,[]]]) {
    const res=await worker.fetch(new Request('https://test.local/music/57/orange.mp3',{headers:{Range:range}}),env);
    assert.equal(res.status,status,range); assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],expected);
  }
  const res=await worker.fetch(new Request('https://test.local/music/57/orange.mp3',{headers:{Range:'bytes=1-2','If-Range':'"old"'}}),env);
  assert.equal(res.status,200);assert.equal((await res.arrayBuffer()).byteLength,10);
});

test('retired contribution writes return 410 before touching the database', async () => {
  const env={get DB(){throw new Error('No database access allowed');}};
  for (const [method,url] of [['POST','annotations'],['PUT','annotations/7'],['POST','annotations/7/references'],['POST','passage-references'],['POST','connections'],['POST','essays'],['PUT','essays/7'],['PATCH','references/7']]) {
    const res=await worker.fetch(new Request(`https://test.local/api/${url}`,{method}),env);
    assert.equal(res.status,410,`${method} ${url}`);
  }
});

test('removed spaces reject old clients while video and conversation routes stay available', async () => {
  const env={get DB(){throw new Error('Retired spaces must not access stored data');}};
  for (const path of ['/api/carre','/api/carre/1/conversation','/api/societes/1','/api/brainstorms/2/idees','/api/114']) {
    for (const method of ['GET','POST','PUT','DELETE']) {
      const response=await worker.fetch(new Request('https://test.local'+path,{method}),env);
      assert.equal(response.status,410,`${method} ${path}`);
    }
  }
  const listing=await worker.fetch(new Request('https://test.local/api/arbres?kind=pensee'),env);
  assert.equal(listing.status,410);
  const creation=await worker.fetch(new Request('https://test.local/api/arbres',{method:'POST',body:JSON.stringify({kind:'pensee',title:'Retired'})}),env);
  assert.equal(creation.status,410);
  const video=await worker.fetch(new Request('https://test.local/api/videographie/rythme'),env);
  assert.equal(video.status,403); // Existing authentication gate, not a removed page.
  const conversation=await worker.fetch(new Request('https://test.local/api/conversation'),env);
  assert.equal(conversation.status,401);
  const me=await worker.fetch(new Request('https://test.local/api/me'),env);
  const state=await me.json();
  for(const key of ['penseMieux','carre','brainstorm','cent14'])assert.equal(state.access[key],false);
});

test('lyrics API only reads the public song and ordered lyric lines', async () => {
  const queries=[];
  const env={DB:{prepare(sql){queries.push(sql);return {bind(){return this;},async first(){return {id:1,title:'Orange',slug:'orange'};},async all(){return {results:[{id:1,line_number:1,text:'Test'}]};}};}}};
  const res=await worker.fetch(new Request('https://test.local/api/songs/orange'),env);
  assert.equal(res.status,200); assert.deepEqual(Object.keys(await res.json()),['song','lines']);
  assert.equal(queries.length,2); assert.ok(queries[1].includes('ORDER BY line_number'));
  assert.ok(queries.every(q=>!/(annotations|sessions|essays)/.test(q)));
});

test('service worker leaves audio, Range requests and API responses out of its cache', async () => {
  const handlers={}; let writes=0;
  const self={location:{origin:'https://test.local'},addEventListener:(k,v)=>handlers[k]=v};
  const context=vm.createContext({self,URL,Response,fetch:async()=>new Response('partial',{status:206}),caches:{open:async()=>({put:async()=>{writes++;}})}});
  vm.runInContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
  for(const [p,headers,destination] of [['/music/57/orange.mp3',{},'audio'],['/other.mp3',{range:'bytes=0-100'},'']]) {
    let intercepted=false;
    handlers.fetch({request:{url:`https://test.local${p}`,method:'GET',headers:new Headers(headers),destination},respondWith(){intercepted=true;}});
    assert.equal(intercepted,false);
  }
  let response;
  handlers.fetch({request:{url:'https://test.local/styles.css',method:'GET',headers:new Headers()},respondWith(p){response=p;},waitUntil(){}});
  await response; assert.equal(writes,0);
});
