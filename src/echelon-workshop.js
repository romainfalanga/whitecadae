import {boardSources} from './echelon.js';

export function evaluate(expr,board,{share=false}={},budget={left:150},depth=0){
  if(!expr||typeof expr!=='object'||Array.isArray(expr)||--budget.left<0||depth>12)throw new Error('Construction trop complexe.');
  const sources=boardSources[board];if(!sources)throw new Error('Tableau inconnu.');
  const source=sources.find(s=>s.id===expr.ref);
  if(expr.op==='src'||expr.op==='part'){
    if(!source)throw new Error('Nombre inconnu.');
    const digits=String(source.value);
    if(expr.op==='part'){
      if(digits.length<2||!Number.isInteger(expr.index)||expr.index<0||expr.index>=digits.length)throw new Error('Chiffre inconnu.');
      return {value:+digits[expr.index],resources:[`${source.id}.${expr.index}`],shared:[]};
    }
    return {value:source.value,resources:[...digits].map((_,i)=>`${source.id}.${i}`),shared:[]};
  }
  if(expr.op==='reuse'){
    if(!share)throw new Error('Cette possibilité n’est pas encore découverte.');
    const v=evaluate(expr.arg,board,{share},budget,depth+1);
    if(v.shared.length)throw new Error('Ce nombre est déjà partagé.');
    return {...v,shared:[...v.resources]};
  }
  const l=evaluate(expr.left,board,{share},budget,depth+1),r=evaluate(expr.right,board,{share},budget,depth+1);
  let value;
  switch(expr.op){
    case 'add':value=l.value+r.value;break;
    case 'sub':value=l.value-r.value;break;
    case 'mul':value=l.value*r.value;break;
    case 'div':if(r.value===0)throw new Error('Division par zéro impossible.');value=l.value/r.value;break;
    case 'join':if(l.value<0||r.value<0||!Number.isInteger(l.value)||!Number.isInteger(r.value))throw new Error('Assemble des nombres entiers positifs.');value=Number(String(l.value)+String(r.value));break;
    default:throw new Error('Opération inconnue.');
  }
  if(!Number.isFinite(value)||Math.abs(value)>999999)throw new Error('Ce résultat est trop grand.');
  return {value,resources:[...l.resources,...r.resources],shared:[...l.shared,...r.shared]};
}
const unwrapped=e=>e.op==='reuse'?unwrapped(e.arg):e;
const terms=e=>unwrapped(e).op==='add'?[...terms(unwrapped(e).left),...terms(unwrapped(e).right)]:[e];
const sorted=a=>[...a].sort().join('|');
function isTerm(e,board,value,resources,share=true){try{const v=evaluate(e,board,{share});return v.value===value&&sorted(v.resources)===sorted(resources);}catch{return false;}}
function seven(e){try{const ts=terms(e);if(ts.length!==2)return false;return ts.some(t=>isTerm(t,'pair',3,['a.0'])||isTerm(t,'pair',3,['c.0']))&&ts.some(t=>isTerm(t,'pair',4,['d.0'])||isTerm(t,'pair',4,['d.1']));}catch{return false;}}
function collect(e,out=[],depth=0){if(!e||out.length>150||depth>12)return out;out.push(e);if(e.left)collect(e.left,out,depth+1);if(e.right)collect(e.right,out,depth+1);if(e.arg)collect(e.arg,out,depth+1);return out;}
export function hasTwoSevens(items){
  if(!Array.isArray(items)||items.length>30)return false;
  const candidates=items.flatMap(e=>collect(e)).filter(seven);
  return candidates.some((a,i)=>candidates.slice(i+1).some(b=>{
    try{return sorted([...evaluate(a,'pair').resources,...evaluate(b,'pair').resources])==='a.0|c.0|d.0|d.1';}catch{return false;}
  }));
}
export function validDraft(draft,board,share){
  if(!draft||draft.version!==1||!Array.isArray(draft.items)||draft.items.length>30||!Array.isArray(draft.selected)||draft.selected.length>2)throw new Error('Brouillon invalide.');
  const encoded=JSON.stringify(draft);if(encoded.length>30000)throw new Error('Brouillon trop grand.');
  const counts=new Map(),shared=new Set();
  for(const e of draft.items){const v=evaluate(e,board,{share});for(const r of v.resources)counts.set(r,(counts.get(r)||0)+1);for(const r of v.shared)shared.add(r);}
  if([...counts].some(([r,n])=>n>(shared.has(r)?2:1)))throw new Error('Un nombre partagé peut servir deux fois.');
  if(new Set(draft.selected).size!==draft.selected.length||draft.selected.some(i=>!Number.isInteger(i)||i<0||i>=draft.items.length))throw new Error('Sélection invalide.');
  return {version:1,items:draft.items,selected:draft.selected};
}
export function validateConstruction(board,roots,share){
  if(!Array.isArray(roots)||roots.length>2||!roots.length)return false;
  try{
    const values=roots.map(e=>evaluate(e,board,{share}));
    const counts=new Map();for(const v of values)for(const r of v.resources)counts.set(r,(counts.get(r)||0)+1);
    const shared=new Set(values.flatMap(v=>v.shared));
    if([...counts].some(([r,n])=>n>(shared.has(r)?2:1)))return false;
    if(board==='first')return roots.length===2&&values.some(v=>v.value===2&&sorted(v.resources)==='a.0')&&values.some(v=>v.value===24&&sorted(v.resources)==='b.0|b.1');
    if(board==='pair'){
      if(roots.length!==2||!share||values.some(v=>v.value!==57))return false;
      if(sorted([...counts])!==sorted([['a.0',1],['b.0',2],['b.1',2],['c.0',1],['d.0',1],['d.1',1]]))return false;
      if(sorted(shared)!=='b.0|b.1')return false;
      return roots.every(e=>{const ts=terms(e);return ts.length===3&&ts.some(t=>isTerm(t,'pair',50,['b.0','b.1']))&&ts.some(t=>isTerm(t,'pair',3,['a.0'])||isTerm(t,'pair',3,['c.0']))&&ts.some(t=>isTerm(t,'pair',4,['d.0'])||isTerm(t,'pair',4,['d.1']));});
    }
    if(board==='last'){
      const e=roots[0];if(roots.length!==1||!share||e.op!=='join'||values[0].value!==57)return false;
      const left=terms(e.left),right=unwrapped(e.right);
      return left.length===2&&left.some(t=>isTerm(t,'last',2,['a.0']))&&left.some(t=>isTerm(t,'last',3,['b.0']))&&right.op==='sub'&&isTerm(right.left,'last',9,['b.1'])&&isTerm(right.right,'last',2,['a.0'])&&sorted(shared)==='a.0'&&counts.get('a.0')===2;
    }
  }catch{return false;}
  return false;
}
