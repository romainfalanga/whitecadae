// Server-only catalogue. Answers, undiscovered pages and the final ceiling
// must never be copied into a browser bundle.
import { NODES as OLD, compileAnswer, normalize, currentAnswerId as oldId,
  echelonOf as oldLevel, progresOf as oldProgress } from './enigmas57.js';

export const SHARE = '@eg/share';
const legacy = (id, keep) => ({ ...OLD.find(n => n.id === id), answers: OLD.find(n => n.id === id).answers.filter(a => !keep || keep.includes(a.id)) });
function answer(id, label, parts, extra = []) {
  const a = { id, label, parties: parts.map(p => ({ t: p[0], formes: p.map(normalize) })), extra };
  a.moteur = compileAnswer(a); return a;
}
const a = (id, label, forms = []) => answer(id, label, [[label, ...forms]]);
const has = (p, id) => p.solved.has(id);
const all = (p, ids) => ids.every(id => has(p, id));
const at = (p, n) => p.solved.size >= n;
const any = (p, ids) => ids.some(id => has(p, id));

export const NODES = [
  {...legacy('n-0'),source:''},
  {id:'eg-01',source:'Aigle',visual:'bird',answers:[a('eg-01-1','Signe',['signes'])]},
  {id:'eg-02',source:'XEU',answers:[a('eg-02-1','Dieu'),a('eg-02-2','VALD')]},
  {...legacy('n-b'),visual:'sound',reveal:{any:['eg-01-1'],seen:['r-1']},answers:legacy('n-b').answers.map(a=>({...a,id:'eg-07-1'}))},
  {id:'eg-03',source:'Aiguille',reveal:{any:['eg-01-1']},requires:['eg-01-1'],answers:[a('eg-03-1','Horloge'),a('eg-03-2','Détails')]},
  {...legacy('n-c'),source:'5 vins divins',min:2,reveal:{level:1}},
  {...legacy('n-w'),visual:'line',min:2,reveal:{level:2}},
  {id:'eg-05',source:'Mélange-les…',visual:'layers',reveal:{any:['eg-02-1','eg-02-2']},requires:['eg-02-1','eg-02-2'],answers:[answer('eg-05-1','Expansion harmonieuse',[['Expansion'],['harmonieuse']])]},
  {...legacy('n-h'),visual:'shadow',min:3,reveal:{any:['n-g-1']},requires:['n-g-1']},
  {...legacy('n-e',['n-e-2']),visual:'time',min:4,reveal:{any:['eg-03-1']},requires:['eg-03-1','eg-03-2']},
  {id:'eg-14',source:'30 vins divins',min:2,reveal:{level:2},answers:legacy('n-c').answers.map(a=>({...a,id:'eg-14-1'}))},
  {id:'eg-06',source:'M = M',visual:'infinity',min:4,reveal:{any:['eg-05-1']},requires:['eg-05-1'],answers:[
    {...answer('eg-06-1','Mécanisme = matière',[['Mécanisme','mecanismes'],['matière']]),seps:[' = ']},
    {...answer('eg-06-2','Méta-moi = moi',[['Méta-moi','meta moi','metamoi'],['moi']]),seps:[' = ']}
  ]},
  {id:'n-a',source:'57',min:6,reveal:{any:['n-c-1','eg-14-1']},requires:['n-c-1','eg-14-1'],answers:[answer('eg-16-1','12 apôtres',[['12','douze'],['apôtres','apotre']]),a('eg-16-2','Signe',['signes'])]},
  {...legacy('n-g'),visual:'dice'},
  {id:'eg-15',source:'AA',min:5,reveal:{level:5},answers:[answer('eg-15-1','Andromédien autiste',[['Andromédien'],['autiste']])]},
  {...legacy('n-k',['n-k-1']),visual:'stars',min:8,reveal:{any:['eg-16-1']},requires:['eg-16-1'],answers:[...legacy('n-k',['n-k-1']).answers,a('eg-17-1','Signe',['signes'])]},
  {id:'eg-11',source:'2:24',subtitle:'13h20',kind:'workshop',board:'first',reveal:{any:['eg-03-1']},requires:['eg-03-1'],answers:[answer('eg-11-1','2 Jésus',[['2','deux'],['Jésus']])]},
  {id:'eg-12',source:'3:50 ↔ 3:44',subtitle:'30 vins divins · Sans indices dans les dés',kind:'workshop',board:'pair',reveal:{any:['eg-03-1']},requires:['eg-03-1'],answers:[a('eg-12-1','2 × 57')]},
  {id:'eg-13',source:'2:39',subtitle:'Orange',kind:'workshop',board:'last',reveal:{milestone:SHARE,any:['eg-12-1']},requires:['eg-12-1'],answers:[a('eg-13-1','57')]},
].map(n=>({...n,kind:n.kind||'riddle',requires:n.requires||[],min:n.min||0}));
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
  for(const r of rows){
    if(!r.solved_at)continue;
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
  return {solved,parts,seen,milestones};
}
export const gameLevel = rows => progress(rows).solved.size;
export function accessLevel(rows) {
  // Historical answers (including retired ones) still protect existing rights.
  // New discoveries progress at the old three-per-rank pace, never at game speed.
  const old=oldLevel(oldProgress(rows.filter(r=>r.solved_at).map(r=>oldId(r.riddle_id))).solved);
  return Math.max(old,Math.min(7,1+Math.floor(gameLevel(rows)/3)));
}
export const getGameNode=id=>byId.get(id)||null;
function revealed(n,p){const r=n.reveal;return !r||(r.level!==undefined&&at(p,r.level))||(r.any&&any(p,r.any))||(r.seen&&r.seen.some(id=>p.seen.has(id)))||(r.milestone&&p.milestones.has(r.milestone));}
export function isVisible(n,p){return p.seen.has(n.id)||n.answers?.some(a=>has(p,a.id)||p.parts.has(a.id))||revealed(n,p);}
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
    pages.push({id:n.id,title:n.source||'',source:n.source,subtitle:n.subtitle||'',kind:n.kind,visual:n.visual==='infinity'?n.visual:null,board:n.board,
      total:n.silent?null:n.answers.length,found,partiels,open:found.length<n.answers.length,locked:!isPlayable(n,p),
      requirements:{level:n.min>p.solved.size?n.min:null,pages:deps}});
  }
  if(has(p,'eg-03-1')||p.seen.has('eg-10'))pages.push({id:'eg-10',kind:'clock',title:'Horloge',source:'Horloge',visual:'clock',locked:false});
  for(const page of pages)page.href=page.kind==='clock'?'/echelon/horloge':page.kind==='workshop'?`/echelon/horloge#${page.id}`:`/echelon#${page.id}`;
  return {echelon:p.solved.size,pages,nodes:pages.filter(n=>['riddle','workshop'].includes(n.kind)),capabilities:has(p,'eg-03-1')?{share:p.milestones.has(SHARE)}:{}};
}
export function gameProfile(rows,viewerRows){const target=progress(rows),visible=new Set(buildGameState(viewerRows).pages.map(n=>n.id));return {echelon:target.solved.size,enigmes:NODES.filter(n=>visible.has(n.id)).map(n=>({id:n.id,source:n.source,found:n.answers.filter(a=>target.solved.has(a.id)).length,total:n.silent?null:n.answers.length})).filter(n=>n.found)};}

export const boardSources={
  first:[{id:'a',value:2,label:'13h20 · minutes'},{id:'b',value:24,label:'13h20 · secondes'}],
  pair:[{id:'a',value:3,label:'30 vins divins · minutes'},{id:'b',value:50,label:'30 vins divins · secondes'},{id:'c',value:3,label:'Sans indices dans les dés · minutes'},{id:'d',value:44,label:'Sans indices dans les dés · secondes'}],
  last:[{id:'a',value:2,label:'Orange · minutes'},{id:'b',value:39,label:'Orange · secondes'}]
};
