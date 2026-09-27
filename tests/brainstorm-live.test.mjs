import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrainstormLive} from '../src/brainstorm-live.js';
class Socket{readyState=1;sent=[];serializeAttachment(a){this.a=structuredClone(a)}deserializeAttachment(){return structuredClone(this.a)}send(s){this.sent.push(JSON.parse(s))}close(code){this.readyState=3;this.code=code}}
test('live text notifications protect audiences and preserve authenticated renewal across hibernation',async()=>{
  const sockets=[],ctx={getWebSockets:()=>sockets},live=new BrainstormLive(ctx,{});
  const add=(id,level)=>{const ws=new Socket();ws.serializeAttachment({id,userId:Number(id),username:'QA'+id,echelon:level,endsAt:Date.now()+3600000,expires:Date.now()+100000,windowStart:Date.now(),count:0});sockets.push(ws);return ws;};
  const a=add('1',12),b=add('2',18);
  await live.fetch(new Request('https://live/internal',{method:'POST',body:JSON.stringify({type:'message',message:{author_echelon:18,body:'private'}})}));assert.equal(b.sent.at(-1).type,'message');assert.equal(a.sent.length,0);
  const expires=Date.now()+200000;await live.fetch(new Request('https://live/internal',{method:'POST',body:JSON.stringify({type:'renew',userId:1,echelon:13,expires})}));assert.equal(a.deserializeAttachment().expires,expires);
  await new BrainstormLive(ctx,{}).webSocketMessage(a,JSON.stringify({type:'ping'}));assert.equal(a.sent.at(-1).type,'pong');
  const count=b.sent.length;await live.webSocketMessage(a,JSON.stringify({type:'message',message:{author_echelon:1,body:'forged'}}));assert.equal(b.sent.length,count);assert.equal(a.sent.at(-1).type,'error');
  a.serializeAttachment({...a.deserializeAttachment(),expires:Date.now()-1});await live.webSocketMessage(a,JSON.stringify({type:'ping'}));assert.equal(a.code,4001);
  await live.fetch(new Request('https://live/internal',{method:'POST',body:JSON.stringify({type:'ended'})}));assert.equal(b.code,1000);
});
test('oversized messages, flooding and obsolete vocal signalling are rejected',async()=>{
  const a=new Socket(),b=new Socket();for(const [i,ws]of[a,b].entries())ws.serializeAttachment({id:String(i),echelon:12,endsAt:Date.now()+3600000,expires:Date.now()+100000,windowStart:Date.now(),count:0});const live=new BrainstormLive({getWebSockets:()=>[a,b]},{});
  await live.webSocketMessage(a,JSON.stringify({type:'voice-join'}));assert.equal(a.sent.at(-1).type,'error');assert.equal(b.sent.length,0);
  await live.webSocketMessage(a,'x'.repeat(65537));assert.equal(a.code,1009);
  b.serializeAttachment({...b.deserializeAttachment(),count:240});await live.webSocketMessage(b,JSON.stringify({type:'ping'}));assert.equal(b.code,1008);
});
