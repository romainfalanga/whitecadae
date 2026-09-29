// Offline preparation only. This file never connects to production.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const preserved=new Set(['albums','songs','lyric_lines','site_content_migrations','d1_migrations','sqlite_sequence','_cf_KV']);
const additionalUserTables=new Set(['auth_attempts','carres','echelon_draft_history']);
const quote=name=>'"'+name.replaceAll('"','""')+'"';
export function accountResetPlan(db){
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_auto%'").all().map(r=>r.name);
  const foreignKeys=new Map(tables.filter(t=>!preserved.has(t)).map(t=>[t,db.prepare('PRAGMA foreign_key_list('+quote(t)+')').all().map(r=>r.table)]));
  const remove=new Set(['users',...tables.filter(t=>additionalUserTables.has(t))]);
  let changed=true;
  while(changed){changed=false;for(const [table,parents] of foreignKeys)if(!remove.has(table)&&parents.some(p=>remove.has(p))){remove.add(table);changed=true;}}
  const unknown=tables.filter(t=>!preserved.has(t)&&!remove.has(t));
  if(unknown.length)throw Error('Review unclassified tables before reset: '+unknown.join(', '));
  // Children first; self-references are handled by deleting all rows together.
  const ordered=[],remaining=new Set(remove);
  while(remaining.size){const leaves=[...remaining].filter(t=>![...remaining].some(other=>other!==t&&foreignKeys.get(other)?.includes(t)));
    if(!leaves.length)throw Error('Review cyclic foreign keys before reset.');
    for(const table of leaves){ordered.push(table);remaining.delete(table);}
  }
  const counts=Object.fromEntries(ordered.map(t=>[t,db.prepare('SELECT count(*) AS n FROM '+quote(t)).get().n]));
  const userSequence=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='users'").get()?.seq||0;
  const fingerprint=()=>createHash('sha256').update(JSON.stringify(['albums','songs','lyric_lines'].map(t=>db.prepare('SELECT * FROM '+quote(t)+' ORDER BY id').all()))).digest('hex');
  const catalogueHash=fingerprint();
  // The operator must run a fresh backup immediately before the reset.
  const maxUser=db.prepare('SELECT COALESCE(max(id),0) AS n FROM users').get().n;
  const sql='-- Prepared from a verified backup; do not reset sqlite_sequence.\nPRAGMA defer_foreign_keys=ON;\n'+ordered.map(t=>'DELETE FROM '+quote(t)+';').join('\n')+'\nPRAGMA foreign_key_check;\n';
  db.exec('PRAGMA foreign_keys=ON; BEGIN');
  try{
    db.exec(sql);
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign-key violation after reset.');
    if(fingerprint()!==catalogueHash)throw Error('Reset would alter music or lyrics.');
    if((db.prepare("SELECT seq FROM sqlite_sequence WHERE name='users'").get()?.seq||0)!==userSequence)throw Error('Reset would reuse account IDs.');
    for(const table of ordered)if(db.prepare('SELECT count(*) AS n FROM '+quote(table)).get().n)throw Error('Remaining data in '+table);
  }finally{db.exec('ROLLBACK');}
  return {sql,report:{tables:counts,accounts:counts.users,catalogueHash,userSequence,maxUser,verified:true}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [backup,output]=process.argv.slice(2);
  if(!backup||!output)throw Error('Usage: node scripts/account-reset-plan.mjs <backup.sql> <private-output-directory>');
  const bytes=readFileSync(backup),db=new DatabaseSync(':memory:');
  try{
    db.exec(bytes.toString('utf8'));
    const plan=accountResetPlan(db);mkdirSync(output,{recursive:true});
    writeFileSync(resolve(output,'account-reset.sql'),plan.sql,{flag:'wx'});
    writeFileSync(resolve(output,'account-reset-report.json'),JSON.stringify({...plan.report,backupSha256:createHash('sha256').update(bytes).digest('hex')},null,2),{flag:'wx'});
    console.log(`Verified offline: ${plan.report.accounts} accounts; ${Object.keys(plan.report.tables).length} account tables; catalogue preserved.`);
  }finally{db.close();}
}
