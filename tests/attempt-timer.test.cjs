const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const script=readFileSync(require('node:path').join(__dirname,'../public/attempt-timer.js'),'utf8');
function fixture(){
  let now=100000,interval=null,controlReads=0,read=async()=>({attenteMs:0});
  const listeners=new Map(),stored=new Map(),classes=new Set(),time={textContent:''},status={textContent:''};
  const controls=[{disabled:false,isConnected:true},{disabled:true,isConnected:true}];
  const badge={style:{setProperty(){}},hidden:true,querySelector:s=>s==='time'?time:status};
  const root={querySelector:()=>badge,querySelectorAll:()=>{controlReads++;return controls;},classList:{toggle(c,on){on?classes.add(c):classes.delete(c)},remove(c){classes.delete(c)}}};
  const document={hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
  const window={addEventListener:document.addEventListener,removeEventListener:document.removeEventListener};
  const context={window,document,Date:{now:()=>now},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},setInterval:f=>(interval=f,1),clearInterval:()=>interval=null};
  vm.runInNewContext(script,context);
  const mount=ms=>window.WCAttemptTimer.mount({root,userId:7,remainingMs:ms,readStatus:()=>read()});
  return {mount,badge,time,controls,stored,listeners,document,classes,setRead(fn){read=fn},advance(ms){now+=ms;interval?.()},get ticking(){return !!interval},get controlReads(){return controlReads}};
}
test('countdown locks all inputs, preserves drafts and intrinsic disabled states, and releases at 33 seconds',()=>{
  const f=fixture(),timer=f.mount(0);assert.equal(f.badge.hidden,true);
  timer.start();assert.equal(f.time.textContent,'0:33');assert.ok(f.controls.every(c=>c.disabled));
  f.controls.push({disabled:false,isConnected:true,value:'un brouillon'});timer.refresh();
  assert.ok(f.controls[2].disabled);f.advance(32999);assert.equal(f.time.textContent,'0:01');assert.ok(timer.blocked());
  f.advance(1);assert.equal(f.badge.hidden,true);assert.ok(!timer.blocked());assert.ok(!f.ticking);
  assert.deepEqual(f.controls.map(c=>c.disabled),[false,true,false]);assert.equal(f.controls[2].value,'un brouillon');
  timer.dispose();assert.equal(f.listeners.size,0);
});
test('navigation, storage events and returning from a hidden tab retain the same absolute deadline',()=>{
  const f=fixture();let timer=f.mount(0);timer.start();f.advance(10000);timer.dispose();
  // New route receives fresh DOM, like the real app.
  f.controls[0].disabled=false;timer=f.mount(23000);assert.equal(f.time.textContent,'0:23');
  f.listeners.get('storage')({key:'wc_attempt_until_7',newValue:'133000'});assert.equal(f.time.textContent,'0:23');
  f.document.hidden=true;f.listeners.get('visibilitychange')();assert.ok(!f.ticking);
  f.advance(24000);f.document.hidden=false;f.listeners.get('visibilitychange')();
  assert.equal(f.badge.hidden,true);assert.equal(f.controls[0].disabled,false);timer.dispose();
});
test('a stale status read cannot cancel a new attempt or a newer deadline from another tab',async()=>{
  const f=fixture(),timer=f.mount(0);let resolve;
  f.setRead(()=>new Promise(r=>resolve=r));const pending=f.listeners.get('focus')();
  timer.start();resolve({attenteMs:0});await pending;assert.equal(f.time.textContent,'0:33');assert.ok(timer.blocked());
  const next=f.listeners.get('focus')();f.listeners.get('storage')({key:'wc_attempt_until_7',newValue:'132000'});
  resolve({attenteMs:0});await next;assert.equal(f.time.textContent,'0:32');timer.dispose();
});
test('offline status reads keep the deadline, and disposal suppresses late callbacks',async()=>{
  const f=fixture(),timer=f.mount(12000);
  f.setRead(async()=>{throw Error('offline')});await f.listeners.get('focus')();assert.equal(f.time.textContent,'0:12');
  let resolve;f.setRead(()=>new Promise(r=>resolve=r));const pending=f.listeners.get('focus')();timer.dispose();
  resolve({attenteMs:33000});await pending;assert.ok(!f.ticking);assert.equal(f.listeners.size,0);assert.equal(f.classes.size,0);
});

test('countdown ticks never rescan or disable the form again between renders',()=>{
  const f=fixture(),timer=f.mount(0);timer.start();const reads=f.controlReads;
  for(let i=0;i<40;i++)f.advance(250);
  assert.equal(f.controlReads,reads);assert.equal(f.time.textContent,'0:23');
  f.controls.push({disabled:false,isConnected:true});timer.refresh();assert.ok(f.controls.at(-1).disabled);
  assert.equal(f.controlReads,reads+1);timer.dispose();
});
