import {MAX_GAME_LEVEL, gameLevel, accessLevel} from './echelon.js';
import {gameRows} from './echelon-api.js';
import {contentAccess, CONVERSATION_LEVEL, TOPIC_LEVELS, topicLimit} from './content-access.js';

export function conversationAccess(user, rows = []) {
  const echelon = gameLevel(rows);
  return {echelon, ceiling:user?.is_admin ? MAX_GAME_LEVEL : echelon, legacy:accessLevel(rows),
    readable:contentAccess(user, rows).conversation, topics:echelon >= TOPIC_LEVELS[0], limit:topicLimit(echelon)};
}

const ready = new WeakMap();
export async function ensureConversation(env) {
  if (ready.has(env.DB)) return ready.get(env.DB);
  const pending = (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS conversation_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      created_echelon INTEGER NOT NULL, client_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, client_id)
    )`).run();
    const roomColumn = async name => (await env.DB.prepare('PRAGMA table_info(conversation_topics)').all()).results.some(c=>c.name===name);
    for(const [name,definition] of [['kind',"TEXT NOT NULL DEFAULT 'topic'"],['question',"TEXT NOT NULL DEFAULT ''"],['goal',"TEXT NOT NULL DEFAULT ''"],['needs',"TEXT NOT NULL DEFAULT ''"],['summary',"TEXT NOT NULL DEFAULT ''"],['resources',"TEXT NOT NULL DEFAULT '[]'"],['status',"TEXT NOT NULL DEFAULT 'open'"],['revision','INTEGER NOT NULL DEFAULT 0']]){
      if(!await roomColumn(name)){
        try{await env.DB.prepare(`ALTER TABLE conversation_topics ADD COLUMN ${name} ${definition}`).run();}
        catch(error){if(!await roomColumn(name))throw error;}
      }
    }
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_topics_kind_owner ON conversation_topics(kind,user_id,id)').run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL, min_echelon INTEGER NOT NULL DEFAULT 2,
      echelon_version INTEGER NOT NULL DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'general',
      topic_id INTEGER REFERENCES conversation_topics(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    const hasColumn = async name => (await env.DB.prepare('PRAGMA table_info(conversation_messages)').all()).results.some(c => c.name === name);
    for (const [name, definition] of [['echelon_version','INTEGER NOT NULL DEFAULT 1'], ['theme',"TEXT NOT NULL DEFAULT 'general'"], ['topic_id','INTEGER REFERENCES conversation_topics(id)']]) {
      if (!await hasColumn(name)) {
        try { await env.DB.prepare(`ALTER TABLE conversation_messages ADD COLUMN ${name} ${definition}`).run(); }
        catch (error) { if (!await hasColumn(name)) throw error; }
      }
    }
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conversation_topic_id ON conversation_messages(topic_id,id)').run();
    // Merge the former categories, retaining each message's original audience.
    await env.DB.prepare("UPDATE conversation_messages SET theme='general' WHERE theme!='general'").run();
  })();
  ready.set(env.DB, pending);
  try { await pending; } catch (error) { ready.delete(env.DB); throw error; }
}

async function topicAllowance(env, user, access, kind='topic') {
  const {n} = await env.DB.prepare('SELECT COUNT(*) AS n FROM conversation_topics WHERE user_id=?1 AND kind=?2').bind(user.id,kind).first();
  return {accessible:access.topics, used:n, limit:access.limit, nextLevel:TOPIC_LEVELS.find(level => level > access.echelon) ?? null};
}

export async function readBody(request, limit=16384) {
  // Cap streamed input as well as requests carrying Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Requête invalide.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Requête trop longue.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleConversation(request, env, {getUser, json}) {
  const user = await getUser(request, env);
  if (!user) return json({error:'Connexion requise.'}, 401);
  const access = conversationAccess(user, await gameRows(env, user.id));
  if (!access.readable) return json({error:'La conversation s’ouvre à l’échelon 2.', locked:'conversation'}, 403);
  const url = new URL(request.url), params = url.searchParams;
  const directory = ['/api/conversation/topics','/api/conversation/projects'].includes(url.pathname);
  const kind = url.pathname.endsWith('/projects') ? 'project' : 'topic';
  const noun = kind==='project' ? 'projet' : 'sujet';
  if (!directory && url.pathname !== '/api/conversation') return json({error:'Page inconnue.'}, 404);
  if (!['GET','POST'].includes(request.method)) return json({error:'Méthode indisponible.'}, 405);
  if (request.method === 'POST' && request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) return json({error:'Origine invalide.'}, 403);
  const topicId = params.has('topic') ? Number(params.get('topic')) : null;
  if (topicId !== null && (!Number.isSafeInteger(topicId) || topicId <= 0)) return json({error:'Sujet invalide.'}, 400);
  if ((directory || topicId !== null) && !access.topics) return json({error:'Tous les sujets s’ouvrent à l’échelon 12.', locked:'topics', minimum_echelon:12}, 403);
  await ensureConversation(env);
  let topic = null;
  if (topicId !== null) {
    topic = await env.DB.prepare('SELECT t.id,t.kind,t.title,t.description,t.created_echelon,t.created_at,u.username FROM conversation_topics t JOIN users u ON u.id=t.user_id WHERE t.id=?1').bind(topicId).first();
    if (!topic) return json({error:'Sujet introuvable.'}, 404);
  }

  if (directory) {
    if (request.method === 'GET') {
      const before = Number(params.get('before') || 0), search = (params.get('q') || '').trim();
      if (!Number.isSafeInteger(before) || before < 0 || search.length > 80) return json({error:'Recherche invalide.'}, 400);
      const {results} = await env.DB.prepare(`SELECT t.id,t.kind,t.title,t.description,t.status,t.created_echelon,t.created_at,u.username
        FROM conversation_topics t JOIN users u ON u.id=t.user_id
        WHERE (?1=0 OR t.id<?1) AND (?2='' OR instr(lower(t.title),lower(?2))>0) AND t.kind=?3
        ORDER BY t.id DESC LIMIT 51`).bind(before, search, kind).all();
      const topics = results.slice(0,50);
      return json({topics, kind, echelon:access.echelon, allowance:await topicAllowance(env,user,access,kind), nextBefore:results.length>50 ? topics.at(-1).id : null});
    }
    let body;
    try { body = await readBody(request); } catch { return json({error:'Requête invalide ou trop longue.'}, 400); }
    const title = typeof body?.title === 'string' ? body.title.trim().replace(/\s+/g,' ') : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (!title || title.length > 80 || description.length > 500) return json({error:'Indique un titre de 1 à 80 caractères et une description de 500 caractères maximum.'}, 400);
    if (typeof body?.client_id !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.client_id)) return json({error:'Identifiant de création invalide.'}, 400);
    // A single SQLite statement makes quota enforcement atomic, even when two
    // tabs send requests together. The unique key makes retries idempotent.
    await env.DB.prepare(`INSERT INTO conversation_topics(user_id,title,description,created_echelon,client_id,kind)
      SELECT ?1,?2,?3,?4,?5,?7 WHERE (SELECT COUNT(*) FROM conversation_topics WHERE user_id=?1 AND kind=?7) < ?6
      ON CONFLICT(user_id,client_id) DO NOTHING`).bind(user.id,title,description,access.echelon,body.client_id,access.limit,kind).run();
    const created = await env.DB.prepare('SELECT id FROM conversation_topics WHERE user_id=?1 AND client_id=?2 AND kind=?3').bind(user.id,body.client_id,kind).first();
    const allowance = await topicAllowance(env,user,access,kind);
    if (!created) return json({error:allowance.nextLevel ? `Tu as utilisé tes ${access.limit} ${noun}${access.limit>1?'s':''}. Le prochain s’ouvre à l’échelon ${allowance.nextLevel}.` : `Tu as déjà créé tes trois ${noun}s.`, allowance}, 409);
    return json({ok:true, id:created.id, allowance}, 201);
  }

  if (request.method === 'GET') {
    const mode = params.get('mode') || 'tout';
    if (!['tout','exact','min','max','historique'].includes(mode)) return json({error:'Filtre inconnu.'}, 400);
    const level = Number(params.get('niveau') || CONVERSATION_LEVEL), before = Number(params.get('before') || 0), after = Number(params.get('after') || 0);
    if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after) || after < 0 || (before && after)) return json({error:'Pagination invalide.'}, 400);
    if (!Number.isSafeInteger(level) || level < CONVERSATION_LEVEL) return json({error:'Échelon invalide.'}, 400);
    if (!['tout','historique'].includes(mode) && level > access.ceiling) return json({error:'Cet échelon n’est pas encore atteint.'}, 403);
    // v1 uses the old rank system; v2 predates the level-1 starting point;
    // v3 stored a chosen audience. Only v4 records the author's actual level.
    const {results} = await env.DB.prepare(`SELECT m.id,m.body,
      (m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END) AS min_echelon,
      CASE WHEN m.echelon_version>=4 THEN m.min_echelon ELSE NULL END AS author_echelon,
      m.echelon_version,m.theme,m.created_at,u.username
      FROM conversation_messages m JOIN users u ON u.id=m.user_id
      WHERE m.topic_id IS ?1
        AND (?2=1 OR (m.echelon_version>=2 AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END<=?3)
          OR (m.echelon_version=1 AND m.min_echelon<=?4))
        AND (?5='tout' OR (?5='historique' AND m.echelon_version=1)
          OR (m.echelon_version>=2 AND ((?5='exact' AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END=?6)
            OR (?5='min' AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END>=?6)
            OR (?5='max' AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END<=?6))))
        AND (?7=0 OR m.id<?7) AND (?8=0 OR m.id>?8)
      ORDER BY m.id ${after?'ASC':'DESC'} LIMIT 101`).bind(topicId,user.is_admin?1:0,access.echelon,access.legacy,mode,level,before,after).all();
    const messages = results.slice(0,100); if (!after) messages.reverse();
    return json({messages,topic,echelon:access.echelon,readCeiling:access.ceiling,allowance:await topicAllowance(env,user,access),
      nextBefore:!after && results.length>100 ? messages[0].id : null, nextAfter:after && results.length>100 ? messages.at(-1).id : null});
  }
  let body;
  try { body = await readBody(request); } catch { return json({error:'Requête invalide ou trop longue.'}, 400); }
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text || text.length>2000) return json({error:'Écris un message de 1 à 2000 caractères.'}, 400);
  // Ignore old/forged audience and theme fields. The server is the sole source
  // of the saved level, and subsequent progression never rewrites this row.
  const result = await env.DB.prepare('INSERT INTO conversation_messages(user_id,body,min_echelon,echelon_version,theme,topic_id) VALUES(?1,?2,?3,4,\'general\',?4)')
    .bind(user.id,text,access.echelon,topicId).run();
  return json({ok:true,id:result.meta.last_row_id,echelon:access.echelon}, 201);
}
