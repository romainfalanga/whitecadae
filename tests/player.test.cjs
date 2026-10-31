const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture(saved,storageKey='wc_music_57_v1') {
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
  const stored = new Map(saved ? [[storageKey,JSON.stringify(saved)]] : []);
  const actions={};
  const navigator={audioSession:{},mediaSession:{setActionHandler(k,v){actions[k]=v;},setPositionState(){}}};
  const context = vm.createContext({window,document,navigator,HTMLMediaElement:Audio,MediaMetadata:class {constructor(v){Object.assign(this,v);}},CustomEvent:class extends Event {constructor(n,o){super(n);this.detail=o.detail;}},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}});
  for (const file of ['music57.js','player.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),context);
  return {player:window.WCPlayer,audio,document,window,elements,actions,navigator,stored,Audio};
}

const full57={id:'57',album:'57',artist:'Vulpis',cover:'/music/57/cover.png',tracks:[
  {slug:'30-vins-divins',title:'30 vins divins',src:'/music/57/30-vins-divins.mp3',duration:230},
  {slug:'sans-indice-dans-les-des',title:'Sans indices dans les dés',src:'/music/57/sans-indices-dans-les-des.mp3',duration:224},
  {slug:'13h20',title:'13h20',src:'/music/57/13h20.mp3',duration:144},
  {slug:'orange',title:'Orange',src:'/music/57/orange.mp3',duration:159},
]};
test('starts only on request, exposes only the first song initially, repeats the album by default',async()=>{
  const f=fixture();assert.equal(f.audio.calls,0);assert.equal(f.elements.get('music-player').hidden,true);
  assert.deepEqual(Array.from(f.player.getAlbums()[0].tracks,t=>t.slug),['30-vins-divins']);
  f.player.playTrack('orange');assert.equal(f.audio.calls,0);
  f.player.setAlbums([full57]);f.player.playTrack(0);await Promise.resolve();
  for(const slug of ['30-vins-divins','sans-indice-dans-les-des','13h20','orange']){
    assert.equal(f.player.snapshot().slug,slug);f.audio.finish();await Promise.resolve();
  }
  assert.equal(f.player.snapshot().slug,'30-vins-divins');assert.equal(f.audio.paused,false);
  assert.equal(f.audio.loop,false);assert.equal(f.audio.preload,'auto');
});
test('pause, seek and system controls retain one native audio element and a playback session',async()=>{
  const f=fixture();f.player.setAlbums([full57]);f.player.playTrack('13h20');await Promise.resolve();
  f.actions.seekto({seekTime:42});assert.equal(f.audio.currentTime,42);
  f.actions.pause();assert.equal(f.audio.paused,true);
  f.actions.play();await Promise.resolve();assert.equal(f.audio.currentTime,42);
  f.actions.previoustrack();assert.equal(f.audio.currentTime,0);
  f.actions.previoustrack();assert.equal(f.player.snapshot().slug,'sans-indice-dans-les-des');
  assert.equal(f.document.getElementById('music-audio'),f.audio);
  assert.equal(f.navigator.mediaSession.metadata.artist,'Vulpis');
  assert.equal(f.navigator.audioSession.type,'playback');
});
test('repeat one uses the native loop and an icon with 1; older album-repeat settings are migrated',async()=>{
  const f=fixture({slug:'orange',position:37,volume:.5,repeat:true});f.player.setAlbums([full57]);
  assert.equal(f.audio.calls,0);assert.equal(f.player.snapshot().slug,'orange');
  assert.equal(f.player.snapshot().repeat,false);
  f.player.toggle();await Promise.resolve();assert.equal(f.audio.currentTime,37);
  f.elements.get('player-repeat').onclick();assert.equal(f.audio.loop,true);
  assert.equal(f.elements.get('player-repeat').getAttribute('aria-pressed'),'true');
  const singleIcon=f.elements.get('player-repeat').innerHTML;
  f.audio.finish();await Promise.resolve();assert.equal(f.player.snapshot().slug,'orange');
  f.elements.get('player-repeat').onclick();assert.equal(f.audio.loop,false);
  assert.notEqual(f.elements.get('player-repeat').innerHTML,singleIcon);
  f.audio.finish();await Promise.resolve();assert.equal(f.player.snapshot().slug,'30-vins-divins');
  const restored=fixture({slug:'30-vins-divins',position:12,repeat:true},'wc_music_progressive_v2');
  assert.equal(restored.player.snapshot().repeat,true);assert.equal(restored.audio.calls,0);
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

function continuous57(){const tracks=[full57.tracks[2],full57.tracks[0],full57.tracks[1],full57.tracks[3]];let start=0;const chapters=tracks.map(t=>{const c={slug:t.slug,start,duration:t.duration};start+=t.duration;return c;});return {...full57,tracks,playback:{src:'/music/57/continuous-v1-5.m4a',duration:start,chapters}};}
test('continuous album crosses chapters and loops natively without play calls, with chapter-relative seeking',async()=>{
  const f=fixture(),album=continuous57();f.audio.duration=album.playback.duration;f.player.setAlbums([album]);f.player.playTrack('30-vins-divins');await Promise.resolve();
  assert.equal(f.audio.currentTime,144);assert.equal(f.audio.src,album.playback.src);assert.equal(f.audio.loop,true);const calls=f.audio.calls;
  f.audio.currentTime=375;f.audio.dispatchEvent(new Event('timeupdate'));assert.equal(f.player.snapshot().slug,'sans-indice-dans-les-des');assert.equal(f.audio.calls,calls);assert.equal(f.elements.get('player-elapsed').textContent,'0:01');
  f.actions.seekto({seekTime:10});assert.equal(f.audio.currentTime,384);
  f.audio.currentTime=0;f.audio.dispatchEvent(new Event('timeupdate'));assert.equal(f.player.snapshot().slug,'13h20');assert.equal(f.audio.calls,calls);
  f.audio.currentTime=755;f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.player.snapshot().slug,'orange');
});
test('switching repeat mode retains song position and paused state; downgrade revokes buffered locked chapters',async()=>{
  const f=fixture(),album=continuous57();f.audio.duration=album.playback.duration;f.player.setAlbums([album]);f.player.playTrack('30-vins-divins');await Promise.resolve();f.audio.currentTime=164;
  f.elements.get('player-repeat').onclick();await Promise.resolve();assert.equal(f.audio.src,full57.tracks[0].src);assert.equal(f.audio.currentTime,20);assert.equal(f.audio.loop,true);
  f.player.pause();f.elements.get('player-repeat').onclick();assert.equal(f.audio.paused,true);f.audio.readyState=4;f.audio.dispatchEvent(new Event('loadedmetadata'));assert.equal(f.audio.currentTime,164);
  f.player.playTrack();await Promise.resolve();f.player.setAlbums([{...full57,tracks:[full57.tracks[0]]}]);assert.equal(f.audio.paused,true);assert.equal(f.audio.src,'');
  f.player.playTrack();await Promise.resolve();assert.equal(f.audio.src,full57.tracks[0].src);assert.equal(f.audio.currentTime,20);
});
test('unlocked EP has its own queue, metadata and repeat; logout revokes playback',async()=>{
  const f=fixture();f.player.playTrack('wanheda');assert.equal(f.audio.calls,0);
  f.player.setAlbums([july]);f.player.toggle('wanheda');await Promise.resolve();
  assert.equal(f.player.snapshot().slug,'wanheda');assert.equal(f.navigator.mediaSession.metadata.album,'18 juillet 2019');
  assert.equal(f.navigator.mediaSession.metadata.artwork[0].src,july.cover);
  assert.equal(f.navigator.mediaSession.metadata.artwork[0].type,'image/jpeg');
  f.audio.finish();assert.equal(f.player.snapshot().slug,'quand-je-vois-je-pense');
  f.audio.finish();assert.equal(f.player.snapshot().slug,'un-fil-entre-deux-infinis');
  f.audio.finish();assert.equal(f.audio.paused,false);assert.equal(f.player.snapshot().slug,'wanheda');
  f.elements.get('player-repeat').onclick();f.audio.finish();assert.equal(f.player.snapshot().slug,'wanheda');
  f.player.toggle('30-vins-divins');assert.equal(f.player.snapshot().slug,'30-vins-divins');
  f.player.toggle('wanheda');f.player.setAlbums([]);
  assert.equal(f.audio.paused,true);assert.equal(f.audio.src,'');assert.equal(f.player.snapshot().slug,null);
  assert.equal(f.elements.get('music-player').hidden,true);
});
test('restoring a gated track waits for catalogue access and never starts playback',()=>{
  const f=fixture({slug:'wanheda',position:32});
  assert.equal(f.player.snapshot().slug,null);
  f.player.setAlbums([july]);assert.equal(f.player.snapshot().slug,'wanheda');assert.equal(f.audio.calls,0);
});

test('partial EP never queues locked tracks and expands without interrupting playback',async()=>{
  const f=fixture();const portion=n=>({...july,tracks:july.tracks.slice(0,n)});
  f.player.setAlbums([portion(1)]);f.player.playTrack('wanheda');await Promise.resolve();
  f.audio.finish();assert.equal(f.audio.paused,false);assert.equal(f.player.snapshot().slug,'wanheda');
  const calls=f.audio.calls;f.player.playTrack('quand-je-vois-je-pense');assert.equal(f.audio.calls,calls);
  f.player.playTrack('wanheda');await Promise.resolve();f.audio.currentTime=31;
  f.player.setAlbums([portion(2)]);assert.equal(f.audio.paused,false);assert.equal(f.audio.currentTime,31);
  f.audio.finish();assert.equal(f.player.snapshot().slug,'quand-je-vois-je-pense');
  f.audio.finish();assert.equal(f.audio.paused,false);
  f.player.setAlbums([portion(3)]);f.player.playTrack('quand-je-vois-je-pense');f.audio.finish();assert.equal(f.player.snapshot().slug,'un-fil-entre-deux-infinis');
  f.player.setAlbums([portion(1)]);assert.equal(f.audio.src,'');assert.equal(f.audio.paused,true);assert.equal(f.player.snapshot().slug,null);
});

test('a saved higher track cannot resume from a partially unlocked album',()=>{
  const f=fixture({slug:'un-fil-entre-deux-infinis',position:55});f.player.setAlbums([{...july,tracks:july.tracks.slice(0,1)}]);
  assert.equal(f.player.snapshot().slug,null);assert.equal(f.audio.calls,0);assert.equal(f.audio.src,'');
});

test('expanding the 57 catalogue preserves the selected song, time and album queue',async()=>{
  const f=fixture();f.player.playTrack('30-vins-divins');await Promise.resolve();f.audio.currentTime=32;
  assert.equal(f.audio.loop,true);
  f.player.setAlbums([{...full57,tracks:full57.tracks.slice(0,2)}]);
  assert.equal(f.audio.currentTime,32);assert.equal(f.audio.paused,false);assert.equal(f.audio.loop,false);
  f.audio.finish();assert.equal(f.player.snapshot().slug,'sans-indice-dans-les-des');
  f.player.setAlbums([full57]);assert.equal(f.player.snapshot().slug,'sans-indice-dans-les-des');
  f.audio.finish();assert.equal(f.player.snapshot().slug,'13h20');
  f.player.setAlbums([]);assert.equal(f.audio.src,'');assert.equal(f.audio.paused,true);
});

function playlistMix(slugs=['un-fil-entre-deux-infinis','orange','13h20'],name='Mes trajectoires'){
  const available=[...full57.tracks,...july.tracks];let start=0;
  const chapters=slugs.map(slug=>{const track=available.find(track=>track.slug===slug);const chapter={slug,start,duration:track.duration};start+=track.duration;return chapter;});
  return {id:17,name,tracks:slugs,playback:{src:'/api/playlists/audio?tracks='+slugs.join(','),duration:start,chapters}};
}
function playlistFixture(){const f=fixture();f.player.setAlbums([continuous57(),july]);f.player.setPlaylistAccess(true);return f;}

test('a cross-album playlist traverses and loops in one native stream while JavaScript sleeps',async()=>{
  const f=playlistFixture(),playlist=playlistMix();f.audio.duration=playlist.playback.duration;
  assert.equal(f.player.playPlaylist(playlist),true);await Promise.resolve();
  assert.equal(f.audio.src,playlist.playback.src);assert.equal(f.audio.loop,true);
  assert.equal(f.player.snapshot().playlistId,17);assert.equal(f.player.snapshot().playlistSource,playlist.playback.src);
  assert.equal(f.player.snapshot().slug,'un-fil-entre-deux-infinis');
  assert.equal(f.navigator.mediaSession.metadata.artist,'AA');assert.equal(f.navigator.mediaSession.metadata.album,'Mes trajectoires');
  assert.equal(f.navigator.mediaSession.metadata.artwork[0].src,july.cover);
  assert.equal(f.elements.get('player-title').href,'/playlist');assert.match(f.elements.get('player-repeat').getAttribute('aria-label'),/de la playlist/);
  assert.deepEqual(Array.from(f.player.getAlbums(),album=>album.id),['57','18-juillet-2019']);
  assert.equal(f.player.findTrack('orange').album,'57');
  const calls=f.audio.calls;
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));
  f.audio.currentTime=205; // Native streaming continues with no events or JS callbacks.
  assert.equal(f.audio.paused,false);assert.equal(f.audio.calls,calls);assert.equal(f.audio.src,playlist.playback.src);
  f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.player.snapshot().slug,'orange');assert.equal(f.audio.calls,calls);
  assert.equal(f.navigator.mediaSession.metadata.artist,'Vulpis');assert.equal(f.elements.get('player-elapsed').textContent,'0:07');
  f.audio.currentTime=0;f.audio.dispatchEvent(new Event('timeupdate')); // Native loop, not ended -> play().
  assert.equal(f.player.snapshot().slug,'un-fil-entre-deux-infinis');assert.equal(f.audio.calls,calls);
});

test('playlist lock-screen controls and repeat-one retain chapter-relative positions and the paused state',async()=>{
  const f=playlistFixture(),playlist=playlistMix();f.audio.duration=playlist.playback.duration;
  f.player.playPlaylist(playlist,1);await Promise.resolve();assert.equal(f.audio.currentTime,198);
  f.actions.seekto({seekTime:11});assert.equal(f.audio.currentTime,209);
  f.elements.get('player-repeat').onclick();await Promise.resolve();
  assert.equal(f.audio.src,full57.tracks[3].src);assert.equal(f.audio.currentTime,11);assert.equal(f.audio.loop,true);
  assert.equal(f.player.snapshot().playlistSource,playlist.playback.src);
  f.actions.pause();const calls=f.audio.calls;
  f.elements.get('player-repeat').onclick();assert.equal(f.audio.paused,true);assert.equal(f.audio.calls,calls);
  f.audio.readyState=4;f.audio.dispatchEvent(new Event('loadedmetadata'));assert.equal(f.audio.currentTime,209);assert.equal(f.audio.src,playlist.playback.src);
  f.actions.play();await Promise.resolve();assert.equal(f.audio.currentTime,209);
  f.actions.nexttrack();assert.equal(f.player.snapshot().slug,'13h20');assert.equal(f.audio.currentTime,357);
  f.actions.previoustrack();assert.equal(f.player.snapshot().slug,'orange');assert.equal(f.audio.currentTime,198);
  assert.equal(f.document.getElementById('music-audio'),f.audio);
});

test('same playlist version preserves its position, reordered versions restart correctly, and Music clicks exit the playlist',async()=>{
  const f=playlistFixture(),playlist=playlistMix();f.audio.duration=playlist.playback.duration;
  f.player.playPlaylist(playlist,1);await Promise.resolve();f.actions.seekto({seekTime:26});
  f.player.playPlaylist({...playlist,name:'Nouvelle trajectoire'},1);await Promise.resolve();
  assert.equal(f.audio.currentTime,224);assert.equal(f.navigator.mediaSession.metadata.album,'Nouvelle trajectoire');
  const revised=playlistMix(['orange','13h20','un-fil-entre-deux-infinis']);
  f.player.playPlaylist(revised);await Promise.resolve();assert.equal(f.audio.currentTime,0);
  assert.equal(f.player.snapshot().slug,'orange');assert.equal(f.player.snapshot().playlistSource,revised.playback.src);
  f.audio.duration=continuous57().playback.duration;
  f.player.toggle('orange');await Promise.resolve();
  assert.equal(f.player.snapshot().playlistId,null);assert.equal(f.player.snapshot().playlistSource,null);
  assert.equal(f.audio.paused,false);assert.equal(f.audio.src,continuous57().playback.src);assert.equal(f.audio.currentTime,598);
  assert.equal(f.navigator.mediaSession.metadata.album,'57');assert.equal(f.elements.get('player-title').href,'/musique#album-57');
});

test('renaming the active playlist updates labels without playback calls, seeking or changing pause and repeat modes',async()=>{
  const f=playlistFixture(),playlist=playlistMix();f.audio.duration=playlist.playback.duration;
  f.player.playPlaylist(playlist,1);await Promise.resolve();f.actions.seekto({seekTime:26});
  let calls=f.audio.calls;
  assert.equal(f.player.updatePlaylistMetadata({...playlist,name:'Nouveau nom'}),true);
  assert.equal(f.audio.calls,calls);assert.equal(f.audio.currentTime,224);assert.equal(f.audio.paused,false);
  assert.equal(f.audio.src,playlist.playback.src);assert.equal(f.player.snapshot().repeat,false);
  assert.equal(f.navigator.mediaSession.metadata.album,'Nouveau nom');assert.match(f.elements.get('player-album').textContent,/Nouveau nom/);
  f.elements.get('player-repeat').onclick();await Promise.resolve();f.actions.pause();calls=f.audio.calls;
  const source=f.audio.src,position=f.audio.currentTime;
  assert.equal(f.player.updatePlaylistMetadata({...playlist,name:'Nom pendant la pause'}),true);
  assert.equal(f.audio.calls,calls);assert.equal(f.audio.currentTime,position);assert.equal(f.audio.paused,true);
  assert.equal(f.audio.src,source);assert.equal(f.player.snapshot().repeat,true);
  assert.equal(f.navigator.mediaSession.metadata.album,'Nom pendant la pause');
  for(const other of [{...playlist,id:18},{...playlist,playback:{...playlist.playback,src:'/api/playlists/audio?tracks=orange'}},{...playlist,name:''}])assert.equal(f.player.updatePlaylistMetadata(other),false);
  assert.equal(f.navigator.mediaSession.metadata.album,'Nom pendant la pause');assert.equal(f.audio.calls,calls);
  f.player.playTrack('orange');await Promise.resolve();assert.equal(f.player.updatePlaylistMetadata(playlist),false);
  assert.equal(f.navigator.mediaSession.metadata.album,'57');
});

test('catalogue refresh preserves an allowed playlist but either a locked track or a revoked level clears every buffered chapter',async()=>{
  const f=playlistFixture(),playlist=playlistMix();f.audio.duration=playlist.playback.duration;
  f.player.playPlaylist(playlist);await Promise.resolve();f.audio.currentTime=31;const calls=f.audio.calls;
  f.player.setAlbums([continuous57(),july]);assert.equal(f.audio.currentTime,31);assert.equal(f.audio.calls,calls);assert.equal(f.player.snapshot().playlistId,17);
  f.player.setAlbums([continuous57()]);assert.equal(f.audio.paused,true);assert.equal(f.audio.src,'');assert.equal(f.player.snapshot().playlistId,null);
  const publicQueue=playlistMix(['30-vins-divins']);f.audio.duration=publicQueue.playback.duration;
  f.player.playPlaylist(publicQueue);await Promise.resolve();f.player.setPlaylistAccess(false);
  assert.equal(f.audio.paused,true);assert.equal(f.audio.src,'');assert.equal(f.navigator.mediaSession.metadata,null);
  assert.equal(f.player.playPlaylist(publicQueue),false);
});

test('deleting only the active playlist clears its queue; rejected playlists never change the current album',async()=>{
  const f=playlistFixture(),playlist=playlistMix();f.audio.duration=playlist.playback.duration;
  f.player.playTrack('orange');await Promise.resolve();const calls=f.audio.calls;
  const invalids=[{...playlist,tracks:['unknown']},{...playlist,tracks:['orange','orange']},{...playlist,playback:{...playlist.playback,src:'https://other.test/audio.mp3'}},{...playlist,playback:{...playlist.playback,chapters:playlist.playback.chapters.toReversed()}}];
  for(const invalid of invalids){assert.equal(f.player.playPlaylist(invalid),false);assert.equal(f.audio.calls,calls);assert.equal(f.player.snapshot().playlistId,null);}
  f.player.playPlaylist(playlist);await Promise.resolve();assert.equal(f.player.clearPlaylist(9),false);assert.equal(f.audio.paused,false);
  assert.equal(f.player.clearPlaylist(17),true);assert.equal(f.audio.src,'');assert.equal(f.player.snapshot().playlistId,null);
  assert.equal(f.player.playPlaylist(playlist),true); // Deletion does not revoke the user's overall Playlist permission.
});

test('reloading a saved playlist never restores an unrelated album track or starts playback',async()=>{
  const f=playlistFixture(),playlist=playlistMix();f.audio.duration=playlist.playback.duration;
  f.player.playPlaylist(playlist);await Promise.resolve();f.audio.currentTime=33;f.window.dispatchEvent(new Event('pagehide'));
  const saved=JSON.parse(f.stored.get('wc_music_progressive_v2'));assert.equal(saved.playlistId,17);assert.equal(saved.slug,undefined);
  const restored=fixture(saved,'wc_music_progressive_v2');restored.player.setAlbums([continuous57(),july]);restored.player.setPlaylistAccess(true);
  assert.equal(restored.player.snapshot().playlistId,null);assert.equal(restored.player.snapshot().slug,null);assert.equal(restored.audio.calls,0);assert.equal(restored.audio.src,'');
});
