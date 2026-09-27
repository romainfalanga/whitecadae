window.WCBrainstormVoice = (() => {
  function create({credentials,send,changed,status}) {
    let stream=null,iceServers=[],id=null,participants=[],active=false,joining=false,muted=true,generation=0,resuming=false,resumeTimer=null;
    const peers=new Map();
    const snapshot=()=>({active,joining,muted,participants:participants.filter(p=>p.voice)});
    const emit=()=>changed(snapshot());
    function closePeer(key){const peer=peers.get(key);if(!peer)return;peer.pc.close();peer.audio.srcObject=null;peer.audio.remove();peers.delete(key);}
    function stop(notify=true){clearTimeout(resumeTimer);resuming=false;generation++;if(notify&&(active||joining))send({type:'voice-leave'});active=false;joining=false;muted=true;for(const key of [...peers.keys()])closePeer(key);stream?.getTracks().forEach(track=>track.stop());stream=null;emit();}
    function suspend(){if(!stream)return;resuming=true;active=false;joining=true;for(const key of [...peers.keys()])closePeer(key);clearTimeout(resumeTimer);resumeTimer=setTimeout(()=>{stop(false);status('Le vocal a été quitté après une interruption de connexion.');},15000);emit();}
    async function join(){
      if(active||joining)return;
      if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia){status('Le vocal nécessite un navigateur compatible avec le microphone.');return;}
      const token=++generation;joining=true;emit();status('Préparation du salon vocal…');
      try{
        const config=await credentials();if(token!==generation)return;iceServers=config.iceServers;
        WCPlayer.beforeRecording();
        const captured=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
        if(token!==generation){captured.getTracks().forEach(t=>t.stop());return;}
        stream=captured;muted=true;for(const track of stream.getAudioTracks()){track.enabled=false;track.onended=()=>{stop();status('Le microphone a été déconnecté.');};}
        if('audioSession' in navigator){try{navigator.audioSession.type='play-and-record';}catch{}}
        if(!send({type:'voice-join',muted:true})){stop(false);status('La connexion en direct est interrompue. Réessaie après la reconnexion.');}
      }catch(error){if(token!==generation)return;stop();status(error.name==='NotAllowedError'?'L’accès au microphone a été refusé. Tu peux continuer par écrit.':error.message||'Impossible de rejoindre le vocal.');}
    }
    async function offer(peer,key){
      try{if(peer.pc.signalingState!=='stable')return;await peer.pc.setLocalDescription(await peer.pc.createOffer());send({type:'signal',to:key,kind:'offer',data:peer.pc.localDescription.toJSON()});}
      catch{status('Une connexion vocale a échoué. Quitte puis rejoins le vocal pour réessayer.');}
    }
    function ensurePeer(key,initiate=false){
      if(peers.has(key))return peers.get(key);
      if(!active||!stream)return null;
      const pc=new RTCPeerConnection({iceServers}),audio=document.createElement('audio');
      audio.autoplay=true;audio.setAttribute('playsinline','');audio.hidden=true;document.body.append(audio);
      const peer={pc,audio,candidates:[]};peers.set(key,peer);
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      pc.onicecandidate=event=>send({type:'signal',to:key,kind:'candidate',data:event.candidate?.toJSON()||null});
      pc.ontrack=event=>{audio.srcObject=event.streams[0]||new MediaStream([event.track]);audio.play().catch(()=>status('Appuie sur « Activer le son » pour entendre les participants.'));};
      pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')status('La connexion avec un participant a échoué. Quitte puis rejoins le vocal pour réessayer.');};
      if(initiate)offer(peer,key);
      return peer;
    }
    function updatePresence(next){
      participants=next;
      const present=new Set(next.filter(p=>p.voice&&p.id!==id).map(p=>p.id));
      for(const key of peers.keys())if(!present.has(key))closePeer(key);
      if(active)for(const key of present)ensurePeer(key,id<key);
      emit();
    }
    async function message(event){
      if(event.type==='hello'){id=event.id;if(resuming&&stream)send({type:'voice-join',muted});return;}
      if(event.type==='presence'){updatePresence(event.participants);return;}
      if(event.type==='voice-ready'){if(!joining||!stream)return;clearTimeout(resumeTimer);resuming=false;joining=false;active=true;status(muted?'Tu as rejoint le vocal, micro coupé.':'Connexion vocale rétablie.');updatePresence(participants);return;}
      if(event.type==='voice-error'){stop(false);status(event.error);return;}
      if(event.type!=='signal'||!active)return;
      if(!participants.some(p=>p.id===event.from&&p.voice))return;
      const peer=ensurePeer(event.from);if(!peer)return;
      try{
        if(event.kind==='candidate'){
          if(peer.pc.remoteDescription)await peer.pc.addIceCandidate(event.data);
          else peer.candidates.push(event.data);
        }else{
          await peer.pc.setRemoteDescription(event.data);
          for(const candidate of peer.candidates.splice(0))await peer.pc.addIceCandidate(candidate);
          if(event.kind==='offer'){await peer.pc.setLocalDescription(await peer.pc.createAnswer());send({type:'signal',to:event.from,kind:'answer',data:peer.pc.localDescription.toJSON()});}
        }
      }catch{status('Une liaison vocale n’a pas abouti. Tu peux quitter puis rejoindre à nouveau.');}
    }
    function toggleMic(){if(!active)return;muted=!muted;stream.getAudioTracks().forEach(t=>{t.enabled=!muted;});send({type:'mute',muted});status(muted?'Ton micro est coupé.':'Ton micro est activé.');emit();}
    function playSound(){for(const peer of peers.values())peer.audio.play().catch(()=>status('Le navigateur bloque encore le son. Vérifie ses autorisations.'));}
    return {join,leave:stop,suspend,message,toggleMic,playSound,snapshot};
  }
  return {create};
})();
