export const LOGE_UPLOAD_MAX_BYTES=200000000;
export const LOGE_UPLOAD_MAX_SECONDS=1800;
const uploadAbort=()=>new DOMException('Envoi interrompu','AbortError');
function uploadActive(signal){if(signal?.aborted)throw uploadAbort();}
export function validateLogeFile(file){
  if(!file)throw Error('Choisis une vidéo.');
  if(!Number.isFinite(file.size)||file.size<=0)throw Error('Ce fichier est vide.');
  if(file.size>LOGE_UPLOAD_MAX_BYTES)throw Error('La vidéo doit faire 200 Mo maximum.');
  if(file.type&&!file.type.startsWith('video/'))throw Error('Choisis un fichier vidéo.');
}
export function readLogeDuration(file,{signal}={}){
  uploadActive(signal);
  return new Promise((resolve,reject)=>{
    const video=document.createElement('video'),url=URL.createObjectURL(file);
    let timer;
    const finish=(error,duration)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);video.onloadedmetadata=video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);};
    const abort=()=>finish(uploadAbort());
    video.preload='metadata';video.onloadedmetadata=()=>finish(null,video.duration);
    // Some valid Stream formats cannot be decoded by the local browser. The server
    // remains authoritative for duration and format in that case.
    video.onerror=()=>finish(null,null);signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(null,null),10000);video.src=url;
  });
}
export function uploadLogeFile(uploadURL,file,{signal,onProgress=()=>{},xhrFactory=()=>new XMLHttpRequest(),formFactory=()=>new FormData()}={}){
  uploadActive(signal);
  return new Promise((resolve,reject)=>{
    const xhr=xhrFactory();let settled=false;
    const finish=error=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);xhr.onload=xhr.onerror=xhr.onabort=xhr.ontimeout=null;xhr.upload.onprogress=null;error?reject(error):resolve();};
    const abort=()=>{xhr.abort();finish(uploadAbort());};
    xhr.open('POST',uploadURL);xhr.timeout=30*60*1000;
    xhr.upload.onprogress=event=>{if(!signal?.aborted&&event.lengthComputable)onProgress(Math.min(100,Math.round(event.loaded/event.total*100)));};
    xhr.onload=()=>finish(xhr.status>=200&&xhr.status<300?null:Error('L’envoi a échoué. Réessaie.'));
    xhr.onerror=()=>finish(Error('Connexion interrompue. Réessaie.'));xhr.ontimeout=()=>finish(Error('L’envoi a expiré. Réessaie.'));xhr.onabort=()=>finish(uploadAbort());
    signal?.addEventListener('abort',abort,{once:true});
    const form=formFactory();form.append('file',file);
    try{xhr.send(form);}catch(error){finish(error);}
  });
}
function uploadWait(ms,signal){
  uploadActive(signal);return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(uploadAbort());},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});
  });
}
export async function ensureLogeUpload(draft,{request,signal,onState=()=>{},upload=uploadLogeFile,duration=readLogeDuration,wait=uploadWait,maxPolls=300}={}){
  const file=draft.file,requestId=draft.requestId,sameDraft=()=>draft.file===file&&draft.requestId===requestId;
  const check=()=>{uploadActive(signal);if(!sameDraft())throw uploadAbort();};
  check();validateLogeFile(file);
  const state=(status,progress)=>{if(!sameDraft())return;draft.uploadStatus=status;if(progress!==undefined)draft.uploadProgress=progress;if(!signal?.aborted)onState(status,progress);};
  if(!draft.durationChecked){state('checking');const seconds=await duration(file,{signal});check();if(Number.isFinite(seconds)&&seconds>LOGE_UPLOAD_MAX_SECONDS)throw Error('La vidéo doit durer 30 minutes maximum.');draft.durationChecked=true;}
  let result;
  if(draft.uploadId){result=await request('/api/loge/uploads/'+encodeURIComponent(draft.uploadId));check();}
  else{
    state('preparing');result=await request('/api/loge/uploads',{method:'POST',body:{requestId,filename:file.name,size:file.size}});
    if(!sameDraft()){
      draft.abandonedUploads||=[];draft.abandonedUploads.push(result.uploadId);
      try{await request('/api/loge/uploads/'+encodeURIComponent(result.uploadId),{method:'DELETE',body:{}});draft.abandonedUploads=draft.abandonedUploads.filter(id=>id!==result.uploadId);}catch{}
      throw uploadAbort();
    }
    // Remember a reservation even if navigation happened while its response arrived.
    draft.uploadId=result.uploadId;draft.uploadURL=result.uploadURL;draft.expiresAt=result.expiresAt;check();
  }
  if(result.status==='ready'){state('ready');return draft.uploadId;}
  if(result.status==='error')throw Error('Cette vidéo n’a pas pu être préparée. Sélectionne une vidéo pour recommencer.');
  if(result.status!=='processing'&&!draft.uploadSent){
    if(!draft.uploadURL)throw Error('Sélectionne de nouveau ta vidéo pour recommencer.');
    const expiry=typeof draft.expiresAt==='number'?(draft.expiresAt<1e12?draft.expiresAt*1000:draft.expiresAt):Date.parse(draft.expiresAt);
    if(Number.isFinite(expiry)&&expiry<=Date.now())throw Error('L’envoi a expiré. Sélectionne de nouveau ta vidéo.');
    state('uploading',0);await upload(draft.uploadURL,file,{signal,onProgress:value=>state('uploading',value)});check();draft.uploadSent=true;
  }
  state('processing');
  for(let count=0;count<maxPolls;count++){
    check();result=await request('/api/loge/uploads/'+encodeURIComponent(draft.uploadId));check();
    if(result.status==='ready'){state('ready');return draft.uploadId;}
    if(result.status==='error')throw Error('Cette vidéo n’a pas pu être préparée. Sélectionne une vidéo pour recommencer.');
    await wait(2000,signal);
  }
  throw Error('La vidéo est encore en préparation. Réessaie dans un instant.');
}
