const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../public/loge-upload.js'),'utf8').replace(/export /g,'');
const sandbox=vm.createContext({DOMException,setTimeout,clearTimeout,URL});
vm.runInContext(source+';globalThis.helpers={validateLogeFile,ensureLogeUpload,uploadLogeFile,readLogeDuration};',sandbox);
const {validateLogeFile,ensureLogeUpload,uploadLogeFile}=sandbox.helpers;
const file={name:'video.mp4',size:1000,type:'video/mp4'};
const draft=()=>({file,requestId:'publication-request'});
const options=extra=>({duration:async()=>120,wait:async()=>{},...extra});

test('file bounds and duration reject before reserving Stream storage',async()=>{
  assert.throws(()=>validateLogeFile(null),/Choisis/);assert.throws(()=>validateLogeFile({...file,size:200000001}),/200 Mo/);assert.throws(()=>validateLogeFile({...file,size:0}),/vide/);assert.throws(()=>validateLogeFile({...file,type:'text/plain'}),/vidéo/);
  validateLogeFile({...file,size:200000000});
  let requests=0;await assert.rejects(ensureLogeUpload(draft(),options({duration:async()=>1801,request:async()=>{requests++;}})),/30 minutes/);assert.equal(requests,0);
});

test('native upload uses multipart file, upload progress and no session credentials',async()=>{
  const fields=[],progress=[],xhr={upload:{},open(...args){this.opened=args;},send(body){this.body=body;},abort(){this.onabort?.();}};
  const promise=uploadLogeFile('https://upload.videodelivery.net/token',file,{xhrFactory:()=>xhr,formFactory:()=>({append:(...args)=>fields.push(args)}),onProgress:value=>progress.push(value)});
  assert.deepEqual(xhr.opened,['POST','https://upload.videodelivery.net/token']);assert.deepEqual(fields,[['file',file]]);assert.equal(xhr.withCredentials,undefined);
  xhr.upload.onprogress({lengthComputable:true,loaded:25,total:100});xhr.status=204;xhr.onload();await promise;assert.deepEqual(progress,[25]);assert.equal(xhr.upload.onprogress,null);
});

test('XHR errors reject and abort cancels the network request without later progress',async()=>{
  for(const kind of ['error','http','timeout','abort']){
    const controller=new AbortController();let aborted=false;
    const xhr={upload:{},open(){},send(){},abort(){aborted=true;this.onabort?.();}};
    const promise=uploadLogeFile('https://upload.videodelivery.net/token',file,{signal:controller.signal,xhrFactory:()=>xhr,formFactory:()=>({append(){}})});
    if(kind==='error')xhr.onerror();if(kind==='http'){xhr.status=500;xhr.onload();}if(kind==='timeout')xhr.ontimeout();if(kind==='abort')controller.abort();
    await assert.rejects(promise,error=>kind==='abort'?error.name==='AbortError':kind==='http'?/Réessaie/.test(error.message)&&!error.network:error.network===true&&/interrompue|expiré/.test(error.message));assert.equal(aborted,kind==='abort');assert.equal(xhr.upload.onprogress,null);
  }
});

test('reservation and publication nonce are stable through upload failure and ready retry',async()=>{
  const d=draft(),requests=[];let attempts=0,status='waiting';
  const request=async(path,init={})=>{requests.push({path,...init});return path==='/api/loge/uploads'?{uploadId:'opaque-id',uploadURL:'https://upload.videodelivery.net/token',expiresAt:Date.now()+100000}: {uploadId:d.uploadId,status};};
  await assert.rejects(ensureLogeUpload(d,options({request,upload:async()=>{attempts++;throw Error('Connexion interrompue');}})),/Connexion/);
  assert.equal(d.uploadId,'opaque-id');assert.equal(requests[0].body.requestId,'publication-request');assert.equal(requests[0].body.filename,file.name);assert.equal(requests[0].body.size,file.size);
  status='ready';assert.equal(await ensureLogeUpload(d,options({request,upload:async()=>{attempts++;}})),'opaque-id');assert.equal(attempts,1);assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.equal(d.requestId,'publication-request');
});

test('waiting upload retries the same valid endpoint and processing polls without reupload',async()=>{
  for(const initial of ['waiting','processing']){
    const d={...draft(),uploadId:'opaque-id',uploadURL:'https://upload.videodelivery.net/token',expiresAt:Date.now()+100000};let polls=0,uploads=0;
    await ensureLogeUpload(d,options({request:async()=>({status:++polls===1?initial:'ready'}),upload:async(url)=>{assert.equal(url,d.uploadURL);uploads++;}}));
    assert.equal(uploads,initial==='waiting'?1:0);assert.equal(d.uploadStatus,'ready');
  }
});

test('processing timeout preserves sent upload and ready retry never reserves another video',async()=>{
  const d=draft();let sends=0,reservations=0,status='processing';
  const request=async(path)=>path==='/api/loge/uploads'?(reservations++,{uploadId:'opaque-id',uploadURL:'https://upload.videodelivery.net/token'}):{status};
  await assert.rejects(ensureLogeUpload(d,options({request,maxPolls:2,upload:async()=>{sends++;}})),/encore en préparation/);
  status='ready';await ensureLogeUpload(d,options({request,upload:async()=>{sends++;}}));assert.equal(sends,1);assert.equal(reservations,1);
});

test('expired or failed videos give a replacement instruction without consuming another reservation',async()=>{
  for(const status of ['waiting','error']){
    const d={...draft(),uploadId:'opaque-id',uploadURL:'https://upload.videodelivery.net/token',expiresAt:Date.now()-1000};let requests=0;
    await assert.rejects(ensureLogeUpload(d,options({request:async(path)=>{requests++;assert.match(path,/opaque-id$/);return {status};},upload:async()=>assert.fail('must not upload')})),/Sélectionne/);assert.equal(requests,1);
  }
});

test('navigation during reservation records the id but never starts upload or polling',async()=>{
  const d=draft(),controller=new AbortController();let release;
  const promise=ensureLogeUpload(d,options({signal:controller.signal,request:()=>new Promise(resolve=>{release=resolve;}),upload:async()=>assert.fail('stale upload')}));
  await new Promise(resolve=>setImmediate(resolve));controller.abort();release({uploadId:'reserved-before-navigation',uploadURL:'https://upload.videodelivery.net/token'});
  await assert.rejects(promise,{name:'AbortError'});assert.equal(d.uploadId,'reserved-before-navigation');assert.equal(d.requestId,'publication-request');
});

test('abort during processing prevents additional polling or a ready result',async()=>{
  const d={...draft(),uploadId:'opaque-id'},controller=new AbortController();let calls=0;
  await assert.rejects(ensureLogeUpload(d,options({signal:controller.signal,request:async()=>{calls++;return {status:'processing'};},wait:async()=>{controller.abort();}})),{name:'AbortError'});
  assert.equal(calls,2);
});

test('late reservation after file replacement is cancelled instead of overwriting the new draft',async()=>{
  const d=draft(),requests=[];let release;
  const promise=ensureLogeUpload(d,options({request:(path,init={})=>{requests.push({path,...init});return init.method==='POST'?new Promise(resolve=>release=resolve):Promise.resolve({ok:true});},upload:async()=>assert.fail('must not upload')}));
  await new Promise(resolve=>setImmediate(resolve));Object.assign(d,{file:{...file,name:'replacement.mp4'},requestId:'new-request',uploadId:null,durationChecked:false});release({uploadId:'old-reservation',uploadURL:'https://upload.videodelivery.net/token'});
  await assert.rejects(promise,{name:'AbortError'});assert.equal(d.uploadId,null);assert.equal(d.requestId,'new-request');assert.equal(d.durationChecked,false);assert.equal(requests[1].path,'/api/loge/uploads/old-reservation');assert.equal(requests[1].method,'DELETE');assert.equal(d.abandonedUploads.length,0);
});

test('Videography uses its own upload scope for reservation, polling and ready retry',async()=>{
  const d=draft(),calls=[];let ready=false;
  const request=async(path,init={})=>{calls.push([path,init.method||'GET']);if(init.method==='POST')return {uploadId:'life-id',uploadURL:'https://upload.videodelivery.net/token'};return {status:ready?'ready':'processing'};};
  await ensureLogeUpload(d,options({basePath:'/api/life-tree/uploads',request,upload:async()=>{ready=true;}}));
  await ensureLogeUpload(d,options({basePath:'/api/life-tree/uploads',request,upload:async()=>assert.fail('already ready')}));
  assert.deepEqual(calls,[['/api/life-tree/uploads','POST'],['/api/life-tree/uploads/life-id','GET'],['/api/life-tree/uploads/life-id','GET']]);
});

test('Videography cancels a late replaced reservation in its own scope',async()=>{
  const d=draft(),calls=[];let release;
  const pending=ensureLogeUpload(d,options({basePath:'/api/life-tree/uploads',request:(path,init={})=>{calls.push([path,init.method]);return init.method==='POST'?new Promise(resolve=>release=resolve):Promise.resolve({ok:true});}}));
  await new Promise(resolve=>setImmediate(resolve));d.requestId='replacement';d.file=null;release({uploadId:'abandoned'});
  await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(calls,[['/api/life-tree/uploads','POST'],['/api/life-tree/uploads/abandoned','DELETE']]);
});

test('a cut connection resumes on the same address by itself, without a new reservation',async()=>{
  const d=draft(),states=[],waits=[];let uploads=0,polls=0;
  const request=async(path,init={})=>path==='/api/loge/uploads'?{uploadId:'opaque-id',uploadURL:'https://upload.videodelivery.net/token',expiresAt:Date.now()+100000}:{status:++polls<=2?'waiting':'ready'};
  const upload=async url=>{assert.equal(url,'https://upload.videodelivery.net/token');if(++uploads<3)throw Object.assign(Error('La connexion a été interrompue pendant l’envoi.'),{network:true});};
  assert.equal(await ensureLogeUpload(d,options({request,upload,reconnect:async ms=>{waits.push(ms);},onState:state=>states.push(state)})),'opaque-id');
  assert.equal(uploads,3);assert.deepEqual(waits,[1500,4000]);assert.ok(states.filter(s=>s==='reconnecting').length===2);assert.equal(d.uploadSent,true);
});

test('after a cut, a file the server already received is not sent again',async()=>{
  for(const status of ['processing','ready']){
    const d=draft();let uploads=0,polls=0;
    const request=async path=>path==='/api/loge/uploads'?{uploadId:'opaque-id',uploadURL:'https://upload.videodelivery.net/token',expiresAt:Date.now()+100000}:{status:++polls===1?status:'ready'};
    const upload=async()=>{uploads++;throw Object.assign(Error('lost response'),{network:true});};
    assert.equal(await ensureLogeUpload(d,options({request,upload,reconnect:async()=>{}})),'opaque-id');assert.equal(uploads,1,status);
  }
});

test('repeated cuts end with a network error; HTTP refusals and cancellation are never retried',async()=>{
  const reservation=async path=>path==='/api/loge/uploads'?{uploadId:'opaque-id',uploadURL:'https://upload.videodelivery.net/token',expiresAt:Date.now()+100000}:{status:'waiting'};
  let uploads=0;
  await assert.rejects(ensureLogeUpload(draft(),options({request:reservation,reconnect:async()=>{},upload:async()=>{uploads++;throw Object.assign(Error('cut'),{network:true});}})),error=>error.network===true);
  assert.equal(uploads,6);
  uploads=0;await assert.rejects(ensureLogeUpload(draft(),options({request:reservation,reconnect:async()=>{},upload:async()=>{uploads++;throw Error('L’envoi a échoué. Réessaie.');}})),/échoué/);assert.equal(uploads,1);
  const controller=new AbortController();uploads=0;
  await assert.rejects(ensureLogeUpload(draft(),options({signal:controller.signal,request:reservation,reconnect:async()=>{controller.abort();throw new DOMException('Envoi interrompu','AbortError');},upload:async()=>{uploads++;throw Object.assign(Error('cut'),{network:true});}})),{name:'AbortError'});assert.equal(uploads,1);
});

test('the reconnection wait holds until the page is visible and the network is back',async()=>{
  const listeners={};const doc={hidden:true,addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener:name=>{delete listeners[name];}};
  const nav={onLine:false};
  const box=vm.createContext({DOMException,setTimeout,clearTimeout,URL,document:doc,navigator:nav,addEventListener:(name,fn)=>{listeners['window:'+name]=fn;},removeEventListener:name=>{delete listeners['window:'+name];}});
  vm.runInContext(source+';globalThis.helpers={uploadReconnect};',box);
  let resolved=false;const wait=box.helpers.uploadReconnect(5).then(()=>{resolved=true;});
  await new Promise(r=>setTimeout(r,20));assert.equal(resolved,false);
  nav.onLine=true;listeners['window:online']();await new Promise(r=>setTimeout(r,5));assert.equal(resolved,false,'still hidden');
  doc.hidden=false;listeners.visibilitychange();await wait;assert.equal(resolved,true);assert.equal(listeners.visibilitychange,undefined);
});
