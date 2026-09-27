import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrainstormLive} from '../src/brainstorm-live.js';
class Socket{readyState=1;sent=[];serializeAttachment(a){this.a=structuredClone(a)}deserializeAttachment(){return structuredClone(this.a)}send(s){this.sent.push(JSON.parse(s))}close(code){this.readyState=3;this.code=code}}
test('live rooms route voice only between participating peers, isolate audiences and persist renewals across hibernation',async()=>{
  const sockets=[],ctx={getWebSockets:()=>sockets},live=new BrainstormLive(ctx,{});
  const add=(id,level,voiceAllowed=true)=>{const ws=new Socket();ws.serializeAttachment({id,userId:Number(id),username:'QA'+id,echelon:level,voice:false,voiceAllowed,endsAt:Date.now()+3600000,expires:Date.now()+100000,windowStart:Date.now(),count:0});sockets.push(ws);return ws;};
  const a=add('1',12),b=add('2',18),c=add('3',12,false);const send=(ws,m)=>live.webSocketMessage(ws,JSON.stringify(m));
  await send(a,{type:'voice-join',muted:true});await send(b,{type:'voice-join',muted:false});await send(c,{type:'voice-join'});assert.equal(c.sent.at(-1).type,'voice-error');
  await send(a,{type:'signal',to:'2',kind:'offer',data:{type:'offer',sdp:'valid'}});assert.equal(b.sent.at(-1).from,'1');assert.equal(b.sent.at(-1).type,'signal');
  const count=b.sent.length;await send(c,{type:'signal',to:'2',kind:'offer',data:{type:'offer',sdp:'forged'}});assert.equal(b.sent.length,count);
  await live.fetch(new Request('https://live/internal',{method:'POST',body:JSON.stringify({type:'message',message:{author_echelon:18,body:'private'}})}));assert.equal(b.sent.at(-1).type,'message');assert.notEqual(a.sent.at(-1).type,'message');
  const expires=Date.now()+200000;await live.fetch(new Request('https://live/internal',{method:'POST',body:JSON.stringify({type:'renew',userId:1,echelon:13,expires})}));assert.equal(a.deserializeAttachment().expires,expires);
  await new BrainstormLive(ctx,{}).webSocketMessage(a,JSON.stringify({type:'mute',muted:false}));assert.equal(a.deserializeAttachment().muted,false);
  await send(a,{type:'voice-leave'});assert.equal(a.deserializeAttachment().voice,false);
  a.serializeAttachment({...a.deserializeAttachment(),expires:Date.now()-1});await send(a,{type:'ping'});assert.equal(a.code,4001);
  await live.fetch(new Request('https://live/internal',{method:'POST',body:JSON.stringify({type:'ended'})}));assert.equal(b.code,1000);
});
test('voice capacity, message size and rate limits cannot be bypassed with forged signalling',async()=>{
  const sockets=[],ctx={getWebSockets:()=>sockets},live=new BrainstormLive(ctx,{});
  for(let i=0;i<9;i++){const ws=new Socket();ws.serializeAttachment({id:String(i),userId:i,echelon:12,voice:i<8,voiceAllowed:true,endsAt:Date.now()+3600000,expires:Date.now()+100000,windowStart:Date.now(),count:0});sockets.push(ws);}
  await live.webSocketMessage(sockets[8],JSON.stringify({type:'voice-join'}));assert.equal(sockets[8].sent.at(-1).type,'voice-error');
  await live.webSocketMessage(sockets[0],'x'.repeat(65537));assert.equal(sockets[0].code,1009);
  sockets[1].serializeAttachment({...sockets[1].deserializeAttachment(),count:240});await live.webSocketMessage(sockets[1],JSON.stringify({type:'ping'}));assert.equal(sockets[1].code,1008);
});
