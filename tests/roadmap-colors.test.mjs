import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const scope={window:{}};
runInNewContext(readFileSync(new URL('../public/roadmap.js',import.meta.url),'utf8'),scope);
const colors=(...args)=>Array.from(scope.roadmapColors(...args),pair=>Array.from(pair));

test('population colours span red, orange and yellow while ignoring hidden and empty rungs',()=>{
  const steps=[{level:1,count:1},{level:2,count:2},{level:3,count:3},{level:4,count:0},{level:8,count:1000}];
  assert.deepEqual([...colors(steps,4)],[[1,8],[2,28],[3,48]]);
  assert.deepEqual([...colors([{level:1,count:2},{level:2,count:1}],2)],[[1,48],[2,8]]);
  assert.deepEqual([...colors(steps,2)],[[1,8],[2,48]]);
});

test('a lone or tied population has a stable orange, with no NaN on an empty roadmap',()=>{
  assert.deepEqual([...colors([],1)],[]);
  assert.deepEqual([...colors([{level:1,count:0}],1)],[]);
  assert.deepEqual([...colors([{level:1,count:1}],1)],[[1,28]]);
  assert.deepEqual([...colors([{level:1,count:2},{level:2,count:2}],2)],[[1,28],[2,28]]);
});
