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
  {id:'eg-01',source:'Aigle',group:'g-1',visual:'bird',answers:[a('eg-01-1','Signe',['signes'])]},
  {id:'eg-02',source:'XEU',group:'g-1',visual:'white',answers:[a('eg-02-1','Dieu'),a('eg-02-2','VALD')]},
  {...legacy('n-g'),group:'g-1',visual:'dice'},
  {id:'eg-03',source:'Aiguille',group:'g-1',visual:'needle',show:p=>has(p,'eg-01-1'),requires:['eg-01-1'],answers:[a('eg-03-1','Horloge'),a('eg-03-2','Les détails',['details','le detail','detail'])]},
  {...legacy('n-c'),group:'g-2',visual:'numbers',min:2,show:p=>at(p,1),answers:[...legacy('n-c').answers,a('eg-04-1','Jésus')]},
  {...legacy('n-w'),group:'g-3',visual:'line',min:2,show:p=>at(p,2)},
  {id:'eg-05',source:'Mélange-les…',group:'g-2',visual:'layers',show:p=>any(p,['eg-02-1','eg-02-2']),requires:['eg-02-1','eg-02-2'],answers:[answer('eg-05-1','Expansion harmonieuse',[['Expansion'],['harmonieuse']])]},
  {...legacy('n-h'),group:'g-2',visual:'shadow',min:3,show:p=>has(p,'n-g-1'),requires:['n-g-1']},
  {...legacy('n-e',['n-e-2']),group:'g-2',visual:'time',min:4,show:p=>has(p,'eg-03-1'),requires:['eg-03-1','eg-03-2']},
  {id:'eg-06',source:'M = M',group:'g-3',visual:'infinity',min:4,show:p=>has(p,'eg-05-1'),requires:['eg-05-1'],answers:[
    {...answer('eg-06-1','Mécanisme = matière',[['Mécanisme','mecanismes'],['matière']]),seps:[' = ']},
    {...answer('eg-06-2','Méta-moi = moi',[['Méta-moi','meta moi','metamoi'],['moi']]),seps:[' = ']}
  ]},
  {...legacy('n-a',['n-a-4']),group:'g-2',visual:'arcs',min:6,show:p=>any(p,['n-c-1','eg-04-1']),requires:['n-c-1','eg-04-1']},
  {...legacy('n-k',['n-k-1']),group:'g-3',visual:'stars',min:8,show:p=>has(p,'n-a-4'),requires:['n-a-4']},
  {...legacy('n-0'),source:'',group:'g-3',visual:'door',min:8,show:p=>at(p,8)},
  {id:'eg-11',source:'2:24',subtitle:'13h20',group:'g-2',kind:'workshop',board:'first',show:p=>has(p,'eg-03-1'),requires:['eg-03-1'],answers:[answer('eg-11-1','2 Jésus',[['2','deux'],['Jésus']])]},
  {id:'eg-12',source:'3:50 ↔ 3:44',subtitle:'30 vins divins · Sans indices dans les dés',group:'g-2',kind:'workshop',board:'pair',show:p=>has(p,'eg-03-1'),requires:['eg-03-1'],answers:[a('eg-12-1','2 × 57')]},
  {id:'eg-13',source:'2:39',subtitle:'Orange',group:'g-2',kind:'workshop',board:'last',show:p=>p.milestones.has(SHARE),requires:['eg-12-1'],answers:[a('eg-13-1','57')]},
].map(n=>({...n,kind:n.kind||'riddle',requires:n.requires||[],min:n.min||0}));
const byId = new Map(NODES.map(n=>[n.id,n]));
const byAnswer = new Map(NODES.flatMap(n=>n.answers.map(a=>[a.id,{a,n}])));
const merged = {'n-a-2':'eg-01-1','n-k-2':'eg-01-1','n-b-1':'eg-01-1'};
export function canonicalId(id) {
  const initial=oldId(id), m=/^(.+?)(\.p\d+)?$/.exec(initial);
  return (merged[m[1]]||m[1])+(m[2]||'');
}
export function progress(rows=[]) {
  const solved=new Set(),parts=new Map(),seen=new Set(),milestones=new Set();
  for(const r of rows){
    if(!r.solved_at)continue;
    if(r.riddle_id.startsWith('@eg/seen/')){seen.add(r.riddle_id.slice(9));continue;}
    if(r.riddle_id===SHARE){milestones.add(SHARE);continue;}
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
export function isVisible(n,p){return p.seen.has(n.id)||n.answers?.some(a=>has(p,a.id)||p.parts.has(a.id))||!n.show||n.show(p);}
export function isPlayable(n,p){return isVisible(n,p)&&at(p,n.min)&&all(p,n.requires);}
function tokens(a,set){const out=[];for(let i=0;i<a.parties.length;i++){if(set.has(i))out.push({t:a.parties[i].t,sep:out.length?(set.has(i-1)?a.seps?.[i-1]||' ':' '):''});else if(!out.at(-1)?.q)out.push({q:true,sep:out.length?' ':''});}return out;}

const reading=(id,title,group,visual,show,quotes,related)=>({id,title,source:title,kind:'reading',group,visual,show,quotes,related});
const READINGS=[
  reading('r-1','Trompettes','g-1','sound',p=>has(p,'eg-01-1'),[['30 vins divins','Tu verras les 57.'],['Sans indices dans les dés','T’entendras les trompettes.']],['eg-01','n-c','n-a']),
  reading('r-2','Chiffres et sonorités','g-2','numbers',p=>at(p,1),[['30 vins divins','30 vins divins'],['Sans indices dans les dés','5 vins divins']],['n-c','n-g','n-e']),
  reading('r-3','Carré d’as / carré d’anges','g-2','square',p=>has(p,'n-a-4'),[['13h20','Mon carré d’as est mon cœur de gravité.'],['Orange','Mon carré d’anges est là pour me protéger.']],['n-a','n-g']),
  reading('r-4','Fourmi / fourmilière','g-3','dots',p=>has(p,'eg-05-1'),[['Sans indices dans les dés','Je suis une fourmi, je suis la fourmilière.']],['eg-06','eg-05','r-5']),
  reading('r-5','Goutte / mer','g-3','water',p=>has(p,'eg-05-1'),[['Sans indices dans les dés','Une goutte d’eau infinie, je suis tout, je suis la mer.']],['eg-06','eg-03','r-4']),
  reading('r-6','Fini / infini','g-3','line',p=>has(p,'n-w-1')||has(p,'eg-05-1'),[['Orange','Un pied dans le fini, un autre dans l’infini, je suis au paradis.']],['n-w','eg-06']),
  reading('r-7','Angles / anges','g-3','arcs',p=>has(p,'n-a-4'),[['Orange','Arrondis les angles, tu les vois, de partout ya des anges.']],['n-a','r-3']),
  reading('r-8','Enfer / paradis','g-3','horizon',p=>at(p,8),[['13h20','Rejoignez-moi je vais passer de l’autre côté.'],['Orange','Rejoignez-moi, je suis passé de l’autre côté.']],['r-6','eg-05'])
];
const RELATED={ 'eg-01':['eg-03','r-1'],'eg-02':['eg-05','n-w'],'n-g':['n-h','r-2'],'eg-03':['eg-10','n-e','r-5'],'n-c':['n-a','n-e','r-1'],'n-w':['r-6','eg-02'],'eg-05':['eg-06','r-4','r-5'],'n-h':['n-g','n-c'],'n-e':['eg-10','n-c'],'eg-06':['r-4','r-5','r-6'],'n-a':['n-k','r-3','r-7'],'n-k':['n-a','r-8'],'eg-11':['eg-12','eg-10'],'eg-12':['eg-13','eg-11','eg-10'],'eg-13':['eg-12','eg-10']};
const slug = kind => ({riddle:'enigme',reading:'lecture',gallery:'galerie',workshop:'atelier',clock:'atelier'})[kind];
export function buildGameState(rows=[]) {
  const p=progress(rows),pages=[];
  for(const n of NODES){
    if(!isVisible(n,p))continue;
    const found=n.answers.filter(a=>has(p,a.id)).map(a=>({id:a.id,label:a.label}));
    const partiels=n.answers.filter(a=>!has(p,a.id)&&p.parts.has(a.id)).map(a=>({id:a.id,jetons:tokens(a,p.parts.get(a.id))}));
    const missing=n.requires.filter(id=>!has(p,id));
    const deps=[...new Set(missing.map(id=>byAnswer.get(id).n.id))].map(id=>({id,title:byId.get(id).source||'La porte',kind:byId.get(id).kind})).filter(d=>isVisible(byId.get(d.id),p));
    pages.push({id:n.id,title:n.source||'La porte',source:n.source,subtitle:n.subtitle||'',kind:n.kind,group:n.group,visual:n.visual||'door',board:n.board,
      total:n.silent?null:n.answers.length,found,partiels,open:found.length<n.answers.length,locked:!isPlayable(n,p),
      requirements:{level:n.min>p.solved.size?n.min:null,pages:deps},related:RELATED[n.id]||[]});
  }
  for(const r of READINGS)if(isVisible(r,p))pages.push({...r,show:undefined,locked:false});
  if(has(p,'eg-03-1')||p.seen.has('eg-10'))pages.push({id:'eg-10',kind:'clock',group:'g-2',title:'Horloge',source:'Horloge',visual:'clock',locked:false,related:['eg-11','eg-12','eg-13','eg-03']});
  for(const [id,title]of [['g-1','Observer'],['g-2','Relier'],['g-3','Transformer']])if(pages.some(n=>n.group===id))pages.push({id,kind:'gallery',title,source:title,group:id,locked:false});
  const ids=new Set(pages.map(n=>n.id));
  for(const page of pages){page.href=`/echelon/${slug(page.kind)}/${page.id}`;page.related=(page.related||[]).filter(id=>ids.has(id));}
  return {echelon:p.solved.size,pages,nodes:pages.filter(n=>['riddle','workshop'].includes(n.kind)),capabilities:has(p,'eg-03-1')?{share:p.milestones.has(SHARE)}:{}};
}
export function gameProfile(rows,viewerRows){const target=progress(rows),visible=new Set(buildGameState(viewerRows).pages.map(n=>n.id));return {echelon:target.solved.size,enigmes:NODES.filter(n=>visible.has(n.id)).map(n=>({id:n.id,source:n.source,found:n.answers.filter(a=>target.solved.has(a.id)).length,total:n.silent?null:n.answers.length})).filter(n=>n.found)};}

export const boardSources={
  first:[{id:'a',value:2,label:'13h20 · minutes'},{id:'b',value:24,label:'13h20 · secondes'}],
  pair:[{id:'a',value:3,label:'30 vins divins · minutes'},{id:'b',value:50,label:'30 vins divins · secondes'},{id:'c',value:3,label:'Sans indices dans les dés · minutes'},{id:'d',value:44,label:'Sans indices dans les dés · secondes'}],
  last:[{id:'a',value:2,label:'Orange · minutes'},{id:'b',value:39,label:'Orange · secondes'}]
};
