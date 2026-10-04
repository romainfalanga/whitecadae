// Keep only the video identifier. Never accept embed HTML or arbitrary hosts.
export function youtubeId(value){
  if(typeof value!=='string'||value.length>2048)return null;
  let url;try{url=new URL(value.trim());}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  const host=url.hostname;let id=null;
  if(host==='youtu.be')id=/^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  else if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host)){
    const noCookie=host.endsWith('youtube-nocookie.com');
    if(!noCookie&&url.pathname==='/watch'&&url.searchParams.getAll('v').length===1)id=url.searchParams.get('v');
    else id=(noCookie?/^\/embed\/([\w-]{11})\/?$/:/^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/).exec(url.pathname)?.[1];
  }
  return /^[\w-]{11}$/.test(id||'')?id:null;
}
export function youtubeLink(value){const id=youtubeId(value);return id?'https://www.youtube.com/watch?v='+id:'';}
export function youtubeEmbed(value){const id=youtubeId(value);return id?'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1&rel=0':'';}
