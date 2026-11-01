import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const scope={window:{}};
runInNewContext(readFileSync(new URL('../public/roadmap.js',import.meta.url),'utf8'),scope);
const colors=(...args)=>Array.from(scope.roadmapColors(...args),pair=>Array.from(pair));

test('population colours include empty visible rungs and ignore hidden populations',()=>{
  const steps=[{level:1,count:1},{level:2,count:2},{level:3,count:3},{level:4,count:0},{level:8,count:1000}];
  assert.deepEqual([...colors(steps,4)],[[1,8+40/3],[2,8+80/3],[3,48],[4,8]]);
  assert.deepEqual([...colors([{level:1,count:2},{level:2,count:1}],2)],[[1,48],[2,8]]);
  assert.deepEqual([...colors(steps,2)],[[1,8],[2,48]]);
  assert.deepEqual([...colors([{level:1,count:0},{level:2,count:1},{level:3,count:2},{level:4,count:1000}],3)],[[1,8],[2,28],[3,48]]);
  assert.deepEqual([...colors([{level:2,count:1},{level:3,count:2}],3)],[[1,8],[2,28],[3,48]]);
});

test('all empty rungs are red and a lone or tied positive population is orange',()=>{
  assert.deepEqual([...colors([],0)],[]);
  assert.deepEqual([...colors([],1)],[[1,8]]);
  assert.deepEqual([...colors([{level:1,count:0}],1)],[[1,8]]);
  assert.deepEqual([...colors([{level:1,count:0},{level:2,count:0}],2)],[[1,8],[2,8]]);
  assert.deepEqual([...colors([{level:1,count:1}],1)],[[1,28]]);
  assert.deepEqual([...colors([{level:1,count:2},{level:2,count:2}],2)],[[1,28],[2,28]]);
});

test('invalid counts become empty rungs and invalid levels cannot affect the scale',()=>{
  const steps=[{level:1,count:-1},{level:2,count:NaN},{level:3,count:Infinity},{level:4,count:'1000'},{level:5,count:1.5},{level:6,count:Number.MAX_SAFE_INTEGER+1},{level:7,count:1},{level:8,count:2},{level:0,count:1000},{level:1.5,count:1000},{level:9,count:1000}];
  assert.deepEqual([...colors(steps,8)],[[1,8],[2,8],[3,8],[4,8],[5,8],[6,8],[7,28],[8,48]]);
  for(const level of [-1,1.5,NaN,Infinity,'2'])assert.deepEqual([...colors(steps,level)],[]);
});

test('the midpoint is exactly orange and 29 stays proportionally close to a maximum of 30',()=>{
  const scale=new Map(colors([{level:1,count:2},{level:2,count:16},{level:3,count:29},{level:4,count:30}],4));
  assert.equal(scale.get(1),8);
  assert.equal(scale.get(2),28);
  assert.equal(scale.get(4),48);
  assert.ok(Math.abs(scale.get(3)-(8+40*27/28))<1e-10);
  assert.ok(scale.get(4)-scale.get(3)<1.5);
  const expanded=new Map(colors([{level:1,count:2},{level:2,count:46},{level:3,count:29},{level:4,count:90}],4));
  assert.equal(expanded.get(1),8);
  assert.equal(expanded.get(2),28);
  assert.equal(expanded.get(4),48);
  assert.ok(expanded.get(3)<scale.get(3));
  assert.ok(Math.abs(expanded.get(3)-(8+40*27/88))<1e-10);
});
