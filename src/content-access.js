import {gameLevel,accessLevel} from './echelon.js';
import {ECHELON_CONVERSATION,ECHELON_VIDEOGRAPHIE} from './enigmas57.js';
import {RELEASES,canListen} from './music-catalogue.js';

export const CONVERSATION_LEVEL=2;
// Historical rank 4 corresponds to nine completed answers in the current game.
export const VIDEO_LEVEL=3*(ECHELON_VIDEOGRAPHIE-1);
export function contentAccess(user,rows=[]){
  const level=gameLevel(rows),legacy=accessLevel(rows),admin=!!user?.is_admin;
  return {level,legacy,admin,
    conversation:!!user&&(admin||level>=CONVERSATION_LEVEL||legacy>=ECHELON_CONVERSATION),
    videographie:!!user&&(admin||legacy>=ECHELON_VIDEOGRAPHIE),
  };
}

// This is also the access policy used by the APIs, not a separate UI schedule.
export function buildOpenings(rows=[],user={}){
  const access=contentAccess(user,rows);
  const items=[
    {id:'home',title:'Escape Game Orange',description:'L’histoire et le point de départ du jeu.',level:0,open:true,href:'/'},
    {id:'music-57',title:'57',description:'Les quatre morceaux de Vulpis, dans Musiques.',level:0,open:true,href:'/musique#album-57'},
    {id:'lyrics',title:'Paroles',description:'Lire les textes des morceaux auxquels tu as accès.',level:0,open:true,href:'/paroles'},
    {id:'echelons',title:'Échelons',description:'Proposer les signes et conserver les découvertes sur ton compte.',level:0,open:true,href:'/echelon'},
    {id:'profile',title:'Mon profil et mon arborescence',description:'Suivre tes découvertes et les chemins qui s’ouvrent.',level:0,open:true,href:user.username?'/membre/'+encodeURIComponent(user.username):'/parcours'},
    {id:'conversation',title:'Conversation',description:'Échanger des indices, des interprétations et des idées. Chaque message conserve son propre niveau d’accès.',level:CONVERSATION_LEVEL,open:access.conversation,href:'/conversation'},
    ...RELEASES.flatMap(album=>album.tracks.map(track=>({id:'music-'+track.slug,title:track.title,description:album.album+' · musique et paroles',level:track.minLevel,open:canListen(track,access),href:'/musique#track-'+track.slug,lyricsHref:'/chanson/'+track.slug}))),
    {id:'videographie',title:'Vidéographie',description:'Accéder à l’espace de vidéographie et à ses récapitulatifs.',level:VIDEO_LEVEL,open:access.videographie,href:'/videographie'},
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
