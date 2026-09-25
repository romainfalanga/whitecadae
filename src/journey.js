import {NODES,buildGameState,progress,SHARE} from './echelon.js';

import {buildOpenings} from './content-access.js';

// The map is constructed exclusively from the viewer's visible territory.
// No future node, answer, global count or hidden prerequisite is serialized.
export function buildJourney(rows=[],user={}) {
  const game=buildGameState(rows),p=progress(rows);
  const visible=new Set(game.pages.map(n=>n.id));
  const owner=new Map(NODES.flatMap(n=>n.answers.map(a=>[a.id,n.id])));
  const edges=[];
  const nodes=game.pages.map(page=>{
    const rule=NODES.find(n=>n.id===page.id);
    const groups=new Map();
    const add=(id,type)=>{const from=page.kind==='workshop'&&id==='eg-03-1'&&visible.has('eg-10')?'eg-10':owner.get(id);if(!visible.has(from)||from===page.id)return;if(!groups.has(from))groups.set(from,{from,to:page.id,required:[],reveal:[]});groups.get(from)[type].push(id);};
    for(const id of rule?.requires||[])add(id,'required');
    for(const id of rule?.reveal?.any||[])add(id,'reveal');
    if(page.kind==='clock')add('eg-03-1','required');
    for(const g of groups.values()){
      const ids=[...new Set(g.required.length?g.required:g.reveal)];
      const found=ids.filter(id=>p.solved.has(id)).length;
      edges.push({from:g.from,to:g.to,type:g.from==='eg-10'?'passage':g.required.length?'required':'reveal',needed:g.required.length?ids.length:1,found:g.required.length?found:Math.min(1,found)});
    }
    if(rule?.reveal?.milestone===SHARE&&visible.has('eg-12')&&!groups.has('eg-12'))edges.push({from:'eg-12',to:page.id,type:'discovery',needed:1,found:p.milestones.has(SHARE)?1:0});
    const status=page.kind==='clock'?'passage':!page.open?'solved':page.locked?'locked':page.found.length||page.partiels.length?'partial':'available';
    return {...page,status,minLevel:rule?.min||0};
  });
  const riddles=nodes.filter(n=>n.kind!=='clock');
  const remaining=riddles.reduce((sum,n)=>sum+(n.total===null?0:n.total-n.found.length),0);
  return {echelon:game.echelon,nodes,edges,openings:buildOpenings(rows,user),summary:{
    solved:riddles.filter(n=>n.status==='solved').length,
    available:riddles.filter(n=>['available','partial'].includes(n.status)).length,
    locked:riddles.filter(n=>n.status==='locked').length,
    remaining, horizon:game.echelon+remaining,
    uncounted:riddles.some(n=>n.total===null&&n.open),
  }};
}
