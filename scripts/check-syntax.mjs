import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(path,item.name)):item.name.endsWith('.js')?[join(path,item.name)]:[]);}
const sources=['public','src'].flatMap(dir=>files(join(root,dir)));
for(const path of sources){const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);}
console.log(`Syntax checked: ${sources.length} JavaScript files.`);
