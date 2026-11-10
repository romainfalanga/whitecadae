import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStreamPlayer,validStreamURL} from '../public/loge-stream-player.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const signed={hls:'https://customer-example.cloudflarestream.com/signed-token/manifest/video.m3u8',poster:'https://customer-example.cloudflarestream.com/signed-token/thumbnails/thumbnail.jpg',expiresAt:new Date(Date.now()+3600000).toISOString()};
function fixture({native=false,getPlayback=async()=>signed,playImplementation}={}){
  const previous=globalThis.document,instances=[],states=[],players=[];let ready=0,eligible=true,libraryCalls=0;
  class Element extends EventTarget{
    constructor(tag){super();this.tag=tag;this.children=[];this.attributes=new Map();this.hidden=false;this.disabled=false;this.paused=true;this.playCalls=0;this.pauseCalls=0;this.loads=0;this.currentTime=0;this.duration=120;this.ended=false;this.fullscreenCalls=0;const values=new Set();this.classList={toggle:(key,on)=>on?values.add(key):values.delete(key),contains:key=>values.has(key)};}
    append(...children){this.children.push(...children);for(const child of children)child.parent=this;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
    setAttribute(key,value){this.attributes.set(key,String(value));}
    getAttribute(key){return this.attributes.get(key)||null;}
    removeAttribute(key){this.attributes.delete(key);}
    set src(value){this.setAttribute('src',value);}get src(){return this.getAttribute('src');}
    load(){this.loads++;}
    canPlayType(type){assert.equal(type,'application/vnd.apple.mpegurl');return native?'probably':'';}
    async play(){this.playCalls++;if(playImplementation)return playImplementation(this);this.paused=false;this.dispatchEvent(new Event('play'));}
    pause(){this.pauseCalls++;if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}
    closest(selector){assert.equal(selector,'.loge-reel-stage');return this.stage||null;}
    async requestFullscreen(){this.fullscreenCalls++;document.fullscreenElement=this;}
  }
  const document={createElement:tag=>new Element(tag),fullscreenElement:null,exitCalls:0,async exitFullscreen(){this.exitCalls++;this.fullscreenElement=null;}};globalThis.document=document;
  class Hls{
    static Events={ERROR:'error'};static isSupported(){return true;}
    constructor(config){this.config=config;this.handlers={};this.starts=[];this.stops=0;this.destroys=0;instances.push(this);}
    on(type,fn){this.handlers[type]=fn;}
    attachMedia(video){this.video=video;}
    loadSource(url){this.source=url;}
    startLoad(position){this.starts.push(position);}
    stopLoad(){this.stops++;}
    destroy(){this.destroys++;}
    fatal(){this.handlers.error('error',{fatal:true});}
  }
  const container=document.createElement('div');container.stage=document.createElement('section');
  const player=createStreamPlayer({container,post:{id:7,title:'Ma réflexion'},getPlayback,isEligible:()=>eligible,onReady:()=>ready++,onState:value=>states.push(value),loadLibrary:async()=>{libraryCalls++;return {default:Hls};}});players.push(player);
  const button=player.element.children[1],full=player.element.children[2],message=player.element.children[3];
  return {player,button,full,message,container,document,instances,states,get ready(){return ready;},get libraryCalls(){return libraryCalls;},eligible:value=>eligible=value,async click(target=button){target.dispatchEvent(new Event('click'));await tick();},close(){for(const item of players)item.destroy();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}};
}

test('Stream starts paused and unmuted, and hls loading starts only on the first explicit play',async()=>{
  const h=fixture();try{await tick();assert.equal(h.player.video.autoplay,false);assert.equal(h.player.video.muted,false);assert.equal(h.player.video.playsInline,true);assert.equal(h.player.video.controls,false);assert.equal(h.player.video.playCalls,0);assert.equal(h.button.disabled,false);assert.equal(h.instances.length,1);assert.equal(h.instances[0].config.autoStartLoad,false);assert.deepEqual(h.instances[0].starts,[]);
    await h.click();assert.equal(h.player.video.playCalls,1);assert.equal(h.player.video.muted,false);assert.equal(h.player.getPlayerState(),1);assert.deepEqual(h.instances[0].starts,[-1]);assert.equal(h.button.hidden,true);
    h.player.pauseVideo();assert.equal(h.player.video.paused,true);assert(h.instances[0].stops>=1);h.player.video.dispatchEvent(new Event('loadedmetadata'));await tick();assert.equal(h.player.video.playCalls,1);assert.equal(h.button.hidden,false);
    await h.click();assert.equal(h.player.video.playCalls,2);assert.equal(h.player.getPlayerState(),1);
  }finally{h.close();}
});

test('eligibility rejects taps while hidden and a pause stops active HLS requests',async()=>{
  const h=fixture();try{await tick();h.eligible(false);await h.click();assert.equal(h.player.video.playCalls,0);assert.equal(h.instances[0].starts.length,0);h.eligible(true);await h.click();h.eligible(false);h.player.pauseVideo();assert.equal(h.player.video.paused,true);assert(h.instances[0].stops>0);await h.click();assert.equal(h.player.video.playCalls,1);}finally{h.close();}
});

test('destroy ignores late playback readiness and removes the native element',async()=>{
  let release;const h=fixture({getPlayback:()=>new Promise(resolve=>release=resolve)});try{const before=h.ready;h.player.destroy();release(signed);await tick();h.player.video.dispatchEvent(new Event('loadedmetadata'));assert.equal(h.ready,before);assert.equal(h.libraryCalls,0);assert.equal(h.container.children.length,0);assert.equal(h.player.video.playCalls,0);}finally{h.close();}
});

test('initial network failure offers retry and a user retry starts the recovered signed stream',async()=>{
  let calls=0;const h=fixture({getPlayback:async()=>{if(++calls===1)throw Error('network');return signed;}});try{await tick();assert.match(h.message.textContent,/Réessaie/);assert.equal(h.button.getAttribute('aria-label'),'Réessayer la lecture');assert.equal(h.player.video.playCalls,0);await h.click();assert.equal(calls,2);assert.equal(h.player.video.playCalls,1);assert.equal(h.player.getPlayerState(),1);}finally{h.close();}
});

test('unsafe playback hosts and credentials are rejected before attaching a media source',async()=>{
  for(const value of ['http://videodelivery.net/token','https://evil.test/token','https://videodelivery.net.evil.test/token','https://user:pass@videodelivery.net/token','https://videodelivery.net:8443/token','javascript:alert(1)'])assert.equal(validStreamURL(value),null);
  assert.equal(validStreamURL(signed.hls),signed.hls);
  for(const field of ['hls','poster']){const h=fixture({getPlayback:async()=>({...signed,[field]:'https://evil.test/video'})});try{await tick();assert.match(h.message.textContent,/ne se charge pas/);assert.equal(h.libraryCalls,0);assert.equal(h.player.video.src,null);assert.equal(h.player.video.playCalls,0);}finally{h.close();}}
});

test('fullscreen targets only the current reel and toggling it never starts playback',async()=>{
  const h=fixture();try{await tick();await h.click(h.full);assert.equal(h.document.fullscreenElement,h.container.stage);assert.equal(h.container.stage.fullscreenCalls,1);assert.equal(h.player.video.playCalls,0);await h.click(h.full);assert.equal(h.document.fullscreenElement,null);assert.equal(h.document.exitCalls,1);}finally{h.close();}
});

test('stale source refresh after pause cannot start HLS loading or play the video',async()=>{
  let calls=0,release;const h=fixture({getPlayback:()=>++calls===1?Promise.resolve({...signed,expiresAt:new Date(Date.now()-1000).toISOString()}):new Promise(resolve=>release=resolve)});
  try{await tick();h.button.dispatchEvent(new Event('click'));await tick();assert.equal(calls,2);h.player.pauseVideo();release(signed);await tick();assert.equal(h.player.video.playCalls,0);assert.equal(h.instances.flatMap(item=>item.starts).length,0);}finally{h.close();}
});

test('a pending native play fulfillment after pause is immediately paused again',async()=>{
  let release;const h=fixture({playImplementation:video=>new Promise(resolve=>{release=()=>{video.paused=false;resolve();};})});
  try{await tick();h.button.dispatchEvent(new Event('click'));await tick();h.player.pauseVideo();release();await tick();assert.equal(h.player.video.paused,true);assert.equal(h.player.video.playCalls,1);assert(h.instances[0].stops>0);}finally{h.close();}
});

test('Safari native HLS stays paused until a tap and requires no hls.js module',async()=>{
  const h=fixture({native:true});try{await tick();assert.equal(h.player.video.src,signed.hls);assert.equal(h.player.video.poster,signed.poster);assert.equal(h.libraryCalls,0);assert.equal(h.player.video.playCalls,0);await h.click();assert.equal(h.player.video.playCalls,1);h.player.pauseVideo();assert.equal(h.player.video.paused,true);h.player.video.currentTime=30;assert.equal(h.player.getCurrentTime(),30);h.player.seekTo(500);assert.equal(h.player.video.currentTime,120);h.player.destroy();assert.equal(h.player.video.src,null);}finally{h.close();}
});

test('fatal HLS failure stops requests and an explicit retry creates a fresh source',async()=>{
  const h=fixture();try{await tick();await h.click();const first=h.instances[0];first.fatal();assert.equal(h.player.video.paused,true);assert(first.stops>0);assert.match(h.message.textContent,/interrompue/);await h.click();assert.equal(first.destroys,1);assert.equal(h.instances.length,2);assert.equal(h.player.video.playCalls,2);assert.equal(h.player.getPlayerState(),1);}finally{h.close();}
});
