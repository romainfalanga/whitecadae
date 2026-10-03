const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const script=readFileSync(require('node:path').join(__dirname,'../public/game-feedback.js'),'utf8');
function setup(){
  let seq=0,now=0;const jobs=new Map(),events=new Map(),nodes=[];
  const heading={focus(){document.activeElement=heading}};
  const root={append(el){nodes.push(el)},querySelector:()=>heading};
  const document={activeElement:null,createElement(){
    const button={};return {button,classList:{add(){}},setAttribute(){},querySelector:()=>button,contains:el=>el===button,remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1)}};
  }};
  const window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  vm.runInNewContext(script,{window,document,setTimeout(fn,delay){jobs.set(++seq,{fn,at:now+delay});return seq},clearTimeout:id=>jobs.delete(id)});
  const feedback=window.WCGameFeedback.mount(root);
  return {feedback,nodes,jobs,events,document,heading,tick(ms){now+=ms;for(const [id,job] of [...jobs])if(job.at<=now){jobs.delete(id);job.fn();}}};
}
test('the centered celebration contains only the gain, then disappears and releases its keyboard listener',()=>{
  const f=setup();f.feedback.show(1);assert.equal(f.nodes.length,1);
  assert.match(f.nodes[0].innerHTML,/\+1<\/span> <span class="eg-gain-label">échelon/);
  assert.doesNotMatch(f.nodes[0].innerHTML,/nouveau|musique|énigme/i);
  f.tick(4200);assert.equal(f.nodes.length,1);f.tick(220);assert.equal(f.nodes.length,0);assert.equal(f.events.size,0);assert.equal(f.jobs.size,0);
});
test('repeated dismissals cannot remove a later notification, and focused dismissal restores a safe heading',()=>{
  const f=setup();f.feedback.show(1);const first=f.nodes[0];f.document.activeElement=first.button;
  first.button.onclick();f.events.get('keydown')({key:'Escape'});assert.equal(f.jobs.size,1);
  f.feedback.show(2);assert.equal(f.document.activeElement,f.heading);f.tick(220);assert.equal(f.nodes.length,1);
  assert.match(f.nodes[0].innerHTML,/\+2/);f.feedback.dispose();assert.equal(f.nodes.length,0);assert.equal(f.jobs.size,0);
});
test('navigation disposes pending effects and malformed gains never create HTML',()=>{
  const f=setup();for(const gain of [0,-1,NaN,'<img>',1.5])f.feedback.show(gain);assert.equal(f.nodes.length,0);
  f.feedback.show(1);f.feedback.dispose();f.tick(10000);assert.equal(f.nodes.length,0);assert.equal(f.events.size,0);
});
