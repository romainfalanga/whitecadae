import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {NODES} from '../src/echelon.js';
export function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  sql.exec('CREATE TABLE IF NOT EXISTS riddle_progress(user_id INTEGER,riddle_id TEXT,solved_at TEXT,PRIMARY KEY(user_id,riddle_id))');
  const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
  for(const level of [0,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,22,23,25,99]){
    const id=level+1;sql.prepare('INSERT INTO users(id,email,username,password_hash,is_admin) VALUES(?,?,?,?,?)').run(id,`qa${level}@local.test`,`QA${level}`,'unused',level===99?1:0);
    sql.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run('qa'+level,id,'2099-01-01');
    for(const riddle of ids.slice(0,level===99?0:Math.max(0,level-1)))sql.prepare('INSERT INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,?)').run(id,riddle,'2026-09-26');
  }
  function prepare(query,args=[]){const params=()=>Object.fromEntries(args.map((v,i)=>[String(i+1),v]));const sync=()=>{const r=sql.prepare(query).run(params());return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}};return {bind(...a){return prepare(query,a)},async first(){return sql.prepare(query).get(params())||null},async all(){return {results:sql.prepare(query).all(params())}},async run(){return sync();},sync};}
  const objects=new Map();let calls=0;
  const env={PRIVATE_SPACES_ENABLED:'true',PRIVATE_DATA_KEYS:JSON.stringify({active:'test',keys:{test:Buffer.alloc(32,7).toString('base64')},index:Buffer.alloc(32,8).toString('base64')}),DB:{prepare,async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.sync());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}},MEDIA:{
    async put(key,body,options){const data=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,{data,options});return {size:data.length};},
    async head(key){const object=objects.get(key);return object?{size:object.data.length}:null;},
    async get(key,options){const object=objects.get(key);if(!object)return null;let data=object.data;const range=options?.range;if(range)data=data.slice(range.offset,range.offset+range.length);return {body:data,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),size:data.length};},
    async delete(key){objects.delete(key);},
  },AI:{async run(){calls++;return {text:'Bonjour à tous.',segments:[{start:0,end:1,text:'Bonjour à tous.'}]};}}};
  return {sql,env,objects,get aiCalls(){return calls;}};
}
