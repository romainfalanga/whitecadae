const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const source=readFileSync(require('node:path').join(__dirname,'../public/echelon.js'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};

async function fixture(pathname){
  const events=[],frames=[],guess=deferred(),session=deferred(),state={user:{id:7}};
  let sessionGuard;
  const p={id:pathname==='/sans-vin-divin'?'eg-22':pathname==='/signes/horloge'?'eg-11':'eg-02',kind:pathname==='/signes'?'riddle':'workshop'};
  const box={classList:{remove(){},toggle(){},add(){}},lastElementChild:{},textContent:''};
  const anchor={getBoundingClientRect:()=>({top:50}),scrollIntoView:()=>events.push('scroll'),querySelector:()=>({focus:()=>events.push('focus')})};
  const document={title:'',querySelector:()=>box,getElementById(id){
    if(id==='eg-game-content'){events.push('territory');return {};}
    if(id===p.id)return anchor;
    if(id==='eg-feedback')return box;
    return null;
  }};
  const initial={pages:[{id:'eg-10'},{id:'eg-22',open:false}],nodes:[],echelon:1,capabilities:{},attenteMs:0};
  const window={scrollY:0,scrollBy:()=>events.push('scroll')};
  const context={window,document,state,app:{innerHTML:''},location:{pathname,hash:''},esc:String,newEpoch:()=>1,stale:()=>false,
    requestAnimationFrame:fn=>frames.push(fn),
    api:async path=>path==='/api/signes/guess'?(events.push('guess'),guess.promise):structuredClone(initial),
    refreshSession:options=>{sessionGuard=options?.isCurrent;events.push('session');return session.promise;},renderNav:()=>events.push('nav'),
    WCGameFeedback:{mount:()=>({show:g=>events.push('gain:'+g),dispose:()=>events.push('dispose')})},
    WCAttemptTimer:{mount:()=>({blocked:()=>false,start:()=>events.push('start'),sync:ms=>events.push('deadline:'+ms),refresh:()=>events.push('refresh'),dispose(){}})}};
  // Expose the real shared submission handler without changing its implementation.
  vm.runInNewContext(source.replace('return {page,leave,clear()', 'return {page,leave,submit,clear()'),context);
  await window.WCGame.page();events.length=0;
  return {game:window.WCGame,p,events,frames,guess,session,state,box,sessionCurrent:()=>sessionGuard?.(),result:(extra={})=>({ok:true,gained:1,state:{...initial,echelon:2,attenteMs:32000},...extra})};
}

for(const path of ['/signes','/signes/horloge','/sans-vin-divin'])test(path+' paints only the confirmed gain before territory work and completes while session refresh is pending',async()=>{
  const f=await fixture(path),pending=f.game.submit(f.p,{answer:'confirmed'});
  assert.deepEqual(f.events,['start','guess']);
  f.guess.resolve(f.result());await settle();
  assert.deepEqual(f.events,['start','guess','deadline:32000','gain:1']);
  assert.equal(f.frames.length,1);
  f.frames.shift()();await settle();
  assert.equal(f.events.includes('territory'),false,'first frame can paint the celebration');
  f.frames.shift()();await pending;
  assert.equal(f.events.filter(e=>e==='gain:1').length,1);
  assert.ok(f.events.indexOf('gain:1')<f.events.indexOf('territory'));
  assert.ok(f.events.indexOf('gain:1')<f.events.indexOf('session'));
  assert.equal(f.sessionCurrent(),true,'background refresh receives the same account/navigation guard');
  assert.equal(f.events.at(-1),'refresh','attempt finishes without waiting for session/music');
  assert.equal(f.events.includes('nav'),false);
  f.session.reject(new Error('unrelated music refresh failed'));await settle();
  assert.equal(f.box.lastElementChild.textContent,undefined,'background failure cannot replace a confirmed result');
});

test('a rejected, incorrect, duplicate or partial answer never creates a celebration',async()=>{
  for(const result of [new Error('offline'),{ok:false,gained:0,message:'Incorrect'},{ok:true,gained:0,message:'Already found'},{ok:true,gained:0,message:'Part found'}]){
    const f=await fixture('/signes'),pending=f.game.submit(f.p,{});
    if(result instanceof Error)f.guess.reject(result);else f.guess.resolve(f.result(result));
    await pending;
    assert.equal(f.events.some(e=>e.startsWith('gain:')),false);
    assert.equal(f.events.includes('session'),false);
    assert.equal(f.frames.length,0);
    assert.equal(f.box.lastElementChild.textContent,result.message);
  }
});

test('navigation and account changes discard late confirmations, frame continuations and navigation refreshes',async()=>{
  for(const stage of ['request','paint','session'])for(const action of ['leave','account']){
    const f=await fixture('/signes'),pending=f.game.submit(f.p,{});
    const change=()=>action==='leave'?f.game.leave():(f.state.user={id:8});
    if(stage==='request')change();
    f.guess.resolve(f.result());await settle();
    if(stage!=='request'){
      if(stage==='paint')change();
      f.frames.shift()();f.frames.shift()();
    }
    await pending;
    if(stage==='session')change();
    if(stage==='session')assert.equal(f.sessionCurrent(),false);
    f.session.resolve();await settle();
    assert.equal(f.events.includes('nav'),false,stage+' '+action);
    if(stage==='request')assert.equal(f.events.includes('gain:1'),false);
    if(stage==='paint')assert.equal(f.events.includes('territory'),false);
  }
});
