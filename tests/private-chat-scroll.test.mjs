import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatViewport} from '../public/private-chat-scroll.js';

function fixture(page) {
  const root={},calls=[],positions=new Map([['1',-80],['2',80],['3',200]]);
  const node={
    ownerDocument:{documentElement:root},scrollHeight:800,scrollTop:100,clientHeight:300,
    getBoundingClientRect:()=>({top:20,bottom:760}),
    querySelectorAll:()=>[...positions].map(([id,top])=>({dataset:{message:id},getBoundingClientRect:()=>({top,bottom:top+100})})),
    closest:()=>({querySelector:()=>({scrollIntoView:options=>calls.push(options)})}),
  };
  const browser={innerHeight:800,getComputedStyle:el=>el===root?{getPropertyValue:()=> '80px'}:{overflowY:page?'visible':'auto'},scrollBy:value=>calls.push(value)};
  return {node,browser,calls,positions};
}
test('mobile follows the document and accounts for the keyboard and music player',()=>{
 const f=fixture(true),view=chatViewport(f.node,f.browser);assert.equal(view.page,true);assert.equal(view.atEnd(),true);
 f.browser.visualViewport={height:420,offsetTop:0};assert.equal(view.atEnd(),false);
 view.toEnd();assert.deepEqual(f.calls,[{block:'end',behavior:'instant'}]);assert.equal(f.node.scrollTop,100);
});
test('desktop uses only its conversation viewport',()=>{
 const f=fixture(false),view=chatViewport(f.node,f.browser);assert.equal(view.atEnd(),false);
 f.node.scrollTop=480;assert.equal(view.atEnd(),true);view.toEnd();assert.equal(f.node.scrollTop,800);assert.deepEqual(f.calls,[]);
});
test('loading older messages preserves the visible message on either scroll surface',()=>{
 for(const page of [true,false]){
  const f=fixture(page),view=chatViewport(f.node,f.browser);view.preserve(()=>{for(const [id,top] of f.positions)f.positions.set(id,top+250);});
  if(page){assert.deepEqual(f.calls,[{top:250,behavior:'instant'}]);assert.equal(f.node.scrollTop,100);}
  else{assert.equal(f.node.scrollTop,350);assert.deepEqual(f.calls,[]);}
 }
});
test('empty or removed message anchors never force a scroll',()=>{
 for(const page of [true,false]){
  const f=fixture(page),view=chatViewport(f.node,f.browser);view.preserve(()=>f.positions.clear());view.preserve(()=>f.positions.set('4',100));assert.deepEqual(f.calls,[]);assert.equal(f.node.scrollTop,100);
 }
});
test('an append below the reader never interrupts scrolling or moves the page',()=>{
 const f=fixture(true);chatViewport(f.node,f.browser).preserve(()=>f.positions.set('4',400));assert.deepEqual(f.calls,[]);
});
