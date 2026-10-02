import {seal,unseal,fail,text,integer} from './private-data.js';
import {requireLevel,requireStorage} from './private-access.js';

const DEFAULTS=[
  {title:'Toujours faire mieux',description:'Comprendre ce qui façonne ma manière d’être, de penser et d’agir pour la faire évoluer. Élargir mon regard avec de nouvelles informations, comprendre d’où vient mon point de vue et choisir ce que je peux améliorer.',practice:'Chercher une amélioration concrète à essayer, puis observer ce qu’elle change.',notice:'Ce qui influence mon point de vue et les informations qui me manquent.',anchor:'Une amélioration à la fois.'},
  {title:'Prendre du recul sur mes pensées et actions',description:'Observer mes pensées et mes actions pour comprendre ce qui les déclenche. Repérer les schémas qui reviennent, distinguer les facteurs en jeu et essayer de changer ce qui peut faire évoluer ma manière de réagir.',practice:'Revenir sur une situation : qu’ai-je pensé, fait et ressenti ? Qu’est-ce qui a pesé dans ma réaction ? Choisir un facteur à faire varier.',notice:'Les situations, les habitudes et les attentes qui reviennent.',anchor:'Comprendre avant de réagir.'},
  {title:'Passer du temps seul à réfléchir et créer',description:'Garder chaque jour un moment seul pour revenir sur mes pensées et mes actions récentes. Relier ce que j’observe aux deux premiers mécanismes, puis extérioriser ce que je comprends de moi par la musique, l’écriture ou une autre forme de création.',practice:'Choisir un moment calme pour relire ma journée ou les jours précédents, puis donner une forme à une pensée.',notice:'Ce que ce temps de recul et de création m’aide à comprendre.',anchor:'Un temps pour réfléchir, un espace pour créer.'},
];
const empty=()=>({title:'',description:'',practice:'',notice:'',anchor:''});
const context=(owner,slot)=>`mechanism:${owner}:${slot}`;
async function view(env,user,row,slot){return {slot,revision:row?.revision||0,...(row?await unseal(env,context(user.id,slot),row.payload):DEFAULTS[slot-1]||empty())};}

export async function mechanismsRoute(request,env,url,user,body,json){
  if(url.searchParams.has('owner')&&url.searchParams.get('owner')!==String(user.id))fail('Ces mécanismes sont privés.',403);
  const suffix=url.pathname.replace(/^\/api\/mechanisms/,'').replace(/\/$/,''),method=request.method;
  if(suffix!=='/export')await requireLevel(env,user,15);
  if((suffix===''||suffix==='/export')&&method==='GET'){
    const rows=(await env.DB.prepare('SELECT * FROM user_mechanisms WHERE owner_id=?1 ORDER BY slot').bind(user.id).all()).results;
    const mechanisms=await Promise.all(Array.from({length:10},(_,i)=>view(env,user,rows.find(r=>r.slot===i+1),i+1)));
    return json({mechanisms},200,suffix==='/export'?{'Content-Disposition':'attachment; filename="mes-mecanismes.json"'}:{});
  }
  const match=/^\/([1-9]|10)$/.exec(suffix);if(!match)fail('Mécanisme introuvable.',404);
  const slot=Number(match[1]);
  if(method==='GET')return json({mechanism:await view(env,user,await env.DB.prepare('SELECT * FROM user_mechanisms WHERE owner_id=?1 AND slot=?2').bind(user.id,slot).first(),slot)});
  if(method==='PUT'){
    await requireStorage(env,user.id);const revision=integer(body.revision),data={};
    for(const [key,max] of [['title',140],['description',6000],['practice',3000],['notice',3000],['anchor',500]])data[key]=text(body[key],max);
    if(!data.title&&Object.values(data).some(Boolean))fail('Donne un nom à ce mécanisme.');
    const payload=await seal(env,context(user.id,slot),data);
    const result=revision===0?await env.DB.prepare('INSERT OR IGNORE INTO user_mechanisms(owner_id,slot,payload) VALUES(?1,?2,?3)').bind(user.id,slot,payload).run():
      await env.DB.prepare("UPDATE user_mechanisms SET payload=?3,revision=revision+1,updated_at=datetime('now') WHERE owner_id=?1 AND slot=?2 AND revision=?4").bind(user.id,slot,payload,revision).run();
    if(!result.meta.changes)fail('Ce mécanisme a changé dans une autre fenêtre. Ta saisie est conservée ; consulte la version enregistrée avant de réessayer.',409);
    return json({mechanism:{slot,revision:revision+1,...data}});
  }
  fail('Méthode indisponible.',405);
}
