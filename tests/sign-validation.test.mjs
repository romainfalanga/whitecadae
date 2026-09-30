import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NODES,gameLevel} from '../src/echelon.js';
import {matchNode,normalize} from '../src/enigmas57.js';

// Every text answer has a human-reviewed set of positive and negative examples.
const cases=[
  ['eg-14','eg-14-1',['25 décembre','25/12','vingt-cinq décembre'],['24 décembre','25 janvier','2 5 décembre']],
  ['eg-14','eg-14-2',['Jésus','jesus'],['jes','Judas']],
  ['n-a','eg-16-1',['12 apôtres','douze apotre'],['12 anges','1 2 apôtres','13 apôtres']],
  ['n-a','eg-16-2',['signes','signe'],['signaux','singe']],
  ['n-a','eg-16-3',['anges','ange'],['archanges','angel']],
  ['n-a','eg-16-4',['expansion harmonieuse','expansions harmonieuses','expansion harmonieuses','expansions harmonieuse'],['expansion','harmonieuse','expansion bruyante']],
  ['n-h','n-h-2',['dix cornes','10 corne','Prends la bête à dix cornes','prends la bete a 10 corne'],['deux cornes','onze cornes','1 0 cornes']],
  ['n-h','n-h-3',['2 cornes','deux corne','Prends la bête à deux cornes'],['dix cornes','vingt cornes']],
  ['eg-02','eg-02-1',['Dieu','dieu'],['VALD','dieux','diable']],
  ['eg-01','eg-01-1',['signe','signes'],['sigle','aiguille']],
  ['n-w','n-w-1',['infini blanc','infinis blancs','infiniblanc'],['blanc infini','infini noir']],
  ['eg-05','eg-05-1',['expansion harmonieuse','expansions harmonieuses','Mélange-les expansion harmonieuse','Mélange les expansions harmonieuse'],['harmonieuse expansion','expansion explosive']],
  ['eg-06','eg-06-1',['mécanisme = matière','mecanismes matieres'],['matière mécanisme','mécanique matière']],
  ['eg-06','eg-06-2',['Méta-Moi = Moi','meta moi moi','metamoi moi'],['moi méta-moi','meta toi moi']],
  ['n-g','n-g-1',['666','six six six','six-cent-soixante-six'],['667','6 6 6','66']],
  ['n-c','n-c-1',['25 décembre','25.12','vingt cinq dec'],['26 décembre','25 janvier']],
  ['n-c','n-c-2',['Jésus','JESUS'],['christ','Judas']],
  ['n-b','eg-07-1',['Signes','signe'],['signal','anges']],
  ['eg-03','eg-03-1',['L’horloge',"l'horloge",'horloge'],['horloger','signe']],
  ['eg-03','eg-03-2',['le détail','détail','details','les détails','le(s) détail(s)'],['le dessin','détail autre']],
  ['n-k','n-k-1',['galaxies','galaxie'],['galax','galactique']],
  ['n-k','eg-17-1',['signes','signe'],['singes','signal']],
  ['n-e','n-e-2',['33 ans','trente-trois an'],['34 ans','3 3 ans','2031']],
  ['eg-15','eg-15-1',['Andromédien Autiste','andromédienne autiste','andromediens autistes'],['Andromédien artiste','autiste andromédien']],
  ['n-0','n-0-1',['Devincix','DEVINCIX'],['Devincis','Katikas','Katikias']],
];
for(const [nodeId,id,yes,no] of cases)test(id+': reviewed spelling variants and near misses',()=>{
  const node=NODES.find(n=>n.id===nodeId),has=input=>matchNode(node,input,new Set())?.prises.some(a=>a.id===id&&a.complet);
  for(const value of yes){assert.ok(has(value),value);assert.ok(has(' « '+value.toUpperCase()+' ! » '),value);assert.ok(has(normalize(value)),value);}
  for(const value of no)assert.ok(!has(value),value);
});
test('the audit covers all 25 text answers plus all 7 server-validated constructions',()=>{
  assert.deepEqual(cases.map(c=>c[1]).sort(),NODES.filter(n=>n.kind==='riddle').flatMap(n=>n.answers.map(a=>a.id)).sort());
  assert.equal(NODES.filter(n=>n.kind==='workshop').length,7);
  assert.equal(gameLevel(NODES.flatMap(n=>n.answers.map(a=>({riddle_id:a.id,solved_at:'now'})))),33);
});
test('unknown words, negations, scripts, foreign letters and multi-answer fishing reveal no fragment',()=>{
  for(const node of NODES.filter(n=>n.kind==='riddle')){
    const label=node.answers[0].label;
    for(const text of ['pas '+label,label+' inconnu',label+' 漢',label+' <script>alert(1)</script>',label+" ' OR 1=1 --"]){
      assert.ok(!matchNode(node,text,new Set())?.prises.length,node.id+': '+text);
    }
  }
  for(const [id,value] of [['n-a','anges signes'],['n-a','12 apôtres signes anges expansions harmonieuses'],['n-h','dix cornes deux cornes'],['n-k','galaxies signes'],['eg-03','horloge détail']]){
    assert.ok(!matchNode(NODES.find(n=>n.id===id),value,new Set())?.prises.length,value);
  }
});
test('exact fragments still combine without gaining twice or accepting surrounding guesses',()=>{
  const node=NODES.find(n=>n.id==='n-h'),parts=new Map();
  const first=matchNode(node,'dix',new Set(),parts);assert.equal(first.prises[0].complet,false);
  parts.set('n-h-2',new Set([0]));
  assert.ok(!matchNode(node,'cornes autres',new Set(),parts)?.prises.length);
  assert.equal(matchNode(node,'cornes',new Set(),parts).prises[0].complet,true);
  assert.equal(matchNode(node,'dix cornes',new Set(['n-h-2']),parts).prises.length,0);
});
