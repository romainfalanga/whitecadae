import {NODES,buildGameState,progress,SHARE} from './echelon.js';

export const AA_STORY = {
  title:'AA', subtitle:'Avant Vulpis, Andromédien Autiste',
  paragraphs:[
    'Avant de devenir Vulpis, il se faisait appeler Andromédien Autiste. Le 18 juillet 2019 marque un basculement dans son histoire : il vit une dépersonnalisation, une expérience qui transforme sa manière de se percevoir et de penser.',
    'Il décrit alors une pensée qui ne passe plus d’abord par les mots. Elle prend la forme de mouvements de l’univers : des images se déplacent, des espaces se relient, des sensations se répondent. Il n’avait jamais ressenti une telle fluidité dans ses pensées.',
    'Ce qui était intérieur cherche peu à peu une forme à partager. Observer une pensée, la mettre en relation avec une autre, puis l’extérioriser devient une manière de mieux comprendre ce qui le compose. C’est de cette période que naît l’univers d’AA, avant que son chemin ne le conduise à Vulpis.',
    'Cette histoire se prolonge ici par une invitation : regarder autrement ce que l’on croit connaître, laisser dialoguer plusieurs lectures et donner une forme à ses idées. Un signe trouvé peut ouvrir une autre énigme, mais aussi une autre façon de penser.'
  ],
};

// The map is constructed exclusively from the viewer's visible territory.
// No future node, answer, global count or hidden prerequisite is serialized.
export function buildJourney(rows=[]) {
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
  return {echelon:game.echelon,nodes,edges,summary:{
    solved:riddles.filter(n=>n.status==='solved').length,
    available:riddles.filter(n=>['available','partial'].includes(n.status)).length,
    locked:riddles.filter(n=>n.status==='locked').length,
    remaining, horizon:game.echelon+remaining,
    uncounted:riddles.some(n=>n.total===null&&n.open),
  }};
}
