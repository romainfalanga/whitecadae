// Private payloads are encrypted before D1. Bind the separate keyring as a
// Worker secret: {"active":"v1","keys":{"v1":"<base64 32 random bytes>"}}.
// Keep older versions during rotation. AAD prevents swapping rows or owners.
const encoder=new TextEncoder(),decoder=new TextDecoder(),cache=new WeakMap();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function ring(env){
  if(!cache.has(env))cache.set(env,(async()=>{
    const config=JSON.parse(env.PRIVATE_DATA_KEYS||'null');
    if(!config?.active||!config.keys?.[config.active])throw new Error('Private data key unavailable');
    const keys={};for(const [name,value] of Object.entries(config.keys)){
      if(!/^[a-zA-Z0-9_-]{1,24}$/.test(name)||bytes(value).length!==32)throw new Error('Invalid private key');
      keys[name]=await crypto.subtle.importKey('raw',bytes(value),'AES-GCM',false,['encrypt','decrypt']);
    }
    // A separate stable key keeps owner-scoped tag indexes valid across rotation.
    const index=await crypto.subtle.importKey('raw',bytes(config.index||config.keys[config.active]),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return {active:config.active,keys,index};
  })());
  return cache.get(env);
}
export async function seal(env,context,value){
  const {active,keys}=await ring(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},keys[active],encoder.encode(JSON.stringify(value)));
  return `${active}.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}
export async function unseal(env,context,value){
  const [version,iv,cipher]=value.split('.'),{keys}=await ring(env);
  return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(context)},keys[version],bytes(cipher))));
}
export async function tagHash(env,owner,tag){
  const {index}=await ring(env);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC',index,encoder.encode(`${owner}:${tag.normalize('NFKC').trim().toLocaleLowerCase('fr')}`))));
}
export function fail(message,status=400){throw new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
export async function objectBody(request,limit=48000){
  if(!request.body)fail('Une requête est nécessaire.');
  const reader=request.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('Ce contenu est trop long.',413);}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
  let body;try{body=JSON.parse(decoder.decode(buffer));}catch{fail('Requête invalide.');}
  if(!body||typeof body!=='object'||Array.isArray(body))fail('Requête invalide.');return body;
}
export function text(value,max=6000,required=false){
  if(value===undefined&&!required)return '';
  if(typeof value!=='string'||value.length>max||value.includes('\u0000'))fail('Texte invalide ou trop long.');
  const out=value.trim();if(required&&!out)fail('Ce champ est nécessaire.');return out;
}
export function identifier(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{8,64}$/.test(value))fail('Identifiant invalide.');return value;}
export function integer(value,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(value)||value<min||value>max)fail('Valeur invalide.');return value;}
export async function limitWrites(env,id){
  const now=Math.floor(Date.now()/1000);
  const result=await env.DB.prepare(`INSERT INTO private_write_limits(user_id,window_start,attempts) VALUES(?1,?2,1)
    ON CONFLICT(user_id) DO UPDATE SET window_start=CASE WHEN window_start<=?2-60 THEN ?2 ELSE window_start END,
    attempts=CASE WHEN window_start<=?2-60 THEN 1 ELSE attempts+1 END WHERE window_start<=?2-60 OR attempts<45`).bind(id,now).run();
  if(!result.meta.changes)fail('Prends quelques instants avant de réessayer.',429);
}
