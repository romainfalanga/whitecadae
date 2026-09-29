import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialDraft,formatBlock,evaluate} from '../public/workshop-core.js';
import {restoreFlow,chooseBlock,chooseOperation,cancelSelection,transform,placeBlock} from '../public/workshop-flow.js';
import {boardSpec,validateConstruction} from '../src/echelon-workshop.js';

const start=board=>restoreFlow(initialDraft(boardSpec(board)));
const values=(flow,spec)=>flow.draft.items.map(x=>formatBlock(evaluate(x,spec.sources),spec.format));

test('guided flow chooses first block, operator, second block, then applies an immutable calculation',()=>{
  const spec=boardSpec('wanheda'),original=start('wanheda');
  assert.throws(()=>chooseOperation(original,'add'),/d’abord/);
  let flow=chooseBlock(original,0);
  assert.throws(()=>transform(flow,spec),/opération/);
  flow=chooseOperation(flow,'add');
  assert.deepEqual(flow.draft.selected,[0]);
  assert.throws(()=>chooseBlock(flow,0),/autre bloc/);
  assert.throws(()=>placeBlock(flow,spec,0),/Termine/);
  flow=chooseBlock(flow,1);
  assert.deepEqual(flow.draft.selected,[0,1]);
  const computed=transform(flow,spec);
  assert.deepEqual(values(computed,spec),['57']);
  assert.deepEqual(computed.draft.selected,[0]);assert.equal(computed.operator,null);
  assert.deepEqual(flow.draft.selected,[0,1]);assert.deepEqual(original,start('wanheda'));
  assert.ok(!validateConstruction('wanheda',computed.draft));
  const placed=placeBlock(computed,spec,0);
  assert.ok(validateConstruction('wanheda',placed.draft));
  const reclaimed=placeBlock(placed,spec,0);
  assert.deepEqual(reclaimed,computed);
});

test('each cancellation returns unconsumed blocks and does not lose a source',()=>{
  const spec=boardSpec('date');
  const flow=chooseBlock(chooseOperation(chooseBlock(start('date'),0),'add'),1);
  const right=cancelSelection(flow,'right');
  assert.deepEqual(right.draft.selected,[0]);assert.equal(right.operator,'add');
  const operation=cancelSelection(flow,'operation');
  assert.deepEqual(operation.draft.selected,[0]);assert.equal(operation.operator,null);
  const all=cancelSelection(flow);
  assert.deepEqual(all.draft.selected,[]);assert.equal(all.operator,null);
  for(const cancelled of [right,operation,all])assert.deepEqual(values(cancelled,spec),['18','20','19']);
  const restored=restoreFlow(flow.draft);
  assert.deepEqual(restored.draft.selected,[0]);assert.equal(restored.operator,null);
  assert.deepEqual(restored.draft.items,flow.draft.items);
});

test('a duplicated date can be assembled step by step and every source must reach the answer',()=>{
  const spec=boardSpec('first');
  let flow=transform(chooseBlock(start('first'),1),spec,'reuse');
  assert.deepEqual(values(flow,spec),['2','24','24']);
  assert.deepEqual(flow.draft.selected,[]);
  flow=placeBlock(chooseBlock(flow,1),spec,0);
  assert.deepEqual(values(flow,spec),['2','24']);
  flow=transform(chooseBlock(chooseOperation(chooseBlock(flow,1),'div'),0),spec);
  assert.deepEqual(values(flow,spec),['12']);
  flow=placeBlock(flow,spec,1);
  assert.ok(validateConstruction('first',flow.draft));
});

test('July stays in its answer while the three other date blocks can be combined',()=>{
  const spec=boardSpec('date');let flow=start('date');
  assert.throws(()=>placeBlock(flow,spec,1),/déjà placé/);
  flow=transform(chooseBlock(chooseOperation(chooseBlock(flow,0),'add'),1),spec);
  assert.deepEqual(values(flow,spec),['19','38']);
  flow=transform(chooseBlock(chooseOperation(flow,'add'),0),spec);
  flow=placeBlock(flow,spec,0);
  assert.ok(validateConstruction('date',flow.draft));
  assert.equal(flow.draft.answer[1].ref,'d');
});

test('invalid arithmetic leaves the flow intact, and changing operation requests a second operand',()=>{
  const spec=boardSpec('wanheda');
  const invalid=chooseBlock(chooseOperation(chooseBlock(start('wanheda'),0),'group'),1);
  const saved=structuredClone(invalid);
  assert.throws(()=>transform(invalid,spec),/groupes égaux/);
  assert.deepEqual(invalid,saved);
  const changed=chooseOperation(invalid,'add');
  assert.throws(()=>transform(changed,spec),/second bloc/);
  assert.deepEqual(values(transform(chooseBlock(changed,1),spec),spec),['57']);
});

test('single-block actions apply directly and cannot destroy the last copy of a source',()=>{
  const spec=boardSpec('first');const flow=chooseBlock(start('first'),1);
  assert.throws(()=>transform(flow,spec,'discard'),/départ/);
  const split=transform(flow,spec,'split');
  assert.deepEqual(values(split,spec),['2','2','4']);assert.deepEqual(split.draft.selected,[]);
  let copy=transform(flow,spec,'reuse');
  copy=transform(chooseBlock(copy,2),spec,'discard');
  assert.deepEqual(values(copy,spec),['2','24']);
  const sum=transform(chooseBlock(chooseOperation(chooseBlock(copy,0),'add'),1),spec);
  const detached=transform(sum,spec,'detach');assert.deepEqual(values(detached,spec),['2','24']);
});

test('114 is solved by preserving a copy of 2, dividing 114, and placing two independent blocks',()=>{
  const spec=boardSpec('album');let flow=start('album');
  assert.equal(flow.draft.answer.length,2);
  flow=transform(chooseBlock(flow,1),spec,'reuse');
  flow=placeBlock(chooseBlock(flow,2),spec,1);
  flow=transform(chooseBlock(chooseOperation(chooseBlock(flow,0),'div'),1),spec);
  assert.deepEqual(values(flow,spec),['57']);
  assert.ok(!validateConstruction('album',flow.draft));
  flow=placeBlock(flow,spec,0);
  assert.ok(validateConstruction('album',flow.draft));
  assert.ok(!validateConstruction('album',{...flow.draft,answer:flow.draft.answer.toReversed()}));
});
