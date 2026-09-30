// Server-only catalogue. Answers, undiscovered pages and the final ceiling
// must never be copied into a browser bundle.
import { NODES as OLD, compileAnswer, normalize, currentAnswerId as oldId,
  echelonOf as oldLevel, progresOf as oldProgress } from './enigmas57.js';
import {gameContinuation} from './game-continuation.js';

export const SHARE = '@eg/share';
const legacy = (id, keep) => ({ ...OLD.find(n => n.id === id), answers: OLD.find(n => n.id === id).answers.filter(a => !keep || keep.includes(a.id)) });
function answer(id, label, parts, extra = []) {
  const a = { id, label, parties: parts.map(p => ({ t: p[0], formes: p.map(normalize) })), extra };
  a.moteur = compileAnswer(a); return a;
}
const a = (id, label, forms = []) => answer(id, label, [[label, ...forms]]);
const has = (p, id) => p.solved.has(id);
const all = (p, ids) => ids.every(id => has(p, id));
const at = (p, n) => progressLevel(p) >= n;
const any = (p, ids) => ids.some(id => has(p, id));

const onSong=(music,min,nodes)=>nodes.map(n=>({...n,music,min,reveal:null,requires:[]}));
const horns=(id,number,word)=>answer(id,number+' cornes',[[number,word],['cornes','corne']],[{idx:[0,1],formes:[normalize('Prends la bête à '+number+' cornes'),normalize('Prends la bête à '+word+' cornes')]}]);
export const NODES = [
  ...onSong('30-vins-divins',1,[
    {id:'eg-14',source:'30 vins divins',answers:[...legacy('n-c').answers.map(a=>({...a,id:'eg-14-1'})),a('eg-14-2','Jésus')]},
    {id:'n-a',source:'57',answers:[answer('eg-16-1','12 apôtres',[['12','douze'],['apôtres','apotre']]),a('eg-16-2','Signes',['signe']),a('eg-16-3','Anges',['ange']),a('eg-16-4','Expansions harmonieuses')]},
    {id:'n-h',source:'Prends la bête à…',answers:[horns('n-h-2','10','dix'),horns('n-h-3','2','deux')]},
    {id:'eg-02',source:'XEU',answers:[a('eg-02-1','Dieu')]},
    {id:'eg-01',source:'Aigle',answers:[a('eg-01-1','Signe',['signes'])]},
    {...legacy('n-w'),visual:'line'},
    {id:'eg-05',source:'Mélange les…',answers:[answer('eg-05-1','Expansions harmonieuses',[['Expansions','expansion'],['harmonieuses','harmonieuse']],[{idx:[0,1],formes:['Mélange les expansion harmonieuse','Mélange les expansions harmonieuses'].map(normalize)}])]},
    {id:'eg-06',source:'M = M',visual:'infinity',answers:[
      {...answer('eg-06-1','Mécanisme = Matière',[['Mécanisme','mecanismes'],['Matière']]),seps:[' = ']},
      {...answer('eg-06-2','Méta-Moi = Moi',[['Méta-Moi','meta moi','metamoi'],['Moi']]),seps:[' = ']}
    ]},
  ]),
  ...onSong('sans-indice-dans-les-des',2,[
    {...legacy('n-g'),visual:'dice'},
    {...legacy('n-c'),source:'5 vins divins',answers:[...legacy('n-c').answers,a('n-c-2','Jésus')]},
    {...legacy('n-b'),answers:legacy('n-b').answers.map(a=>({...a,id:'eg-07-1'}))},
    {id:'eg-03',source:'Aiguille',answers:[a('eg-03-1','L’horloge',['horloge']),a('eg-03-2','le détail',['détail','détails','les détails','le(s) détail(s)'])]},
    {...legacy('n-k',['n-k-1']),answers:[a('n-k-1','Galaxies',['galaxie']),a('eg-17-1','Signes',['signe'])]},
  ]),
  ...onSong('13h20',3,[legacy('n-e',['n-e-2'])]),
  ...onSong('orange',4,[{id:'eg-15',source:'AA',answers:[answer('eg-15-1','Andromédien Autiste',[['Andromédien'],['Autiste']])]}]),
  {id:'eg-11',source:'2:24',subtitle:'13h20',music:'13h20',min:3,kind:'workshop',board:'first',requires:['eg-03-1'],answers:[a('eg-11-1','24 décembre · 24 / 12')]},
  {id:'eg-12',source:'3:50 ↔ 3:44',subtitle:'30 vins divins · Sans indices dans les dés',music:'sans-indice-dans-les-des',min:2,kind:'workshop',board:'pair',requires:['eg-03-1'],answers:[a('eg-12-1','2 × 57')]},
  {id:'eg-13',source:'2:39',subtitle:'Orange',music:'orange',min:4,kind:'workshop',board:'last',requires:['eg-03-1'],answers:[a('eg-13-1','57')]},
  {id:'eg-18',source:'114',subtitle:'Vulpis',music:'la-matiere-dense',min:5,kind:'workshop',board:'album',requires:['eg-03-1'],answers:[a('eg-18-1','57 · 2')]},
  {id:'eg-19',source:'18 juillet 2019',subtitle:'La date de l’album',music:'wanheda',min:8,kind:'workshop',board:'date',requires:['eg-03-1'],answers:[a('eg-19-1','57 · 07')]},
  {id:'eg-20',source:'3:54',subtitle:'Wanheda',music:'wanheda',min:8,kind:'workshop',board:'wanheda',requires:['eg-03-1'],answers:[a('eg-20-1','57')]},
  {id:'eg-21',source:'3:18 ↔ 3:18',subtitle:'Quand je vois je pense · Un fil entre deux infinis',music:'un-fil-entre-deux-infinis',min:10,kind:'workshop',board:'infinis',requires:['eg-03-1'],answers:[a('eg-21-1','666')]},
  ...onSong('wanheda',8,[{id:'n-0',source:'En nous collant au bon endroit, un troisième apparaîtra.',answers:[a('n-0-1','Devincix')]}]),
].map(n=>({...n,kind:n.kind||'riddle',requires:n.requires||[],min:n.min||1}));
// Retired records remain stored, but never add rungs to the current game.
const retiredAnswers=[['eg-02-2',1],['eg-03-3',1],['n-0-3',1]];
export const MAX_GAME_LEVEL=1+NODES.reduce((sum,n)=>sum+n.answers.length,0);
export const progressLevel=p=>1+p.solved.size;
const byId = new Map(NODES.map(n=>[n.id,n]));
const byAnswer = new Map(NODES.flatMap(n=>n.answers.map(a=>[a.id,{a,n}])));
const merged = {'n-a-2':'eg-01-1','n-k-2':'eg-01-1','n-b-1':'eg-01-1','eg-04-1':'eg-14-1'};
export function canonicalId(id) {
  const initial=oldId(id), m=/^(.+?)(\.p\d+)?$/.exec(initial);
  return (merged[m[1]]||m[1])+(m[2]||'');
}
export function progress(rows=[]) {
  const solved=new Set(),parts=new Map(),seen=new Set(),milestones=new Set();
  const previous=new Set(rows.filter(r=>r.solved_at).map(r=>oldId(r.riddle_id)));
  // The corrected interpretation keeps a completed historical rung. Only the
  // numeric fragment transfers; arc/ange fragments cannot solve « apôtres ».
  if(previous.has('n-a-4')||[0,1,2].every(i=>previous.has('n-a-4.p'+i)))solved.add('eg-16-1');
  else if(previous.has('n-a-4.p0'))parts.set('eg-16-1',new Set([0]));
  if(previous.has('eg-11-1.p0')&&previous.has('eg-11-1.p1'))solved.add('eg-11-1');
  for(const r of rows){
    if(!r.solved_at)continue;
    if(/^eg-11-1\.p\d+$/.test(r.riddle_id))continue;
    if(r.riddle_id.startsWith('@eg/seen/')){seen.add(r.riddle_id.slice(9));continue;}
    if(r.riddle_id===SHARE){milestones.add(SHARE);continue;}
    if(['n-a-2','n-a-2.p0'].includes(r.riddle_id))solved.add('eg-16-2');
    if(['n-k-2','n-k-2.p0'].includes(r.riddle_id))solved.add('eg-17-1');
    // Transfer the retired second numeric answer's earned rung to the second
    // formula. New submissions only accept the date, independently per formula.
    if(['eg-04-1','eg-04-1.p0'].includes(r.riddle_id)){solved.add('eg-14-1');continue;}
    // Restore Trompettes and retain the Aigle credit granted by the previous release.
    // New Trompettes submissions use a separate id and never auto-solve Aigle.
    if(['n-b-1','n-b-1.p0'].includes(r.riddle_id))solved.add('eg-07-1');
    const id=canonicalId(r.riddle_id), m=/^(.+)\.p(\d+)$/.exec(id);
    if(m){const entry=byAnswer.get(m[1]),i=+m[2];if(entry&&i<entry.a.parties.length){if(!parts.has(m[1]))parts.set(m[1],new Set());parts.get(m[1]).add(i);}}
    else if(byAnswer.has(id))solved.add(id);
  }
  for(const [id,set]of parts)if(set.size===byAnswer.get(id).a.parties.length)solved.add(id);
  // Existing completed duration work also preserves the discovered capability.
  if(solved.has('eg-12-1')||solved.has('eg-13-1'))milestones.add(SHARE);
  const retired=new Set(retiredAnswers.filter(([id,count])=>previous.has(id)||Array.from({length:count},(_,i)=>id+'.p'+i).every(key=>previous.has(key))).map(([id])=>id));
  return {solved,parts,seen,milestones,retired};
}
export const gameLevel = rows => progressLevel(progress(rows));
export const clockUnlocked = rows => has(progress(rows),'eg-03-1');
export function accessLevel(rows) {
  // Historical answers (including retired ones) still protect existing rights.
  // New discoveries progress at the old three-per-rank pace, never at game speed.
  const old=oldLevel(oldProgress(rows.filter(r=>r.solved_at).map(r=>oldId(r.riddle_id))).solved);
  return Math.max(old,Math.min(7,1+Math.floor((gameLevel(rows)-1)/3)));
}
export const getGameNode=id=>byId.get(id)||null;
function revealed(n,p){const r=n.reveal;return !r||(r.level!==undefined&&at(p,r.level))||(r.any&&any(p,r.any))||(r.seen&&r.seen.some(id=>p.seen.has(id)))||(r.milestone&&p.milestones.has(r.milestone));}
export function isVisible(n,p){return at(p,n.min)&&(n.kind!=='workshop'||has(p,'eg-03-1'))&&revealed(n,p);}
export function isPlayable(n,p){return isVisible(n,p)&&at(p,n.min)&&all(p,n.requires);}
function tokens(a,set){const out=[];for(let i=0;i<a.parties.length;i++){if(set.has(i))out.push({t:a.parties[i].t,sep:out.length?(set.has(i-1)?a.seps?.[i-1]||' ':' '):''});else if(!out.at(-1)?.q)out.push({q:true,sep:out.length?' ':''});}return out;}

export function buildGameState(rows=[]) {
  const p=progress(rows),pages=[];
  for(const n of NODES){
    if(!isVisible(n,p))continue;
    const found=n.answers.filter(a=>has(p,a.id)).map(a=>({id:a.id,label:a.label}));
    const partiels=n.answers.filter(a=>!has(p,a.id)&&p.parts.has(a.id)).map(a=>({id:a.id,jetons:tokens(a,p.parts.get(a.id))}));
    const missing=n.requires.filter(id=>!has(p,id));
    const deps=[...new Set(missing.map(id=>byAnswer.get(id).n.id))].map(id=>({id,title:byId.get(id).source||'La porte',kind:byId.get(id).kind})).filter(d=>isVisible(byId.get(d.id),p));
    pages.push({id:n.id,title:n.source||'',source:n.source,music:n.music,subtitle:n.subtitle||'',kind:n.kind,visual:n.visual==='infinity'?n.visual:null,board:n.board,
      total:n.silent?null:n.answers.length,found,partiels,open:found.length<n.answers.length,locked:!isPlayable(n,p),
      requirements:{level:n.min>progressLevel(p)?n.min:null,pages:deps}});
  }
  if(has(p,'eg-03-1'))pages.push({id:'eg-10',kind:'clock',title:'Horloge',source:'Horloge',visual:'clock',locked:false});
  for(const page of pages)page.href=page.kind==='clock'?'/signes/horloge':page.kind==='workshop'?`/signes/horloge#${page.id}`:`/signes#${page.id}`;
  const echelon=progressLevel(p);
  return {echelon,continuation:gameContinuation(echelon),pages,nodes:pages.filter(n=>['riddle','workshop'].includes(n.kind)),capabilities:has(p,'eg-03-1')?{share:true}:{}};
}
export function gameProfile(rows,viewerRows){const target=progress(rows),visible=new Set(buildGameState(viewerRows).pages.map(n=>n.id));return {echelon:progressLevel(target),enigmes:NODES.filter(n=>visible.has(n.id)).map(n=>({id:n.id,source:n.source,found:n.answers.filter(a=>target.solved.has(a.id)).length,total:n.silent?null:n.answers.length})).filter(n=>n.found)};}

export const boardSources={
  first:[{id:'a',value:2,label:'13h20 · minutes'},{id:'b',value:24,label:'13h20 · secondes'}],
  pair:[{id:'a',value:3,label:'30 vins divins · minutes'},{id:'b',value:50,label:'30 vins divins · secondes'},{id:'c',value:3,label:'Sans indices dans les dés · minutes'},{id:'d',value:44,label:'Sans indices dans les dés · secondes'}],
  last:[{id:'a',value:2,label:'Orange · minutes'},{id:'b',value:39,label:'Orange · secondes'}],
  album:[{id:'a',value:114,label:'Album'},{id:'b',value:2,label:'Bloc'}],
  date:[{id:'a',value:18,label:'Jour'},{id:'b',value:20,label:'Année · premier bloc'},{id:'c',value:19,label:'Année · deuxième bloc'},{id:'d',value:7,display:'07',fixed:true,label:'Juillet → 07'}],
  wanheda:[{id:'a',value:3,label:'Wanheda · minutes'},{id:'b',value:54,label:'Wanheda · secondes'}],
  infinis:[{id:'a',value:3,label:'Durée commune · minutes'},{id:'b',value:18,label:'Durée commune · secondes'}]
};
