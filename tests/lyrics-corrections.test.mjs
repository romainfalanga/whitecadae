import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {META_MOI_LYRICS} from '../src/meta-moi.js';

const review=JSON.parse(readFileSync(new URL('../data/lyric-corrections-20261031.json',import.meta.url),'utf8'));
const migration=readFileSync(new URL('../migrations/0046_lyrics_review_20261031.sql',import.meta.url),'utf8');
const marker='0046-lyrics-review-20261031';
const directory=new URL('../lyrics/',import.meta.url);
const sources=new Map(readdirSync(directory).filter(name=>name.endsWith('.txt')).sort().map(name=>[
  name.slice(0,-4),readFileSync(new URL(name,directory),'utf8').split('\n')
]));
sources.set('meta-moi',META_MOI_LYRICS.split('\n'));
const key=(slug,line)=>slug+':'+line;
const corrections=new Map(review.map(change=>[key(change.slug,change.line),change]));
const lines=slug=>sources.get(slug);

function fixture({alreadyCorrected=false}={}){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO users(id,email,username,password_hash) VALUES(1,?,?,?)').run('lyric-fixture@test.local','LyricFixture','unused');
  let songId=0,lineId=5000;
  const songIds=new Map();
  for(const [slug,text]of sources){
    const id=++songId;songIds.set(slug,id);
    db.prepare('INSERT INTO songs(id,slug,title,track_number) VALUES(?,?,?,?)').run(id,slug,'Title '+slug,id);
    for(const [index,after]of text.entries()){
      const change=corrections.get(key(slug,index+1));
      db.prepare('INSERT INTO lyric_lines(id,song_id,line_number,text) VALUES(?,?,?,?)').run(lineId+=3,id,index+1,alreadyCorrected?after:change?.before??after);
    }
  }
  const target=(slug,line)=>db.prepare('SELECT * FROM lyric_lines WHERE song_id=? AND line_number=?').get(songIds.get(slug),line);
  // Point both a passage and a cross-song reference at lines that must become
  // blank, so accidental DELETE/reinsert or renumbering breaks real FK links.
  const removed=target('sans-indice-dans-les-des',17),removedEnd=target('sans-indice-dans-les-des',19);
  db.prepare('INSERT INTO annotations(id,user_id,song_id,target_type,line_id,end_line_id,content) VALUES(1,1,?,?,?,?,?)').run(removed.song_id,'passage',removed.id,removedEnd.id,'Keep this interpretation');
  db.prepare('INSERT INTO annotation_references(id,annotation_id,label,ref_song_id,ref_line_id,ref_end_line_id) VALUES(1,1,?,?,?,?)').run('Keep this reference',removed.song_id,removed.id,removedEnd.id);
  const all=()=>db.prepare('SELECT l.id,l.song_id,s.slug,l.line_number,l.text FROM lyric_lines l JOIN songs s ON s.id=l.song_id ORDER BY l.id').all();
  const references=()=>({annotations:db.prepare('SELECT * FROM annotations ORDER BY id').all(),references:db.prepare('SELECT * FROM annotation_references ORDER BY id').all()});
  const markers=()=>db.prepare('SELECT * FROM site_content_migrations WHERE id=?').all(marker);
  function apply(){db.exec('BEGIN IMMEDIATE');try{db.exec(migration);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
  return {db,target,all,references,markers,apply,songIds};
}

test('the reviewed manifest addresses 95 unique lines in twelve songs and matches every canonical source',()=>{
  assert.equal(review.length,95);assert.equal(corrections.size,95);
  assert.equal(new Set(review.map(change=>change.slug)).size,12);
  for(const change of review){
    assert.ok(Number.isInteger(change.line)&&change.line>0);
    assert.equal(typeof change.before,'string');assert.equal(typeof change.after,'string');
    assert.notEqual(change.before,change.after,key(change.slug,change.line));
    assert.equal(lines(change.slug)?.[change.line-1],change.after,key(change.slug,change.line));
  }
});

test('every lyric source starts textual lines with capitals and spells the noun Harmonie with H',()=>{
  assert.equal(sources.size,18,'all seventeen lyric files and Méta-Moi are reviewed');
  for(const [slug,text]of sources)for(const [index,line]of text.entries()){
    // Number-led lyrics keep their digits. Punctuation or a section bracket
    // before a letter does not hide a lowercase textual line opening.
    const first=line.trim().match(/^[^\p{L}\p{N}]*([\p{L}\p{N}])/u)?.[1];
    if(first&&/\p{L}/u.test(first))assert.equal(first,first.toLocaleUpperCase('fr-FR'),key(slug,index+1));
    for(const found of line.matchAll(/\bharmonie\b/giu))assert.equal(found[0],'Harmonie',key(slug,index+1));
  }
  // The capitalized noun does not rewrite the verb or the adjective family.
  assert.equal(lines('13h20')[17],'Profiter harmoniser,');
  assert.equal(lines('13h20')[39],"Je vais harmoniser l'enfer.");
  assert.equal(lines('orange')[14],'Je sais déjà quoi faire, harmoniser ma conscience.');
  assert.equal(lines('30-vins-divins')[7],'Expansion harmonieuse,');
  assert.equal(lines('30-vins-divins')[11],'Expansion harmonieuse des mélanges de dimensions.');
  assert.equal(lines('30-vins-divins')[17],'La plus harmonieuse.');
  for(const change of review){
    const family=text=>Array.from(text.matchAll(/\bharmoni[\p{L}]*\b/giu),match=>match[0].toLowerCase()).filter(word=>word!=='harmonie');
    assert.deepEqual(family(change.after),family(change.before),key(change.slug,change.line));
  }
});

test('13h20 and every 30 vins divins refrain carry the exact requested punctuation and wording',()=>{
  const thirteen=lines('13h20');
  assert.equal(thirteen[15],'Je tombe à Poudlard dans Poudlard dans Poudlard,');
  assert.equal(thirteen[16],'Et ça pour chaque instant T.');
  assert.equal(thirteen[17],'Profiter harmoniser,');
  assert.equal(thirteen[43],'Les jours sans vin,');
  assert.equal(thirteen[44],"T'enchaîneras les cigarettes.");
  assert.equal(thirteen[45],'Fumer le malin,');
  assert.equal(thirteen[46],'Pour que le mal s’arrête.');
  const wine=lines('30-vins-divins');
  assert.deepEqual(wine.filter(line=>line.startsWith('30 vins divins, tu verras les 57')),Array(4).fill('30 vins divins, tu verras les 57,'));
  assert.deepEqual(wine.filter(line=>line.startsWith('Tu peux connaître demain')),Array(4).fill('Tu peux connaître demain, juste améliore tes rêves.'));
  assert.equal(wine[8],"Il y a tellement d'équations.");
  assert.equal(wine[73],'Regarde les anges ya mieux dans Dieu.');
  assert.deepEqual(wine.filter(line=>line.startsWith('À 13 heures')),Array(2).fill("À 13 heures 20, j'ai plus peur d'être. Le mal devient le bien."));
});

test('Sans indices keeps its repetitions and concludes with exactly two successive dots, not a colon',()=>{
  const text=lines('sans-indice-dans-les-des');
  assert.equal(text[15],"L'humanité est une de ces expansions.");
  assert.deepEqual(text.slice(16,19),['','','']);
  assert.equal(text[43],'Laisse des signes cachés.');
  assert.deepEqual(text.filter(line=>line.startsWith('30 vins divins, t\'entendras les trompettes')),Array(3).fill("30 vins divins, t'entendras les trompettes."));
  assert.deepEqual(text.filter(line=>line.startsWith('Tant que tu t\'en souviens')),Array(3).fill("Tant que tu t'en souviens,"));
  assert.deepEqual(text.filter(line=>line.startsWith('Alors prends-les par la main')),Array(3).fill('Alors prends-les par la main montre-leur le chemin du réel.'));
  assert.deepEqual(text.filter(Boolean).slice(-2),['Mélange les Dieux, montre-leur le chemin..','Le chemin du réel.']);
});

test('Fais mieux adds exactly four Regarde repetitions and completes all requested refrain endings',()=>{
  const text=lines('fais-mieux'),refrains=[];
  for(let index=0;index<text.length;index++)if(text[index]==='[Refrain]')refrains.push(text.slice(index+1,text.indexOf('[Refrain]',index+1)<0?text.length:text.indexOf('[Refrain]',index+1)).filter(Boolean));
  assert.equal(refrains.length,3);
  assert.equal(refrains[0][0],'Regarde toi, et fais mieux, fais mieux.');
  assert.equal(refrains[1][0],'Regarde, regarde, regarde, regarde, regarde-toi et fais mieux, fais mieux.');
  assert.equal((refrains[1][0].match(/\bregarde,/gi)||[]).length,4);
  assert.ok(refrains.every(refrain=>refrain[1]==='Comprends ce qui fait émerger ta matière,'));
  assert.equal(refrains[1].at(-1),'Alors fais mieux, fais mieux.');
  assert.ok(refrains[2].includes('Alors fais mieux,'));
  assert.deepEqual(refrains[2].slice(-3),['Fais fais fais mieux.','Fais fais mieux.','Fais fais fais mieux.']);
});

test('migration applies the complete review without replacing IDs, line order, references, accounts or unrelated text',()=>{
  const f=fixture();try{
    const before=f.all(),refs=f.references(),users=f.db.prepare('SELECT * FROM users ORDER BY id').all(),songs=f.db.prepare('SELECT * FROM songs ORDER BY id').all();
    f.apply();
    const after=f.all();assert.equal(after.length,before.length);
    let changed=0;
    for(const [index,row]of after.entries()){
      const previous=before[index],change=corrections.get(key(row.slug,row.line_number));
      assert.deepEqual({...row,text:previous.text},{...previous},'identity/order '+row.id);
      assert.equal(row.text,change?.after??previous.text,key(row.slug,row.line_number));
      if(row.text!==previous.text)changed++;
    }
    assert.equal(changed,95);
    for(const [slug,text]of sources)assert.deepEqual(after.filter(row=>row.slug===slug).sort((a,b)=>a.line_number-b.line_number).map(row=>row.text),text,slug);
    for(const line of [17,18,19])assert.equal(f.target('sans-indice-dans-les-des',line).text,'');
    assert.deepEqual(f.references(),refs);
    assert.deepEqual(f.db.prepare('SELECT * FROM users ORDER BY id').all(),users);
    assert.deepEqual(f.db.prepare('SELECT * FROM songs ORDER BY id').all(),songs);
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(f.markers().length,1);
  }finally{f.db.close();}
});

test('migration replay never overwrites a future edit or changes its applied marker',()=>{
  const f=fixture();try{
    f.apply();
    f.db.prepare('UPDATE lyric_lines SET text=? WHERE id=?').run('A later artist-approved edit.',f.target('13h20',16).id);
    f.db.prepare('UPDATE lyric_lines SET text=? WHERE id=?').run('A later replacement for the removed numbers.',f.target('sans-indice-dans-les-des',17).id);
    const before=f.all(),markers=f.markers(),refs=f.references();
    f.apply();f.apply();
    assert.deepEqual(f.all(),before);assert.deepEqual(f.markers(),markers);assert.deepEqual(f.references(),refs);
  }finally{f.db.close();}
});

test('an unexpected edit on any target blocks every correction and leaves the migration unmarked',()=>{
  for(const change of [review[0],review[Math.floor(review.length/2)],review.at(-1)]){
    const f=fixture();try{
      f.db.prepare('UPDATE lyric_lines SET text=? WHERE id=?').run('An unexpected artist edit.',f.target(change.slug,change.line).id);
      const before=f.all(),refs=f.references();f.apply();
      assert.deepEqual(f.all(),before,key(change.slug,change.line));assert.deepEqual(f.references(),refs);assert.deepEqual(f.markers(),[]);
    }finally{f.db.close();}
  }
});

test('a missing song, missing target line or duplicated target blocks the whole review without a marker',()=>{
  for(const scenario of ['missing-song','missing-line','duplicate-old','duplicate-new']){
    const f=fixture();try{
      const change=review[0],row=f.target(change.slug,change.line);
      if(scenario==='missing-song')f.db.prepare('DELETE FROM songs WHERE id=?').run(row.song_id);
      else if(scenario==='missing-line')f.db.prepare('DELETE FROM lyric_lines WHERE id=?').run(row.id);
      else f.db.prepare('INSERT INTO lyric_lines(song_id,line_number,text) VALUES(?,?,?)').run(row.song_id,row.line_number,scenario==='duplicate-new'?change.after:change.before);
      const before=f.all();f.apply();assert.deepEqual(f.all(),before,scenario);assert.deepEqual(f.markers(),[],scenario);
    }finally{f.db.close();}
  }
});

test('an already-correct or partially corrected corpus can finish safely before its first marker',()=>{
  for(const alreadyCorrected of [false,true]){
    const f=fixture({alreadyCorrected});try{
      if(!alreadyCorrected)for(const change of review.filter((_,index)=>index%2===0))f.db.prepare('UPDATE lyric_lines SET text=? WHERE id=?').run(change.after,f.target(change.slug,change.line).id);
      f.apply();assert.equal(f.markers().length,1);
      for(const change of review)assert.equal(f.target(change.slug,change.line).text,change.after,key(change.slug,change.line));
      const before=f.all();f.apply();assert.deepEqual(f.all(),before);
    }finally{f.db.close();}
  }
});
