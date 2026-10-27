import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {buildGameState} from '../src/echelon.js';
import {fixture} from './community-fixture.mjs';

test('Jesus and Messie solve each wine sign once and preserve the same historical answer IDs',async()=>{
  for(const [node,id] of [['eg-14','eg-14-2'],['n-c','n-c-2']])for(const [first,second] of [['Jésus','Messie'],['Messie','Jésus']]){
    const f=fixture();try{
      const submit=async answer=>{
        const res=await worker.fetch(new Request('https://test.local/api/signes/guess',{method:'POST',headers:{Cookie:'wc_session=qa2','Content-Type':'application/json'},body:JSON.stringify({id:node,answer})}),f.env);
        assert.equal(res.status,200);return res.json();
      };
      const result=await submit(first);assert.equal(result.gained,1);
      assert.deepEqual(result.state.nodes.find(n=>n.id===node).found.find(a=>a.id===id),{id,label:'Jésus (Messie)'});
      f.sql.exec('UPDATE echelon_attempts SET next_at=0');
      const duplicate=await submit(second);assert.equal(duplicate.gained,0);assert.equal(duplicate.state.echelon,result.state.echelon);
      assert.equal(f.sql.prepare('SELECT count(*) AS n FROM riddle_progress WHERE user_id=3 AND riddle_id=?').get(id).n,1);
      const old=buildGameState([{riddle_id:id,solved_at:'now'}]);
      assert.equal(old.nodes.find(n=>n.id===node).found.find(a=>a.id===id).label,'Jésus (Messie)');
    }finally{f.sql.close();}
  }
});
