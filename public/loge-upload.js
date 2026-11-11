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
    // A dropped connection or a lost response can be retried on the same address.
    xhr.onerror=()=>finish(Object.assign(Error('La connexion a été interrompue pendant l’envoi.'),{network:true}));xhr.ontimeout=()=>finish(Object.assign(Error('L’envoi a expiré.'),{network:true}));xhr.onabort=()=>finish(uploadAbort());
    signal?.addEventListener('abort',abort,{once:true});
    const form=formFactory();form.append('file',file);
    try{xhr.send(form);}catch(error){finish(error);}
  });
}
// After a cut, wait a moment, then for the network and for the page to be
// visible again: a phone that locked its screen suspends the transfer.
export function uploadReconnect(ms,signal){
  uploadActive(signal);
  const ready=()=>(typeof navigator==='undefined'||navigator.onLine!==false)&&(typeof document==='undefined'||!document.hidden);
  return new Promise((resolve,reject)=>{
    let timer=null;
    const done=()=>{cleanup();resolve();};
    const check=()=>{if(timer===null&&ready())done();};
    const abort=()=>{cleanup();reject(uploadAbort());};
    function cleanup(){clearTimeout(timer);timer=-1;signal?.removeEventListener('abort',abort);globalThis.removeEventListener?.('online',check);globalThis.document?.removeEventListener?.('visibilitychange',check);}
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{timer=null;globalThis.addEventListener?.('online',check);globalThis.document?.addEventListener?.('visibilitychange',check);check();},ms);
  });
}
export const UPLOAD_RETRY_DELAYS=[1500,4000,8000,15000,30000];
function uploadWait(ms,signal){
  uploadActive(signal);return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(uploadAbort());},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});
  });
}
export async function ensureLogeUpload(draft,{request,signal,onState=()=>{},upload=uploadLogeFile,duration=readLogeDuration,wait=uploadWait,reconnect=uploadReconnect,retryDelays=UPLOAD_RETRY_DELAYS,maxPolls=300,basePath='/api/loge/uploads'}={}){
  const file=draft.file,requestId=draft.requestId,sameDraft=()=>draft.file===file&&draft.requestId===requestId;
  const check=()=>{uploadActive(signal);if(!sameDraft())throw uploadAbort();};
  check();validateLogeFile(file);
  const state=(status,progress)=>{if(!sameDraft())return;draft.uploadStatus=status;if(progress!==undefined)draft.uploadProgress=progress;if(!signal?.aborted)onState(status,progress);};
  if(!draft.durationChecked){state('checking');const seconds=await duration(file,{signal});check();if(Number.isFinite(seconds)&&seconds>LOGE_UPLOAD_MAX_SECONDS)throw Error('La vidéo doit durer 30 minutes maximum.');draft.durationChecked=true;}
  let result;
  if(draft.uploadId){result=await request(basePath+'/'+encodeURIComponent(draft.uploadId));check();}
  else{
    state('preparing');result=await request(basePath,{method:'POST',body:{requestId,filename:file.name,size:file.size}});
    if(!sameDraft()){
      draft.abandonedUploads||=[];draft.abandonedUploads.push(result.uploadId);
      try{await request(basePath+'/'+encodeURIComponent(result.uploadId),{method:'DELETE',body:{}});draft.abandonedUploads=draft.abandonedUploads.filter(id=>id!==result.uploadId);}catch{}
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
    state('uploading',0);
    for(let attempt=0;;attempt++){
      try{await upload(draft.uploadURL,file,{signal,onProgress:value=>state('uploading',value)});check();draft.uploadSent=true;break;}
      catch(error){
        if(!error?.network||attempt>=retryDelays.length)throw error;
        state('reconnecting');await reconnect(retryDelays[attempt],signal);check();
        // The file may have arrived before the response was lost.
        result=await request(basePath+'/'+encodeURIComponent(draft.uploadId));check();
        if(result.status==='ready'){state('ready');return draft.uploadId;}
        if(result.status==='error')throw Error('Cette vidéo n’a pas pu être préparée. Sélectionne une vidéo pour recommencer.');
        if(result.status==='processing'){draft.uploadSent=true;break;}
        state('uploading',0);
      }
    }
  }
  state('processing');
  for(let count=0;count<maxPolls;count++){
    check();result=await request(basePath+'/'+encodeURIComponent(draft.uploadId));check();
    if(result.status==='ready'){state('ready');return draft.uploadId;}
    if(result.status==='error')throw Error('Cette vidéo n’a pas pu être préparée. Sélectionne une vidéo pour recommencer.');
    await wait(2000,signal);
  }
  throw Error('La vidéo est encore en préparation. Réessaie dans un instant.');
}
