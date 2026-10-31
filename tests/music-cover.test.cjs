const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../public/orange.js'),'utf8');

function setup(){
  const images=[];let navigateAway=false,inserted=null;
  const release={id:'57',album:'57',artist:'Vulpis',cover:'/music/57/cover.webp',tracks:[{slug:'30-vins-divins',title:'30 vins divins',duration:230}]};
  let albums=[release];
  class Image{
    constructor(){images.push(this);this.ready=new Promise(resolve=>this.finish=resolve);}
    decode(){return this.ready;}
  }
  const app={innerHTML:''};
  const context={app,Image,window:{addEventListener(){}},document:{title:'',getElementById:id=>id==='music-primary-cover'?{replaceWith:image=>inserted=image}:null,querySelectorAll:()=>[]},newEpoch:()=>1,stale:()=>navigateAway,location:{hash:''},esc:s=>String(s),WCIcon:()=>'',mmss:()=>'',api:async()=>({albums:[release]}),WCPlayer:{getAlbums:()=>albums,setAlbums:value=>albums=value,snapshot:()=>({})}};
  runInNewContext(source,context);
  return {context,app,images,get inserted(){return inserted},leave(){navigateAway=true;app.innerHTML='Another page';}};
}

test('the main cover is decoded before the music page appears and the same ready image is inserted',async()=>{
  const f=setup(),loading=f.context.pageMusique();
  await Promise.resolve();
  assert.match(f.app.innerHTML,/Chargement/);assert.equal(f.images.length,1);assert.equal(f.inserted,null);
  assert.equal(f.images[0].fetchPriority,'high');assert.equal(f.images[0].src,'/music/57/cover.webp');
  f.images[0].finish();await loading;
  assert.match(f.app.innerHTML,/album-57/);assert.equal(f.inserted,f.images[0]);assert.equal(f.images.length,1);
  assert.equal(f.inserted.alt,'Pochette de l’album 57');assert.equal(f.inserted.className,'music-cover');
});

test('leaving while the cover decodes cannot replace the new page with a delayed music render',async()=>{
  const f=setup(),loading=f.context.pageMusique();await Promise.resolve();
  f.leave();f.images[0].finish();await loading;
  assert.equal(f.app.innerHTML,'Another page');assert.equal(f.inserted,null);
});
