// The Worker authenticates every upgrade before forwarding server-owned claims.
// Only presence and written-message notifications pass through this object;
// the audiovisual live is hosted on an external platform. Attachments survive hibernation.
export class BrainstormLive {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
  send(ws,value){try{ws.send(JSON.stringify(value));}catch{/* The close handler removes the peer. */}}
  presence(){const participants=this.sockets().map(ws=>{const a=ws.deserializeAttachment();return {id:a.id,userId:a.userId,username:a.username,echelon:a.echelon};});for(const ws of this.sockets())this.send(ws,{type:'presence',participants});}
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
    // participants and consuming slots indefinitely.
    for(const ws of this.sockets())if(ws.deserializeAttachment().userId===claims.userId)ws.close(4002,'Une autre connexion a été ouverte.');
    if(this.sockets().length>=100)return new Response('Cette séance est complète.',{status:429});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    server.serializeAttachment({...claims,id:crypto.randomUUID(),windowStart:Date.now(),count:0});
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
    this.send(ws,{type:'error',error:'Action inconnue.'});
  }
  webSocketClose(){this.presence();}
  webSocketError(ws){try{ws.close(1011,'Connexion interrompue');}catch{}this.presence();}
}
