// One videography upload can run in the background while the member keeps
// using the site. The job lives outside any page: closing the add-video window
// or changing page never stops it. A small ring next to the echelon in the
// site header shows where it stands and reopens its window.
import {ensureLogeUpload} from './loge-upload.js';
import {videoLabel} from './video-model.js';

const basePath='/api/life-tree/uploads';
const listeners=new Set();
let job=null,openHandler=null,pendingOpen=false,doneTimer=null;

export const currentVideoJob=()=>job&&job.state.user?.id===job.user?job:null;
export function onVideoJob(fn){listeners.add(fn);return()=>listeners.delete(fn);}
// The videography page registers how to show a job; elsewhere a tap leads there.
export function setVideoJobOpener(fn){openHandler=fn;return()=>{if(openHandler===fn)openHandler=null;};}
export function takePendingJobOpen(){const value=pendingOpen;pendingOpen=false;return value&&!!currentVideoJob();}
export const jobActive=value=>!!value&&!['done','error'].includes(value.phase);

const abortError=()=>new DOMException('Envoi interrompu','AbortError');
function emit(){
  for(const fn of [...listeners]){try{fn(job);}catch{/* a closed view must not stop the job */}}
  renderIndicator();
}
function guard(event){if(jobActive(currentVideoJob())){event.preventDefault();event.returnValue='';}}
// Keep the screen on while a file is sent: a locked phone suspends the transfer.
let wakeLock=null,wakeLockPending=false;
async function holdScreen(){
  const lock=globalThis.navigator?.wakeLock;
  // One request at a time: two would leave a lock nobody releases.
  if(wakeLock||wakeLockPending||globalThis.document?.hidden||!lock?.request||!jobActive(currentVideoJob()))return;
  wakeLockPending=true;
  try{const held=await lock.request('screen');wakeLock=held;held.addEventListener?.('release',()=>{if(wakeLock===held)wakeLock=null;});if(!jobActive(currentVideoJob()))releaseScreen();}catch{wakeLock=null;}
  finally{wakeLockPending=false;}
}
function releaseScreen(){const lock=wakeLock;wakeLock=null;lock?.release?.().catch?.(()=>{});}
globalThis.document?.addEventListener?.('visibilitychange',()=>{if(!globalThis.document.hidden)void holdScreen();});

export function startVideoJob({api,state,navigate,eventId,body,file}){
  if(jobActive(currentVideoJob()))throw Error('Une vidéo est déjà en cours d’envoi. Attends la fin ou annule-la.');
  clearTimeout(doneTimer);
  job={id:eventId,user:state.user?.id,api,state,navigate,body,title:body.title,branch:body.videoBranch,fileName:file.name,fileSize:file.size,
    upload:{file,requestId:crypto.randomUUID(),abandonedUploads:[]},phase:'checking',progress:0,error:'',blockedUploadId:null,controller:null,startedAt:Date.now()};
  window.addEventListener('beforeunload',guard);void holdScreen();
  void run(job);return job;
}
function request(current,path,options={}){
  if(current.state.user?.id!==current.user||current.controller?.signal.aborted)return Promise.reject(abortError());
  return current.api(path,{...options,headers:{'X-WC-User':String(current.user)}});
}
async function run(current){
  const controller=new AbortController();current.controller=controller;current.error='';current.blockedUploadId=null;
  const live=()=>job===current&&!controller.signal.aborted;
  const set=(phase,progress)=>{if(!live())return;current.phase=phase;if(progress!==undefined)current.progress=progress;emit();};
  set(current.upload.uploadId?'processing':'checking',current.upload.uploadId?100:0);
  try{
    const uploadId=await ensureLogeUpload(current.upload,{request:(path,options)=>request(current,path,options),basePath,signal:controller.signal,onState:(phase,progress)=>set(phase==='ready'?'saving':phase,progress)});
    if(!live())return;set('saving');
    // Retrying this write is safe: the server recognises an already attached upload.
    await request(current,'/api/life-tree/events/'+encodeURIComponent(current.id),{method:'PUT',body:{...current.body,uploadId}});
    if(!live())return;
    current.phase='done';current.progress=100;current.finishedAt=Date.now();emit();
    window.removeEventListener('beforeunload',guard);releaseScreen();
    // A finished job lingers briefly so the ring can show its check mark.
    doneTimer=setTimeout(()=>{if(job===current&&!current.viewing){job=null;emit();}},6000);
  }catch(error){
    // The account changed under the job: stop sending for the previous member.
    if(job===current&&current.state.user?.id!==current.user){abandonVideoJob();return;}
    if(!live()||error?.name==='AbortError')return;
    // A reservation left by a reloaded page holds the member's only slot:
    // release it and start again, once, instead of stopping on a refusal.
    if(error.status===409&&error.data?.uploadId&&!current.released){
      current.released=true;
      try{
        await request(current,basePath+'/'+encodeURIComponent(error.data.uploadId),{method:'DELETE',body:{}});
        Object.assign(current.upload,{requestId:crypto.randomUUID(),uploadId:null,uploadURL:null,uploadSent:false,uploadStatus:null});
        if(job===current)return run(current);
        return;
      }catch{/* the manual retry below stays available */}
    }
    if(!live())return;
    current.phase='error';
    current.error=[401,403].includes(error.status)?'Reconnecte-toi pour terminer l’envoi.':error.network?'La connexion a été coupée plusieurs fois pendant l’envoi. Vérifie ta connexion, garde cette page ouverte et touche Réessayer.':error.message||'L’envoi a échoué.';
    if(error.status===409&&error.data?.uploadId)current.blockedUploadId=error.data.uploadId;
    // A reservation the video service refused or let expire cannot resume: start it again.
    current.restart=/préparée|expiré|Sélectionne/i.test(current.error);
    window.removeEventListener('beforeunload',guard);releaseScreen();emit();
  }
}
export async function retryVideoJob(){
  const current=currentVideoJob();if(!current||current.phase!=='error')return;
  window.addEventListener('beforeunload',guard);void holdScreen();
  if(current.restart&&!current.blockedUploadId){
    const stale=current.upload.uploadId;
    Object.assign(current.upload,{requestId:crypto.randomUUID(),uploadId:null,uploadURL:null,uploadSent:false,uploadStatus:null});
    if(stale)try{await request(current,basePath+'/'+encodeURIComponent(stale),{method:'DELETE',body:{}});}catch{/* the server sweeps it */}
  }
  if(current.blockedUploadId){
    // An older reservation (another tab, a lost session) holds the only slot.
    await request(current,basePath+'/'+encodeURIComponent(current.blockedUploadId),{method:'DELETE',body:{}});
    Object.assign(current.upload,{requestId:crypto.randomUUID(),uploadId:null,uploadURL:null,uploadSent:false,uploadStatus:null});
  }
  await run(current);
}
export async function cancelVideoJob(){
  const current=currentVideoJob();if(!current)return;
  const saving=current.phase==='saving'||current.phase==='done';
  current.controller?.abort();job=null;clearTimeout(doneTimer);window.removeEventListener('beforeunload',guard);releaseScreen();emit();
  // Free the reservation unless the video may already be attached to its entry.
  if(!saving&&current.upload.uploadId){try{await current.api(basePath+'/'+encodeURIComponent(current.upload.uploadId),{method:'DELETE',body:{},headers:{'X-WC-User':String(current.user)}});}catch{/* cleanup also runs on the server */}}
}
// Signing out or switching account ends the job at once: the transfer is
// aborted, the screen is released and nothing stays frozen for the next visit.
export function abandonVideoJob(){
  const current=job;if(!current)return;
  current.controller?.abort();job=null;clearTimeout(doneTimer);
  globalThis.removeEventListener?.('beforeunload',guard);releaseScreen();emit();
}
// The site announces account changes on this channel, in this tab and the others.
if(typeof BroadcastChannel==='function'){
  const accounts=new BroadcastChannel('wc-account-context');
  // Outside a browser (tests), an open channel must not keep the process alive.
  accounts.unref?.();
  accounts.addEventListener('message',event=>{if(event.data?.type==='account-changed'&&job&&(event.data.userId??null)!==job.user)abandonVideoJob();});
}
export function dismissVideoJob(){const current=currentVideoJob();if(current&&!jobActive(current)&&current.phase!=='error'){job=null;clearTimeout(doneTimer);emit();}}

export const jobLabels={checking:'Vérification de la vidéo',preparing:'Préparation de l’envoi',reading:'Lecture de la vidéo',uploading:'Envoi de la vidéo',reconnecting:'Connexion perdue · reprise automatique',processing:'Traitement de la vidéo',saving:'Enregistrement',done:'Vidéo ajoutée',error:'Envoi interrompu'};
export function jobSummary(value){
  if(!value)return '';
  if(value.phase==='uploading')return `${jobLabels.uploading} · ${value.progress||0} %`;
  return jobLabels[value.phase]||'';
}
export const jobCategory=value=>videoLabel(value?.branch);

function renderIndicator(){
  const controls=document.querySelector('.header-controls');if(!controls)return;
  let button=document.getElementById('video-upload-indicator');
  const current=currentVideoJob();
  if(!current){button?.remove();return;}
  if(!button){
    button=document.createElement('button');button.type='button';button.id='video-upload-indicator';button.className='video-upload-indicator';
    button.innerHTML='<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-track" cx="18" cy="18" r="15"/><circle class="ring-value" cx="18" cy="18" r="15" pathLength="100"/><path class="ring-icon ring-up" d="M18 23v-10m0 0-4 4m4-4 4 4"/><path class="ring-icon ring-done" d="m12.5 18.5 3.7 3.7 7.3-7.7"/><path class="ring-icon ring-error" d="M18 12v7m0 4.2v.1"/></svg>';
    button.addEventListener('click',()=>{
      const value=currentVideoJob();if(!value)return;
      if(openHandler&&location.pathname==='/videographie'){openHandler(value);return;}
      pendingOpen=true;value.navigate('/videographie');
    });
    controls.insertBefore(button,controls.firstChild);
  }
  const indeterminate=['checking','preparing','reading','reconnecting','processing','saving'].includes(current.phase);
  button.dataset.phase=current.phase;button.classList.toggle('is-indeterminate',indeterminate);
  const value=current.phase==='uploading'?current.progress||0:current.phase==='done'?100:indeterminate?28:100;
  button.style.setProperty('--ring',String(value));
  const label=`${jobSummary(current)} : ${current.title}. Afficher le suivi.`;
  button.setAttribute('aria-label',label);button.title=jobSummary(current);
}
