import {gameLevel,accessLevel} from './echelon.js';
import {RELEASES,canListen} from './music-catalogue.js';

export function contentAccess(user,rows=[]){
  const level=gameLevel(rows),legacy=accessLevel(rows),admin=!!user?.is_admin;
  return {level,legacy,admin,gameMaster:!!user&&level>=11,mechanisms:!!user&&level>=15,lifeTree:!!user&&level>=18,aceSquare:!!user&&level>=20,conversation:false,topics:false,videographie:false};
}

// A single schedule drives the home page, rewards and protected media.
export function buildOpenings(rows=[],user={}){
  const access=contentAccess(user,rows);
  const items=RELEASES.flatMap(album=>album.tracks.map(track=>({id:'music-'+track.slug,title:track.title,description:album.album+' · musique et paroles',level:track.minLevel,open:canListen(track,access),href:'/musique#track-'+track.slug,lyricsHref:'/chanson/'+track.slug})));
  for(const [id,title,level,href] of [['gameMaster','Game Master Orange',11,'/game-master-orange'],['mechanisms','Mécanisme',15,'/mecanisme'],['lifeTree','Arbre de vie',18,'/arbre-de-vie'],['aceSquare','Carré d’AS',20,'/carre-d-as']])items.push({id:'page-'+id,title,level,href,open:access[id]});
  const pending=items.filter(item=>!item.open&&item.level>access.level);
  const nextLevel=pending.length?Math.min(...pending.map(item=>item.level)):null;
  return {author:access.admin,nextLevel,items:items.filter(item=>item.open||item.level<=nextLevel).sort((a,b)=>a.level-b.level).map(item=>{
    const {href,lyricsHref,...visible}=item;
    return {...visible,...(item.open?{href,lyricsHref}:{}),exception:item.open&&access.level<item.level?'author':null};
  })};
}
export function newlyOpened(before,after,user){
  const known=new Set(buildOpenings(before,user).items.filter(item=>item.open).map(item=>item.id));
  return buildOpenings(after,user).items.filter(item=>item.open&&!known.has(item.id));
}
