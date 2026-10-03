export const mechanismKind=slot=>slot<=5?'chosen':'innate';
export function mechanismFields(slot){
  return mechanismKind(slot)==='chosen'
    ?[['anchor','Mantra',500],['description','Description',16000]]
    :[['anchor','Mantra de l’amélioration',500],['description','Le mécanisme inné',12000],['improvement','Comment améliorer',8000]];
}
// Read old encrypted records without rewriting them or losing their detail.
export function normalizeMechanism(slot,value={}){
  const kind=mechanismKind(slot),modern=value.format===2;
  const parts=[value.description||''];
  if(!modern&&value.notice)parts.push('Ce que j’observe\n'+value.notice);
  if(!modern&&kind==='chosen'&&value.practice)parts.push('Mise en pratique\n'+value.practice);
  return {format:2,kind,title:value.title||'',anchor:value.anchor||'',description:parts.filter(Boolean).join('\n\n'),...(kind==='innate'?{improvement:modern?value.improvement||'':value.practice||''}:{})};
}
