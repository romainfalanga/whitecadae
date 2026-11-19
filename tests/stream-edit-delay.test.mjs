import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initDelay,delaySegment,editDelayLoader} from '../public/stream-edit-delay.js';

// Minimal MP4 boxes, enough to carry the timing the player relies on.
const box=(type,...parts)=>{const body=Buffer.concat(parts);const head=Buffer.alloc(8);head.writeUInt32BE(8+body.length);head.write(type,4,'latin1');return Buffer.concat([head,body]);};
const u32=value=>{const b=Buffer.alloc(4);b.writeUInt32BE(value>>>0);return b;};
const i32=value=>{const b=Buffer.alloc(4);b.writeInt32BE(value);return b;};
const mvhd=scale=>box('mvhd',u32(0),u32(0),u32(0),u32(scale),u32(0),Buffer.alloc(80));
const mdhd=scale=>box('mdhd',u32(0),u32(0),u32(0),u32(scale),u32(0),u32(0));
const elst=entries=>box('elst',u32(0),u32(entries.length),...entries.flatMap(([duration,media])=>[u32(duration),i32(media),u32(0x00010000)]));
const init=(entries,trackScale=44100)=>new Uint8Array(box('moov',mvhd(1000),box('trak',box('edts',elst(entries)),box('mdia',mdhd(trackScale))))).buffer;
const segment=(time,version=0)=>{const tfdt=version?box('tfdt',u32(0x01000000),u32(0),u32(time)):box('tfdt',u32(0),u32(time));return new Uint8Array(Buffer.concat([box('moof',box('traf',tfdt)),box('mdat',Buffer.from('sound'))])).buffer;};
const decodeTime=(buffer,version=0)=>{const view=new DataView(buffer);return version?Number(view.getBigUint64(28)):view.getUint32(28);};

test('an empty edit that delays the sound is read in the track timescale',()=>{
  // The phone video whose sound came 0.8 s too early: 805 ms of empty edit.
  assert.equal(initDelay(init([[805,-1],[0,0]])),Math.round(805*44100/1000));
  // Encoder priming (a positive media time) and no edit list delay nothing.
  assert.equal(initDelay(init([[0,2048]])),0);
  assert.equal(initDelay(new Uint8Array(box('moov',mvhd(1000),box('trak',box('mdia',mdhd(48000))))).buffer),0);
  // Truncated or foreign data never throws.
  assert.equal(initDelay(new Uint8Array([0,0,0,99,1,2,3,4]).buffer),0);
});

test('every sample of a segment moves later by the delay, in both decode time sizes',()=>{
  assert.equal(decodeTime(delaySegment(segment(177152),35501)),177152+35501);
  assert.equal(decodeTime(delaySegment(segment(5,1),100),1),105);
  const untouched=segment(42);assert.equal(decodeTime(delaySegment(untouched,0)),42);
});

test('the loader applies the delay to the sound only, after reading its init segment',async()=>{
  class Base{load(context,_config,callbacks){callbacks.onSuccess({data:context.frag.payload},{},context,null);}}
  const Loader=editDelayLoader(Base),loader=new Loader(),seen=[];
  const run=frag=>new Promise(resolve=>loader.load({frag},{},{onSuccess:response=>{seen.push(response.data);resolve(response.data);}}));
  const initFrag={type:'audio',sn:'initSegment',level:0,url:'https://x/audio/init.mp4',payload:init([[805,-1],[0,0]])};
  await run(initFrag);
  const audio=await run({type:'audio',sn:1,level:0,url:'https://x/audio/seg_1.mp4',initSegment:{url:initFrag.url},payload:segment(0)});
  assert.equal(decodeTime(audio),35501);
  const picture=await run({type:'main',sn:1,level:2,url:'https://x/video/seg_1.mp4',payload:segment(0)});
  assert.equal(decodeTime(picture),0,'the picture keeps its own times');
  const other=await run({type:'audio',sn:1,level:1,url:'https://x/other/seg_1.mp4',initSegment:{url:'https://x/other/init.mp4'},payload:segment(7)});
  assert.equal(decodeTime(other),7,'a track without a known delay is left as it is');
});
