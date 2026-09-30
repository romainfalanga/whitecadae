import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(available=true){
  let contextRequests=0,draws=0,releases=0,observer;
  const pending=new Map(),loading=[];let next=0;
  const gl=new Proxy({
    getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,
    drawArrays(){draws++;},getExtension:()=>({loseContext(){releases++;}}),
  },{get(target,key){return key in target?target[key]:()=>({});}});
  const nodes=[1,8,9].map(level=>({dataset:{stellar:'28',starSeed:String(level)},isConnected:true,children:[],classList:{add(){}},append(image){this.children.push(image);}}));
  const canvas={getContext(){contextRequests++;return available?gl:null;},toDataURL:()=> 'data:image/webp;base64,local-fixture'};
  const idle=callback=>{const id=++next;pending.set(id,callback);return id;};
  const cancel=id=>pending.delete(id);
  const window={requestIdleCallback:idle,cancelIdleCallback:cancel};
  class Observer{constructor(callback){this.callback=callback;this.disconnected=false;observer=this;}observe(){}unobserve(){}disconnect(){this.disconnected=true;}}
  class Picture{set src(value){this.source=value;loading.push(this);} }
  runInNewContext(readFileSync(new URL('../public/stellar.js',import.meta.url),'utf8'),{window,document:{createElement:()=>canvas},IntersectionObserver:Observer,Image:Picture,requestIdleCallback:idle,clearTimeout:cancel});
  const release=window.WCStellar.mount({querySelectorAll:()=>nodes});
  const enter=(...indexes)=>observer.callback(indexes.map(index=>({isIntersecting:true,target:nodes[index]})));
  const tick=()=>{const entry=pending.entries().next().value;if(entry){pending.delete(entry[0]);entry[1]();}};
  return {nodes,release,enter,tick,loading,pending,get contexts(){return contextRequests;},get draws(){return draws;},get releases(){return releases;},get disconnected(){return observer.disconnected;}};
}

test('3D work starts on visibility, caches matching stars and stays idle after baking',()=>{
  const f=fixture();assert.equal(f.contexts,0);assert.equal(f.pending.size,0);
  f.enter(0);assert.equal(f.draws,0);f.tick();assert.equal(f.draws,1);
  f.loading[0].onload();assert.equal(f.nodes[0].children.length,1);
  assert.equal(f.pending.size,0);
  f.enter(0,1);f.tick();assert.equal(f.draws,1); // Same hue and spherical variation reused.
  assert.equal(f.contexts,1);assert.equal(f.pending.size,0);
  f.release();assert.equal(f.releases,1);
});

test('leaving cancels queued work, releases GPU resources and ignores late images',()=>{
  const f=fixture();f.enter(0,2);f.tick();assert.equal(f.draws,1);
  assert.equal(f.pending.size,1);f.release();
  assert.equal(f.pending.size,0);assert.equal(f.releases,1);assert.equal(f.disconnected,true);
  f.loading[0].onload();assert.equal(f.nodes[0].children.length,0);
  f.tick();assert.equal(f.draws,1);
  const unstarted=fixture();unstarted.enter(0);unstarted.release();unstarted.tick();assert.equal(unstarted.contexts,0);
});

test('devices without WebGL retain their CSS spheres without retry loops',()=>{
  const f=fixture(false);f.enter(0,1,2);f.tick();
  assert.equal(f.contexts,1);assert.equal(f.draws,0);assert.equal(f.pending.size,0);assert.equal(f.disconnected,true);
  f.release();assert.equal(f.releases,0);
});
