window.WCVocal = (() => {
  const normal = word => word.toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]/gu,'');
  function alignWords(text, original=[], duration=0) {
    const words=text.trim().split(/\s+/).filter(Boolean);
    if(words.length>1500)throw new Error('Le texte contient trop de mots (1 500 maximum).');
    const source=original.filter(w=>Number.isFinite(w.d)&&Number.isFinite(w.f)&&w.d>=0&&w.f>=w.d).slice(0,1500);
    const n=words.length,m=source.length,grid=new Uint16Array((n+1)*(m+1));
    const a=words.map(normal),b=source.map(w=>normal(w.m)),at=(i,j)=>i*(m+1)+j;
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)grid[at(i,j)]=a[i]===b[j]?1+grid[at(i+1,j+1)]:Math.max(grid[at(i+1,j)],grid[at(i,j+1)]);
    const anchors=[];let i=0,j=0;
    while(i<n&&j<m){if(a[i]===b[j]){anchors.push({i,d:source[j].d,f:source[j].f});i++;j++;}else if(grid[at(i+1,j)]>=grid[at(i,j+1)])i++;else j++;}
    const result=[];let startIndex=0,startTime=0;
    for(const next of [...anchors,{i:n,d:duration,f:duration}]){
      const end=Math.max(startTime,Math.min(duration,next.d)),between=words.slice(startIndex,next.i),weight=between.reduce((sum,w)=>sum+w.length+1,0);let cursor=startTime;
      for(const w of between){const length=(end-startTime)*(w.length+1)/Math.max(1,weight);result.push({m:w,d:cursor,f:cursor+length});cursor+=length;}
      if(next.i<n){const d=Math.max(startTime,Math.min(duration,next.d)),f=Math.max(d,Math.min(duration,next.f));result.push({m:words[next.i],d,f});startTime=f;startIndex=next.i+1;}
    }
    return result;
  }
  async function draftStore(key,value) {
    if(!window.indexedDB)return null;
    return new Promise(resolve=>{
      const req=indexedDB.open('whitecadae-community-drafts',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('drafts');
      req.onerror=()=>resolve(null);
      req.onsuccess=()=>{const db=req.result,tx=db.transaction('drafts',value===undefined?'readonly':'readwrite'),store=tx.objectStore('drafts');
        const q=value===undefined?store.get(key):value===null?store.delete(key):store.put(value,key);let result=null;
        q.onsuccess=()=>{result=q.result||null;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();resolve(null);};
      };
    });
  }
  async function upload(blob,kind,duration,{id,onTicket,onProgress,signal}={}) {
    if(!id){const ticket=await api('/api/vg-media',{method:'POST',body:{kind,mime:blob.type,size:blob.size,duration}});id=ticket.id;onTicket?.(id);}
    if(signal?.aborted)throw new DOMException('Envoi annulé','AbortError');
    await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest(),abort=()=>xhr.abort();
      xhr.open('PUT','/api/vg-media/'+id+'/upload');xhr.setRequestHeader('Content-Type',blob.type);xhr.timeout=180000;
      xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100));};
      xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)resolve();else{let message='L’envoi a échoué. Réessaie.';try{message=JSON.parse(xhr.responseText).error||message;}catch{}reject(new Error(message));}};
      xhr.onerror=()=>reject(new Error('Connexion interrompue. Le fichier reste prêt à envoyer.'));
      xhr.ontimeout=()=>reject(new Error('L’envoi a pris trop de temps. Réessaie.'));
      xhr.onabort=()=>reject(new DOMException('Envoi annulé','AbortError'));
      xhr.onloadend=()=>signal?.removeEventListener('abort',abort);
      signal?.addEventListener('abort',abort,{once:true});xhr.send(blob);
    });
    return id;
  }
  function paint(zone,words,time) {
    zone.querySelectorAll('span').forEach((span,i)=>{span.classList.toggle('spoken',words[i].d<=time);span.classList.toggle('speaking',words[i].d<=time&&words[i].f>time);});
  }
  function textMarkup(words){return words.map(w=>`<span>${esc(w.m)}</span>`).join(' ');}
  async function studio(container,{key,initial=null,editing=false,onChange=()=>{}}) {
    let value=initial||await draftStore(key)||{blob:null,text:'',words:[],duration:0,id:null,uploaded:false,client_id:crypto.randomUUID()};
    if(!container.isConnected)return {dispose(){},clear(){},getValue(){return value;}};
    let alive=true,recording=null,stream=null,context=null,timer=null,objectUrl=null,busy=false,start=0,frame=0,displayWords=[];
    const controller=new AbortController();
    container.innerHTML=`<div class="voice-studio">
      ${editing?'':'<div class="voice-actions"><button type="button" data-voice="record">● Enregistrer ma réponse</button><button type="button" data-voice="stop" hidden>■ Terminer</button><span class="voice-clock"></span></div>'}
      <p class="voice-status" role="status"></p><audio class="voice-preview" controls preload="metadata" hidden></audio>
      <div class="voice-transcript" hidden><label>Ta transcription — tu peux la corriger<textarea class="voice-text" rows="4" maxlength="6000" placeholder="La transcription apparaîtra ici…"></textarea></label><div class="voice-words" aria-hidden="true"></div></div>
      <div class="voice-actions"><button type="button" data-voice="retry" hidden>Transcrire à nouveau</button>${editing?'':'<button type="button" data-voice="clear" class="link-btn" hidden>Retirer ce vocal</button>'}</div>
    </div>`;
    const q=selector=>container.querySelector(selector),audio=q('audio'),textarea=q('textarea'),status=q('.voice-status');
    const save=()=>{value.text=textarea.value;if(!editing)draftStore(key,value);onChange(value);};
    const notice=text=>{if(alive)status.textContent=text;};
    function render() {
      if(!alive)return;
      const has=!!(value.blob||value.id);
      q('.voice-transcript').hidden=!has;audio.hidden=!has;
      for(const action of ['clear','retry']){const b=q(`[data-voice=${action}]`);if(b)b.hidden=!has||editing;}
      textarea.value=value.text||'';
      if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
      if(has){objectUrl=value.blob?URL.createObjectURL(value.blob):null;audio.src=objectUrl||'/api/vg-media/'+value.id;audio.load();}
      else audio.removeAttribute('src');
      refreshWords();
      const button=q('[data-voice=record]');if(button)button.textContent=has?'● Réenregistrer':'● Enregistrer ma réponse';
    }
    function refreshWords(){try{displayWords=alignWords(textarea.value,value.words,value.duration);q('.voice-words').innerHTML=textMarkup(displayWords);paint(q('.voice-words'),displayWords,audio.currentTime);return displayWords;}catch(error){notice(error.message);return [];}}
    textarea.value=value.text||'';textarea.addEventListener('input',()=>{save();refreshWords();});
    const animate=()=>{if(!alive)return;paint(q('.voice-words'),displayWords,audio.currentTime);if(!audio.paused)frame=requestAnimationFrame(animate);};
    audio.onplay=()=>{document.dispatchEvent(new Event('wc:vocal-preview'));WCPlayer.pause();document.querySelectorAll('audio,video').forEach(media=>{if(media!==audio)media.pause();});cancelAnimationFrame(frame);animate();};
    audio.onseeked=()=>refreshWords();audio.onpause=()=>cancelAnimationFrame(frame);audio.onerror=()=>notice('Ce format ne se lit pas sur cet appareil. Essaie un autre navigateur.');
    async function process() {
      if(busy||!value.blob)return;
      busy=true;onChange(value);notice('Envoi du vocal…');
      try{
        if(!value.uploaded){value.id=await upload(value.blob,'audio',value.duration,{id:value.id,onTicket:id=>{value.id=id;save();},onProgress:p=>notice('Envoi du vocal · '+p+' %'),signal:controller.signal});value.uploaded=true;save();}
        notice('Transcription…');
        const transcript=await api('/api/vg-media/'+value.id+'/transcribe',{method:'POST',body:{}});
        if(!alive)return;
        // A late transcription must never overwrite the member's manual correction.
        if(!textarea.value.trim()||textarea.value===value.lastAutoText){value.text=transcript.text;textarea.value=transcript.text;}
        value.words=transcript.words;value.lastAutoText=transcript.text;save();refreshWords();notice('Réécoute et corrige le texte avant de publier.');
      }catch(error){if(error.name!=='AbortError')notice(error.message);}
      finally{busy=false;if(alive){save();onChange(value);}}
    }
    const stop=()=>{clearInterval(timer);if(recording?.state==='recording')recording.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;};
    async function record() {
      if(busy||recording?.state==='recording')return;
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){notice('Ce navigateur ne permet pas l’enregistrement. Ouvre cette page dans un navigateur récent.');return;}
      notice('');busy=true;
      try{
        audio.pause();document.dispatchEvent(new Event('wc:vocal-preview'));WCPlayer.beforeRecording();
        document.querySelectorAll('video,audio').forEach(media=>media.pause());
        stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        if(!alive){stream.getTracks().forEach(t=>t.stop());return;}
        context=new (window.AudioContext||window.webkitAudioContext)();await context.resume();
        const destination=context.createMediaStreamDestination(),source=context.createMediaStreamSource(stream);
        chaineVoix(context,source,{...reglageVoix(),gain:Math.min(3,reglageVoix().gain)}).connect(destination);
        const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
        recording=new MediaRecorder(destination.stream,mime?{mimeType:mime,audioBitsPerSecond:64000}:{});
        const chunks=[];recording.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        recording.onstop=async()=>{
          const duration=Math.min(180,(performance.now()-start)/1000),blob=new Blob(chunks,{type:recording.mimeType||mime||'audio/webm'});
          context?.close();context=null;recording=null;busy=false;
          const previousId=value.id;if(previousId&&!editing)api('/api/vg-media/'+previousId,{method:'DELETE'}).catch(()=>{});
          value={blob,duration,text:'',words:[],id:null,uploaded:false,client_id:crypto.randomUUID()};
          if(!alive){await draftStore(key,value);return;}
          textarea.value='';save();q('[data-voice=record]').hidden=false;q('[data-voice=stop]').hidden=true;q('.voice-clock').textContent='';render();await process();
        };
        start=performance.now();recording.start(1000);q('[data-voice=record]').hidden=true;q('[data-voice=stop]').hidden=false;
        timer=setInterval(()=>{const seconds=Math.floor((performance.now()-start)/1000);q('.voice-clock').textContent=mmss(seconds)+' / 3:00';if(seconds>=180)stop();},250);
      }catch(error){stream?.getTracks().forEach(t=>t.stop());context?.close();notice(error.name==='NotAllowedError'?'Le micro n’est pas autorisé. Active-le pour enregistrer ta réponse.':'Le micro est indisponible. Réessaie.');}
      finally{busy=false;onChange(value);}
    }
    container.addEventListener('click',async event=>{
      const action=event.target.closest('[data-voice]')?.dataset.voice;
      if(action==='record')record();if(action==='stop')stop();if(action==='retry')process();
      if(action==='clear'&&!busy){audio.pause();if(value.id)await api('/api/vg-media/'+value.id,{method:'DELETE'}).catch(()=>{});value={blob:null,text:'',words:[],duration:0,id:null,uploaded:false,client_id:crypto.randomUUID()};textarea.value='';await draftStore(key,null);render();notice('');onChange(value);}
    },{signal:controller.signal});
    render();
    return {
      getValue(){return {...value,text:textarea.value.trim(),words:alignWords(textarea.value,value.words,value.duration)};},
      isBusy(){return busy||recording?.state==='recording';},
      async prepare(){if(!value.uploaded&&!editing)await process();const result=this.getValue();if(!result.id||(!result.uploaded&&!editing))throw new Error('Termine l’envoi du vocal avant de publier.');if(!result.text)throw new Error('Vérifie ou saisis la transcription du vocal.');return result;},
      async clear(){value={blob:null,text:'',words:[],duration:0,id:null,uploaded:false,client_id:crypto.randomUUID()};textarea.value='';audio.pause();await draftStore(key,null);render();notice('');},
      dispose(){save();alive=false;stop();controller.abort();audio.pause();cancelAnimationFrame(frame);if(objectUrl)URL.revokeObjectURL(objectUrl);},
    };
  }
  return {alignWords,upload,studio,paint,textMarkup};
})();
