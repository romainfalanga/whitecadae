import {seal,unseal,fail,text,integer} from './private-data.js';
import {recordTopic} from './circle-topics.js';
import {requireLevel,requireStorage} from './private-access.js';
import {normalizeMechanism,mechanismFields} from '../public/mechanism-model.js';

const DEFAULTS=[
  {title:'Toujours faire mieux',description:'Faire de l’amélioration un réflexe naturel. Comprendre ce qui façonne ma manière d’être, de penser et d’agir, puis élargir mon regard avec de nouvelles informations. Répéter cette démarche et essayer des ajustements concrets pour que chercher à faire mieux devienne une habitude intuitive.',practice:'Chercher une amélioration concrète à essayer, puis observer ce qu’elle change.',notice:'Ce qui influence mon point de vue et les informations qui me manquent.',anchor:'Une amélioration à la fois.'},
  {title:'Prendre du recul sur mes pensées et actions',description:'M’exercer à prendre du recul sur mes pensées et mes actions jusqu’à ce que ce réflexe devienne spontané. Repérer ce qui les déclenche, les schémas qui reviennent et les facteurs en jeu. À force d’observer et d’ajuster mes réactions, installer des automatismes plus proches de la personne que je choisis de devenir.',practice:'Revenir sur une situation : qu’ai-je pensé, fait et ressenti ? Qu’est-ce qui a pesé dans ma réaction ? Choisir un facteur à faire varier.',notice:'Les situations, les habitudes et les attentes qui reviennent.',anchor:'Comprendre avant de réagir.'},
  {title:'Passer du temps seul à réfléchir et créer',description:'Installer un rendez-vous quotidien avec moi-même jusqu’à ce que réfléchir et créer deviennent des habitudes naturelles. Revenir seul sur mes pensées et mes actions récentes, nourrir les deux premiers mécanismes, puis extérioriser ce que je comprends par la musique, l’écriture ou une autre création. La régularité ancre progressivement cette manière de fonctionner.',practice:'Choisir un moment calme pour relire ma journée ou les jours précédents, puis donner une forme à une pensée.',notice:'Ce que ce temps de recul et de création m’aide à comprendre.',anchor:'Un temps pour réfléchir, un espace pour créer.'},
];
const empty=()=>({title:'',description:'',practice:'',notice:'',anchor:''});
const context=(owner,slot)=>`mechanism:${owner}:${slot}`;
async function view(env,user,row,slot){return {slot,revision:row?.revision||0,...normalizeMechanism(slot,row?await unseal(env,context(user.id,slot),row.payload):DEFAULTS[slot-1]||empty())};}

export async function mechanismsRoute(request,env,url,user,body,json){
  const owner=url.searchParams.has('owner')?integer(Number(url.searchParams.get('owner')),1):user.id;
  if(owner!==user.id)fail('Les mécanismes sont personnels.',403);
  const suffix=url.pathname.replace(/^\/api\/mechanisms/,'').replace(/\/$/,''),method=request.method;
  if(suffix!=='/export')await requireLevel(env,user,12);
  if((suffix===''||suffix==='/export')&&method==='GET'){
    const rows=(await env.DB.prepare('SELECT * FROM user_mechanisms WHERE owner_id=?1 ORDER BY slot').bind(owner).all()).results;
    const mechanisms=await Promise.all(Array.from({length:10},(_,i)=>view(env,{id:owner},rows.find(r=>r.slot===i+1),i+1)));
    return json({mechanisms},200,suffix==='/export'?{'Content-Disposition':'attachment; filename="mes-mecanismes.json"'}:{});
  }
  const match=/^\/([1-9]|10)$/.exec(suffix);if(!match)fail('Mécanisme introuvable.',404);
  const slot=Number(match[1]);
  if(method==='GET'){const mechanism=await view(env,{id:owner},await env.DB.prepare('SELECT * FROM user_mechanisms WHERE owner_id=?1 AND slot=?2').bind(owner,slot).first(),slot);return json({mechanism});}
  if(method==='PUT'){
    await requireStorage(env,user.id);const revision=integer(body.revision);
    const input={};
    if(body.format!==undefined&&body.format!==2)fail('Format de mécanisme invalide.');
    const fields=body.format===2?[['title','Titre',140],...mechanismFields(slot)]:[['title','Titre',140],['description','Description',6000],['practice','Pratique',3000],['notice','Observation',3000],['anchor','Mantra',500]];
    for(const [key,,max] of fields)input[key]=text(body[key],max);
    if(body.format===2)input.format=2;
    const data=normalizeMechanism(slot,input);
    if(!data.title&&mechanismFields(slot).some(([key])=>data[key]))fail('Donne un nom à ce mécanisme.');
    const payload=await seal(env,context(user.id,slot),data);
    const statement=revision===0?env.DB.prepare('INSERT OR IGNORE INTO user_mechanisms(owner_id,slot,payload) VALUES(?1,?2,?3)').bind(user.id,slot,payload):
      env.DB.prepare("UPDATE user_mechanisms SET payload=?3,revision=revision+1,updated_at=datetime('now') WHERE owner_id=?1 AND slot=?2 AND revision=?4").bind(user.id,slot,payload,revision);
    const activity=data.title?recordTopic(env,{owner:user.id,key:'mechanism:'+slot,kind:'mechanism',slot,guard:'EXISTS(SELECT 1 FROM user_mechanisms WHERE owner_id=?1 AND slot=?6 AND payload=?7)',values:[payload]}):env.DB.prepare('DELETE FROM circle_topics WHERE owner_id=?1 AND mechanism_slot=?2 AND EXISTS(SELECT 1 FROM user_mechanisms WHERE owner_id=?1 AND slot=?2 AND payload=?3)').bind(user.id,slot,payload);
    const [result]=await env.DB.batch([statement,activity]);
    if(!result.meta.changes)fail('Ce mécanisme a changé dans une autre fenêtre. Ta saisie est conservée ; consulte la version enregistrée avant de réessayer.',409);
    return json({mechanism:{slot,revision:revision+1,...data}});
  }
  fail('Méthode indisponible.',405);
}
