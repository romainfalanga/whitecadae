// Shared arithmetic and draft integrity. Puzzle solutions stay on the server.
export function evaluate(expr,sources,budget={left:150},depth=0){
  if(!expr||typeof expr!=='object'||Array.isArray(expr)||--budget.left<0||depth>12)throw Error('Construction trop complexe.');
  const source=sources.find(s=>s.id===expr.ref);
  if(expr.op==='src'||expr.op==='part'){
    if(!source)throw Error('Nombre inconnu.');
    if(source.fixed&&depth)throw Error('Le mois est déjà converti : conserve son bloc.');
    const digits=String(source.value);
    if(expr.op==='part'){
      if(source.fixed||digits.length<2||!Number.isInteger(expr.index)||expr.index<0||expr.index>=digits.length)throw Error('Chiffre inconnu.');
      return {value:+digits[expr.index],resources:[`${source.id}.${expr.index}`],shared:[]};
    }
    return {value:source.value,resources:[...digits].map((_,i)=>`${source.id}.${i}`),shared:[],display:source.display};
  }
  if(expr.op==='reuse'){
    const v=evaluate(expr.arg,sources,budget,depth+1);
    if(v.shared.length)throw Error('Ce bloc a déjà été dupliqué.');
    return {...v,shared:[...v.resources]};
  }
  const l=evaluate(expr.left,sources,budget,depth+1),r=evaluate(expr.right,sources,budget,depth+1);
  if(l.group||r.group)throw Error('Détache la répartition pour reprendre ses nombres.');
  let value,group;
  switch(expr.op){
    case 'add':value=l.value+r.value;break;
    case 'sub':value=l.value-r.value;break;
    case 'mul':value=l.value*r.value;break;
    case 'div':if(!r.value)throw Error('Division par zéro impossible.');value=l.value/r.value;break;
    case 'join':
      if(l.value<0||r.value<0||!Number.isInteger(l.value)||!Number.isInteger(r.value))throw Error('Assemble des nombres entiers positifs.');
      value=Number(String(l.value)+String(r.value));break;
    case 'group':
      if(!Number.isInteger(r.value)||r.value<2||r.value>9||!Number.isInteger(l.value)||l.value<1||l.value%r.value)throw Error('Choisis un total puis 2 à 9 groupes égaux, sans reste.');
      group={count:r.value,unit:l.value/r.value};value=l.value;break;
    default:throw Error('Opération inconnue.');
  }
  if(!Number.isFinite(value)||Math.abs(value)>999999)throw Error('Ce résultat est trop grand.');
  return {value,group,resources:[...l.resources,...r.resources],shared:[...l.shared,...r.shared]};
}

export function formatBlock(result,format){
  if(result.group){const {unit,count}=result.group;return format==='album'?`${unit}-${count}`:unit<10?String(unit).repeat(count):`${count} × ${unit}`;}
  return result.display||String(Number(result.value.toFixed(5)));
}

export function initialDraft(spec){
  return {version:2,items:spec.sources.filter(s=>!s.fixed).map(s=>({op:'src',ref:s.id})),answer:spec.slots.map(s=>s.fixed?{op:'src',ref:s.fixed}:null),selected:[]};
}

export function validDraft(draft,spec){
  if(!draft||draft.version!==2||!Array.isArray(draft.items)||draft.items.length>30||!Array.isArray(draft.answer)||draft.answer.length!==spec.slots.length||!Array.isArray(draft.selected)||draft.selected.length>2||JSON.stringify(draft).length>30000)throw Error('Brouillon invalide.');
  const counts=new Map(),shared=new Set();
  for(const expr of [...draft.items,...draft.answer.filter(Boolean)]){
    const v=evaluate(expr,spec.sources);for(const r of v.resources)counts.set(r,(counts.get(r)||0)+1);for(const r of v.shared)shared.add(r);
  }
  if([...counts].some(([r,n])=>n>(shared.has(r)?2:1)))throw Error('Un même nombre peut servir au maximum deux fois.');
  for(const source of spec.sources)for(const [i] of [...String(source.value)].entries())if(!counts.has(source.id+'.'+i))throw Error('Chaque nombre de départ doit rester dans ton raisonnement.');
  for(const [i,slot]of spec.slots.entries())if(slot.fixed&&(draft.answer[i]?.op!=='src'||draft.answer[i].ref!==slot.fixed||counts.get(slot.fixed+'.0')!==1))throw Error('Conserve le mois déjà converti dans sa réponse.');
  if(new Set(draft.selected).size!==draft.selected.length||draft.selected.some(i=>!Number.isInteger(i)||i<0||i>=draft.items.length))throw Error('Sélection invalide.');
  return {version:2,items:draft.items,answer:draft.answer,selected:draft.selected};
}

// Keep usable old work while adding answer slots; never silently lose a backup.
export function migrateDraft(old,spec){
  if(!old)return initialDraft(spec);
  let next=old.version===1?{...old,version:2,answer:spec.slots.map(()=>null)}:old;
  // The album now has two slots. Keep the previous construction intact so it
  // can be reclaimed and edited, without accepting the former single result.
  if(next.version===2&&spec.id==='album'&&next.answer?.length===1)next={...next,answer:[next.answer[0],null]};
  try{return validDraft(next,spec);}catch{return initialDraft(spec);}
}
