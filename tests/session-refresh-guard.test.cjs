const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const source=readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
const refreshSource=source.slice(source.indexOf('async function refreshSession('),source.indexOf('\nfunction accountDestination()'));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function fixture(){
  const me=deferred(),music=deferred(),calls=[],albums=[],accountEvents=[];
  const state={user:{id:7},access:{loge:false},gameEchelon:1,echelon:1,attenteMs:0};
  let mounted=true;
  const context={state,observedAccount:7,accountChannel:{postMessage:event=>accountEvents.push(event)},window:{},
    WCPlayer:{setPlaylistAccess(){},setAlbums:value=>albums.push(value)},
    isCurrent:()=>mounted&&state.user?.id===7,
    api:async path=>{calls.push(path);return path==='/api/me'?me.promise:music.promise;}};
  vm.createContext(context);vm.runInContext(refreshSource,context);
  return {me,music,state,calls,albums,accountEvents,context,leave:()=>mounted=false,
    run:()=>vm.runInContext('refreshSession({isCurrent})',context),
    fresh:{user:{id:7},access:{loge:true},gameEchelon:33,echelon:7,attenteMs:12000}};
}

for(const stage of ['me','music'])for(const outcome of ['success','failure'])for(const change of ['navigation','account'])test(`guarded refresh discards ${stage} ${outcome} after ${change} changes`,async()=>{
  const f=fixture(),pending=f.run();
  if(stage==='music'){f.me.resolve(f.fresh);await settle();assert.deepEqual(f.calls,['/api/me','/api/music']);}
  if(change==='navigation')f.leave();else f.state.user={id:8};
  const snapshot=structuredClone(f.state),dependency=stage==='me'?f.me:f.music;
  if(outcome==='success')dependency.resolve(stage==='me'?f.fresh:{albums:['old-account-song']});else dependency.reject(new Error('offline'));
  await pending;
  assert.deepEqual(f.state,snapshot,'late session state cannot replace the current account or page');
  assert.deepEqual(f.albums,[],'late music cannot reintroduce albums or clear the current catalogue');
  assert.deepEqual(f.accountEvents,[]);
  if(stage==='me')assert.deepEqual(f.calls,['/api/me'],'stale member data never starts a music request');
});

test('a current guarded refresh retains the normal member/access/music update',async()=>{
  const f=fixture(),pending=f.run();f.me.resolve(f.fresh);await settle();
  assert.equal(f.state.gameEchelon,33);assert.equal(f.state.access.loge,true);
  f.music.resolve({albums:['newly-unlocked']});await pending;
  assert.deepEqual(f.albums,[['newly-unlocked']]);
});

test('existing callers without a guard retain failure handling and refresh the catalogue',async()=>{
  const f=fixture(),pending=vm.runInContext('refreshSession()',f.context);
  f.me.reject(new Error('expired session'));await settle();
  assert.equal(f.state.user,null);assert.equal(f.state.gameEchelon,1);
  f.music.resolve({albums:['public']});await pending;
  assert.deepEqual(f.albums,[['public']]);
  assert.equal(f.accountEvents.length,1);
});
