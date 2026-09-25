import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleConversation, conversationAccess} from '../src/conversation.js';
import {ensureGameTables} from '../src/echelon-api.js';
import {NODES} from '../src/echelon.js';
import {NODES as OLD} from '../src/enigmas57.js';

const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT);
  INSERT INTO users VALUES(1,'High'),(2,'Low'),(3,'New'),(4,'History'),(5,'Admin');
  CREATE TABLE conversation_messages(id INTEGER PRIMARY KEY, user_id INTEGER, body TEXT, min_echelon INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO conversation_messages VALUES(1,1,'Historic private',6,CURRENT_TIMESTAMP),(2,1,'Historic common',2,CURRENT_TIMESTAMP);`);
function prepared(text,args=[]){const q=sql.prepare(text),params=()=>Object.fromEntries(args.map((v,i)=>[String(i+1),v]));return{
  bind(...values){return prepared(text,values);},async all(){return{results:q.all(params())};},async first(){return q.get(params())||null;},async run(){const r=q.run(params());return{meta:{...r,last_row_id:Number(r.lastInsertRowid)}};}
};}
const env={DB:{prepare:prepared,async batch(qs){return Promise.all(qs.map(q=>q.run()));}}};
async function call(user,body,query=''){const request=new Request('https://test/api/conversation'+query,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});const res=await handleConversation(request,env,{getUser:async()=>user,json:(v,status=200)=>Response.json(v,{status})});return{status:res.status,...await res.json()};}
const high={id:1},low={id:2},history={id:4},admin={id:5,is_admin:true};

test('conversation uses every actual rung, rejects unauthorized levels and preserves historical audiences',async()=>{
  await ensureGameTables(env);
  const ids=NODES.flatMap(n=>n.answers.map(a=>a.id));
  const put=(user,id)=>sql.prepare("INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,CURRENT_TIMESTAMP)").run(user,id);
  ids.slice(0,10).forEach(id=>put(1,id));
  ['eg-02-1','eg-02-2'].forEach(id=>put(2,id));
  OLD.flatMap(n=>n.answers.map(a=>a.id)).forEach(id=>put(4,id));
  assert.equal(conversationAccess(low,['eg-02-1','eg-02-2'].map(riddle_id=>({riddle_id,solved_at:'now'}))).readable,true);
  assert.equal((await call(null)).status,401);
  assert.equal((await call({id:3})).status,403);
  assert.equal((await call(high,{body:'At ten',min_echelon:10})).status,201);
  assert.equal((await call(high,{body:'Too high',min_echelon:11})).status,403);
  for(const n of [1,2.5,-1,'10'])assert.equal((await call(high,{body:'Invalid',min_echelon:n})).status,400);
  assert.equal((await call(low,{body:'At two',min_echelon:2})).status,201);
  const highView=await call(high);
  assert.equal(highView.echelon,10);
  assert.ok(highView.messages.some(m=>m.body==='At ten'&&m.echelon_version===2));
  assert.ok(!highView.messages.some(m=>m.body==='Historic private'));
  assert.ok(highView.messages.some(m=>m.body==='Historic common'&&m.echelon_version===1));
  const lowView=await call(low);
  assert.equal(lowView.echelon,2);
  assert.deepEqual(lowView.messages.map(m=>m.body),['At two']);
  assert.ok((await call(history)).messages.some(m=>m.body==='Historic private'));
  const maximum=ids.length;
  assert.equal((await call(admin)).echelon,maximum);
  assert.equal((await call(admin,{body:'Highest authored rung',min_echelon:maximum})).status,201);
  assert.equal((await call(admin,{body:'Future',min_echelon:maximum+1})).status,403);
  assert.ok(!(await call(high)).messages.some(m=>m.body==='Highest authored rung'));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM conversation_messages WHERE echelon_version=1').get().n,2);
  assert.ok(highView.messages.every(m=>m.theme==='general'));
  assert.deepEqual(highView.themes.map(t=>t.id),['general','indices','interpretations','idees']);
  assert.equal((await call(high,{body:'Hidden hint',min_echelon:10,theme:'indices'})).status,201);
  assert.equal((await call(low,{body:'Shared hint',min_echelon:2,theme:'indices'})).status,201);
  assert.equal((await call(high,{body:'Interpretation',min_echelon:4,theme:'interpretations'})).status,201);
  assert.equal((await call(high,{body:'Creative idea',min_echelon:6,theme:'idees'})).status,201);
  assert.equal((await call(high,{body:'Unknown',min_echelon:2,theme:'spoilers'})).status,400);
  for(const query of ['?theme=invalid','?mode=invalid','?before=-1','?before=1.2','?niveau=NaN','?mode=exact&niveau=1'])assert.equal((await call(high,null,query)).status,400);
  assert.equal((await call(low,null,'?mode=exact&niveau=10')).status,403);
  assert.deepEqual((await call(low,null,'?theme=indices')).messages.map(m=>m.body),['Shared hint']);
  assert.deepEqual((await call(high,null,'?theme=indices&mode=exact&niveau=10')).messages.map(m=>m.body),['Hidden hint']);
  assert.deepEqual((await call(high,null,'?theme=indices&mode=max&niveau=2')).messages.map(m=>m.body),['Shared hint']);
  assert.deepEqual((await call(high,null,'?theme=interpretations&mode=min&niveau=4')).messages.map(m=>m.body),['Interpretation']);
  assert.deepEqual((await call(high,null,'?theme=indices&mode=historique')).messages,[]);
  assert.deepEqual((await call(history,null,'?theme=general&mode=historique')).messages.map(m=>m.body),['Historic private','Historic common']);
  // Filtering happens before pagination, not on a truncated all-themes window.
  const insert=sql.prepare('INSERT INTO conversation_messages(user_id,body,min_echelon,echelon_version,theme) VALUES(1,?,2,2,?)');
  for(let i=0;i<205;i++)insert.run('Hint '+i,'indices');
  for(let i=0;i<110;i++)insert.run('General '+i,'general');
  const first=await call(low,null,'?theme=indices');assert.equal(first.messages.length,100);assert.equal(first.messages.at(-1).body,'Hint 204');
  const second=await call(low,null,'?theme=indices&before='+first.nextBefore);assert.equal(second.messages.length,100);
  const third=await call(low,null,'?theme=indices&before='+second.nextBefore);assert.equal(third.messages.length,6);assert.equal(third.nextBefore,null);
  const messages=[...third.messages,...second.messages,...first.messages];assert.equal(new Set(messages.map(m=>m.id)).size,206);
  assert.ok(messages.every(m=>m.theme==='indices'&&m.min_echelon===2));
});
