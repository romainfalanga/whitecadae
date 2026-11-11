import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,setEarnedLevel} from './community-fixture.mjs';
import worker from '../src/index.js';

const video=(extra={})=>({title:'Une réflexion',entryType:'creation',medium:'vidéo',url:'https://www.youtube.com/watch?v=M7lc1UVf-VE',videoBranch:'self',kind:'autre',impact:'à explorer',themes:[],revision:0,...extra});
function setup(){
  const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');for(const id of [16,19])setEarnedLevel(f,id,15);
  f.call=async(path,level=15,method='GET',body)=>{const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+level,'X-WC-User':String(level+1),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);return {status:r.status,data:await r.json()};};
  f.ok=async(...args)=>{const r=await f.call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
  return f;
}

test('a sériographie keeps a title and an ordered list of the member’s own videos, sealed at rest',async()=>{
  const f=setup();try{
    for(const id of ['video-aaaa1','video-bbbb2','video-cccc3'])await f.ok('/api/life-tree/events/'+id,15,'PUT',video({title:'Titre '+id}));
    const created=(await f.ok('/api/life-tree/series/serie-0001',15,'PUT',{title:'Mon été',items:['video-cccc3','video-aaaa1'],revision:0})).series;
    assert.deepEqual(created.items,['video-cccc3','video-aaaa1']);assert.equal(created.revision,1);
    assert.doesNotMatch(f.sql.prepare('SELECT payload FROM life_series').get().payload,/Mon été|video-cccc3/);
    const listed=(await f.ok('/api/life-tree/series')).series;assert.deepEqual(listed.map(s=>[s.title,s.items]),[['Mon été',['video-cccc3','video-aaaa1']]]);
    const updated=(await f.ok('/api/life-tree/series/serie-0001',15,'PUT',{title:'Mon été 2026',items:['video-aaaa1','video-bbbb2','video-cccc3'],revision:1})).series;assert.equal(updated.revision,2);
    assert.equal((await f.call('/api/life-tree/series/serie-0001',15,'PUT',{title:'Ancienne',items:['video-aaaa1'],revision:1})).status,409,'a stale edit never overwrites');
    // A deleted video leaves the series; the others keep their order.
    await f.ok('/api/life-tree/events/video-bbbb2',15,'DELETE',{revision:1});
    assert.deepEqual((await f.ok('/api/life-tree/series')).series[0].items,['video-aaaa1','video-cccc3']);
    assert.equal((await f.call('/api/life-tree/series/serie-0001',15,'DELETE',{revision:1})).status,409);
    await f.ok('/api/life-tree/series/serie-0001',15,'DELETE',{revision:2});assert.deepEqual((await f.ok('/api/life-tree/series')).series,[]);
  }finally{f.sql.close();}
});

test('sériographies reject foreign, missing or empty selections and stay private to their author',async()=>{
  const f=setup();try{
    await f.ok('/api/life-tree/events/video-mine1',15,'PUT',video());await f.ok('/api/life-tree/events/video-them1',18,'PUT',video());
    for(const [body,status] of [[{title:'X',items:['video-them1'],revision:0},409],[{title:'X',items:['absent-0001'],revision:0},409],[{title:'X',items:[],revision:0},400],[{title:'',items:['video-mine1'],revision:0},400],[{title:'X',items:Array.from({length:101},(_,i)=>'video-'+String(i).padStart(5,'0')),revision:0},400]]){
      assert.equal((await f.call('/api/life-tree/series/serie-0002',15,'PUT',body)).status,status,JSON.stringify(body).slice(0,60));
    }
    assert.equal(f.sql.prepare('SELECT count(*) n FROM life_series').get().n,0);
    await f.ok('/api/life-tree/series/serie-0002',15,'PUT',{title:'À moi',items:['video-mine1'],revision:0});
    assert.equal((await f.call('/api/life-tree/series?owner=16',18)).status,403);
    assert.deepEqual((await f.ok('/api/life-tree/series',18)).series,[],'another member never sees it');
    assert.equal((await f.call('/api/life-tree/series/serie-0002',18,'DELETE',{revision:1})).status,200);assert.equal(f.sql.prepare('SELECT count(*) n FROM life_series').get().n,1,'and cannot delete it');
    assert.equal((await f.call('/api/life-tree/series',14)).status,403,'below the videography threshold');
    await f.ok('/api/life-tree',15,'DELETE',{confirm:'SUPPRIMER'});assert.equal(f.sql.prepare('SELECT count(*) n FROM life_series').get().n,0,'erasing the videography erases its sériographies');
  }finally{f.sql.close();}
});
