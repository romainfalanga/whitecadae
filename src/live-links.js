// Only official playback/invitation links are stored. No user-supplied embed
// HTML, arbitrary iframe host, fetch proxy or private streaming key is accepted.
export function liveLink(value=''){
  if(typeof value!=='string'||value.length>1000)throw new Error('Le lien du live est trop long.');
  if(!value.trim())return null;
  let url;try{url=new URL(value.trim());}catch{throw new Error('Ajoute un lien complet commençant par https://.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('Utilise un lien public https sans identifiants.');
  const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  let video;
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host))video=parts[0]==='watch'?url.searchParams.get('v'):['live','embed'].includes(parts[0])?parts[1]:null;
  if(host==='youtu.be')video=parts[0];
  if(video&&/^[A-Za-z0-9_-]{11}$/.test(video))return {provider:'youtube',label:'YouTube',id:video,url:'https://www.youtube.com/watch?v='+video};
  if(['twitch.tv','www.twitch.tv','m.twitch.tv'].includes(host)&&parts.length===1&&/^[a-zA-Z0-9_]{1,25}$/.test(parts[0])&&!['directory','settings','downloads','videos','search','subscriptions','inventory','wallet'].includes(parts[0].toLowerCase())){const channel=parts[0].toLowerCase();return {provider:'twitch',label:'Twitch',id:channel,url:'https://www.twitch.tv/'+channel};}
  const invite=host==='discord.gg'&&parts.length===1?parts[0]:['discord.com','www.discord.com'].includes(host)&&parts[0]==='invite'&&parts.length===2?parts[1]:null;
  if(invite&&/^[A-Za-z0-9_-]{2,100}$/.test(invite))return {provider:'discord',label:'Discord',url:'https://discord.gg/'+invite};
  if(['discord.com','www.discord.com'].includes(host)&&parts.length===3&&parts[0]==='channels'&&parts.slice(1).every(p=>/^\d{15,22}$/.test(p)))return {provider:'discord',label:'Discord',url:'https://discord.com/'+parts.join('/')};
  throw new Error('Utilise le lien de partage d’un live YouTube, d’une chaîne Twitch ou d’un salon Discord.');
}
