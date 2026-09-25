const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture(saved) {
  class Element extends EventTarget {
    constructor() { super(); this.hidden = false; this.attributes = {}; this.style = { setProperty() {} }; this.classList = { toggle() {} }; }
    setAttribute(k,v) { this.attributes[k]=v; }
    getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    getBoundingClientRect() { return {height:120}; }
  }
  class Audio extends Element {
    constructor() { super(); this.paused=true; this.currentTime=0; this.duration=144; this.readyState=0; this.volume=1; this.playbackRate=1; this.ended=false; this.calls=0; }
    set src(v) { this.attributes.src=v; this.currentTime=0; this.readyState=0; this.ended=false; }
    get src() { return this.attributes.src || ''; }
    play() { this.calls++; this.paused=false; this.readyState=4; this.dispatchEvent(new Event('loadedmetadata')); this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
    pause() { this.paused=true; this.dispatchEvent(new Event('pause')); }
    load() { this.currentTime=0;this.readyState=0; }
    finish() { this.paused=true; this.ended=true; this.currentTime=this.duration; this.dispatchEvent(new Event('ended')); }
  }
  const elements = new Map();
  const audio = new Audio(); elements.set('music-audio',audio);
  const document = new EventTarget();
  document.getElementById = id => { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  document.querySelectorAll = () => [audio]; document.body = new Element(); document.documentElement = new Element();
  const window = new EventTarget(); window.document=document;
  const stored = new Map(saved ? [['wc_music_57_v1',JSON.stringify(saved)]] : []);
  const actions={};
  const navigator={audioSession:{},mediaSession:{setActionHandler(k,v){actions[k]=v;},setPositionState(){}}};
  const context = vm.createContext({window,document,navigator,HTMLMediaElement:Audio,MediaMetadata:class {constructor(v){Object.assign(this,v);}},CustomEvent:class extends Event {constructor(n,o){super(n);this.detail=o.detail;}},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}});
  for (const file of ['music57.js','player.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),context);
  return {player:window.WCPlayer,audio,document,window,elements,actions,navigator,stored,Audio};
}

test('starts only on request, follows all four tracks, stops at Orange', async () => {
  const f=fixture(); assert.equal(f.audio.calls,0); assert.equal(f.elements.get('music-player').hidden,true);
  f.player.playTrack(0); await Promise.resolve();
  for (const slug of ['13h20','30-vins-divins','sans-indice-dans-les-des','orange']) {
    assert.equal(f.player.snapshot().slug,slug);
    f.audio.finish(); await Promise.resolve();
  }
  assert.equal(f.audio.calls,4); assert.equal(f.audio.paused,true);
  assert.equal(f.player.snapshot().slug,'orange');
});

test('pause, seek and system controls keep one audio element', async () => {
  const f=fixture(); f.player.playTrack('30-vins-divins'); await Promise.resolve();
  f.actions.seekto({seekTime:42}); assert.equal(f.audio.currentTime,42);
  f.actions.pause(); assert.equal(f.audio.paused,true);
  f.actions.play(); await Promise.resolve(); assert.equal(f.audio.currentTime,42);
  f.actions.previoustrack(); assert.equal(f.audio.currentTime,0);
  f.actions.previoustrack(); assert.equal(f.player.snapshot().slug,'13h20');
  assert.equal(f.document.getElementById('music-audio'),f.audio);
  assert.equal(f.navigator.mediaSession.metadata.artist,'Vulpis');
});

test('repeat wraps only when enabled; a saved position never autoplays', async () => {
  const f=fixture({slug:'orange',position:37,volume:.5,repeat:true});
  assert.equal(f.audio.calls,0); assert.equal(f.player.snapshot().slug,'orange');
  f.player.toggle(); await Promise.resolve(); assert.equal(f.audio.currentTime,37);
  f.audio.finish(); await Promise.resolve(); assert.equal(f.player.snapshot().slug,'13h20');
});

test('visibility changes never pause music, explicit vocal playback does', async () => {
  const f=fixture(); f.player.playTrack(0); await Promise.resolve();
  f.document.hidden=true; f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.audio.paused,false);
  const vocal=new f.Audio(); f.player.watchMedia(vocal); vocal.dispatchEvent(new Event('play'));
  assert.equal(f.audio.paused,true);
  f.player.playTrack(0); assert.equal(vocal.paused,true);
  f.player.beforeRecording(); assert.equal(f.audio.paused,true);
});

test('background video generation waits for music to stop', async () => {
  const f=fixture(); f.player.playTrack(0); await Promise.resolve();
  let granted=false;
  const reservation=f.player.reserveAutomaticMedia().then(release=>{granted=true;return release;});
  await Promise.resolve(); assert.equal(granted,false);
  f.player.pause(); const release=await reservation; assert.equal(granted,true);
  release(); f.player.playTrack(1); assert.equal(f.player.snapshot().slug,'30-vins-divins');
});

const july={id:'18-juillet-2019',album:'18 juillet 2019',artist:'AA',cover:'/music/18-juillet-2019/cover.jpeg',coverType:'image/jpeg',tracks:[
  {slug:'wanheda',title:'Wanheda',src:'/music/18-juillet-2019/wanheda.mp3',duration:234},
  {slug:'quand-je-vois-je-pense',title:'Quand je vois je pense',src:'/music/18-juillet-2019/quand-je-vois-je-pense.mp3',duration:198},
  {slug:'un-fil-entre-deux-infinis',title:'Un fil entre deux infinis',src:'/music/18-juillet-2019/un-fil-entre-deux-infinis.mp3',duration:198},
]};
test('unlocked EP has its own queue, metadata and repeat; logout revokes playback',async()=>{
  const f=fixture();f.player.playTrack('wanheda');assert.equal(f.audio.calls,0);
  f.player.setAlbums([july]);f.player.toggle('wanheda');await Promise.resolve();
  assert.equal(f.player.snapshot().slug,'wanheda');assert.equal(f.navigator.mediaSession.metadata.album,'18 juillet 2019');
  assert.equal(f.navigator.mediaSession.metadata.artwork[0].src,july.cover);
  assert.equal(f.navigator.mediaSession.metadata.artwork[0].type,'image/jpeg');
  f.audio.finish();assert.equal(f.player.snapshot().slug,'quand-je-vois-je-pense');
  f.audio.finish();assert.equal(f.player.snapshot().slug,'un-fil-entre-deux-infinis');
  f.audio.finish();assert.equal(f.audio.paused,true);
  f.elements.get('player-repeat').onclick();f.player.toggle();f.audio.finish();assert.equal(f.player.snapshot().slug,'wanheda');
  f.player.toggle('13h20');assert.equal(f.player.snapshot().slug,'13h20');
  f.player.toggle('wanheda');f.player.setAlbums([]);
  assert.equal(f.audio.paused,true);assert.equal(f.audio.src,'');assert.equal(f.player.snapshot().slug,null);
  assert.equal(f.elements.get('music-player').hidden,true);
});
test('restoring a gated track waits for catalogue access and never starts playback',()=>{
  const f=fixture({slug:'wanheda',position:32});
  assert.equal(f.player.snapshot().slug,null);
  f.player.setAlbums([july]);assert.equal(f.player.snapshot().slug,'wanheda');assert.equal(f.audio.calls,0);
});
