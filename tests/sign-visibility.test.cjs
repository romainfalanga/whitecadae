const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const source=readFileSync(require('node:path').join(__dirname,'../public/echelon.js'),'utf8');
function fixture(){
  const elements=new Map();let document;
  class Element{
    constructor(id='',html=''){this.id=id;this.html=html;this.attrs={};this.value='';this.dataset={};}
    set innerHTML(html){this.html=html;if(this.id==='app'){elements.clear();for(const m of html.matchAll(/id="([^"]+)"/g))elements.set(m[1],new Element(m[1]));}}
    get innerHTML(){return this.html;}
    set outerHTML(html){addArticle(html);}
    insertAdjacentHTML(position,html){addArticle(html);}
    querySelector(selector){if(selector==='input')return this.input||null;if(selector==='form')return this.form||null;return null;}
    contains(el){return el===this.input;}
    focus(){document.activeElement=this;}
    setAttribute(key,value){this.attrs[key]=value;}
    getAttribute(key){return this.attrs[key];}
  }
  function addArticle(html){const id=/^<article id="([^"]+)"/.exec(html)[1],node=new Element(id,html);if(html.includes('<form')){node.input=new Element();node.form={elements:{answer:node.input}};}elements.set(id,node);}
  const app=new Element('app');
  document={getElementById:id=>elements.get(id),activeElement:null,title:''};
  const window={scrollTo(){},scrollY:0};
  const data={echelon:5,nodes:[{id:'test-node',kind:'riddle',title:'A puzzle',found:[{id:'found',label:'A complete solution'}],partiels:[{id:'partial',jetons:[{t:'A partial solution',sep:''},{q:true,sep:' '}]}],total:3,open:true,requirements:{}}],capabilities:{}};
  const context={window,document,app,location:{pathname:'/signes',hash:''},state:{user:{id:7}},esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'),newEpoch(){return 1},stale(){return false},api:async()=>structuredClone(data),continuationMarkup:()=>'',WCGameFeedback:{mount:()=>({dispose(){}})},WCAttemptTimer:{mount:()=>({dispose(){},refresh(){}})}};
  vm.runInNewContext(source,context);
  return {game:window.WCGame,elements,document,data,app};
}
test('found signs and fragments start hidden, the eye toggles them without losing an answer draft, and reentry hides them again',async()=>{
  const f=fixture();await f.game.page();
  let node=f.elements.get('test-node'),eye=f.elements.get('eg-visibility');
  assert.doesNotMatch(node.innerHTML,/A complete solution|A partial solution/);
  assert.match(node.innerHTML,/Signe trouvé masqué/);assert.match(node.innerHTML,/1 \/ 3 signes/);
  assert.equal(eye.getAttribute('aria-pressed'),'false');assert.equal(eye.getAttribute('aria-label'),'Afficher les signes trouvés');
  node.input.value='my unfinished answer';node.input.focus();eye.onclick();
  node=f.elements.get('test-node');assert.match(node.innerHTML,/A complete solution/);assert.match(node.innerHTML,/A partial solution/);
  assert.equal(node.input.value,'my unfinished answer');assert.equal(f.document.activeElement,node.input);
  assert.equal(eye.getAttribute('aria-pressed'),'true');assert.equal(eye.getAttribute('aria-label'),'Masquer les signes trouvés');
  eye.onclick();assert.doesNotMatch(f.elements.get('test-node').innerHTML,/A complete solution|A partial solution/);
  eye.onclick();f.game.leave();await f.game.page();assert.doesNotMatch(f.elements.get('test-node').innerHTML,/A complete solution|A partial solution/);
  assert.equal(f.elements.get('eg-visibility').getAttribute('aria-pressed'),'false');
});
