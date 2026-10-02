import {gameRows} from './echelon-api.js';
import {gameLevel} from './echelon.js';
import {fail,integer} from './private-data.js';
export const NOTICE_VERSION='2026-10-01';
export const PRIVATE_NOTICE={version:NOTICE_VERSION,
 purpose:'Cet espace conserve tes récits et réflexions pour te permettre de relire ton parcours. Aucun diagnostic ni analyse automatique n’est effectué.',
 storage:'Les textes sont chiffrés sur le serveur. Les dates, catégories et relations nécessaires au fonctionnement restent des métadonnées protégées. Ce service ne propose pas de chiffrement de bout en bout.',
 combinedSharing:'En activant ce partage, tes AS actuels et ceux que tu accepteras ensuite pourront lire toute ta Matière (événements, créations et liens), tes dix mécanismes et leurs futures modifications. Ils pourront répondre dans les discussions associées. Les brouillons restent privés. Tu peux arrêter le partage à tout moment, sans pouvoir effacer ce qui a déjà été lu ou copié.',
 sharing:'Ton arbre reste privé. Si tu actives son partage, tes AS actuels et ceux que tu accepteras ensuite verront tout l’arbre enregistré et ses futures mises à jour. Tes brouillons restent privés. Tu peux retirer cet accord à tout moment ; cela ne peut pas effacer ce qu’une personne a déjà lu ou copié.',
 retention:'Tu peux exporter ou supprimer tes événements et tes brouillons. Ils sont conservés jusqu’à leur suppression ou celle de ton compte. Les copies de restauration Cloudflare peuvent subsister jusqu’à 30 jours ; elles ne sont pas consultables par les autres membres.',
 care:'Écris seulement ce que tu souhaites conserver ici et limite les informations identifiantes sur des tiers. Les échanges entre membres ne remplacent pas un accompagnement professionnel.'};
export async function levelOf(env,id){return gameLevel(await gameRows(env,id));}
export async function requireLevel(env,user,minimum){if(await levelOf(env,user.id)<minimum)fail('Cette page n’est pas encore disponible dans ton parcours.',403);}
export async function storageConsent(env,id){
  const row=await env.DB.prepare("SELECT granted FROM privacy_consents WHERE user_id=?1 AND purpose='storage' AND version=?2 ORDER BY id DESC LIMIT 1").bind(id,NOTICE_VERSION).first();return !!row?.granted;
}
export async function requireStorage(env,id){if(!await storageConsent(env,id))fail('Lis et accepte les conditions de conservation avant d’enregistrer un contenu.',409);}
export async function blocked(env,a,b){return !!await env.DB.prepare('SELECT 1 FROM ace_blocks WHERE (user_id=?1 AND blocked_id=?2) OR (user_id=?2 AND blocked_id=?1)').bind(a,b).first();}
export async function circleAccess(env,user,owner,tree=false){
  integer(owner,1);
  const circle=await env.DB.prepare('SELECT * FROM ace_circles WHERE owner_id=?1').bind(owner).first();
  if(user.id===owner){
    if(tree){await requireLevel(env,user,18);return {owner,member:null,circle};}
    await requireLevel(env,user,20);if(!circle)fail('Crée ton carré pour ouvrir cette conversation.',404);
    return {owner,member:null,circle};
  }
  await requireLevel(env,user,20);
  if(!circle||tree&&!circle.share_enabled||await levelOf(env,owner)<20||await blocked(env,user.id,owner))fail('Cet espace n’est pas accessible.',403);
  const member=await env.DB.prepare('SELECT * FROM ace_memberships WHERE owner_id=?1 AND angel_id=?2').bind(owner,user.id).first();
  if(!member)fail('Cet espace n’est pas accessible.',403);
  return {owner,member,circle};
}
// Guard every write in SQL, so removal between the initial check and an await
// cannot publish a delayed message. Changes to sharing increment the revision.
export function writeGuard(access,user){
  return {sql:`EXISTS(SELECT 1 FROM ace_circles c WHERE c.owner_id=?1 AND c.access_revision=?2)
    AND (?3=?1 OR EXISTS(SELECT 1 FROM ace_memberships m WHERE m.owner_id=?1 AND m.angel_id=?3 AND m.id=?4))`,
    values:[access.owner,access.circle.access_revision,user.id,access.member?.id||'']};
}
export async function freshAccess(env,access,user){
  if(!access.circle&&access.owner===user.id)return;
  const g=writeGuard(access,user);
  if(!await env.DB.prepare('SELECT 1 WHERE '+g.sql).bind(...g.values).first())fail('Les accès ont changé. Recharge cet espace.',403);
}
export const person=row=>({id:row.id,username:row.username,avatar:row.has_avatar?`/api/ace-circles/avatar/${row.id}`:null});
