import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectRoot=fileURLToPath(new URL('../',import.meta.url));

export function validateCommitSha(value){
  if(typeof value!=='string'||!/^[a-fA-F0-9]{40}$/.test(value)){
    throw new Error('Expected a complete Git commit SHA (40 hexadecimal characters).');
  }
  return value.toLowerCase();
}

export function resolveCommitSha({env=process.env,root=projectRoot}={}){
  // A malformed CI value must never silently fall back to another revision.
  if(env.WORKERS_CI_COMMIT_SHA!==undefined)return validateCommitSha(env.WORKERS_CI_COMMIT_SHA);
  return validateCommitSha(execFileSync('git',['rev-parse','HEAD'],{
    cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],
  }).trim());
}

export async function prepareDeployment({root=projectRoot,env=process.env,now=new Date()}={}){
  const info={commitSha:resolveCommitSha({root,env}),builtAt:now.toISOString()};
  const output=join(root,'public','deploy-info.json');
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(info,null,2)+'\n','utf8');
  return info;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  prepareDeployment().then(info=>{
    console.log(`Deployment prepared: ${info.commitSha} (${info.builtAt}).`);
  }).catch(error=>{
    console.error(`Deployment preparation failed: ${error.message}`);
    process.exitCode=1;
  });
}
