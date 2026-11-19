import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,setEarnedLevel} from './community-fixture.mjs';
import worker from '../src/index.js';
import {openBranches,openLogeRooms,gameMasterBlancTier,sharedBranches} from '../public/video-model.js';

const video=(extra={})=>({title:'Une vidéo',entryType:'creation',medium:'vidéo',url:'https://www.youtube.com/watch?v=M7lc1UVf-VE',videoBranch:'self',precision:'day',date:'2026-09-29',kind:'autre',impact:'à explorer',themes:[],work:'',revision:0,...extra});
// Session qaN signs in member N+1.
function setup(){
  const f=fixture();f.sql.exec('PRAGMA foreign_keys=ON');
  f.call=async(path,session,method='GET',body)=>{const r=await worker.fetch(new Request('https://test.local'+path,{method,headers:{Cookie:'wc_session=qa'+session,'X-WC-User':String(session+1),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env);return {status:r.status,data:await r.json().catch(()=>null)};};
  f.ok=async(...args)=>{const r=await f.call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
  f.agree=session=>f.ok('/api/private/consent',session,'POST',{consent:true,version:'2026-10-01'});
  return f;
}
const branchesOf=data=>[...new Set(data.events.map(event=>event.video_branch))].sort();

test('the rule: two categories with Game Master Blanc, Idées et projets at 24, Réflexions at 30',()=>{
  assert.deepEqual(openBranches(15),['self','society']);assert.deepEqual(openBranches(23),['self','society']);
  assert.deepEqual(openBranches(24),['self','projects','society']);assert.deepEqual(openBranches(30),['self','ideas','projects','society']);
  assert.deepEqual(openLogeRooms(20),['society']);assert.deepEqual(openLogeRooms(24),['projects','society']);assert.deepEqual(openLogeRooms(30),['ideas','projects','society']);
  assert.deepEqual([14,15,23,24,29,30,33].map(gameMasterBlancTier),[0,1,1,2,2,3,3]);
  assert.deepEqual(sharedBranches(20,33),['self','society']);assert.deepEqual(sharedBranches(33,24),['self','projects','society']);
});

test('videography, an AS’s videography, the loges and Game Master Blanc follow the echelon',async()=>{
  const f=setup();try{
    // Member 23 is at 33 with a video in every category; member 21 starts at 20.
    setEarnedLevel(f,23,33);setEarnedLevel(f,21,20);await f.agree(22);await f.agree(20);
    for(const branch of ['self','ideas','projects','society'])await f.ok('/api/life-tree/events/video-'+branch,22,'PUT',video({videoBranch:branch}));
    assert.deepEqual(branchesOf(await f.ok('/api/life-tree?videos=1',22)),['ideas','projects','self','society']);
    // At 20, only Métacognition and Ma société harmonieuse exist.
    assert.equal((await f.call('/api/life-tree/events/own-project',20,'PUT',video({videoBranch:'projects'}))).status,403);
    assert.equal((await f.call('/api/life-tree?videos=1&branch=projects',20)).status,403);
    await f.ok('/api/life-tree/events/own-society',20,'PUT',video({videoBranch:'society'}));
    const me=await f.ok('/api/me',20);assert.deepEqual(me.access.videoBranches,['self','society']);assert.deepEqual(me.access.logeRooms,['society']);assert.equal(me.access.gameMasterBlancTier,1);
    // The two become AS: each sees the other's categories both have reached.
    const id=crypto.randomUUID();await f.ok('/api/ace-circles/invitations',22,'POST',{id,target:21,recipientNotice:true});await f.ok('/api/ace-circles/invitations/'+id,20,'PUT',{action:'accept'});
    assert.deepEqual(branchesOf(await f.ok('/api/life-tree?videos=1&owner=23',20)),['self','society']);
    assert.equal((await f.call('/api/life-tree?videos=1&owner=23&branch=ideas',20)).status,403);
    assert.equal((await f.call('/api/life-tree/events/video-ideas?owner=23',20)).status,404);
    const square=await f.ok('/api/ace-circles',22);assert.deepEqual(square.circles[0].members.find(m=>m.id===21).branches,['self','society']);
    const topics=await f.ok('/api/ace-circles/23/topics',20);assert.ok(topics.topics.every(topic=>['self','society'].includes(topic.videoBranch)));
    // The loges: only Ma société harmonieuse at 20.
    const loge=await f.ok('/api/loge',20);assert.equal(loge.loge,'society');assert.deepEqual(loge.loges,['society']);
    for(const room of ['projects','ideas'])assert.equal((await f.call('/api/loge?loge='+room,20)).status,403);
    const blanc=await f.ok('/api/game-master-blanc',20);assert.equal(blanc.tier,1);assert.equal(blanc.tiers.length,1);
    assert.ok(!blanc.page.sections.some(section=>section.title==='Tes idées et tes projets'));
    // At 24: Idées et projets everywhere, and Game Master Blanc II.
    setEarnedLevel(f,21,24);
    assert.deepEqual(branchesOf(await f.ok('/api/life-tree?videos=1&owner=23',20)),['projects','self','society']);
    assert.equal((await f.ok('/api/loge?loge=projects',20)).loge,'projects');assert.equal((await f.ok('/api/loge',20)).loge,'projects');
    assert.equal((await f.call('/api/loge?loge=ideas',20)).status,403);
    const second=await f.ok('/api/game-master-blanc',20);assert.equal(second.tier,2);assert.deepEqual(second.tiers.map(t=>t.tier),[1,2]);
    const titles=second.page.sections.map(section=>section.title);
    assert.deepEqual(titles,['Vidéographie','Métacognition','Ta société harmonieuse','Tes idées et tes projets','Loges virtuelles']);
    assert.deepEqual(second.tiers[0].page.sections.map(section=>section.title),['Vidéographie','Métacognition','Ta société harmonieuse','Loges virtuelles']);
    // At 30: Réflexions and Game Master Blanc III.
    setEarnedLevel(f,21,30);
    assert.deepEqual(branchesOf(await f.ok('/api/life-tree?videos=1&owner=23',20)),['ideas','projects','self','society']);
    assert.equal((await f.ok('/api/loge?loge=ideas',20)).loge,'ideas');
    const third=await f.ok('/api/game-master-blanc',20);assert.equal(third.tier,3);
    // Each tier writes its own Loges virtuelles section: helping each other with
    // ideas and projects comes only with III.
    const loges=third.tiers.map(t=>t.page.sections.at(-1));
    assert.ok(loges.every(section=>section.title==='Loges virtuelles'&&section.paragraphs.length===3));
    assert.deepEqual(loges.map(section=>section.paragraphs.join(' ').includes('Aidez-vous les uns les autres à développer et concrétiser vos idées et vos projets.')),[false,false,true]);
    assert.match(loges[0].paragraphs[1],/société harmonieuse/);
    const ideas=third.page.sections.find(section=>section.title==='Tes idées et tes projets'),reflections=third.page.sections.find(section=>section.title==='Tes réflexions');
    assert.deepEqual(ideas.paragraphs,['Extériorise tes idées et tes projets dans ta vidéographie.','Revisualise tes vidéos pour prendre du recul sur eux et les améliorer.']);
    assert.doesNotMatch(reflections.paragraphs.join(' '),/version harmonieuse|société harmonieuse/);assert.match(reflections.paragraphs[0],/vidéographie/);
    assert.deepEqual(third.page.sections.map(section=>section.title),['Vidéographie','Métacognition','Ta société harmonieuse','Tes idées et tes projets','Tes réflexions','Loges virtuelles']);
    // Exchanges about a Réflexions video stay closed to an AS below 30:
    // the topic, its messages and the unread count all follow the category.
    const topic=(await f.ok('/api/life-tree/events/video-ideas',22)).event.topic_id;
    await f.ok('/api/ace-circles/topics/'+topic+'/replies',22,'POST',{id:crypto.randomUUID(),text:'Une expansion sur une réflexion'});
    const seen=async()=>JSON.stringify(await f.ok('/api/ace-circles/23/messages',20)).includes('Une expansion sur une réflexion');
    assert.equal(await seen(),true,'visible at 30');
    // An AS below 30 still keeps member 23's Réflexions closed to them, and theirs to 23.
    setEarnedLevel(f,21,24);
    assert.equal(await seen(),false,'hidden at 24');
    assert.equal((await f.call('/api/ace-circles/topics/'+topic,20)).status,404);
    const circle=(await f.ok('/api/ace-circles',20)).circles.find(c=>c.owner.id===23);assert.equal(circle?.unread||0,0);
    assert.deepEqual((await f.ok('/api/ace-circles',22)).circles[0].members.find(m=>m.id===21).branches,['self','projects','society']);
  }finally{f.sql.close();}
});
