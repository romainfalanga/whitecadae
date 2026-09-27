import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './community-fixture.mjs';
import {NODES} from '../src/echelon.js';

const ids = NODES.flatMap(n=>n.answers.map(a=>a.id));
function setup(t) {
  const f = fixture(); t.after(()=>f.sql.close());
  const call = async (level=12, path='', body, headers={}) => {
    const response = await worker.fetch(new Request('https://test.local/api/conversation'+path, {
      method:body===undefined?'GET':'POST', headers:{...(level===null?{}:{Cookie:'wc_session=qa'+level}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    }),f.env);
    return {status:response.status,...await response.json()};
  };
  const raise = (from,to) => { for(const id of ids.slice(0,to-1)) f.sql.prepare('INSERT OR IGNORE INTO riddle_progress(user_id,riddle_id,solved_at) VALUES(?,?,CURRENT_TIMESTAMP)').run(from+1,id); };
  const create = (level=12,body={}) => call(level,'/topics',{title:'Un sujet',description:'En parler ensemble.',client_id:crypto.randomUUID(),...body});
  return {...f,call,raise,create};
}

test('new messages freeze the actual sender level; forged audiences and later progression cannot alter it',async t=>{
  const {call,raise,sql} = setup(t);
  assert.equal((await call(null)).status,401); assert.equal((await call(0)).status,403);
  const sent = await call(3,'',{body:'Au troisième échelon',min_echelon:2,theme:'indices',author_echelon:99});
  assert.equal(sent.status,201); assert.equal(sent.echelon,3);
  assert.deepEqual((await call(2)).messages,[]);
  let message = (await call(3)).messages[0];
  assert.equal(message.author_echelon,3); assert.equal(message.echelon_version,4); assert.equal(message.theme,'general');
  raise(3,6);
  assert.equal((await call(3)).echelon,6);
  assert.equal((await call(3,'',{body:'Au sixième échelon',min_echelon:1})).echelon,6);
  assert.deepEqual((await call(5)).messages.map(m=>m.body),['Au troisième échelon']);
  assert.deepEqual((await call(6)).messages.map(m=>m.author_echelon),[3,6]);
  assert.equal(sql.prepare('SELECT min_echelon FROM conversation_messages WHERE id=?').get(sent.id).min_echelon,3);
  assert.equal((await call(99,'',{body:'Auteur administrateur'})).echelon,1);
  assert.equal((await call(99)).echelon,1); // Admin reading rights never fabricate an author level.
});

test('topic visibility starts at 12, with one total slot at 12, two at 18 and three at 23',async t=>{
  const {call,create,raise} = setup(t);
  for (const level of [0,2,3,11]) {
    assert.equal((await call(level,'/topics')).status,403);
    assert.equal((await create(level)).status,403);
    assert.equal((await call(level,'?topic=1')).status,403);
    assert.equal((await call(level,'?topic=1',{body:'Intrusion'})).status,403);
  }
  assert.equal((await call(null,'/topics')).status,401);
  const first = await create(); assert.equal(first.status,201);
  assert.equal((await create()).status,409);
  raise(12,17); assert.equal((await create()).status,409);
  raise(12,18); assert.equal((await create()).status,201); assert.equal((await create()).status,409);
  raise(12,22); assert.equal((await create()).status,409);
  raise(12,23); assert.equal((await create()).status,201); assert.equal((await create()).status,409);
  const directory = await call(13,'/topics');
  assert.equal(directory.topics.length,3);
  assert.deepEqual(directory.topics.map(t=>t.created_echelon),[23,18,12]);
  assert.equal((await call(13,'?topic='+directory.topics[0].id)).status,200);
  const allowance = (await call(12,'/topics')).allowance;
  assert.deepEqual(allowance,{accessible:true,used:3,limit:3,nextLevel:null});
});

test('concurrent topic creation respects the quota and a retried creation cannot consume another slot',async t=>{
  const {create,call,raise} = setup(t);
  const body = {title:'Réflexion',client_id:crypto.randomUUID()};
  const results = await Promise.all([create(12,body),create(12,body),create(12)]);
  assert.equal(results[0].status,201); assert.equal(results[1].id,results[0].id); assert.equal(results[2].status,409);
  assert.equal((await call(12,'/topics')).topics.length,1);
  raise(12,18);
  assert.equal((await create(12,body)).id,results[0].id);
  assert.equal((await call(12,'/topics')).allowance.used,1);
  const more = await Promise.all([create(),create(),create()]);
  assert.deepEqual(more.map(r=>r.status).sort(),[201,409,409]);
});

test('rooms and general messages stay separate; room titles open at 12 but each message keeps its own audience',async t=>{
  const {create,call} = setup(t);
  const first = await create(18), second = await create(23);
  assert.equal((await call(12,'/topics')).topics.length,2);
  assert.equal((await call(18,'?topic='+first.id,{body:'À partir de 18',min_echelon:12})).status,201);
  assert.deepEqual((await call(12,'?topic='+first.id)).messages,[]);
  assert.equal((await call(18,'?topic='+first.id)).messages[0].author_echelon,18);
  assert.deepEqual((await call(23,'?topic='+second.id)).messages,[]);
  assert.deepEqual((await call(23)).messages,[]);
  await call(12,'',{body:'Discussion générale'});
  assert.deepEqual((await call(23)).messages.map(m=>m.body),['Discussion générale']);
  assert.equal((await call(23,'?topic='+first.id)).messages.length,1);
  assert.equal((await call(12,'?topic=999999')).status,404);
  assert.equal((await call(12,'?topic=999999',{body:'Absent'})).status,404);
});

test('old schema migrates without converting old audiences into claimed author levels',async t=>{
  const {sql,call} = setup(t);
  sql.exec(`DROP TABLE conversation_messages;
    CREATE TABLE conversation_messages(id INTEGER PRIMARY KEY,user_id INTEGER,body TEXT,min_echelon INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO conversation_messages(user_id,body,min_echelon) VALUES(13,'Historique privé',6),(13,'Historique commun',2);`);
  const response = await call(12);
  assert.ok(!response.messages.some(m=>m.body==='Historique privé'));
  assert.equal(response.messages[0].author_echelon,null); assert.equal(response.messages[0].echelon_version,1);
  assert.equal(sql.prepare('SELECT min_echelon FROM conversation_messages WHERE body=?').get('Historique privé').min_echelon,6);
  sql.exec("INSERT INTO conversation_messages(user_id,body,min_echelon,echelon_version,theme) VALUES(13,'Ancien choix',12,3,'general'),(13,'Ancien point de départ',12,2,'general')");
  assert.ok((await call(12)).messages.some(m=>m.body==='Ancien choix'&&m.author_echelon===null));
  assert.ok(!(await call(12)).messages.some(m=>m.body==='Ancien point de départ'));
  assert.ok((await call(13)).messages.some(m=>m.body==='Ancien point de départ'&&m.min_echelon===13));
});

test('message filtering and pagination apply access and room constraints before limiting results',async t=>{
  const {sql,call,create} = setup(t); const topic = await create();
  const insert = sql.prepare('INSERT INTO conversation_messages(user_id,body,min_echelon,echelon_version,topic_id) VALUES(13,?,?,4,?)');
  for(let i=0;i<205;i++) insert.run('Accessible '+i,12,null);
  for(let i=0;i<110;i++) { insert.run('Privé '+i,18,null); insert.run('Salon '+i,12,topic.id); }
  const first=await call(12),second=await call(12,'?before='+first.nextBefore),third=await call(12,'?before='+second.nextBefore);
  assert.equal(first.messages.length,100); assert.equal(second.messages.length,100); assert.equal(third.messages.length,5); assert.equal(third.nextBefore,null);
  const all=[...third.messages,...second.messages,...first.messages]; assert.equal(new Set(all.map(m=>m.id)).size,205);
  assert.ok(all.every(m=>m.body.startsWith('Accessible')));
  const updates=await call(12,'?after='+all[0].id); assert.deepEqual(updates.messages.map(m=>m.id),all.slice(1,101).map(m=>m.id)); assert.equal(updates.nextAfter,updates.messages.at(-1).id);
  assert.equal((await call(18,'?mode=exact&niveau=18')).messages.length,100);
  assert.ok((await call(18,'?mode=max&niveau=12')).messages.every(m=>m.min_echelon===12));
  assert.equal((await call(12,'?mode=exact&niveau=18')).status,403);
  assert.equal((await call(12,'?topic='+topic.id)).messages.length,100);
});

test('directory search and pagination include all creators without exposing message contents',async t=>{
  const {call,sql} = setup(t); await call(12);
  const insert=sql.prepare('INSERT INTO conversation_topics(user_id,title,description,created_echelon,client_id) VALUES(13,?,?,12,?)');
  for(let i=0;i<55;i++)insert.run('Sujet '+i,'Présentation','seed-topic-'+i);
  const first=await call(12,'/topics'),second=await call(12,'/topics?before='+first.nextBefore);
  assert.equal(first.topics.length,50);assert.equal(second.topics.length,5);assert.equal(second.nextBefore,null);
  assert.equal(new Set([...first.topics,...second.topics].map(t=>t.id)).size,55);
  assert.deepEqual((await call(12,'/topics?q=Sujet%2054')).topics.map(t=>t.title),['Sujet 54']);
  assert.deepEqual((await call(12,'/topics?q=%25')).topics,[]);
});

test('invalid, oversized and cross-origin requests fail without publishing',async t=>{
  const {call,create,sql} = setup(t);
  for(const query of ['?topic=','?topic=-1','?topic=1.5','?topic=wat','?mode=invalid','?before=-1','?after=-1','?before=1&after=2','?niveau=NaN','?mode=exact&niveau=1']) assert.equal((await call(12,query)).status,400,query);
  for(const body of [{body:''},{body:'x'.repeat(2001)},{body:'x'.repeat(20000)},{body:{text:'wrong'}}])assert.equal((await call(12,'',body)).status,400);
  assert.equal((await call(12,'',{body:'Cross origin'},{Origin:'https://evil.test'})).status,403);
  for(const body of [{title:''},{title:'x'.repeat(81)},{description:'x'.repeat(501)},{client_id:'invalid'}])assert.equal((await create(12,body)).status,400);
  assert.equal((await call(12,'/topics',{title:'Test',client_id:crypto.randomUUID()},{Origin:'https://evil.test'})).status,403);
  assert.equal((await call(12,'/unknown')).status,404);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM conversation_topics').get().n,0);
});
