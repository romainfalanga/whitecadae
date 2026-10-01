// Bound decoded dimensions and require a complete container, not just a magic
// prefix. Avatars are never served as HTML/SVG or parsed as executable content.
export function validAvatar(bytes,mime){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii=(at,len)=>String.fromCharCode(...bytes.slice(at,at+len));
  const dimensions=(w,h)=>w>0&&h>0&&w<=2048&&h<=2048;
  if(mime==='image/png'){
    if(bytes.length<45||ascii(1,3)!=='PNG'||view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a)return false;
    let at=8,head=false,data=false;
    while(at+12<=bytes.length){const n=view.getUint32(at),kind=ascii(at+4,4);if(n>bytes.length-at-12)return false;
      if(!head){if(kind!=='IHDR'||n!==13||!dimensions(view.getUint32(at+8),view.getUint32(at+12)))return false;head=true;}
      if(kind==='IDAT')data=true;if(kind==='IEND')return data&&n===0&&at+12===bytes.length;at+=n+12;
    }return false;
  }
  if(mime==='image/jpeg'){
    if(bytes.length<16||view.getUint16(0)!==0xffd8||view.getUint16(bytes.length-2)!==0xffd9)return false;
    let at=2,size=false;
    while(at+4<=bytes.length){if(bytes[at++]!==255)return false;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xda)return size;if(marker===0xd9)return false;
      const n=view.getUint16(at);if(n<2||at+n>bytes.length)return false;
      if([0xc0,0xc1,0xc2].includes(marker)){if(n<8||!dimensions(view.getUint16(at+5),view.getUint16(at+3)))return false;size=true;}at+=n;
    }return false;
  }
  if(mime==='image/webp'){
    if(bytes.length<30||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WEBP'||view.getUint32(4,true)+8!==bytes.length)return false;
    const type=ascii(12,4);if(type==='VP8X'){const w=1+bytes[24]+bytes[25]*256+bytes[26]*65536,h=1+bytes[27]+bytes[28]*256+bytes[29]*65536;return !(bytes[20]&2)&&dimensions(w,h);}
    if(type==='VP8 '&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return dimensions(view.getUint16(26,true)&0x3fff,view.getUint16(28,true)&0x3fff);
    if(type==='VP8L'&&bytes[20]===0x2f){const bits=view.getUint32(21,true);return dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);}return false;
  }return false;
}
