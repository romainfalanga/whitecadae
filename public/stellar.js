// A ray-cast 3D photosphere, baked into a small image only when it enters view.
// One off-screen context, no animation, no render loop and no external textures.
window.WCStellar=(()=>{
  const SIZE=192;
  const vertex=`attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
  const fragment=`precision highp float;
uniform float hue;
uniform float seed;
uniform vec2 resolution;
float hash(vec3 p){p=fract(p*.3183099+vec3(.11,.27,.37));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+vec3(7.1,3.6,1.9);a*=.5;}return s;}
vec3 hsv(float h,float s,float v){vec3 p=abs(fract(vec3(h)+vec3(0.,2./3.,1./3.))*6.-3.);return v*mix(vec3(1),clamp(p-1.,0.,1.),s);}
void main(){
  vec2 uv=(gl_FragCoord.xy/resolution*2.-1.);
  float r=length(uv),radius=.54,angle=atan(uv.y,uv.x),offset=seed*3.73;
  vec3 heat=hsv(hue/360.,.94,1.);
  vec3 direction=vec3(cos(angle),sin(angle),offset);
  float strands=pow(fbm(direction*7.+vec3(r*2.)),2.);
  float glow=exp(-max(0.,r-radius)*12.)*(.10+strands*.60);
  glow*=1.-smoothstep(.73,1.,r);
  // Fine, irregular magnetic arches just beyond the limb, never geometric rays.
  float arches=0.;
  for(int j=0;j<3;j++){
    float a=offset+float(j)*2.37;
    vec2 centre=vec2(cos(a),sin(a))*.535;
    float loopRadius=.10+float(j)*.018;
    float ring=abs(length(uv-centre)-loopRadius);
    arches+=exp(-ring*180.)*smoothstep(.54,.59,r)*(1.-smoothstep(.66,.78,r))*.42;
  }
  vec3 light=heat*(glow+arches);
  if(r<radius){
    vec2 xy=uv/radius;
    float z=sqrt(max(0.,1.-dot(xy,xy)));
    vec3 surface=vec3(xy,z),p=surface*10.+vec3(offset);
    float convection=fbm(p);
    float granules=noise(surface*90.+offset);
    float filaments=1.-smoothstep(.016,.11,abs(fbm(p*1.8)-.49));
    float patches=smoothstep(.26,.61,convection);
    float intensity=(.37+.40*patches+.26*granules+.26*filaments)*(.50+.50*pow(z,.38));
    float hot=smoothstep(.68,1.16,intensity);
    vec3 surfaceColor=hsv((hue+hot*5.)/360.,.94-hot*.43,1.);
    light=surfaceColor*intensity;
    light+=heat*.30*pow(1.-z,7.);
    // A little limb darkening reveals the spherical volume of an emissive star.
    light*=.89+.11*dot(surface,normalize(vec3(-.25,.35,1.)));
  }
  float alpha=r<radius?1.:clamp(max(light.r,max(light.g,light.b)),0.,1.);
  gl_FragColor=vec4(light/max(alpha,.001),alpha);
}`;

  function renderer(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
    if(!gl)return null;
    const shaders=[];let program,buffer;
    const dispose=()=>{if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);shaders.forEach(shader=>gl.deleteShader(shader));gl.getExtension('WEBGL_lose_context')?.loseContext();};
    try{
      const compile=(type,source)=>{const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Stellar shader unavailable');return shader;};
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Stellar renderer unavailable');
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      gl.uniform2f(gl.getUniformLocation(program,'resolution'),SIZE,SIZE);
      const hue=gl.getUniformLocation(program,'hue'),seed=gl.getUniformLocation(program,'seed');
      return {draw(tone,variation){if(gl.isContextLost())throw Error('Stellar context lost');gl.uniform1f(hue,tone);gl.uniform1f(seed,variation);gl.drawArrays(gl.TRIANGLES,0,6);return canvas.toDataURL('image/webp',.88);},dispose};
    }catch{dispose();return null;}
  }

  function mount(root){
    let engine,initialized=false,closed=false,pending=null;
    const queue=[],scheduled=new Set(),images=new Map();
    const idle=window.requestIdleCallback?callback=>requestIdleCallback(callback,{timeout:150}):callback=>setTimeout(callback,16);
    const cancel=window.cancelIdleCallback||clearTimeout;
    function schedule(){if(closed||pending!==null||!queue.length)return;pending=idle(paint);}
    function paint(){
      pending=null;if(closed)return;
      const node=queue.shift();if(!node?.isConnected){schedule();return;}
      if(!initialized){initialized=true;try{engine=renderer();}catch{engine=null;}}
      if(!engine){queue.length=0;observer?.disconnect();return;} // CSS sphere is always present as a fallback.
      const tone=Number(node.dataset.stellar),variation=Number(node.dataset.starSeed)%7,key=tone+':'+variation;
      try{
        let src=images.get(key);if(!src){src=engine.draw(tone,variation);images.set(key,src);}
        const image=new Image();image.alt='';image.width=image.height=SIZE;image.decoding='async';
        image.onload=()=>{if(closed||!node.isConnected)return;node.append(image);node.classList.add('has-stellar-image');};
        image.src=src;
      }catch{engine.dispose();engine=null;}
      schedule();
    }
    const enqueue=node=>{if(scheduled.has(node))return;scheduled.add(node);queue.push(node);schedule();};
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);enqueue(entry.target);}},{rootMargin:'160px'}):null;
    root.querySelectorAll('[data-stellar]').forEach(node=>observer?observer.observe(node):enqueue(node));
    return ()=>{closed=true;observer?.disconnect();if(pending!==null)cancel(pending);engine?.dispose();queue.length=0;images.clear();};
  }
  return {mount};
})();
