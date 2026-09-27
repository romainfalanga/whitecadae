// The Worker authenticates every upgrade before forwarding server-owned claims.
// Only presence, notifications and WebRTC signalling pass through this object;
// speech is never recorded or stored here. Attachments survive hibernation.
export class BrainstormLive {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
  send(ws,value){try{ws.send(JSON.stringify(value));}catch{/* The close handler removes the peer. */}}
  presence(){const participants=this.sockets().map(ws=>{const a=ws.deserializeAttachment();return {id:a.id,userId:a.userId,username:a.username,echelon:a.echelon,voice:a.voice,muted:a.muted};});for(const ws of this.sockets())this.send(ws,{type:'presence',participants});}
  async fetch(request){
    if(request.method==='POST'&&new URL(request.url).pathname==='/internal'){
      const event=await request.json();
      for(const ws of this.sockets()){
        const a=ws.deserializeAttachment();
        if(event.type==='renew'){if(a.userId===event.userId){a.expires=event.expires;a.echelon=event.echelon;ws.serializeAttachment(a);}continue;}
        if(Date.now()>=a.expires||Date.now()>=a.endsAt){ws.close(4001,'Connexion expirée');continue;}
        if(event.type==='message'&&event.message.author_echelon>a.echelon)continue;
        this.send(ws,event);
        if(event.type==='ended')ws.close(1000,'Séance terminée');
      }
      return new Response('ok');
    }
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    let claims;try{claims=JSON.parse(decodeURIComponent(request.headers.get('X-WC-Identity')||''));}catch{return new Response('Unauthorized',{status:403});}
    if(!Number.isSafeInteger(claims.userId)||typeof claims.username!=='string'||!Number.isInteger(claims.echelon)||claims.echelon<12||claims.expires<=Date.now()||claims.endsAt<=Date.now())return new Response('Unauthorized',{status:403});
    // Rejoining from the same account replaces its old tab instead of duplicating
    // microphones and consuming slots indefinitely.
    for(const ws of this.sockets())if(ws.deserializeAttachment().userId===claims.userId)ws.close(4002,'Une autre connexion a été ouverte.');
    if(this.sockets().length>=100)return new Response('Cette séance est complète.',{status:429});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    server.serializeAttachment({...claims,id:crypto.randomUUID(),voice:false,muted:true,windowStart:Date.now(),count:0});
    this.ctx.acceptWebSocket(server);
    this.send(server,{type:'hello',id:server.deserializeAttachment().id,expires:claims.expires});this.presence();
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,raw){
    const a=ws.deserializeAttachment(),now=Date.now();
    if(now>=a.endsAt){ws.close(1000,'Séance terminée');return;}
    if(now>=a.expires){ws.close(4001,'Renouvellement de la connexion');return;}
    if(typeof raw!=='string'||raw.length>65536){ws.close(1009,'Message trop grand');return;}
    if(now-a.windowStart>=60000){a.windowStart=now;a.count=0;}
    if(++a.count>240){ws.close(1008,'Trop de requêtes');return;}
    ws.serializeAttachment(a);
    let message;try{message=JSON.parse(raw);}catch{this.send(ws,{type:'error',error:'Message invalide.'});return;}
    if(message?.type==='ping'){this.send(ws,{type:'pong'});return;}
    if(message?.type==='voice-join'){
      if(!a.voiceAllowed){this.send(ws,{type:'voice-error',error:'Le vocal n’est pas encore activé.'});return;}
      if(!a.voice&&this.sockets().filter(other=>other.deserializeAttachment().voice).length>=8){this.send(ws,{type:'voice-error',error:'Huit personnes sont déjà dans le salon vocal.'});return;}
      a.voice=true;a.muted=message.muted!==false;ws.serializeAttachment(a);this.send(ws,{type:'voice-ready'});this.presence();return;
    }
    if(message?.type==='voice-leave'){a.voice=false;a.muted=true;ws.serializeAttachment(a);this.presence();return;}
    if(message?.type==='mute'&&a.voice){a.muted=message.muted!==false;ws.serializeAttachment(a);this.presence();return;}
    if(message?.type==='signal'&&a.voice){
      const target=this.sockets().find(other=>{const peer=other.deserializeAttachment();return peer.id===message.to&&peer.voice&&peer.id!==a.id;});
      if(!target)return;
      if(!['offer','answer','candidate'].includes(message.kind))return;
      const data=message.data;
      if(message.kind==='candidate'){
        if(data!==null&&(typeof data!=='object'||typeof data.candidate!=='string'||data.candidate.length>8192))return;
      }else if(!data||data.type!==message.kind||typeof data.sdp!=='string'||data.sdp.length>50000)return;
      this.send(target,{type:'signal',from:a.id,kind:message.kind,data});return;
    }
    this.send(ws,{type:'error',error:'Action inconnue.'});
  }
  webSocketClose(){this.presence();}
  webSocketError(ws){try{ws.close(1011,'Connexion interrompue');}catch{}this.presence();}
}
