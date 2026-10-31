import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import worker from '../src/index.js';
import {contentAccess,buildOpenings,newlyOpened} from '../src/content-access.js';
import {buildOrange} from '../src/orange-access.js';
import {handlePlaylists} from '../src/playlists.js';
import {handlePlaylistAudio} from '../src/playlist-audio.js';
import {NODES} from '../src/echelon.js';
import {fixture} from './community-fixture.mjs';

const ids=NODES.flatMap(node=>node.answers.map(answer=>answer.id));
const rows=level=>ids.slice(0,level-1).map(riddle_id=>({riddle_id,solved_at:'now'}));

test('suspended Playlist is absent from every score, home, reward and administrator opening',()=>{
  for(let level=1;level<=33;level++)for(const user of [null,{id:11},{id:100,is_admin:true}]){
    const progress=rows(level);
    assert.equal(contentAccess(user,progress).playlist,false);
    const rendered=[buildOpenings(progress,user),buildOrange(progress,user),newlyOpened(progress,rows(Math.min(33,level+1)),user)];
    assert.doesNotMatch(JSON.stringify(rendered),/playlist/i,'level '+level);
  }
});

test('production Playlist and audio endpoints refuse every account without changing saved playlists or reading assets',async()=>{
  const f=fixture();try{
    for(const id of ids)f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(11,?,?)').run(id,'now');
    f.sql.prepare('INSERT INTO playlists(user_id,name,tracks) VALUES(11,?,?)').run('Keep this saved playlist',JSON.stringify(['13h20','orange']));
    const before=f.sql.prepare('SELECT * FROM playlists ORDER BY id').all();
    f.env.ASSETS={fetch(){throw Error('Disabled transport must not read assets');}};
    for(const token of ['invalid','qa9','qa10','qa99']){
      for(const [path,method]of [
        ['/api/playlists','GET'],['/api/playlists','POST'],['/api/playlists/1','PUT'],['/api/playlists/1','DELETE'],
        ['/api/playlists/audio?tracks=13h20,orange','GET'],['/api/playlists/audio?tracks=13h20','HEAD'],
        ['/api/playlists?enabled=true&playlistsEnabled=true&level=33&admin=true','GET'],
        ['/music/playlist/orange.mp3','GET']
      ]){
        const mutation=['POST','PUT','DELETE'].includes(method);
        const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session='+token,...(mutation?{'Content-Type':'application/json'}:{})},...(mutation?{body:JSON.stringify({name:'Overwrite',tracks:[],revision:1,playlistsEnabled:true})}:{})}),f.env);
        assert.equal(response.status,404,token+' '+method+' '+path);
        assert.match(response.headers.get('Cache-Control'),/no-store/);
      }
      const me=await(await worker.fetch(new Request('https://test.local/api/me',{headers:{Cookie:'wc_session='+token}}),f.env)).json();
      assert.equal(me.access.playlist,false);
      const home=await(await worker.fetch(new Request('https://test.local/api/orange',{headers:{Cookie:'wc_session='+token}}),f.env)).json();
      assert.doesNotMatch(JSON.stringify(home),/playlist/i);
    }
    assert.deepEqual(f.sql.prepare('SELECT * FROM playlists ORDER BY id').all(),before);
  }finally{f.sql.close();}
});

test('default suspended handlers return before reading authentication, database or media',async()=>{
  const env={get DB(){throw Error('Must not read DB');},get ASSETS(){throw Error('Must not read ASSETS');}};
  const deps={getUser(){throw Error('Must not read account');},json:(body,status)=>Response.json(body,{status})};
  for(const [handler,path]of [[handlePlaylists,'/api/playlists'],[handlePlaylistAudio,'/api/playlists/audio?tracks=orange']]){
    const request=new Request('https://test.local'+path);
    assert.equal((await handler(request,env,new URL(request.url),deps)).status,404);
  }
});

test('direct and nested Playlist URLs return home without loading its saved page code',async()=>{
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const route=source.slice(source.indexOf('async function route()'),source.indexOf('\nfunction renderNav()'));
  for(const pathname of ['/playlist','/playlist/','/playlist/saved']){
    const calls=[];
    await runInNewContext(route+'\nroute()',{window:{scrollTo(){}},document:{body:{classList:{remove(){}}}},location:{pathname,hash:''},closeNav(){},coupePageTimer(){},newEpoch(){},renderNav(){},navigate:(...args)=>calls.push(args)});
    assert.deepEqual(calls,[['/',true]],pathname);
  }
});
