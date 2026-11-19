// Honour an MP4 edit list that delays a track (an "empty edit"): browsers
// playing HLS through Media Source ignore it, so a video whose sound starts
// later than its picture would play the sound too early.
const CONTAINERS=new Set(['moov','trak','mdia','minf','stbl','edts','moof','traf','mvex']);
function* boxes(view,start,end){
  for(let at=start;at+8<=end;){
    let size=view.getUint32(at),header=8;const type=String.fromCharCode(view.getUint8(at+4),view.getUint8(at+5),view.getUint8(at+6),view.getUint8(at+7));
    if(size===1){size=Number(view.getBigUint64(at+8));header=16;}else if(size===0)size=end-at;
    if(size<header||at+size>end)return;
    yield {type,at,header,size};
    if(CONTAINERS.has(type))yield* boxes(view,at+header,at+size);
    at+=size;
  }
}
// The delay before the first sample, in the track's own timescale (0 when none).
export function initDelay(buffer){
  const view=new DataView(buffer);let movieScale=0,trackScale=0,empty=0;
  for(const box of boxes(view,0,view.byteLength)){
    const body=box.at+box.header,version=view.getUint8(body);
    if(box.type==='mvhd')movieScale=view.getUint32(body+(version?20:12));
    else if(box.type==='mdhd')trackScale=view.getUint32(body+(version?20:12));
    else if(box.type==='elst'){
      const count=view.getUint32(body+4),entry=version?20:12;
      for(let i=0,at=body+8;i<count&&at+entry<=box.at+box.size;i++,at+=entry){
        const duration=version?Number(view.getBigUint64(at)):view.getUint32(at),media=version?Number(view.getBigInt64(at+8)):view.getInt32(at+4);
        if(media===-1)empty+=duration;else break;
      }
    }
  }
  return movieScale&&trackScale&&empty?Math.round(empty*trackScale/movieScale):0;
}
// Moves every sample of a media segment later by `delay` (track timescale).
export function delaySegment(buffer,delay){
  if(!delay)return buffer;
  const view=new DataView(buffer);
  for(const box of boxes(view,0,view.byteLength)){
    if(box.type!=='tfdt')continue;
    const body=box.at+box.header;
    if(view.getUint8(body)===1)view.setBigUint64(body+4,view.getBigUint64(body+4)+BigInt(delay));
    else view.setUint32(body+4,view.getUint32(body+4)+delay);
  }
  return buffer;
}
// A fragment loader for hls.js that applies the delay to the alternate audio.
export function editDelayLoader(Base){
  const delays=new Map();
  return class extends Base{
    load(context,config,callbacks){
      const frag=context.frag,audio=frag?.type==='audio';
      if(!audio)return super.load(context,config,callbacks);
      const key=frag.level+':'+(frag.initSegment?.url||frag.url);
      const onSuccess=callbacks.onSuccess;
      super.load(context,config,{...callbacks,onSuccess(response,stats,ctx,details){
        try{
          if(response.data instanceof ArrayBuffer){
            if(frag.sn==='initSegment')delays.set(key,initDelay(response.data));
            else delaySegment(response.data,delays.get(key)||0);
          }
        }catch{/* an unreadable box leaves the segment as it is */}
        onSuccess(response,stats,ctx,details);
      }});
    }
  };
}
