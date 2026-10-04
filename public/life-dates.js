const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export function dateParts(value=''){
  const [year='',month='',day='']=String(value).split('-');
  return {year:/^\d{1,4}$/.test(year)?year:'',month:/^\d{1,2}$/.test(month)?month:'',day:/^\d{1,2}$/.test(day)?day:''};
}
export function dateFields(prefix,value='',label='Date'){
  const p=dateParts(value);
  return `<fieldset class="life-date-parts" id="${prefix}-fields"><legend>${label}</legend><div><label data-date-day>Jour<input name="${prefix}Day" inputmode="numeric" autocomplete="off" maxlength="2" pattern="[0-9]{1,2}" placeholder="JJ" value="${p.day}"></label><label data-date-month>Mois<select name="${prefix}Month"><option value="">Mois</option>${months.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${Number(p.month)===i+1?'selected':''}>${m}</option>`).join('')}</select></label><label>Année<input name="${prefix}Year" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" placeholder="AAAA" value="${p.year}"></label></div></fieldset>`;
}
export function configureDate(root,precision='day',required=true){
  root.hidden=precision==='unknown';
  for(const [key,visible] of [['Day',['day','period'].includes(precision)],['Month',precision!=='year'&&precision!=='unknown'],['Year',precision!=='unknown']]){
    const field=root.querySelector(`[name$="${key}"]`);field.disabled=!visible;field.required=visible&&required;field.closest('label').hidden=!visible;
  }
}
export function composeDate(parts,precision='day',{optional=false,draft=false}={}){
  if(precision==='unknown')return '';
  const values=[parts.year,...(precision!=='year'?[parts.month]:[]),...(['day','period'].includes(precision)?[parts.day]:[])].map(v=>String(v||'').trim());
  if(optional&&values.every(v=>!v))return '';
  if(!draft&&values.some(v=>!v))throw new Error('Complète le jour, le mois et l’année demandés.');
  const value=values.map((v,i)=>i===0||!v?v:v.padStart(2,'0')).join('-');
  if(draft)return value;
  const full=value+(precision==='year'?'-01-01':precision==='month'?'-01':'');const d=new Date(full+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(full)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==full||full<'0001-01-01')throw new Error('Cette date n’existe pas. Vérifie le jour, le mois et l’année.');
  const today=new Date(),limit=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if(full>limit)throw new Error('Choisis une date passée ou celle d’aujourd’hui.');
  return value;
}
export function readDate(form,prefix,precision,options){return composeDate({year:form.elements[prefix+'Year'].value,month:form.elements[prefix+'Month'].value,day:form.elements[prefix+'Day'].value},precision,options);}
