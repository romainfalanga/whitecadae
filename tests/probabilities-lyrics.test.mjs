import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../migrations/0042_probabilities_lyrics.sql',import.meta.url),'utf8');
const opening=["[Couplet]","Quand le temps c'est l'enfer,","Le paradis c'est la matière.",'Regarde la mort,','Ce que tu vois façonne ta visière.','Subis la couleur de tes yeux,','Choisis de les avoir ouverts.',"Tu n'existes pas sans tes filtres,",'Contrôle les lois de ton univers.','Oriente les trajectoires.'];
function setup(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE songs(id INTEGER PRIMARY KEY,slug TEXT UNIQUE);CREATE TABLE lyric_lines(id INTEGER PRIMARY KEY,song_id INTEGER,line_number INTEGER,text TEXT);INSERT INTO songs VALUES(1,\'les-probabilites\'),(2,\'other\');INSERT INTO lyric_lines VALUES(99,2,1,\'Another song\')');
  opening.forEach((line,i)=>db.prepare('INSERT INTO lyric_lines VALUES(?,1,?,?)').run(i+1,i+1,line));return db;
}
const query='SELECT * FROM lyric_lines ORDER BY song_id,line_number';
test('lyric correction replaces only the opening, keeps surviving line IDs and never reapplies',()=>{
  const db=setup();try{
    db.exec('BEGIN');db.exec(migration);db.exec('COMMIT');
    const rows=db.prepare('SELECT * FROM lyric_lines WHERE song_id=1 ORDER BY line_number').all();
    assert.deepEqual(rows.map(l=>l.text),['[Couplet]',"Tu n'existes pas.","Tu n'existes pas.","Sans tes filtres, tu n'existes pas.",...opening.slice(8)]);
    assert.deepEqual(rows.map(l=>l.id),[1,2,3,8,9,10]);
    assert.deepEqual(rows.map(l=>l.line_number),[1,2,3,4,5,6]);
    assert.equal(db.prepare('SELECT text FROM lyric_lines WHERE id=99').get().text,'Another song');
    const saved=db.prepare(query).all();db.exec(migration);assert.deepEqual(db.prepare(query).all(),saved);
    assert.deepEqual(readFileSync(new URL('../lyrics/les-probabilites.txt',import.meta.url),'utf8').split('\n').slice(0,6),rows.map(l=>l.text));
  }finally{db.close();}
});
test('a newer lyric edit or a missing song cannot be overwritten or marked as migrated',()=>{
  for(const missing of [false,true]){const db=setup();try{
    db.exec(missing?'DELETE FROM songs WHERE id=1':"UPDATE lyric_lines SET text='A newer edit' WHERE id=3");
    const before=db.prepare(query).all();db.exec(migration);assert.deepEqual(db.prepare(query).all(),before);
    assert.equal(db.prepare('SELECT count(*) AS n FROM site_content_migrations').get().n,0);
  }finally{db.close();}}
});
