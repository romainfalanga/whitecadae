import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {projectRoot,resolveCommitSha,validateCommitSha} from './prepare-deployment.mjs';

const publicAssets=[
  {path:'/',file:'index.html'},
  {path:'/app.js',file:'app.js'},
  {path:'/sw.js',file:'sw.js'},
];
const normalizeText=text=>text.replace(/\r\n/g,'\n');

export async function verifyDeployment({
  origin='https://whitecadae.fr',expectedSha=resolveCommitSha(),root=projectRoot,
  fetchImpl=globalThis.fetch,timeoutMs=30000,requestTimeoutMs=5000,retryDelayMs=2000,
  assets=publicAssets,
}={}){
  expectedSha=validateCommitSha(expectedSha);
  const base=new URL(origin);
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password){
    throw new Error('Deployment origin must be an HTTP(S) URL without credentials.');
  }
  for(const [name,value] of Object.entries({timeoutMs,requestTimeoutMs,retryDelayMs})){
    if(!Number.isFinite(value)||value<0||(name!=='retryDelayMs'&&value===0)){
      throw new Error(`${name} must be a positive duration in milliseconds.`);
    }
  }
  if(timeoutMs>30000)throw new Error('Deployment verification is limited to 30000 milliseconds.');
  const files=await Promise.all(assets.map(async asset=>({
    ...asset,text:normalizeText(await readFile(join(root,'public',asset.file),'utf8')),
  })));
  const deadline=Date.now()+timeoutMs;
  let attempts=0,lastError,sequence=0;

  async function request(path,consume){
    const remaining=deadline-Date.now();
    if(remaining<=0){
      const error=new Error('Deployment verification deadline reached.');
      error.code='DEPLOYMENT_DEADLINE';
      throw error;
    }
    const url=new URL(path,base);
    // Each retry must miss intermediaries' caches, including cached SPA fallbacks.
    url.searchParams.set('__deploy_check',`${expectedSha}-${Date.now()}-${sequence++}`);
    const controller=new AbortController();
    let timer;
    try{
      return await Promise.race([
        Promise.resolve().then(()=>fetchImpl(url,{
          method:'GET',redirect:'error',cache:'no-store',signal:controller.signal,
          headers:{
            'Cache-Control':'no-cache, no-store','Pragma':'no-cache',
            'User-Agent':'Mozilla/5.0 WhiteCadaeDeploymentCheck/1.0',
            'Accept':path==='/deploy-info.json'||path.startsWith('/api/')?'application/json':'*/*',
          },
        })).then(async response=>{
          if(response.status!==200)throw new Error(`${path}: HTTP ${response.status}, expected 200.`);
          return consume(response);
        }),
        new Promise((_,reject)=>{
          timer=setTimeout(()=>{
            controller.abort();
            reject(new Error(`${path}: request timed out.`));
          },Math.min(requestTimeoutMs,remaining));
        }),
      ]);
    }finally{clearTimeout(timer);}
  }

  async function json(path){
    return request(path,async response=>{
      if(!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')){
        throw new Error(`${path}: expected a JSON response.`);
      }
      const value=await response.json();
      if(!value||typeof value!=='object'||Array.isArray(value)){
        throw new Error(`${path}: expected a JSON object.`);
      }
      return value;
    });
  }

  do{
    attempts++;
    try{
      const info=await json('/deploy-info.json');
      if(validateCommitSha(info.commitSha)!==expectedSha){
        throw new Error(`Deployed commit ${info.commitSha} differs from expected ${expectedSha}.`);
      }
      if(typeof info.builtAt!=='string'||!Number.isFinite(Date.parse(info.builtAt))){
        throw new Error('/deploy-info.json: build timestamp is missing or invalid.');
      }
      // The marker alone cannot establish that every public asset was published.
      const checks=await Promise.allSettled([
        json('/api/me'),json('/api/albums'),
        ...files.map(asset=>request(asset.path,async response=>{
          if(normalizeText(await response.text())!==asset.text){
            throw new Error(`${asset.path}: deployed content differs from the local revision.`);
          }
        })),
      ]);
      const failed=checks.find(check=>check.status==='rejected');
      if(failed)throw failed.reason;
      return {commitSha:expectedSha,builtAt:info.builtAt,origin:base.origin,attempts,
        checked:['/deploy-info.json','/api/me','/api/albums',...files.map(asset=>asset.path)]};
    }catch(error){
      // Preserve the useful mismatch/API diagnostic when the final retry starts
      // exactly as the propagation window expires.
      if(error.code!=='DEPLOYMENT_DEADLINE'||!lastError)lastError=error;
    }
    const remaining=deadline-Date.now();
    if(remaining<=0)break;
    await delay(Math.min(retryDelayMs,remaining));
  }while(Date.now()<deadline);
  throw new Error(`Deployment verification failed for ${expectedSha} after ${attempts} attempt(s): ${lastError?.message||'deadline reached'}`);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  verifyDeployment().then(result=>{
    console.log(`Deployment verified: ${result.origin} serves ${result.commitSha}; ${result.checked.length} checks passed.`);
  }).catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
