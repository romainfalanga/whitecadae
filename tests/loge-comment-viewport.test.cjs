const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../public/loge-comment-viewport.js'),'utf8').replace(/export /g,'');
const classes=()=>{const names=new Set();return {add:n=>names.add(n),remove:n=>names.delete(n),contains:n=>names.has(n)};};
const style=()=>{const values=new Map();return {setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k),getPropertyValue:k=>values.get(k)||''};};
class Target extends EventTarget{
  listeners=new Map();
  addEventListener(type,fn,options){super.addEventListener(type,fn,options);if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){super.removeEventListener(type,fn);this.listeners.get(type)?.delete(fn);}
  emit(type){this.dispatchEvent(new Event(type));}
  get listenerCount(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
function fixture({width=390,height=844,coarse=true,visual=true,edit=false}={}){
  const frames=new Map(),changes=[],window=new Target(),document=new Target(),viewport=new Target();let seq=0,current=true,markerTop=0,mirrors=0;
  Object.assign(window,{innerWidth:width,innerHeight:height,matchMedia:()=>({matches:coarse}),requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id)});
  Object.assign(viewport,{width,height,offsetTop:0,offsetLeft:0});if(visual)window.visualViewport=viewport;
  const panel={classList:classes(),style:style()},composer={parent:panel,hidden:false},scroll={getBoundingClientRect:()=>({top:100,bottom:350})};
  const field={parent:composer,hidden:false,value:'Plusieurs lignes\nUne nouvelle réflexion',selectionStart:36,clientHeight:144,scrollHeight:144,scrollTop:0,getBoundingClientRect:()=>({top:500,bottom:644,width:350}),getClientRects:()=>composer.hidden?[]:[{}],matches:s=>s==='textarea',closest:s=>s==='.loge-comments-panel'?panel:s==='.loge-comment-composer'&&!edit?composer:s==='.loge-comments-scroll'&&edit?scroll:null,scrollIntoView(options){this.reveal=options;}};
  if(!edit)composer.getBoundingClientRect=scroll.getBoundingClientRect;
  const nodes=[];document.body={classList:classes(),append(node){nodes.push(node);mirrors++;}};
  document.createElement=tag=>({style:style(),offsetTop:tag==='span'?markerTop:0,setAttribute(){},append(){},remove(){nodes.splice(nodes.indexOf(this),1);}});
  window.getComputedStyle=()=>({lineHeight:'24px',paddingTop:'8px',getPropertyValue:key=>key==='line-height'?'24px':key.startsWith('padding')?'8px':''});
  const sandbox=vm.createContext({window,document,console,setTimeout,clearTimeout});vm.runInContext(source+';globalThis.create=createLogeCommentViewport;globalThis.caret=revealCommentCaret;',sandbox);
  const controller=sandbox.create({isCurrent:()=>current,getPanel:()=>panel,onGeometry:field=>changes.push(field)});
  return {window,document,viewport,panel,composer,field,frames,changes,controller,get mirrors(){return mirrors;},get mirrorNodes(){return nodes.length;},caret:()=>sandbox.caret(field),set markerTop(value){markerTop=value;},
    focus(){document.activeElement=field;document.emit('focusin');},
    flush(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();},
    stop(){current=false;controller.refresh();}
  };
}

test('keyboard resize and visual viewport scroll lift the editor into the visible screen and reveal the field',()=>{
  const f=fixture();f.focus();assert.equal(f.panel.classList.contains('is-keyboard-editing'),false);
  f.viewport.height=330;f.viewport.offsetTop=42;f.viewport.emit('resize');f.flush();
  assert.equal(f.panel.classList.contains('is-keyboard-editing'),true);assert.equal(f.document.body.classList.contains('loge-comment-keyboard'),true);
  assert.equal(f.panel.style.getPropertyValue('--loge-comment-viewport-height'),'330px');assert.equal(f.panel.style.getPropertyValue('--loge-comment-viewport-top'),'42px');assert.equal(f.field.reveal.block,'nearest');assert.equal(f.document.activeElement,f.field);
  f.viewport.offsetTop=102;f.viewport.offsetLeft=5;f.viewport.emit('scroll');f.flush();assert.equal(f.panel.style.getPropertyValue('--loge-comment-viewport-top'),'102px');assert.equal(f.panel.style.getPropertyValue('--loge-comment-viewport-left'),'5px');
  f.viewport.height=844;f.viewport.offsetTop=0;f.viewport.emit('resize');assert.equal(f.panel.classList.contains('is-keyboard-editing'),false);assert.equal(f.panel.style.getPropertyValue('--loge-comment-viewport-height'),'');assert.equal(f.document.body.classList.contains('loge-comment-keyboard'),false);f.controller.destroy();
});

test('both resized viewports, landscape rotation and a second viewport event retain the lifted editor until keyboard expansion',()=>{
  const f=fixture();f.focus();f.window.innerHeight=340;f.viewport.height=340;f.window.emit('resize');assert.equal(f.panel.classList.contains('is-keyboard-editing'),true);
  f.window.innerWidth=844;f.window.innerHeight=220;f.viewport.width=844;f.viewport.height=220;f.viewport.emit('resize');f.viewport.offsetTop=12;f.viewport.emit('scroll');f.flush();assert.equal(f.panel.classList.contains('is-keyboard-editing'),true);assert.equal(f.panel.style.getPropertyValue('--loge-comment-viewport-width'),'844px');
  f.window.innerHeight=390;f.viewport.height=390;f.viewport.emit('resize');assert.equal(f.panel.classList.contains('is-keyboard-editing'),false);f.controller.destroy();
});

test('existing comment editing and tablet keyboards use the same viewport handling; desktop mouse layouts stay intact',()=>{
  const f=fixture({width:1024,height:900,edit:true});f.focus();f.viewport.height=350;f.viewport.emit('resize');f.flush();assert.equal(f.panel.classList.contains('is-keyboard-editing'),true);assert.equal(f.field.reveal.block,'nearest');
  f.composer.hidden=true;f.controller.refresh();assert.equal(f.panel.classList.contains('is-keyboard-editing'),false);f.controller.destroy();
  const desktop=fixture({width:1440,height:900,coarse:false});desktop.focus();desktop.viewport.height=350;desktop.viewport.emit('resize');assert.equal(desktop.panel.classList.contains('is-keyboard-editing'),false);desktop.controller.destroy();
});

test('without VisualViewport the remembered window height supports resize keyboards and cleanup removes every observer and frame',()=>{
  const f=fixture({visual:false});f.focus();f.window.innerHeight=320;f.window.emit('resize');assert.equal(f.panel.classList.contains('is-keyboard-editing'),true);assert(f.frames.size>0);
  f.controller.destroy();assert.equal(f.frames.size,0);assert.equal(f.window.listenerCount,0);assert.equal(f.document.listenerCount,0);assert.equal(f.viewport.listenerCount,0);assert.equal(f.document.body.classList.contains('loge-comment-keyboard'),false);assert.equal(f.panel.style.getPropertyValue('--loge-comment-viewport-height'),'');
  const count=f.changes.length;f.window.emit('resize');f.document.emit('focusin');assert.equal(f.changes.length,count);
});

test('selection measurement scrolls a long textarea to its caret without changing text or selection and removes its mirror',()=>{
  const f=fixture(),value=f.field.value,selection=f.field.selectionStart;f.field.scrollHeight=600;f.markerTop=420;f.caret();assert.equal(f.field.scrollTop,308);assert.equal(f.mirrorNodes,0);assert.equal(f.mirrors,1);
  f.markerTop=12;f.caret();assert.equal(f.field.scrollTop,4);assert.equal(f.field.value,value);assert.equal(f.field.selectionStart,selection);assert.equal(f.mirrorNodes,0);f.controller.destroy();
});
