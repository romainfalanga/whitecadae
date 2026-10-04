import {evaluate,validDraft} from './workshop-core.js';
export const operations=[['add','+','Additionner'],['sub','−','Soustraire'],['mul','×','Multiplier'],['div','÷','Diviser'],['join','│','Assembler'],['group','⋮','Répartir']];
const clone=x=>structuredClone(x);
export function restoreFlow(draft){const next=clone(draft);next.selected=next.selected.slice(0,1);return {draft:next,operator:null};}
export function chooseBlock(flow,index){
  if(!flow.draft.items[index])throw Error('Choisis un bloc disponible.');
  const next=clone(flow),first=next.draft.selected[0];
  if(next.operator&&first!==undefined){
    if(first===index)throw Error('Choisis un autre bloc pour compléter ce calcul.');
    next.draft.selected=[first,index];
  }else next.draft.selected=[index];
  return next;
}
export function chooseOperation(flow,operator){
  if(!operations.some(([op])=>op===operator))throw Error('Opération inconnue.');
  if(!flow.draft.selected.length)throw Error('Choisis d’abord un bloc.');
  const next=clone(flow);next.operator=operator;next.draft.selected=next.draft.selected.slice(0,1);return next;
}
export function cancelSelection(flow,part='all'){
  const next=clone(flow);
  if(part==='all')next.draft.selected=[];
  else next.draft.selected=next.draft.selected.slice(0,1);
  if(part!=='right')next.operator=null;
  return next;
}
export function transform(flow,spec,unary){
  const next=clone(flow),draft=next.draft,selected=unary?draft.selected.slice(0,1):draft.selected;
  const x=draft.items[selected[0]],y=draft.items[selected[1]];let output;
  if(!x)throw Error('Choisis d’abord un bloc.');
  if(unary==='split'){
    if(x.op!=='src'||String(evaluate(x,spec.sources).value).length<2)throw Error('Ce bloc ne peut pas être séparé.');
    output=[...String(evaluate(x,spec.sources).value)].map((_,index)=>({op:'part',ref:x.ref,index}));
  }else if(unary==='reuse')output=[x,{op:'reuse',arg:clone(x)}];
  else if(unary==='detach'){
    if(!x.left||x.op==='reuse')throw Error('Ce bloc ne peut pas être détaché.');output=[x.left,x.right];
  }else if(unary==='discard')output=[];
  else{
    if(unary||!next.operator||selected.length!==2)throw Error('Choisis une opération puis un second bloc.');
    output=[{op:next.operator,left:x,right:y}];evaluate(output[0],spec.sources);
  }
  draft.items=draft.items.filter((_,i)=>!selected.includes(i)).concat(output);
  draft.selected=output.length===1?[draft.items.length-1]:[];next.operator=null;
  validDraft(draft,spec);return next;
}
export function placeBlock(flow,spec,index){
  const next=clone(flow),draft=next.draft,slot=spec.slots[index];
  if(!slot||slot.fixed)throw Error('Ce bloc est déjà placé.');
  if(draft.answer[index]){draft.items.push(draft.answer[index]);draft.answer[index]=null;draft.selected=[draft.items.length-1];}
  else{
    if(next.operator)throw Error('Termine ou annule le calcul avant de placer ce bloc.');
    if(draft.selected.length!==1)throw Error('Choisis le bloc à placer.');
    draft.answer[index]=draft.items.splice(draft.selected[0],1)[0];draft.selected=[];
  }
  next.operator=null;validDraft(draft,spec);return next;
}
