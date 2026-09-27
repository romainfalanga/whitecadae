import {gameLevel,accessLevel} from './echelon.js';
import {RELEASES,canListen} from './music-catalogue.js';

export const CONVERSATION_LEVEL=2;
export const TOPIC_LEVELS=[12,18,23];
export const topicLimit=level=>TOPIC_LEVELS.filter(minimum=>level>=minimum).length;
export const VIDEO_LEVEL=12;
export function contentAccess(user,rows=[]){
  const level=gameLevel(rows),legacy=accessLevel(rows),admin=!!user?.is_admin;
  return {level,legacy,admin,
    conversation:!!user&&(admin||level>=CONVERSATION_LEVEL),
    topics:!!user&&level>=TOPIC_LEVELS[0],
    videographie:!!user&&(admin||level>=VIDEO_LEVEL),
  };
}

// This is also the access policy used by the APIs, not a separate UI schedule.
export function buildOpenings(rows=[],user={}){
  const access=contentAccess(user,rows);
  const items=[
    {id:'home',title:'Escape Game Orange',description:'L’histoire et le point de départ du jeu.',level:0,open:true,href:'/'},
    {id:'lyrics',title:'Paroles',description:'Lire les textes des morceaux auxquels tu as accès.',level:0,open:true,href:'/paroles'},
    {id:'echelons',title:'Échelons',description:'Proposer les signes et conserver les découvertes sur ton compte.',level:0,open:true,href:'/echelon'},
    {id:'profile',title:'Mon profil et mon arborescence',description:'Suivre tes découvertes et les chemins qui s’ouvrent.',level:0,open:true,href:user.username?'/membre/'+encodeURIComponent(user.username):'/parcours'},
    {id:'conversation',title:'Conversation générale',description:'La discussion commune, avec les messages accessibles à ton échelon.',level:CONVERSATION_LEVEL,open:access.conversation,href:'/conversation'},
    ...RELEASES.flatMap(album=>album.tracks.map(track=>({id:'music-'+track.slug,title:track.title,description:album.album+' · musique et paroles',level:track.minLevel,open:canListen(track,access),href:'/musique#track-'+track.slug,lyricsHref:'/chanson/'+track.slug}))),
    ...TOPIC_LEVELS.map((level,index)=>({id:index?'conversation-topic-'+(index+1):'conversation-topics',title:index?'Créer un '+(index===1?'deuxième':'troisième')+' sujet':'Tous les sujets · créer un premier sujet',description:index?'Un salon supplémentaire pour échanger.':'Accéder aux salons et créer ton premier sujet de conversation.',level,open:access.level>=level,href:'/sujets'})),
    ...TOPIC_LEVELS.map((level,index)=>({id:'conversation-project-'+(index+1),title:index?'Créer un '+(index===1?'deuxième':'troisième')+' projet':'Tous les projets · créer un premier projet',description:'Construire un projet ensemble, de la réflexion aux actions.',level,open:access.level>=level,href:'/projets'})),
    {id:'conversation-brainstorm',title:'Brainstorm',description:'Organiser et rejoindre les séances autour des sujets et des projets.',level:12,open:access.topics,href:'/brainstorm'},
  ];
  const pending=items.filter(item=>!item.open&&item.level>access.level);
  const nextLevel=pending.length?Math.min(...pending.map(item=>item.level)):null;
  return {author:access.admin,nextLevel,items:items.filter(item=>access.admin||item.open||item.level<=nextLevel).sort((a,b)=>a.level-b.level).map(item=>{
    const {href,lyricsHref,...visible}=item;
    return {...visible,...(item.open?{href,...(lyricsHref?{lyricsHref}:{})}:{}),
      exception:item.open&&access.level<item.level?(access.admin?'author':'historical'):null};
  })};
}

export function newlyOpened(before,after,user){
  const known=new Set(buildOpenings(before,user).items.filter(item=>item.open).map(item=>item.id));
  return buildOpenings(after,user).items.filter(item=>item.open&&!known.has(item.id));
}
