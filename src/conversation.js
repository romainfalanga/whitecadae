import {MAX_GAME_LEVEL, gameLevel, accessLevel} from './echelon.js';
import {gameRows} from './echelon-api.js';
import {contentAccess,CONVERSATION_LEVEL} from './content-access.js';

export const THEMES = [
  {id:'general',label:'Général',description:'Faire connaissance, partager une expérience, prendre du recul.',prompt:'Qu’as-tu envie de partager ?'},
  {id:'indices',label:'Indice',description:'Une piste pour les autres joueurs.',prompt:'Partager un indice…'},
];

export function conversationAccess(user, rows = []) {
  const echelon = gameLevel(rows);
  const legacy = accessLevel(rows);
  return {
    echelon,
    // The author can address every currently authored rung, without a fixed cap.
    ceiling: user?.is_admin ? MAX_GAME_LEVEL : echelon,
    legacy,
    readable: contentAccess(user,rows).conversation,
  };
}

const ready=new WeakMap();
async function ensureConversation(env) {
  if(ready.has(env.DB))return ready.get(env.DB);
  const pending=(async()=>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL, min_echelon INTEGER NOT NULL DEFAULT 2,
    echelon_version INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'general',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  const hasColumn = async name => (await env.DB.prepare('PRAGMA table_info(conversation_messages)').all()).results.some(c => c.name === name);
  for(const [name,definition] of [['echelon_version','INTEGER NOT NULL DEFAULT 1'],['theme',"TEXT NOT NULL DEFAULT 'general'"]]){
    if (!await hasColumn(name)) {
      try { await env.DB.prepare(`ALTER TABLE conversation_messages ADD COLUMN ${name} ${definition}`).run(); }
      catch (error) { if (!await hasColumn(name)) throw error; }
    }
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conversation_theme_id ON conversation_messages(theme,id)').run();
  await env.DB.prepare("UPDATE conversation_messages SET theme='general' WHERE theme IN ('interpretations','idees')").run();
  })();
  ready.set(env.DB,pending);
  try{await pending;}catch(error){ready.delete(env.DB);throw error;}
}

export async function handleConversation(request, env, {getUser, json}) {
  const user = await getUser(request, env);
  if (!user) return json({error:'Connexion requise.'}, 401);
  const access = conversationAccess(user, await gameRows(env, user.id));
  if (!access.readable) return json({error:'Ce n’est pas encore ouvert.', locked:'conversation'}, 403);
  await ensureConversation(env);
  if (request.method === 'GET') {
    const params=new URL(request.url).searchParams;
    const theme=params.get('theme')||'tout', mode=params.get('mode')||'tout';
    if(theme!=='tout'&&!THEMES.some(t=>t.id===theme))return json({error:'Thème inconnu.'},400);
    if(!['tout','exact','min','max','historique'].includes(mode))return json({error:'Filtre inconnu.'},400);
    const level=Number(params.get('niveau')||CONVERSATION_LEVEL),before=Number(params.get('before')||0),after=Number(params.get('after')||0);
    if(!Number.isSafeInteger(after)||after<0||(before&&after))return json({error:'Pagination invalide.'},400);
    if(!Number.isInteger(before)||before<0||!Number.isSafeInteger(before))return json({error:'Pagination invalide.'},400);
    if(!Number.isSafeInteger(level)||level<CONVERSATION_LEVEL)return json({error:'Échelon invalide.'},400);
    if(!['tout','historique'].includes(mode)&&level>access.ceiling)return json({error:'Cet échelon n’est pas encore atteint.'},403);
    // Historical thresholds retain their original audience. They must never be
    // reinterpreted as the much faster new score, which would expose messages.
    const {results} = await env.DB.prepare(`SELECT m.id, m.body, (m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END) AS min_echelon, m.echelon_version, m.theme, m.created_at, u.username
      FROM conversation_messages m JOIN users u ON u.id = m.user_id
      WHERE (?1 = 1 OR (m.echelon_version >= 2 AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END <= ?2)
        OR (m.echelon_version = 1 AND m.min_echelon <= ?3))
        AND (?4='tout' OR m.theme=?4)
        AND (?5='tout' OR (?5='historique' AND m.echelon_version=1)
          OR (m.echelon_version>=2 AND ((?5='exact' AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END=?6)
            OR (?5='min' AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END>=?6) OR (?5='max' AND m.min_echelon+CASE WHEN m.echelon_version=2 THEN 1 ELSE 0 END<=?6))))
        AND (?7=0 OR m.id<?7)
        AND (?8=0 OR m.id>?8)
      ORDER BY m.id ${after?'ASC':'DESC'} LIMIT 101`).bind(user.is_admin ? 1 : 0, access.echelon, access.legacy,theme,mode,level,before,after).all();
    const selected=(results||[]).slice(0,100);
    if(!after)selected.reverse();
    return json({messages:selected,echelon:access.ceiling,themes:THEMES,nextBefore:!after&&results?.length>100?selected[0].id:null,nextAfter:after&&results?.length>100?selected.at(-1).id:null});
  }
  if(request.method!=='POST')return json({error:'Méthode indisponible.'},405);
  let body;
  try { body = await request.json(); } catch { return json({error:'Requête invalide.'}, 400); }
  const texte = String(body?.body || '').trim();
  if (!texte) return json({error:'Message vide.'}, 400);
  if (texte.length > 2000) return json({error:'Message trop long (2000 caractères).'}, 400);
  const minimum = body?.min_echelon ?? CONVERSATION_LEVEL;
  const theme=body?.theme??'general';
  if(!THEMES.some(t=>t.id===theme))return json({error:'Thème inconnu.'},400);
  if (!Number.isInteger(minimum) || minimum < CONVERSATION_LEVEL) return json({error:'Échelon invalide.'}, 400);
  if (minimum > access.ceiling) return json({error:'Cet échelon n’est pas encore atteint.'}, 403);
  const result = await env.DB.prepare('INSERT INTO conversation_messages (user_id, body, min_echelon, echelon_version, theme) VALUES (?1, ?2, ?3, 3, ?4)')
    .bind(user.id, texte, minimum,theme).run();
  return json({ok:true, id:result.meta.last_row_id}, 201);
}
