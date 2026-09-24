import {NODES, gameLevel, accessLevel} from './echelon.js';
import {gameRows} from './echelon-api.js';

export function conversationAccess(user, rows = []) {
  const echelon = gameLevel(rows);
  const legacy = accessLevel(rows);
  return {
    echelon,
    // The author can address every currently authored rung, without a fixed cap.
    ceiling: user?.is_admin ? NODES.reduce((sum, n) => sum + n.answers.length, 0) : echelon,
    legacy,
    readable: !!user && (!!user.is_admin || echelon >= 2 || legacy >= 2),
  };
}

async function ensureConversation(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL, min_echelon INTEGER NOT NULL DEFAULT 2,
    echelon_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  const hasColumn = async () => (await env.DB.prepare('PRAGMA table_info(conversation_messages)').all()).results.some(c => c.name === 'echelon_version');
  if (!await hasColumn()) {
    try { await env.DB.prepare('ALTER TABLE conversation_messages ADD COLUMN echelon_version INTEGER NOT NULL DEFAULT 1').run(); }
    catch (error) { if (!await hasColumn()) throw error; }
  }
}

export async function handleConversation(request, env, {getUser, json}) {
  const user = await getUser(request, env);
  if (!user) return json({error:'Connexion requise.'}, 401);
  const access = conversationAccess(user, await gameRows(env, user.id));
  if (!access.readable) return json({error:'Ce n’est pas encore ouvert.', locked:'conversation'}, 403);
  await ensureConversation(env);
  if (request.method === 'GET') {
    // Historical thresholds retain their original audience. They must never be
    // reinterpreted as the much faster new score, which would expose messages.
    const {results} = await env.DB.prepare(`SELECT m.id, m.body, m.min_echelon, m.echelon_version, m.created_at, u.username
      FROM conversation_messages m JOIN users u ON u.id = m.user_id
      WHERE ?1 = 1 OR (m.echelon_version = 2 AND m.min_echelon <= ?2)
        OR (m.echelon_version = 1 AND m.min_echelon <= ?3)
      ORDER BY m.id DESC LIMIT 100`).bind(user.is_admin ? 1 : 0, access.echelon, access.legacy).all();
    return json({messages:(results || []).reverse(), echelon:access.ceiling});
  }
  let body;
  try { body = await request.json(); } catch { return json({error:'Requête invalide.'}, 400); }
  const texte = String(body?.body || '').trim();
  if (!texte) return json({error:'Message vide.'}, 400);
  if (texte.length > 2000) return json({error:'Message trop long (2000 caractères).'}, 400);
  const minimum = body?.min_echelon ?? 2;
  if (!Number.isInteger(minimum) || minimum < 2) return json({error:'Échelon invalide.'}, 400);
  if (minimum > access.ceiling) return json({error:'Cet échelon n’est pas encore atteint.'}, 403);
  const result = await env.DB.prepare('INSERT INTO conversation_messages (user_id, body, min_echelon, echelon_version) VALUES (?1, ?2, ?3, 2)')
    .bind(user.id, texte, minimum).run();
  return json({ok:true, id:result.meta.last_row_id}, 201);
}
