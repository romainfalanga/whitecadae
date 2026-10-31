const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const source=readFileSync(require('node:path').join(__dirname,'../public/echelon.js'),'utf8');

function fixture(pathname,{available=true,clock=true}={}){
  const elements=new Map();
  class Element{
    constructor(id,html=''){this.id=id;this.html=html;this.dataset={solved:'true'};}
    set innerHTML(html){this.html=html;if(this.id==='app'){elements.clear();for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element(match[1]));}}
    get innerHTML(){return this.html;}
    insertAdjacentHTML(_,html){const match=/^<section id="([^"]+)"/.exec(html);elements.set(match[1],new Element(match[1],html));}
    querySelector(){return null;}
  }
  const nodes=[{id:'eg-11',title:'2:24',subtitle:'13h20',kind:'workshop',open:false,found:[],partiels:[]}];
  if(available)nodes.push({id:'eg-22',title:'Sans vin divin',subtitle:'13h20',kind:'workshop',surface:'lyrics',open:false,found:[],partiels:[]});
  const pages=[...nodes,...(clock?[{id:'eg-10',kind:'clock'}]:[])];
  const app=new Element('app'),document={getElementById:id=>elements.get(id),title:''},window={scrollY:0};
  vm.runInNewContext(source,{window,document,app,location:{pathname,hash:''},state:{user:{id:7}},esc:s=>String(s),newEpoch:()=>1,stale:()=>false,api:async()=>({pages,nodes,echelon:10,capabilities:{}}),continuationMarkup:()=>'',WCGameFeedback:{mount:()=>({dispose(){}})},WCAttemptTimer:{mount:()=>({dispose(){},refresh(){}})}});
  return {game:window.WCGame,elements,document,app};
}

test('the lyric route renders its workshop without a clock password, and Horloge excludes that workshop',async()=>{
  const lyric=fixture('/sans-vin-divin',{clock:false});await lyric.game.page();
  assert.equal(lyric.document.title,'Sans vin divin · White Cadae');
  assert.match(lyric.app.innerHTML,/<h1>Sans vin divin<\/h1>/);
  assert.match(lyric.app.innerHTML,/href="\/chanson\/13h20"/);
  assert.ok(lyric.elements.has('eg-22'));assert.ok(!lyric.elements.has('eg-11'));
  assert.ok(!lyric.elements.has('eg-visibility'));
  const clock=fixture('/signes/horloge');await clock.game.page();
  assert.ok(clock.elements.has('eg-11'));assert.ok(!clock.elements.has('eg-22'));
  const locked=fixture('/sans-vin-divin',{available:false});await locked.game.page();
  assert.match(locked.app.innerHTML,/Ce chemin n’est pas disponible/);assert.ok(!locked.elements.has('eg-22'));
});
